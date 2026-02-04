/**
 * خدمة الولاء على Firestore — رفع الملفات، الإعدادات، البحث بالرقم، عدّ الاستخدام.
 * يُستدعى فقط عند توفر firestoreDb (من .env).
 */
import {
  collection,
  doc,
  writeBatch,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
} from 'firebase/firestore'
import { firestoreDb } from './firebase'
import type { MemberRow, RevenueRow, Settings, GuestLookup, Tier } from '@/types'
import { defaultSettings } from './mockSettings'

const BATCH_SIZE = 500
const COL_SILVER = 'members_silver'
const COL_GOLD = 'members_gold'
const COL_PLATINUM = 'members_platinum'
const COL_REVENUE = 'revenue'
const COL_CONFIG = 'config'
const COL_NEW_MEMBERS = 'new_members'
const DOC_SETTINGS = 'settings'
const DOC_PRIZE_USAGE = 'prize_usage'

export interface NewMemberLogEntry {
  id: string
  phone: string
  name: string
  idLastDigits?: string
  createdAt: number
}

function norm(s: string): string {
  return s.replace(/\D/g, '').slice(-9)
}

function safeDocId(phone: string): string {
  const p = norm(phone)
  return p || 'invalid'
}

async function clearCollection(colId: string): Promise<void> {
  if (!firestoreDb) return
  const colRef = collection(firestoreDb, colId)
  const snap = await getDocs(colRef)
  const refs = snap.docs.map((d) => d.ref)
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = writeBatch(firestoreDb)
    refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

export function isFirestoreAvailable(): boolean {
  return firestoreDb != null
}

/** نتيجة فحص اتصال Firebase — لمعرفة إيه اللي معمول وإيه اللي ناقص */
export type FirebaseCheckResult = {
  /** هل ملف .env فيه المفاتيح وتم تهيئة الـ SDK */
  configOk: boolean
  /** حالة Firestore: متصل | صلاحيات | قاعدة غير مفعّلة | خطأ */
  firestoreStatus: 'ok' | 'permission-denied' | 'database-disabled' | 'error'
  /** رسالة توضيحية بالعربي */
  message: string
  /** مشروع Firebase (من .env) */
  projectId: string | null
}

export async function checkFirebaseConnection(): Promise<FirebaseCheckResult> {
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || null
  if (!firestoreDb || !projectId) {
    return {
      configOk: false,
      firestoreStatus: 'error',
      message: 'ملف .env ناقص أو مفاتيح Firebase غير موجودة (VITE_FIREBASE_*)',
      projectId: projectId || null,
    }
  }
  try {
    const ref = doc(firestoreDb, 'config', 'settings')
    await getDoc(ref)
    return {
      configOk: true,
      firestoreStatus: 'ok',
      message: 'اتصال Firebase يعمل — Firestore مفعّل والصلاحيات سليمة.',
      projectId,
    }
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    const code = err?.code ?? ''
    const msg = err?.message ?? String(e)
    if (code === 'permission-denied') {
      return {
        configOk: true,
        firestoreStatus: 'permission-denied',
        message: 'الصلاحيات مرفوضة — رفع ملف firestore.rules (npx firebase deploy --only firestore) أو تفعيل وضع Test في Console.',
        projectId,
      }
    }
    if (
      code === 'failed-precondition' ||
      code === 'not-found' ||
      msg.includes('NOT_FOUND') ||
      msg.toLowerCase().includes('database')
    ) {
      return {
        configOk: true,
        firestoreStatus: 'database-disabled',
        message: 'Firestore غير مفعّل — من Firebase Console: Build → Firestore Database → Create database.',
        projectId,
      }
    }
    return {
      configOk: true,
      firestoreStatus: 'error',
      message: `خطأ اتصال: ${code || msg.slice(0, 80)}`,
      projectId,
    }
  }
}

/** رفع قائمة فضية — استبدال كامل (مسح ثم كتابة). دفعات 500. */
export async function writeSilverBatch(rows: MemberRow[]): Promise<void> {
  if (!firestoreDb) return
  await clearCollection(COL_SILVER)
  const colRef = collection(firestoreDb, COL_SILVER)
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = writeBatch(firestoreDb)
    const chunk = rows.slice(i, i + BATCH_SIZE)
    for (const r of chunk) {
      const id = safeDocId(r.phone)
      if (id === 'invalid') continue
      batch.set(doc(colRef, id), {
        phone: r.phone,
        name: r.name ?? '',
        total_spent: r.total_spent ?? 0,
        ...(r.idLastDigits != null && r.idLastDigits !== '' && { idLastDigits: r.idLastDigits }),
      })
    }
    await batch.commit()
  }
}

