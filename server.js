// Entry wrapper. Main app moved to server/app.js (folder reorg), but
// we keep this file so existing run/nodemon entry continues working.

// Restore original behavior: server.js is the entrypoint.
// (Folder reorganization is in progress; this restore prevents runtime breakage.)

const express = require("express");


const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const translateModule = require("google-translate-api-x");
const { runGoogleDownload } = require("./server/services/google.js");
const customerImportRouter = require("./server/routes/customer-import-routes");




const translate =
  translateModule.translate || translateModule.default || translateModule;

const app = express();

// ─────────────────────────────────────────────
// AUTH CONFIG
// ─────────────────────────────────────────────
// AUTH_PASSWORD_HASH .
const AUTH_USERNAME = "admin";
const AUTH_PASSWORD_HASH =
  "$2b$10$TUO3zCmmeQFzwvGkuVBVku4asUaHkIewqg11wLXklXR698y1Nop4e";

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

app.use(express.json({ limit: "50mb" }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 ساعات
    },
  }),
);

// صفحة اللوجين والملفات الثابتة الخاصة بها متاحة بدون تسجيل دخول
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/login.html"));
});

// NOTE: لا نستخدم express.static(__dirname) ولا static عام؛ سيتم إتاحة assets المطلوبة فقط لاحقًا.
// (RGB_new4.png سيتم إتاحتها ضمن public-only static blocks.)

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    return res
      .status(401)
      .json({ success: false, message: "يجب تسجيل الدخول" });
  }
  return res.redirect("/login.html");
}

app.post("/api/login", express.json(), (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ success: false, message: "أدخل اسم المستخدم وكلمة المرور" });
  }

  const validUser = username === AUTH_USERNAME;
  const validPass = bcrypt.compareSync(String(password), AUTH_PASSWORD_HASH);

  if (validUser && validPass) {
    req.session.loggedIn = true;
    req.session.username = username;
    return res.json({ success: true });
  }

  return res
    .status(401)
    .json({ success: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});
// ─────────────────────────────────────────────
// STATIC FILES (public only)
// IMPORTANT: Do not expose index.html (or any protected asset) before requireAuth.
// ─────────────────────────────────────────────
app.use('/login.css', express.static(path.join(__dirname, 'public/css/login.css')));
app.use('/theme.js', express.static(path.join(__dirname, 'public/js/theme.js')));
app.use('/RGB_new4.png', express.static(path.join(__dirname, 'public/images/RGB_new4.png')));

app.use('/favicon.ico', (req, res) => {
  const fp = path.join(__dirname, 'public/images/RGB_new4.png');
  return res.sendFile(fp);
});


// Public login page (explicit, not via static middleware)
// (already defined at the top of the file)

// Authenticated HTML entry points
app.get("/", (req, res, next) => {
  if (req.session && req.session.loggedIn) {
    return res.sendFile(path.join(__dirname, "public/html/index.html"));
  }
  return res.redirect("/login.html");
});

app.get("/index.html", (req, res) => {
  if (req.session && req.session.loggedIn) {
    return res.sendFile(path.join(__dirname, "public/html/index.html"));
  }
  return res.redirect("/login.html");
});


// Protect everything else
app.use(requireAuth);

// صفحة جديدة ومستقلة تمامًا: تحميل صور جوجل
// (محمية تلقائيًا بواسطة requireAuth أعلاه — لا حاجة لأي منطق إضافي)
app.get("/google-images.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/google-images.html"));
});

// صفحة جديدة ومستقلة تمامًا: استيراد العملاء
// (محمية تلقائيًا بواسطة requireAuth أعلاه — لا حاجة لأي منطق إضافي)
app.get("/customer-import.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/customer-import.html"));
});

app.use("/api/customer-import", customerImportRouter);

// ─────────────────────────────────────────────
// صفحة جديدة ومستقلة تمامًا: تفعيل الميزات (Feature Activation)
// (محمية تلقائيًا بواسطة requireAuth أعلاه — لا حاجة لأي منطق إضافي)
// الموديول معزول بالكامل في ملفات منفصلة (HTML/CSS/JS + router + service +
// data layer)، ونمرّر له فقط مراجع لدوال الاتصال الموجودة بالفعل
// (createPool / getSql) ودالة لقراءة dbConfig الحالي — من غير ما نلمس
// منطق الاتصال الأصلي أو أي state آخر.
// ─────────────────────────────────────────────
const createFeatureActivationRouter = require("./server/routes/feature-activation-routes");

app.get("/feature-activation.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/feature-activation.html"));
});

app.use(
  "/feature-activation.css",
  express.static(path.join(__dirname, "public/css/feature-activation.css")),
);
app.use(
  "/feature-activation.js",
  express.static(path.join(__dirname, "public/js/feature-activation.js")),
);
app.use(
  "/feature-activation-dashboard.css",
  express.static(path.join(__dirname, "public/css/feature-activation-dashboard.css")),
);

app.use(

  "/api/feature-activation",
  createFeatureActivationRouter({
    getDbConfig: () => dbConfig,
    createPool,
    getSql,
  }),
);

const upload = multer({
  dest: path.join(__dirname, "uploads"),
});

let dbConfig = null;
let parsedRows = [];
let parsedHeaders = [];

// ─────────────────────────────────────────────
// GOOGLE IMAGES PAGE — حالة مستقلة تمامًا عن حالة الـ Import
// (لا تتشارك مع dbConfig/parsedRows/parsedHeaders أعلاه)
// ─────────────────────────────────────────────
let googleParsedProducts = [];
let googleImagesRunning = false;

// ─────────────────────────────────────────────
// GOOGLE IMAGES — server-owned state for SSE reconnect
// Keeps download progress/logs even when browser disconnects.
// ─────────────────────────────────────────────
let googleDownloadState = {
  running: false,
  done: false,
  total: 0,
  downloaded: 0,
  failed: 0,
  remaining: 0,
  progressCurrent: 0,
  progressTotal: 0,
  currentProduct: "",
  lastStatus: "",
  logs: [],
};

// Keep limited logs to bound memory usage.
const GOOGLE_LOG_LIMIT = 200;

// Active SSE clients (for optional fan-out). We also keep the original
// "send" behavior (writing into the current response) for backward compatibility.
let googleSseClients = [];
const googleSseClientIdToIndex = new Map();
let googleSseClientSeq = 1;

function addGoogleSseClient(res) {
  // Keep clients minimal: just the response stream.
  const id = googleSseClientSeq++;
  googleSseClientIdToIndex.set(id, googleSseClients.length);
  googleSseClients.push({ id, res });
  return id;
}

