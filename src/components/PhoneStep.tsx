import React, { useEffect, useRef, useState } from 'react'
import { appendVerificationSuffix } from '@/utils/whatsappMessage'
import type { GuestLookup, Tier } from '@/types'

interface PhoneStepProps {
  onLookup: (phone: string) => Promise<GuestLookup | null>
  onRegister: (data: { phone: string; name: string; id: string }, source: 'skip' | 'win') => Promise<void>
  onSuccess: (phone?: string) => void
  code: string
  prizeLabel: string
  /** مصدر الدخول لخطوة الهاتف: تخطي الهدية أو كسب العجلة */
  registrationSource: 'skip' | 'win'
  /** عند true (تسجيل مجاناً) نعرض نموذج الاسم+رقم+هوية مباشرة بدون خطوة "ادخل رقمك فقط" */
  skipPhoneLookup?: boolean
  /** ضيف تم التحقق منه مسبقاً (بعد "اضغط هنا" ووجود الرقم) — نعرض فئته وواتساب مباشرة */
  initialGuest?: GuestLookup | null
  /** رقم تم إدخاله في خطوة "ادخل رقمك" (عند عدم وجوده) — نملأ حقل الجوال تلقائياً */
  initialPhone?: string
  whatsAppNumber: string
  registerPrompt: string
  successReception: string
  messages: { silver: string; gold: string; platinum: string; eligibleNoTier?: string }
  onSuccessSound?: () => void
  /** رابط انستجرام (أو سوشال) يظهر بعد النجاح — "تابعنا للاطلاع على عروضنا" */
  instagramUrl?: string
}

