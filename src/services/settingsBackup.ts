/**
 * نسخ احتياطي للإعدادات في localStorage — آخر 3 نسخ فقط.
 * لا يرسل بيانات لأي سيرفر.
 */

import type { Settings } from '@/types'

const PREFIX = 'settings_backup_'
const MAX_BACKUPS = 3

export interface BackupEntry {
  key: string
  timestamp: number
  settings: Settings
}

function getBackupKeys(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    return keys.sort((a, b) => {
      const ta = parseInt(a.replace(PREFIX, ''), 10) || 0
      const tb = parseInt(b.replace(PREFIX, ''), 10) || 0
      return tb - ta
    })
  } catch {
    return []
  }
}

/** حفظ نسخة احتياطية — يُستدعى عند نجاح حفظ الإعدادات */
export function saveSettingsBackup(settings: Settings): void {
  try {
    if (typeof localStorage === 'undefined') return
    const key = `${PREFIX}${Date.now()}`
    localStorage.setItem(key, JSON.stringify(settings))
    const keys = getBackupKeys()
    keys.slice(MAX_BACKUPS).forEach((k) => localStorage.removeItem(k))
  } catch {
    // quota / private mode
  }
}

/** قائمة النسخ الاحتياطية (الأحدث أولاً) */
export function listSettingsBackups(): BackupEntry[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const keys = getBackupKeys()
    const entries: BackupEntry[] = []
    for (const k of keys) {
      const raw = localStorage.getItem(k)
      if (!raw) continue
      try {
        const settings = JSON.parse(raw) as Settings
        const timestamp = parseInt(k.replace(PREFIX, ''), 10) || 0
        entries.push({ key: k, timestamp, settings })
      } catch {
        localStorage.removeItem(k)
      }
    }
    return entries
  } catch {
    return []
  }
}

/** استعادة إعدادات من نسخة احتياطية */
export function restoreFromBackup(entry: BackupEntry): Settings {
  return entry.settings
}