/** رفع قائمة ذهبية — استبدال كامل. */
export async function writeGoldBatch(rows: MemberRow[]): Promise<void> {
  if (!firestoreDb) return
  await clearCollection(COL_GOLD)
  const colRef = collection(firestoreDb, COL_GOLD)
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = writeBatch(firestoreDb)
    const chunk = rows.slice(i, i + BATCH_SIZE)
    for (const r of chunk) {
      const id = safeDocId(r.phone)
      if (id === 'invalid') continue
      batch.set(doc(colRef, id), {
        phone: r.phone,
        name: r.name ?? '',
        total_spent: r.total_spent ?? 0,
        ...(r.idLastDigits != null && r.idLastDigits !== '' && { idLastDigits: r.idLastDigits }),
      })
    }
    await batch.commit()
  }
}

/** رفع قائمة بلاتينية — استبدال كامل. */
export async function writePlatinumBatch(rows: MemberRow[]): Promise<void> {
  if (!firestoreDb) return
  await clearCollection(COL_PLATINUM)
  const colRef = collection(firestoreDb, COL_PLATINUM)
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = writeBatch(firestoreDb)
    const chunk = rows.slice(i, i + BATCH_SIZE)
    for (const r of chunk) {
      const id = safeDocId(r.phone)
      if (id === 'invalid') continue
      batch.set(doc(colRef, id), {
        phone: r.phone,
        name: r.name ?? '',
        total_spent: r.total_spent ?? 0,
        ...(r.idLastDigits != null && r.idLastDigits !== '' && { idLastDigits: r.idLastDigits }),
      })
    }
    await batch.commit()
  }
}

/** رفع كشف الإيراد — استبدال كامل. */
export async function writeRevenueBatch(rows: RevenueRow[]): Promise<void> {
  if (!firestoreDb) return
  await clearCollection(COL_REVENUE)
  const colRef = collection(firestoreDb, COL_REVENUE)
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = writeBatch(firestoreDb)
    const chunk = rows.slice(i, i + BATCH_SIZE)
    for (const r of chunk) {
      const id = safeDocId(r.phone)
      if (id === 'invalid') continue
      batch.set(doc(colRef, id), { phone: r.phone, total_spent: r.total_spent ?? 0 })
    }
    await batch.commit()
  }
}

/** حفظ الإعدادات في Firestore. */
export async function writeSettings(settings: Settings): Promise<void> {
  if (!firestoreDb) return
  const ref = doc(firestoreDb, COL_CONFIG, DOC_SETTINGS)
  await setDoc(ref, settings)
}

/** جلب الإعدادات من Firestore. */
export async function getSettingsAsync(): Promise<Settings> {
  if (!firestoreDb) return defaultSettings
  const ref = doc(firestoreDb, COL_CONFIG, DOC_SETTINGS)
  const snap = await getDoc(ref)
  if (!snap.exists()) return defaultSettings
  const data = snap.data() as Settings
  return {
    ...defaultSettings,
    ...data,
    prizes: Array.isArray(data.prizes) ? data.prizes : defaultSettings.prizes,
    messages: { ...defaultSettings.messages, ...(data.messages ?? {}) },
  }
}

