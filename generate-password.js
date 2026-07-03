// أداة لتوليد كلمة مرور مشفّرة (hash) جديدة
//
// طريقة الاستخدام:
//   node generate-password.js "كلمة_المرور_الجديدة"
//
// بعد التشغيل، انسخ القيمة الناتجة وضعها في server.js
// داخل المتغير AUTH_PASSWORD_HASH (بدّل القيمة القديمة بالكامل).

const bcrypt = require("bcryptjs");

const newPassword = process.argv[2];

if (!newPassword) {
  console.log("\n⚠️  من فضلك اكتب كلمة المرور الجديدة بعد اسم الملف:");
  console.log('   node generate-password.js "MyNewPassword123"\n');
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 10);

console.log("\n✅ تم توليد الـ hash بنجاح. انسخ السطر التالي وضعه في server.js:\n");
console.log(`const AUTH_PASSWORD_HASH =\n  "${hash}";\n`);
