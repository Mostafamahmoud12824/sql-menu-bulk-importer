// =========================================
// RGB AUTO IMAGE DOWNLOADER + RESIZER v3
// مصادر: Google → Bing → Yandex → DDG → Pexels → Unsplash → Pixabay
// البحث: عربي أولاً ← إنجليزي (أو Transliteration)
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
  // شيل أي حروف خاصة — خلّي بس عربي وإنجليزي وأرقام ومسافات
  q = q.replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  return q || name.trim();
}

// =========================================
// TRANSLITERATION — عربي → إنجليزي تقريبي
// يُستخدم لو nameEN فاضي
// =========================================
const AR_MAP = {
  'ا':'a','أ':'a','إ':'i','آ':'aa','ب':'b','ت':'t','ث':'th','ج':'j',
  'ح':'h','خ':'kh','د':'d','ذ':'th','ر':'r','ز':'z','س':'s','ش':'sh',
  'ص':'s','ض':'d','ط':'t','ظ':'z','ع':'a','غ':'gh','ف':'f','ق':'q',
  'ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y','ى':'a',
  'ة':'a','ء':'','ئ':'y','ؤ':'w','لا':'la',
};

function transliterate(ar) {
  if (!ar) return "";
  // ال → al
  let result = ar.replace(/ال/g, "al-");
  result = result
    .split("")
    .map((c) => (AR_MAP[c] !== undefined ? AR_MAP[c] : c))
    .join("")
    .replace(/[^\w\s-]/g, "")   // شيل أي حروف خاصة فاضلة
    .replace(/\s+/g, " ")
    .trim();
  return result;
}

// =========================================
// SOURCE 0: Google Images (الأولوية الأعلى)
// بيجيب الـ URLs الحقيقية من الـ HTML المضمّن في الصفحة
// =========================================
async function searchGoogleImages(query) {
  const searchUrl =
    `https://www.google.com/search?q=${encodeURIComponent(query)}` +
    `&tbm=isch&hl=ar&safe=off&num=10&source=lnms`;

  const res = await axios.get(searchUrl, {
    timeout: 12000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Referer: "https://www.google.com/",
      Cookie: "CONSENT=YES+cb.20220301-17-p0.ar+FX+1; SOCS=CAI",
    },
    decompress: true,
  });

  const html = res.data;

  // طريقة 1: URLs كاملة مدفونة في الـ JSON اللي بيحطه Google في الصفحة
  // بيظهر كـ ["https://example.com/img.jpg",600,400]
  const jsonPattern =
    /\["(https?:\/\/(?!encrypted-tbn)[^"\\]+\.(?:jpg|jpeg|png|webp)[^"\\]*)"\s*,\s*\d+\s*,\s*\d+\]/g;
  const jsonMatches = [...html.matchAll(jsonPattern)];

  for (const m of jsonMatches) {
    const url = m[1];
    if (
      url &&
      !url.includes("google.com") &&
      !url.includes("gstatic.com") &&
      url.length < 500
    ) {
      return url;
    }
  }

  // طريقة 2: أي URL صورة خارجية (fallback)
  const rawPattern =
    /"(https?:\/\/(?!(?:www\.google|encrypted-tbn|gstatic))[^"\\]{10,300}\.(?:jpg|jpeg|png|webp))"/g;
  const rawMatches = [...html.matchAll(rawPattern)];

  for (const m of rawMatches) {
    const url = m[1];
    if (url && !url.includes("google") && !url.includes("gstatic")) {
      return url;
    }
  }

  return null;
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
// SOURCE 2: Bing Images
// بيستخرج الـ URLs من حقل "murl" في الـ HTML
// =========================================
async function searchBingImages(query) {
  const res = await axios.get(
    `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&tsc=ImageHoverTitle`,
    {
      timeout: 10000,
      headers: {
        "User-Agent": randomUA(),
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        Referer: "https://www.bing.com/",
        // Cookie بتخلي Bing يديك نتايج مش مفلترة
        Cookie: "SRCHHPGUSR=ADLT=DEMOTE&nrslt=50; _EDGE_S=F=1&SID=0; MUID=1A2B3C4D5E6F",
      },
      decompress: true,
    },
  );

  const html = res.data;

  // Bing بيخزن الـ URL الحقيقي في "murl":"https://..."
  const murlMatches = [
    ...html.matchAll(/"murl"\s*:\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/g),
  ];
  for (const m of murlMatches) {
    const url = m[1];
    if (url && !url.includes("bing.com") && !url.includes("msecnd")) return url;
  }

  // Fallback: أي image URL خارجي في الصفحة
  const fallback = [
    ...html.matchAll(/"(https?:\/\/(?!www\.bing)[^"\\]{10,300}\.(?:jpg|jpeg|png|webp))"/g),
  ];
  for (const m of fallback) {
    if (!m[1].includes("bing") && !m[1].includes("msn")) return m[1];
  }

  return null;
}

