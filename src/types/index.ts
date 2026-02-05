export interface Prize {
  id: string
  label: string
  percent: number
  color?: string
  /** عدد مرات المكسب (الأكواد) — إن لم تُحدد unlimited */
  maxWins?: number
  /** true = الجائزة لا تنتهي (عدد لا نهائي من المرات) */
  unlimited?: boolean
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
  /** اختياري: رابط انستجرام (أو أي سوشال) يظهر بعد نجاح الإرسال للاستقبال — "تابعنا للاطلاع على عروضنا" */
  instagramUrl?: string
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
