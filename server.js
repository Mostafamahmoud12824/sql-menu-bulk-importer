const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const translateModule = require("google-translate-api-x");

const translate =
  translateModule.translate || translateModule.default || translateModule;

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.static(__dirname));

const upload = multer({
  dest: path.join(__dirname, "uploads"),
});

let dbConfig = null;
let parsedRows = [];
let parsedHeaders = [];

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

// ─────────────────────────────────────────────
// FAST TRANSLATION
// ─────────────────────────────────────────────

async function autoTranslate(arText, enText) {
  // already translated
  if (enText && enText.trim() !== "") {
    return enText.trim();
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

    const translated = result.text.trim();

    translationCache[arText] = translated;

    return translated;
  } catch (err) {
    console.log("Translation Error:", err.message);

    translationCache[arText] = arText;

    return arText;
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
      message: err.message,
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
      const price = parseFloat(row[9]) || 0;

      productEN = productEN || translationCache[productAR] || productAR;

      // update excel memory
      const mainEN =
        String(row[2] ?? "").trim() ||
        translationCache[String(row[1] ?? "").trim()] ||
        String(row[1] ?? "").trim();
      const subEN =
        String(row[6] ?? "").trim() ||
        translationCache[String(row[5] ?? "").trim()] ||
        String(row[5] ?? "").trim();
      row[2] = mainEN;
      row[6] = subEN;
      row[8] = productEN;

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

      await pool
        .request()
        .input("itid", sql.Int, itid)
        .input("name", sql.NVarChar(sql.MAX), productAR)
        .input("price", sql.Decimal(18, 2), price).query(`
          UPDATE TblProductItem
          SET
            ItemName = @name,
            SalesPrice = @price,
            Up_Date = 1
          WHERE ID = @itid
        `);

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
    // SAVE EXCEL
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

    const { startDownload } = require("./download-images");

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
      SET ItemName = '', SalesPrice = 0
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

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 FAST RGB IMPORTER RUNNING → http://localhost:${PORT}\n`);
});
