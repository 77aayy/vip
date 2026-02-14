import { isAdminAuthenticated } from '@/services/adminAuth'
import { AdminLoginPage } from '@/pages/AdminLoginPage'
import { AdminPage } from '@/pages/AdminPage'

/**
 * يتحقق من جلسة الأدمن: إن لم تكن صالحة يعرض صفحة الدخول، وإلا يعرض لوحة التحكم.
 */
export function AdminGate() {
  if (!isAdminAuthenticated()) {
    return <AdminLoginPage />
  }
  return <AdminPage />
}
