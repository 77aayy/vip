import { useCallback, useEffect, useState } from 'react'
import { parseMemberFile, parseRevenueFile, mergeRevenueParseRows, parseMappingFile, mergeMappingResults, resolveRevenueToPhone } from '@/services/excelParser'
import {
  getSettings,
  getPrizeUsage,
  setSilver,
  setGold,
  setPlatinum,
  setRevenue,
  setSettings,
  getSilver,
  getGold,
  getPlatinum,
  getRevenue,
  getRevenueMapping,
  setRevenueMapping,
  getRawRevenue,
  setRawRevenue,
} from '@/services/storage'
import {
  isFirestoreAvailable,
  writeSilverBatch,
  writeGoldBatch,
  writePlatinumBatch,
  writeRevenueBatch,
  writeSettings as writeSettingsToFirestore,
  getSettingsAsync,
  getCountsAsync,
  getMembersForRevenueResolveAsync,
  checkFirebaseConnection,
  getNewMembersLogAsync,
  clearNewMembersLogAsync,
  type FirebaseCheckResult,
  type NewMemberLogEntry,
} from '@/services/firestoreLoyaltyService'
import { getNewMembersLog, clearNewMembersLog } from '@/services/storage'
import { getUsage } from '@/services/firestoreUsageTracker'
import { QRCodeSVG } from 'qrcode.react'
import type { Prize, Settings } from '@/types'

type UploadKey = 'silver' | 'gold' | 'platinum' | 'revenue'

const LABELS: Record<UploadKey, string> = {
  silver: 'الزبائن الفضي',
  gold: 'الزبائن الذهبي',
  platinum: 'الزبائن البلاتيني',
  revenue: 'كشف الإيراد',
}

const ICONS: Record<UploadKey, string> = {
  silver: '🥈',
  gold: '🥇',
  platinum: '💎',
  revenue: '💰',
}

type UploadStep = 'reading' | 'uploading' | 'done'

export interface RevenueTierBreakdown {
  silver: number
  gold: number
  platinum: number
  notInTier: number
}

export interface DuplicateReport {
  key: UploadKey
  fileName: string
  /** إجمالي صفوف البيانات في الملف (باستثناء صف العناوين) */
  rawFileRows: number
  totalRows: number
  uploaded: number
  duplicateCount: number
  duplicates: { phone: string; count: number }[]
  /** نزلاء فريدون في ملف الإيراد (قبل الربط) — للعرض التوضيحي */
  revenueParsedCount?: number
  /** توزيع المربوطين على الفئات — للإيراد فقط */
  revenueTierBreakdown?: RevenueTierBreakdown
}

/** إعادة توزيع النسب عند تغيير جائزة — المجموع يبقى 100% */
function redistributePercent(prizes: Prize[], idx: number, newPercent: number): Prize[] {
  const clamped = Math.max(0, Math.min(100, newPercent))
  const next = prizes.map((p) => ({ ...p, percent: p.percent ?? 0 }))
  next[idx] = { ...next[idx], percent: clamped }
  const otherIndices = next.map((_, i) => i).filter((i) => i !== idx)
  if (otherIndices.length === 0) return next
  const remaining = 100 - clamped
  const sumOthers = otherIndices.reduce((s, i) => s + next[i].percent, 0)
  if (sumOthers <= 0) {
    const each = remaining / otherIndices.length
    otherIndices.forEach((i, j) => {
      next[i] = { ...next[i], percent: j === otherIndices.length - 1 ? Math.max(0, remaining - each * (otherIndices.length - 1)) : each }
    })
  } else {
    let allocated = 0
    otherIndices.forEach((i, j) => {
      const ratio = next[i].percent / sumOthers
      const val = j === otherIndices.length - 1 ? Math.max(0, remaining - allocated) : Math.round((ratio * remaining) * 100) / 100
      next[i] = { ...next[i], percent: val }
      allocated += val
    })
  }
  return next
}

function normPhone(s: string): string {
  return s.replace(/\D/g, '').slice(-9)
}

function computeDuplicateReport(rows: { phone: string }[]): { totalRows: number; uniqueCount: number; duplicates: { phone: string; count: number }[] } {
  const totalRows = rows.length
  const phoneCounts = new Map<string, number>()
  for (const r of rows) {
    phoneCounts.set(r.phone, (phoneCounts.get(r.phone) ?? 0) + 1)
  }
  const uniqueCount = phoneCounts.size
  const duplicates = [...phoneCounts.entries()]
    .filter(([, c]) => c > 1)
    .map(([phone, count]) => ({ phone, count }))
  return { totalRows, uniqueCount, duplicates }
}

function computeRevenueTierBreakdown(
  phones: string[],
  membersWithTier?: { phone: string; tier?: 'silver' | 'gold' | 'platinum' }[]
): RevenueTierBreakdown {
  const tierMap = new Map<string, 'silver' | 'gold' | 'platinum'>()
  if (membersWithTier?.length) {
    for (const m of membersWithTier) {
      const nph = normPhone(m.phone)
      if (m.tier) tierMap.set(nph, m.tier)
    }
  } else {
    const silver = getSilver()
    const gold = getGold()
    const platinum = getPlatinum()
    silver.forEach((r) => tierMap.set(normPhone(r.phone), 'silver'))
    gold.forEach((r) => tierMap.set(normPhone(r.phone), 'gold'))
    platinum.forEach((r) => tierMap.set(normPhone(r.phone), 'platinum'))
  }
  let s = 0
  let g = 0
  let p = 0
  let n = 0
  for (const ph of phones) {
    const nph = normPhone(ph)
    const tier = tierMap.get(nph)
    if (tier === 'platinum') p++
    else if (tier === 'gold') g++
    else if (tier === 'silver') s++
    else n++
  }
  return { silver: s, gold: g, platinum: p, notInTier: n }
}

