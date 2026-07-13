"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE ACTIVATION — DATA LAYER (Repository)
//
// المسؤولية الوحيدة لهذا الملف: تنفيذ عمليات SQL الخام على جدول
// FeatureSettings. لا يوجد هنا أي قواعد عمل (business rules) أو validation —
// ده بيتحط في feature-activation-service.js.
//
// كل دالة تستقبل (pool, sql) كمدخلات صريحة — بدون أي state عام، بنفس
// فلسفة باقي المشروع (mssql / mssql/msnodesqlv8).
// ═══════════════════════════════════════════════════════════════════════════

const TABLE_NAME = "FeatureSettings";

// ── القيم الافتراضية لكل ميزة (تُستخدم في seed و reset) ───────────────────
const DEFAULT_SETTINGS = [
  { key: "EnableAdministration", name: "Enable Administration", group: "core", value: 1 },
  { key: "EnablePurchases", name: "Enable Purchases", group: "core", value: 1 },
  { key: "EnableCashBox", name: "Enable Cash Box", group: "core", value: 1 },

  { key: "EnableLoyaltyPoints", name: "Enable Loyalty Points", group: "pos", value: 1 },
  { key: "EnablePOSBarcode", name: "Enable Product Barcode", group: "pos", value: 1 },
  { key: "EnableWarehouses", name: "Enable Warehouses", group: "pos", value: 1 },
  { key: "EnableAccountingEntries", name: "Enable Accounting Entries", group: "pos", value: 1 },

  { key: "EnableZATCA", name: "Enable ZATCA Integration", group: "sa", value: 1 },
];

// ═══════════════════════════════════════════════════════════════════════════
// APPSETT MAPPING — الربط الفعلي مع نظام نقاط البيع (POS) الحقيقي
//
// جدول FeatureSettings أعلاه خاص فقط بحالة لوحة التحكم دي (UI state). أما
// التفعيل/التعطيل الفعلي في شاشات البرنامج فبيحصل عن طريق جدول appsett
// (screenname + settid). الخريطة دي مبنية حرفيًا من كويريز التفعيل الأصلية
// اللي بتستخدم يدويًا حاليًا.
//
// ملاحظة: مفتاح "نظام البصمة" (FPrint / settid 10) مش مرتبط بأي من
// الميزات الثمانية الحالية، فاتقرر تجاهله حاليًا (بقرار صريح من المستخدم).
// ═══════════════════════════════════════════════════════════════════════════
const APPSETT_MAP = {
  EnableAdministration: [{ screenname: "Purch_Tuch", settid: 20 }],

  EnablePurchases: [{ screenname: "Purch_Tuch", settid: 10 }],

  EnableCashBox: [{ screenname: "CashDrw", settid: 10 }],

  EnableLoyaltyPoints: [{ screenname: "Points_menu", settid: 10 }],

  EnablePOSBarcode: [{ screenname: "Barcode", settid: 10 }],

  EnableWarehouses: [{ screenname: "stores_menu", settid: 10 }],

  EnableAccountingEntries: [
    { screenname: "account", settid: 10 },
    { screenname: "Main_Acc", settid: 10 },
    { screenname: "Qed_Purch", settid: 10 },
    { screenname: "Qed_Sale", settid: 10 },
  ],

  EnableZATCA: [
    { screenname: "ZATCA_Send", settid: 40 },
    { screenname: "ZATCA_Send", settid: 10 },
    { screenname: "ZATCA_Send", settid: 20 },
    { screenname: "ZATCA_Send", settid: 30 },
    { screenname: "ZATCA_API", settid: 10 },
    { screenname: "ZATCA_API", settid: 20 },
    { screenname: "ZATCA_API", settid: 30 },
    { screenname: "ZATCA", settid: 10 },
  ],
};

async function tableExists(pool) {
  const result = await pool
    .request()
    .query(`SELECT 1 AS found FROM sys.tables WHERE name = '${TABLE_NAME}'`);
  return result.recordset.length > 0;
}

