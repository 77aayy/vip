# Core Web Vitals — توثيق وتحليل

## كيفية تشغيل التحليل

1. بناء المشروع وتشغيل السيرفر المحلي:
   ```bash
   npm run build
   npm run preview
   ```
2. تشغيل Lighthouse على صفحة الضيف (`/`):
   ```bash
   npx lighthouse http://localhost:4173/ --output=json --output-path=./lighthouse-report.json --view
   ```
   أو بدون فتح التقرير:
   ```bash
   npx lighthouse http://localhost:4173/ --output=json --output-path=./lighthouse-report.json --chrome-flags="--headless"
   ```

3. استخراج القيم من التقرير:
   - **LCP** (Largest Contentful Paint): `report.audits['largest-contentful-paint']`
   - **INP** (Interaction to Next Paint، بديل FID): `report.audits['interaction-to-next-paint']`
   - **CLS** (Cumulative Layout Shift): `report.audits['cumulative-layout-shift']`

## النتائج (يُحدَّث بعد كل تشغيل)

| المقياس | القيمة | الهدف |
|---------|--------|-------|
| LCP | — | < 2.5s |
| INP | — | < 200ms |
| CLS | — | < 0.1 |

## اقتراحات التحسين

- **الخطوط:** الرابط الحالي لـ Google Fonts يستخدم `display=swap` — يُفضّل الاحتفاظ به.
- **تأخير الخطوط غير الحرجة:** تحميل عائلات الخطوط الإضافية (IBM Plex، Cairo) بشكل كسول عند الحاجة، أو تقليل الأوزان المحمّلة.
- **أولوية تحميل العجلة:** التأكد من أن مكوّن العجلة وأصولها (صور، أصوات) تُحمّل بأولوية مناسبة — يُمكن استخدام `fetchpriority="high"` على العناصر الحرجة.
- **الـ chunks:** المشروع يفصل Firebase و XLSX في chunks منفصلة — مناسبة للتأخير وتحسين وقت التحميل الأوّل.

## مراجع

- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse](https://developer.chrome.com/docs/lighthouse/)