export function PhoneStep({
  onLookup,
  onRegister,
  onSuccess,
  code,
  prizeLabel,
  registrationSource,
  skipPhoneLookup = false,
  initialGuest = null,
  initialPhone = '',
  whatsAppNumber,
  registerPrompt,
  successReception,
  messages,
  onSuccessSound,
  instagramUrl = '',
}: PhoneStepProps) {
  const [phone, setPhone] = useState(initialPhone)
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [step, setStep] = useState<'phone' | 'tier' | 'register' | 'sent'>(
    skipPhoneLookup ? (initialGuest ? 'tier' : 'register') : initialGuest ? 'tier' : 'phone',
  )
  const [guest, setGuest] = useState<GuestLookup | null>(initialGuest ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nameDigitsWarning, setNameDigitsWarning] = useState(false)
  const [phoneLettersWarning, setPhoneLettersWarning] = useState(false)
  const submittedRef = useRef(false)
  const tierWhatsAppSentRef = useRef(false)

  const tierLabel: Record<Tier, string> = {
    silver: 'فضي',
    gold: 'ذهبي',
    platinum: 'بلاتيني',
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const p = phone.replace(/\D/g, '').slice(-9)
    if (p.length < 9) {
      setError('أدخل رقم جوال صحيح')
      return
    }
    if (submittedRef.current) return
    submittedRef.current = true
    setLoading(true)
    try {
      const found = await onLookup(p)
      if (found) {
        setGuest(found)
        setStep('tier')
      } else {
        setStep('register')
      }
    } catch {
      submittedRef.current = false
      setError('حدث خطأ. حاول مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const p = phone.replace(/\D/g, '').slice(-9)
    if (p.length < 9) {
      setError('أدخل رقم جوال صحيح')
      return
    }
    if (!name.trim() || !id.trim()) {
      setError('أدخل الاسم والهوية')
      return
    }
    if (submittedRef.current) return
    submittedRef.current = true
    setLoading(true)
    try {
      await onRegister(
        { phone: p, name: name.trim(), id: id.trim() },
        registrationSource,
      )
      setStep('sent')
      sendWhatsApp(name.trim(), phone, 'عضو جديد - فضية', '-', prizeLabel, code, id.trim())
      onSuccess(p)
    } catch {
      submittedRef.current = false
      setError('حدث خطأ. حاول مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  function sendWhatsApp(n: string, ph: string, tier: string, _points: string, prize: string, c: string, idNum?: string) {
    const body = `🏨 طلب جائزة

👤 الضيف: ${n}
📱 الجوال: ${ph}
🪪 رقم الهوية: ${idNum ?? '-'}
🏆 الفئة: ${tier}
🎁 الجائزة: ${prize}
🔑 كود التحقق: ${c}

تم الإرسال من صفحة الضيف`
    const text = appendVerificationSuffix(body)
    const url = `https://wa.me/${whatsAppNumber.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  function handleTierWhatsApp() {
    if (!guest || tierWhatsAppSentRef.current) return
    tierWhatsAppSentRef.current = true
    const tierDisplay = guest.inTier !== false ? tierLabel[guest.tier] : `مؤهل لفئة ${tierLabel[guest.tier]}`
    const nameDisplay = guest.name?.trim() || 'ضيف'
    const idDisplay = guest.idLastDigits ? `آخر 4 أرقام: ${guest.idLastDigits}` : '-'
    sendWhatsApp(nameDisplay, guest.phone, tierDisplay, '', prizeLabel, code, idDisplay)
    setStep('sent')
    onSuccess()
  }

  const cardStyle = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,248,246,0.99) 100%)',
    border: '2px solid rgba(212, 175, 55, 0.45)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(212,175,55,0.15)',
  }
  const textStyle = { color: '#2c2825', fontFamily: 'Tajawal, Cairo, sans-serif' }
  const mutedStyle = { color: '#5c5348', fontFamily: 'Tajawal, Cairo, sans-serif' }
  const inputClass = 'w-full px-4 py-3 rounded-xl border text-[0.9375rem] input-mobile-safe bg-white/95 border-amber-300/80 text-[#2c2825] placeholder-[#5c5348] focus:outline-none focus:ring-2 focus:ring-amber-400/55 focus:border-amber-500/70 min-h-[48px]'
  const btnGold = 'w-full py-3 rounded-xl text-white text-[0.9375rem] font-medium disabled:opacity-50 transition-colors'
  const btnGoldStyle = {
    background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 50%, #b8860b 100%)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  }

  if (step === 'phone') {
    return (
      <div className="w-full max-w-sm mx-auto py-6 animate-fade-in">
        <div className="rounded-2xl p-5 shadow-lg" style={cardStyle}>
          <p className="text-center text-[0.9375rem] font-medium mb-1" style={textStyle}>أدخل رقم جوالك لمتابعة الاسترداد وإرسال البيانات للاستقبال</p>
          <p className="text-center text-[0.8125rem] mb-4" style={mutedStyle}>للاسترجاع من قاعدة عملاء إليت، أو للحصول على عضوية فضية مجانية إن كنت عميلاً جديداً</p>
          <form onSubmit={handlePhoneSubmit} className="space-y-3">
            <input
              type="tel"
              inputMode="numeric"
              placeholder="رقم الجوال"
              value={phone}
              onChange={(e) => {
                const raw = e.target.value
                if (/[a-zA-Z\u0600-\u06FF]/.test(raw)) setPhoneLettersWarning(true)
                setPhone(raw.replace(/\D/g, ''))
              }}
              className={inputClass + ' text-center'}
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
            {error && <p className="text-red-600 text-[0.8125rem] text-center">{error}</p>}
            <button type="submit" disabled={loading} className={btnGold} style={btnGoldStyle}>
              {loading ? '...' : 'متابعة'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (step === 'tier' && guest) {
    const inTier = guest.inTier !== false
    const eligibleTierLabel = tierLabel[guest.tier]
    const msg = inTier ? messages[guest.tier] : (messages.eligibleNoTier ?? 'أنت مؤهل لفئة {eligibleTier}. ندعوك لتجربة العجلة!')
    const displayMsg = inTier
      ? msg.replace(/\{name\}/g, guest.name?.trim() || '').replace(/\{points\}/g, String(guest.points)).replace(/\{next\}/g, guest.pointsNextThreshold != null ? String(guest.pointsNextThreshold) : '')
      : msg.replace(/\{totalSpent\}/g, String(guest.totalSpent ?? guest.points)).replace(/\{eligibleTier\}/g, eligibleTierLabel)

    return (
      <div className="w-full max-w-sm mx-auto py-6 animate-fade-in">
        <div className="rounded-2xl p-5 space-y-3 shadow-lg" style={cardStyle}>
          <div className="rounded-xl p-3.5 text-center border-2 bg-amber-50/85" style={{ borderColor: 'rgba(217,119,6,0.55)' }}>
            <p className="font-medium text-[0.9375rem] leading-relaxed" style={textStyle}>
              {displayMsg}
            </p>
          </div>
          <div className="rounded-xl py-3 px-4 border-2 bg-amber-50/85" style={{ borderColor: 'rgba(217,119,6,0.55)' }}>
            <p className="text-center font-mono font-semibold text-[1rem] tracking-widest" style={textStyle}>{code}</p>
          </div>
          <button
            type="button"
            onClick={handleTierWhatsApp}
            className="w-full min-h-[48px] py-3 rounded-xl text-white text-[0.9375rem] font-medium transition-colors touch-manipulation"
            style={{
              background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 50%, #b8860b 100%)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            إرسال واتساب للاستقبال
          </button>
          <p className="text-center text-[0.75rem] mt-2 px-1" style={mutedStyle}>
            احفظ الكود فى رسائل الواتس .. ونشوفك على خير! 👋
          </p>
        </div>
      </div>
    )
  }

  if (step === 'register') {
    const nameReady = name.trim().length >= 2
    const phoneReady = phone.replace(/\D/g, '').slice(-9).length >= 9
    return (
      <div className="w-full max-w-sm mx-auto py-6 animate-fade-in">
        <div className="rounded-2xl p-5 shadow-lg" style={cardStyle}>
          <p className="text-center text-[0.9375rem] font-medium mb-4" style={textStyle}>{registerPrompt}</p>
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="الاسم"
              value={name}
              onChange={(e) => {
                const raw = e.target.value
                if (/[0-9]/.test(raw)) setNameDigitsWarning(true)
                setName(raw.replace(/[0-9]/g, ''))
              }}
              className={inputClass}
              autoFocus
            />
            <p className="text-center text-[0.7rem] px-1 -mt-1" style={{ color: '#8a8278' }}>
              الاسم: حروف فقط
            </p>
            {nameDigitsWarning && (
              <p className="text-center text-[0.7rem] px-1 animate-fade-in" style={{ color: '#b45309' }}>
                الاسم حروف فقط بدون أرقام
              </p>
            )}
            {nameReady && (
              <>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="رقم الجوال"
                  value={phone}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (/[a-zA-Z\u0600-\u06FF]/.test(raw)) setPhoneLettersWarning(true)
                    setPhone(raw.replace(/\D/g, ''))
                  }}
                  className={inputClass + ' animate-fade-in'}
                />
                <p className="text-center text-[0.7rem] px-1 -mt-1" style={{ color: '#8a8278' }}>
                  رقم الجوال: أرقام فقط
                </p>
                {phoneLettersWarning && (
                  <p className="text-center text-[0.7rem] px-1 animate-fade-in" style={{ color: '#b45309' }}>
                    رقم الجوال أرقام فقط بدون حروف
                  </p>
                )}
              </>
            )}
            {nameReady && phoneReady && (
              <>
                <input
                  type="text"
                  placeholder="الهوية"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className={inputClass + ' animate-fade-in'}
                />
                <p className="text-center text-[0.75rem] px-1" style={{ color: '#8a8278' }}>بياناتك مشفرة ومؤمنة تماماً</p>
              </>
            )}
            {error && <p className="text-red-600 text-[0.8125rem] text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || !nameReady || !phoneReady || !id.trim()}
              className={btnGold}
              style={btnGoldStyle}
            >
              {loading ? '...' : 'تسجيل وإرسال واتساب'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (step === 'sent' && onSuccessSound) onSuccessSound()
  }, [step, onSuccessSound])

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

  return (
    <div className="w-full max-w-sm mx-auto py-6 animate-fade-in">
      <div
        className="rounded-2xl p-6 text-center border-2 animate-[fade-in_0.4s_ease-out]"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,248,246,0.98) 100%)',
          borderColor: 'rgba(212, 175, 55, 0.45)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(212,175,55,0.15)',
        }}
      >
        <div className="flex justify-center gap-2 mb-3">
          <span className="text-2xl" aria-hidden>🎉</span>
          <span className="text-2xl" aria-hidden>✓</span>
          <span className="text-2xl" aria-hidden>🎊</span>
        </div>
        <p className="text-[1.0625rem] font-bold leading-relaxed text-[#2c2825]" style={{ fontFamily: 'Tajawal, Cairo, sans-serif' }}>
          {successReception.replace(/\{name\}/g, (guest?.name || name || '').trim())}
        </p>
        {instagramUrl?.trim() && (
          <a
            href={instagramUrl.trim().startsWith('http') ? instagramUrl.trim() : `https://instagram.com/${instagramUrl.trim().replace(/^@/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 font-medium text-[0.9375rem] transition-colors"
            style={{
              borderColor: 'rgba(212, 175, 55, 0.6)',
              color: '#2c2825',
              background: 'rgba(255,255,255,0.9)',
            }}
          >
            تابعنا على انستجرام للاطلاع على عروضنا
          </a>
        )}
      </div>
    </div>
  )
}
