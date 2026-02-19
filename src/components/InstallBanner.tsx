/**
 * بانر تثبيت التطبيق — يظهر مرة واحدة لكل جهاز بعد أول لفة للعجلة.
 * عند «لا» يختفي ولا يظهر ثانية. عند «تثبيت» يفتح نافذة التثبيت (أندرويد) أو يوضح خطوات أبل.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'loyalty_install_dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true
  return (
    (window as Window & { navigator: { standalone?: boolean } }).navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

function isDismissed(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

interface InstallBannerProps {
  /** يظهر البانر فقط عندما يكون true (مثلاً بعد أول لفة للعجلة) */
  showAfterSpin?: boolean
}

export function InstallBanner({ showAfterSpin = false }: InstallBannerProps) {
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const deferredPromptRef = useRef<{ prompt: () => Promise<{ outcome: string }> } | null>(null)

  useEffect(() => {
    if (isStandalone() || isDismissed()) return
    if (showAfterSpin === false) return
    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(ios)
    setVisible(true)
  }, [showAfterSpin])

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e as unknown as { prompt: () => Promise<{ outcome: string }> }
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(() => {
    const markDismissed = () => {
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // quota / private mode
      }
      setVisible(false)
    }
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt().then(({ outcome }) => {
        if (outcome === 'accepted' || outcome === 'dismissed') markDismissed()
      })
    } else {
      markDismissed()
    }
  }, [])

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // quota / private mode
    }
    setVisible(false)
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 px-3 sm:px-4 pb-3 sm:pb-4 safe-area-pb"
      style={{
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
      }}
      role="dialog"
      aria-label="تثبيت التطبيق"
    >
      <div
        className="mx-auto max-w-[432px] rounded-2xl p-4 shadow-lg border-2 flex flex-col gap-3"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,248,246,0.98) 100%)',
          borderColor: 'rgba(212,175,55,0.5)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
          fontFamily: 'Tajawal, Cairo, sans-serif',
        }}
      >
        <p className="text-[0.9375rem] font-medium text-center" style={{ color: '#1a1917' }}>
          ثبّت تطبيق عجلة الولاء على جهازك — وصول أسرع بدون متصفح
        </p>
        <div className="flex flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={handleInstall}
            className="flex-1 min-h-[48px] py-3 rounded-xl text-white font-bold text-[0.9375rem] touch-manipulation active:scale-[0.98]"
            style={{
              background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 50%, #b8860b 100%)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {isIOS ? 'كيف أُثبّت' : 'تثبيت'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 min-h-[48px] py-3 rounded-xl font-medium text-[0.9375rem] touch-manipulation active:scale-[0.98] border-2"
            style={{
              borderColor: 'rgba(212,175,55,0.6)',
              color: '#5c5348',
              background: 'rgba(255,255,255,0.8)',
            }}
          >
            لا، شكراً
          </button>
        </div>
        {isIOS && (
          <p className="text-[0.75rem] text-center" style={{ color: '#5c5348' }}>
            من Safari: مشاركة ← إضافة إلى الشاشة الرئيسية
          </p>
        )}
      </div>
    </div>
  )
}
