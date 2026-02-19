/**
 * اختبار التحقق من الأهلية للعب.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkSpinEligibility } from './spinEligibility'
import { setSettings } from './storage'
import { defaultSettings } from './mockSettings'

beforeEach(() => {
  setSettings({ ...defaultSettings, checkEligibilityUrl: '' })
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('spinEligibility.checkSpinEligibility', () => {
  it('عند عدم ضبط checkEligibilityUrl يرجع allowed: true', async () => {
    setSettings({ ...defaultSettings, checkEligibilityUrl: '' })
    const result = await checkSpinEligibility('0501234567')
    expect(result.allowed).toBe(true)
  })

  it('عند ضبط URL ويُرجع السيرفر allowed: true يقبل', async () => {
    setSettings({ ...defaultSettings, checkEligibilityUrl: 'https://example.com/check' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true }),
    })
    const result = await checkSpinEligibility('0501234567')
    expect(result.allowed).toBe(true)
  })

  it('عند ضبط URL ويُرجع السيرفر allowed: false يرفض', async () => {
    setSettings({ ...defaultSettings, checkEligibilityUrl: 'https://example.com/check' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: false, message: 'استخدمت محاولتك اليوم' }),
    })
    const result = await checkSpinEligibility('0501234567')
    expect(result.allowed).toBe(false)
    expect(result.message).toBe('استخدمت محاولتك اليوم')
  })

  it('عند فشل الاستدعاء (شبكة) يرجع allowed: false مع رسالة', async () => {
    setSettings({ ...defaultSettings, checkEligibilityUrl: 'https://example.com/check' })
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const result = await checkSpinEligibility('0501234567')
    expect(result.allowed).toBe(false)
    expect(result.message).toContain('تعذر')
  })
})
