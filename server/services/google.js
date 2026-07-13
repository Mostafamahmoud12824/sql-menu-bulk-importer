const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const puppeteer = require("puppeteer");
const sharp = require("sharp");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ===== الإعدادات =====
const IMAGE_SIZE = 255; // مقاس الصورة النهائي (مربع)
const OUTPUT_DIR = path.join(__dirname, "Google_images");
const NAV_TIMEOUT = 4000;
const WAIT_AFTER_LOAD = 300; // وقت انتظار بعد فتح صفحة نتائج البحث
const WAIT_AFTER_CLICK = 300; // وقت انتظار بعد الضغط على الصورة لفتح المعاينة

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

// ===== كشف صفحة تحقق captcha/"لست برنامج روبوت" من جوجل =====
async function isCaptchaPage(page) {
  return page.evaluate(() => {
    const bodyText = document.body ? document.body.innerText || "" : "";
    const hasCaptchaText =
      bodyText.includes("unusual traffic") ||
      bodyText.includes("not a robot") ||
      bodyText.includes("نشاط غير معتاد");

    const hasCaptchaFrame = !!document.querySelector(
      'iframe[src*="recaptcha"], iframe[title*="recaptcha"], #captcha-form, form[action*="sorry"]',
    );

    return hasCaptchaText || hasCaptchaFrame;
  });
}

// ===== جلب أفضل صورة (الأعلى دقة) عن طريق رصد الصور اللي تتحمل طبيعيًا في الصفحة =====
async function getBestImageBuffer(page, productName) {
  const candidates = []; // { buffer, size }

  const onResponse = async (response) => {
    try {
      const request = response.request();
      if (request.resourceType() !== "image") return;

      const url = response.url();
      if (
        url.includes("gstatic") ||
        url.includes("googlelogo") ||
        url.includes("encrypted-tbn")
      ) {
        return;
      }

      const status = response.status();
      if (status < 200 || status >= 300) return;

      const buffer = await response.buffer();
      if (!buffer || buffer.length < 5000) return; // استبعاد الأيقونات/الثمبنيلز الصغيرة جدًا

      candidates.push({ buffer, size: buffer.length, url });
    } catch (err) {
      // تجاهل أي response فشلت قراءته (ممكن تكون اتقفلت الصفحة قبلها)
    }
  };

  // منع فتح أي تاب/نافذة جديدة نهائيًا — أي popup ناتج عن هذه الصفحة يتقفل فورًا
  // وده بيضمن إن كل البحث والتنزيل يحصل جوه نفس "page" بدون أي تاب تاني
  const onPopup = async (popup) => {
    if (!popup) return;
    try {
      await popup.close();
    } catch (err) {
      // تجاهل
    }
  };

  page.on("response", onResponse);
  page.on("popup", onPopup);

  try {
    await page.goto(
      `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(productName)}`,
      {
        waitUntil: "networkidle2",
        timeout: NAV_TIMEOUT,
      },
    );

    await sleep(WAIT_AFTER_LOAD);

    // فحص لو جوجل عرض صفحة تحقق captcha بدل نتائج البحث الفعلية
    const captchaDetected = await isCaptchaPage(page);
    if (captchaDetected) {
      throw new Error(
        "CAPTCHA_DETECTED: جوجل طلب تحقق أمني — يُفضّل إيقاف السكربت والانتظار قبل إعادة المحاولة",
      );
    }

    // تعطيل window.open وإزالة target="_blank" من كل اللينكات
    // عشان نضمن 100% إن أي تفاعل في الصفحة (زي الضغط على الصورة) مش هيفتح تاب/نافذة جديدة
    await page.evaluate(() => {
      window.open = () => null;
      document.querySelectorAll('a[target="_blank"]').forEach((a) => {
        a.removeAttribute("target");
      });
    });

    // الضغط على أول نتيجة صورة حقيقية لفتح بانل المعاينة (overlay جوه نفس الصفحة)
    // ده بيخلي المتصفح يطلب نسخة أعلى دقة من الصورة فتتسجل في onResponse
    // ملاحظة: middle-click أو ctrl+click هما اللي بيفتحوا تاب جديد، الـ click العادي بيفتح overlay فقط
    await page.evaluate(() => {
      const thumbs = [
        ...document.querySelectorAll("img.YQ4gaf, img.Q4LuWd, img.rg_i"),
      ];
      for (const thumb of thumbs) {
        const rect = thumb.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // نضغط على العنصر الأب القابل للنقر (الرابط) بدل الـ img نفسها لتفادي سلوكيات غير متوقعة
          const clickable = thumb.closest("a") || thumb;
          clickable.click();
          return true;
        }
      }
      return false;
    });

    await sleep(WAIT_AFTER_CLICK);
  } finally {
    page.off("response", onResponse);
    page.off("popup", onPopup);
  }

  if (candidates.length === 0) {
    throw new Error("لم يتم رصد أي صورة صالحة أثناء تحميل الصفحة");
  }

  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]; // { buffer, size, url }
}

