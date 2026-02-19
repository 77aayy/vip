/**
 * تسجيل تجارب المستخدم (UX) — عدادات بدون بيانات شخصية.
 * يُستخدم sessionStorage (تُفقد عند إغلاق التبويب) أو ذاكرة محلية.
 * الهدف: قياس معدلات إتمام الخطوات (تحويلات) دون انتهاك الخصوصية.
 */

const UX_STORAGE_KEY = 'ux_analytics'

type UXEvent = 'lookup_started' | 'lookup_completed' | 'register_started' | 'spin_completed'

const memoryCounts: Record<UXEvent, number> = {
  lookup_started: 0,
  lookup_completed: 0,
  register_started: 0,
  spin_completed: 0,
}

function loadFromStorage(): Record<UXEvent, number> {
  try {
    if (typeof sessionStorage === 'undefined') return { ...memoryCounts }
    const raw = sessionStorage.getItem(UX_STORAGE_KEY)
    if (!raw) return { ...memoryCounts }
    const parsed = JSON.parse(raw) as Record<string, number>
    return {
      lookup_started: Number(parsed.lookup_started) || 0,
      lookup_completed: Number(parsed.lookup_completed) || 0,
      register_started: Number(parsed.register_started) || 0,
      spin_completed: Number(parsed.spin_completed) || 0,
    }
  } catch {
    return { ...memoryCounts }
  }
}

function saveToStorage(counts: Record<UXEvent, number>): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(UX_STORAGE_KEY, JSON.stringify(counts))
  } catch {
    // quota / private mode
  }
}

/** تسجيل حدث UX (بدون بيانات شخصية) */
export function trackUXEvent(event: UXEvent): void {
  const counts = loadFromStorage()
  counts[event] = (counts[event] || 0) + 1
  saveToStorage(counts)
}

/** قراءة العدادات الحالية (للعرض الاختياري أو تصدير) */
export function getUXCounts(): Record<UXEvent, number> {
  return loadFromStorage()
}
