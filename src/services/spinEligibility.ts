/**
 * التحقق من الأهلية قبل بدء العجلة.
 * لو checkEligibilityUrl مضبوط، السيرفر يكون مصدر الحقيقة: العجلة لا تبدأ إلا بعد تأكيد السيرفر،
 * ووقت انتهاء الحظر (cooldownEndsAt) من السيرفر يُستخدم للعرض.
 * بعد لفة ناجحة يُستدعى recordSpinOnServer ليُسجّل السيرفر آخر تاريخ لفة (وقت السيرفر).
 */

import { getSettings } from './storage'
import { getOrCreateSessionToken } from './sessionToken'

export interface EligibilityResult {
  allowed: boolean
  message?: string
  /** وقت انتهاء الحظر (مللي ثانية منذ epoch) — من السيرفر للعرض في التايمر */
  cooldownEndsAt?: number
}

export async function checkSpinEligibility(phone: string): Promise<EligibilityResult> {
  const settings = getSettings()
  const url = settings.checkEligibilityUrl
  if (!url || typeof url !== 'string' || url.trim() === '') return { allowed: true }

  const normalized = phone.replace(/\D/g, '').slice(-9)
  const sessionToken = getOrCreateSessionToken()

  try {
    const res = await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: normalized,
        sessionToken,
        at: new Date().toISOString(),
      }),
    })
    if (!res.ok) return { allowed: false, message: 'لا يمكنك اللعب الآن' }
    const data = (await res.json()) as {
      allowed?: boolean
      message?: string
      cooldownEndsAt?: number
    }
    let cooldownEndsAt: number | undefined
    if (typeof data.cooldownEndsAt === 'number' && data.cooldownEndsAt > 0) {
      cooldownEndsAt = data.cooldownEndsAt
    }
    return {
      allowed: data.allowed === true,
      message: data.message ?? (data.allowed === true ? undefined : 'لا يمكنك اللعب الآن'),
      cooldownEndsAt,
    }
  } catch {
    return { allowed: false, message: 'تعذر التحقق. تحقق من الاتصال وحاول مرة أخرى.' }
  }
}

/**
 * تسجيل لفة ناجحة على السيرفر (وقت السيرفر) — ليظل السيرفر مصدر الحقيقة.
 * يُستدعى بعد handleSpinEnd؛ الفشل لا يمنع تجربة المستخدم (التخزين المحلي يُحدّث في الفرونت).
 */
export async function recordSpinOnServer(phone: string): Promise<void> {
  const settings = getSettings()
  const url = settings.checkEligibilityUrl
  if (!url || typeof url !== 'string' || url.trim() === '') return

  const normalized = phone.replace(/\D/g, '').slice(-9)
  const sessionToken = getOrCreateSessionToken()

  try {
    await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: normalized,
        sessionToken,
        at: new Date().toISOString(),
        action: 'recordSpin',
      }),
    })
  } catch {
    // لا نعطل تجربة المستخدم؛ السيرفر قد يعيد المحاولة لاحقاً أو يُسجّل من قناة أخرى
  }
}