// ===== ضغط الصورة وحفظها بالمقاس المطلوب =====
async function processAndSaveImage(buffer, outputPath) {
  await sharp(buffer)
    .resize(IMAGE_SIZE, IMAGE_SIZE, {
      fit: "cover",
    })
    .jpeg({
      quality: 90,
    })
    .toFile(outputPath);
}

// ===== معالجة منتج واحد (تستخدم نفس الصفحة المُمرّرة) =====
// onEvent: هوك اختياري إضافي (بيتنادى جنب الـ console.log الأصلي، مبيغيّرش أي سلوك حالي)
async function processProduct(page, product, imageNumber, total, outputDir, onEvent) {
  const productName =
    product.product_name || product.name || Object.values(product)[0];

  if (!productName) {
    return { ok: true, skipped: true };
  }

  console.log(`[${imageNumber}/${total}] ${productName} - بدء`);
  if (onEvent)
    onEvent({
      type: "progress",
      status: "start",
      current: imageNumber,
      total,
      productName,
    });

  const fileName = `${imageNumber}.jpg`;

  try {
    const found = await getBestImageBuffer(page, productName);
    const { buffer, url: imageUrl } = found;

    const outputPath = path.join(outputDir, fileName);
    await processAndSaveImage(buffer, outputPath);

    // حجم الملف الفعلي بعد الضغط (بالكيلوبايت) — يُقرأ من الملف المحفوظ فعليًا على القرص
    let fileSizeKB = "";
    try {
      const stats = fs.statSync(outputPath);
      fileSizeKB = Math.round((stats.size / 1024) * 10) / 10;
    } catch (_) {}

    console.log(`✅ [${imageNumber}/${total}] ${productName} -> ${fileName}`);
    // ملاحظة: حدث "done" النهائي لهذا المنتج بيتبعت مرة واحدة بس من runGoogleDownload
    // (جنب عداد downloaded/failed/remaining) — منعًا لتكرار نفس السطر في اللوج.
    return {
      ok: true,
      fileName,
      productName,
      imageNumber,
      imageUrl,
      fileSizeKB,
    };
  } catch (error) {
    console.log(
      `❌ [${imageNumber}/${total}] ${productName} - ${error.message}`,
    );

    if (error.message.startsWith("CAPTCHA_DETECTED")) {
      return { ok: false, captcha: true, productName };
    }

    // ملاحظة: حدث "error" النهائي بيتبعت من runGoogleDownload (زي "done" بالظبط)
    return { ok: false, productName, error: error.message };
  }
}

// ===== انتظار عشوائي بين المنتجات (يقلل من احتمالية رصد جوجل للسكربت كبوت) =====
function randomDelay(minMs, maxMs) {
  return minMs + Math.random() * (maxMs - minMs);
}

