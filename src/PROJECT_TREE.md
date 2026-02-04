# شجرة مشروع src — ووظيفة كل مجلد

```
src/
├── App.tsx                    # نقطة الدخول للـ Router (مسارات الضيف / الأدمن)
├── main.tsx                   # تهيئة React + ReactDOM
├── index.css                  # أنماط عامة + Tailwind + أيماكن العجلة
├── vite-env.d.ts              # تعريفات TypeScript لـ Vite
│
├── components/                # مكوّنات واجهة قابلة لإعادة الاستخدام (UI فقط أو UI + منطق عرضي)
│   ├── CheckPhoneStep.tsx     # شاشة "ادخل رقمك" + فورم تسجيل شرطي (اسم/هوية) + ترحيب مقنّع
│   ├── CodeResult.tsx         # شاشة "مبروك جائزتك" + كود + نسخ / واتساب
│   ├── PhoneStep.tsx          # خطوة جمع البيانات بعد الفوز (فئة / تسجيل / إرسال واتساب) + نجاح + انستجرام
│   ├── PreviousPrizeStep.tsx  # شاشة "جائزتك السابقة" (One-Time-Spin)
│   ├── Wheel.tsx              # العجلة (فيزياء الدوران، Easing، targetWinnerIndex)
│   └── WheelLoadingScreen.tsx # شاشة تحميل قبل ظهور العجلة
│
├── pages/                     # شاشات كاملة = تجميع كومبوننتس + تدفق (Phases)
│   ├── AdminPage.tsx          # لوحة التحكم (إعدادات، جوائز، واتساب، تصدير، إلخ)
│   └── GuestPage.tsx          # صفحة الضيف: تدفق العجلة، اختيار الجائزة (pickWinnerIndex)، Phases
│
├── services/                  # منطق الأعمال + اتصال بالبيانات (لا UI)
│   ├── excelParser.ts         # قراءة/تحليل ملفات Excel (أعضاء، إيرادات)
│   ├── guestExport.ts        # تصدير عضو جديد → Webhook + Retry/Backoff + SessionToken في الـ payload
│   ├── guestPending.ts       # طابور التصدير الفاشل + الجائزة المعلقة (LocalStorage)
│   ├── lookup.ts             # البحث عن ضيف برقم الجوال (فضي/ذهبي/بلاتيني + idLastDigits)
│   ├── mockSettings.ts       # إعدادات افتراضية + جوائز افتراضية
│   ├── sessionToken.ts       # 【Logic جديد】 UUID في الجلسة (للسيرفر: Token Validation)
│   ├── spinEligibility.ts    # 【Logic جديد】 التحقق من أهلية اللعب (checkEligibilityUrl) قبل الدوران
│   ├── storage.ts            # قراءة/كتابة LocalStorage (أعضاء، إعدادات، prizeUsage، addSilverMember + idLastDigits)
│   └── wheelSpunStorage.ts   # 【Logic جديد】 One-Time-Spin: هل الرقم لفّ؟ + آخر جائزة (جائزتك السابقة)
│
├── utils/                     # دوال رياضية/نصية عامة (بدون حالة، بدون UI)
│   ├── easing.ts              # 【Logic جديد】 Cubic-Bezier(0.1,0,0,1) للعجلة (تباطؤ "فخم")
│   └── whatsappMessage.ts     # إلحاق توقيت + هاش لرسالة واتساب (للتحقق من مصدر النظام)
│
├── hooks/                     # Hooks قابلة لإعادة الاستخدام (صوت، إلخ)
│   └── useSound.ts            # تشغيل أصوات (Tick، Win، Success، Celebration)
│
├── types/                     # تعريفات TypeScript (واجهات المشروع)
│   └── index.ts               # Prize, GuestLookup, Settings, MemberRow, StoredData, إلخ
│
└── [توثيق]
    ├── CODE_REVIEW_NOTES.md   # تقييم نصائح الـ Code Review (أيها طُبّق وأيها رُفض)
    ├── GUEST_FLOW.md          # مسارات الضيف (مساران ونهاية مشتركة)
    └── WHEEL_SECURITY_AND_BACKEND.md  # أمان العجلة، Token، Server-Side، Easing
```

---

