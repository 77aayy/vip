import { trackUXEvent } from '@/services/analytics'
import { NAME_MIN_LENGTH, NAME_MAX_LENGTH, ID_MIN_LENGTH, ID_MAX_LENGTH } from '@/constants/validation'
import { useEffect, useRef, useState } from 'react'
import type { GuestLookup } from '@/types'

const tierLabel: Record<string, string> = { silver: 'فضي', gold: 'ذهبي', platinum: 'بلاتيني' }

interface CheckPhoneStepProps {
  onSubmit: (phone: string) => void | Promise<void>
  onLookup: (phone: string) => Promise<GuestLookup | null>
  /** عند عدم وجود الرقم: تسجيل ثم فتح العجلة من نفس الشاشة (Conditional UI) */
  onRegisterAndSpin?: (data: { phone: string; name: string; id: string }) => void | Promise<void>
  registerPrompt?: string
  /** رسالة للضيف له إيراد لكن لم يسجل — {totalSpent} و{eligibleTier} */
  eligibleNoTierMessage?: string
  /** خطأ من السيرفر (مثلاً: هذا الرقم استخدم العجلة اليوم) */
  eligibilityError?: string
  onClearEligibilityError?: () => void
}

const DEBOUNCE_MS = 400
/** منع الإرسال المزدوج وحماية الـ API من الضغط المتكرر */
const SUBMIT_COOLDOWN_MS = 3000

function maskName(name: string): string {
  const t = (name || '').trim()
  if (!t) return 'عزيزي'
  const first = t[0]
  return first + '****'
}

