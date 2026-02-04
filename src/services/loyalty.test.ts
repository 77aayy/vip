/**
 * اختبار مجمع: سجل العضويات الجديدة + قلب البيانات (lookup من الفضي/الذهبي/البلاتيني/الإيراد).
 * تشغيل: npm run test
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  setSilver,
  setGold,
  setPlatinum,
  setRevenue,
  setSettings,
  getNewMembersLog,
  addSilverMember,
  addNewMemberLog,
  clearNewMembersLog,
} from './storage'
import { defaultSettings } from './mockSettings'
import { lookupGuest } from './lookup'

const KEY = 'loyalty_wheel_data'
const KEY_NEW = 'loyalty_new_members'

beforeEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(KEY)
    localStorage.removeItem(KEY_NEW)
  }
})

describe('سجل العضويات الجديدة — ظهور بيانات الزبون الجديد في السجل', () => {
  it('عند تسجيل عضو جديد (addSilverMember) يظهر في getNewMembersLog', () => {
    addSilverMember('0501234567', 'أحمد محمد', '1234')
    const log = getNewMembersLog()
    expect(log.length).toBe(1)
    expect(log[0].phone).toBe('501234567')
    expect(log[0].name).toBe('أحمد محمد')
    expect(log[0].idLastDigits).toBe('1234')
    expect(log[0].createdAt).toBeGreaterThan(0)
  })

  it('عند تسجيل أكثر من عضو يظهرون في السجل', () => {
    addSilverMember('0501111111', 'أول')
    addSilverMember('0502222222', 'ثاني')
    const log = getNewMembersLog()
    expect(log.length).toBe(2)
    const phones = log.map((e) => e.phone).sort()
    expect(phones).toEqual(['501111111', '502222222'])
    expect(log.find((e) => e.phone === '501111111')?.name).toBe('أول')
    expect(log.find((e) => e.phone === '502222222')?.name).toBe('ثاني')
  })

  it('مسح السجل يفرغ القائمة', () => {
    addNewMemberLog('501234567', 'اختبار')
    expect(getNewMembersLog().length).toBe(1)
    clearNewMembersLog()
    expect(getNewMembersLog().length).toBe(0)
  })
})

describe('قلب البيانات — lookup من إكسيل فضي/ذهبي/بلاتيني وإيراد ونقاط على الريال', () => {
  it('رقم موجود في الفضي + إيراد: يرجع الفئة فضّي ونقاط محسوبة من الإيراد ÷ revenueToPoints', () => {
    setSilver([{ phone: '501234567', name: 'عميل فضي', total_spent: 0 }])
    setRevenue([{ phone: '501234567', total_spent: 5000 }])
    setSettings({ ...defaultSettings, revenueToPoints: 10 })
    const result = lookupGuest('0501234567')
    expect(result).not.toBeNull()
    expect(result!.tier).toBe('silver')
    expect(result!.name).toBe('عميل فضي')
    expect(result!.points).toBe(500)
    expect(result!.pointsNextThreshold).toBe(defaultSettings.pointsSilverToGold)
  })

  it('رقم في الذهبي: يرجع الفئة ذهبي والنقاط من كشف الإيراد', () => {
    setGold([{ phone: '509999999', name: 'عميل ذهبي', total_spent: 0 }])
    setRevenue([{ phone: '509999999', total_spent: 10000 }])
    setSettings({ ...defaultSettings, revenueToPoints: 1 })
    const result = lookupGuest('0509999999')
    expect(result).not.toBeNull()
    expect(result!.tier).toBe('gold')
    expect(result!.points).toBe(10000)
  })

  it('رقم في البلاتيني: يرجع الفئة بلاتيني', () => {
    setPlatinum([{ phone: '508888888', name: 'عميل بلاتيني', total_spent: 0 }])
    setRevenue([{ phone: '508888888', total_spent: 20000 }])
    setSettings({ ...defaultSettings, revenueToPoints: 1 })
    const result = lookupGuest('0508888888')
    expect(result).not.toBeNull()
    expect(result!.tier).toBe('platinum')
    expect(result!.pointsToNextTier == null).toBe(true)
  })

  it('رقم غير موجود في أي ملف: يرجع null', () => {
    setSilver([{ phone: '501234567', name: 'واحد', total_spent: 0 }])
    const result = lookupGuest('0577777777')
    expect(result).toBeNull()
  })

  it('الأدمن يحدد عدد النقاط لكل ريال: revenueToPoints = 5 → إيراد 1000 = 200 نقطة', () => {
    setSilver([{ phone: '506666666', name: 'ن', total_spent: 0 }])
    setRevenue([{ phone: '506666666', total_spent: 1000 }])
    setSettings({ ...defaultSettings, revenueToPoints: 5 })
    const result = lookupGuest('0506666666')
    expect(result).not.toBeNull()
    expect(result!.points).toBe(200)
  })
})
