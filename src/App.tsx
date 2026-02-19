import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GuestPage } from '@/pages/GuestPage'

const AdminGate = lazy(() => import('@/components/AdminGate').then((m) => ({ default: m.AdminGate })))
import {
  isFirestoreAvailable,
  getSettingsAsync,
  getPrizeUsageAsync,
} from '@/services/firestoreLoyaltyService'
import { setSettings, setPrizeUsage } from '@/services/storage'

class AdminErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError && this.state.error) {
        return (
        <div className="min-h-screen-dvh bg-[#0a0a0a] text-white p-4 sm:p-6 font-arabic flex flex-col items-center justify-center">
          <h1 className="text-xl font-semibold text-red-300 mb-2">خطأ في تحميل لوحة التحكم</h1>
          <pre className="text-sm text-white/80 bg-white/10 p-4 rounded-xl max-w-lg overflow-auto">
            {this.state.error.message}
          </pre>
          <p className="text-white/60 text-sm mt-4">افتح أدوات المطوّر (F12) → Console لتفاصيل أكثر.</p>
        </div>
      )
    }
    return this.props.children
  }
}

/** عند توفر Firestore: تهيئة التخزين المحلي من السحابة — ليكون مصدر الحقيقة واحد. */
function useFirestoreHydrate(
  setHydrateError: (msg: string) => void,
  retryCount: number
): void {
  const [, setHydrated] = useState(0)
  useEffect(() => {
    if (!isFirestoreAvailable()) return
    let cancelled = false
    Promise.all([getSettingsAsync(), getPrizeUsageAsync()])
      .then(([settings, prizeUsage]) => {
        if (cancelled) return
        setSettings(settings)
        setPrizeUsage(prizeUsage)
        setHydrateError('')
        setHydrated((n) => n + 1)
      })
      .catch(() => {
        if (!cancelled) {
          setHydrateError('تعذّر تحميل البيانات من السحابة. جاري استخدام النسخة المحلية.')
        }
      })
    return () => { cancelled = true }
  }, [setHydrateError, retryCount])
}

function useAdminGatePrefetch(): void {
  useEffect(() => {
    const cb = () => void import('@/components/AdminGate')
    const useIdle = typeof requestIdleCallback !== 'undefined'
    const id = useIdle ? requestIdleCallback(cb, { timeout: 3000 }) : window.setTimeout(cb, 2000)
    return () => {
      if (useIdle) cancelIdleCallback(id as number)
      else clearTimeout(id as number)
    }
  }, [])
}

export default function App() {
  const [hydrateError, setHydrateError] = useState('')
  const [hydrateRetryCount, setHydrateRetryCount] = useState(0)
  useFirestoreHydrate(setHydrateError, hydrateRetryCount)
  useAdminGatePrefetch()
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {hydrateError && (
        <div
          className="fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-amber-900/95 text-amber-100 text-sm text-center font-arabic flex items-center justify-center gap-3"
          role="alert"
        >
          <span>{hydrateError}</span>
          <button
            type="button"
            onClick={() => setHydrateRetryCount((c) => c + 1)}
            className="shrink-0 px-2 py-1 rounded bg-amber-700/50 hover:bg-amber-700 text-amber-200"
            aria-label="إعادة المحاولة"
          >
            إعادة المحاولة
          </button>
          <button
            type="button"
            onClick={() => setHydrateError('')}
            className="shrink-0 px-2 py-1 rounded bg-amber-700/50 hover:bg-amber-700 text-amber-200"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<GuestPage />} />
        <Route path="/admin" element={
          <AdminErrorBoundary>
            <Suspense fallback={
              <div className="min-h-screen-dvh bg-[#0a0a0a] flex items-center justify-center">
                <p className="text-white/70 font-arabic">جاري التحميل...</p>
              </div>
            }>
              <AdminGate />
            </Suspense>
          </AdminErrorBoundary>
        } />
      </Routes>
    </BrowserRouter>
  )
}