/** البحث بالرقم في Firestore — فئة، نقاط، اسم. */
export async function getMemberByPhoneAsync(phone: string): Promise<GuestLookup | null> {
  if (!firestoreDb) return null
  const p = norm(phone)
  if (!p) return null

  const settings = await getSettingsAsync()

  const [platSnap, goldSnap, silverSnap, revSnap] = await Promise.all([
    getDoc(doc(firestoreDb, COL_PLATINUM, p)),
    getDoc(doc(firestoreDb, COL_GOLD, p)),
    getDoc(doc(firestoreDb, COL_SILVER, p)),
    getDoc(doc(firestoreDb, COL_REVENUE, p)),
  ])

  let tier: Tier
  let name: string
  let idLastDigits: string | undefined

  if (platSnap.exists()) {
    const d = platSnap.data()
    tier = 'platinum'
    name = (d.name as string) ?? ''
    idLastDigits = d.idLastDigits as string | undefined
  } else if (goldSnap.exists()) {
    const d = goldSnap.data()
    tier = 'gold'
    name = (d.name as string) ?? ''
    idLastDigits = d.idLastDigits as string | undefined
  } else if (silverSnap.exists()) {
    const d = silverSnap.data()
    tier = 'silver'
    name = (d.name as string) ?? ''
    idLastDigits = d.idLastDigits as string | undefined
  } else {
    return null
  }

  const rev = revSnap.exists() ? (revSnap.data().total_spent as number) ?? 0 : 0
  const points = Math.round(rev / (settings.revenueToPoints || 1))

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

/** عدد السجلات في كل مجموعة (للأدمن). */
export async function getCountsAsync(): Promise<{
  silver: number
  gold: number
  platinum: number
  revenue: number
}> {
  if (!firestoreDb) {
    return { silver: 0, gold: 0, platinum: 0, revenue: 0 }
  }
  const [silverSnap, goldSnap, platinumSnap, revenueSnap] = await Promise.all([
    getDocs(collection(firestoreDb, COL_SILVER)),
    getDocs(collection(firestoreDb, COL_GOLD)),
    getDocs(collection(firestoreDb, COL_PLATINUM)),
    getDocs(collection(firestoreDb, COL_REVENUE)),
  ])
  return {
    silver: silverSnap.size,
    gold: goldSnap.size,
    platinum: platinumSnap.size,
    revenue: revenueSnap.size,
  }
}

/** استخدام الجوائز من Firestore. */
export async function getPrizeUsageAsync(): Promise<Record<string, number>> {
  if (!firestoreDb) return {}
  const ref = doc(firestoreDb, COL_CONFIG, DOC_PRIZE_USAGE)
  const snap = await getDoc(ref)
  if (!snap.exists()) return {}
  const data = snap.data()
  return (data?.usage as Record<string, number>) ?? {}
}

/** زيادة عداد جائزة. */
export async function incrementPrizeUsageAsync(prizeId: string): Promise<void> {
  if (!firestoreDb) return
  const ref = doc(firestoreDb, COL_CONFIG, DOC_PRIZE_USAGE)
  const snap = await getDoc(ref)
  const current = (snap.exists() ? (snap.data()?.usage as Record<string, number>) : {}) ?? {}
  const next = { ...current, [prizeId]: (current[prizeId] ?? 0) + 1 }
  await setDoc(ref, { usage: next })
}

/** إضافة عضو فضية واحد (عند تسجيل جديد من صفحة الضيف). */
export async function addSilverMemberAsync(
  phone: string,
  name: string,
  idLastDigits?: string
): Promise<void> {
  if (!firestoreDb) return
  const p = norm(phone)
  if (!p) return
  const ref = doc(firestoreDb, COL_SILVER, p)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const data = snap.data()
    await setDoc(ref, {
      ...data,
      name: name.trim() || (data.name ?? ''),
      ...(idLastDigits != null &&
        idLastDigits !== '' && { idLastDigits: idLastDigits.replace(/\D/g, '').slice(-4) }),
    })
    return
  }
  await setDoc(ref, {
    phone: p,
    name: name.trim(),
    total_spent: 0,
    ...(idLastDigits != null &&
      idLastDigits !== '' && { idLastDigits: idLastDigits.replace(/\D/g, '').slice(-4) }),
  })
  await logNewMemberAsync(phone, name.trim(), idLastDigits)
}

/** تسجيل عضو جديد في سجل العضويات الجديدة (للأدمن). */
async function logNewMemberAsync(
  phone: string,
  name: string,
  idLastDigits?: string
): Promise<void> {
  if (!firestoreDb) return
  const colRef = collection(firestoreDb, COL_NEW_MEMBERS)
  await addDoc(colRef, {
    phone: norm(phone),
    name: name || '',
    ...(idLastDigits != null && idLastDigits !== '' && { idLastDigits: idLastDigits.replace(/\D/g, '').slice(-4) }),
    createdAt: Date.now(),
  })
}

/** جلب سجل العضويات الجديدة (الأحدث أولاً). */
export async function getNewMembersLogAsync(): Promise<NewMemberLogEntry[]> {
  if (!firestoreDb) return []
  const colRef = collection(firestoreDb, COL_NEW_MEMBERS)
  const snap = await getDocs(colRef)
  const list: NewMemberLogEntry[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      phone: (data.phone as string) ?? '',
      name: (data.name as string) ?? '',
      idLastDigits: data.idLastDigits as string | undefined,
      createdAt: (data.createdAt as number) ?? 0,
    }
  })
  list.sort((a, b) => b.createdAt - a.createdAt)
  return list
}

/** مسح سجل العضويات الجديدة (بعد أن يضمّهم الأدمن للفضية). */
export async function clearNewMembersLogAsync(): Promise<void> {
  if (!firestoreDb) return
  const colRef = collection(firestoreDb, COL_NEW_MEMBERS)
  const snap = await getDocs(colRef)
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}