export function AdminPage() {
  const [loading, setLoading] = useState<UploadKey | null>(null)
  const [uploadStep, setUploadStep] = useState<UploadStep | null>(null)
  const [uploadCount, setUploadCount] = useState<number | null>(null)
  const [duplicateReport, setDuplicateReport] = useState<DuplicateReport | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [settings, setSettingsState] = useState<Settings>(getSettings())
  const [counts, setCounts] = useState({
    silver: getSilver().length,
    gold: getGold().length,
    platinum: getPlatinum().length,
    revenue: getRevenue().length,
  })
  const useFirestore = isFirestoreAvailable()
  const [firebaseCheck, setFirebaseCheck] = useState<FirebaseCheckResult | null>(null)
  const [newMembersLog, setNewMembersLog] = useState<NewMemberLogEntry[]>([])
  const [clearingLog, setClearingLog] = useState(false)
  const [showNewMembersLog, setShowNewMembersLog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showExcelFormat, setShowExcelFormat] = useState(false)
  const [newMembersLogLimit, setNewMembersLogLimit] = useState(10)
  const [usage, setUsage] = useState(() => getUsage())
  const [showQRPrint, setShowQRPrint] = useState(false)
  const [useRevenueNameLink, setUseRevenueNameLink] = useState(true)
  const [mappingCount, setMappingCount] = useState(getRevenueMapping().length)

  useEffect(() => {
    checkFirebaseConnection().then(setFirebaseCheck)
  }, [])

  useEffect(() => {
    if (firebaseCheck?.firestoreStatus !== 'ok') return
    setUsage(getUsage())
    const t = setInterval(() => setUsage(getUsage()), 3000)
    const onStorage = () => setUsage(getUsage())
    window.addEventListener('storage', onStorage)
    return () => {
      clearInterval(t)
      window.removeEventListener('storage', onStorage)
    }
  }, [firebaseCheck])

  const loadNewMembersLog = useCallback(() => {
    if (useFirestore) {
      getNewMembersLogAsync().then(setNewMembersLog)
    } else {
      setNewMembersLog(getNewMembersLog())
    }
  }, [useFirestore])

  useEffect(() => {
    loadNewMembersLog()
  }, [loadNewMembersLog])

  useEffect(() => {
    if (!useFirestore) return
    let cancelled = false
    Promise.all([getSettingsAsync(), getCountsAsync()]).then(([s, c]) => {
      if (cancelled) return
      setSettingsState(s)
      setSettings(s)
      setCounts(c)
    })
    return () => {
      cancelled = true
    }
  }, [useFirestore])

  const handleFile = useCallback(async (key: UploadKey, fileOrFiles: File | File[]) => {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]
    const file = files[0]
    setError('')
    setSuccess('')
    setDuplicateReport(null)
    setLoading(key)
    setUploadStep('reading')
    setUploadCount(null)
    try {
      let finalCount = 0
      let revenueParsedCount = 0
      let rawFileRows = 0
      let rowsForReport: { phone: string }[] = []
      let revenueMembersWithTier: { phone: string; tier?: 'silver' | 'gold' | 'platinum' }[] | undefined
      if (key === 'revenue') {
        const revenueFiles = files.slice(0, 5)
        const parsedArrays: Awaited<ReturnType<typeof parseRevenueFile>>['rows'][] = []
        let totalRawRows = 0
        for (const f of revenueFiles) {
          const { rows, rawDataRows } = await parseRevenueFile(f)
          parsedArrays.push(rows)
          totalRawRows += rawDataRows
        }
        const parsed = mergeRevenueParseRows(parsedArrays)
        rawFileRows = totalRawRows
        revenueParsedCount = parsed.length
        setUploadStep('uploading')
        setUploadCount(revenueParsedCount)
        const members = useFirestore
          ? await getMembersForRevenueResolveAsync()
          : [
              ...getSilver().map((m) => ({ ...m, tier: 'silver' as const })),
              ...getGold().map((m) => ({ ...m, tier: 'gold' as const })),
              ...getPlatinum().map((m) => ({ ...m, tier: 'platinum' as const })),
            ]
        revenueMembersWithTier = members
        const mapping = getRevenueMapping()
        const revenueRows = resolveRevenueToPhone(parsed, members, {
          useNameFallback: useRevenueNameLink,
          mapping: mapping.length > 0 ? mapping : undefined,
        })
        rowsForReport = revenueRows
        setRevenue(revenueRows)
        setRawRevenue(parsed)
        if (useFirestore) {
          await writeRevenueBatch(revenueRows)
          const c = await getCountsAsync()
          setCounts(c)
          finalCount = c.revenue
        } else {
          setCounts((c) => ({ ...c, revenue: revenueRows.length }))
          finalCount = revenueRows.length
        }
      } else {
        const { rows: memberRows, rawDataRows: memberRawRows } = await parseMemberFile(file)
        rawFileRows = memberRawRows
        rowsForReport = memberRows
        setUploadStep('uploading')
        setUploadCount(memberRows.length)
        if (key === 'silver') {
          setSilver(memberRows)
          if (useFirestore) {
            await writeSilverBatch(memberRows)
            const c = await getCountsAsync()
            setCounts(c)
            finalCount = c.silver
          } else {
            setCounts((c) => ({ ...c, silver: memberRows.length }))
            finalCount = memberRows.length
          }
        } else if (key === 'gold') {
          setGold(memberRows)
          if (useFirestore) {
            await writeGoldBatch(memberRows)
            const c = await getCountsAsync()
            setCounts(c)
            finalCount = c.gold
          } else {
            setCounts((c) => ({ ...c, gold: memberRows.length }))
            finalCount = memberRows.length
          }
        } else {
          setPlatinum(memberRows)
          if (useFirestore) {
            await writePlatinumBatch(memberRows)
            const c = await getCountsAsync()
            setCounts(c)
            finalCount = c.platinum
          } else {
            setCounts((c) => ({ ...c, platinum: memberRows.length }))
            finalCount = memberRows.length
          }
        }
      }
      setUploadStep('done')
      const revenueUnmatched = key === 'revenue' ? revenueParsedCount - rowsForReport.length : 0
      const revenueNote =
        key === 'revenue' && revenueUnmatched > 0
          ? ` (${revenueUnmatched} صف لم يُربط برقم جوال من القوائم)`
          : ''
      const fileLabel = files.length > 1 ? `${files.length} ملفات` : file.name
      setSuccess(`تم رفع ${fileLabel} — ${finalCount} سجل${useFirestore ? ' (Firebase)' : ''}${revenueNote}`)
      const { totalRows, uniqueCount, duplicates } = computeDuplicateReport(rowsForReport)
      const revenueTierBreakdown =
        key === 'revenue' && rowsForReport.length > 0
          ? computeRevenueTierBreakdown(rowsForReport.map((r) => r.phone), revenueMembersWithTier)
          : undefined
      setDuplicateReport({
        key,
        fileName: fileLabel,
        rawFileRows,
        totalRows,
        uploaded: finalCount,
        duplicateCount: totalRows - uniqueCount,
        duplicates,
        ...(key === 'revenue' && { revenueParsedCount: revenueParsedCount }),
        revenueTierBreakdown,
      })
      if (firebaseCheck?.firestoreStatus === 'ok') setUsage(getUsage())
      setTimeout(() => {
        setLoading(null)
        setUploadStep(null)
        setUploadCount(null)
        setUsage(getUsage())
      }, 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ في قراءة الملف')
      setLoading(null)
      setUploadStep(null)
      setUploadCount(null)
    }
  }, [useFirestore])

  const handleSaveSettings = useCallback(async () => {
    setSettings(settings)
    setError('')
    if (useFirestore) {
      try {
        await writeSettingsToFirestore(settings)
        setSuccess('تم حفظ الإعدادات (Firebase)')
      } catch {
        setError('فشل حفظ الإعدادات على Firebase')
      }
    } else {
      setSuccess('تم حفظ الإعدادات')
    }
  }, [settings, useFirestore])

  const handleClearNewMembersLog = useCallback(async () => {
    setClearingLog(true)
    setError('')
    try {
      if (useFirestore) {
        await clearNewMembersLogAsync()
      } else {
        clearNewMembersLog()
      }
      loadNewMembersLog()
      setSuccess('تم مسح سجل العضويات الجديدة')
    } catch {
      setError('فشل مسح السجل')
    } finally {
      setClearingLog(false)
    }
  }, [useFirestore, loadNewMembersLog])

  return (
    <div className="min-h-screen min-h-dvh bg-surface text-white font-arabic p-4 pb-8 safe-area-insets">
      <div className="max-w-lg mx-auto min-w-0">
        <header className="flex flex-col items-center mb-6">
          <div className="bg-transparent inline-block">
            <img
              src="/logo-1.png"
              alt="Elite"
              className="h-20 w-auto max-w-[220px] object-contain object-center mb-2"
              decoding="async"
              style={{ background: 'transparent', mixBlendMode: 'multiply' }}
            />
          </div>
          <h1 className="text-xl font-semibold text-white text-center">لوحة التحكم</h1>
        </header>

        {/* فحص Firebase — رسالة واضحة مع سبب ومعالجة */}
        {firebaseCheck && (
          <div
            className={`mb-6 p-4 rounded-2xl text-sm sm:text-base leading-relaxed ${
              firebaseCheck.firestoreStatus === 'ok'
                ? 'bg-green-500/20 text-green-200 border border-green-500/30'
                : firebaseCheck.configOk
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                  : 'bg-red-500/20 text-red-200 border border-red-500/30'
            }`}
          >
            <div className="font-semibold mb-2 text-base">
              {firebaseCheck.firestoreStatus === 'ok'
                ? '✅ Firebase يعمل'
                : firebaseCheck.firestoreStatus === 'permission-denied'
                  ? '⚠️ صلاحيات مرفوضة'
                  : firebaseCheck.firestoreStatus === 'database-disabled'
                    ? '⚠️ Firestore غير مفعّل'
                    : '❌ خطأ في الاتصال'}
            </div>
            <div className="text-white/95 whitespace-pre-line">{firebaseCheck.message}</div>
            {firebaseCheck.projectId && (
              <div className="mt-3 pt-3 border-t border-white/20 space-y-1">
                <div className="text-white/70 text-sm">المشروع: {firebaseCheck.projectId}</div>
                {firebaseCheck.firestoreStatus === 'ok' && (
                  <>
                    <div className="space-y-2 mt-2">
                      <div>
                        <div className="flex justify-between text-xs text-white/70 mb-0.5">
                          <span>قراءة: {usage.reads.toLocaleString('ar')} / 50,000</span>
                          <span>{usage.readPercent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full transition-all duration-500 rounded-full"
                            style={{
                              width: `${Math.min(100, usage.readPercent)}%`,
                              background: 'linear-gradient(90deg, #dc2626 0%, #eab308 50%, #16a34a 100%)',
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-white/70 mb-0.5">
                          <span>كتابة: {usage.writes.toLocaleString('ar')} / 20,000</span>
                          <span>{usage.writePercent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full transition-all duration-500 rounded-full"
                            style={{
                              width: `${Math.min(100, usage.writePercent)}%`,
                              background: 'linear-gradient(90deg, #dc2626 0%, #eab308 50%, #16a34a 100%)',
                            }}
                          />
                        </div>
                      </div>
                      <p className="text-white/50 text-xs">قراءات وكتابات حقيقية من هذا الجهاز (كل التبويبات المفتوحة لنفس الموقع). يُصفَّر عند منتصف ليل Pacific. الإجمالي الكلي من كل الأجهزة في Firebase Console.</p>
                      <a
                        href={`https://console.firebase.google.com/project/${firebaseCheck.projectId}/usage`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-primary-400 hover:text-primary-300 text-sm underline mt-1"
                      >
                        عرض الاستخدام في Firebase Console
                      </a>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* تعليمات تنسيق الإكسل — مطوية */}
        <div className="mb-6 p-4 rounded-2xl bg-surface-card border border-white/[0.06] shadow-card">
          <button
            type="button"
            onClick={() => setShowExcelFormat((v) => !v)}
            className="w-full flex items-center gap-2 text-right"
          >
            <span
              className={`inline-block transition-transform duration-200 ${showExcelFormat ? 'rotate-180' : ''}`}
              aria-hidden
            >
              ▼
            </span>
            <h2 className="text-white font-semibold text-[0.9375rem] flex-1">📋 تنسيق ملف الإكسل</h2>
          </button>
          {showExcelFormat && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <ul className="text-white/80 text-sm space-y-1.5 list-disc list-inside leading-relaxed">
                <li>الصف الأول = عناوين الأعمدة (يُقرأ تلقائياً).</li>
                <li><strong>قوائم الفضي/الذهبي/البلاتيني:</strong> مطلوب عمود جوال («جوال» أو «phone» أو «رقم» أو «mobile» أو «tel»). اختياري: «اسم»، «إيراد» أو «مبلغ»، «رقم الهوية».</li>
                <li><strong>كشف الإيراد:</strong> يمكن رفع حتى 5 ملفات (واحد لكل فرع). مطلوب عمود جوال أو «رقم الهوية» + عمود «المدفوع» أو «الاجمالي». للربط: ارفع أولاً «رفع بيانات النزلاء» أو «ملف الربط» لربط صفوف الإيراد بأرقام الجوال.</li>
                <li><strong>بيانات النزلاء:</strong> من قسم «ربط كشف الإيراد» — ارفع <strong>ملفاً واحداً أو حتى 50 ملف</strong>. النزلاء الجدد يُضافون إلى القائمة المحفوظة (لا استبدال). الملف: عمود <strong>رقم الجوال</strong> + <strong>رقم الهوية</strong> و/أو <strong>الاسم</strong>.</li>
                <li>الرفع يستبدل القائمة الحالية (محلياً وعلى Firebase إن كان مفعّلاً).</li>
              </ul>
              <p className="text-white/60 text-xs mt-2">صيغ مقبولة: .xlsx, .xls, .csv — يُقرأ أول شيت فقط.</p>
            </div>
          )}
        </div>

        {/* 4 upload icons + رفع بيانات النزلاء (لربط الإيراد بالجوال) */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {(['silver', 'gold', 'platinum', 'revenue'] as const).map((key) => (
            <label
              key={key}
              className="flex flex-col items-center justify-center rounded-2xl bg-surface-card border border-white/[0.06] p-6 min-h-[88px] cursor-pointer active:scale-[0.98] transition-transform shadow-card touch-manipulation"
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple={key === 'revenue'}
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files
                  if (!list?.length) return
                  const files = key === 'revenue' ? [...list].slice(0, 5) : [list[0]]
                  if (files[0]) handleFile(key, key === 'revenue' ? files : files[0])
                  e.target.value = ''
                }}
                disabled={loading !== null}
              />
              <span className="text-4xl mb-2">{ICONS[key]}</span>
              <span className="text-white/90 font-medium text-center text-sm">
                {key === 'revenue' ? (
                  <>كشف الإيراد <span className="text-white/60 text-xs block">(حتى 5 ملفات)</span></>
                ) : (
                  LABELS[key]
                )}
              </span>
              <span className={`text-xs mt-1 transition-all duration-300 ${loading === key && uploadStep === 'done' ? 'text-primary-500 font-semibold scale-110' : 'text-white/50'}`}>
                {counts[key]} سجل
              </span>
              {loading === key && uploadStep !== 'done' && (
                <span className="text-primary-400/90 text-xs mt-1 animate-pulse">جاري التحميل...</span>
              )}
            </label>
          ))}
        </div>

        {/* ربط كشف الإيراد — رفع ملفات العملاء (حتى 50) + الربط بالاسم */}
        <div className="mb-6 p-4 rounded-2xl bg-surface-card border border-white/[0.06] space-y-3">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <span title="ربط">🔗</span>
            ربط كشف الإيراد برقم الجوال
          </h3>
          <p className="text-white/50 text-xs">ارفع ملفات العملاء (جوال + رقم هوية/اسم) — ملف واحد أو حتى 50 ملف. تُضاف إلى القائمة المحفوظة ولا تُستبدَل (التكرار يُزال تلقائياً).</p>
          <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
            <span className="text-2xl">📎</span>
            <div className="flex-1">
              <p className="text-white/90 text-sm font-medium">رفع ملفات العملاء (حتى 50 ملف)</p>
              <p className="text-white/50 text-xs mt-0.5">تُضاف النزلاء الجدد فقط إلى القائمة الحالية — يُحدّث ربط الإيراد تلقائياً</p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              className="hidden"
              onChange={async (e) => {
                const list = e.target.files
                if (!list?.length) return
                const files = [...list].slice(0, 50)
                e.target.value = ''
                if (loading !== null) return
                try {
                  setError('')
                  let rows: { phone: string; idNumber?: string; name?: string }[]
                  let rawDataRows: number
                  if (files.length === 1) {
                    const res = await parseMappingFile(files[0])
                    rows = res.rows
                    rawDataRows = res.rawDataRows
                  } else {
                    const results: Awaited<ReturnType<typeof parseMappingFile>>[] = []
                    const skipped: string[] = []
                    for (const f of files) {
                      try {
                        const res = await parseMappingFile(f)
                        if (res.rows.length > 0 || res.rawDataRows > 0) results.push(res)
                        else skipped.push(f.name)
                      } catch (err) {
                        skipped.push(`${f.name}: ${err instanceof Error ? err.message : 'خطأ'}`)
                      }
                    }
                    if (results.length === 0) {
                      setError(
                        skipped.length > 0
                          ? `لم يُستخرج نزيل من أي ملف. تفاصيل: ${skipped.slice(0, 3).join('؛ ')}${skipped.length > 3 ? ` (و${skipped.length - 3} غيرها)` : ''}. تأكد أن كل ملف فيه عمود «رقم الجوال» وعمود «رقم الهوية» أو «الاسم»، وأن أرقام الجوال صالحة (٩ خانات على الأقل).`
                          : 'لم يُستخرج أي نزيل من الملف/الملفات. تأكد أن صف العناوين يحتوي عمود «رقم الجوال» وعمود «رقم الهوية» أو «الاسم»، وأن صفوف البيانات تحتوي أرقام جوال صالحة (٩ خانات على الأقل). لم يتم استبدال قائمة الربط الحالية.'
                      )
                      return
                    }
                    const merged = mergeMappingResults(results)
                    rows = merged.rows
                    rawDataRows = merged.rawDataRows
                    if (skipped.length > 0 && rows.length === 0) {
                      setError(`تم تخطي ${skipped.length} ملف لعدم صلاحيتها. لم يتبقّ أي نزيل للربط.`)
                      return
                    }
                  }
                  if (rows.length === 0) {
                    setError('لم يُستخرج أي نزيل من الملف/الملفات. تأكد أن صف العناوين يحتوي عمود «رقم الجوال» وعمود «رقم الهوية» أو «الاسم»، وأن صفوف البيانات تحتوي أرقام جوال صالحة (٩ خانات على الأقل).')
                    return
                  }
                  // دمج مع القائمة المحفوظة — القائمة تزيد فقط (لا استبدال)
                  const existing = getRevenueMapping()
                  const byPhone = new Map<string, { phone: string; idNumber?: string; name?: string }>()
                  for (const row of existing) {
                    const p = row.phone.replace(/\D/g, '').slice(-9)
                    if (p.length >= 9) byPhone.set(p, row)
                  }
                  for (const row of rows) {
                    const p = row.phone.replace(/\D/g, '').slice(-9)
                    if (p.length >= 9 && !byPhone.has(p)) byPhone.set(p, row)
                  }
                  const merged = [...byPhone.values()]
                  const addedCount = merged.length - existing.length
                  setRevenueMapping(merged)
                  setMappingCount(merged.length)
                  const rawRevenue = getRawRevenue()
                  const rowNote = rawDataRows > 0
                    ? (files.length > 1 ? ` (من ${files.length} ملف، ${rawDataRows.toLocaleString('ar-SA')} صف)` : ` (من ${rawDataRows.toLocaleString('ar-SA')} صف في الملف)`)
                    : ''
                  const addNote = addedCount > 0 ? `إضافة ${addedCount.toLocaleString('ar-SA')} نزيل جديد — المجموع ${merged.length.toLocaleString('ar-SA')} نزيل` : `لا نزلاء جدد من الملف — المجموع ${merged.length.toLocaleString('ar-SA')} نزيل`
                  let msg = `تم تحديث قائمة العملاء: ${addNote}${rowNote} — يُربط بها كشف الإيراد`
                  if (rawRevenue.length > 0) {
                    const members = useFirestore
                      ? await getMembersForRevenueResolveAsync()
                      : [
                          ...getSilver().map((m) => ({ ...m, tier: 'silver' as const })),
                          ...getGold().map((m) => ({ ...m, tier: 'gold' as const })),
                          ...getPlatinum().map((m) => ({ ...m, tier: 'platinum' as const })),
                        ]
                    const mapping = getRevenueMapping()
                    const revenueRows = resolveRevenueToPhone(rawRevenue, members, {
                      useNameFallback: useRevenueNameLink,
                      mapping: mapping.length > 0 ? mapping : undefined,
                    })
                    setRevenue(revenueRows)
                    if (useFirestore) {
                      await writeRevenueBatch(revenueRows)
                      const c = await getCountsAsync()
                      setCounts(c)
                    } else {
                      setCounts((c) => ({ ...c, revenue: revenueRows.length }))
                    }
                    msg += ` — تم تحديث ربط الإيراد تلقائياً (${revenueRows.length} سجل)`
                  } else if (getRevenue().length > 0) {
                    msg += '. لو عايز رقم كشف الإيراد يتحدّث حسب الربط الجديد، ارفع كشف الإيراد (💰) مرة ثانية.'
                  }
                  setSuccess(msg)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'خطأ في قراءة ملف/ملفات بيانات النزلاء')
                }
              }}
              disabled={loading !== null}
            />
            <span className="text-primary-500 text-sm font-semibold">{mappingCount.toLocaleString('ar-SA')} نزيل</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useRevenueNameLink}
              onChange={(e) => setUseRevenueNameLink(e.target.checked)}
              className="rounded border-white/30 bg-white/10 text-primary-500"
            />
            <span className="text-white/90 text-sm">ربط بالاسم (من قوائم الفضي/الذهبي/البلاتيني + ملف الربط)</span>
          </label>
        </div>

        {/* شريط التحميل التفاعلي */}
        {loading !== null && uploadStep !== null && (
          <div
            className={`mb-4 p-4 rounded-2xl border transition-all duration-300 ${
              uploadStep === 'done'
                ? 'bg-primary-500/20 border-primary-500/40'
                : 'bg-white/5 border-white/10'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{ICONS[loading]}</span>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">
                  {uploadStep === 'reading' && 'جاري قراءة الملف...'}
                  {uploadStep === 'uploading' && (
                    <>جاري رفع {uploadCount ?? '—'} رقم{useFirestore ? ' إلى Firebase...' : '...'}</>
                  )}
                  {uploadStep === 'done' && (
                    <span className="text-primary-400">
                      تم التحميل بنجاح — {counts[loading]} سجل
                    </span>
                  )}
                </p>
                {uploadStep !== 'done' && (
                  <div className="relative h-1.5 mt-1.5 rounded-full bg-white/10 overflow-hidden animate-upload-bar" />
                )}
              </div>
            </div>
          </div>
        )}

        {error && <div className="mb-4 p-3 rounded-xl bg-red-500/20 text-red-200 text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 rounded-xl bg-green-500/20 text-green-200 text-sm">{success}</div>}

        {/* سجل العضويات الجديدة — مطوي */}
        <div className="rounded-2xl bg-surface-card border border-white/[0.06] p-4 mb-6 shadow-card">
          <button
            type="button"
            onClick={() => setShowNewMembersLog((v) => !v)}
            className="w-full flex items-center gap-2 text-right"
          >
            <span
              className={`inline-block transition-transform duration-200 ${showNewMembersLog ? 'rotate-180' : ''}`}
              aria-hidden
            >
              ▼
            </span>
            <h2 className="text-white font-semibold text-[0.9375rem] flex-1">سجل العضويات الجديدة</h2>
            {newMembersLog.length > 0 && (
              <span className="text-white/50 text-xs">({newMembersLog.length})</span>
            )}
          </button>
          {showNewMembersLog && (
            <>
              <p className="text-white/60 text-xs mb-3 mt-3">
                من سجّلوا من صفحة الضيف (تسجيل مجاني أو عضو جديد). اضغط «تحديث» لرؤية الجدد، وبعد إضافتهم للفضي في الإكسيل ارفع الملف أو امسح السجل.
              </p>
              {newMembersLog.length === 0 ? (
                <p className="text-white/50 text-sm">لا يوجد تسجيلات جديدة.</p>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto rounded-lg bg-white/5 border border-white/10 mb-3">
                    <table className="w-full text-right text-sm">
                      <thead className="sticky top-0 bg-surface-card text-white/70">
                        <tr>
                          <th className="p-2">الجوال</th>
                          <th className="p-2">الاسم</th>
                          <th className="p-2">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {newMembersLog.slice(0, newMembersLogLimit).map((entry) => (
                          <tr key={entry.id} className="border-t border-white/10">
                            <td className="p-2 text-white/90">{entry.phone}</td>
                            <td className="p-2 text-white/90">{entry.name || '—'}</td>
                            <td className="p-2 text-white/60 text-xs">
                              {entry.createdAt
                                ? new Date(entry.createdAt).toLocaleDateString('ar-SA', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {newMembersLogLimit < newMembersLog.length && (
                    <button
                      type="button"
                      onClick={() => setNewMembersLogLimit((n) => n + 10)}
                      className="mb-3 px-3 py-2 rounded-lg bg-white/10 text-white/80 text-sm hover:bg-white/20"
                    >
                      المزيد ({newMembersLog.length - newMembersLogLimit} متبقي)
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={loadNewMembersLog}
                      className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20"
                    >
                      تحديث
                    </button>
                    <button
                      type="button"
                      onClick={handleClearNewMembersLog}
                      disabled={clearingLog}
                      className="px-3 py-2 rounded-lg bg-amber-500/30 text-amber-200 text-sm hover:bg-amber-500/40 disabled:opacity-50"
                    >
                      {clearingLog ? 'جاري...' : 'مسح السجل'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* الإعدادات — مطوية */}
        <div className="rounded-2xl bg-surface-card border border-white/[0.06] p-4 space-y-4 shadow-card">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="w-full flex items-center gap-2 text-right"
          >
            <span
              className={`inline-block transition-transform duration-200 ${showSettings ? 'rotate-180' : ''}`}
              aria-hidden
            >
              ▼
            </span>
            <h2 className="text-white font-semibold text-[0.9375rem] flex-1">الإعدادات</h2>
          </button>
          {showSettings && (
          <div className="space-y-4 pt-2">
          <div>
            <label className="block text-white/70 text-sm mb-1">كل كم ريال = 1 نقطة</label>
            <input
              type="number"
              min={1}
              value={settings.revenueToPoints || 1}
              onChange={(e) =>
                setSettingsState((s) => ({ ...s, revenueToPoints: Number(e.target.value) || 1 }))
              }
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">نقاط الترقية: فضي → ذهبي</label>
            <input
              type="number"
              min={0}
              value={settings.pointsSilverToGold ?? 10000}
              onChange={(e) =>
                setSettingsState((s) => ({ ...s, pointsSilverToGold: Number(e.target.value) || 0 }))
              }
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">نقاط الترقية: ذهبي → بلاتيني</label>
            <input
              type="number"
              min={0}
              value={settings.pointsGoldToPlatinum ?? 12000}
              onChange={(e) =>
                setSettingsState((s) => ({ ...s, pointsGoldToPlatinum: Number(e.target.value) || 0 }))
              }
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
            />
          </div>

          <div className="border-t border-white/20 pt-5 mt-5">
            <h3 className="text-white font-semibold text-base mb-3">عجلة الحظ — الجوائز (5 إلى 20)</h3>
            <p className="text-white/70 text-sm mb-2 leading-relaxed">حدد عدد مرات المكسب أو اختر عدد لا نهائي لكل جائزة. عند نفاد العدد لا يقع المؤشر عليها.</p>
            <p className="text-white/60 text-sm mb-4 leading-relaxed">عمود <strong>%</strong> = نسبة الجائزة للتوثيق فقط. العجلة حالياً تعطي كل جائزة فرصة متساوية (١÷عدد الجوائز).</p>
            {settings.prizes.map((p, idx) => {
              const usage = getPrizeUsage()[p.id] ?? 0
              const maxWins = p.maxWins ?? 0
              return (
                <div key={p.id} className="mb-4 p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex gap-3 items-center mb-2.5 flex-wrap">
                    <input
                      type="text"
                      placeholder="اسم الجائزة"
                      value={p.label}
                      onChange={(e) => {
                        const next = [...settings.prizes]
                        next[idx] = { ...next[idx], label: e.target.value }
                        setSettingsState((s) => ({ ...s, prizes: next }))
                      }}
                      className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm sm:text-base"
                    />
                    <div className="flex items-center gap-1" title="نسبة الجائزة % — للتوثيق فقط. العجلة تعطي كل جائزة فرصة متساوية.">
                      <button
                        type="button"
                        onClick={() => {
                          const next = redistributePercent(settings.prizes, idx, (settings.prizes[idx].percent ?? 0) - 1)
                          setSettingsState((s) => ({ ...s, prizes: next }))
                        }}
                        className="w-9 h-10 flex items-center justify-center rounded-s-xl bg-white/10 border border-white/20 border-e-0 text-white/90 hover:bg-white/20 text-lg font-medium"
                        aria-label="ناقص"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="%"
                        value={p.percent}
                        onChange={(e) => {
                          const next = redistributePercent(settings.prizes, idx, Number(e.target.value) || 0)
                          setSettingsState((s) => ({ ...s, prizes: next }))
                        }}
                        className="input-no-spinner w-16 sm:w-20 px-2 py-2.5 rounded-none bg-white/10 border-y border-white/20 text-white text-sm sm:text-base text-center tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = redistributePercent(settings.prizes, idx, (settings.prizes[idx].percent ?? 0) + 1)
                          setSettingsState((s) => ({ ...s, prizes: next }))
                        }}
                        className="w-9 h-10 flex items-center justify-center rounded-e-xl bg-white/10 border border-white/20 border-s-0 text-white/90 hover:bg-white/20 text-lg font-medium"
                        aria-label="زائد"
                      >
                        +
                      </button>
                      <span className="text-white/60 text-sm mr-1">%</span>
                    </div>
                    {settings.prizes.length > 5 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = settings.prizes.filter((_, i) => i !== idx)
                          setSettingsState((s) => ({ ...s, prizes: next }))
                        }}
                        className="px-3 py-2 rounded-lg bg-red-500/30 text-red-200 text-sm"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                  <div className="flex gap-4 items-center flex-wrap text-sm sm:text-base">
                    <label className="flex items-center gap-2 text-white/80 cursor-pointer text-sm sm:text-base">
                      <input
                        type="checkbox"
                        checked={!!p.unlimited}
                        className="w-4 h-4 rounded"
                        onChange={(e) => {
                          const next = [...settings.prizes]
                          next[idx] = { ...next[idx], unlimited: e.target.checked, maxWins: e.target.checked ? undefined : (next[idx].maxWins ?? 8) }
                          setSettingsState((s) => ({ ...s, prizes: next }))
                        }}
                      />
                      عدد لا نهائي
                    </label>
                    {!p.unlimited && (
                      <>
                        <label className="text-white/70 text-sm sm:text-base">عدد مرات المكسب:</label>
                        <input
                          type="number"
                          min={1}
                          value={maxWins || ''}
                          onChange={(e) => {
                            const next = [...settings.prizes]
                            next[idx] = { ...next[idx], maxWins: Math.max(0, Number(e.target.value) || 0), unlimited: false }
                            setSettingsState((s) => ({ ...s, prizes: next }))
                          }}
                          placeholder="8"
                          className="w-20 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm sm:text-base"
                        />
                        <span className="text-white/50 text-sm sm:text-base">مستخدم {usage} من {maxWins || 0}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {settings.prizes.length < 20 && (
              <button
                type="button"
                onClick={() => {
                  const id = `p-${Date.now()}`
                  const newPrize: Prize = { id, label: 'جائزة جديدة', percent: 10, unlimited: true }
                  setSettingsState((s) => ({ ...s, prizes: [...s.prizes, newPrize] }))
                }}
                className="text-sm sm:text-base text-accent underline py-2"
              >
                + إضافة جائزة
              </button>
            )}
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">رقم واتساب الاستقبال (بدون +)</label>
            <input
              type="tel"
              value={settings.whatsAppNumber ?? ''}
              onChange={(e) =>
                setSettingsState((s) => ({ ...s, whatsAppNumber: e.target.value.trim() }))
              }
              placeholder="966126076060"
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">رابط انستجرام (بعد النجاح: تابعنا للاطلاع على عروضنا)</label>
            <input
              type="url"
              value={settings.instagramUrl ?? ''}
              onChange={(e) =>
                setSettingsState((s) => ({ ...s, instagramUrl: e.target.value.trim() }))
              }
              placeholder="https://instagram.com/yourhotel أو yourhotel"
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">رابط التحقق من الأهلية (اختياري — العجلة لا تبدأ إلا بعد تأكيد السيرفر أن الرقم لم يلعب اليوم)</label>
            <input
              type="url"
              value={settings.checkEligibilityUrl ?? ''}
              onChange={(e) =>
                setSettingsState((s) => ({ ...s, checkEligibilityUrl: e.target.value.trim() }))
              }
              placeholder="https://script.google.com/... أو Web App URL"
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">رسالة الفضي (استخدم {`{name}`} و {`{points}`} و {`{next}`})</label>
            <textarea
              rows={2}
              value={settings.messages.silver}
              onChange={(e) =>
                setSettingsState((s) => ({
                  ...s,
                  messages: { ...s.messages, silver: e.target.value },
                }))
              }
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white resize-none"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">رسالة الذهبي (استخدم {`{name}`} و {`{points}`} و {`{next}`})</label>
            <textarea
              rows={2}
              value={settings.messages.gold}
              onChange={(e) =>
                setSettingsState((s) => ({
                  ...s,
                  messages: { ...s.messages, gold: e.target.value },
                }))
              }
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white resize-none"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">رسالة البلاتيني (استخدم {`{name}`})</label>
            <textarea
              rows={2}
              value={settings.messages.platinum}
              onChange={(e) =>
                setSettingsState((s) => ({
                  ...s,
                  messages: { ...s.messages, platinum: e.target.value },
                }))
              }
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white resize-none"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">نص طلب التسجيل (للجدد — {`{name}`} فارغ لأنهم لم يسجلوا بعد)</label>
            <textarea
              rows={2}
              value={settings.messages.registerPrompt}
              onChange={(e) =>
                setSettingsState((s) => ({
                  ...s,
                  messages: { ...s.messages, registerPrompt: e.target.value },
                }))
              }
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white resize-none"
            />
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-1">رسالة تم وصول الرسالة للاستقبال (استخدم {`{name}`})</label>
            <input
              type="text"
              value={settings.messages.successReception}
              onChange={(e) =>
                setSettingsState((s) => ({
                  ...s,
                  messages: { ...s.messages, successReception: e.target.value },
                }))
              }
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            className="w-full py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover transition-colors"
          >
            حفظ الإعدادات
          </button>
          </div>
          )}
        </div>

        {/* QR للطباعة — لوحة للتعليق في النزل */}
        <div className="mb-8 p-4 rounded-2xl bg-surface-card border border-white/[0.06] shadow-card">
          <button
            type="button"
            onClick={() => setShowQRPrint((v) => !v)}
            className="w-full flex items-center gap-2 text-right"
          >
            <span
              className={`inline-block transition-transform duration-200 ${showQRPrint ? 'rotate-180' : ''}`}
              aria-hidden
            >
              ▼
            </span>
            <h2 className="text-white font-semibold text-[0.9375rem] flex-1">📱 QR للطباعة — عجلة الحظ</h2>
          </button>
          {showQRPrint && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div
                id="print-qr-card"
                className="mx-auto max-w-[320px] bg-white rounded-2xl p-6 shadow-xl text-center print:max-w-full print:p-8"
              >
                <div className="mb-3 text-[#0a0a0a] font-bold text-xl tracking-wide">عجلة الحظ</div>
                <p className="text-[#444] text-sm mb-4">امسح للعب وربح جوائز</p>
                <div className="flex justify-center">
                  <div className="inline-flex items-center justify-center p-4 rounded-xl bg-white border-2 border-[#14b8a6]/30" id="qr-container">
                    <QRCodeSVG
                      value={(() => {
                        const pid = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
                        return pid ? `https://${pid}.web.app/` : (typeof window !== 'undefined' ? `${window.location.origin}/` : '/')
                      })()}
                      size={180}
                      level="H"
                      includeMargin={false}
                      fgColor="#0a0a0a"
                      bgColor="#ffffff"
                    />
                  </div>
                </div>
                <p className="text-[#666] text-xs mt-4">امسح الكود لفتح صفحة العجلة</p>
                <div className="mt-4 flex flex-row justify-center gap-3 print:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      const svg = document.querySelector('#qr-container svg') as SVGSVGElement
                      if (!svg) return
                      const s = new XMLSerializer().serializeToString(svg)
                      const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const img = new Image()
                      img.onload = () => {
                        const c = document.createElement('canvas')
                        c.width = img.width
                        c.height = img.height
                        const ctx = c.getContext('2d')
                        if (ctx) {
                          ctx.fillStyle = '#fff'
                          ctx.fillRect(0, 0, c.width, c.height)
                          ctx.drawImage(img, 0, 0)
                          const a = document.createElement('a')
                          a.href = c.toDataURL('image/png')
                          a.download = 'qr-ajalat-alhaz.png'
                          a.click()
                        }
                        URL.revokeObjectURL(url)
                      }
                      img.src = url
                    }}
                    className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl bg-primary-500/20 text-primary-500 border border-primary-500/40 hover:bg-primary-500/30 transition-colors"
                    title="تحميل"
                  >
                    <span className="text-xl" aria-hidden>⬇</span>
                    <span className="text-xs font-medium">تحميل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl bg-primary-500/20 text-primary-500 border border-primary-500/40 hover:bg-primary-500/30 transition-colors"
                    title="طباعة A4"
                  >
                    <span className="text-xl" aria-hidden>🖨</span>
                    <span className="text-xs font-medium">طباعة A4</span>
                  </button>
                </div>
              </div>
              <p className="text-white/50 text-xs mt-3 text-center">
                الرابط ثابت — اطبع وعلّق في الاستقبال أو أي مكان
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-white/50 text-sm mt-6">
          <a href="/" className="text-accent underline" data-testid="link-to-guest">العودة لصفحة الزبون</a>
        </p>
      </div>

      {/* نافذة منبثقة — إحصائيات التكرار */}
      {duplicateReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDuplicateReport(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-report-title"
        >
          <div
            className="w-full max-w-[400px] max-h-[85dvh] overflow-hidden rounded-2xl bg-surface-card border border-white/10 shadow-xl flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 id="duplicate-report-title" className="text-white font-semibold text-lg flex items-center gap-2">
                <span>{ICONS[duplicateReport.key]}</span>
                إحصائيات الرفع — {LABELS[duplicateReport.key]}
              </h2>
              <button
                type="button"
                onClick={() => setDuplicateReport(null)}
                className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-white/60 text-xs">إجمالي صفوف الملف</p>
                  <p className="text-white font-bold text-xl">{duplicateReport.rawFileRows}</p>
                </div>
                {duplicateReport.key === 'revenue' && duplicateReport.revenueParsedCount != null ? (
                  <>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-white/60 text-xs">نزلاء فريدون في الملف</p>
                      <p className="text-white font-bold text-xl">{duplicateReport.revenueParsedCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-primary-500/20 border border-primary-500/30">
                      <p className="text-primary-400/80 text-xs">تم الربط برقم جوال</p>
                      <p className="text-primary-400 font-bold text-xl">{duplicateReport.totalRows}</p>
                    </div>
                    {duplicateReport.revenueTierBreakdown && duplicateReport.revenueTierBreakdown.silver + duplicateReport.revenueTierBreakdown.gold + duplicateReport.revenueTierBreakdown.platinum + duplicateReport.revenueTierBreakdown.notInTier > 0 && (
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 col-span-2">
                        <p className="text-white/60 text-xs mb-2">منهم (حسب الفئة في القوائم):</p>
                        <div className="flex flex-wrap gap-3 text-sm">
                          <span className="text-amber-200/90">🥈 فضي: {duplicateReport.revenueTierBreakdown.silver}</span>
                          <span className="text-yellow-300/90">🥇 ذهبي: {duplicateReport.revenueTierBreakdown.gold}</span>
                          <span className="text-cyan-300/90">💎 بلاتيني: {duplicateReport.revenueTierBreakdown.platinum}</span>
                          {duplicateReport.revenueTierBreakdown.notInTier > 0 && (
                            <span className="text-white/60">غير موجود في الفئات: {duplicateReport.revenueTierBreakdown.notInTier}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {duplicateReport.revenueParsedCount > duplicateReport.totalRows && (
                      <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 col-span-2">
                        <p className="text-red-300/90 text-xs">لم يُربط برقم جوال — ارفع ملفات العملاء (📎 في قسم «ربط كشف الإيراد») إن لم تكن رفعت. إن كنت رفعتهم وقد بقي هؤلاء، فغالباً غير موجودين في قائمة العملاء أو الاسم/رقم الهوية في كشف الإيراد مكتوب بشكل مختلف.</p>
                        <p className="text-red-300 font-bold text-xl">{duplicateReport.revenueParsedCount - duplicateReport.totalRows} نزيل</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-white/60 text-xs">صفوف صالحة (بجوال)</p>
                      <p className="text-white font-bold text-xl">{duplicateReport.totalRows}</p>
                    </div>
                    {duplicateReport.rawFileRows > duplicateReport.totalRows && (
                      <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 col-span-2">
                        <p className="text-red-300/90 text-xs">صفوف مرفوضة (بدون جوال صالح: ٩ أرقام على الأقل)</p>
                        <p className="text-red-300 font-bold text-xl">{duplicateReport.rawFileRows - duplicateReport.totalRows}</p>
                      </div>
                    )}
                  </>
                )}
                <div className="p-3 rounded-xl bg-primary-500/20 border border-primary-500/30">
                  <p className="text-primary-400/80 text-xs">تم رفع</p>
                  <p className="text-primary-400 font-bold text-xl">{duplicateReport.uploaded}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30">
                  <p className="text-amber-400/80 text-xs">صفوف مكررة (نفس الجوال)</p>
                  <p className="text-amber-400 font-bold text-xl">{duplicateReport.duplicateCount}</p>
                </div>
              </div>

              {duplicateReport.duplicates.length > 0 && (
                <div>
                  <h3 className="text-white/90 font-medium text-sm mb-2">بيان التكرار</h3>
                  <div className="max-h-48 overflow-y-auto rounded-xl bg-white/5 border border-white/10">
                    <table className="w-full text-right text-sm">
                      <thead className="sticky top-0 bg-surface-card text-white/70">
                        <tr>
                          <th className="p-2">رقم الجوال</th>
                          <th className="p-2">مرات التكرار</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicateReport.duplicates.map((d) => (
                          <tr key={d.phone} className="border-t border-white/10">
                            <td className="p-2 text-white/90 font-mono">{d.phone}</td>
                            <td className="p-2 text-amber-400">{d.count}×</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-white/50 text-xs mt-2">النظام يحفظ رقم واحد لكل جوال (الأخير يطغى).</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDuplicateReport(null)}
                className="w-full py-2.5 rounded-xl bg-primary-500/30 text-primary-400 font-medium hover:bg-primary-500/40 transition-colors"
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
