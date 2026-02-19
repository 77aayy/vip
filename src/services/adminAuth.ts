/**
 * تحقق دخول الأدمن — كود الدخول فقط (بدون مستخدمين متعددين).
 * الجلسة تُخزَّن في sessionStorage مع انتهاء صلاحية بعد 24 ساعة.
 * عند توفر Firebase: التحقق عبر Cloud Function (السيرفر). وإلا: التحقق المحلي من VITE_ADMIN_CODE.
 */

import { getFirebaseApp } from './firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'

const STORAGE_KEY = 'adminSession'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 ساعة

/** كود الدخول — من متغير البيئة (للتحقق المحلي عند عدم توفر Firebase) */
function getAdminCode(): string {
  const v = import.meta.env.VITE_ADMIN_CODE
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

/** التحقق المحلي — يُستخدم عند عدم توفر Firebase */
export function validateAdminCode(code: string): boolean {
  const expected = getAdminCode()
  if (!expected) return false
  return code.trim() === expected
}

export interface ValidateAdminResult {
  valid: boolean
  error?: string
}

/** التحقق عبر Cloud Function عند توفر Firebase، وإلا التحقق المحلي */
export async function validateAdminCodeAsync(code: string): Promise<ValidateAdminResult> {
  const app = getFirebaseApp()
  if (app) {
    try {
      const functions = getFunctions(app, 'us-central1')
      const fn = httpsCallable<{ code: string }, ValidateAdminResult>(functions, 'validateAdminToken')
      const { data } = await fn({ code })
      return data
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { valid: false, error: msg }
    }
  }
  return { valid: validateAdminCode(code) }
}

export function setAdminSession(): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    // quota / private mode — sessionStorage غير متاح
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
    // quota / private mode — sessionStorage غير متاح
  }
}
