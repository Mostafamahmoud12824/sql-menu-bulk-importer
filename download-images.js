// =========================================
// RGB AUTO IMAGE DOWNLOADER + RESIZER v3
// مصادر: DuckDuckGo → Unsplash → Pixabay
// البحث: عربي أولاً ← إنجليزي
// FIX: Promise.allSettled → مش بيوقف لو فيه error
// =========================================

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const sharp = require("sharp");
const axios = require("axios");

// =========================================
// SETTINGS
// =========================================
const OUTPUT_FOLDER = path.join(__dirname, "optimized");
const PLACEHOLDER_PATH = path.join(__dirname, "placeholder.jpg");
const WIDTH = 150;
const HEIGHT = 150;
const QUALITY = 25;
const PARALLEL = 5;

if (!fs.existsSync(OUTPUT_FOLDER)) {
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// =========================================
// USER AGENTS
// =========================================
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
];
const randomUA = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// =========================================
// DOWNLOAD BUFFER
// =========================================
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(
      url,
      {
        headers: {
          "User-Agent": randomUA(),
          Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.google.com/",
        },
        timeout: 10000,
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302)
          return downloadBuffer(res.headers.location)
            .then(resolve)
            .catch(reject);
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// =========================================
// تنظيف الاسم — شيل كلمات الحجم
// =========================================
const SIZE_AR = [
  "صغير",
  "وسط",
  "كبير",
  "صغيرة",
  "وسطية",
  "كبيرة",
  "متوسط",
  "خاص",
];
const SIZE_EN = [
  "small",
  "medium",
  "large",
  "big",
  "mini",
  "regular",
  "special",
];

function cleanQuery(name) {
  if (!name) return "";
  let q = name.trim();
  for (const w of SIZE_AR)
    q = q.replace(new RegExp(`(^${w}\\s+|\\s+${w}$)`, "gi"), "").trim();
  for (const w of SIZE_EN)
    q = q.replace(new RegExp(`(^${w}\\s+|\\s+${w}$)`, "gi"), "").trim();
  return q || name.trim();
}

// =========================================
// SOURCE 1: DuckDuckGo Images
// =========================================
async function searchDuckDuckGo(query) {
  // خطوة 1: جيب vqd token
  const initRes = await axios.get(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    {
      timeout: 8000,
      headers: {
        "User-Agent": randomUA(),
        Accept: "text/html",
        "Accept-Language": "ar,en;q=0.9",
      },
    },
  );

  const vqdMatch = initRes.data.match(/vqd=["']?([\d-]+)["']?/);
  if (!vqdMatch) return null;

  // خطوة 2: API الصور
  const imgRes = await axios.get("https://duckduckgo.com/i.js", {
    timeout: 8000,
    params: {
      l: "ar-ar",
      o: "json",
      q: query,
      vqd: vqdMatch[1],
      f: ",,,,,",
      p: "1",
    },
    headers: {
      "User-Agent": randomUA(),
      Referer: "https://duckduckgo.com/",
      Accept: "application/json",
    },
  });

  const results = imgRes.data?.results;
  if (!results || results.length === 0) return null;

  for (const r of results.slice(0, 5)) {
    if (r.image && /\.(jpg|jpeg|png|webp)/i.test(r.image)) return r.image;
  }
  return null;
}

// =========================================
// SOURCE 2: Unsplash
// =========================================
async function searchUnsplash(query) {
  const res = await axios.get(
    `https://unsplash.com/s/photos/${encodeURIComponent(query)}`,
    {
      timeout: 8000,
      headers: {
        "User-Agent": randomUA(),
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
  );
  const matches = [
    ...res.data.matchAll(/https:\/\/images\.unsplash\.com\/photo-[^"?]+/g),
  ];
  if (!matches.length) return null;
  return `${matches[0][0]}?w=300&q=60&fit=crop&crop=center`;
}

// =========================================
// SOURCE 3: Pixabay
// =========================================
async function searchPixabay(query) {
  const res = await axios.get(
    `https://pixabay.com/images/search/${encodeURIComponent(query)}/`,
    {
      timeout: 8000,
      headers: {
        "User-Agent": randomUA(),
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
  );
  const matches = [
    ...res.data.matchAll(
      /https:\/\/cdn\.pixabay\.com\/photo\/[^"]+_\d+\.(jpg|png|webp)/g,
    ),
  ];
  return matches.length ? matches[0][0] : null;
}

// =========================================
// MAIN SEARCH — عربي أولاً ثم إنجليزي
// =========================================
const SOURCES = [
  { name: "DuckDuckGo", fn: searchDuckDuckGo },
  { name: "Unsplash", fn: searchUnsplash },
  { name: "Pixabay", fn: searchPixabay },
];

async function findImage(nameAR, nameEN) {
  const queries = [];
  const arQ = cleanQuery(nameAR);
  const enQ = cleanQuery(nameEN);
  if (arQ) queries.push(arQ); // عربي أولاً
  if (enQ) queries.push(enQ); // إنجليزي تاني

  for (const query of queries) {
    for (const src of SOURCES) {
      try {
        const url = await src.fn(query);
        if (url) return { url, source: src.name, query };
      } catch (_) {
        /* تجاهل والمصدر التالي */
      }
      await delay(80);
    }
  }
  return null;
}

// =========================================
// PROCESS SINGLE PRODUCT
// كل الأخطاء محجوزة جوه — مش بترتفع للـ batch
// =========================================
async function processProduct(product, globalIndex, total, sendProgress) {
  const { itid, nameAR, nameEN } = product;
  const outputPath = path.join(OUTPUT_FOLDER, `${itid}.jpg`);

  try {
    // تخطي لو الصورة موجودة وحجمها معقول
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 500) {
      sendProgress({
        type: "progress",
        current: globalIndex,
        total,
        itid,
        name: nameAR || nameEN,
        status: "skipped",
      });
      return;
    }

    if (!nameAR && !nameEN) {
      usePlaceholder(outputPath);
      sendProgress({
        type: "progress",
        current: globalIndex,
        total,
        itid,
        name: `itid:${itid}`,
        status: "error",
        error: "اسم فارغ",
      });
      return;
    }

    // ──── بحث الصورة ────
    const result = await findImage(nameAR, nameEN);

    if (!result) {
      usePlaceholder(outputPath);
      sendProgress({
        type: "progress",
        current: globalIndex,
        total,
        itid,
        name: nameAR || nameEN,
        status: "error",
        error: "لا توجد نتائج",
      });
      return;
    }

    // ──── تحميل الصورة ────
    const buf = await downloadBuffer(result.url);
    if (!buf || buf.length < 500) throw new Error("الصورة فارغة");

    // ──── ضغط وحفظ ────
    await sharp(buf, { failOn: "none" })
      .resize(WIDTH, HEIGHT, { fit: "cover" })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(outputPath);

    sendProgress({
      type: "progress",
      current: globalIndex,
      total,
      itid,
      name: nameAR || nameEN,
      status: "done",
      source: result.source,
    });
  } catch (err) {
    // ──── أي خطأ غير متوقع — placeholder وكمّل ────
    try {
      usePlaceholder(outputPath);
    } catch (_) {}
    sendProgress({
      type: "progress",
      current: globalIndex,
      total,
      itid,
      name: nameAR || nameEN,
      status: "error",
      error: err.message || "خطأ غير معروف",
    });
  }
}

// =========================================
// HELPER
// =========================================
function usePlaceholder(dest) {
  if (fs.existsSync(PLACEHOLDER_PATH)) {
    try {
      fs.copyFileSync(PLACEHOLDER_PATH, dest);
    } catch (_) {}
  }
}

// =========================================
// PARALLEL BATCH — allSettled مش all
// الفرق: Promise.all بيوقف لو واحد fail
//        Promise.allSettled بيكمل الكل دايماً
// =========================================
async function processBatch(items, sendProgress) {
  await Promise.allSettled(
    items.map(({ product, globalIndex, total }) =>
      processProduct(product, globalIndex, total, sendProgress),
    ),
  );
}

// =========================================
// MAIN — يُستدعى من server.js
// =========================================
async function startDownload(products, fromIndex, total, sendProgress) {
  sendProgress({
    type: "log",
    message: `🖼️ بدء تحميل ${products.length} صورة (${PARALLEL} بالتوازي) — DDG → Unsplash → Pixabay`,
  });

  for (let i = 0; i < products.length; i += PARALLEL) {
    const batch = products.slice(i, i + PARALLEL).map((product, j) => ({
      product,
      globalIndex: fromIndex + i + j + 1,
      total,
    }));

    try {
      await processBatch(batch, sendProgress);
    } catch (batchErr) {
      // حتى لو الـ batch نفسه throw — كمّل
      sendProgress({
        type: "log",
        message: `⚠️ batch error: ${batchErr.message}`,
      });
    }

    // تأخير خفيف بين الـ batches
    if (i + PARALLEL < products.length) await delay(300);
  }

  sendProgress({ type: "done", total, outputFolder: OUTPUT_FOLDER });
}

module.exports = { startDownload };