// =========================================
// SOURCE 3: Yandex Images
// كويس جداً للمحتوى العربي والأكل
// =========================================
async function searchYandexImages(query) {
  const res = await axios.get(
    `https://yandex.com/images/search?text=${encodeURIComponent(query)}&itype=jpg&isize=medium`,
    {
      timeout: 12000,
      headers: {
        "User-Agent": randomUA(),
        Accept: "text/html,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.9",
        Referer: "https://yandex.com/",
      },
      decompress: true,
    },
  );

  const html = res.data;

  // Yandex بيحط الصور في JSON بالشكل ده: "url":"https://..."
  const patterns = [
    /"origUrl"\s*:\s*"(https?:\/\/[^"\\]+\.(?:jpg|jpeg|png|webp)[^"\\]*)"/g,
    /"url"\s*:\s*"(https?:\/\/(?!avatars\.mds\.yandex)[^"\\]+\.(?:jpg|jpeg|png|webp)[^"\\]*)"/g,
  ];

  for (const pattern of patterns) {
    const matches = [...html.matchAll(pattern)];
    for (const m of matches) {
      const url = m[1];
      if (url && !url.includes("yandex") && !url.includes("yastatic")) return url;
    }
  }

  return null;
}

// =========================================
// SOURCE 4: Pexels (مجاني بالكامل)
// =========================================
async function searchPexels(query) {
  const res = await axios.get(
    `https://www.pexels.com/search/${encodeURIComponent(query)}/`,
    {
      timeout: 10000,
      headers: {
        "User-Agent": randomUA(),
        Accept: "text/html,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.9",
        Referer: "https://www.pexels.com/",
      },
      decompress: true,
    },
  );

  const html = res.data;

  // Pexels بيحط الـ URLs في data-big-src أو srcset
  const patterns = [
    /data-big-src="(https:\/\/images\.pexels\.com\/photos\/[^"?]+)"/g,
    /"src"\s*:\s*"(https:\/\/images\.pexels\.com\/photos\/[^"?]+)"/g,
    /https:\/\/images\.pexels\.com\/photos\/\d+\/[^"?\s]+\.(?:jpg|jpeg|png)/g,
  ];

  for (const pattern of patterns) {
    const matches = [...html.matchAll(pattern)];
    if (matches.length) {
      const url = matches[0][1] || matches[0][0];
      if (url) return `${url.split("?")[0]}?w=300&h=300&fit=crop&crop=center`;
    }
  }

  return null;
}

// =========================================
// MAIN SEARCH — عربي أولاً ثم إنجليزي
// =========================================
const SOURCES = [
  { name: "Google",     fn: searchGoogleImages },
  { name: "Bing",       fn: searchBingImages   },
  { name: "Yandex",     fn: searchYandexImages },
  { name: "DuckDuckGo", fn: searchDuckDuckGo   },
  { name: "Pexels",     fn: searchPexels       },
  { name: "Unsplash",   fn: searchUnsplash     },
  { name: "Pixabay",    fn: searchPixabay      },
];

async function findImage(nameAR, nameEN) {
  const queries = [];
  const arQ = cleanQuery(nameAR);
  const enQ = cleanQuery(nameEN);
  if (arQ) queries.push(arQ);                         // عربي أولاً
  if (enQ) queries.push(enQ);                         // إنجليزي تاني
  else if (arQ) queries.push(transliterate(arQ));     // لو مفيش إنجليزي → حوّل العربي تلقائياً

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
    message: `🖼️ بدء تحميل ${products.length} صورة (${PARALLEL} بالتوازي) — Google → Bing → Yandex → DDG → Pexels → Unsplash → Pixabay`,
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
