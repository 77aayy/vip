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

function getEligibleTier(
  points: number,
  silverToGold: number,
  goldToPlatinum: number
): Tier {
  if (points >= silverToGold + goldToPlatinum) return 'platinum'
  if (points >= silverToGold) return 'gold'
  return 'silver'
}

export function lookupGuest(phone: string): GuestLookup | null {
  const p = norm(phone)
  if (!p) return null
  const platinum = getPlatinum()
  const gold = getGold()
  const silver = getSilver()
  const revenue = getRevenue()
  const settings = getSettings()

  const totalSpentFromRevenue = revenue
    .filter((r) => norm(r.phone) === p)
    .reduce((s, r) => s + (r.total_spent ?? 0), 0)

  let tier: Tier
  let name: string
  let idLastDigits: string | undefined
  let inTier = true
  let memberSpent = 0

  const inPlatinum = platinum.find((r) => norm(r.phone) === p)
  if (inPlatinum) {
    tier = 'platinum'
    name = inPlatinum.name
    idLastDigits = inPlatinum.idLastDigits
    memberSpent = inPlatinum.total_spent ?? 0
  } else {
    const inGold = gold.find((r) => norm(r.phone) === p)
    if (inGold) {
      tier = 'gold'
      name = inGold.name
      idLastDigits = inGold.idLastDigits
      memberSpent = inGold.total_spent ?? 0
    } else {
      const inSilver = silver.find((r) => norm(r.phone) === p)
      if (inSilver) {
        tier = 'silver'
        name = inSilver.name
        idLastDigits = inSilver.idLastDigits
        memberSpent = inSilver.total_spent ?? 0
      } else {
        if (totalSpentFromRevenue <= 0) return null
        inTier = false
        const pointsForTier = Math.round(totalSpentFromRevenue / (settings.revenueToPoints || 1))
        tier = getEligibleTier(
          pointsForTier,
          settings.pointsSilverToGold ?? 10000,
          settings.pointsGoldToPlatinum ?? 12000
        )
        name = ''
      }
    }
  }

  const totalSpent = totalSpentFromRevenue > 0 ? totalSpentFromRevenue : memberSpent
  const points = Math.round(totalSpent / (settings.revenueToPoints || 1))

  const pointsToNextTier: number | null =
    tier === 'silver'
      ? Math.max(0, (settings.pointsSilverToGold ?? 10000) - points)
      : tier === 'gold'
        ? Math.max(0, (settings.pointsGoldToPlatinum ?? 12000) - points)
        : null
  const pointsNextThreshold: number | null =
    tier === 'silver'
      ? settings.pointsSilverToGold ?? 10000
      : tier === 'gold'
        ? settings.pointsGoldToPlatinum ?? 12000
        : null

  return {
    phone: p,
    name: name || '',
    tier,
    points,
    pointsToNextTier: pointsToNextTier === 0 ? null : pointsToNextTier,
    pointsNextThreshold,
    ...(idLastDigits != null && idLastDigits !== '' && { idLastDigits }),
    inTier,
    ...(totalSpent > 0 && { totalSpent }),
    ...(!inTier && { eligibleTier: tier }),
  }
}
