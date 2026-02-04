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
