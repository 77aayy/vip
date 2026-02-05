/**
 * تقدير استخدام Firestore اليومي (من هذا المتصفح فقط)
 * الحصة المجانية: 50K قراءة، 20K كتابة يومياً
 * يُصفَّر تلقائياً عند منتصف ليل Pacific (توقيت Firebase)
 */
const KEY = 'firestore_usage'
const READS_LIMIT = 50_000
const WRITES_LIMIT = 20_000
const FIREBASE_TZ = 'America/Los_Angeles'

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: FIREBASE_TZ })
}

function getStored(): { date: string; reads: number; writes: number } {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { date: todayKey(), reads: 0, writes: 0 }
    const parsed = JSON.parse(raw) as { date: string; reads: number; writes: number }
    if (parsed.date !== todayKey()) return { date: todayKey(), reads: 0, writes: 0 }
    return parsed
  } catch {
    return { date: todayKey(), reads: 0, writes: 0 }
  }
}

function save(data: { date: string; reads: number; writes: number }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

export function trackReads(count: number): void {
  const d = getStored()
  d.reads += count
  save(d)
}

export function trackWrites(count: number): void {
  const d = getStored()
  d.writes += count
  save(d)
}

export function getUsage(): {
  reads: number
  writes: number
  readPercent: number
  writePercent: number
  readsRemaining: number
  writesRemaining: number
} {
  const d = getStored()
  const readPercent = Math.min(100, Math.round((d.reads / READS_LIMIT) * 100))
  const writePercent = Math.min(100, Math.round((d.writes / WRITES_LIMIT) * 100))
  return {
    reads: d.reads,
    writes: d.writes,
    readPercent,
    writePercent,
    readsRemaining: Math.max(0, READS_LIMIT - d.reads),
    writesRemaining: Math.max(0, WRITES_LIMIT - d.writes),
  }
}
