/**
 * اختبار البحث بالرقم (lookup).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lookupGuest, lookupGuestAsync } from './lookup'
import * as storage from './storage'
import * as firestoreLoyaltyService from './firestoreLoyaltyService'
import { defaultSettings } from './mockSettings'

vi.mock('./storage')
vi.mock('./firestoreLoyaltyService')

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(firestoreLoyaltyService.isFirestoreAvailable).mockReturnValue(false)
})

describe('lookupGuest', () => {
  it('يرجع null لرقم null أو غير string', () => {
    expect(lookupGuest(null as unknown as string)).toBeNull()
    expect(lookupGuest(undefined as unknown as string)).toBeNull()
    expect(lookupGuest(123 as unknown as string)).toBeNull()
  })

  it('يرجع null لرقم قصير أقل من 9 أرقام', () => {
    vi.mocked(storage.getSilver).mockReturnValue([])
    vi.mocked(storage.getGold).mockReturnValue([])
    vi.mocked(storage.getPlatinum).mockReturnValue([])
    vi.mocked(storage.getRevenue).mockReturnValue([])
    vi.mocked(storage.getSettings).mockReturnValue(defaultSettings)
    expect(lookupGuest('123')).toBeNull()
    expect(lookupGuest('05012345')).toBeNull()
  })

  it('يرجع نتيجة من الفضة عند وجود العضو', () => {
    vi.mocked(storage.getSilver).mockReturnValue([
      { phone: '501234567', name: 'أحمد', total_spent: 5000 },
    ])
    vi.mocked(storage.getGold).mockReturnValue([])
    vi.mocked(storage.getPlatinum).mockReturnValue([])
    vi.mocked(storage.getRevenue).mockReturnValue([])
    vi.mocked(storage.getSettings).mockReturnValue(defaultSettings)
    const r = lookupGuest('0501234567')
    expect(r).not.toBeNull()
    expect(r!.tier).toBe('silver')
    expect(r!.name).toBe('أحمد')
    expect(r!.phone).toBe('501234567')
  })
})

describe('lookupGuestAsync', () => {
  it('يرجع null لرقم فارغ أو null', async () => {
    expect(await lookupGuestAsync('')).toBeNull()
    expect(await lookupGuestAsync('   ')).toBeNull()
  })

  it('يستخدم Firestore عند توفره ثم يعود للـ localStorage', async () => {
    vi.mocked(firestoreLoyaltyService.isFirestoreAvailable).mockReturnValue(true)
    vi.mocked(firestoreLoyaltyService.getMemberByPhoneAsync).mockResolvedValue({
      phone: '501234567',
      name: 'خالد',
      tier: 'gold',
      points: 1000,
      pointsToNextTier: null,
      pointsNextThreshold: null,
      inTier: true,
    })
    vi.mocked(storage.getSilver).mockReturnValue([])
    vi.mocked(storage.getGold).mockReturnValue([])
    vi.mocked(storage.getPlatinum).mockReturnValue([])
    vi.mocked(storage.getRevenue).mockReturnValue([])
    vi.mocked(storage.getSettings).mockReturnValue(defaultSettings)
    const r = await lookupGuestAsync('0501234567')
    expect(r).not.toBeNull()
    expect(r!.tier).toBe('gold')
    expect(r!.name).toBe('خالد')
    expect(firestoreLoyaltyService.getMemberByPhoneAsync).toHaveBeenCalledWith('0501234567')
  })

  it('يعود للـ localStorage عند عدم وجود نتيجة في Firestore', async () => {
    vi.mocked(firestoreLoyaltyService.isFirestoreAvailable).mockReturnValue(true)
    vi.mocked(firestoreLoyaltyService.getMemberByPhoneAsync).mockResolvedValue(null)
    vi.mocked(storage.getSilver).mockReturnValue([
      { phone: '501234567', name: 'سارة', total_spent: 3000 },
    ])
    vi.mocked(storage.getGold).mockReturnValue([])
    vi.mocked(storage.getPlatinum).mockReturnValue([])
    vi.mocked(storage.getRevenue).mockReturnValue([])
    vi.mocked(storage.getSettings).mockReturnValue(defaultSettings)
    const r = await lookupGuestAsync('0501234567')
    expect(r).not.toBeNull()
    expect(r!.tier).toBe('silver')
    expect(r!.name).toBe('سارة')
  })
})
