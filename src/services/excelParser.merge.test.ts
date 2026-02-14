/**
 * اختبار دمج الإيراد بمطابقة 100% (اسم + جوال أو هوية).
 */
import { describe, it, expect } from 'vitest'
import {
  mergeRevenueUpdateWithStrictMatch,
  type ExistingRevenueRecord,
  type RevenueParseRow,
} from './excelParser'

describe('mergeRevenueUpdateWithStrictMatch', () => {
  it('يدمج صفاً واحداً عند مطابقة اسم + جوال 100%', () => {
    const existing: ExistingRevenueRecord[] = [
      { phone: '501234567', name: 'أحمد محمد', idNumber: '1234567890', total_spent: 1000 },
    ]
    const update: RevenueParseRow[] = [
      { phone: '0501234567', name: 'أحمد محمد', total_spent: 500 },
    ]
    const { merged, report } = mergeRevenueUpdateWithStrictMatch(existing, update)
    expect(report.mergedCount).toBe(1)
    expect(report.totalAddedAmount).toBe(500)
    expect(report.skipped).toHaveLength(0)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.phone).toBe('501234567')
    expect(merged[0]!.total_spent).toBe(1500)
  })

  it('يتخطى الصف عند عدم وجود مطابق (no-match)', () => {
    const existing: ExistingRevenueRecord[] = [
      { phone: '501234567', name: 'أحمد محمد', idNumber: '1234567890', total_spent: 1000 },
    ]
    const update: RevenueParseRow[] = [
      { phone: '509999999', name: 'أحمد محمد', total_spent: 500 },
    ]
    const { merged, report } = mergeRevenueUpdateWithStrictMatch(existing, update)
    expect(report.mergedCount).toBe(0)
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]!.reason).toBe('no-match')
    expect(merged[0]!.total_spent).toBe(1000)
  })

  it('يتخطى الصف عند أكثر من مطابق (لا دمج عشوائي)', () => {
    const existing: ExistingRevenueRecord[] = [
      { phone: '501111111', name: 'أحمد علي', idNumber: '1234567890', total_spent: 100 },
      { phone: '502222222', name: 'أحمد علي', idNumber: '1234567890', total_spent: 200 },
    ]
    const update: RevenueParseRow[] = [
      { name: 'أحمد علي', idNumber: '1234567890', total_spent: 50 },
    ]
    const { report } = mergeRevenueUpdateWithStrictMatch(existing, update)
    expect(report.mergedCount).toBe(0)
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]!.reason).toBe('multiple-matches')
  })

  it('يتخطى الصف عند ناقص اسم (no-name-or-id)', () => {
    const existing: ExistingRevenueRecord[] = [
      { phone: '501234567', name: 'أحمد', idNumber: '', total_spent: 1000 },
    ]
    const update: RevenueParseRow[] = [
      { phone: '0501234567', name: '', total_spent: 500 },
    ]
    const { merged, report } = mergeRevenueUpdateWithStrictMatch(existing, update)
    expect(report.mergedCount).toBe(0)
    expect(report.skipped[0]!.reason).toBe('no-name-or-id')
    expect(merged[0]!.total_spent).toBe(1000)
  })
})