function removeGoogleSseClient(id) {
  const idx = googleSseClientIdToIndex.get(id);
  if (idx === undefined) return;
  delete googleSseClientIdToIndex.delete(id);
  // null out instead of splicing to avoid O(n) shifts and keep ids mapping minimal
  googleSseClients[idx] = null;
}

// ─────────────────────────────────────────────
// TRANSLATION CACHE
// ─────────────────────────────────────────────

const translationCache = {};

// ─────────────────────────────────────────────
// SQL HELPERS
// ─────────────────────────────────────────────

function isLocalDb(server) {
  return server.toLowerCase().includes("localdb");
}

async function createPool(cfg) {
  if (cfg.type === "localdb") {
    const sql = require("mssql/msnodesqlv8");

    return await new sql.ConnectionPool({
      connectionString: cfg.connectionString,
      options: {
        trustedConnection: true,
      },
      pool: {
        max: 20,
        min: 5,
        idleTimeoutMillis: 30000,
      },
    }).connect();
  }

  const sql = require("mssql");

  return await new sql.ConnectionPool({
    ...cfg.config,
    pool: {
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
    },
  }).connect();
}

function getSql(cfg) {
  return cfg.type === "localdb"
    ? require("mssql/msnodesqlv8")
    : require("mssql");
}

function normalizeErrorMessage(err) {
  if (!err) return "خطأ غير معروف";
  if (typeof err === "string") return err;
  if (err.message) {
    if (typeof err.message === "string") return err.message;
    if (typeof err.message === "object") {
      try {
        return JSON.stringify(err.message);
      } catch (_) {
        return String(err.message);
      }
    }
    return String(err.message);
  }
  if (err.sqlMessage) return String(err.sqlMessage);
  if (err.originalError && err.originalError.message)
    return String(err.originalError.message);
  try {
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
}

function toDbNullString(value) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function sanitizeEnglishText(text) {
  if (text === null || text === undefined) return "";
  const s = String(text);

  // Replace common separator-like symbols with space so words don't merge.
  // Then remove any remaining disallowed punctuation/symbols.
  const replaced = s
    .replace(/[!@#$%\^&*()_+=\{}[\]|\\:;"'<>\,\.\?\/~`\u060C\u061B\u061F…™®©]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Final filter: keep only letters, numbers, spaces, hyphen.
  // (No further trimming needed; we already collapsed spaces.)
  return replaced.replace(/[^A-Za-z0-9 \-]/g, "");
}


function toDbNullNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const num = parseFloat(text);
  return Number.isNaN(num) ? null : num;
}

function formatConnectError(err, database) {
  const message = normalizeErrorMessage(err).trim();
  const lower = message.toLowerCase();

  if (
    /(cannot open database|database.*does not exist|could not open database|login failed for user|login failed|unable to open database|invalid credentials|password.*failed|authentication failed)/.test(
      lower,
    )
  ) {
    return "اسم الداتا خطأ";
  }

  return message || "خطأ في الاتصال بقاعدة البيانات";
}

// ─────────────────────────────────────────────
// FAST TRANSLATION
// ─────────────────────────────────────────────

function transliterateArabic(text) {
  const map = {
    ا: "a",
    أ: "a",
    إ: "e",
    آ: "aa",
    ب: "b",
    ت: "t",
    ث: "th",
    ج: "j",
    ح: "h",
    خ: "kh",
    د: "d",
    ذ: "dh",
    ر: "r",
    ز: "z",
    س: "s",
    ش: "sh",
    ص: "s",
    ض: "d",
    ط: "t",
    ظ: "z",
    ع: "a",
    غ: "gh",
    ف: "f",
    ق: "q",
    ك: "k",
    ل: "l",
    م: "m",
    ن: "n",
    ه: "h",
    و: "w",
    ي: "y",
    ى: "a",
    ة: "a",
    ء: "a",
  };

  return String(text)
    .split("")
    .map((ch) => map[ch] || ch)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

async function autoTranslate(arText, enText) {
  // already translated (from Excel)
  if (enText && enText.trim() !== "") {
    return sanitizeEnglishText(enText);
  }


  // empty arabic
  if (!arText || arText.trim() === "") {
    return "";
  }

  arText = arText.trim();

  // cache hit
  if (translationCache[arText]) {
    return translationCache[arText];
  }

  try {
    const result = await translate(arText, {
      from: "ar",
      to: "en",
    });

    const translated = sanitizeEnglishText(result.text.trim());

    translationCache[arText] = translated;

    return translated;

  } catch (err) {
    const transliterated = transliterateArabic(arText).replace(/'/g, "''");
    const sanitizedFallback = sanitizeEnglishText(transliterated);

    console.log(
      "Translation Error:",
      err.message || err,
      "→ fallback:",
      sanitizedFallback,
    );

    translationCache[arText] = sanitizedFallback;

    return sanitizedFallback;

  }
}

// ─────────────────────────────────────────────
// CONNECT
// ─────────────────────────────────────────────

app.post("/api/connect", async (req, res) => {
  const { server, database, username, password } = req.body;

  let newConfig;

  if (isLocalDb(server)) {
    const authPart = username
      ? `UID=${username};PWD=${password};`
      : `Trusted_Connection=Yes;`;

    newConfig = {
      type: "localdb",
      connectionString:
        `Driver={SQL Server Native Client 11.0};` +
        `Server=${server};` +
        `Database=${database};` +
        authPart +
        `TrustServerCertificate=yes;`,
    };
  } else {
    newConfig = {
      type: "standard",
      config: {
        server,
        database,
        user: username || undefined,
        password: password || undefined,
        options: {
          trustServerCertificate: true,
          encrypt: false,
          enableArithAbort: true,
        },
      },
    };
  }

  try {
    const pool = await createPool(newConfig);

    await pool.close();

    dbConfig = newConfig;

    res.json({
      success: true,
      message: "Connected Successfully",
    });
  } catch (err) {
    res.json({
      success: false,
      message: formatConnectError(err, database),
    });
  }
});

// ─────────────────────────────────────────────
// UPLOAD
// ─────────────────────────────────────────────

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.json({
      success: false,
      message: "No file uploaded",
    });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
    });

    fs.unlinkSync(req.file.path);

    parsedHeaders = data[0] || [];

    parsedRows = data.slice(1).filter((r) => String(r[0] ?? "").trim() !== "");

    res.json({
      success: true,
      headers: parsedHeaders,
      rows: parsedRows,
      count: parsedRows.length,
    });
  } catch (err) {
    res.json({
      success: false,
      message: err.message,
    });
  }
});

// ─────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────

