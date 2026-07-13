// customer-import-routes.js
//
// Fully isolated Customer Import module.
// - Does NOT share any state with the main Import page (dbConfig/parsedRows)
//   or with the Google Images page (googleParsedProducts/googleDownloadState).
// - Does NOT touch any existing SQL logic outside of lib/customerImportCore.js.
// - Authentication is inherited from server.js (this router is mounted
//   AFTER app.use(requireAuth), so every route here already requires login).
//
// Mount in server.js with:
//   const customerImportRouter = require("./customer-import-routes");
//   app.use("/api/customer-import", customerImportRouter);

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

const {
  connectCustomerDb,
  closeCustomerDb,
  validateWorkbook,
  runCustomerImport,
} = require("../services/customerImportCore");


const sql = require("mssql/msnodesqlv8");


const router = express.Router();

// Dedicated uploads folder — separate from the main app's /uploads folder.
const CUSTOMER_UPLOADS_DIR = path.join(__dirname, "uploads_customers");
if (!fs.existsSync(CUSTOMER_UPLOADS_DIR)) {
  fs.mkdirSync(CUSTOMER_UPLOADS_DIR, { recursive: true });
}

const customerUpload = multer({ dest: CUSTOMER_UPLOADS_DIR });

// ── Isolated module state (separate from the rest of the app) ──────────
let customerDbConfig = null; // { server, database }
let customerParsedRows = [];
let customerImportRunning = false;
let customerResetRunning = false;


const DEFAULT_INSTANCE = "(localdb)\\RGBDB";

// ─────────────────────────────────────────────
// CONNECT — only Database Name is meant to change; Instance defaults
// to the same fixed instance used across the rest of the app, but can
// be overridden if the caller explicitly provides one.
// ─────────────────────────────────────────────
router.post("/connect", async (req, res) => {
  const { instance, database } = req.body || {};

  const dbName = String(database || "").trim();
  if (!dbName) {
    return res.json({
      success: false,
      message: "يرجى إدخال اسم قاعدة البيانات",
    });
  }

  const serverInstance = String(instance || "").trim() || DEFAULT_INSTANCE;

  let pool;
  try {
    pool = await connectCustomerDb(serverInstance, dbName);
    await closeCustomerDb(pool);

    customerDbConfig = { server: serverInstance, database: dbName };

    return res.json({ success: true, message: "Connected Successfully" });
  } catch (err) {
    const raw = (err && err.message) || "";
    let message = "تعذر الاتصال بقاعدة البيانات";

    if (/cannot open database|does not exist|login failed/i.test(raw)) {
      message = "اسم الداتا خطأ";
    } else if (raw) {
      message = raw;
    }

    return res.json({ success: false, message });
  }
});

// ─────────────────────────────────────────────
// UPLOAD — reads the customers Excel file, validates required columns
// (CustomerName, Phone, VAT), extra columns are ignored.
// ─────────────────────────────────────────────
router.post("/upload", customerUpload.single("file"), (req, res) => {
  if (!req.file) {
    return res.json({ success: false, message: "لم يتم رفع أي ملف" });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    fs.unlink(req.file.path, () => {});

    const validation = validateWorkbook(rows);
    if (!validation.ok) {
      customerParsedRows = [];
      return res.json({ success: false, message: validation.message });
    }

    customerParsedRows = rows;

    return res.json({
      success: true,
      count: rows.length,
      preview: rows.slice(0, 50),
    });
  } catch (err) {
    try {
      fs.unlink(req.file.path, () => {});
    } catch (_) {}
    return res.json({
      success: false,
      message: `تعذّر قراءة الملف: ${err.message}`,
    });
  }
});

// ─────────────────────────────────────────────
// START — SSE stream of the import progress (same pattern used by
// /api/import and /api/google/start elsewhere in this project).
// ─────────────────────────────────────────────
router.get("/start", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  if (customerImportRunning) {
    send({ type: "error", message: "يوجد استيراد قيد التنفيذ بالفعل" });
    return res.end();
  }

  if (!customerDbConfig) {
    send({ type: "error", message: "قاعدة البيانات غير متصلة" });
    return res.end();
  }

  if (!customerParsedRows.length) {
    send({ type: "error", message: "يرجى رفع ملف Excel أولاً" });
    return res.end();
  }

  customerImportRunning = true;

  try {
    await runCustomerImport({
      server: customerDbConfig.server,
      database: customerDbConfig.database,
      customers: customerParsedRows,
      onEvent: send,
    });
  } catch (err) {
    send({ type: "error", message: err.message || "فشل الاستيراد" });
  } finally {
    customerImportRunning = false;
    res.end();
  }
});

// ─────────────────────────────────────────────
// STATUS — lightweight helper for the frontend to know whether a job
// is currently running (e.g. after a page refresh).
// ─────────────────────────────────────────────
router.get("/status", (req, res) => {
  res.json({
    connected: !!customerDbConfig,
    database: customerDbConfig ? customerDbConfig.database : null,
    uploadedCount: customerParsedRows.length,
    running: customerImportRunning,
  });
});

// ─────────────────────────────────────────────
// RESET — Reset Customers
// Executes everything inside ONE SQL Transaction and streams progress.
router.post("/reset", async (req, res) => {
  // Stream-like response so frontend can show live progress
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  if (customerResetRunning || customerImportRunning) {
    send({ type: "error", message: "يوجد عملية قيد التنفيذ بالفعل" });
    return res.end();
  }

  if (!customerDbConfig) {
    send({ type: "error", message: "قاعدة البيانات غير متصلة" });
    return res.end();
  }

  customerResetRunning = true;

  let pool;
const seedPath = path.join(process.cwd(), "sql", "default_customers.sql");




  try {
    pool = await sql.connect({
      server: customerDbConfig.server,
      database: customerDbConfig.database,
      driver: "msnodesqlv8",
      options: {
        trustedConnection: true,
        trustServerCertificate: true,
      },
    });

  } catch (err) {
    customerResetRunning = false;
    send({ type: "error", message: err.message || "فشل الاتصال" });
    return res.end();
  }

  const readSeed = () => {
    try {
      return fs.readFileSync(seedPath, "utf8");
    } catch (e) {
      return null;
    }
  };

  if (!fs.existsSync(seedPath)) {
    try {
      await pool.close();
    } catch (_) {}
    customerResetRunning = false;
    send({ type: "error", message: "ملف seed غير موجود" });
    return res.end();
  }

  const seedSql = readSeed();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    send({ type: "progress", message: "Deleting TblCustData..." });
    await new sql.Request(transaction).query(`DELETE FROM TblCustData`);

    send({ type: "progress", message: "Deleting TblCustomer..." });
    await new sql.Request(transaction).query(`DELETE FROM TblCustomer`);


// DB tables do NOT use SQL Server IDENTITY. Customer Reset must not attempt
// any identity reseeding.


    // (Manual IDs are inserted by default_customers.sql as-is.)

    send({ type: "progress", message: "Resetting Customers..." });


    send({ type: "progress", message: "Executing SQL Seed..." });

    // Execute seed file inserts
    await new sql.Request(transaction).query(seedSql);

    await transaction.commit();
    send({ type: "done", message: "Completed Successfully." });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (_) {}

    send({
      type: "error",
      message: err.message || "فشل إعادة التهيئة",
    });
  } finally {
    try {
      await pool.close();
    } catch (_) {}
    customerResetRunning = false;
    res.end();
  }
});

module.exports = router;
