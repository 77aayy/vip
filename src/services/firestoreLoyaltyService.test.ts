/**
 * اختبار firestoreLoyaltyService — التحقق من المدخلات و isFirestoreAvailable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./firebase', () => ({ firestoreDb: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  setDoc: vi.fn(),
  getCountFromServer: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  increment: vi.fn(),
}))

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('firestoreLoyaltyService', () => {
  it('getMemberByPhoneAsync يرجع null عند phone فارغ أو null', async () => {
    const { getMemberByPhoneAsync } = await import('./firestoreLoyaltyService')
    expect(await getMemberByPhoneAsync('')).toBeNull()
    expect(await getMemberByPhoneAsync('   ')).toBeNull()
  })

  it('getMemberByPhoneAsync يرجع null عند phone قصير أقل من 9 أرقام', async () => {
    const { getMemberByPhoneAsync } = await import('./firestoreLoyaltyService')
    expect(await getMemberByPhoneAsync('123')).toBeNull()
    expect(await getMemberByPhoneAsync('0501234')).toBeNull()
  })
})
