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
  getCountFromServer,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit as limitFn,
} from 'firebase/firestore'
import { firestoreDb } from './firebase'
import { trackReads, trackWrites } from './firestoreUsageTracker'
import type { MemberRow, RevenueRow, Settings, GuestLookup, Tier } from '@/types'
import type { AuditLogEntry } from '@/services/auditLogService'
import { defaultSettings } from './mockSettings'

const BATCH_SIZE = 500
const COL_SILVER = 'members_silver'
const COL_GOLD = 'members_gold'
const COL_PLATINUM = 'members_platinum'
const COL_REVENUE = 'revenue'
const COL_CONFIG = 'config'
const COL_NEW_MEMBERS = 'new_members'
const COL_AUDIT = 'audit_log'
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
  trackReads(snap.size)
  const refs = snap.docs.map((d) => d.ref)
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(firestoreDb)
    chunk.forEach((ref) => batch.delete(ref))
    await batch.commit()
    trackWrites(chunk.length)
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
      message: 'ملف .env ناقص أو مفاتيح Firebase غير موجودة (VITE_FIREBASE_*). السبب: لم يتم العثور على VITE_FIREBASE_API_KEY أو VITE_FIREBASE_PROJECT_ID. الحل: انسخ .env.example إلى .env واملأ القيم من Firebase Console → Project Settings → Your apps.',
      projectId: projectId || null,
    }
  }
  try {
    const ref = doc(firestoreDb, 'config', 'settings')
    await getDoc(ref)
    trackReads(1)
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
        message: 'السبب: قواعد Firestore تمنع القراءة. الحل: نفّذ npx firebase deploy --only firestore لرفع firestore.rules، أو من Firebase Console → Firestore → Rules فعّل وضع Test مؤقتاً.',
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
        message: 'السبب: Firestore غير مُنشأ في المشروع. الحل: من Firebase Console → Build → Firestore Database → Create database (اختر وضع production أو test).',
        projectId,
      }
    }
    if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource-exhausted') || code === 'resource-exhausted') {
      return {
        configOk: true,
        firestoreStatus: 'error',
        message: `السبب: نفاد الحصة المجانية (50K قراءة، 20K كتابة يومياً). الحل: انتظر حتى اليوم التالي أو ترقية الخطة في Firebase Console → Usage and billing.`,
        projectId,
      }
    }
    if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
      return {
        configOk: true,
        firestoreStatus: 'error',
        message: `السبب: عدم اتصال بالإنترنت أو حظر من الشبكة. الحل: تحقق من الاتصال، أو جرب شبكة أخرى، أو تعطيل VPN إن كان مفعّلاً. التفاصيل: ${code || msg.slice(0, 60)}`,
        projectId,
      }
    }
    return {
      configOk: true,
      firestoreStatus: 'error',
      message: `السبب: ${code || 'خطأ غير معروف'}. التفاصيل: ${msg.slice(0, 100)}. الحل: تحقق من Firebase Console و firestore.rules.`,
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
        ...(r.idNumber != null && r.idNumber !== '' && { idNumber: r.idNumber }),
      })
    }
    await batch.commit()
    trackWrites(chunk.length)
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
        ...(r.idNumber != null && r.idNumber !== '' && { idNumber: r.idNumber }),
      })
    }
    await batch.commit()
    trackWrites(chunk.length)
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
        ...(r.idNumber != null && r.idNumber !== '' && { idNumber: r.idNumber }),
      })
    }
    await batch.commit()
    trackWrites(chunk.length)
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
    trackWrites(chunk.length)
  }
}

/** حفظ الإعدادات في Firestore. */
export async function writeSettings(settings: Settings): Promise<void> {
  if (!firestoreDb) return
  const ref = doc(firestoreDb, COL_CONFIG, DOC_SETTINGS)
  await setDoc(ref, settings)
  trackWrites(1)
}

/** جلب الإعدادات من Firestore. */
export async function getSettingsAsync(): Promise<Settings> {
  if (!firestoreDb) return defaultSettings
  const ref = doc(firestoreDb, COL_CONFIG, DOC_SETTINGS)
  const snap = await getDoc(ref)
  trackReads(1)
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
  trackReads(4)

  let tier: Tier
  let name: string
  let idLastDigits: string | undefined

  let inTier = true
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
    const rev = revSnap.exists() ? (revSnap.data().total_spent as number) ?? 0 : 0
    if (rev <= 0) return null
    inTier = false
    tier = rev / (settings.revenueToPoints || 1) >= (settings.pointsSilverToGold ?? 10000) + (settings.pointsGoldToPlatinum ?? 12000)
      ? 'platinum'
      : rev / (settings.revenueToPoints || 1) >= (settings.pointsSilverToGold ?? 10000)
        ? 'gold'
        : 'silver'
    name = ''
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
    inTier,
    ...(rev > 0 && { totalSpent: rev }),
    ...(!inTier && { eligibleTier: tier }),
  }
}

