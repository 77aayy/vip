import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AdminPage } from '@/pages/AdminPage'
import { GuestPage } from '@/pages/GuestPage'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<GuestPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}
