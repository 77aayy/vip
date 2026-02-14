/**
 * التخزين المحلي (localStorage) — مصدر القراءة/الكتابة المتزامن.
 * قاعدة المصدر: إن وُجد Firestore فهو مصدر الحقيقة؛ يتم تهيئة التخزين المحلي منه عند فتح التطبيق (App)
 * وأي حفظ من الأدمن يكتب إلى الاثنين. إن لم يُهيّأ Firestore فالتخزين المحلي هو المصدر الوحيد.
 */
import type { MemberRow, RevenueRow, Settings, StoredData } from '@/types'
import type { RevenueParseRow } from './excelParser'
import { defaultSettings } from './mockSettings'

const KEY = 'loyalty_wheel_data'
const KEY_NEW_MEMBERS = 'loyalty_new_members'
const KEY_REVENUE_MAPPING = 'revenue_id_phone_mapping'
/** نسخة الإيراد الخام (قبل الربط) — لإعادة الربط عند تحديث ملف العملاء/الربط */
const KEY_RAW_REVENUE = 'revenue_raw_parse'

export interface RevenueMappingRow {
  idNumber?: string
  name?: string
  phone: string
}

export function getRevenueMapping(): RevenueMappingRow[] {
  try {
    const raw = localStorage.getItem(KEY_REVENUE_MAPPING)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RevenueMappingRow[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function setRevenueMapping(rows: RevenueMappingRow[]): void {
  try {
    localStorage.setItem(KEY_REVENUE_MAPPING, JSON.stringify(rows))
  } catch {
    // ignore
  }
}

export function getRawRevenue(): RevenueParseRow[] {
  try {
    const raw = localStorage.getItem(KEY_RAW_REVENUE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RevenueParseRow[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function setRawRevenue(rows: RevenueParseRow[]): void {
  try {
    localStorage.setItem(KEY_RAW_REVENUE, JSON.stringify(rows))
  } catch {
    // ignore
  }
}

export interface NewMemberLogEntry {
  id: string
  phone: string
  name: string
  idLastDigits?: string
  createdAt: number
}

function getNewMembersRaw(): NewMemberLogEntry[] {
  try {
    const raw = localStorage.getItem(KEY_NEW_MEMBERS)
    if (!raw) return []
    const parsed = JSON.parse(raw) as NewMemberLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getNewMembersLog(): NewMemberLogEntry[] {
  return getNewMembersRaw().sort((a, b) => b.createdAt - a.createdAt)
}

export function addNewMemberLog(phone: string, name: string, idLastDigits?: string): void {
  try {
    const list = getNewMembersRaw()
    const normalized = phone.replace(/\D/g, '').slice(-9)
    const entry: NewMemberLogEntry = {
      id: `local-${Date.now()}-${normalized}`,
      phone: normalized,
      name: name.trim(),
      ...(idLastDigits != null && idLastDigits !== '' && { idLastDigits: idLastDigits.replace(/\D/g, '').slice(-4) }),
      createdAt: Date.now(),
    }
    list.push(entry)
    localStorage.setItem(KEY_NEW_MEMBERS, JSON.stringify(list))
  } catch {
    // quota / private mode / disabled storage
  }
}

export function clearNewMembersLog(): void {
  try {
    localStorage.removeItem(KEY_NEW_MEMBERS)
  } catch {
    // quota / private mode / disabled storage
  }
}

function getStored(): StoredData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return getEmpty()
    const parsed = JSON.parse(raw) as StoredData
    return {
      silver: Array.isArray(parsed.silver) ? parsed.silver : [],
      gold: Array.isArray(parsed.gold) ? parsed.gold : [],
      platinum: Array.isArray(parsed.platinum) ? parsed.platinum : [],
      revenue: Array.isArray(parsed.revenue) ? parsed.revenue : [],
      settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings as Settings : null,
      prizeUsage: parsed.prizeUsage && typeof parsed.prizeUsage === 'object' ? parsed.prizeUsage as Record<string, number> : {},
    }
  } catch {
    return getEmpty()
  }
}

function getEmpty(): StoredData {
  return {
    silver: [],
    gold: [],
    platinum: [],
    revenue: [],
    settings: null,
    prizeUsage: {},
  }
}

export function getStorage(): StoredData {
  return getStored()
}

export function setSilver(rows: MemberRow[]): void {
  try {
    const d = getStored()
    d.silver = rows
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // quota / private mode / disabled storage
  }
}

export function setGold(rows: MemberRow[]): void {
  try {
    const d = getStored()
    d.gold = rows
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // quota / private mode / disabled storage
  }
}

export function setPlatinum(rows: MemberRow[]): void {
  try {
    const d = getStored()
    d.platinum = rows
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // quota / private mode / disabled storage
  }
}

export function setRevenue(rows: RevenueRow[]): void {
  try {
    const d = getStored()
    d.revenue = rows
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // quota / private mode / disabled storage
  }
}

export function setSettings(settings: Settings): void {
  try {
    const d = getStored()
    d.settings = settings
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // quota / private mode / disabled storage
  }
}

export function getSettings(): Settings {
  const d = getStored()
  return d.settings ?? defaultSettings
}

export function getSilver(): MemberRow[] {
  return getStored().silver
}

export function getGold(): MemberRow[] {
  return getStored().gold
}

export function getPlatinum(): MemberRow[] {
  return getStored().platinum
}

export function getRevenue(): RevenueRow[] {
  return getStored().revenue
}

export function addSilverMember(phone: string, name: string, idLastDigits?: string): void {
  const list = getSilver()
  const normalized = phone.replace(/\D/g, '').slice(-9)
  const existing = list.find((r) => r.phone.replace(/\D/g, '').slice(-9) === normalized)
  if (existing) {
    if (idLastDigits != null && idLastDigits !== '') existing.idLastDigits = idLastDigits.replace(/\D/g, '').slice(-4)
    setSilver(list)
    return
  }
  list.push({
    phone: normalized,
    name,
    total_spent: 0,
    ...(idLastDigits != null && idLastDigits !== '' && { idLastDigits: idLastDigits.replace(/\D/g, '').slice(-4) }),
  })
  setSilver(list)
  addNewMemberLog(phone, name, idLastDigits)
}

export function getPrizeUsage(): Record<string, number> {
  return getStored().prizeUsage ?? {}
}

/** استبدال عدّ استخدام الجوائز (مثلاً بعد التهيئة من Firestore). */
export function setPrizeUsage(usage: Record<string, number>): void {
  try {
    const d = getStored()
    d.prizeUsage = usage ?? {}
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // quota / private mode / disabled storage
  }
}

export function incrementPrizeUsage(prizeId: string): void {
  try {
    const d = getStored()
    const usage = { ...(d.prizeUsage ?? {}) }
    usage[prizeId] = (usage[prizeId] ?? 0) + 1
    d.prizeUsage = usage
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // quota / private mode / disabled storage
  }
}
