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
} from '@/services/firestoreLoyaltyService'
import { exportNewGuest, flushPendingExports } from '@/services/guestExport'
import { getPendingPrize, setPendingPrize, clearPendingPrize } from '@/services/guestPending'
import { getWheelSpun, getLastPrize, setWheelSpun } from '@/services/wheelSpunStorage'
import { checkSpinEligibility } from '@/services/spinEligibility'
import { appendVerificationSuffix } from '@/utils/whatsappMessage'
import type { GuestLookup, Prize } from '@/types'
import { PreviousPrizeStep } from '@/components/PreviousPrizeStep'

const TERMS_ITEMS: string[] = [
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

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
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

  const pickWinnerIndex = useCallback((): number => {
    const indices = availableIndices
    if (indices.length === 0) return 0
    return indices[Math.floor(Math.random() * indices.length)]
  }, [availableIndices])

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
    if (phone) setWheelSpun(phone, prize.label, code)
    playWin()
    setTimeout(() => setPhase('code'), 2200)
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
      if (found) {
        if (getWheelSpun(phone)) {
          const last = getLastPrize(phone)
          if (last) {
            setCheckedGuest(found)
            setPreviousPrizeData(last)
            setPhase('previous-prize')
          } else {
            setCheckedGuest(found)
            currentSpinPhoneRef.current = found.phone
            setPhase('wheel-loading')
          }
        } else {
          const { allowed, message } = await checkSpinEligibility(phone)
          if (!allowed) {
            setEligibilityError(message ?? 'لا يمكنك اللعب الآن')
            return
          }
          setCheckedGuest(found)
          currentSpinPhoneRef.current = found.phone
          setPhase('wheel-loading')
        }
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
    const body = `🏨 طلب جائزة\n\n👤 الضيف: ${pending.name ?? 'ضيف'}\n📱 الجوال: ${pending.phone ?? '-'}\n🏆 الفئة: -\n🎁 الجائزة: ${pending.prizeLabel}\n🔑 كود التحقق: ${pending.code}\n\nتم الإرسال من صفحة الضيف`
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
  }

  return (
    <div className="min-h-screen-dvh flex flex-col overflow-x-hidden page-bg-leather">
      <main className="relative z-10 flex-1 flex flex-col items-center safe-area-insets pt-6 pb-10 px-4 sm:px-4">
        <div className="w-full max-w-[432px] min-w-0 mx-auto flex flex-col items-center">
        <header className="w-full mb-6">
          <div
            className="w-full flex flex-row items-center gap-3 px-4 py-3.5 rounded-2xl"
            dir="rtl"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(248,248,246,0.6) 100%)',
              border: '1px solid rgba(212,175,55,0.4)',
              boxShadow: '0 6px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <span
              className="inline-flex flex-shrink-0 items-center justify-center"
              style={{
                background: '#e6e0d6',
                isolation: 'isolate',
              }}
            >
              <img
                src="/logo-1.png"
                alt="Elite"
                className="h-16 sm:h-20 w-auto max-w-[140px] sm:max-w-[180px] object-contain"
                decoding="async"
                fetchPriority="high"
                style={{
                  display: 'block',
                  filter: 'sepia(0.85) hue-rotate(328deg) saturate(2.2) brightness(1.15) contrast(1.05)',
                  mixBlendMode: 'multiply',
                }}
              />
            </span>
            <div className="flex-1 min-w-0 relative text-center py-1">
              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                className="absolute top-0 left-0 w-8 h-8 rounded-lg flex items-center justify-center touch-manipulation transition-transform active:scale-95"
                style={{
                  background: 'rgba(212,175,55,0.2)',
                  border: '1px solid rgba(212,175,55,0.4)',
                  color: '#8b6914',
                }}
                title="شروط وأحكام"
                aria-label="شروط وأحكام"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </button>
              <div
                className="w-10 h-px mx-auto mb-2 rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.75), transparent)' }}
                aria-hidden
              />
              <h1
                className="text-[1.25rem] sm:text-[1.4rem] font-bold tracking-tight"
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
                className="text-[0.8rem] sm:text-[0.875rem] mt-1.5 font-medium tracking-wide"
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
        </header>

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
              className="relative w-full max-h-[85vh] sm:max-h-[80vh] max-w-[400px] rounded-t-2xl sm:rounded-2xl flex flex-col bg-white shadow-xl overflow-hidden"
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
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ fontFamily: 'Tajawal, Cairo, sans-serif', fontSize: '0.8125rem', color: '#374151', lineHeight: 1.65 }}>
                {TERMS_ITEMS.map((text, i) => (
                  <p key={i} className="text-justify">
                    {text}
                  </p>
                ))}
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
          <>
            {availableIndices.length === 0 && (
              <p className="text-center text-amber-800 bg-amber-100/90 rounded-xl px-4 py-3 max-w-[432px] mx-auto mb-4" data-testid="msg-no-prizes">
                انتهت الجوائز المؤقتاً. الرجاء مراجعة الإعدادات من لوحة التحكم.
              </p>
            )}
            {allowSpinWithoutCheck && availableIndices.length > 0 && (
              <div
                className="w-full mb-4 animate-one-try-message"
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
              onSpinProgress={allowSpinWithoutCheck ? setSpinProgress : undefined}
              guestName={checkedGuest?.name ?? lastRegisteredGuest?.name ?? ''}
            />
          </>
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
