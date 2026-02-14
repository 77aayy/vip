/**
 * سجل تدقيق — رفع ملفات وتغيير إعدادات (للعرض في لوحة الأدمن).
 */

export interface AuditLogEntry {
  id?: string
  action: 'upload' | 'settings'
  /** مفتاح الرفع: silver | gold | platinum | revenue */
  key?: string
  fileName?: string
  count?: number
  /** دمج إيراد: عدد المُدمج */
  mergeCount?: number
  at: number
}

const STORAGE_KEY = 'audit_log'
const MAX_LOCAL = 200

function getLocalLog(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown[]
    return Array.isArray(arr) ? arr.filter((e): e is AuditLogEntry => e != null && typeof e === 'object' && 'action' in e && 'at' in e) : []
  } catch {
    return []
  }
}

function setLocalLog(entries: AuditLogEntry[]): void {
  try {
    const slice = entries.slice(-MAX_LOCAL)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slice))
  } catch {
    // ignore
  }
}

/** إضافة حدث إلى السجل المحلي (يُستدعى دائماً كنسخة احتياطية أو عند عدم Firestore). */
export function appendAuditLogLocal(entry: Omit<AuditLogEntry, 'id'>): void {
  const list = getLocalLog()
  list.push({ ...entry })
  setLocalLog(list)
}

/** جلب آخر أحداث السجل من التخزين المحلي. */
export function getAuditLogLocal(limit: number = 50): AuditLogEntry[] {
  const list = getLocalLog()
  return list.slice(-limit).reverse()
}
