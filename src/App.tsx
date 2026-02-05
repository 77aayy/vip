import { Component, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AdminPage } from '@/pages/AdminPage'
import { GuestPage } from '@/pages/GuestPage'

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
        <div className="min-h-screen bg-[#0a0a0a] text-white p-6 font-arabic flex flex-col items-center justify-center">
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

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<GuestPage />} />
        <Route path="/admin" element={
          <AdminErrorBoundary>
            <AdminPage />
          </AdminErrorBoundary>
        } />
      </Routes>
    </BrowserRouter>
  )
}
