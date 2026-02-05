import type { MemberRow, RevenueRow, Settings, StoredData } from '@/types'
import { defaultSettings } from './mockSettings'

const KEY = 'loyalty_wheel_data'
const KEY_NEW_MEMBERS = 'loyalty_new_members'
const KEY_REVENUE_MAPPING = 'revenue_id_phone_mapping'

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
}

export function clearNewMembersLog(): void {
  localStorage.removeItem(KEY_NEW_MEMBERS)
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
  const d = getStored()
  d.silver = rows
  localStorage.setItem(KEY, JSON.stringify(d))
}

export function setGold(rows: MemberRow[]): void {
  const d = getStored()
  d.gold = rows
  localStorage.setItem(KEY, JSON.stringify(d))
}

export function setPlatinum(rows: MemberRow[]): void {
  const d = getStored()
  d.platinum = rows
  localStorage.setItem(KEY, JSON.stringify(d))
}

export function setRevenue(rows: RevenueRow[]): void {
  const d = getStored()
  d.revenue = rows
  localStorage.setItem(KEY, JSON.stringify(d))
}

export function setSettings(settings: Settings): void {
  const d = getStored()
  d.settings = settings
  localStorage.setItem(KEY, JSON.stringify(d))
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

export function incrementPrizeUsage(prizeId: string): void {
  const d = getStored()
  const usage = { ...(d.prizeUsage ?? {}) }
  usage[prizeId] = (usage[prizeId] ?? 0) + 1
  d.prizeUsage = usage
  localStorage.setItem(KEY, JSON.stringify(d))
}
