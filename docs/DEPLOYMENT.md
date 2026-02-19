# النشر والإعداد — عجلة الولاء

## متطلبات البيئة

- **Node.js** (إصدار 18 أو أحدث موصى به)
- **npm** (مع حزمة المشروع)
- **Firebase CLI** (للنشر على Firebase): `npm install -g firebase-tools`

## ضبط Firebase

### قواعد Firestore
- بعد تعديل `firestore.rules` في الجذر: `firebase deploy --only firestore`
- الكتابة حالياً مفتوحة للإنتاج المحدود؛ لتفعيل الحماية راجع التعليقات في أعلى الملف.

### Cloud Functions
- كود الأدمن على السيرفر: ضبط المتغير `ADMIN_CODE` في بيئة الـ Functions (Firebase Console → Functions → Environment variables، أو `firebase functions:config:set admin.code="كودك"`).
- إعادة نشر الـ Functions بعد تغيير الإعداد: `firebase deploy --only functions`

### متغيرات الويب (VITE_*)
- انسخ `.env.example` إلى `.env` واملأ القيم من Firebase Console:
  - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, وغيرها حسب الملف.
  - `VITE_ADMIN_CODE` — يُستخدم للتحقق المحلي عند عدم توفر Firebase أو عند الاختبار.

## كاش PWA (Service Worker)

- بعد تنفيذ خطة الاستكمال، `CACHE_NAME` في `public/sw.js` يُحدَّث تلقائياً من إصدار التطبيق عند كل `npm run build`، فلا حاجة لتعديله يدوياً عند النشر.

## التحقق والنشر (بدون خطوات يدوية إضافية)

- **للتحقق فقط (بناء + اختبارات وحدة):** شغّل `npm run check` — ينفّذ البناء والاختبارات معاً؛ إن فشل أحدهما يتوقف.
- **للنشر الكامل (تحقق + رفع GitHub + Firebase):** شغّل `deploy.bat` (ويندوز) — ينفّذ تلقائياً: `npm run check` ثم `git push` ثم `firebase deploy`. لا حاجة لتشغيل أوامر منفصلة.

## إعداد لمرة واحدة (قبل أول نشر)

1. انسخ `.env.example` إلى `.env` واملأ قيم Firebase و `VITE_ADMIN_CODE`.
2. ضبط كود الأدمن على السيرفر: Firebase Console → Functions → Environment variables → `ADMIN_CODE` (أو `firebase functions:config:set admin.code="كودك"` ثم `firebase deploy --only functions`).
3. بعدها أي نشر لاحق = تشغيل `deploy.bat` فقط (أو `npm run check` ثم `firebase deploy` يدوياً إن رغبت).

## اختبار E2E (اختياري قبل النشر)

- شغّل `npm run test:e2e` — يتطلب عدم تشغيل سيرفر التطوير على المنفذ 5174 (أو إيقافه قبل التشغيل).
- إن لم تشغّل E2E، `npm run check` يضمن نجاح البناء واختبارات الوحدة.