// =========================================
// runGoogleDownload — النواة القابلة لإعادة الاستخدام
// بتُستخدم من الـ CLI (تحت) ومن السيرفر (server.js) على حدٍ سواء.
//
// options:
//   products   : Array<{product_name?, name?}>  (مطلوب)
//   outputDir  : مسار مجلد حفظ الصور (افتراضي: Google_images بجانب الملف)
//   headless   : true/false لتشغيل كروم بدون واجهة (افتراضي: false — نفس سلوك الـ CLI الأصلي)
//   writeReports: هل يكتب googlereport.xlsx + failed_report.txt (افتراضي: true)
//   sheetName  : اسم الشيت في تقرير الإكسل الناتج (افتراضي: "Sheet1")
//   onEvent(event): هوك اختياري لأي حدث تقدّم/لوج (يُستخدم بالسيرفر لبث SSE)
// =========================================
async function runGoogleDownload(options = {}) {
  const {
    products = [],
    outputDir = OUTPUT_DIR,
    headless = false,
    writeReports = true,
    sheetName = "Sheet1",
    onEvent = null,
  } = options;

  const emit = (evt) => {
    if (typeof onEvent === "function") {
      try {
        onEvent(evt);
      } catch (_) {}
    }
  };

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`تم العثور على ${products.length} منتج`);
  console.log("الوضع: تسلسلي (صفحة واحدة)");
  emit({ type: "total", total: products.length });
  emit({ type: "log", message: `تم العثور على ${products.length} منتج` });

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: headless ? { width: 1600, height: 1000 } : null,
    args: [
      ...(headless ? [] : ["--start-maximized"]),
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);

  // نسخة من بيانات المنتجات سيُضاف لها عمود اسم ملف الصورة (للنجاح) أو يُترك فاضي (للفشل)
  const googlereportRows = [];
  const failedProductNames = [];

  let stoppedByCaptcha = false;
  let downloadedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < products.length; index++) {
    const product = products[index];
    const result = await processProduct(
      page,
      product,
      index + 1,
      products.length,
      outputDir,
      emit,
    );

    const fileName = result && result.ok && result.fileName ? result.fileName : "";
    if (fileName) downloadedCount++;
    else if (!(result && result.skipped)) failedCount++;

    googlereportRows.push({
      ...product,
      // رقم الصورة (نفس الترتيب في الملف، ونفس اسم ملف الصورة بدون امتداد)
      image_number: fileName ? index + 1 : "",
      // اسم ملف الصورة كما تم حفظه فعليًا داخل Google_images/
      image_file: fileName,
      // رابط الصورة الأصلي كما تم تحميله من جوجل
      image_link: result && result.ok ? result.imageUrl || "" : "",
      // حجم الصورة بعد الضغط (كيلوبايت)
      image_size_kb:
        result && result.ok && typeof result.fileSizeKB === "number"
          ? result.fileSizeKB
          : "",
    });

    if (result && !result.ok && result.productName) {
      failedProductNames.push(result.productName);
    }

    emit({
      type: "progress",
      current: index + 1,
      total: products.length,
      downloaded: downloadedCount,
      failed: failedCount,
      remaining: products.length - (index + 1),
      productName: result ? result.productName : undefined,
      status: result && result.ok ? (fileName ? "done" : "skipped") : "error",
      imageUrl: result && result.ok ? result.imageUrl : undefined,
      fileSizeKB: result && result.ok ? result.fileSizeKB : undefined,
    });

    if (result && result.captcha) {
      stoppedByCaptcha = true;
      console.log(
        "\n⚠️ تم رصد صفحة تحقق (captcha) من جوجل. تم إيقاف السكربت لتجنب حفظ صور غير صحيحة.",
      );
      console.log(
        "انتظر بضع دقائق (أو غيّر الـ IP)، ثم أعد تشغيل السكربت بدءًا من المنتج الحالي.",
      );
      emit({
        type: "log",
        message: "⚠️ تم رصد صفحة تحقق (captcha) من جوجل — تم إيقاف التحميل.",
      });
      break;
    }

    // تأخير عشوائي بسيط بين كل منتج والتالي لتقليل احتمالية رصد جوجل للسكربت كبوت
    await sleep(randomDelay(1500, 3000));
  }

  await browser.close();

  if (writeReports) {
    // ===== كتابة ملف الإكسيل الجديد googlereport.xlsx مع عمود image_file =====
    const googlereportSheet = XLSX.utils.json_to_sheet(googlereportRows);
    const googlereportWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      googlereportWorkbook,
      googlereportSheet,
      sheetName,
    );
    XLSX.writeFile(googlereportWorkbook, path.join(outputDir, "..", "googlereport.xlsx"));
    console.log(
      `\n📄 تم إنشاء googlereport.xlsx (${googlereportRows.length} صف)`,
    );

    // ===== كتابة تقرير المنتجات الفاشلة failed_report.txt =====
    const reportLines = [
      `تقرير المنتجات الفاشلة - ${new Date().toLocaleString("ar-EG")}`,
      `عدد المنتجات الفاشلة: ${failedProductNames.length} من ${products.length}`,
      "",
      ...failedProductNames,
    ];
    fs.writeFileSync(
      path.join(outputDir, "..", "failed_report.txt"),
      reportLines.join("\n"),
      "utf-8",
    );
    console.log(
      `📄 تم إنشاء failed_report.txt (${failedProductNames.length} منتج فاشل)`,
    );
  }

  if (stoppedByCaptcha) {
    const remaining = products.length - googlereportRows.length;
    console.log(
      `ملاحظة: تبقّى ${remaining} منتج لم تتم معالجته بسبب التوقف المبكر.`,
    );
  } else {
    console.log("\nتم الانتهاء من تنزيل جميع الصور");
  }

  emit({
    type: "done",
    total: products.length,
    downloaded: downloadedCount,
    failed: failedCount,
    stoppedByCaptcha,
    outputDir,
  });

  return {
    total: products.length,
    downloaded: downloadedCount,
    failed: failedCount,
    stoppedByCaptcha,
    outputDir,
  };
}

module.exports = { runGoogleDownload, OUTPUT_DIR };

// =========================================
// تشغيل مباشر من التيرمينال: node google.js
// نفس السلوك الأصلي بالضبط — بيقرأ products.xlsx من نفس المجلد
// =========================================
if (require.main === module) {
  (async () => {
    const workbook = XLSX.readFile(path.join(__dirname, "products.xlsx"));
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const products = XLSX.utils.sheet_to_json(sheet);

    await runGoogleDownload({
      products,
      outputDir: OUTPUT_DIR,
      headless: false,
      writeReports: true,
      sheetName,
    });
  })();
}