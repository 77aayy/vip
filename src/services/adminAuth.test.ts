/**
 * اختبار تحقق كود الأدمن وجلسة الدخول.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  validateAdminCode,
  setAdminSession,
  isAdminAuthenticated,
  clearAdminSession,
} from './adminAuth'

describe('adminAuth', () => {
  const originalSessionStorage = global.sessionStorage

  beforeEach(() => {
    const store: Record<string, string> = {}
    global.sessionStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      key: () => null,
      length: 0,
    } as Storage
  })

  afterEach(() => {
    global.sessionStorage = originalSessionStorage
  })

  describe('validateAdminCode', () => {
    it('يقبل الكود الصحيح فقط', () => {
      expect(validateAdminCode('ayman5255')).toBe(true)
      expect(validateAdminCode('  ayman5255  ')).toBe(true)
    })
    it('يرفض أي كود آخر', () => {
      expect(validateAdminCode('')).toBe(false)
      expect(validateAdminCode('wrong')).toBe(false)
      expect(validateAdminCode('ayman525')).toBe(false)
      expect(validateAdminCode('AYMAN5255')).toBe(false)
    })
  })

  describe('session', () => {
    it('بعد setAdminSession يصبح isAdminAuthenticated true', () => {
      expect(isAdminAuthenticated()).toBe(false)
      setAdminSession()
      expect(isAdminAuthenticated()).toBe(true)
    })
    it('بعد clearAdminSession يصبح isAdminAuthenticated false', () => {
      setAdminSession()
      clearAdminSession()
      expect(isAdminAuthenticated()).toBe(false)
    })
  })
})
