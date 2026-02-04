import type { GuestLookup, Tier } from '@/types'
import { getSettings, getSilver, getGold, getPlatinum, getRevenue } from './storage'
import { getMemberByPhoneAsync, isFirestoreAvailable } from './firestoreLoyaltyService'

function norm(s: string): string {
  return s.replace(/\D/g, '').slice(-9)
}

/** بحث بالرقم — إن وُجد Firestore يُستخدم أولاً، وإلا localStorage. */
export async function lookupGuestAsync(phone: string): Promise<GuestLookup | null> {
  if (isFirestoreAvailable()) {
    const fromFirestore = await getMemberByPhoneAsync(phone)
    if (fromFirestore) return fromFirestore
  }
  return lookupGuest(phone)
}

export function lookupGuest(phone: string): GuestLookup | null {
  const p = norm(phone)
  if (!p) return null
  const platinum = getPlatinum()
  const gold = getGold()
  const silver = getSilver()
  if (platinum.length + gold.length + silver.length === 0) return null
  const revenue = getRevenue()
  const settings = getSettings()

  const rev = revenue.find((r) => norm(r.phone) === p)
  const points = rev
    ? Math.round(rev.total_spent / (settings.revenueToPoints || 1))
    : 0

  let tier: Tier
  let name: string

  let idLastDigits: string | undefined
  const inPlatinum = platinum.find((r) => norm(r.phone) === p)
  if (inPlatinum) {
    tier = 'platinum'
    name = inPlatinum.name
    idLastDigits = inPlatinum.idLastDigits
  } else {
    const inGold = gold.find((r) => norm(r.phone) === p)
    if (inGold) {
      tier = 'gold'
      name = inGold.name
      idLastDigits = inGold.idLastDigits
    } else {
      const inSilver = silver.find((r) => norm(r.phone) === p)
      if (inSilver) {
        tier = 'silver'
        name = inSilver.name
        idLastDigits = inSilver.idLastDigits
      } else {
        return null
      }
    }
  }

  const pointsToNextTier: number | null =
    tier === 'silver'
      ? Math.max(0, settings.pointsSilverToGold - points)
      : tier === 'gold'
        ? Math.max(0, settings.pointsGoldToPlatinum - points)
        : null
  const pointsNextThreshold: number | null =
    tier === 'silver'
      ? settings.pointsSilverToGold
      : tier === 'gold'
        ? settings.pointsGoldToPlatinum
        : null

  return {
    phone: p,
    name: name || '',
    tier,
    points,
    pointsToNextTier: pointsToNextTier === 0 ? null : pointsToNextTier,
    pointsNextThreshold,
    ...(idLastDigits != null && idLastDigits !== '' && { idLastDigits }),
  }
}
