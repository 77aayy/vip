import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckPhoneStep } from '@/components/CheckPhoneStep'
import { CodeResult } from '@/components/CodeResult'
import { PhoneStep } from '@/components/PhoneStep'
import { Wheel } from '@/components/Wheel'
import { WheelLoadingScreen } from '@/components/WheelLoadingScreen'
import { useSound } from '@/hooks/useSound'
import { lookupGuestAsync } from '@/services/lookup'
import { getSettings, getPrizeUsage, incrementPrizeUsage, addSilverMember } from '@/services/storage'
import {
  isFirestoreAvailable,
  addSilverMemberAsync,
  incrementPrizeUsageAsync,
  getSpinEligibilityAsync,
  recordSpinInFirestoreAsync,
} from '@/services/firestoreLoyaltyService'
import { exportNewGuest, flushPendingExports } from '@/services/guestExport'
import { getPendingPrize, setPendingPrize, clearPendingPrize } from '@/services/guestPending'
import { getWheelSpun, getLastPrize, setWheelSpun, getCooldownEndsAt } from '@/services/wheelSpunStorage'
import { checkSpinEligibility, recordSpinOnServer } from '@/services/spinEligibility'
import { appendVerificationSuffix } from '@/utils/whatsappMessage'
import type { GuestLookup, Prize } from '@/types'
import { PreviousPrizeStep } from '@/components/PreviousPrizeStep'
import { InstallBanner } from '@/components/InstallBanner'

