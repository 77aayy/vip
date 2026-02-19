# توافق الجوال والتثبيت كتطبيق (PWA)

## أولوية الجوال (Mobile First)

- **Viewport:** `width=device-width`, `viewport-fit=cover` لدعم الشقوق (Notch).
- **Safe area:** استخدام `safe-area-insets` و `safe-area-pb` في الصفحات لتفادي القص خلف الشريط أو الشق.
- **ارتفاع الشاشة:** `min-h-screen-dvh` و `min-h-dvh` لدعم المتصفحات التي تستخدم `dvh` (Dynamic Viewport Height).
- **لمس:** أزرار وعناصر تفاعلية بـ `min-h-[48px]` أو أكثر و `touch-manipulation` لتقليل التأخير.
- **إدخال آمن على الجوال:** حقول النص والهاتف تستخدم `input-mobile-safe` (خط 16px كحد أدنى) لتقليل تكبير iOS التلقائي.
- **منع التحديد:** `-webkit-tap-highlight-color: transparent` لتجربة لمس أنظف.

## التثبيت على الموبايل (PWA)

- **الملف:** `public/manifest.webmanifest` — اسم التطبيق، أيقونات، `display: standalone`, `orientation: portrait-primary`.
- **الرابط في الصفحة:** `index.html` يحتوي على `<link rel="manifest" href="/manifest.webmanifest" />`.
- **أبل:** `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, `apple-mobile-web-app-title`.
- **Service Worker:** `public/sw.js` يُسجَّل في الإنتاج لتفعيل معيار "قابل للتثبيت" في المتصفح.
- **تحديث الكاش:** عند كل إصدار جديد، حدّث `CACHE_NAME` في `public/sw.js` (مثلاً من `loyalty-wheel-v2` إلى `loyalty-wheel-v3`) حتى يُحذف الكاش القديم ويتحمّل المستخدمون أحدث الأصول.

### كيف يثبت المستخدم التطبيق

- **Android (Chrome):** من القائمة → "تثبيت التطبيق" أو "Add to Home screen".
- **iOS (Safari):** مشاركة → "Add to Home Screen".

### أيقونات مُوصى بها لاحقاً

- الملف الحالي `logo-1.png` مستخدم لأيقونة التطبيق. للأفضل: إضافة صور بأبعاد 192×192 و 512×512 وتحديث `manifest.webmanifest` ليشير إليها.
