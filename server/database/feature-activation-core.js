"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE ACTIVATION — CORE
// وحدة مستقلة تمامًا: منطق SQL الخاص بجدول FeatureSettings فقط.
//
// لا تعتمد على أي state عام في المشروع (لا dbConfig ولا parsedRows ولا أي
// متغير آخر). كل دالة هنا تستقبل (pool, sql) كمدخلات صريحة (dependency
// injection) — بنفس فلسفة باقي المشروع في التعامل مع mssql/msnodesqlv8.
//
// لا علاقة لهذه الوحدة بأي نظام ترخيص (Licensing). هي فقط تخزن/تُرجع
// قيم تفعيل/تعطيل الميزات (feature flags) في جدول FeatureSettings.
// ═══════════════════════════════════════════════════════════════════════════

const TABLE_NAME = "FeatureSettings";

// ── القيم الافتراضية لكل ميزة ─────────────────────────────────────────────
const DEFAULT_SETTINGS = [
  // Core Modules
  { key: "EnableAdministration", name: "تفعيل الإدارة", value: 1, group: "core" },
  { key: "EnablePurchases", name: "تفعيل المشتريات", value: 1, group: "core" },
  { key: "EnableCashBox", name: "تفعيل الخزينة", value: 1, group: "core" },

  // POS Features
  { key: "EnableLoyaltyPoints", name: "تفعيل نقاط الولاء", value: 1, group: "pos" },
  { key: "EnablePOSBarcode", name: "تفعيل باركود المنتج", value: 1, group: "pos" },
  { key: "EnableWarehouses", name: "تفعيل المخازن", value: 1, group: "pos" },
  { key: "EnableAccountingEntries", name: "تفعيل القيود المحاسبية", value: 1, group: "pos" },

  // Saudi Arabia Features
  { key: "EnableZATCA", name: "تفعيل تكامل فاتورة (ZATCA)", value: 1, group: "sa" },
];

const VALID_KEYS = new Set(DEFAULT_SETTINGS.map((d) => d.key));

// ── التأكد من وجود الجدول (يُنشأ تلقائيًا لو مش موجود) ───────────────────
async function ensureTableExists(pool) {
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.tables WHERE name = '${TABLE_NAME}'
    )
    BEGIN
      CREATE TABLE ${TABLE_NAME} (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        SettingKey NVARCHAR(100) NOT NULL UNIQUE,
        SettingName NVARCHAR(255) NOT NULL,
        SettingValue BIT NOT NULL CONSTRAINT DF_FeatureSettings_Value DEFAULT (1),
        CreatedAt DATETIME NOT NULL CONSTRAINT DF_FeatureSettings_Created DEFAULT (GETDATE()),
        UpdatedAt DATETIME NOT NULL CONSTRAINT DF_FeatureSettings_Updated DEFAULT (GETDATE())
      );
    END
  `);
}

// ── زرع القيم الافتراضية لو الجدول فاضي ──────────────────────────────────
async function seedDefaultsIfEmpty(pool, sql) {
  const countResult = await pool
    .request()
    .query(`SELECT COUNT(*) AS cnt FROM ${TABLE_NAME}`);

  const count = countResult.recordset[0].cnt;
  if (count > 0) return;

  for (const item of DEFAULT_SETTINGS) {
    await pool
      .request()
      .input("key", sql.NVarChar(100), item.key)
      .input("name", sql.NVarChar(255), item.name)
      .input("value", sql.Bit, item.value).query(`
        INSERT INTO ${TABLE_NAME} (SettingKey, SettingName, SettingValue, CreatedAt, UpdatedAt)
        VALUES (@key, @name, @value, GETDATE(), GETDATE())
      `);
  }
}

async function initialize(pool, sql) {
  await ensureTableExists(pool);
  await seedDefaultsIfEmpty(pool, sql);
}

// ── جلب كل الإعدادات الحالية ──────────────────────────────────────────────
async function getSettings(pool, sql) {
  await initialize(pool, sql);

  const result = await pool.request().query(`
    SELECT ID, SettingKey, SettingName, SettingValue, CreatedAt, UpdatedAt
    FROM ${TABLE_NAME}
    ORDER BY ID ASC
  `);

  return result.recordset;
}

// ── حفظ تحديثات (updates: [{ key, value }]) — فقط المفاتيح الصالحة ──────
async function saveSettings(pool, sql, updates) {
  await initialize(pool, sql);

  const applied = [];

  for (const update of updates) {
    const key = String((update && update.key) || "").trim();
    if (!key || !VALID_KEYS.has(key)) continue;

    const value = update.value ? 1 : 0;

    await pool
      .request()
      .input("key", sql.NVarChar(100), key)
      .input("value", sql.Bit, value).query(`
        UPDATE ${TABLE_NAME}
        SET SettingValue = @value, UpdatedAt = GETDATE()
        WHERE SettingKey = @key
      `);

    applied.push({ key, value });
  }

  return applied;
}

// ── استرجاع كل القيم الافتراضية (upsert لكل مفتاح) ───────────────────────
async function resetDefaults(pool, sql) {
  await ensureTableExists(pool);

  for (const item of DEFAULT_SETTINGS) {
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

  return getSettings(pool, sql);
}

module.exports = {
  TABLE_NAME,
  DEFAULT_SETTINGS,
  initialize,
  getSettings,
  saveSettings,
  resetDefaults,
};