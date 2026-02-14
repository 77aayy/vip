import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { validateAdminCode, setAdminSession } from '@/services/adminAuth'

export function AdminLoginPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = code.trim()
    if (!trimmed) {
      setError('أدخل كود الدخول')
      return
    }
    setLoading(true)
    if (validateAdminCode(trimmed)) {
      setAdminSession()
      navigate('/admin', { replace: true })
      return
    }
    setError('كود الدخول غير صحيح')
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background: 'linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 50%, #0a0a0a 100%)',
        fontFamily: 'Tajawal, Cairo, sans-serif',
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 sm:p-8 shadow-xl border border-white/10"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h1 className="text-xl font-bold text-white text-center mb-1">لوحة التحكم</h1>
        <p className="text-white/50 text-sm text-center mb-6">أدخل كود الدخول للمتابعة</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-code" className="block text-white/70 text-sm mb-2">
              كود الدخول
            </label>
            <input
              id="admin-code"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50"
              disabled={loading}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm text-center" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-medium text-white transition-colors disabled:opacity-50"
            style={{
              background: 'linear-gradient(180deg, #14b8a6 0%, #0d9488 100%)',
              boxShadow: '0 2px 8px rgba(20, 184, 166, 0.3)',
            }}
          >
            {loading ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>
        <p className="text-white/40 text-xs text-center mt-4">
          صفحة الضيف: <a href="/" className="text-primary-400 hover:underline">عجلة الولاء</a>
        </p>
      </div>
    </div>
  )
}