## وظيفة كل فولدر

| الفولدر | الوظيفة | ملاحظة |
|---------|---------|--------|
| **components/** | مكوّنات الواجهة (شاشة فرعية أو كتلة UI). قد تحتوي على منطق عرضي فقط (مثل إظهار/إخفاء، تحريك). لا تحتوي على قرارات أعمال كبرى (مثل "من يربح؟") ولا اتصال مباشر بالـ DB/Webhook. | الـ Logic الجديد: **Wheel.tsx** يستخدم **targetWinnerIndex** و **easing** (يستورد من `utils/easing.ts`). |
| **pages/** | شاشات كاملة وتدفق التطبيق (Phases، من يدخل ماذا ومتى). تجمع بين عدة components وتستدعي services/hooks. هنا يُحدَّد "من يربح" (pickWinnerIndex) وقرار الانتقال بين الشاشات. | **GuestPage.tsx**: يختار الجائزة (`pickWinnerIndex`)، يمرّر `targetWinnerIndex` و `onSpinClick` للعجلة، ويتعامل مع checkEligibility و One-Time-Spin. |
| **services/** | كل ما يخص البيانات والقرارات الخلفية: تخزين، تصدير، تحقق من أهلية، توليد توكن الجلسة، قواعد "لفة واحدة". لا يحتوي على JSX ولا مكوّنات. | **Logic الجديد:** `sessionToken.ts`، `spinEligibility.ts`، `wheelSpunStorage.ts`؛ و`guestExport.ts` يستخدم SessionToken + Retry/Backoff. |
| **utils/** | دوال خالصة (نفس المدخل → نفس المخرجات)، بدون حالة تطبيق ولا اتصال شبكة. مثال: حساب تقدم الحركة (Easing)، تنسيق نص واتساب. | **Logic الجديد:** `easing.ts` (Cubic-Bezier للعجلة)، `whatsappMessage.ts` (توقيت + هاش). |
| **hooks/** | منطق React قابل لإعادة الاستخدام (صوت، قد نضيف لاحقاً مثلاً useWheelPhysics). | حالياً: `useSound.ts` فقط. |
| **types/** | وصف البيانات (واجهات) لاستخدامها في components و services. | مكان واحد للموديلات (مثل GuestLookup، Settings، MemberRow). |

---

## أين وضع الـ Logic الجديد في الشجرة؟

| الـ Logic المضاف | مكانه في الشجرة | السبب |
|------------------|------------------|--------|
| **Easing (Cubic-Bezier)** | `utils/easing.ts` | دالة رياضية خالصة (مدخل رقم → خرج رقم)، بدون UI ولا state. |
| **Session Tokens (UUID)** | `services/sessionToken.ts` | توليد وحفظ توكن الجلسة؛ جزء من طبقة "أمان/بيانات" وليس UI. |
| **التحقق من الأهلية قبل الدوران** | `services/spinEligibility.ts` | اتصال بـ checkEligibilityUrl وقرار "مسموح/ممنوع" → خدمة أعمال. |
| **One-Time-Spin (جائزتك السابقة)** | `services/wheelSpunStorage.ts` | تخزين "هل هذا الرقم لفّ؟" و"آخر جائزة" → بيانات/قواعد أعمال. |
| **تحديد الجائزة ثم عرضها (targetWinnerIndex)** | **اختيار الجائزة:** `pages/GuestPage.tsx` (pickWinnerIndex، targetWinnerIndex، onSpinClick). **عرض الحركة فقط:** `components/Wheel.tsx` (يستقبل targetWinnerIndex ويستخدمه في handleSpin). | القرار في الصفحة (أو لاحقاً السيرفر)، والعجلة مجرد "عرض" للنتيجة. |
| **Retry + Exponential Backoff** | `services/guestExport.ts` | منطق إعادة المحاولة للتصدير → خدمة اتصال بالويب هوك. |
| **توقيت + هاش واتساب** | `utils/whatsappMessage.ts` | دالة نصية خالصة (إلحاق سطر تحقق). |

بهذا تكون أماكن الـ Logic الجديد (Easing، Session Tokens، الأهلية، One-Time-Spin، تحديد الجائزة، Retry، واتساب) واضحة داخل شجرة `src`.
