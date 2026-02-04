/**
 * التحقق من الأهلية قبل بدء العجلة.
 * لو checkEligibilityUrl مضبوط، العجلة لا تبدأ إلا بعد تأكيد السيرفر أن هذا الرقم "لم يسبق له اللعب اليوم".
 * مع Google Apps Script: استخدم google.script.run.withSuccessHandler قبل الانتقال لشاشة العجلة.
 */

import { getSettings } from './storage'
import { getOrCreateSessionToken } from './sessionToken'

export interface EligibilityResult {
  allowed: boolean
  message?: string
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
    const data = (await res.json()) as { allowed?: boolean; message?: string }
    return {
      allowed: data.allowed === true,
      message: data.message ?? (data.allowed === true ? undefined : 'لا يمكنك اللعب الآن'),
    }
  } catch {
    return { allowed: false, message: 'تعذر التحقق. تحقق من الاتصال وحاول مرة أخرى.' }
  }
}
