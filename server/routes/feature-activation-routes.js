"use strict";

const express = require("express");
const service = require("../services/feature-activation-service");


// ═══════════════════════════════════════════════════════════════════════════
// FEATURE ACTIVATION — ROUTER (HTTP layer)
//
// وحدة مستقلة تمامًا. لا تعتمد على أي state أو منطق خاص بأي موديول آخر
// (Import / Google Images / Customer Import / Licensing / ... إلخ).
//
// مسؤولية هذا الملف فقط: استقبال الـ request، فتح/قفل الـ pool، واستدعاء
// الـ service layer. كل منطق SQL وقواعد العمل موجودة في ملفات منفصلة
// (feature-activation-service.js و feature-activation-data.js).
//
// بدل ما نكرر منطق الاتصال بقاعدة البيانات هنا، بنستقبله كـ dependency
// injection من server.js وقت التسجيل فقط:
//
//   getDbConfig: () => dbConfig   → دالة بترجّع إعدادات الاتصال الحالية
//   createPool / getSql          → نفس الدوال الموجودة بالفعل في server.js
// ═══════════════════════════════════════════════════════════════════════════

module.exports = function createFeatureActivationRouter({
  getDbConfig,
  createPool,
  getSql,
}) {
  if (typeof getDbConfig !== "function") {
    throw new Error("feature-activation-routes: getDbConfig يجب أن تكون دالة");
  }
  if (typeof createPool !== "function" || typeof getSql !== "function") {
    throw new Error("feature-activation-routes: createPool و getSql مطلوبين");
  }

  const router = express.Router();

  function connectionInfo(dbConfig) {
    if (dbConfig.type === "localdb") {
      const values = Object.fromEntries(
        String(dbConfig.connectionString)
          .split(";")
          .filter(Boolean)
          .map((part) => part.split(/=(.*)/s).map((value) => value.trim())),
      );
      return {
        server: values.Server || "",
        database: values.Database || "",
        username: values.UID || "Windows Authentication",
      };
    }

    return {
      server: dbConfig.config.server || "",
      database: dbConfig.config.database || "",
      username: dbConfig.config.user || "Windows Authentication",
    };
  }

  // ── Helper: يفتح pool، ينفّذ handler، يقفل الـ pool دايمًا ──────────────
  async function withPool(res, handler) {
    const dbConfig = getDbConfig();

    if (!dbConfig) {
      return res
        .status(400)
        .json({ success: false, message: "قاعدة البيانات غير متصلة" });
    }

    let pool;
    try {
      const sql = getSql(dbConfig);
      pool = await createPool(dbConfig);
      await handler(pool, sql, dbConfig);
    } catch (err) {
      res.status(500).json({
        success: false,
        message: (err && err.message) || "خطأ غير معروف",
      });
    } finally {
      if (pool) {
        try {
          await pool.close();
        } catch (_) {}
      }
    }
  }

  // GET /api/feature-activation/settings
  router.get("/settings", async (req, res) => {
    await withPool(res, async (pool, sql, dbConfig) => {
      const settings = await service.getAllSettings(pool, sql);
      res.json({ success: true, settings, connection: connectionInfo(dbConfig) });
    });
  });

  async function saveSettings(req, res) {
    const updates = Array.isArray(req.body && req.body.updates)
      ? req.body.updates
      : [];

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "لا توجد إعدادات لحفظها" });
    }

    await withPool(res, async (pool, sql) => {
      const { applied, settings } = await service.saveSettings(
        pool,
        sql,
        updates,
      );
      res.json({
        success: true,
        message:
          applied.length > 0
            ? "تم حفظ الإعدادات بنجاح"
            : "لا توجد تغييرات لحفظها",
        applied,
        settings,
      });
    });
  }

  // The dashboard uses POST /settings. Keep /save for the existing
  // standalone page without adding a second client-side API call.
  router.post("/settings", express.json(), saveSettings);
  router.post("/save", express.json(), saveSettings);

  // POST /api/feature-activation/reset
  router.post("/reset", express.json(), async (req, res) => {
    await withPool(res, async (pool, sql) => {
      const settings = await service.resetToDefaults(pool, sql);
      res.json({
        success: true,
        message: "تم استرجاع الإعدادات الافتراضية بنجاح",
        settings,
      });
    });
  });

  return router;
};