/** عدد السجلات في كل مجموعة (للأدمن) — باستخدام getCountFromServer لتوفير القراءات (٤ بدل عشرات الآلاف). */
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
    getCountFromServer(collection(firestoreDb, COL_SILVER)),
    getCountFromServer(collection(firestoreDb, COL_GOLD)),
    getCountFromServer(collection(firestoreDb, COL_PLATINUM)),
    getCountFromServer(collection(firestoreDb, COL_REVENUE)),
  ])
  trackReads(4)
  return {
    silver: silverSnap.data().count,
    gold: goldSnap.data().count,
    platinum: platinumSnap.data().count,
    revenue: revenueSnap.data().count,
  }
}

/** جلب كل سجلات الإيراد من Firestore (لدمج التحديث بمطابقة 100%). */
export async function getRevenueRowsAsync(): Promise<RevenueRow[]> {
  if (!firestoreDb) return []
  const colRef = collection(firestoreDb, COL_REVENUE)
  const snap = await getDocs(colRef)
  trackReads(snap.size)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      phone: (data.phone as string) ?? d.id,
      total_spent: (data.total_spent as number) ?? 0,
    }
  })
}

function docToMemberRow(d: { id: string; data: () => Record<string, unknown> }): MemberRow {
  const data = d.data()
  const idLastDigits = data.idLastDigits != null && data.idLastDigits !== '' ? String(data.idLastDigits) : undefined
  const idNumber = data.idNumber != null && data.idNumber !== '' ? String(data.idNumber) : undefined
  return {
    phone: (data.phone as string) ?? d.id,
    name: (data.name as string) ?? '',
    total_spent: (data.total_spent as number) ?? 0,
    ...(idLastDigits != null ? { idLastDigits } : {}),
    ...(idNumber != null ? { idNumber } : {}),
  }
}

/** جلب كل قائمة فضية من Firestore (للتصدير). */
export async function getSilverRowsAsync(): Promise<MemberRow[]> {
  if (!firestoreDb) return []
  const snap = await getDocs(collection(firestoreDb, COL_SILVER))
  trackReads(snap.size)
  return snap.docs.map((d) => docToMemberRow(d))
}

/** جلب كل قائمة ذهبية من Firestore (للتصدير). */
export async function getGoldRowsAsync(): Promise<MemberRow[]> {
  if (!firestoreDb) return []
  const snap = await getDocs(collection(firestoreDb, COL_GOLD))
  trackReads(snap.size)
  return snap.docs.map((d) => docToMemberRow(d))
}

/** جلب كل قائمة بلاتينية من Firestore (للتصدير). */
export async function getPlatinumRowsAsync(): Promise<MemberRow[]> {
  if (!firestoreDb) return []
  const snap = await getDocs(collection(firestoreDb, COL_PLATINUM))
  trackReads(snap.size)
  return snap.docs.map((d) => docToMemberRow(d))
}

/** استخدام الجوائز من Firestore. */
export async function getPrizeUsageAsync(): Promise<Record<string, number>> {
  if (!firestoreDb) return {}
  const ref = doc(firestoreDb, COL_CONFIG, DOC_PRIZE_USAGE)
  const snap = await getDoc(ref)
  trackReads(1)
  if (!snap.exists()) return {}
  const data = snap.data()
  return (data?.usage as Record<string, number>) ?? {}
}

/** زيادة عداد جائزة. */
export async function incrementPrizeUsageAsync(prizeId: string): Promise<void> {
  if (!firestoreDb) return
  const ref = doc(firestoreDb, COL_CONFIG, DOC_PRIZE_USAGE)
  const snap = await getDoc(ref)
  trackReads(1)
  const current = (snap.exists() ? (snap.data()?.usage as Record<string, number>) : {}) ?? {}
  const next = { ...current, [prizeId]: (current[prizeId] ?? 0) + 1 }
  await setDoc(ref, { usage: next })
  trackWrites(1)
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
  trackReads(1)
  if (snap.exists()) {
    const data = snap.data()
    await setDoc(ref, {
      ...data,
      name: name.trim() || (data.name ?? ''),
      ...(idLastDigits != null &&
        idLastDigits !== '' && { idLastDigits: idLastDigits.replace(/\D/g, '').slice(-4) }),
    })
    trackWrites(1)
    return
  }
  await setDoc(ref, {
    phone: p,
    name: name.trim(),
    total_spent: 0,
    ...(idLastDigits != null &&
      idLastDigits !== '' && { idLastDigits: idLastDigits.replace(/\D/g, '').slice(-4) }),
  })
  trackWrites(1)
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
  trackWrites(1)
}

/** جلب سجل العضويات الجديدة (الأحدث أولاً). */
export async function getNewMembersLogAsync(): Promise<NewMemberLogEntry[]> {
  if (!firestoreDb) return []
  const colRef = collection(firestoreDb, COL_NEW_MEMBERS)
  const snap = await getDocs(colRef)
  trackReads(snap.size)
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
  trackReads(snap.size)
  trackWrites(snap.size)
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}

