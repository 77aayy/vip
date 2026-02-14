/**
 * تحقق دخول الأدمن — كود الدخول فقط (بدون مستخدمين متعددين).
 * الجلسة تُخزَّن في sessionStorage مع انتهاء صلاحية بعد 24 ساعة.
 */

const STORAGE_KEY = 'adminSession'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 ساعة

/** كود الدخول — يُتحقق منه فقط (لا يُعرض في واجهة المستخدم) */
const ADMIN_ACCESS_CODE = 'ayman5255'

export function validateAdminCode(code: string): boolean {
  return code.trim() === ADMIN_ACCESS_CODE
}

export function setAdminSession(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    // ignore (e.g. private mode quota)
  }
}

export function isAdminAuthenticated(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < SESSION_TTL_MS
  } catch {
    return false
  }
}

export function clearAdminSession(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
