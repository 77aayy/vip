/**
 * تصدير نسخة احتياطية — القوائم (فضي، ذهبي، بلاتيني، إيراد) إلى ملف إكسل واحد.
 */
import * as XLSX from 'xlsx'
import type { MemberRow, RevenueRow } from '@/types'

const SHEET_SILVER = 'فضي'
const SHEET_GOLD = 'ذهبي'
const SHEET_PLATINUM = 'بلاتيني'
const SHEET_REVENUE = 'إيراد'

function memberToRows(rows: MemberRow[]): unknown[][] {
  if (rows.length === 0) return [['جوال', 'الاسم', 'الإيراد', 'آخر 4 هوية', 'رقم الهوية']]
  const header = ['جوال', 'الاسم', 'الإيراد', 'آخر 4 هوية', 'رقم الهوية']
  const data = rows.map((r) => [
    r.phone,
    r.name ?? '',
    r.total_spent ?? 0,
    r.idLastDigits ?? '',
    r.idNumber ?? '',
  ])
  return [header, ...data]
}

function revenueToRows(rows: RevenueRow[]): unknown[][] {
  if (rows.length === 0) return [['جوال', 'الإيراد']]
  const header = ['جوال', 'الإيراد']
  const data = rows.map((r) => [r.phone, r.total_spent ?? 0])
  return [header, ...data]
}

export function exportBackupToExcel(
  silver: MemberRow[],
  gold: MemberRow[],
  platinum: MemberRow[],
  revenue: RevenueRow[]
): void {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(memberToRows(silver)), SHEET_SILVER)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(memberToRows(gold)), SHEET_GOLD)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(memberToRows(platinum)), SHEET_PLATINUM)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(revenueToRows(revenue)), SHEET_REVENUE)
  const name = `نسخة-احتياطية-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, name)
}
