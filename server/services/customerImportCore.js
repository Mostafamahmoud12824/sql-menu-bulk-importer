// lib/customerImportCore.js
//
// Extracted from the original import-customers.js script.
// The SQL logic, table names, columns, and per-customer transaction
// pattern are UNCHANGED from the original script — only two things
// were adapted:
//   1) server/database are passed in dynamically (instead of hardcoded)
//   2) progress is reported via an onEvent callback (for SSE), while
//      console.log is kept too so behavior on the terminal is identical.
//
// This file is 100% isolated: it is not required by any existing
// route and does not touch parsedRows/dbConfig used by the main app.

const sql = require("mssql/msnodesqlv8");

const REQUIRED_COLUMNS = ["CustomerName", "Phone", "VAT"];

function buildConfig(server, database) {
  return {
    server,
    database,
    driver: "msnodesqlv8",
    options: {
      trustedConnection: true,
      trustServerCertificate: true,
    },
  };
}

async function connectCustomerDb(server, database) {
  return await sql.connect(buildConfig(server, database));
}

async function closeCustomerDb(pool) {
  if (pool) {
    try {
      await pool.close();
    } catch (_) {}
  }
}

// Validates the uploaded workbook has the 3 required columns.
// Extra columns are ignored (per spec).
function validateWorkbook(rows) {
  if (!rows || rows.length === 0) {
    return { ok: false, message: "الملف فارغ أو لا يحتوي على بيانات" };
  }

  const firstRow = rows[0];
  const missing = REQUIRED_COLUMNS.filter((col) => !(col in firstRow));

  if (missing.length > 0) {
    return {
      ok: false,
      message: `الأعمدة المطلوبة غير موجودة في الملف: ${missing.join(", ")}`,
    };
  }

  return { ok: true };
}

// Same logic as import-customers.js:
//  - one Transaction per customer
//  - ID = MAX(ID)+1 from TblCustomer
//  - INSERT INTO TblCustomer (...)
//  - INSERT INTO TblCustData (...)
//  - rollback on error, continue to next customer
async function runCustomerImport({ server, database, customers, onEvent }) {
  const emit = (evt) => {
    if (typeof onEvent === "function") {
      try {
        onEvent(evt);
      } catch (_) {}
    }
  };

  const total = customers.length;
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const startTime = Date.now();

  emit({ type: "log", message: `🔌 الاتصال بقاعدة البيانات (${database})...` });
  console.log(`🔌 Connecting to ${server} / ${database}`);

  let pool;
  try {
    pool = await sql.connect(buildConfig(server, database));
  } catch (err) {
    const message = `تعذر الاتصال بقاعدة البيانات: ${err.message}`;
    console.log("❌", message);
    emit({ type: "error", message });
    return { total, imported, skipped, failed };
  }

  console.log("✅ Connected to SQL Server");
  emit({ type: "log", message: "✅ تم الاتصال بنجاح — بدء الاستيراد" });
  emit({ type: "total", total });

  for (let i = 0; i < total; i++) {
    const customer = customers[i];

    const customerName = String(customer.CustomerName || "").trim();
    const phone = String(customer.Phone || "").trim();
    const vat =
      customer.VAT !== undefined && customer.VAT !== null
        ? String(customer.VAT).trim()
        : "";

    if (!customerName) {
      skipped++;
      emit({
        type: "progress",
        current: i + 1,
        total,
        imported,
        skipped,
        failed,
        remaining: total - (i + 1),
        status: "skipped",
        name: `صف ${i + 1} (بدون اسم)`,
      });
      continue;
    }

    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const idRequest = new sql.Request(transaction);
      const idResult = await idRequest.query(`
        SELECT ISNULL(MAX(ID), 0) + 1 AS NewID
        FROM TblCustomer
      `);

      const id = idResult.recordset[0].NewID;

      const customerRequest = new sql.Request(transaction);
      await customerRequest
        .input("ID", sql.Int, id)
        .input("CustomerName", sql.NVarChar(255), customerName)
        .input("Phone", sql.NVarChar(50), phone)
        .input("VAT", sql.NVarChar(255), vat)
        .query(`
          INSERT INTO TblCustomer
          (
              ID,
              CustomerName,
              StateNo,
              CustomerPhone,
              info,
              Transfer
          )
          VALUES
          (
              @ID,
              @CustomerName,
              1,
              @Phone,
              @VAT,
              1
          )
        `);

      const custDataRequest = new sql.Request(transaction);
      await custDataRequest
        .input("ID", sql.Int, id)
        .input("CustName", sql.NVarChar(255), customerName)
        .input("CustPhone", sql.NVarChar(50), phone)
        .input("CustVAT", sql.NVarChar(255), vat)
        .query(`
          INSERT INTO TblCustData
          (
              ID,
              Cust_Name,
              CustPhone,
              CustVAT,
              Transfer,
              PointOK,
              Point_Amount,
              First_Point
          )
          VALUES
          (
              @ID,
              @CustName,
              @CustPhone,
              @CustVAT,
              1,
              0,
              0,
              0
          )
        `);

      await transaction.commit();
      imported++;

      console.log(`✅ Added: ${customerName}`);
      emit({
        type: "progress",
        current: i + 1,
        total,
        imported,
        skipped,
        failed,
        remaining: total - (i + 1),
        status: "done",
        name: customerName,
      });
    } catch (err) {
      try {
        await transaction.rollback();
      } catch (_) {}

      failed++;
      console.log(`❌ ${customerName}`, err.message || err);
      emit({
        type: "progress",
        current: i + 1,
        total,
        imported,
        skipped,
        failed,
        remaining: total - (i + 1),
        status: "error",
        name: customerName,
        error: err.message || "خطأ غير معروف",
      });
    }
  }

  await closeCustomerDb(pool);

  const elapsedSec = Math.round((Date.now() - startTime) / 1000);

  console.log("🎉 Import Finished");
  emit({ type: "done", total, imported, skipped, failed, elapsedSec });

  return { total, imported, skipped, failed };
}

module.exports = {
  connectCustomerDb,
  closeCustomerDb,
  validateWorkbook,
  runCustomerImport,
  REQUIRED_COLUMNS,
};