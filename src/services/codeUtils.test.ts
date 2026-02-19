/**
 * اختبار توليد أكواد التحقق.
 */
import { describe, it, expect } from 'vitest'
import { generateCode } from './codeUtils'

const VALID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

describe('codeUtils.generateCode', () => {
  it('يُرجع سلسلة طولها 8', () => {
    const code = generateCode()
    expect(code).toHaveLength(8)
  })

  it('يُرجع أحرفاً من المجموعة المسموحة فقط', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateCode()
      for (const c of code) {
        expect(VALID_CHARS).toContain(c)
      }
    }
  })

  it('لا يحتوي على أحرف محيرة المستثناة من المجموعة (0, O, 1, I)', () => {
    const excluded = ['0', 'O', '1', 'I']
    for (let i = 0; i < 20; i++) {
      const code = generateCode()
      for (const c of excluded) {
        expect(code).not.toContain(c)
      }
    }
  })
})
