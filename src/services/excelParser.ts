import * as XLSX from 'xlsx'
import type { MemberRow, RevenueRow } from '@/types'

function normalizePhone(v: unknown): string {
  if (v == null) return ''
  const s = String(v).replace(/\D/g, '')
  return s.slice(-9)
}

function num(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function findColIndex(row: unknown[], keys: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const cell = str(row[i]).toLowerCase().replace(/\s/g, '')
    for (const k of keys) {
      if (cell.includes(k) || k.includes(cell)) return i
    }
  }
  return -1
}

export function parseMemberFile(file: File): Promise<MemberRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) return resolve([])
        const wb = XLSX.read(data, { type: 'binary' })
        const first = wb.SheetNames[0]
        if (!first) return resolve([])
        const ws = wb.Sheets[first]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        if (rows.length < 2) return resolve([])
        const header = rows[0] as unknown[]
        const phoneIdx = findColIndex(header, ['phone', 'جوال', 'رقم', 'mobile', 'tel'])
        const nameIdx = findColIndex(header, ['name', 'اسم', 'اسم العميل'])
        const spentIdx = findColIndex(header, ['total_spent', 'totalspent', 'spent', 'إيراد', 'ايراد', 'مبلغ'])
        if (phoneIdx < 0) return resolve([])
        const out: MemberRow[] = []
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[]
          const phone = normalizePhone(row[phoneIdx])
          if (!phone) continue
          out.push({
            phone,
            name: nameIdx >= 0 ? str(row[nameIdx]) : '',
            total_spent: spentIdx >= 0 ? num(row[spentIdx]) : 0,
          })
        }
        resolve(out)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsBinaryString(file)
  })
}

export function parseRevenueFile(file: File): Promise<RevenueRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) return resolve([])
        const wb = XLSX.read(data, { type: 'binary' })
        const first = wb.SheetNames[0]
        if (!first) return resolve([])
        const ws = wb.Sheets[first]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        if (rows.length < 2) return resolve([])
        const header = rows[0] as unknown[]
        const phoneIdx = findColIndex(header, ['phone', 'جوال', 'رقم', 'mobile', 'tel'])
        const spentIdx = findColIndex(header, ['total_spent', 'totalspent', 'spent', 'إيراد', 'ايراد', 'مبلغ', 'revenue'])
        if (phoneIdx < 0) return resolve([])
        const out: RevenueRow[] = []
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[]
          const phone = normalizePhone(row[phoneIdx])
          if (!phone) continue
          out.push({
            phone,
            total_spent: spentIdx >= 0 ? num(row[spentIdx]) : 0,
          })
        }
        resolve(out)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsBinaryString(file)
  })
}
