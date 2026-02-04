import { getSettings } from './storage'
import { getOrCreateSessionToken } from './sessionToken'
import { addPendingExport, getPendingExports, setPendingExports } from './guestPending'

export type ExportSource = 'skip' | 'win'

/** قفل قصير لمنع duplicate entry في الشيت عند الضغط المتكرر على زر الإرسال */
const EXPORT_COOLDOWN_MS = 6000
const recentExports = new Map<string, number>()

function exportLockKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9)
}

/**
 * إرسال بيانات العضو الجديد (فضية) إلى الويب هوك (مثلاً جوجل شيت).
 * مصمم للاستدعاء بدون await (Background Request) حتى لا تُحجب الشاشة أو العجلة.
 * Offline Persistence: عند الفشل (أوفلاين أو زحمة) يُحفظ في LocalStorage ويُرسل عند:
 * - عودة النت (حدث online)
 * - فتح الصفحة تاني (GuestPage يستدعي flushPendingExports عند التحميل إذا النت متوفر).
 * يطبق قفل قصير (6 ثوان) لنفس الرقم لتجنب استهلاك الـ API Quota والـ Duplicate Entry.
 */
export async function exportNewGuest(
  phone: string,
  name: string,
  source: ExportSource,
): Promise<void> {
  const settings = getSettings()
  const url = settings.exportWebhookUrl
  const key = exportLockKey(phone)
  const now = Date.now()
  const last = recentExports.get(key)
  if (last != null && now - last < EXPORT_COOLDOWN_MS) return
  recentExports.set(key, now)
  setTimeout(() => recentExports.delete(key), EXPORT_COOLDOWN_MS)

  const payload = {
    phone: key,
    name: name.trim(),
    source: source === 'skip' ? 'تخطي_الهدية' : 'كسب_العجلة',
    tier: 'فضي',
    at: new Date().toISOString(),
    sessionToken: getOrCreateSessionToken(),
  }

  if (!url || typeof url !== 'string' || url.trim() === '') return

  const maxAttempts = 3
  const baseDelayMs = 2000
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, delay))
      }
      const res = await fetch(url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Export failed')
      return
    } catch {
      // retry with backoff
    }
  }
  addPendingExport({ phone: payload.phone, name: payload.name, source })
}

/**
 * إرسال الطابور المحفوظ عند عودة النت (يُستدعى من GuestPage عند online).
 */
export async function flushPendingExports(): Promise<void> {
  const list = getPendingExports()
  if (list.length === 0) return

  const settings = getSettings()
  const url = settings.exportWebhookUrl
  if (!url?.trim()) return

  const remaining: typeof list = []
  const sessionToken = getOrCreateSessionToken()
  for (const item of list) {
    try {
      await fetch(url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: item.phone,
          name: item.name,
          source: item.source === 'skip' ? 'تخطي_الهدية' : 'كسب_العجلة',
          tier: 'فضي',
          at: new Date().toISOString(),
          sessionToken,
        }),
      })
    } catch {
      remaining.push(item)
    }
  }
  setPendingExports(remaining)
}
