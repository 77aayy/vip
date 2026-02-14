export interface Prize {
  id: string
  label: string
  percent: number
  color?: string
  /** عدد مرات المكسب (الأكواد) — إن لم تُحدد unlimited */
  maxWins?: number
  /** true = الجائزة لا تنتهي (عدد لا نهائي من المرات) */
  unlimited?: boolean
  /** true = نسبة هذه الجائزة ثابتة ولا تُغيّر عند إعادة توزيع النسب */
  fixedPercent?: boolean
}

export type Tier = 'silver' | 'gold' | 'platinum'

export interface GuestLookup {
  phone: string
  name: string
  tier: Tier
  points: number
  /** نقاط المتبقية للترقية (للعرض الاختياري) */
  pointsToNextTier: number | null
  /** حد النقاط للفئة التالية (للاستخدام في الرسالة: للوصول إلى X نقطة) */
  pointsNextThreshold: number | null
  /** آخر 2–4 أرقام من الهوية (للعرض المقنّع: هل رقم هويتك المنتهي بـ ***45؟) */
  idLastDigits?: string
  /** true = مسجل في فئة (فضي/ذهبي/بلاتيني). false = له إيراد فقط ولم يسجل بعد */
  inTier?: boolean
  /** المبلغ الإجمالي المنفق (للعرض عند inTier: false) */
  totalSpent?: number
  /** الفئة المستحقة بناءً على النقاط (عند inTier: false) */
  eligibleTier?: Tier
}

export interface Settings {
  prizes: Prize[]
  revenueToPoints: number
  pointsSilverToGold: number
  pointsGoldToPlatinum: number
  whatsAppNumber: string
  /** اختياري: رابط ويب (مثلاً Google Apps Script) لحفظ بيانات العضو الجديد في إيميل/جوجل شيت */
  exportWebhookUrl?: string
  /** اختياري: رابط للتحقق من أهلية اللعب (رقم لم يلعب اليوم) — العجلة لا تبدأ إلا بعد تأكيد السيرفر */
  checkEligibilityUrl?: string
  /** مدة الحظر بين كل لفة وأخرى (بالأيام) — من لوحة الأدمن، افتراضي 15 */
  spinCooldownDays?: number
  /** مدة دوران العجلة حتى التوقف (ثانية) — من لوحة الأدمن، افتراضي 22 */
  wheelDurationSec?: number
  /** عدد اللفات الكاملة (360°) قبل التوقف — من لوحة الأدمن، افتراضي 3 */
  wheelSpinCount?: number
  /** التأخير بعد توقف العجلة حتى ظهور شاشة الجائزة (ثانية) — من لوحة الأدمن، افتراضي 2.2 */
  delayBeforePrizeSec?: number
  /** اختياري: رابط انستجرام (أو أي سوشال) يظهر بعد نجاح الإرسال للاستقبال — "تابعنا للاطلاع على عروضنا" */
  instagramUrl?: string
  /** نصوص شروط وأحكام (سطر واحد = بند) — تظهر في نافذة «شروط وأحكام» في صفحة الضيف */
  termsText?: string
  messages: {
    silver: string
    gold: string
    platinum: string
    registerPrompt: string
    successReception: string
    /** للضيف له إيراد ولكن لم يسجل بعد */
    eligibleNoTier?: string
  }
}

export interface MemberRow {
  phone: string
  name: string
  total_spent: number
  /** آخر 2–4 أرقام من الهوية (اختياري، للتأكيد المقنّع عند العودة) */
  idLastDigits?: string
  /** رقم الهوية الكامل — لربط كشف الإيراد بالزبون */
  idNumber?: string
}

export interface RevenueRow {
  phone: string
  total_spent: number
  /** رقم الهوية — عند الاستيراد قبل تحويله إلى phone */
  idNumber?: string
}

export interface StoredData {
  silver: MemberRow[]
  gold: MemberRow[]
  platinum: MemberRow[]
  revenue: RevenueRow[]
  settings: Settings | null
  /** عدد مرات استخدام كل جائزة: { [prizeId]: count } */
  prizeUsage?: Record<string, number>
}
