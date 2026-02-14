import type { ExportSource } from './guestExport'

const PENDING_PRIZE_KEY = 'guest_pending_prize'
const PENDING_EXPORTS_KEY = 'guest_pending_exports'

export interface PendingPrize {
  prizeLabel: string
  code: string
  name?: string
  phone?: string
  /** رقم هوية الضيف (لإدراجه في رسالة واتساب) */
  id?: string
}

export interface PendingExport {
  phone: string
  name: string
  source: ExportSource
}

export function getPendingPrize(): PendingPrize | null {
  try {
    const raw = localStorage.getItem(PENDING_PRIZE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingPrize
  } catch {
    return null
  }
}

export function setPendingPrize(data: PendingPrize): void {
  try {
    localStorage.setItem(PENDING_PRIZE_KEY, JSON.stringify(data))
  } catch {
    // quota / private mode
  }
}

export function clearPendingPrize(): void {
  try {
    localStorage.removeItem(PENDING_PRIZE_KEY)
  } catch {
    // quota / private mode
  }
}

export function getPendingExports(): PendingExport[] {
  try {
    const raw = localStorage.getItem(PENDING_EXPORTS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function addPendingExport(data: PendingExport): void {
  try {
    const list = getPendingExports()
    list.push(data)
    localStorage.setItem(PENDING_EXPORTS_KEY, JSON.stringify(list))
  } catch {
    // quota / private mode
  }
}

export function setPendingExports(list: PendingExport[]): void {
  try {
    localStorage.setItem(PENDING_EXPORTS_KEY, JSON.stringify(list))
  } catch {
    // quota / private mode
  }
}

export function clearPendingExports(): void {
  try {
    localStorage.removeItem(PENDING_EXPORTS_KEY)
  } catch {
    // quota / private mode
  }
}