app.get("/api/import", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  if (!dbConfig) {
    send({
      type: "error",
      message: "Database not connected",
    });

    return res.end();
  }

  let pool;

  try {
    const sql = getSql(dbConfig);

    pool = await createPool(dbConfig);

    const total = parsedRows.length;

    send({
      type: "log",
      message: `Starting fast import (${total} rows)`,
    });

    // ─────────────────────────────
    // PRE-TRANSLATE UNIQUE VALUES
    // ─────────────────────────────

    const uniqueTexts = new Set();

    for (const row of parsedRows) {
      if (row[1]) uniqueTexts.add(String(row[1]).trim());
      if (row[5]) uniqueTexts.add(String(row[5]).trim());
      if (row[7]) uniqueTexts.add(String(row[7]).trim());
    }

    const uniqueArray = [...uniqueTexts];

    send({
      type: "log",
      message: `Translating ${uniqueArray.length} unique texts...`,
    });

    await Promise.all(
      uniqueArray.map(async (txt) => {
        await autoTranslate(txt, "");
      }),
    );

    // ─────────────────────────────
    // PASS 1: UPDATE GROUPS FIRST (dedup — مرة واحدة لكل mmid وsmid)
    // منفصل تماماً عن الأصناف عشان الصفوف الفارغة ما توقفوش
    // ─────────────────────────────

    const updatedMmids = new Set();
    const updatedSmids = new Set();

    for (const row of parsedRows) {
      const mmid = parseInt(row[0]);
      const smid = parseInt(row[3]);

      if (isNaN(mmid) || isNaN(smid)) continue;

      // جيب أول صف فيه اسم للمجموعة الرئيسية
      if (!updatedMmids.has(mmid)) {
        const mainAR = String(row[1] ?? "").trim();
        let mainEN = String(row[2] ?? "").trim();
        mainEN = mainEN || translationCache[mainAR] || mainAR;
        if (mainAR || mainEN) {
          try {
            await pool
              .request()
              .input("id", sql.Int, mmid)
              .input("ar", sql.NVarChar(sql.MAX), mainAR)
              .input("en", sql.NVarChar(sql.MAX), mainEN).query(`
                UPDATE select_menu
                SET mmname    = @ar,
                    mmname_en = @en
                WHERE mmid = @id
              `);
            updatedMmids.add(mmid);
          } catch (_) {}
        }
      }

      // جيب أول صف فيه اسم للمجموعة الفرعية
      if (!updatedSmids.has(smid)) {
        const subAR = String(row[5] ?? "").trim();
        let subEN = String(row[6] ?? "").trim();
        subEN = subEN || translationCache[subAR] || subAR;
        if (subAR || subEN) {
          try {
            await pool
              .request()
              .input("id", sql.Int, smid)
              .input("ar", sql.NVarChar(sql.MAX), subAR)
              .input("en", sql.NVarChar(sql.MAX), subEN).query(`
                UPDATE select_sub_men
                SET smname    = @ar,
                    smname_en = @en
                WHERE smid = @id
              `);
            updatedSmids.add(smid);
          } catch (_) {}
        }
      }
    }

    send({
      type: "log",
      message: `✅ تم تحديث ${updatedMmids.size} مجموعة رئيسية و ${updatedSmids.size} مجموعة فرعية`,
    });

    // ─────────────────────────────
    // PASS 2: UPDATE ITEMS ONLY
    // ─────────────────────────────

    for (let i = 0; i < total; i++) {
      const row = parsedRows[i];

      const mmid = parseInt(row[0]);
      const smid = parseInt(row[3]);
      const itemOrder = parseInt(row[4]);

      const productAR = String(row[7] ?? "").trim();
      let productEN = String(row[8] ?? "").trim();
      const price = toDbNullNumber(row[9]);

      productEN = productEN || translationCache[productAR] || productAR;

      const dbProductAR = toDbNullString(productAR);
      const dbProductEN = toDbNullString(sanitizeEnglishText(productEN));


      // update excel memory
      const mainENRaw =
        String(row[2] ?? "").trim() ||
        translationCache[String(row[1] ?? "").trim()] ||
        String(row[1] ?? "").trim();
      const subENRaw =
        String(row[6] ?? "").trim() ||
        translationCache[String(row[5] ?? "").trim()] ||
        String(row[5] ?? "").trim();

      const mainEN = sanitizeEnglishText(mainENRaw);
      const subEN = sanitizeEnglishText(subENRaw);
      const productENSanitized = sanitizeEnglishText(productEN);

      row[2] = mainEN;
      row[6] = subEN;
      row[8] = productENSanitized;


      // تخطى الصفوف اللي مفيهاش صنف
      if (isNaN(mmid) || isNaN(smid) || isNaN(itemOrder)) continue;
      if (!productAR && !productEN) continue;

      // get item
      const itemResult = await pool
        .request()
        .input("smid", sql.Int, smid)
        .input("imid", sql.Int, itemOrder).query(`
          SELECT TOP 1 itid
          FROM select_sub_men_items
          WHERE smid = @smid
          AND imid = @imid
        `);

      if (itemResult.recordset.length === 0) continue;

      const itid = itemResult.recordset[0].itid;

      // PRODUCT

      try {
        await pool
          .request()
          .input("itid", sql.Int, itid)
          .input("name", sql.NVarChar(sql.MAX), dbProductAR)
          .input("style", sql.NVarChar(sql.MAX), dbProductEN)
          .input("price", sql.Decimal(18, 2), price).query(`
            UPDATE TblProductItem
            SET
              ItemName = @name,
              Style_Code = @style,
              SalesPrice = @price,
              Up_Date = 1
            WHERE ID = @itid
          `);
      } catch (updateErr) {
        send({
          type: "log",
          message: `⚠️ تحذير: فشل تحديث المنتج itid:${itid} — ${updateErr.message}`,
        });
      }

      // MENU ITEM

      await pool
        .request()
        .input("smid", sql.Int, smid)
        .input("imid", sql.Int, itemOrder)
        .input("ar", sql.NVarChar(sql.MAX), productAR)
        .input("en", sql.NVarChar(sql.MAX), productEN).query(`
          UPDATE select_sub_men_items
          SET
            itname = @ar,
            itname_en = @en,
            Up_Date = 1
          WHERE smid = @smid
          AND imid = @imid
        `);

      // PRICE

      await pool
        .request()
        .input("itid", sql.Int, itid)
        .input("price", sql.Decimal(18, 2), price).query(`
          UPDATE prices_items
          SET
            itprice = @price,
            Up_Date = 1
          WHERE itid = @itid
        `);

      // progress every 50 rows (1-based)

      if (i % 50 === 0) {
        send({
          type: "progress",
          current: i + 1,
          total,
        });
      }
    }

    // تأكد البار يوصل 100% قبل done
    send({ type: "progress", current: total, total });

    // ─────────────────────────────
    // FIX EMPTY STRINGS TO NULL AFTER IMPORT
    // ─────────────────────────────
    await pool.request().query(`
      UPDATE TblProductItem
      SET
        ItemName = NULLIF(LTRIM(RTRIM(ItemName)), ''),
        catname = NULLIF(LTRIM(RTRIM(catname)), ''),
        oldname = NULLIF(LTRIM(RTRIM(oldname)), ''),
        Style_Code = NULLIF(LTRIM(RTRIM(Style_Code)), ''),
        New_Style_Code = NULLIF(LTRIM(RTRIM(New_Style_Code)), ''),
        Color_Code = NULLIF(LTRIM(RTRIM(Color_Code)), ''),
        Size_Code = NULLIF(LTRIM(RTRIM(Size_Code)), '')
      WHERE
        ItemName = ''
        OR catname = ''
        OR oldname = ''
        OR Style_Code = ''
        OR New_Style_Code = ''
        OR Color_Code = ''
        OR Size_Code = '';
    `);

    // ─────────────────────────────

    const newData = [parsedHeaders, ...parsedRows];

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.aoa_to_sheet(newData);

    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    XLSX.writeFile(wb, path.join(__dirname, "translated_output.xlsx"));

    send({
      type: "done",
      total,
      translated: Object.keys(translationCache).length,
    });
  } catch (err) {
    send({
      type: "error",
      message: err.message,
    });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (_) {}
    }

    res.end();
  }
});
// ─────────────────────────────────────────────
// DOWNLOAD & RESIZE IMAGES
// ─────────────────────────────────────────────