async function createTable(pool) {
  await pool.request().query(`
    CREATE TABLE ${TABLE_NAME} (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      SettingKey NVARCHAR(100) NOT NULL UNIQUE,
      SettingName NVARCHAR(255) NOT NULL,
      SettingValue BIT NOT NULL CONSTRAINT DF_FeatureSettings_Value DEFAULT (1),
      CreatedAt DATETIME NOT NULL CONSTRAINT DF_FeatureSettings_Created DEFAULT (GETDATE()),
      UpdatedAt DATETIME NOT NULL CONSTRAINT DF_FeatureSettings_Updated DEFAULT (GETDATE())
    );
  `);
}

async function countRows(pool) {
  const result = await pool
    .request()
    .query(`SELECT COUNT(*) AS cnt FROM ${TABLE_NAME}`);
  return result.recordset[0].cnt;
}

async function insertSetting(pool, sql, item) {
  await pool
    .request()
    .input("key", sql.NVarChar(100), item.key)
    .input("name", sql.NVarChar(255), item.name)
    .input("value", sql.Bit, item.value).query(`
      INSERT INTO ${TABLE_NAME} (SettingKey, SettingName, SettingValue, CreatedAt, UpdatedAt)
      VALUES (@key, @name, @value, GETDATE(), GETDATE())
    `);
}

async function fetchAll(pool) {
  const result = await pool.request().query(`
    SELECT ID, SettingKey, SettingName, SettingValue, CreatedAt, UpdatedAt
    FROM ${TABLE_NAME}
    ORDER BY ID ASC
  `);
  return result.recordset;
}

async function updateValueByKey(pool, sql, key, value) {
  await pool
    .request()
    .input("key", sql.NVarChar(100), key)
    .input("value", sql.Bit, value).query(`
      UPDATE ${TABLE_NAME}
      SET SettingValue = @value, UpdatedAt = GETDATE()
      WHERE SettingKey = @key
    `);
}

async function upsertDefault(pool, sql, item) {
  await pool
    .request()
    .input("key", sql.NVarChar(100), item.key)
    .input("name", sql.NVarChar(255), item.name)
    .input("value", sql.Bit, item.value).query(`
      MERGE ${TABLE_NAME} AS target
      USING (SELECT @key AS SettingKey) AS src
        ON target.SettingKey = src.SettingKey
      WHEN MATCHED THEN
        UPDATE SET SettingValue = @value, UpdatedAt = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (SettingKey, SettingName, SettingValue, CreatedAt, UpdatedAt)
        VALUES (@key, @name, @value, GETDATE(), GETDATE());
    `);
}

// ── تحديث صفوف appsett الحقيقية المرتبطة بمفتاح معين (لو موجودة) ──────────
// value: 1 (تفعيل) أو 0 (تعطيل). لو المفتاح مش موجود في APPSETT_MAP
// (زي أي مفتاح مستقبلي بدون ربط)، الدالة متعملش حاجة بهدوء.
async function updateAppsettForKey(pool, sql, key, value) {
  const rows = APPSETT_MAP[key];
  if (!rows || rows.length === 0) return;

  const settval = value ? "1" : "0";

  for (const row of rows) {
    await pool
      .request()
      .input("screenname", sql.NVarChar(100), row.screenname)
      .input("settid", sql.Int, row.settid)
      .input("settval", sql.NVarChar(50), settval).query(`
        UPDATE appsett
        SET settval = @settval
        WHERE screenname = @screenname AND settid = @settid
      `);
  }
}

module.exports = {
  TABLE_NAME,
  DEFAULT_SETTINGS,
  APPSETT_MAP,
  tableExists,
  createTable,
  countRows,
  insertSetting,
  fetchAll,
  updateValueByKey,
  upsertDefault,
  updateAppsettForKey,
};