/** بنود الشروط والأحكام من الإعدادات (سطر = بند)، أو الافتراضي إن لم يُضبط */
function getTermsItems(termsText: string | undefined): string[] {
  if (termsText?.trim()) {
    return termsText
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [
    'المشاركة في النظام مجانية تماماً ولا تتطلب أي دفع.',
    'النظام هو أداة لمكافأه نزلاء إليت الاوفياء.',
    'الجوائز غير نقدية ولا يمكن استبدالها بأموال.',
    'رقم الجوال هو هوية المستخدم داخل النظام.',
    'كل رقم جوال مسموح له بعدد محدود من المحاولات (مره واحده كل 15 يوم).',
    'أي محاولة تحايل أو استخدام بيانات مزيفة تؤدي إلى إلغاء المشاركة.',
    'الجوائز تصرف فقط باستخدام كود تحقق فريد صالح للاستخدام مرة واحدة.',
    'يتم تسليم الكود للاستقبال فور الفوز به من خلال الاتس اب.',
    'صلاحي الكود 3 شهور من تاريخ ارساله واتس اب للفندق.',
    'العضويات (فضي، ذهبي، بلاتيني) والنقاط تخضع لخصومات و قواعد يحددها الفندق.',
    'النقاط لا يمكن بيعها أو تحويلها أو سحبها نقدياً.',
    'الفندق يحتفظ بحق تعديل: الجوائز، نسب الفوز، شروط الترقية، قواعد الاستخدام، في أي وقت.',
    'يتم جمع البيانات (الاسم، الجوال، الهوية إن وُجدت) لأغراض اضافتك لبرنامج الولاء فقط.',
    'الفندق غير مسؤول عن: عدم استخدامك للكود فى الفتره المخصصه له 3 شهور؛ عدم ارسالك للكود بعدد الفوز به مباشره؛ أعطال الإنترنت؛ مشاكل واتساب؛ سوء استخدام الكود من العميل.',
  ]
}

/** كود تحقق فريد — يستخدم crypto.getRandomValues لمقاومة التوقّع والتلاعب */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(8)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 8; i++) s += chars[arr[i]! % chars.length]
  } else {
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

export function GuestPage() {
  const [phase, setPhase] = useState<'wheel' | 'wheel-loading' | 'check-phone' | 'code' | 'phone' | 'previous-prize'>('wheel')
  const [previousPrizeData, setPreviousPrizeData] = useState<{ prizeLabel: string; code: string } | null>(null)
  const [pendingPrizeBanner, setPendingPrizeBanner] = useState<ReturnType<typeof getPendingPrize>>(null)
  const [wonPrize, setWonPrize] = useState<Prize | null>(null)
  const [voucherCode, setVoucherCode] = useState('')
  const [hasSpun, setHasSpun] = useState(false)
  const [triggerSpinAt, setTriggerSpinAt] = useState(0)
  const [afterRegisterShowWheel, setAfterRegisterShowWheel] = useState(false)
  const [allowSpinWithoutCheck, setAllowSpinWithoutCheck] = useState(false)
  const [checkedGuest, setCheckedGuest] = useState<GuestLookup | null>(null)
  const [lastCheckedPhone, setLastCheckedPhone] = useState('')
  const [, setEntryPoint] = useState<'spin' | 'skip'>('spin')
  /** بيانات من سجّل في CheckPhoneStep (مسار تخطي الهدية) — لعدم إعادة طلب الاسم/الهوية في PhoneStep */
  const [lastRegisteredGuest, setLastRegisteredGuest] = useState<{ phone: string; name: string; id: string } | null>(null)
  const [eligibilityError, setEligibilityError] = useState('')
  const [targetWinnerIndex, setTargetWinnerIndex] = useState<number | null>(null)
  const [spinProgress, setSpinProgress] = useState(0)
  const [termsOpen, setTermsOpen] = useState(false)
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null)
  const currentSpinPhoneRef = useRef('')
  const { playWin, playSuccess } = useSound()
  const settings = getSettings()
  const prizeUsage = getPrizeUsage()
  const availableIndices = useMemo(() => {
    return settings.prizes
      .map((_, i) => i)
      .filter((i) => {
        const p = settings.prizes[i]
        if (p.unlimited) return true
        const used = prizeUsage[p.id] ?? 0
        const max = p.maxWins ?? 0
        return used < max
      })
  }, [settings.prizes, prizeUsage])

  /** اختيار الجائزة حسب النسب — مرجّح بـ percent (لو المجموع 0 نستخدم توزيع متساوٍ) */
  const pickWinnerIndex = useCallback((): number => {
    const indices = availableIndices
    if (indices.length === 0) return 0
    const totalWeight = indices.reduce((sum, i) => sum + (settings.prizes[i]?.percent ?? 0), 0)
    if (totalWeight <= 0) return indices[Math.floor(Math.random() * indices.length)]
    let r = Math.random() * totalWeight
    for (const i of indices) {
      const w = settings.prizes[i]?.percent ?? 0
      if (r < w) return i
      r -= w
    }
    return indices[indices.length - 1]
  }, [availableIndices, settings.prizes])

  const handleSpinEnd = useCallback((prize: Prize) => {
    setTargetWinnerIndex(null)
    setHasSpun(true)
    setTriggerSpinAt(0)
    const code = generateCode()
    setWonPrize(prize)
    setVoucherCode(code)
    incrementPrizeUsage(prize.id)
    if (isFirestoreAvailable()) void incrementPrizeUsageAsync(prize.id)
    setPendingPrize({ prizeLabel: prize.label, code })
    const phone = currentSpinPhoneRef.current
    if (phone) {
      setWheelSpun(phone, prize.label, code)
      if (getSettings().checkEligibilityUrl?.trim()) void recordSpinOnServer(phone)
      if (isFirestoreAvailable()) void recordSpinInFirestoreAsync(phone, prize.label, code)
    }
    playWin()
    const delayMs = Math.max(1000, Math.min(6000, (getSettings().delayBeforePrizeSec ?? 2.2) * 1000))
    setTimeout(() => setPhase('code'), delayMs)
  }, [playWin])

  const handleSpinRequest = useCallback(() => {
    setEntryPoint('spin')
    setPhase('check-phone')
  }, [])

  const handleSkipGift = useCallback(() => {
    setEntryPoint('skip')
    setWonPrize({ id: 'silver-only', label: 'عضوية إليت الفضية', percent: 0 })
    setVoucherCode('—')
    setPhase('check-phone')
  }, [])

  const handleCopyOrWhatsApp = useCallback(() => {
    setPhase('phone')
  }, [])

  const handleLookup = useCallback(async (phone: string): Promise<GuestLookup | null> => {
    return lookupGuestAsync(phone)
  }, [])

  const handleWheelLoadingComplete = useCallback(() => {
    if (checkedGuest) currentSpinPhoneRef.current = checkedGuest.phone
    setTargetWinnerIndex(pickWinnerIndex())
    setPhase('wheel')
    setTriggerSpinAt(Date.now())
  }, [checkedGuest, pickWinnerIndex])

  const handleSpinClick = useCallback(() => {
    setSpinProgress(0)
    setTargetWinnerIndex(pickWinnerIndex())
    setTriggerSpinAt(Date.now())
  }, [pickWinnerIndex])

  const handleCheckPhoneSubmit = useCallback(
    async (phone: string) => {
      setEligibilityError('')
      const found = await lookupGuestAsync(phone)
      if (!found) return

      const hasServerCheck = Boolean(getSettings().checkEligibilityUrl?.trim())

      if (hasServerCheck) {
        const { allowed, message, cooldownEndsAt: serverEndsAt } = await checkSpinEligibility(phone)
        if (!allowed) {
          setEligibilityError(message ?? 'لا يمكنك اللعب الآن')
          setCheckedGuest(found)
          setPreviousPrizeData(getLastPrize(phone) ?? null)
          const endsAt = typeof serverEndsAt === 'number' ? serverEndsAt : getCooldownEndsAt(phone)
          if (typeof endsAt === 'number' && endsAt > Date.now()) {
            setCooldownEndsAt(endsAt)
            setPhase('wheel')
          }
          return
        }
        setCheckedGuest(found)
        currentSpinPhoneRef.current = found.phone
        setPhase('wheel-loading')
        return
      }

      if (isFirestoreAvailable()) {
        const { allowed, cooldownEndsAt: firestoreEndsAt, lastPrize: firestoreLastPrize } = await getSpinEligibilityAsync(phone)
        if (!allowed) {
          setEligibilityError('لا يمكنك اللعب الآن — لم تنتهِ مدة الحظر بعد')
          setCheckedGuest(found)
          setPreviousPrizeData(firestoreLastPrize ?? getLastPrize(phone) ?? null)
          if (typeof firestoreEndsAt === 'number' && firestoreEndsAt > Date.now()) {
            setCooldownEndsAt(firestoreEndsAt)
            setPhase('wheel')
          }
          return
        }
        setCheckedGuest(found)
        currentSpinPhoneRef.current = found.phone
        setPhase('wheel-loading')
        return
      }

      if (getWheelSpun(phone)) {
        const last = getLastPrize(phone)
        const endsAt = getCooldownEndsAt(phone)
        if (last && typeof endsAt === 'number' && endsAt > Date.now()) {
          setCheckedGuest(found)
          setPreviousPrizeData(last)
          setCooldownEndsAt(endsAt)
          setPhase('wheel')
        } else if (last) {
          setCheckedGuest(found)
          setPreviousPrizeData(last)
          setPhase('previous-prize')
        } else {
          setCheckedGuest(found)
          currentSpinPhoneRef.current = found.phone
          setPhase('wheel-loading')
        }
      } else {
        setCheckedGuest(found)
        currentSpinPhoneRef.current = found.phone
        setPhase('wheel-loading')
      }
    },
    [],
  )

  const handleRegisterAndSpin = useCallback(
    async (data: { phone: string; name: string; id: string }) => {
      const idLast = data.id.replace(/\D/g, '').slice(-4)
      addSilverMember(data.phone, data.name, idLast || undefined)
      if (isFirestoreAvailable()) void addSilverMemberAsync(data.phone, data.name, idLast || undefined)
      void exportNewGuest(data.phone, data.name, 'skip')
      currentSpinPhoneRef.current = data.phone
      setLastCheckedPhone(data.phone)
      setLastRegisteredGuest({ phone: data.phone, name: data.name, id: data.id })
      setPhase('wheel')
      setHasSpun(false)
      setAllowSpinWithoutCheck(true)
      setSpinProgress(0)
      setTargetWinnerIndex(pickWinnerIndex())
      setTriggerSpinAt(Date.now())
      await new Promise((r) => setTimeout(r, 100))
    },
    [pickWinnerIndex],
  )

  const handlePhoneStepSuccess = useCallback((phone?: string) => {
    clearPendingPrize()
    if (phone) currentSpinPhoneRef.current = phone
    setCheckedGuest(null)
    setLastCheckedPhone('')
    setLastRegisteredGuest(null)
    if (afterRegisterShowWheel) {
      setPhase('wheel')
      setHasSpun(false)
      setAfterRegisterShowWheel(false)
      setAllowSpinWithoutCheck(true)
    } else {
      // عميل جديد أو ضيف أنهى إرسال واتساب: نرجعه للصفحة الرئيسية ليرى رسالة النهاية
      setPhase('wheel')
    }
  }, [afterRegisterShowWheel])

  useEffect(() => {
    setPendingPrizeBanner(getPendingPrize())
  }, [])

  useEffect(() => {
    const pending = getPendingPrize()
    if (!pending) return
    const guest = checkedGuest ?? lastRegisteredGuest
    if (!guest) return
    const name = 'name' in guest ? guest.name : undefined
    const phone = 'phone' in guest ? guest.phone : undefined
    const id = lastRegisteredGuest?.id ?? (checkedGuest?.idLastDigits ? `آخر 4 أرقام: ${checkedGuest.idLastDigits}` : undefined)
    if (name ?? phone ?? id) {
      setPendingPrize({ ...pending, name: name ?? pending.name, phone: phone ?? pending.phone, id: id ?? pending.id })
    }
  }, [checkedGuest, lastRegisteredGuest])

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const flush = () => { if (navigator.onLine) void flushPendingExports() }
    const onVisible = () => { if (document.visibilityState === 'visible') flush() }
    flush()
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const handleSendPendingPrize = useCallback(() => {
    const pending = getPendingPrize()
    if (!pending) return
    const settings = getSettings()
    const body = `🏨 طلب جائزة\n\n👤 الضيف: ${pending.name ?? 'ضيف'}\n📱 الجوال: ${pending.phone ?? '-'}\n🪪 رقم الهوية: ${pending.id ?? '-'}\n🏆 الفئة: -\n🎁 الجائزة: ${pending.prizeLabel}\n🔑 كود التحقق: ${pending.code}\n\nتم الإرسال من صفحة الضيف`
    const text = appendVerificationSuffix(body)
    const url = `https://wa.me/${settings.whatsAppNumber.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    clearPendingPrize()
    setPendingPrizeBanner(null)
  }, [])

  const handleRegister = useCallback(
    async (data: { phone: string; name: string; id: string }, source: 'skip' | 'win') => {
      const idLast = data.id.replace(/\D/g, '').slice(-4)
      addSilverMember(data.phone, data.name, idLast || undefined)
      if (isFirestoreAvailable()) void addSilverMemberAsync(data.phone, data.name, idLast || undefined)
      void exportNewGuest(data.phone, data.name, source)
      await new Promise((r) => setTimeout(r, 200))
    },
    [],
  )

  const messages = {
    silver: settings.messages.silver,
    gold: settings.messages.gold,
    platinum: settings.messages.platinum,
    eligibleNoTier: settings.messages.eligibleNoTier ?? 'بلغ إجمالي تعاملاتك معنا {totalSpent} ريالاً، وأنت مؤهل لفئة {eligibleTier}. ندعوك لتجربة العجلة!',
  }

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-hidden page-bg-leather sm:min-h-screen w-full max-w-[100vw]">
      <main className="relative z-10 flex-1 flex flex-col items-center min-h-0 min-w-0 safe-area-insets pt-2 pb-6 px-2 sm:pt-6 sm:pb-10 sm:px-4 overflow-y-auto overflow-x-hidden w-full max-w-[100vw]">
        <div className="w-full max-w-[432px] sm:max-w-2xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl min-w-0 mx-auto flex flex-col items-center overflow-x-hidden">
        <header className="fixed top-0 left-0 right-0 z-20 w-full max-w-[100vw] flex-shrink-0 overflow-x-hidden sm:relative sm:top-auto sm:left-auto sm:right-auto pt-2 pb-2 sm:pt-6 sm:pb-0 sm:-mt-6 sm:mb-6" style={{ background: '#d9c9a8' }}>
          <div className="w-full max-w-[432px] sm:max-w-2xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl min-w-0 mx-auto px-2 sm:px-4">
          <div
            className="w-full flex flex-row items-center gap-2 sm:gap-3 py-2 sm:py-3.5 rounded-xl sm:rounded-2xl"
            dir="rtl"
            style={{
              background: 'linear-gradient(145deg, #e2d9c4 0%, #d9c9a8 50%, #d0c0a0 100%)',
              border: '1px solid rgba(212,175,55,0.4)',
              boxShadow: '0 6px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <span
              className="inline-flex flex-shrink-0 items-center justify-center rounded-lg overflow-hidden"
              style={{
                background: '#d9c9a8',
                isolation: 'isolate',
                padding: '2px 6px',
              }}
            >
              <img
                src="/logo-1.png"
                alt="Elite"
                className="h-11 w-auto max-w-[90px] sm:h-20 sm:max-w-[180px] object-contain block"
                decoding="async"
                style={{
                  display: 'block',
                  verticalAlign: 'middle',
                  filter: 'sepia(0.85) hue-rotate(328deg) saturate(2.2) brightness(1.15) contrast(1.05)',
                  mixBlendMode: 'multiply',
                  backgroundColor: '#d9c9a8',
                }}
              />
            </span>
            <div className="flex-1 min-w-0 relative text-center py-1">
              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                className="absolute top-0 left-0 rounded-lg flex items-center gap-1.5 px-2 py-1.5 touch-manipulation transition-transform active:scale-95 text-[0.75rem] sm:text-[0.8125rem] font-medium"
                style={{
                  background: 'rgba(212,175,55,0.2)',
                  border: '1px solid rgba(212,175,55,0.4)',
                  color: '#8b6914',
                  fontFamily: 'Tajawal, Cairo, sans-serif',
                }}
                title="شروط وأحكام"
                aria-label="شروط وأحكام"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span>شروط وأحكام</span>
              </button>
              <div
                className="w-10 h-px mx-auto mb-2 rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.75), transparent)' }}
                aria-hidden
              />
              <h1
                className="text-[1rem] sm:text-[1.4rem] font-bold tracking-tight"
                style={{
                  color: '#1a1917',
                  fontFamily: 'Tajawal, Cairo, sans-serif',
                  textShadow: '0 1px 2px rgba(255,255,255,0.6)',
                  letterSpacing: '-0.02em',
                }}
              >
                عجلة الولاء
              </h1>
              <p
                className="text-[0.7rem] sm:text-[0.875rem] mt-0.5 sm:mt-1.5 font-medium tracking-wide"
                style={{
                  color: '#5c5348',
                  fontFamily: 'Tajawal, Cairo, sans-serif',
                  letterSpacing: '0.02em',
                }}
              >
                هدايا إليت لعملائها المميزين
              </p>
              <div
                className="w-8 h-px mx-auto mt-2 rounded-full opacity-80"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.65), transparent)' }}
                aria-hidden
              />
            </div>
          </div>
          </div>
        </header>
        <div className="h-[72px] flex-shrink-0 sm:h-0 sm:min-h-0 sm:overflow-hidden" aria-hidden />

        {termsOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-title"
          >
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setTermsOpen(false)}
              aria-hidden
            />
            <div
              className="relative w-full max-h-[85vh] sm:max-h-[85vh] md:max-h-[90vh] max-w-[400px] sm:max-w-xl md:max-w-2xl lg:max-w-3xl rounded-t-2xl sm:rounded-2xl flex flex-col bg-white shadow-xl overflow-hidden"
              style={{
                border: '1px solid rgba(212,175,55,0.3)',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
              }}
            >
              <div
                className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'rgba(212,175,55,0.25)', background: 'linear-gradient(180deg, rgba(248,248,246,0.95) 0%, rgba(255,255,255,0.9) 100%)' }}
              >
                <h2 id="terms-title" className="text-[1rem] font-bold" style={{ color: '#1a1917', fontFamily: 'Tajawal, Cairo, sans-serif' }}>
                  شروط وأحكام – نظام ولاء نزلاء فنادق إليت
                </h2>
                <button
                  type="button"
                  onClick={() => setTermsOpen(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center touch-manipulation transition-colors hover:bg-black/10"
                  style={{ color: '#5c5348' }}
                  aria-label="إغلاق"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-[0.8125rem] sm:text-sm md:text-base" style={{ fontFamily: 'Tajawal, Cairo, sans-serif', color: '#374151', lineHeight: 1.65 }}>
                <ul className="list-disc list-inside space-y-3 ps-1">
                  {getTermsItems(settings.termsText).map((text, i) => (
                    <li key={i} className="text-justify">
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {pendingPrizeBanner && (
          <div
            className="w-full mb-4 px-4 py-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2 animate-fade-in"
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.18) 0%, rgba(248,248,246,0.95) 100%)',
              border: '1px solid rgba(212,175,55,0.45)',
            }}
          >
            <p className="text-[0.8125rem] font-medium" style={{ color: '#2c2825', fontFamily: 'Tajawal, Cairo, sans-serif' }}>
              لديك جائزة معلقة — إرسال للاستقبال
            </p>
            <button
              type="button"
              onClick={handleSendPendingPrize}
              className="min-h-[48px] py-3 px-4 rounded-xl text-white text-[0.9375rem] font-medium whitespace-nowrap transition-colors touch-manipulation"
              style={{
                background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 50%, #b8860b 100%)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              إرسال واتساب
            </button>
          </div>
        )}

        {phase === 'wheel-loading' && !pendingPrizeBanner && (
          <WheelLoadingScreen onComplete={handleWheelLoadingComplete} />
        )}

        {phase === 'wheel' && !pendingPrizeBanner && (
          <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden w-full">
            {availableIndices.length === 0 && (
              <p className="text-center text-amber-800 bg-amber-100/90 rounded-xl px-3 py-2 sm:px-4 sm:py-3 w-full max-w-[432px] sm:max-w-2xl mx-auto mb-2 sm:mb-4 text-sm" data-testid="msg-no-prizes">
                انتهت الجوائز المؤقتاً. الرجاء مراجعة الإعدادات من لوحة التحكم.
              </p>
            )}
            {allowSpinWithoutCheck && availableIndices.length > 0 && (
              <div
                className="w-full mb-2 sm:mb-4 animate-one-try-message flex-shrink-0"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  fontFamily: 'Tajawal, Cairo, sans-serif',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  borderRadius: '0.75rem',
                  padding: '0.625rem 1rem',
                  overflow: 'hidden',
                }}
              >
                <p
                  className="text-center text-[0.875rem] font-medium"
                  style={{ color: '#2c2825' }}
                >
                  مبروك.. ليك محاولة واحدة بس على العجلة
                </p>
                <div
                  className="h-1 rounded-full mt-2.5 mx-0 overflow-hidden"
                  style={{ background: 'rgba(0,0,0,0.06)' }}
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-150 ease-out"
                    style={{
                      width: `${spinProgress * 100}%`,
                      background:
                        spinProgress <= 0
                          ? 'transparent'
                          : 'linear-gradient(90deg, #dc2626 0%, #eab308 50%, #16a34a 100%)',
                      boxShadow:
                        spinProgress > 0.7
                          ? `0 0 ${8 + (spinProgress - 0.7) * 20}px rgba(34,197,94,0.35)`
                          : 'none',
                    }}
                  />
                </div>
              </div>
            )}
            <Wheel
              prizes={settings.prizes}
              onSpinEnd={handleSpinEnd}
              availableIndices={availableIndices}
              disabled={availableIndices.length === 0 || hasSpun}
              onSkipGift={handleSkipGift}
              onSpinRequest={handleSpinRequest}
              skipPhoneCheck={allowSpinWithoutCheck}
              triggerSpin={triggerSpinAt}
              targetWinnerIndex={targetWinnerIndex}
              onSpinClick={allowSpinWithoutCheck ? handleSpinClick : undefined}
              cooldownEndsAt={phase === 'wheel' ? cooldownEndsAt : null}
              onShowPreviousPrize={cooldownEndsAt != null && previousPrizeData != null ? () => setPhase('previous-prize') : undefined}
              onSpinProgress={allowSpinWithoutCheck ? setSpinProgress : undefined}
              guestName={checkedGuest?.name ?? lastRegisteredGuest?.name ?? ''}
              durationMs={Math.max(8000, Math.min(60000, (settings.wheelDurationSec ?? 22) * 1000))}
              spinCount={Math.max(2, Math.min(10, Math.floor(settings.wheelSpinCount ?? 3)))}
            />
          </div>
        )}

        {phase === 'code' && wonPrize && (
          <CodeResult
            code={voucherCode}
            prizeLabel={wonPrize.label}
            guestName={lastRegisteredGuest?.name ?? checkedGuest?.name ?? ''}
            onCopy={handleCopyOrWhatsApp}
            onWhatsApp={handleCopyOrWhatsApp}
          />
        )}

        {phase === 'previous-prize' && previousPrizeData && (
          <PreviousPrizeStep
            prizeLabel={previousPrizeData.prizeLabel}
            code={previousPrizeData.code}
            guestName={checkedGuest?.name ?? ''}
            guestPhone={checkedGuest?.phone ?? lastCheckedPhone ?? ''}
            guestId={checkedGuest?.idLastDigits ? `آخر 4 أرقام: ${checkedGuest.idLastDigits}` : ''}
            onDone={() => {
              setPreviousPrizeData(null)
              setPhase('wheel')
            }}
          />
        )}

        {phase === 'check-phone' && (
          <CheckPhoneStep
            onSubmit={handleCheckPhoneSubmit}
            onLookup={handleLookup}
            onRegisterAndSpin={handleRegisterAndSpin}
            registerPrompt={settings.messages.registerPrompt}
            eligibleNoTierMessage={settings.messages.eligibleNoTier}
            eligibilityError={eligibilityError}
            onClearEligibilityError={() => setEligibilityError('')}
          />
        )}

        {phase === 'phone' && wonPrize && (
          <PhoneStep
            code={voucherCode}
            prizeLabel={wonPrize.label}
            registrationSource={wonPrize.id === 'silver-only' ? 'skip' : 'win'}
            skipPhoneLookup={wonPrize.id === 'silver-only'}
            initialGuest={
              checkedGuest ??
              (lastRegisteredGuest
                ? {
                    phone: lastRegisteredGuest.phone,
                    name: lastRegisteredGuest.name,
                    tier: 'silver' as const,
                    points: 0,
                    pointsToNextTier: null,
                    pointsNextThreshold: null,
                    idLastDigits: lastRegisteredGuest.id.replace(/\D/g, '').slice(-4) || undefined,
                  }
                : null)
            }
            initialPhone={lastCheckedPhone}
            onLookup={handleLookup}
            onRegister={handleRegister}
            onSuccess={(phone) => handlePhoneStepSuccess(phone)}
            onSuccessSound={playSuccess}
            whatsAppNumber={settings.whatsAppNumber}
            registerPrompt={settings.messages.registerPrompt}
            successReception={settings.messages.successReception}
            messages={messages}
            instagramUrl={settings.instagramUrl}
          />
        )}
        </div>
      </main>
      <InstallBanner showAfterSpin={hasSpun} />
    </div>
  )
}
