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
    // FAST IMPORT LOOP
    // ─────────────────────────────

    for (let i = 0; i < total; i++) {
      const row = parsedRows[i];

      const mmid = parseInt(row[0]);

      const mainAR = String(row[1] ?? "").trim();

      let mainEN = String(row[2] ?? "").trim();

      const smid = parseInt(row[3]);

      const itemOrder = parseInt(row[4]);

      const subAR = String(row[5] ?? "").trim();

      let subEN = String(row[6] ?? "").trim();

      const productAR = String(row[7] ?? "").trim();

      let productEN = String(row[8] ?? "").trim();

      const price = parseFloat(row[9]) || 0;

      // translation from cache

      mainEN = mainEN || translationCache[mainAR] || mainAR;

      subEN = subEN || translationCache[subAR] || subAR;

      productEN = productEN || translationCache[productAR] || productAR;

      // update excel memory

      row[2] = mainEN;
      row[6] = subEN;
      row[8] = productEN;

      // validation

      if (isNaN(mmid) || isNaN(smid) || isNaN(itemOrder)) {
        continue;
      }

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

      if (itemResult.recordset.length === 0) {
        continue;
      }

      const itid = itemResult.recordset[0].itid;

      // MAIN GROUP

      await pool
        .request()
        .input("id", sql.Int, mmid)
        .input("ar", sql.NVarChar(sql.MAX), mainAR)
        .input("en", sql.NVarChar(sql.MAX), mainEN).query(`
          UPDATE select_menu
          SET
            mmname = CASE
              WHEN @ar = '' THEN mmname
              ELSE @ar
            END,

            mmname_en = CASE
              WHEN @en = '' THEN mmname_en
              ELSE @en
            END

          WHERE mmid = @id
        `);

      // SUB GROUP

      await pool
        .request()
        .input("id", sql.Int, smid)
        .input("ar", sql.NVarChar(sql.MAX), subAR)
        .input("en", sql.NVarChar(sql.MAX), subEN).query(`
          UPDATE select_sub_men
          SET
            smname = CASE
              WHEN @ar = '' THEN smname
              ELSE @ar
            END,

            smname_en = CASE
              WHEN @en = '' THEN smname_en
              ELSE @en
            END

          WHERE smid = @id
        `);

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

      // progress every 50 rows

      if (i % 50 === 0) {
        send({
          type: "progress",
          current: i,
          total,
        });
      }
    }

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
// START SERVER
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 FAST RGB IMPORTER RUNNING → http://localhost:${PORT}\n`);
});