app.get("/api/download-images", async (req, res) => {
  const retry = String(req.query.retry || "0") === "1";
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  // من أين نبدأ (للاستكمال بعد الإيقاف)
  const fromIndex = parseInt(req.query.from) || 0;

  if (!dbConfig) {
    send({ type: "error", message: "قاعدة البيانات غير متصلة" });
    return res.end();
  }

  if (parsedRows.length === 0) {
    send({ type: "error", message: "لم يتم تحميل ملف إكسيل بعد" });
    return res.end();
  }

  let pool;

  try {
    const sql = getSql(dbConfig);
    pool = await createPool(dbConfig);

    // ─────────────────────────────
    // جيب الـ itid الحقيقي من DB لكل صنف
    // ─────────────────────────────

    const products = [];
    const seen = new Set();

    const OUTPUT_FOLDER = path.join(__dirname, "optimized");

    // لو retry=1: نخلي السيرفر يختار فقط الصور الناقصة/الفاشلة
    // - error/timeout/missing (مخزنينها عمليًا كـ: ملف ناقص/صغير أو Placeholder)
    // - لو الصورة موجودة وبحجمها طبيعي: skip تلقائي

    for (const row of parsedRows) {
      const smid = parseInt(row[3]);
      const itemOrder = parseInt(row[4]);
      const nameAR = String(row[7] ?? "").trim();
      const nameEN = String(row[8] ?? "").trim();

      if (isNaN(smid) || isNaN(itemOrder)) continue;

      const key = `${smid}_${itemOrder}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!nameAR && !nameEN) continue;

      try {
        const result = await pool
          .request()
          .input("smid", sql.Int, smid)
          .input("imid", sql.Int, itemOrder).query(`
            SELECT TOP 1 itid
            FROM select_sub_men_items
            WHERE smid = @smid AND imid = @imid
          `);

        if (result.recordset.length > 0) {
          const itid = result.recordset[0].itid;

          if (retry) {
            const imagePath = path.join(OUTPUT_FOLDER, `${itid}.jpg`);

            // لو الصورة موجودة وبحجمها طبيعي => skip
            if (
              fs.existsSync(imagePath) &&
              (() => {
                try {
                  return fs.statSync(imagePath).size > 500;
                } catch (_) {
                  return false;
                }
              })()
            ) {
              continue;
            }

            // موجودة لكن صغيرة/ناقصة أو مش موجودة => ندخل في batch للـ retry
          }

          products.push({
            itid,
            nameAR,
            nameEN,
          });
        }
      } catch (_) {}
    }

    await pool.close();
    pool = null;

    const total = products.length;
    const sliced = products.slice(fromIndex);

    // لو retry=1: نخلي startDownload يشتغل على batch اللي ناقص/فاشل فقط.
    // startDownload نفسه سيحسب skip لحالات الملف الموجود بحجم طبيعي.

    send({
      type: "log",
      message: `✅ تم جلب ${total} منتج — بدء من ${fromIndex + 1}`,
    });
    send({ type: "total", total });

const { startDownload } = require("./server/services/download-images.js");



    // لو retry=1 نخلي منIndex يبدأ من 0 علشان يعيد تقييم الـbatch كله اللي تم اختياره
    const effectiveFromIndex = retry ? 0 : fromIndex;

    await startDownload(
      retry ? sliced : sliced,
      effectiveFromIndex,
      total,
      (msg) => send(msg),
    );
  } catch (err) {
    send({ type: "error", message: err.message });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (_) {}
    }
    res.end();
  }
});

// ─────────────────────────────────────────────
// DOWNLOAD TEMPLATE
// ─────────────────────────────────────────────

app.get("/api/template", (req, res) => {
  const filePath = path.join(__dirname, "rgb_full_import_template.xlsx");

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Template file not found");
  }

  res.download(filePath, "rgb_import_template.xlsx");
});

// ─────────────────────────────────────────────
// EXPORT PRE-IMPORT EXCEL FROM UPLOADED DATA
// ─────────────────────────────────────────────

app.get("/api/export-pre-import", (req, res) => {
  if (!parsedRows || parsedRows.length === 0) {
    return res.status(400).json({
      success: false,
      message: "لا توجد بيانات مرفوعة للتصدير",
    });
  }

  const headersMap = parsedHeaders.reduce((map, header, index) => {
    const key = String(header || "")
      .trim()
      .toLowerCase();
    if (key) map[key] = index;
    return map;
  }, {});

  const lookupIndex = (names) => {
    for (const name of names) {
      const idx = headersMap[name.toLowerCase()];
      if (idx !== undefined) return idx;
    }
    return undefined;
  };

  const nameIndex = lookupIndex([
    "productar",
    "producten",
    "product ar",
    "product en",
    "itemname",
    "name",
  ]);
  const priceIndex = lookupIndex(["price", "salesprice", "itemprice"]);
  const mainIndex = lookupIndex([
    "maingroupar",
    "maingroupen",
    "main group ar",
    "main group en",
    "maingroup",
    "main group",
    "catname",
  ]);
  const subIndex = lookupIndex([
    "subgroupar",
    "subgroupen",
    "sub group ar",
    "sub group en",
    "subgroup",
    "sub group",
    "subcatname",
  ]);

  const rows = parsedRows.map((row) => [
    String(row[nameIndex] ?? "").trim(),
    String(row[priceIndex] ?? "").trim(),
    String(row[mainIndex] ?? "").trim(),
    String(row[subIndex] ?? "").trim(),
  ]);

  const workbook = XLSX.utils.book_new();
  const sheetData = [
    ["الاسم", "السعر", "المجموعة الرئيسية", "المجموعة الفرعية"],
    ...rows,
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, "PreImport");

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=pre_import_data.xlsx",
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.send(buffer);
});

// ─────────────────────────────────────────────
// EXPORT CURRENT ITEMS FROM DATABASE
// ─────────────────────────────────────────────

app.get("/api/export-current-items", async (req, res) => {
  if (!dbConfig) {
    return res
      .status(400)
      .json({ success: false, message: "قاعدة البيانات غير متصلة" });
  }

  let pool;

  try {
    pool = await createPool(dbConfig);
    const query = `
      WITH Items_CTE AS (
          SELECT
              p.ID AS ItemID,
              i.itid,
              LTRIM(RTRIM(p.ItemName)) AS ItemName_AR,
              LTRIM(RTRIM(ISNULL(i.itname_en, p.ItemName))) AS ItemName_EN,
              LTRIM(RTRIM(m.mmname)) AS mmname,
              LTRIM(RTRIM(m.mmname_en)) AS mmname_en,
              LTRIM(RTRIM(sm.smname)) AS SubCategory,
              ISNULL(pr.itprice, 0) AS Price,
              p.Style_Code,
              ROW_NUMBER() OVER (
                  PARTITION BY p.ID
                  ORDER BY pr.itprice DESC
              ) AS rn
          FROM TblProductItem p
          INNER JOIN prices_items pr
              ON p.ID = pr.itid
          LEFT JOIN select_sub_men_items i
              ON LTRIM(RTRIM(p.ItemName)) = LTRIM(RTRIM(i.itname))
          LEFT JOIN select_sub_men sm
              ON i.smid = sm.smid
          LEFT JOIN select_menu m
              ON sm.mmid = m.mmid
          WHERE
              p.ItemName IS NOT NULL
              AND LTRIM(RTRIM(p.ItemName)) <> ''
      )
      SELECT
          ItemID,
          itid,
          ItemName_AR,
          ItemName_EN,
          mmname,
          mmname_en,
          SubCategory,
          Price,
          Style_Code
      FROM Items_CTE
      WHERE rn = 1
      ORDER BY ItemID ASC;
    `;

    const result = await pool.request().query(query);
    const rows = result.recordset || [];

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "لا توجد أصناف حالية للتصدير",
      });
    }

    const sheetData = [
      ["الاسم", "السعر", "المجموعة الرئيسية", "المجموعة الفرعية"],
      ...rows.map((row) => [
        row.ItemName_AR || row.ItemName_EN || "",
        row.Price,
        row.mmname || "",
        row.SubCategory || "",
      ]),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Items");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=current_items.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (_) {}
    }
  }
});

// ─────────────────────────────────────────────
// CLEAR DATABASE — تفريغ قاعدة البيانات مباشرة
// ─────────────────────────────────────────────

app.post("/api/clear-database", async (req, res) => {
  if (!dbConfig) {
    return res.json({
      success: false,
      message: "قاعدة البيانات غير متصلة",
    });
  }

  let pool;

  try {
    const sql = getSql(dbConfig);
    pool = await createPool(dbConfig);

    // تفريغ أسماء المجموعات الرئيسية
    await pool.request().query(`
      UPDATE select_menu
      SET mmname = '', mmname_en = ''
    `);

    // تفريغ أسماء المجموعات الفرعية
    await pool.request().query(`
      UPDATE select_sub_men
      SET smname = '', smname_en = ''
    `);

    // تفريغ أسماء الأصناف والأسعار من TblProductItem
    await pool.request().query(`
      UPDATE TblProductItem
      SET ItemName = NULL, SalesPrice = NULL
    `);

    // تفريغ أسماء الأصناف من select_sub_men_items
    await pool.request().query(`
      UPDATE select_sub_men_items
      SET itname = '', itname_en = ''
    `);

    // تفريغ الأسعار من prices_items
    await pool.request().query(`
      UPDATE prices_items
      SET itprice = 0
    `);

    res.json({
      success: true,
      message: "✅ تم تفريغ قاعدة البيانات بنجاح",
    });
  } catch (err) {
    res.json({
      success: false,
      message: err.message,
    });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (_) {}
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT ORIGINAL TABLES  —  نسخة مُصحَّحة بالكامل
//
// المشاكل التي كانت موجودة والآن مُصلَّحة:
//
//  1. ENCODING  → الأصل UTF-8 BOM (0xEF 0xBB 0xBF) وليس windows-1256
//                 الـ BOM يُرسل كأول bytes قبل أي نص
//                 بدونه يفتح النظام الملف بـ ANSI فتظهر الأحرف مشوهة
//
//  2. LINE ENDINGS → الأصل \n فقط (LF) وليس \r\n (CRLF)
//                    النظام (Afaq POS) يقرأ الملف بـ LF — CRLF يسبب
//                    "fewer columns" عند الاستيراد لأن \r يعلق آخر عمود
//
//  3. BOOLEAN VALUES → الأصل lowercase: true / false
//                       SQL Server يُرجع True/False بـ capital T/F
//                       النظام يفشل في قراءتها → يجب تحويلها لـ lowercase
//
//  4. NULL VALUES → NULL في DB يجب أن يُكتب كقيمة فارغة "" وليس "null"
//                   القيمة الفارغة في الأصل هي empty string بدون quotes
//
//  5. TRAILING NEWLINE → الأصل لا ينتهي بسطر فارغ بعد آخر جدول
//                         لكن بين الجداول يوجد سطر فارغ واحد فقط
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/export-original-tables", async (req, res) => {
  if (!dbConfig) {
    return res
      .status(400)
      .json({ success: false, message: "قاعدة البيانات غير متصلة" });
  }

  let pool;

  try {
    const sql = getSql(dbConfig);
    pool = await createPool(dbConfig);

    // ─────────────────────────────────────────────────────────────────────
    // هيكل الجداول بالترتيب الأصلي المستخرج من الملف المرفق
    // الأعمدة بنفس الترتيب تماماً — أي عمود غير موجود → قيمة فارغة
    // ─────────────────────────────────────────────────────────────────────

    const TABLES = [
      // ── 1. TblProductItem ── 28 عمود ──────────────────────────────────
      {
        name: "TblProductItem",
        // Matches sample export header order exactly (1.xlsx / 2.xlsx)
        columns: [
          "ID",
          "ItemName",
          "catID",
          "SalesPrice",
          "CostPrice",
          "Reorder",
          "FirstBalance",
          "CurrentBalance",
          "SerialNo",
          "ReportRequerd",
          "tempbalance",
          "catname",
          "aid",
          "oldname",
          "oldcode",
          "weght",
          "fbalance",
          "cbalance",
          "Style_Code",
          "New_Style_Code",
          "Color_Code",
          "Size_Code",
          "sizecats",
          "prepairid",
          "sales_acc",
          "purches_acc",
          "Transfer",
          "Up_Date",
        ],
        query: `
          SELECT
            ID, ItemName, catID, SalesPrice, CostPrice,
            Reorder, FirstBalance, CurrentBalance, SerialNo,
            ReportRequerd, tempbalance, catname, aid, oldname,
            oldcode, weght, fbalance, cbalance, Style_Code,
            New_Style_Code, Color_Code, Size_Code, sizecats,
            prepairid, sales_acc, purches_acc, Transfer, Up_Date
          FROM TblProductItem
          ORDER BY ID ASC
        `,
      },
      // ── 2. TblItemStore ── 12 عمود ────────────────────────────────────
      {
        name: "TblItemStore",
        columns: [
          "ItemId",
          "StoreId",
          "SalesPrice",
          "CostPrice",
          "Reorder",
          "FirstBalance",
          "CurrentBalance",
          "EndUpdate",
          "FirstBalancePosted",
          "SalesPrice2",
          "SalesPrice3",
          "oldcurrent",
        ],
        query: `
          SELECT
            ItemId, StoreId, SalesPrice, CostPrice,
            Reorder, FirstBalance, CurrentBalance, EndUpdate,
            FirstBalancePosted, SalesPrice2, SalesPrice3, oldcurrent
          FROM TblItemStore
          ORDER BY ItemId ASC
        `,
      },
      // ── 3. groups ── 13 عمود ──────────────────────────────────────────
      {
        name: "groups",
        columns: [
          "ID",
          "Group_Name",
          "samah",
          "tosale",
          "topur",
          "inbetween",
          "materials",
          "gard",
          "NoVAT",
          "PointINOk",
          "PointOutOk",
          "No_VAT_ID",
          "FeesOK",
        ],
        query: `
          SELECT
            ID, Group_Name, samah, tosale, topur,
            inbetween, materials, gard, NoVAT,
            PointINOk, PointOutOk, No_VAT_ID, FeesOK
          FROM [groups]
          ORDER BY ID ASC
        `,
      },
      // ── 4. select_menu ── 6 أعمدة ─────────────────────────────────────
      {
        name: "select_menu",
        columns: [
          "mmid",
          "mmname",
          "mmindex",
          "backcolor",
          "forecolor",
          "mmname_en",
        ],
        query: `
          SELECT mmid, mmname, mmindex, backcolor, forecolor, mmname_en
          FROM select_menu
          ORDER BY mmid ASC
        `,
      },
      // ── 5. select_menu_groups ── 3 أعمدة ──────────────────────────────
      {
        name: "select_menu_groups",
        columns: ["mmid", "posid", "okk"],
        query: `
          SELECT mmid, posid, okk
          FROM select_menu_groups
          ORDER BY mmid ASC, posid ASC
        `,
      },
      // ── 6. select_sub_men ── 7 أعمدة ──────────────────────────────────
      {
        name: "select_sub_men",
        columns: [
          "smid",
          "smname",
          "mmid",
          "smindex",
          "backcolor",
          "forecolor",
          "smname_en",
        ],
        query: `
          SELECT smid, smname, mmid, smindex, backcolor, forecolor, smname_en
          FROM select_sub_men
          ORDER BY smid ASC
        `,
      },
      // ── 7. select_sub_men_items ── 15 عمود ────────────────────────────
      {
        name: "select_sub_men_items",
        columns: [
          "smid",
          "imid",
          "itid",
          "itname",
          "itindex",
          "price",
          "backcolor",
          "forecolor",
          "size_group",
          "show",
          "size_group_id",
          "itname_en",
          "funid",
          "Transfer",
          "Up_Date",
        ],
        // [show] لأنه كلمة محجوزة في SQL Server
        query: `
          SELECT
            smid, imid, itid, itname, itindex,
            price, backcolor, forecolor, size_group,
            [show], size_group_id, itname_en, funid, Transfer, Up_Date
          FROM select_sub_men_items
          ORDER BY smid ASC, imid ASC
        `,
      },
      // ── 8. select_sub_men_sub_items ── 10 أعمدة (عادةً فارغ) ──────────
      {
        name: "select_sub_men_sub_items",
        columns: [
          "itid",
          "imid",
          "subitid",
          "itname",
          "price",
          "backcolor",
          "forecolor",
          "itname_en",
          "Transfer",
          "Up_Date",
        ],
        query: `
          SELECT
            itid, imid, subitid, itname, price,
            backcolor, forecolor, itname_en, Transfer, Up_Date
          FROM select_sub_men_sub_items
          ORDER BY itid ASC
        `,
      },
      // ── 9. prices ── 4 أعمدة ──────────────────────────────────────────
      {
        name: "prices",
        columns: ["priceid", "pricename", "priceindex", "active"],
        query: `
          SELECT priceid, pricename, priceindex, active
          FROM prices
          ORDER BY priceid ASC
        `,
      },
      // ── 10. prices_items ── 7 أعمدة ───────────────────────────────────
      {
        name: "prices_items",
        columns: [
          "itid",
          "priceid",
          "itprice",
          "pricename",
          "ID_INDEX",
          "Transfer",
          "Up_Date",
        ],
        query: `
          SELECT itid, priceid, itprice, pricename, ID_INDEX, Transfer, Up_Date
          FROM prices_items
          ORDER BY itid ASC, priceid ASC
        `,
      },
    ];

    // ─────────────────────────────────────────────────────────────────────
    // FIX 3: تحويل القيم البولية
    // SQL Server يُرجع True/False (capital) — النظام يحتاج true/false (lowercase)
    // ─────────────────────────────────────────────────────────────────────
    function normalizeBool(val) {
      if (val === true || val === "True" || val === "TRUE") return "true";
      if (val === false || val === "False" || val === "FALSE") return "false";
      return null; // ليست قيمة بولية
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX 1+4: escapeCSV — يتعامل مع NULL وBoolean والنصوص العربية
    // RFC 4180: فاصلة أو " أو سطر جديد → تُلفّ بـ "..." مع escape للـ "
    // ─────────────────────────────────────────────────────────────────────
    function escapeCSV(val) {
      // FIX 4: NULL/undefined → سلسلة فارغة (بدون كلمة "null")
      if (val === null || val === undefined) return "";

      // FIX 3: Boolean → lowercase
      const boolNorm = normalizeBool(val);
      if (boolNorm !== null) return boolNorm;

      const str = String(val);

      // RFC 4180 escape: فاصلة أو " أو سطر جديد → wrap
      if (
        str.includes(",") ||
        str.includes('"') ||
        str.includes("\n") ||
        str.includes("\r")
      ) {
        return '"' + str.replace(/"/g, '""') + '"';
      }

      return str;
    }

    const exportWarnings = [];

    function validateTableRow(table, row, rowIndex) {
      const missing = table.columns.filter((col) => !(col in row));
      const extra = Object.keys(row).filter(
        (key) => !table.columns.includes(key),
      );
      if (missing.length || extra.length) {
        const message =
          `⚠️ Export warning for ${table.name} row ${rowIndex + 1}: expected ${table.columns.length} columns, got ${Object.keys(row).length}.` +
          (missing.length ? ` missing=[${missing.join(",")}]` : "") +
          (extra.length ? ` extra=[${extra.join(",")}]` : "");
        exportWarnings.push(message);
        console.warn(message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // بناء محتوى الـ CSV
    //
    // القواعد الدقيقة المستخرجة من الملف الأصلي بالـ binary analysis:
    //
    //  RULE A — جدول به بيانات (غير آخر جدول):
    //    Table: Name\nheader\nrow1\nrow2\n...\n\n
    //    ← سطر فارغ واحد بعد آخر صف، قبل الجدول التالي
    //
    //  RULE B — جدول فارغ (لا بيانات):
    //    Table: Name\nheader\n\n
    //    ← سطر فارغ واحد بعد الـ header مباشرة
    //
    //  RULE C — آخر جدول (prices_items):
    //    Table: Name\nheader\nrow1\nrow2\n...\nrowN
    //    ← لا سطر فارغ، لا \n في النهاية (EOF مباشرة بعد آخر حرف)
    //
    // Run-time error 62 "Input past end of file" يحدث لأن:
    //   - إما سطر فارغ زيادة في النهاية (النظام يحاول يقرأ سطر بعد EOF)
    //   - أو \n زيادة في النهاية يخلي النظام يتوقع جدول تالٍ
    // ─────────────────────────────────────────────────────────────────────
    const csvParts = []; // كل جزء = سطر بدون \n

    for (let ti = 0; ti < TABLES.length; ti++) {
      const table = TABLES[ti];
      const isLast = ti === TABLES.length - 1;

      // سطر اسم الجدول
      csvParts.push(`Table: ${table.name}`);

      // سطر الـ Header
      csvParts.push(table.columns.join(","));

      // جلب البيانات من SQL Server
      let rows = [];
      try {
        const result = await pool.request().query(table.query);
        rows = result.recordset;
      } catch (queryErr) {
        console.warn(
          `⚠️ Export: skip table "${table.name}" — ${queryErr.message}`,
        );
        rows = []; // جدول فارغ → يطبق RULE B
      }

      if (rows.length === 0) {
        // RULE B: جدول فارغ → سطر فارغ بعد الـ header (حتى لو آخر جدول)
        csvParts.push("");
      } else {
        // كتابة صفوف البيانات بترتيب الأعمدة الأصلي
        for (let ri = 0; ri < rows.length; ri++) {
          const row = rows[ri];
          validateTableRow(table, row, ri);
          const cells = table.columns.map((col) => escapeCSV(row[col]));
          csvParts.push(cells.join(","));
        }

        if (!isLast) {
          // RULE A: جدول به بيانات وليس الأخير → سطر فارغ بعد البيانات
          csvParts.push("");
        }
        // RULE C: آخر جدول وبه بيانات → لا نضيف شيئاً (EOF مباشرة)
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // إنشاء الـ Buffer النهائي
    //
    // - UTF-8 BOM (0xEF 0xBB 0xBF): ضروري لدعم العربية وتحديد الترميز
    // - الفاصل بين الأسطر: \n (LF فقط) — مطابق للملف الأصلي
    // - لا \n في نهاية الملف — الأصل ينتهي مباشرة بآخر حرف بيانات
    //   أي \n زيادة في النهاية → Run-time error 62 "Input past end of file"
    // ─────────────────────────────────────────────────────────────────────
    const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);
    const CONTENT_BYTES = Buffer.from(csvParts.join("\n"), "utf8"); // \n بين الأسطر فقط

    const finalBuffer = Buffer.concat([BOM_BYTES, CONTENT_BYTES]);

    if (exportWarnings.length > 0) {
      res.setHeader("X-Export-Warnings-Count", String(exportWarnings.length));
      res.setHeader(
        "X-Export-Warnings",
        exportWarnings.slice(0, 5).join(" | "),
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Exported_Items_Tables.csv"',
    );
    res.setHeader("Content-Length", finalBuffer.length);

    return res.send(finalBuffer);
  } catch (err) {
    console.error("Export error:", err.message);
    return res.status(500).json({
      success: false,
      message: `خطأ أثناء التصدير: ${err.message}`,
    });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (_) {}
    }
  }
});

// ─────────────────────────────────────────────
// GOOGLE IMAGES — رفع الإكسيل (منفصل تمامًا عن /api/upload الخاص بالـ Import)
// ─────────────────────────────────────────────
app.post(
  "/api/google/upload",
  upload.single("file"),
  (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "لم يتم رفع أي ملف" });
      }

      const allowedExt = [".xlsx", ".xls", ".csv"];
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (!allowedExt.includes(ext)) {
        return res.status(400).json({
          success: false,
          message: "الصيغ المسموحة فقط: xlsx, xls, csv",
        });
      }

      const buffer = fs.readFileSync(req.file.path);
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      googleParsedProducts = rows;

      return res.json({
        success: true,
        count: rows.length,
        fileName: req.file.originalname,
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: `تعذّر قراءة الملف: ${err.message}`,
      });
    }
  },
);

// ─────────────────────────────────────────────
// GOOGLE IMAGES — بدء التحميل (SSE)، بنفس أسلوب /api/download-images و /api/import
// ─────────────────────────────────────────────
app.get("/api/google/start", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  const snapshotOnly =
    String(req.query.snapshot || req.query.reconnect || "")
      .toLowerCase() === "1";

  // ── Helper: replay the server-owned download state to this SSE client ──
  function replaySnapshot() {
    send({ type: "total", total: googleDownloadState.total });

    if (googleDownloadState.total > 0) {
      send({
        type: "progress",
        status: googleDownloadState.lastStatus || "",
        current: googleDownloadState.progressCurrent || 0,
        total: googleDownloadState.progressTotal || googleDownloadState.total,
        downloaded: googleDownloadState.downloaded || 0,
        failed: googleDownloadState.failed || 0,
        remaining:
          typeof googleDownloadState.remaining === "number"
            ? googleDownloadState.remaining
            : googleDownloadState.total,
        productName: googleDownloadState.currentProduct || "",
      });
    }

    if (
      Array.isArray(googleDownloadState.logs) &&
      googleDownloadState.logs.length > 0
    ) {
      for (const l of googleDownloadState.logs) {
        send({ type: "log", message: l.message });
      }
    }

    if (googleDownloadState.done) {
      send({
        type: "done",
        total: googleDownloadState.total,
        downloaded: googleDownloadState.downloaded,
        failed: googleDownloadState.failed,
      });
    }
  }

  // Persist + update server-owned state for the currently running job.
  // We keep the original event shapes so the existing frontend continues to work.
  const sendAndPersist = (obj) => {
    try {
      if (obj && obj.type === "total") {
        googleDownloadState.total = Number(obj.total || 0);
        googleDownloadState.remaining = googleDownloadState.total;
        googleDownloadState.progressTotal = googleDownloadState.total;
        googleDownloadState.running = true;
        googleDownloadState.done = false;
      } else if (obj && obj.type === "progress") {
        if (typeof obj.current === "number") {
          googleDownloadState.progressCurrent = obj.current;
        }
        if (typeof obj.total === "number") {
          googleDownloadState.progressTotal = obj.total;
          googleDownloadState.total = obj.total;
        }

        if (typeof obj.downloaded === "number") {
          googleDownloadState.downloaded = obj.downloaded;
        }
        if (typeof obj.failed === "number") {
          googleDownloadState.failed = obj.failed;
        }
        if (typeof obj.remaining === "number") {
          googleDownloadState.remaining = obj.remaining;
        }

        googleDownloadState.currentProduct = obj.productName || "";
        googleDownloadState.lastStatus =
          obj.status || googleDownloadState.lastStatus;

        if (
          googleDownloadState.total > 0 &&
          googleDownloadState.progressCurrent >= googleDownloadState.total
        ) {
          googleDownloadState.lastStatus =
            googleDownloadState.lastStatus || "done";
        }
      } else if (obj && obj.type === "log") {
        if (
          typeof obj.message === "string" &&
          obj.message.trim() !== ""
        ) {
          googleDownloadState.logs.push({
            message: obj.message,
            ts: Date.now(),
          });
          if (googleDownloadState.logs.length > GOOGLE_LOG_LIMIT) {
            googleDownloadState.logs.splice(
              0,
              googleDownloadState.logs.length - GOOGLE_LOG_LIMIT,
            );
          }
        }
      } else if (obj && obj.type === "done") {
        googleDownloadState.running = false;
        googleDownloadState.done = true;

        if (typeof obj.total === "number") googleDownloadState.total = obj.total;
        if (typeof obj.downloaded === "number") googleDownloadState.downloaded = obj.downloaded;
        if (typeof obj.failed === "number") googleDownloadState.failed = obj.failed;

        // Keep remaining consistent with done.
        googleDownloadState.remaining = 0;
        googleDownloadState.progressCurrent = googleDownloadState.total;
        googleDownloadState.progressTotal = googleDownloadState.total;
        googleDownloadState.currentProduct =
          googleDownloadState.currentProduct || "";
      } else if (obj && obj.type === "error") {
        googleDownloadState.running = false;
        googleDownloadState.done = false;
        googleDownloadState.lastStatus = "error";
      }
    } catch (_) {
      // never break download flow due to state handling
    }

    // Fan-out to every connected SSE client.
    for (const client of googleSseClients) {
      if (!client || !client.res) continue;
      try {
        client.res.write(`data: ${JSON.stringify(obj)}\n\n`);
      } catch (_) {
        // ignore broken client streams
      }
    }
  };

  // Register this SSE client so future events are broadcast to it too.
  const clientId = addGoogleSseClient(res);

  req.on("close", () => {
    removeGoogleSseClient(clientId);
  });

  // ── PATH 1: Read-only snapshot — never start a new job ──
  if (snapshotOnly) {
    replaySnapshot();

    // Keep the stream open only if a job is currently running
    // (so this client can receive live events via fan-out).
    if (!googleImagesRunning) {
      return res.end();
    }
    // Job is running — events will be broadcast via sendAndPersist fan-out.
    return;
  }

  // ── PATH 2: Explicit job start ──
  // If a job is already running, replay snapshot and keep stream open for live events.
  if (googleImagesRunning) {
    replaySnapshot();
    // Stream stays open; events arrive via sendAndPersist fan-out.
    return;
  }

  // No job running. Need products to start one.
  if (!googleParsedProducts.length) {
    send({ type: "error", message: "يرجى رفع ملف Excel/CSV أولاً" });
    return res.end();
  }

  // Reset state and start a new job.
  googleImagesRunning = true;
  googleDownloadState = {
    running: true,
    done: false,
    total: 0,
    downloaded: 0,
    failed: 0,
    remaining: 0,
    progressCurrent: 0,
    progressTotal: 0,
    currentProduct: "",
    lastStatus: "",
    logs: [],
  };

  const outputDir = path.join(__dirname, "Google_images");

  try {
    await runGoogleDownload({
      products: googleParsedProducts,
      outputDir,
      headless: true,
      writeReports: true,
      onEvent: sendAndPersist,
    });
  } catch (err) {
    sendAndPersist({ type: "error", message: err.message });
  } finally {
    googleImagesRunning = false;
    res.end();
  }
});

// ─────────────────────────────────────────────
// GOOGLE IMAGES — تحميل ملف تقرير الإكسيل الناتج (فيه رابط/رقم/حجم كل صورة)
// ─────────────────────────────────────────────
app.get("/api/google/report", (req, res) => {
  const reportPath = path.join(__dirname, "googlereport.xlsx");
  if (!fs.existsSync(reportPath)) {
    return res
      .status(404)
      .json({ success: false, message: "لا يوجد تقرير بعد — قم بتشغيل التحميل أولاً" });
  }
  return res.download(reportPath, "googlereport.xlsx");
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 FAST RGB IMPORTER RUNNING → http://localhost:${PORT}\n`);
});