export function CheckPhoneStep({ onSubmit, onLookup, onRegisterAndSpin, registerPrompt = 'أكمل بياناتك ثم ادور لك العجلة', eligibleNoTierMessage = 'بلغ إجمالي تعاملاتك معنا {totalSpent} ريالاً، وأنت مؤهل لفئة {eligibleTier}. ندعوك لتجربة العجلة!', eligibilityError = '', onClearEligibilityError }: CheckPhoneStepProps) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recognizedGuest, setRecognizedGuest] = useState<GuestLookup | null>(null)
  const [checking, setChecking] = useState(false)
  const [nameDigitsWarning, setNameDigitsWarning] = useState(false)
  const [phoneLettersWarning, setPhoneLettersWarning] = useState(false)
  const submittedRef = useRef(false)
  const registerSubmittedRef = useRef(false)
  const cooldownUntilRef = useRef(0)

  const p = phone.replace(/\D/g, '').slice(-9)
  const showRegisterForm = p.length >= 9 && !checking && recognizedGuest === null && onRegisterAndSpin

  useEffect(() => {
    onClearEligibilityError?.()
  }, [p, onClearEligibilityError])

  useEffect(() => {
    if (!nameDigitsWarning) return
    const t = setTimeout(() => setNameDigitsWarning(false), 2500)
    return () => clearTimeout(t)
  }, [nameDigitsWarning])

  useEffect(() => {
    if (!phoneLettersWarning) return
    const t = setTimeout(() => setPhoneLettersWarning(false), 2500)
    return () => clearTimeout(t)
  }, [phoneLettersWarning])

  useEffect(() => {
    if (p.length < 9) {
      setRecognizedGuest(null)
      return
    }
    let cancelled = false
    setChecking(true)
    const t = setTimeout(async () => {
      try {
        trackUXEvent('lookup_started')
        const found = await onLookup(p)
        if (!cancelled) setRecognizedGuest(found)
      } finally {
        if (!cancelled) {
          trackUXEvent('lookup_completed')
          setChecking(false)
        }
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [p, onLookup])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    setError('')
    if (p.length < 9) {
      setError('أدخل رقم جوال صحيح')
      return
    }
    if (submittedRef.current || cooldownUntilRef.current > Date.now()) return
    submittedRef.current = true
    cooldownUntilRef.current = Date.now() + SUBMIT_COOLDOWN_MS
    setLoading(true)
    try {
      await onSubmit(p)
    } catch {
      submittedRef.current = false
      setError('تعذّر الإجراء. تحقق من الاتصال وحاول مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterAndSpinSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    setError('')
    if (p.length < 9) {
      setError('أدخل رقم جوال صحيح')
      return
    }
    if (!name.trim() || !id.trim()) {
      setError('أدخل الاسم والهوية')
      return
    }
    const nameLen = name.trim().length
    const idLen = id.trim().length
    if (nameLen < NAME_MIN_LENGTH || nameLen > NAME_MAX_LENGTH) {
      setError('الاسم بين 2 و 100 حرف.')
      return
    }
    if (idLen < ID_MIN_LENGTH || idLen > ID_MAX_LENGTH) {
      setError('رقم الهوية بين 2 و 20 حرفاً.')
      return
    }
    if (!onRegisterAndSpin || registerSubmittedRef.current) return
    registerSubmittedRef.current = true
    setLoading(true)
    trackUXEvent('register_started')
    try {
      await onRegisterAndSpin({ phone: p, name: name.trim(), id: id.trim() })
    } catch {
      registerSubmittedRef.current = false
      setError('تعذّر الإجراء. تحقق من الاتصال وحاول مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,248,246,0.99) 100%)',
    border: '2px solid rgba(212, 175, 55, 0.45)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(212,175,55,0.15)',
  }
  const textStyle = { color: '#2c2825', fontFamily: 'Tajawal, Cairo, sans-serif' }
  const mutedStyle = { color: '#5c5348', fontFamily: 'Tajawal, Cairo, sans-serif' }
  const inputClass = 'w-full px-4 py-3 rounded-xl border input-mobile-safe bg-white/95 border-amber-300/80 text-[#2c2825] placeholder-[#5c5348] focus:outline-none focus:ring-2 focus:ring-amber-400/55 focus:border-amber-500/70 min-h-[48px]'
  const inputClassCenter = inputClass + ' text-center'

  if (recognizedGuest && !loading) {
    const inTier = recognizedGuest.inTier !== false
    const masked = maskName(recognizedGuest.name ?? '')
    const welcomeName = masked.startsWith('أستاذ') || masked.startsWith('السيد') ? masked : `أستاذ ${masked}`
    const idLast = recognizedGuest.idLastDigits?.replace(/\D/g, '').slice(-4)
    const eligibleTierLabel = recognizedGuest.eligibleTier ? tierLabel[recognizedGuest.eligibleTier] ?? recognizedGuest.eligibleTier : 'فضي'
    const messageForNoTier =
      inTier
        ? null
        : eligibleNoTierMessage
          .replace(/\{totalSpent\}/g, String(recognizedGuest.totalSpent ?? recognizedGuest.points))
          .replace(/\{eligibleTier\}/g, eligibleTierLabel)
    return (
      <div className="w-full max-w-sm mx-auto py-6 animate-fade-in">
        <div className="rounded-2xl p-5 shadow-lg" style={cardStyle}>
          {inTier ? (
            <>
              <p className="text-center text-[1rem] font-medium mb-1" style={textStyle}>
                أهلاً يا {welcomeName}، نورتنا تاني..
              </p>
              <p className="text-center text-[0.875rem] mb-1" style={mutedStyle}>
                فئتك: <strong style={{ color: '#2c2825' }}>{tierLabel[recognizedGuest.tier] ?? recognizedGuest.tier}</strong>
                {' — نقاطك: '}
                <strong style={{ color: '#2c2825' }}>{(recognizedGuest.points ?? 0).toLocaleString('ar-SA')}</strong>
              </p>
              {(recognizedGuest.points ?? 0) === 0 && (
                <p className="text-center text-[0.75rem] mb-1 text-amber-700/90" style={mutedStyle}>
                  لظهور النقاط: ارفع كشف الإيراد من لوحة التحكم أو أضف عمود إيراد في ملف العضويات
                </p>
              )}
              {recognizedGuest.pointsToNextTier != null && recognizedGuest.pointsToNextTier > 0 && recognizedGuest.tier !== 'platinum' && (
                <p className="text-center text-[0.8125rem] mb-1" style={mutedStyle}>
                  باقي <strong style={{ color: '#2c2825' }}>{recognizedGuest.pointsToNextTier.toLocaleString('ar-SA')}</strong> نقطة للوصول إلى{' '}
                  <strong style={{ color: '#2c2825' }}>
                    {recognizedGuest.tier === 'silver' ? 'الذهبي' : 'البلاتيني'}
                  </strong>
                </p>
              )}
              {recognizedGuest.tier === 'platinum' && (
                <p className="text-center text-[0.8125rem] mb-1" style={mutedStyle}>
                  أنت في أعلى فئة 🏆
                </p>
              )}
              {idLast ? (
                <p className="text-center text-[0.9375rem] mb-2" style={mutedStyle}>
                  هل هذا هو رقم هويتك المنتهي بـ (***{idLast})؟
                </p>
              ) : null}
              <p className="text-center text-[0.9375rem] mb-4" style={mutedStyle}>
                دور العجلة دلوقتي!
              </p>
            </>
          ) : (
            <p className="text-center text-[1rem] font-medium mb-4" style={textStyle}>
              {messageForNoTier}
            </p>
          )}
          {eligibilityError && (
            <p className="text-center text-red-600 text-[0.8125rem] mb-3" role="alert">
              {eligibilityError}
            </p>
          )}
          <button
            type="button"
            data-testid="btn-spin-wheel"
            onClick={() => { onClearEligibilityError?.(); handleSubmit() }}
            disabled={loading}
            className="w-full min-h-[48px] py-3.5 rounded-xl text-white text-[0.9375rem] font-bold transition-colors disabled:opacity-50 touch-manipulation"
            style={{
              background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 25%, #b8860b 60%, #9a7209 100%)',
              boxShadow: '0 3px 12px rgba(0,0,0,0.2)',
            }}
          >
            {loading ? '...' : 'دور العجلة'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto py-6 animate-fade-in">
      <div className="rounded-2xl p-5 shadow-lg" style={cardStyle}>
        <p className="text-center text-[0.9375rem] font-medium mb-1" style={textStyle}>
          ادخل رقم جوالك
        </p>
        <p className="text-center text-[0.8125rem] mb-4" style={mutedStyle}>
          لو عميل حالي حيّاك .. لو عميل جديد سجل وابشر بسعدك!
        </p>
        <form
          onSubmit={showRegisterForm ? handleRegisterAndSpinSubmit : handleSubmit}
          className="space-y-3"
        >
          <input
            type="tel"
            inputMode="numeric"
            placeholder="رقم الجوال"
            data-testid="input-phone"
            value={phone}
            onChange={(e) => {
              const raw = e.target.value
              const hasLetter = /[a-zA-Z\u0600-\u06FF]/.test(raw)
              if (hasLetter) setPhoneLettersWarning(true)
              setPhone(raw.replace(/\D/g, ''))
            }}
            className={inputClassCenter}
            autoFocus
          />
          <p className="text-center text-[0.7rem] px-1 -mt-1" style={{ color: '#8a8278' }}>
            رقم الجوال: أرقام فقط
          </p>
          {phoneLettersWarning && (
            <p className="text-center text-[0.7rem] px-1 animate-fade-in" style={{ color: '#b45309' }}>
              رقم الجوال أرقام فقط بدون حروف
            </p>
          )}
          {checking && p.length >= 9 && (
            <p className="text-center text-[0.8125rem]" style={mutedStyle}>جاري التحقق...</p>
          )}
          {showRegisterForm && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-center text-[0.8125rem]" style={mutedStyle}>{registerPrompt}</p>
              <input
                type="text"
                placeholder="الاسم"
                data-testid="input-name"
                value={name}
                onChange={(e) => {
                  const raw = e.target.value
                  if (/[0-9]/.test(raw)) setNameDigitsWarning(true)
                  setName(raw.replace(/[0-9]/g, ''))
                }}
                className={inputClass}
              />
              <p className="text-center text-[0.7rem] px-1 -mt-1" style={{ color: '#8a8278' }}>
                الاسم: حروف فقط
              </p>
              {nameDigitsWarning && (
                <p className="text-center text-[0.7rem] px-1 animate-fade-in" style={{ color: '#b45309' }}>
                  الاسم حروف فقط بدون أرقام
                </p>
              )}
              <input
                type="text"
                placeholder="الهوية"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className={inputClass}
              />
              <p className="text-center text-[0.75rem] px-1 flex items-center justify-center gap-1.5" style={{ color: '#8a8278' }}>
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                بياناتك مشفرة ومؤمنة تماماً
              </p>
            </div>
          )}
          {error && (
            <p className="text-red-600 text-[0.8125rem] text-center" role="alert">{error}</p>
          )}
          {!showRegisterForm && (
            <button
              type="submit"
              data-testid="btn-lookup"
              disabled={loading || (p.length < 9)}
              className="w-full min-h-[48px] py-3 rounded-xl text-white text-[0.9375rem] font-medium disabled:opacity-50 transition-colors touch-manipulation"
              style={{
                background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 50%, #b8860b 100%)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {loading ? '...' : 'استعلم عن عضويتك'}
            </button>
          )}
          {showRegisterForm && (
            <button
              type="submit"
              data-testid="btn-register-and-spin"
              disabled={loading || !name.trim() || !id.trim()}
              className="w-full min-h-[48px] py-3 rounded-xl text-white text-[0.9375rem] font-medium disabled:opacity-50 transition-colors touch-manipulation"
              style={{
                background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 50%, #b8860b 100%)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {loading ? '...' : 'انضم لنا الان .. وجرّب حظك!'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
