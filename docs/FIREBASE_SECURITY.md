# أمان Firebase — تم ضبط كل شيء من الكود

## ✅ اللي مُضبوط من هنا
- **Web Config** في `.env` (API Key، projectId، إلخ) — لا تحتاج تعدل شيء.
- **قواعد Firestore** في `firestore.rules` (قراءة/كتابة للمجموعات المستخدمة).
- **إعداد Firebase للمشروع:** `firebase.json` + `.firebaserc` (مشروع `elite-vip-36dd8`).
- رفع القواعد: من جذر المشروع: `npx firebase deploy --only firestore` (لو عندك Firebase CLI).

## ⛔ ممنوع
- **Service Account JSON** (اللي فيه `private_key`) لا يدخل المشروع ولا الفرونت أبداً — للسيرفر فقط.

## لو التطبيق ما اتصلش بقاعدة البيانات
- من **Firebase Console** → مشروع elite-vip-36dd8: تأكد أن **Firestore Database** و **Storage** مفعّلين (مرة واحدة من الواجهة).

لا يطلب منك أي إعداد إضافي؛ البيانات اللي أرسلتها كافية والكود مضبوط عليها.

## تحقق الأدمن عبر السيرفر

- **Cloud Function `validateAdminToken`:** تتحقق من كود الدخول على السيرفر (لا يُخزَّن في الفرونت).
- **تفعيل:** ضبط `ADMIN_CODE` في متغيرات بيئة Cloud Functions (Firebase Console → Functions → Environment variables)، أو `firebase functions:config:set admin.code="كودك"`.

## قواعد الكتابة مع Firebase Authentication

- حالياً `canWrite()` في firestore.rules ترجع `isAuthenticated() || true` — أي الكتابة مفتوحة للجميع.
- **لتفعيل تقييد الكتابة:**
  1. فعّل Firebase Authentication (Email/Password أو طرق أخرى) من Firebase Console.
  2. عدّل `firestore.rules`: في دالة `canWrite()` احذف `|| true` بحيث تصبح `return isAuthenticated();`
  3. نفّذ `npx firebase deploy --only firestore`
- بعد التفعيل، كل الكتابة من الفرونت تحتاج مستخدماً مسجّلاً دخوله عبر Firebase Auth. تأكد أن لوحة الأدمن تستخدم تسجيل الدخول عبر Auth قبل الانتقال لهذه الخطوة.
