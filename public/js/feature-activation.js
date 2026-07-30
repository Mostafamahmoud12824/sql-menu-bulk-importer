"use strict";

(() => {
  const API = "/api/feature-activation/settings";

  // ── Presentation-layer i18n (UI-only) ─────────────────────────────
  // بدون أي تغيير في المنطق: فقط ترجمة النصوص المعروضة.
  const featureTranslations = {
    EnableAdministration: "تفعيل نظام الإدارة",
    EnablePurchases: "تفعيل نظام المشتريات",
    EnableCashBox: "تفعيل الصندوق",
    EnableLoyaltyPoints: "تفعيل نقاط الولاء",
    EnablePOSBarcode: "تفعيل باركود الأصناف",
    EnableWarehouses: "تفعيل المستودعات",
    EnableAccountingEntries: "تفعيل القيود المحاسبية",
    EnableZATCA: "تفعيل الربط مع هيئة الزكاة والضريبة والجمارك",
  };

  let settings = [];
  let values = {};
  let toastTimer;

  const byId = (id) => document.getElementById(id);

  function showToast(message, type = "info") {
    const toast = byId("toast");
    const icon = byId("toastIcon");
    const text = byId("toastMsg");
    const icons = { success: "✓", error: "✕", info: "ℹ" };
    toast.className = `show ${type}`;
    icon.textContent = icons[type] || icons.info;
    text.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
  }

  function applyConnection(connection) {
    byId("featureConnectionServer").value = connection.server || "";
    byId("featureConnectionDatabase").value = connection.database || "";
    byId("featureConnectionUsername").value = connection.username || "";
    byId("featureConnectionPassword").value = "••••••••••••";
  }

  function syncValues() {
    values = Object.fromEntries(
      settings.map((setting) => [setting.SettingKey, setting.SettingValue ? 1 : 0]),
    );
  }

  function changedUpdates() {
    return settings
      .filter((setting) => (setting.SettingValue ? 1 : 0) !== (values[setting.SettingKey] ? 1 : 0))
      .map((setting) => ({ key: setting.SettingKey, value: values[setting.SettingKey] ? 1 : 0 }));
  }

  function updateSaveButton() {
    byId("btnSave").disabled = changedUpdates().length === 0;
  }

  function renderToggles() {
    const container = byId("featureToggleList");
    container.innerHTML = "";

    for (const setting of settings) {
      const value = values[setting.SettingKey] ? 1 : 0;
      const row = document.createElement("div");
      row.className = "feature-row";
      row.innerHTML = `
        <div class="feature-info"><span class="feature-name"></span><span class="feature-key"></span></div>
        <button type="button" class="toggle-switch ${value ? "on" : ""}" data-key="${setting.SettingKey}" role="switch" aria-checked="${value ? "true" : "false"}"><span class="knob"></span></button>
      `;
      row.querySelector(".feature-name").textContent =
        featureTranslations[setting.SettingKey] || setting.SettingName;
      // Keep key intact internally; translate only visible label text.
      row.querySelector(".feature-key").textContent =
        featureTranslations[setting.SettingKey] || setting.SettingKey;
      const toggle = row.querySelector(".toggle-switch");
      toggle.addEventListener("click", () => {
        values[setting.SettingKey] = values[setting.SettingKey] ? 0 : 1;
        toggle.classList.toggle("on", Boolean(values[setting.SettingKey]));
        toggle.setAttribute("aria-checked", values[setting.SettingKey] ? "true" : "false");
        updateSaveButton();
      });
      container.appendChild(row);
    }
  }

  async function loadSettings() {
    byId("featureLoading").hidden = false;
    byId("featureContent").hidden = true;
    byId("featureError").hidden = true;
    try {
      const response = await fetch(API);
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to load feature settings");
      settings = payload.settings || [];
      syncValues();
      applyConnection(payload.connection || {});
      renderToggles();
      updateSaveButton();
      byId("featureContent").hidden = false;
    } catch (error) {
      byId("featureError").textContent = error.message;
      byId("featureError").hidden = false;
      showToast(error.message, "error");
    } finally {
      byId("featureLoading").hidden = true;
    }
  }

  async function saveSettings() {
    const updates = changedUpdates();
    if (updates.length === 0) return;
    const button = byId("btnSave");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "Unable to save feature settings");
      settings = payload.settings || settings;
      syncValues();
      renderToggles();
      showToast("Feature settings saved", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.textContent = "Save";
      updateSaveButton();
    }
  }

  window.FeatureActivationDashboard = {
    _destroyed: true,
    init() {
      if (!this._destroyed) return;
      byId("btnSave").addEventListener("click", saveSettings);
      this._destroyed = false;
      loadSettings();
    },
    destroy() {
      byId("featureActivationSection").innerHTML = "";
      this._destroyed = true;
    },
  };
})();
