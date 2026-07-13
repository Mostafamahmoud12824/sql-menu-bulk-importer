"use strict";

const data = require("../database/feature-activation-data");


// ═══════════════════════════════════════════════════════════════════════════
// FEATURE ACTIVATION — SERVICE LAYER
//
// المسؤولية: قواعد العمل (business rules) — التأكد من وجود الجدول، seeding،
// التحقق من صحة المفاتيح المرسلة، وتحديد إيه اللي اتغيّر فعلاً قبل الحفظ.
//
// كمان: بعد حفظ أي تغيير في FeatureSettings (جدول حالة اللوحة)، بنعكس نفس
// القيمة على appsett (جدول التفعيل الحقيقي في نظام نقاط البيع) عن طريق
// data.updateAppsettForKey — ده اللي بيخلي التفعيل يتفعل فعليًا في الشاشات
// الحقيقية للبرنامج، مش بس في اللوحة.
//
// الراوتر (feature-activation-routes.js) لا يعرف حاجة عن SQL — بيكلّم
// الـ service بس. الـ service هو الوحيد اللي بيكلّم الـ data layer.
// ═══════════════════════════════════════════════════════════════════════════

const VALID_KEYS = new Set(data.DEFAULT_SETTINGS.map((d) => d.key));

// ── يتأكد إن الجدول موجود ومليان بالقيم الافتراضية (يُستدعى أول أي عملية) ──
async function ensureInitialized(pool, sql) {
  const exists = await data.tableExists(pool);
  if (!exists) {
    await data.createTable(pool);
  }

  const count = await data.countRows(pool);
  if (count === 0) {
    for (const item of data.DEFAULT_SETTINGS) {
      await data.insertSetting(pool, sql, item);
    }
  }
}

// ── جلب كل الإعدادات الحالية ──────────────────────────────────────────────
async function getAllSettings(pool, sql) {
  await ensureInitialized(pool, sql);
  return data.fetchAll(pool);
}

// ── حفظ فقط القيم اللي اتغيّرت فعلاً ──────────────────────────────────────
// updates: [{ key, value }]  → بيرجع بس اللي اتحفظ فعلاً (بعد الفلترة)
async function saveSettings(pool, sql, updates) {
  await ensureInitialized(pool, sql);

  if (!Array.isArray(updates) || updates.length === 0) {
    return { applied: [], settings: await data.fetchAll(pool) };
  }

  const current = await data.fetchAll(pool);
  const currentByKey = new Map(current.map((row) => [row.SettingKey, row]));

  const applied = [];

  for (const update of updates) {
    const key = String((update && update.key) || "").trim();
    if (!key || !VALID_KEYS.has(key)) continue; // تجاهل أي مفتاح غير معروف

    const existing = currentByKey.get(key);
    if (!existing) continue; // الميزة مش موجودة في الجدول أصلاً

    const newValue = update.value ? 1 : 0;
    const oldValue = existing.SettingValue ? 1 : 0;

    if (newValue === oldValue) continue; // مفيش تغيير فعلي — تخطي

    await data.updateValueByKey(pool, sql, key, newValue);

    // مزامنة فعلية مع جدول appsett (نظام نقاط البيع الحقيقي)
    await data.updateAppsettForKey(pool, sql, key, newValue);

    applied.push({ key, value: newValue });
  }

  return { applied, settings: await data.fetchAll(pool) };
}

// ── استرجاع كل القيم الافتراضية ───────────────────────────────────────────
async function resetToDefaults(pool, sql) {
  const exists = await data.tableExists(pool);
  if (!exists) {
    await data.createTable(pool);
  }

  for (const item of data.DEFAULT_SETTINGS) {
    await data.upsertDefault(pool, sql, item);

    // مزامنة فعلية مع جدول appsett (نظام نقاط البيع الحقيقي)
    await data.updateAppsettForKey(pool, sql, item.key, item.value);
  }

  return data.fetchAll(pool);
}

module.exports = {
  ensureInitialized,
  getAllSettings,
  saveSettings,
  resetToDefaults,
};