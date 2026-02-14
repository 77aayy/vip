/**
 * One-Time-Spin مع انتهاء بعد X يوم (من جهاز النزيل) — X من الإعدادات (spinCooldownDays).
 * ⚠️ الوقت من الموبايل — النزيل يقدر يغيّر التاريخ ويتلاعب. التحقق الحقيقي لازم يكون من السيرفر (checkEligibilityUrl) بوقت السيرفر.
 */

import { getSettings } from './storage'

const PREFIX_SPUN = 'wheel_spun_'
const PREFIX_PRIZE = 'wheel_last_prize_'
const DEFAULT_COOLDOWN_DAYS = 15
const MIN_DAYS = 1
const MAX_DAYS = 365
const MS_PER_DAY = 24 * 60 * 60 * 1000

function key(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9)
}

function getCooldownDays(): number {
  const raw = getSettings().spinCooldownDays
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_COOLDOWN_DAYS
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(n)))
}

function isExpired(spunAt: number): boolean {
  return Date.now() - spunAt >= getCooldownDays() * MS_PER_DAY
}

export function getWheelSpun(phone: string): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem(PREFIX_SPUN + key(phone))
    if (!raw) return false
    const spunAt = Number(raw)
    if (Number.isNaN(spunAt) || isExpired(spunAt)) return false
    return true
  } catch {
    return false
  }
}

/** وقت انتهاء الحظر (مللي ثانية) — أو null لو لم يلعب أو انتهت المدة */
export function getCooldownEndsAt(phone: string): number | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PREFIX_SPUN + key(phone))
    if (!raw) return null
    const spunAt = Number(raw)
    if (Number.isNaN(spunAt) || isExpired(spunAt)) return null
    return spunAt + getCooldownDays() * MS_PER_DAY
  } catch {
    return null
  }
}

export interface LastPrizeData {
  prizeLabel: string
  code: string
}

interface StoredPrize {
  prizeLabel: string
  code: string
  spunAt: number
}

export function getLastPrize(phone: string): LastPrizeData | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PREFIX_PRIZE + key(phone))
    if (!raw) return null
    const data = JSON.parse(raw) as StoredPrize
    if (!data?.prizeLabel || !data?.code) return null
    const spunAt = data.spunAt ?? 0
    if (isExpired(spunAt)) return null
    return { prizeLabel: data.prizeLabel, code: data.code }
  } catch {
    return null
  }
}

export function setWheelSpun(phone: string, prizeLabel: string, code: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    const k = key(phone)
    const now = Date.now()
    localStorage.setItem(PREFIX_SPUN + k, String(now))
    localStorage.setItem(PREFIX_PRIZE + k, JSON.stringify({ prizeLabel, code, spunAt: now }))
  } catch {
    // quota / private mode / disabled storage — لا نعطل التطبيق
  }
}
