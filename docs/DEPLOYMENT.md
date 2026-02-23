# النشر والإعداد — عجلة الولاء

## متطلبات البيئة

- **Node.js** (إصدار 18 أو أحدث موصى به)
- **npm** (مع حزمة المشروع)
- **Firebase CLI** (للنشر على Firebase): `npm install -g firebase-tools`

## ضبط Firebase

### قواعد Firestore
- بعد تعديل `firestore.rules` في الجذر: `firebase deploy --only firestore`
- الكتابة حالياً مفتوحة للإنتاج المحدود؛ لتفعيل الحماية راجع التعليقات في أعلى الملف.

### Cloud Functions (1st gen — Node 22)
- **كود الأدمن:** يُضبط عبر **Firebase Console → Functions → Environment variables** بإضافة `ADMIN_CODE`، أو من الطرفية: `firebase functions:config:set admin.code="كودك"` ثم إعادة نشر الدوال. الكود يقرأ من `process.env.ADMIN_CODE` أو `functions.config().admin.code`.
- **ملف `functions/.env`:** لا يُرفع مع النشر؛ استخدمه للمحاكي المحلي فقط. للإنتاج استخدم لوحة Firebase أو `functions:config:set`.
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

1. **ملف `.env` في جذر المشروع**  
   الملف موجود ومُعبَّأ فيه `VITE_FIREBASE_PROJECT_ID` من مشروعك. افتح `.env` وأضف من **Firebase Console → Project Settings → General → Your apps (Web app)**:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`  
   ثم ضع **كود دخول لوحة التحكم** في `VITE_ADMIN_CODE=` (نفس الكود الذي ستضبطه على السيرفر في الخطوة 2).

2. **كود الأدمن على السيرفر (Cloud Functions)**  
   في **Firebase Console → Project → Functions → Environment variables (1st Gen)** أضف متغيراً:
   - الاسم: `ADMIN_CODE`
   - القيمة: كود الدخول الذي اخترته (نفس قيمة `VITE_ADMIN_CODE` في `.env`).  
   أو من الطرفية:  
   `firebase functions:config:set admin.code="كودك"`  
   ثم أعد نشر الدوال: `firebase deploy --only functions`.

3. بعد ذلك أي نشر = تشغيل **`deploy.bat`** فقط.

## ضبط بيئة الدوال (ملخص حسب وثائق Firebase)
- **مَعلمات (params):** مناسبة لـ 2nd gen، تُتحقق عند النشر، وتمنع النشر إن لم تُضبط القيم. نستخدم حالياً 1st gen فلا نستخدم params.
- **متغيرات البيئة (.env):** نضع في `functions/.env` المفاتيح المطلوبة (مثل `ADMIN_CODE=...`). يُحمَّل الملف عند النشر. لمعلومات حسّاسة يُفضّل Secret Manager.
- **أسرار (Secret Manager):** `firebase functions:secrets:set SECRET_NAME` ثم ربط السر بالدالة في الكود. للانتقال من `functions.config()` يُنصح بـ `firebase functions:config:export` ثم استخدام `defineJsonSecret` في 2nd gen.

## اختبار E2E (اختياري قبل النشر)

- شغّل `npm run test:e2e` — يتطلب عدم تشغيل سيرفر التطوير على المنفذ 5174 (أو إيقافه قبل التشغيل).
- إن لم تشغّل E2E، `npm run check` يضمن نجاح البناء واختبارات الوحدة.