/** جلب قائمة الزبائن (فضي+ذهبي+بلاتيني) لربط كشف الإيراد برقم الجوال — phone + idNumber + name + tier */
export async function getMembersForRevenueResolveAsync(): Promise<
  { phone: string; idNumber?: string; name?: string; tier?: Tier }[]
> {
  if (!firestoreDb) return []
  const [silverSnap, goldSnap, platinumSnap] = await Promise.all([
    getDocs(collection(firestoreDb, COL_SILVER)),
    getDocs(collection(firestoreDb, COL_GOLD)),
    getDocs(collection(firestoreDb, COL_PLATINUM)),
  ])
  trackReads(silverSnap.size + goldSnap.size + platinumSnap.size)
  const out: { phone: string; idNumber?: string; name?: string; tier?: Tier }[] = []
  const pairs: [typeof silverSnap, Tier][] = [
    [silverSnap, 'silver'],
    [goldSnap, 'gold'],
    [platinumSnap, 'platinum'],
  ]
  for (const [snap, tier] of pairs) {
    for (const d of snap.docs) {
      const data = d.data()
      const phone = (data.phone as string) ?? ''
      const idNumber = (data.idNumber as string) ?? undefined
      const name = (data.name as string) ?? undefined
      if (phone && phone.length >= 9) {
        out.push({ phone: norm(phone), ...(idNumber && { idNumber }), ...(name && { name }), tier })
      }
    }
  }
  return out
}

/** إدخال حدث في سجل التدقيق (رفع ملف / حفظ إعدادات). */
export async function addAuditLogAsync(entry: {
  action: 'upload' | 'settings'
  key?: string
  fileName?: string
  count?: number
  mergeCount?: number
}): Promise<void> {
  if (!firestoreDb) return
  const colRef = collection(firestoreDb, COL_AUDIT)
  await addDoc(colRef, { ...entry, at: Date.now() })
  trackWrites(1)
}

/** جلب آخر أحداث سجل التدقيق (للعرض في لوحة الأدمن). */
export async function getAuditLogAsync(limit: number = 50): Promise<(AuditLogEntry & { id: string })[]> {
  if (!firestoreDb) return []
  const colRef = collection(firestoreDb, COL_AUDIT)
  const q = query(colRef, orderBy('at', 'desc'), limitFn(limit))
  const snap = await getDocs(q)
  trackReads(snap.size)
  return snap.docs.map((d) => {
    const data = d.data()
    const action = data.action === 'settings' ? 'settings' : 'upload'
    return {
      id: d.id,
      action,
      key: data.key as string | undefined,
      fileName: data.fileName as string | undefined,
      count: data.count as number | undefined,
      mergeCount: data.mergeCount as number | undefined,
      at: (data.at as number) ?? 0,
    }
  })
}

const COL_SPIN_ELIGIBILITY = 'spin_eligibility'
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** التحقق من صلاحية اللعب من Firestore (مصدر واحد عند عدم وجود checkEligibilityUrl). */
export async function getSpinEligibilityAsync(phone: string): Promise<{
  allowed: boolean
  cooldownEndsAt?: number
  lastPrize?: { prizeLabel: string; code: string }
}> {
  if (!firestoreDb) return { allowed: true }
  const p = norm(phone)
  if (!p) return { allowed: true }
  const [settingsSnap, spinSnap] = await Promise.all([
    getDoc(doc(firestoreDb, COL_CONFIG, DOC_SETTINGS)),
    getDoc(doc(firestoreDb, COL_SPIN_ELIGIBILITY, p)),
  ])
  trackReads(2)
  const settings = settingsSnap.exists() ? (settingsSnap.data() as Settings) : defaultSettings
  const cooldownDays = Math.max(1, Math.min(365, Math.floor(settings.spinCooldownDays ?? 15)))
  const cooldownMs = cooldownDays * MS_PER_DAY
  if (!spinSnap.exists()) return { allowed: true }
  const data = spinSnap.data()
  const lastSpinAt = (data.lastSpinAt as number) ?? 0
  const endsAt = lastSpinAt + cooldownMs
  if (Date.now() >= endsAt) return { allowed: true }
  const prizeLabel = (data.prizeLabel as string) ?? ''
  const code = (data.code as string) ?? ''
  return {
    allowed: false,
    cooldownEndsAt: endsAt,
    ...(prizeLabel && code && { lastPrize: { prizeLabel, code } }),
  }
}

/** تسجيل لفة ناجحة في Firestore (مصدر واحد للصلاحية). */
export async function recordSpinInFirestoreAsync(phone: string, prizeLabel: string, code: string): Promise<void> {
  if (!firestoreDb) return
  const p = norm(phone)
  if (!p) return
  const ref = doc(firestoreDb, COL_SPIN_ELIGIBILITY, p)
  await setDoc(ref, { lastSpinAt: Date.now(), prizeLabel, code })
  trackWrites(1)
}
