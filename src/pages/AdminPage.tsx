import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearAdminSession } from '@/services/adminAuth'
import { parseMemberFile, parseRevenueFile, mergeRevenueParseRows, parseMappingFile, mergeMappingResults, resolveRevenueToPhone, mergeRevenueUpdateWithStrictMatch, type MergeRevenueReport } from '@/services/excelParser'
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
  getRevenueRowsAsync,
  getSilverRowsAsync,
  getGoldRowsAsync,
  getPlatinumRowsAsync,
  checkFirebaseConnection,
  getNewMembersLogAsync,
  clearNewMembersLogAsync,
  addAuditLogAsync,
  getAuditLogAsync,
  getPrizeUsageAsync,
  type FirebaseCheckResult,
  type NewMemberLogEntry,
} from '@/services/firestoreLoyaltyService'
import { getNewMembersLog, clearNewMembersLog } from '@/services/storage'
import { exportBackupToExcel } from '@/services/exportBackup'
import { appendAuditLogLocal, getAuditLogLocal, type AuditLogEntry } from '@/services/auditLogService'
import { getUsage, isNearLimit } from '@/services/firestoreUsageTracker'
import { getProjectUsageAsync, invalidateProjectUsageCache, type ProjectUsageResult } from '@/services/firestoreProjectUsageService'
import { defaultSettings } from '@/services/mockSettings'
import { saveSettingsBackup, listSettingsBackups, restoreFromBackup, type BackupEntry } from '@/services/settingsBackup'
import type { Prize, Settings } from '@/types'
import { AdminStatsCards } from './admin/AdminStatsCards'
import { AdminExcelFormat } from './admin/AdminExcelFormat'
import { AdminQRPrint } from './admin/AdminQRPrint'
import { MaskedSecretInput } from '@/components/MaskedSecretInput'
import { ModalFocusTrap } from '@/components/ModalFocusTrap'

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

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

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

const roundPercent = (x: number) => Math.round(x * 100) / 100

/** إعادة توزيع النسب عند تغيير جائزة — المجموع يبقى 100%. الجوائز ذات fixedPercent لا تُغيّر. */
function redistributePercent(prizes: Prize[], idx: number, newPercent: number): Prize[] {
  const clamped = roundPercent(Math.max(0, Math.min(100, newPercent)))
  const next = prizes.map((p) => ({ ...p, percent: roundPercent(p.percent ?? 0) }))
  next[idx] = { ...next[idx], percent: clamped }
  const otherFixedIndices = next.map((_, i) => i).filter((i) => i !== idx && next[i].fixedPercent === true)
  const totalFixedOthers = otherFixedIndices.reduce((s, i) => s + next[i].percent, 0)
  const remaining = roundPercent(100 - clamped - totalFixedOthers)
  const otherIndices = next.map((_, i) => i).filter((i) => i !== idx && !next[i].fixedPercent)
  if (otherIndices.length === 0) return next
  const sumOthers = otherIndices.reduce((s, i) => s + next[i].percent, 0)
  if (sumOthers <= 0) {
    const each = roundPercent(remaining / otherIndices.length)
    otherIndices.forEach((i, j) => {
      const val = j === otherIndices.length - 1
        ? roundPercent(Math.max(0, remaining - each * (otherIndices.length - 1)))
        : each
      next[i] = { ...next[i], percent: val }
    })
  } else {
    let allocated = 0
    otherIndices.forEach((i, j) => {
      const ratio = next[i].percent / sumOthers
      const val = j === otherIndices.length - 1
        ? roundPercent(Math.max(0, remaining - allocated))
        : roundPercent((ratio * remaining))
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
  const [showClearLogConfirm, setShowClearLogConfirm] = useState(false)
  const [refreshingNewMembersLog, setRefreshingNewMembersLog] = useState(false)
  const [showNewMembersLog, setShowNewMembersLog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showExcelFormat, setShowExcelFormat] = useState(false)
  const [newMembersLogLimit, setNewMembersLogLimit] = useState(10)
  type NewMembersFilter = 'all' | 'day' | 'yesterday' | 'week' | 'month' | 'range'
  const [newMembersLogFilter, setNewMembersLogFilter] = useState<NewMembersFilter>('all')
  const [newMembersFilterDateFrom, setNewMembersFilterDateFrom] = useState('')
  const [newMembersFilterDateTo, setNewMembersFilterDateTo] = useState('')
  const [usage, setUsage] = useState(() => getUsage())
  const [projectUsage, setProjectUsage] = useState<ProjectUsageResult | null>(null)
  const [loadingProjectUsage, setLoadingProjectUsage] = useState(false)
  const [saveSettingsStatus, setSaveSettingsStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [showQRPrint, setShowQRPrint] = useState(false)
  const [useRevenueNameLink, setUseRevenueNameLink] = useState(true)
  const [mappingCount, setMappingCount] = useState(getRevenueMapping().length)
  /** عند true: رفع كشف الإيراد = دمج مع الموجود (مطابقة 100% اسم + جوال أو هوية) */
  const [revenueMergeMode, setRevenueMergeMode] = useState(false)
  const [lastMergeReport, setLastMergeReport] = useState<MergeRevenueReport | null>(null)
  const [exportBackupLoading, setExportBackupLoading] = useState(false)
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [auditLogEntries, setAuditLogEntries] = useState<Array<AuditLogEntry & { id?: string }>>([])
  /** معاينة قبل تطبيق دمج الإيراد — يُعرض للمستخدم ثم تطبيق أو إلغاء */
  const [mergePreview, setMergePreview] = useState<{
    merged: import('@/types').RevenueRow[]
    report: MergeRevenueReport
    fileName: string
  } | null>(null)
  const [mergeApplyLoading, setMergeApplyLoading] = useState(false)
  const [analyticsPrizeUsage, setAnalyticsPrizeUsage] = useState<Record<string, number> | null>(null)

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

  const fetchProjectUsage = useCallback(async () => {
    setLoadingProjectUsage(true)
    try {
      const result = await getProjectUsageAsync()
      setProjectUsage(result)
    } finally {
      setLoadingProjectUsage(false)
    }
  }, [])

  useEffect(() => {
    if (firebaseCheck?.firestoreStatus === 'ok' && projectUsage === null && !loadingProjectUsage) {
      fetchProjectUsage()
    }
  }, [firebaseCheck?.firestoreStatus, projectUsage, loadingProjectUsage, fetchProjectUsage])

  const loadNewMembersLog = useCallback(() => {
    if (useFirestore) {
      getNewMembersLogAsync().then(setNewMembersLog)
    } else {
      setNewMembersLog(getNewMembersLog())
    }
  }, [useFirestore])

  const handleRefreshNewMembersLog = useCallback(async () => {
    setRefreshingNewMembersLog(true)
    setError('')
    setSuccess('')
    try {
      let count: number
      if (useFirestore) {
        const list = await getNewMembersLogAsync()
        setNewMembersLog(list)
        count = list.length
      } else {
        const list = getNewMembersLog()
        setNewMembersLog(list)
        count = list.length
      }
      setSuccess(`تم التحديث — ${count} سجل`)
    } catch {
      setError('فشل تحديث السجل. تحقق من الاتصال وحاول مرة أخرى.')
    } finally {
      setRefreshingNewMembersLog(false)
    }
  }, [useFirestore])

  useEffect(() => {
    loadNewMembersLog()
  }, [loadNewMembersLog])

  useEffect(() => {
    if (useFirestore) getPrizeUsageAsync().then(setAnalyticsPrizeUsage)
    else setAnalyticsPrizeUsage(null)
  }, [useFirestore])

  const loadAuditLog = useCallback(async () => {
    if (useFirestore) {
      const list = await getAuditLogAsync(50)
      setAuditLogEntries(list)
    } else {
      setAuditLogEntries(getAuditLogLocal(50))
    }
  }, [useFirestore])

  const handleApplyMergePreview = useCallback(async () => {
    if (!mergePreview) return
    setMergeApplyLoading(true)
    setError('')
    try {
      const { merged, report, fileName } = mergePreview
      setRevenue(merged)
      if (useFirestore) {
        await writeRevenueBatch(merged)
        invalidateProjectUsageCache()
        fetchProjectUsage()
        const c = await getCountsAsync()
        setCounts(c)
      } else {
        setCounts((c) => ({ ...c, revenue: merged.length }))
      }
      const noMatch = report.skipped.filter((s) => s.reason === 'no-match').length
      const multiMatch = report.skipped.filter((s) => s.reason === 'multiple-matches').length
      const noNameOrId = report.skipped.filter((s) => s.reason === 'no-name-or-id').length
      setSuccess(
        `تم التحديث (دمج): ${report.mergedCount} صف مُدمج، إجمالي مُضاف ${report.totalAddedAmount.toLocaleString('ar-SA')} ريال` +
          (report.skipped.length > 0 ? ` — تخطي ${report.skipped.length} (لا تطابق: ${noMatch}، أكثر من مطابق: ${multiMatch}، ناقص اسم/هوية: ${noNameOrId})` : '')
      )
      appendAuditLogLocal({ action: 'upload', key: 'revenue', fileName, count: merged.length, mergeCount: report.mergedCount, at: Date.now() })
      if (useFirestore) void addAuditLogAsync({ action: 'upload', key: 'revenue', fileName, count: merged.length, mergeCount: report.mergedCount })
      setMergePreview(null)
      setTimeout(() => setSuccess(''), 5000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تطبيق الدمج. تحقق من الاتصال وحاول مرة أخرى.')
    } finally {
      setMergeApplyLoading(false)
    }
  }, [mergePreview, useFirestore, fetchProjectUsage])

  const handleCancelMergePreview = useCallback(() => {
    setMergePreview(null)
  }, [])

  /** تاريخ ووقت ميلادي للعرض والطباعة */
  const formatNewMemberDateTime = useCallback((ts: number) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(',', ' —')
  }, [])

  const filteredNewMembersLog = useMemo(() => {
    const list = newMembersLog
    if (newMembersLogFilter === 'all') return list
    const now = Date.now()
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayStart = startOfToday.getTime()
    const dayMs = 24 * 60 * 60 * 1000
    const yesterdayStart = todayStart - dayMs
    const weekStart = todayStart - 7 * dayMs
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1)
    const monthStart = startOfMonth.getTime()

    const inRange = (ts: number, from: number, to: number) => ts >= from && ts <= to
    if (newMembersLogFilter === 'day') return list.filter((e) => e.createdAt >= todayStart && e.createdAt <= now)
    if (newMembersLogFilter === 'yesterday') return list.filter((e) => inRange(e.createdAt, yesterdayStart, todayStart - 1))
    if (newMembersLogFilter === 'week') return list.filter((e) => e.createdAt >= weekStart && e.createdAt <= now)
    if (newMembersLogFilter === 'month') return list.filter((e) => e.createdAt >= monthStart && e.createdAt <= now)
    if (newMembersLogFilter === 'range') {
      const from = newMembersFilterDateFrom ? new Date(newMembersFilterDateFrom).setHours(0, 0, 0, 0) : 0
      const to = newMembersFilterDateTo ? new Date(newMembersFilterDateTo).setHours(23, 59, 59, 999) : now
      if (!from && !to) return list
      return list.filter((e) => e.createdAt >= from && e.createdAt <= to)
    }
    return list
  }, [newMembersLog, newMembersLogFilter, newMembersFilterDateFrom, newMembersFilterDateTo])

  /** تحميل خفيف عند فتح صفحة الأدمن: إعدادات + أعداد فقط (بدون جلب كل الوثائق) — يقلل استهلاك Firestore كثيراً. القوائم الكاملة تُجلب عند الحاجة (تصدير، دمج إيراد، ربط). */
  useEffect(() => {
    if (!useFirestore) return
    let cancelled = false
    Promise.all([getSettingsAsync(), getCountsAsync()])
      .then(([s, c]) => {
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
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError('حجم الملف يتجاوز 10 ميجابايت. قلّل حجم الملف وحاول مرة أخرى.')
      setLoading(null)
      setUploadStep(null)
      setUploadCount(null)
      return
    }
    try {
      let finalCount = 0
      let revenueParsedCount = 0
      let rawFileRows = 0
      let rowsForReport: { phone: string }[] = []
      let revenueMembersWithTier: { phone: string; tier?: 'silver' | 'gold' | 'platinum' }[] | undefined
      if (key === 'revenue') {
        if (revenueMergeMode) {
          setLastMergeReport(null)
          const { rows: updateRows, rawDataRows: mergeRawRows } = await parseRevenueFile(file)
          rawFileRows = mergeRawRows
          if (updateRows.length === 0) {
            setError('الملف لا يحتوي صفوفاً صالحة (اسم + جوال أو هوية + مبلغ).')
            setLoading(null)
            setUploadStep(null)
            setUploadCount(null)
            return
          }
          setUploadStep('uploading')
          setUploadCount(updateRows.length)
          let existingRevenue: { phone: string; total_spent: number }[]
          let members: { phone: string; idNumber?: string; name?: string }[]
          if (useFirestore) {
            existingRevenue = await getRevenueRowsAsync()
            members = await getMembersForRevenueResolveAsync()
          } else {
            existingRevenue = getRevenue().map((r) => ({ phone: r.phone, total_spent: r.total_spent ?? 0 }))
            members = [
              ...getSilver().map((m) => ({ ...m, tier: 'silver' as const })),
              ...getGold().map((m) => ({ ...m, tier: 'gold' as const })),
              ...getPlatinum().map((m) => ({ ...m, tier: 'platinum' as const })),
            ]
          }
          const normP = (s: string) => s.replace(/\D/g, '').slice(-9)
          const existing: Array<{ phone: string; name: string; idNumber: string; total_spent: number }> = existingRevenue.map((r) => {
            const m = members.find((x) => normP(x.phone) === normP(r.phone))
            return {
              phone: r.phone,
              name: (m?.name ?? '').trim(),
              idNumber: (m?.idNumber ?? '').replace(/\D/g, '').slice(-10),
              total_spent: r.total_spent,
            }
          })
          const { merged, report } = mergeRevenueUpdateWithStrictMatch(existing, updateRows)
          setLastMergeReport(report)
          setMergePreview({ merged, report, fileName: file.name })
          setLoading(null)
          setUploadStep(null)
          setUploadCount(null)
        } else {
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
          setLastMergeReport(null)
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
      const isRevenueMerge = key === 'revenue' && revenueMergeMode
      if (!isRevenueMerge) {
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
            ? computeRevenueTierBreakdown(rowsForReport.map((r) => r.phone), revenueMembersWithTier!)
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
        appendAuditLogLocal({ action: 'upload', key, fileName: fileLabel, count: finalCount, at: Date.now() })
        if (useFirestore) {
          void addAuditLogAsync({ action: 'upload', key, fileName: fileLabel, count: finalCount })
          invalidateProjectUsageCache()
          fetchProjectUsage()
        }
      }
      if (firebaseCheck?.firestoreStatus === 'ok') setUsage(getUsage())
      setTimeout(() => {
        setLoading(null)
        setUploadStep(null)
        setUploadCount(null)
        setUsage(getUsage())
      }, 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر قراءة الملف. تحقق من صحة الملف وحاول مرة أخرى.')
      setLoading(null)
      setUploadStep(null)
      setUploadCount(null)
    }
  }, [useFirestore, revenueMergeMode, useRevenueNameLink, firebaseCheck?.firestoreStatus, fetchProjectUsage])

  const handleExportBackup = useCallback(async () => {
    setExportBackupLoading(true)
    setError('')
    try {
      let silver = getSilver()
      let gold = getGold()
      let platinum = getPlatinum()
      let revenue = getRevenue()
      if (useFirestore) {
        const [s, g, p, r] = await Promise.all([
          getSilverRowsAsync(),
          getGoldRowsAsync(),
          getPlatinumRowsAsync(),
          getRevenueRowsAsync(),
        ])
        silver = s
        gold = g
        platinum = p
        revenue = r
      }
      exportBackupToExcel(silver, gold, platinum, revenue)
      setSuccess('تم تصدير النسخة الاحتياطية (ملف إكسل تم تنزيله)')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر التصدير. تحقق من الاتصال وحاول مرة أخرى.')
    } finally {
      setExportBackupLoading(false)
    }
  }, [useFirestore])

  const validateSettingsForSave = useCallback((s: Settings): string | null => {
    const rtp = s.revenueToPoints
    if (typeof rtp !== 'number' || !Number.isFinite(rtp) || rtp <= 0) {
      return 'نقاط لكل ريال يجب أن تكون رقماً موجباً'
    }
    const psg = s.pointsSilverToGold
    if (typeof psg !== 'number' || !Number.isFinite(psg) || psg < 0) {
      return 'نقاط الترقية (فضي → ذهبي) يجب أن تكون رقماً غير سالب'
    }
    const pgp = s.pointsGoldToPlatinum
    if (typeof pgp !== 'number' || !Number.isFinite(pgp) || pgp < 0) {
      return 'نقاط الترقية (ذهبي → بلاتيني) يجب أن تكون رقماً غير سالب'
    }
    return null
  }, [])

  const handleSaveSettings = useCallback(async () => {
    const validationError = validateSettingsForSave(settings)
    if (validationError) {
      setError(validationError)
      return
    }
    setSettings(settings)
    setError('')
    setSaveSettingsStatus('saving')
    if (useFirestore) {
        try {
          await writeSettingsToFirestore(settings)
          saveSettingsBackup(settings)
          setSuccess('تم حفظ الإعدادات (Firebase)')
          appendAuditLogLocal({ action: 'settings', at: Date.now() })
          void addAuditLogAsync({ action: 'settings' })
          setSaveSettingsStatus('success')
          setTimeout(() => setSaveSettingsStatus('idle'), 2500)
        } catch {
        setError('تعذّر حفظ الإعدادات. تحقق من الاتصال وحاول مرة أخرى.')
        setSaveSettingsStatus('error')
        setTimeout(() => setSaveSettingsStatus('idle'), 3000)
      }
    } else {
      saveSettingsBackup(settings)
      setSuccess('تم حفظ الإعدادات')
      appendAuditLogLocal({ action: 'settings', at: Date.now() })
      setSaveSettingsStatus('success')
      setTimeout(() => setSaveSettingsStatus('idle'), 2500)
    }
  }, [settings, useFirestore, validateSettingsForSave])

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
      setError('تعذّر مسح السجل. تحقق من الاتصال وحاول مرة أخرى.')
    } finally {
      setClearingLog(false)
    }
  }, [useFirestore, loadNewMembersLog])

  const handlePrintNewMembersLog = useCallback(() => {
    const list = filteredNewMembersLog
    const title = newMembersLogFilter === 'all'
      ? 'سجل العضويات الجديدة — الكل'
      : newMembersLogFilter === 'day'
        ? 'سجل العضويات الجديدة — اليوم'
        : newMembersLogFilter === 'yesterday'
          ? 'سجل العضويات الجديدة — أمس'
          : newMembersLogFilter === 'week'
            ? 'سجل العضويات الجديدة — آخر أسبوع'
            : newMembersLogFilter === 'month'
              ? 'سجل العضويات الجديدة — آخر شهر'
              : 'سجل العضويات الجديدة — من تاريخ إلى تاريخ'
    const rows = list.map(
      (e) =>
        `<tr><td>${(e.name || '—').replace(/</g, '&lt;')}</td><td>${e.phone}</td><td>${(e.idLastDigits ?? '—').toString().replace(/</g, '&lt;')}</td><td>${formatNewMemberDateTime(e.createdAt)}</td></tr>`
    )
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;padding:1rem;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #333;padding:0.5rem 0.75rem;text-align:right;} th{background:#eee;}</style></head><body><h1>${title}</h1><p>عدد السجلات: ${list.length}</p><table><thead><tr><th>الاسم</th><th>الجوال</th><th>الهوية (آخر 4)</th><th>التاريخ والوقت (ميلادي)</th></tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }, [filteredNewMembersLog, newMembersLogFilter, formatNewMemberDateTime])

  const handleLogout = useCallback(() => {
    clearAdminSession()
    window.location.replace('/admin')
  }, [])

  return (
    <div className="min-h-screen-dvh bg-surface text-white font-arabic pt-2 sm:pt-4 px-3 sm:px-4 pb-8 safe-area-insets overflow-x-hidden">
      {mergePreview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm safe-area-insets" role="dialog" aria-modal="true" aria-labelledby="merge-preview-title">
          <ModalFocusTrap active={!!mergePreview} onDeactivate={handleCancelMergePreview}>
          <div className="bg-surface-card border border-white/20 rounded-2xl p-5 sm:p-6 max-w-md w-full max-h-[85dvh] overflow-y-auto shadow-xl">
            <h2 id="merge-preview-title" className="text-lg font-semibold text-white mb-3">معاينة الدمج</h2>
            <p className="text-white/80 text-sm mb-2">الملف: {mergePreview.fileName}</p>
            <ul className="text-white/90 text-sm space-y-1 mb-4">
              <li>صفوف ستُدمج: <strong>{mergePreview.report.mergedCount}</strong></li>
              <li>إجمالي مبلغ يُضاف: <strong>{mergePreview.report.totalAddedAmount.toLocaleString('ar-SA')} ريال</strong></li>
              <li>صفوف مُتخطاة (بدون تطبيق): <strong>{mergePreview.report.skipped.length}</strong></li>
            </ul>
            <p className="text-white/50 text-xs mb-4">تطبيق الدمج سيحدّث الإيراد الحالي ويحفظ النتيجة. لا دمج عشوائي — فقط المطابقات 100%.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancelMergePreview}
                disabled={mergeApplyLoading}
                className="flex-1 py-2.5 rounded-xl border border-white/30 text-white/90 font-medium disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleApplyMergePreview()}
                disabled={mergeApplyLoading}
                className="flex-1 py-2.5 rounded-xl text-white font-medium disabled:opacity-50 bg-primary-500 hover:bg-primary-600"
              >
                {mergeApplyLoading ? 'جاري التطبيق...' : 'تطبيق الدمج'}
              </button>
            </div>
          </div>
          </ModalFocusTrap>
        </div>
      )}
      <div className="max-w-2xl mx-auto min-w-0" data-testid="admin-dashboard">
        <header className="flex items-center justify-between w-full gap-3 mb-3 sm:mb-4">
          <img
            src="/logo-1.png"
            alt="Elite"
            className="h-10 sm:h-12 w-auto max-w-[140px] object-contain object-center shrink-0"
            decoding="async"
            style={{ background: 'transparent', mixBlendMode: 'multiply' }}
          />
          <h1 className="text-lg sm:text-xl font-semibold text-white text-center flex-1 min-w-0">لوحة التحكم</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium border border-white/25 bg-white/5 text-white/90 hover:bg-white/10 hover:border-white/40 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50"
          >
            تسجيل خروج
          </button>
        </header>

        <AdminStatsCards
          useFirestore={useFirestore}
          analyticsPrizeUsage={analyticsPrizeUsage}
          newMembersLog={newMembersLog}
          settings={settings}
        />

        {/* فحص Firebase — رسالة واضحة مع سبب ومعالجة */}
        {firebaseCheck && (
          <div
            className={`mb-4 p-4 rounded-2xl text-sm sm:text-base leading-relaxed ${
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
                    {/* استهلاك المشروع الحقيقي (من Monitoring API) */}
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white/70 text-xs">استهلاك المشروع (آخر 24 ساعة) — من أي جهاز</p>
                        <button
                          type="button"
                          onClick={fetchProjectUsage}
                          disabled={loadingProjectUsage}
                          className="text-primary-400 hover:text-primary-300 text-xs font-medium underline disabled:opacity-50"
                        >
                          {loadingProjectUsage ? 'جاري التحديث…' : 'تحديث الاستهلاك'}
                        </button>
                      </div>
                      {projectUsage !== null && (
                        <>
                          <div>
                            <div className="flex justify-between text-xs text-white/70 mb-0.5">
                              <span>قراءة: {projectUsage.reads.toLocaleString('ar')} / {projectUsage.limitReads.toLocaleString('ar')}</span>
                              <span>{projectUsage.readPercent}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full transition-all duration-500 rounded-full"
                                style={{
                                  width: `${Math.min(100, projectUsage.readPercent)}%`,
                                  background: 'linear-gradient(90deg, #dc2626 0%, #eab308 50%, #16a34a 100%)',
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs text-white/70 mb-0.5">
                              <span>كتابة: {projectUsage.writes.toLocaleString('ar')} / {projectUsage.limitWrites.toLocaleString('ar')}</span>
                              <span>{projectUsage.writePercent}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full transition-all duration-500 rounded-full"
                                style={{
                                  width: `${Math.min(100, projectUsage.writePercent)}%`,
                                  background: 'linear-gradient(90deg, #dc2626 0%, #eab308 50%, #16a34a 100%)',
                                }}
                              />
                            </div>
                          </div>
                          {!projectUsage.ok && projectUsage.error && (
                            <p className="text-amber-200/90 text-xs">تحذير: {projectUsage.error}</p>
                          )}
                          {(projectUsage.readPercent >= 80 || projectUsage.writePercent >= 80) && (
                            <p className="text-red-300 text-xs font-medium mt-2" role="alert">
                              تنبيه: استهلاك Firestore قريب من الحصة اليومية. راجع Firebase Console.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <p className="text-white/50 text-xs mt-3">استخدام هذا الجهاز فقط: قراءة {usage.reads.toLocaleString('ar')}، كتابة {usage.writes.toLocaleString('ar')}. يُصفَّر عند منتصف ليل Pacific.</p>
                    {isNearLimit(80) && (
                      <p className="text-red-300 text-xs font-medium mt-2" role="alert">
                        تنبيه: استهلاك هذا المتصفح قريب من الحصة اليومية المقدرة.
                      </p>
                    )}
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseCheck.projectId}/usage`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-sm font-medium underline mt-1"
                    >
                      عرض الاستخدام في Firebase Console ←
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <AdminExcelFormat show={showExcelFormat} onToggle={() => setShowExcelFormat((v) => !v)} />

        {/* 4 upload icons + رفع بيانات النزلاء (لربط الإيراد بالجوال) */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {(['silver', 'gold', 'platinum', 'revenue'] as const).map((key) => (
            <label
              key={key}
              className="flex flex-col items-center justify-center rounded-2xl bg-surface-card border border-white/[0.06] p-6 min-h-[88px] cursor-pointer active:scale-[0.98] transition-transform shadow-card touch-manipulation"
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple={key === 'revenue' && !revenueMergeMode}
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files
                  if (!list?.length) return
                  const files = key === 'revenue' ? [...list].slice(0, revenueMergeMode ? 1 : 5) : [list[0]]
                  if (files[0]) handleFile(key, key === 'revenue' ? files : files[0])
                  e.target.value = ''
                }}
                disabled={loading !== null}
              />
              <span className="text-4xl mb-2">{ICONS[key]}</span>
              <span className="text-white/90 font-medium text-center text-sm">
                {key === 'revenue' ? (
                  <>كشف الإيراد <span className="text-white/60 text-xs block">{revenueMergeMode ? '(تحديث دمج)' : '(حتى 5 ملفات)'}</span></>
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

        {/* خيار تحديث إيراد (دمج) — مطابقة 100% اسم + جوال أو هوية */}
        <div className="mb-4 p-3 rounded-xl bg-surface-card border border-white/[0.06]">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={revenueMergeMode}
              onChange={(e) => setRevenueMergeMode(e.target.checked)}
              className="rounded border-white/30 bg-white/10 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-white/90 text-sm font-medium">تحديث إيراد (دمج مع الموجود)</span>
          </label>
          <p className="text-white/50 text-xs mt-1.5 pr-7">
            عند التفعيل: الملف يُدمج مع الإيراد الحالي. الدمج يتم <strong>فقط</strong> عند مطابقة 100%: الاسم + (رقم الجوال أو رقم الهوية). لا دمج عشوائي — إن وُجد أكثر من مطابق أو لا يوجد مطابق يُتخطى الصف.
          </p>
        </div>

        {/* تصدير نسخة احتياطية */}
        <div className="mb-6 p-3 rounded-xl bg-surface-card border border-white/[0.06]">
          <button
            type="button"
            onClick={() => handleExportBackup()}
            disabled={exportBackupLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white/90 font-medium text-sm transition-colors disabled:opacity-50 border border-white/10 hover:bg-white/5"
          >
            <span>📥</span>
            <span>{exportBackupLoading ? 'جاري التصدير...' : 'تصدير نسخة احتياطية (إكسل)'}</span>
          </button>
          <p className="text-white/50 text-xs mt-1.5 text-center">تحميل ملف إكسل يحتوي: فضي، ذهبي، بلاتيني، إيراد</p>
        </div>

        {/* سجل التدقيق */}
        <div className="mb-6 rounded-2xl bg-surface-card border border-white/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setShowAuditLog((v) => !v)
              if (!showAuditLog) loadAuditLog()
            }}
            className="w-full flex items-center gap-2 p-4 text-right"
          >
            <span className={`inline-block transition-transform duration-200 ${showAuditLog ? 'rotate-180' : ''}`} aria-hidden>▼</span>
            <h2 className="text-white font-semibold text-[0.9375rem] flex-1">سجل التدقيق</h2>
          </button>
          {showAuditLog && (
            <div className="px-4 pb-4 pt-0 border-t border-white/10">
              <p className="text-white/50 text-xs mb-3">آخر رفع ملفات وحفظ إعدادات (لا يحدّث تلقائياً — أعد فتح القسم للتحديث)</p>
              <ul className="space-y-2 max-h-60 overflow-y-auto text-sm">
                {auditLogEntries.length === 0 && <li className="text-white/50">لا أحداث بعد</li>}
                {auditLogEntries.map((e, i) => (
                  <li key={e.id ?? i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-white/80">
                    <span className="text-white/50">{new Date(e.at).toLocaleString('ar-SA')}</span>
                    {e.action === 'upload' && (
                      <>
                        <span>رفع: {e.key === 'revenue' ? 'كشف إيراد' : e.key === 'silver' ? 'فضي' : e.key === 'gold' ? 'ذهبي' : e.key === 'platinum' ? 'بلاتيني' : e.key}</span>
                        {e.fileName && <span className="text-white/50">{e.fileName}</span>}
                        {e.count != null && <span>— {e.count} سجل</span>}
                        {e.mergeCount != null && e.mergeCount > 0 && <span className="text-primary-400">(دمج: {e.mergeCount})</span>}
                      </>
                    )}
                    {e.action === 'settings' && <span>حفظ الإعدادات</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {lastMergeReport && lastMergeReport.skipped.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-amber-950/30 border border-amber-500/30">
            <p className="text-amber-200 font-medium text-sm mb-2">تفاصيل الصفوف المتخطاة (بدون دمج)</p>
            <ul className="text-amber-200/90 text-xs space-y-1 max-h-40 overflow-y-auto">
              {lastMergeReport.skipped.slice(0, 15).map((s, i) => (
                <li key={i}>
                  صف {s.rowIndex}: {s.reason === 'no-name-or-id' ? 'ناقص اسم أو جوال/هوية' : s.reason === 'no-match' ? 'لا يوجد سجل مطابق (اسم + جوال أو هوية)' : 'أكثر من سجل مطابق — لا دمج عشوائي'}
                  {s.name ? ` — "${s.name}"` : ''}
                  {s.amount != null ? ` — مبلغ ${s.amount}` : ''}
                </li>
              ))}
              {lastMergeReport.skipped.length > 15 && (
                <li className="text-amber-400/80">… و{lastMergeReport.skipped.length - 15} صف آخر</li>
              )}
            </ul>
          </div>
        )}

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

        {error && <div className="mb-4 p-3 rounded-xl bg-red-500/20 text-red-200 text-sm" role="alert">{error}</div>}
        {success && <div className="mb-4 p-3 rounded-xl bg-green-500/20 text-green-200 text-sm">{success}</div>}

        {showClearLogConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="clear-log-title">
            <ModalFocusTrap active={showClearLogConfirm} onDeactivate={() => setShowClearLogConfirm(false)}>
            <div className="bg-surface-card border border-white/20 rounded-2xl p-5 shadow-xl max-w-sm w-full">
              <p id="clear-log-title" className="text-white font-medium text-center mb-5">هل تريد حذف كل السجل ؟</p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowClearLogConfirm(false)
                    handleClearNewMembersLog()
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/40 text-amber-200 font-medium hover:bg-amber-500/50 transition-colors"
                >
                  نعم
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearLogConfirm(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                >
                  لا
                </button>
              </div>
            </div>
            </ModalFocusTrap>
          </div>
        )}

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
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="text-white/60 text-xs self-center">فرز:</span>
                    {(['all', 'day', 'yesterday', 'week', 'month', 'range'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setNewMembersLogFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          newMembersLogFilter === f
                            ? 'bg-primary-500/40 text-white border border-primary-500/60'
                            : 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/10'
                        }`}
                      >
                        {f === 'all' ? 'الكل' : f === 'day' ? 'اليوم' : f === 'yesterday' ? 'أمس' : f === 'week' ? 'أسبوع' : f === 'month' ? 'شهر' : 'من تاريخ إلى تاريخ'}
                      </button>
                    ))}
                  </div>
                  {newMembersLogFilter === 'range' && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <label className="text-white/70 text-xs">من</label>
                      <input
                        type="date"
                        value={newMembersFilterDateFrom}
                        onChange={(e) => setNewMembersFilterDateFrom(e.target.value)}
                        className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                      />
                      <label className="text-white/70 text-xs">إلى</label>
                      <input
                        type="date"
                        value={newMembersFilterDateTo}
                        onChange={(e) => setNewMembersFilterDateTo(e.target.value)}
                        className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                      />
                    </div>
                  )}
                  <div className="max-h-56 overflow-y-auto rounded-lg bg-white/5 border border-white/10 mb-3">
                    <table className="w-full text-right text-sm">
                      <thead className="sticky top-0 bg-surface-card text-white/70">
                        <tr>
                          <th className="p-2">الاسم</th>
                          <th className="p-2">الجوال</th>
                          <th className="p-2">الهوية</th>
                          <th className="p-2">التاريخ والوقت (ميلادي)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredNewMembersLog.slice(0, newMembersLogLimit).map((entry) => (
                          <tr key={entry.id} className="border-t border-white/10">
                            <td className="p-2 text-white/90">{entry.name || '—'}</td>
                            <td className="p-2 text-white/90">{entry.phone}</td>
                            <td className="p-2 text-white/80">{entry.idLastDigits ?? '—'}</td>
                            <td className="p-2 text-white/60 text-xs">{formatNewMemberDateTime(entry.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {newMembersLogLimit < filteredNewMembersLog.length && (
                    <button
                      type="button"
                      onClick={() => setNewMembersLogLimit((n) => n + 10)}
                      className="mb-3 px-3 py-2 rounded-lg bg-white/10 text-white/80 text-sm hover:bg-white/20"
                    >
                      المزيد ({filteredNewMembersLog.length - newMembersLogLimit} متبقي)
                    </button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRefreshNewMembersLog}
                      disabled={refreshingNewMembersLog}
                      className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-60 disabled:cursor-not-allowed min-w-[61px] transition-opacity"
                    >
                      {refreshingNewMembersLog ? 'جاري...' : 'تحديث'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClearLogConfirm(true)}
                      disabled={clearingLog}
                      className="px-3 py-2 rounded-lg bg-amber-500/30 text-amber-200 text-sm hover:bg-amber-500/40 disabled:opacity-50"
                    >
                      {clearingLog ? 'جاري...' : 'مسح السجل'}
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintNewMembersLog}
                      className="px-3 py-2 rounded-lg bg-primary-500/30 text-primary-200 text-sm hover:bg-primary-500/40 border border-primary-500/40"
                    >
                      طباعة القائمة
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
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h3 className="text-white font-semibold text-base">عجلة الحظ — الجوائز (5 إلى 20)</h3>
              <button
                type="button"
                onClick={() =>
                  setSettingsState((s) => ({
                    ...s,
                    prizes: defaultSettings.prizes.map((p) => ({ ...p })),
                  }))
                }
                className="px-3 py-2 rounded-lg bg-white/10 text-white/90 text-sm hover:bg-white/20 border border-white/20 transition-colors"
                title="استعادة قائمة الجوائز الافتراضية"
              >
                الجوائز الافتراضيه
              </button>
            </div>
            <p className="text-white/70 text-sm mb-2 leading-relaxed">حدد عدد مرات المكسب أو اختر عدد لا نهائي لكل جائزة. عند نفاد العدد لا يقع المؤشر عليها.</p>
            <p className="text-white/60 text-sm mb-4 leading-relaxed">عمود <strong>%</strong> = نسبة احتمال ظهور الجائزة في العجلة. كلما زادت النسبة زاد احتمال الفوز بها (المجموع 100%).</p>
            {settings.prizes.map((p, idx) => {
              const usage = getPrizeUsage()[p.id] ?? 0
              const maxWins = p.maxWins ?? 0
              return (
                <div key={p.id} className="mb-4 p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex gap-3 items-center mb-2.5 flex-wrap sm:flex-nowrap">
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
                    <div className="flex items-center gap-1" title="نسبة الجائزة % — تحدد احتمال الفوز بهذه الجائزة في العجلة.">
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
                        step={0.01}
                        placeholder="%"
                        value={roundPercent(p.percent ?? 0)}
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
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...settings.prizes]
                        next[idx] = { ...next[idx], fixedPercent: !next[idx].fixedPercent }
                        setSettingsState((s) => ({ ...s, prizes: next }))
                      }}
                      title={p.fixedPercent ? 'إلغاء تثبيت النسبة' : 'تثبيت النسبة — لا تتغيّر عند تعديل غيرها'}
                      className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${p.fixedPercent ? 'bg-primary-500/50 text-white border-primary-500 shadow-[0_0_0_1px_rgba(20,184,166,0.4)]' : 'bg-white/10 text-white/70 hover:bg-white/20 border-white/20'}`}
                    >
                      {p.fixedPercent ? (
                        <>
                          <svg className="inline-block w-3.5 h-3.5 mr-1 align-middle shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          مثبت
                        </>
                      ) : (
                        'تثبيت النسبه'
                      )}
                    </button>
                    {settings.prizes.length > 5 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = settings.prizes.filter((_, i) => i !== idx)
                          setSettingsState((s) => ({ ...s, prizes: next }))
                        }}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg bg-red-500/30 text-red-200 text-xs font-medium border border-red-500/30"
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
                          className="w-24 min-w-[5rem] px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm sm:text-base text-center tabular-nums"
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

          <MaskedSecretInput
            label="رقم واتساب الاستقبال (بدون +)"
            value={settings.whatsAppNumber ?? ''}
            onChange={(v) => setSettingsState((s) => ({ ...s, whatsAppNumber: v }))}
            placeholder="966126076060"
            type="tel"
            showLastChars={4}
          />

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

          <MaskedSecretInput
            label="رابط ويب هوك لحفظ بيانات العضو الجديد (اختياري — Google Apps Script)"
            value={settings.exportWebhookUrl ?? ''}
            onChange={(v) => setSettingsState((s) => ({ ...s, exportWebhookUrl: v }))}
            placeholder="https://script.google.com/... أو Web App URL"
            type="url"
            showLastChars={0}
          />

          <MaskedSecretInput
            label="رابط التحقق من الأهلية (اختياري — العجلة لا تبدأ إلا بعد تأكيد السيرفر أن الرقم لم يلعب اليوم)"
            value={settings.checkEligibilityUrl ?? ''}
            onChange={(v) => setSettingsState((s) => ({ ...s, checkEligibilityUrl: v }))}
            placeholder="https://script.google.com/... أو Web App URL"
            type="url"
            showLastChars={0}
          />

          <div>
            <label className="block text-white/70 text-sm mb-1">مدة الحظر بين كل لفة وأخرى (يوم) — كل رقم يلعب مرة كل X يوم</label>
            <input
              type="number"
              min={1}
              max={365}
              value={settings.spinCooldownDays ?? 15}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Math.max(1, Math.min(365, Math.floor(Number(e.target.value)) || 1))
                setSettingsState((s) => ({ ...s, spinCooldownDays: v ?? 15 }))
              }}
              className="w-full max-w-[8rem] px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
            />
            <span className="text-white/50 text-sm mr-2">من 1 إلى 365 يوم (افتراضي 15)</span>
          </div>

          <div className="border-t border-white/20 pt-4 mt-2">
            <span className="block text-white/70 text-sm font-medium mb-3">إعدادات دوران العجلة</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">مدة الدوران حتى التوقف (ثانية) — كلما أقل أسرع</label>
                <input
                  type="number"
                  min={8}
                  max={60}
                  value={settings.wheelDurationSec ?? 22}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : Math.max(8, Math.min(60, Math.floor(Number(e.target.value)) || 8))
                    setSettingsState((s) => ({ ...s, wheelDurationSec: v ?? 22 }))
                  }}
                  className="w-full max-w-[6rem] px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
                />
                <span className="text-white/50 text-sm mr-2">8–60 (افتراضي 22)</span>
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">عدد اللفات الكاملة (360°) قبل التوقف</label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={settings.wheelSpinCount ?? 3}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : Math.max(2, Math.min(10, Math.floor(Number(e.target.value)) || 2))
                    setSettingsState((s) => ({ ...s, wheelSpinCount: v ?? 3 }))
                  }}
                  className="w-full max-w-[6rem] px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
                />
                <span className="text-white/50 text-sm mr-2">2–10 (افتراضي 3)</span>
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">التأخير بعد التوقف حتى ظهور الجائزة (ثانية)</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  step={0.5}
                  value={settings.delayBeforePrizeSec ?? 2.2}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : Math.max(1, Math.min(6, Number(e.target.value) || 1))
                    setSettingsState((s) => ({ ...s, delayBeforePrizeSec: v ?? 2.2 }))
                  }}
                  className="w-full max-w-[6rem] px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
                />
                <span className="text-white/50 text-sm mr-2">1–6 (افتراضي 2.2)</span>
              </div>
            </div>
          </div>

          <div className="border-t border-white/20 pt-4 mt-2">
            <label className="block text-white/70 text-sm font-medium mb-1">شروط وأحكام (كل سطر = بند في القائمة — تظهر عند ضغط «شروط وأحكام» في صفحة الضيف)</label>
            <textarea
              rows={14}
              value={settings.termsText ?? ''}
              onChange={(e) => setSettingsState((s) => ({ ...s, termsText: e.target.value }))}
              placeholder="المشاركة في النظام مجانية..."
              className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 resize-y min-h-[200px]"
            />
            <p className="text-white/50 text-sm mt-1">كل سطر = بند واحد في قائمة الشروط. إن تركت فارغاً يُستخدم النص الافتراضي.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-white/60 text-sm">رسائل الفئات والتسجيل:</span>
            <button
              type="button"
              onClick={() =>
                setSettingsState((s) => ({
                  ...s,
                  messages: { ...defaultSettings.messages },
                }))
              }
              className="px-3 py-2 rounded-lg bg-white/10 text-white/90 text-sm hover:bg-white/20 border border-white/20 transition-colors"
              title="استعادة النصوص الافتراضية لجميع الرسائل"
            >
              الرسايل الافتراضيه
            </button>
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
            disabled={saveSettingsStatus === 'saving'}
            className={`w-full py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 min-h-[48px] ${
              saveSettingsStatus === 'saving'
                ? 'bg-accent/70 text-white cursor-wait'
                : saveSettingsStatus === 'success'
                  ? 'bg-green-600 text-white'
                  : saveSettingsStatus === 'error'
                    ? 'bg-red-600 text-white'
                    : 'bg-accent text-white hover:bg-accent-hover'
            }`}
          >
            {saveSettingsStatus === 'saving' && (
              <>
                <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
                جاري الحفظ…
              </>
            )}
            {saveSettingsStatus === 'success' && 'تم الحفظ ✓'}
            {saveSettingsStatus === 'error' && 'فشل الحفظ'}
            {saveSettingsStatus === 'idle' && 'حفظ الإعدادات'}
          </button>

          {(() => {
            const backups = listSettingsBackups()
            if (backups.length === 0) return null
            return (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-white/70 text-sm mb-2">استعادة من نسخة احتياطية:</p>
                <ul className="space-y-2">
                  {backups.map((entry: BackupEntry) => (
                    <li key={entry.key} className="flex items-center justify-between gap-2">
                      <span className="text-white/60 text-xs">
                        {new Date(entry.timestamp).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const restored = restoreFromBackup(entry)
                          setSettingsState(restored)
                          setSettings(restored)
                          if (useFirestore) void writeSettingsToFirestore(restored)
                          setSuccess('تم استعادة النسخة الاحتياطية')
                          setTimeout(() => setSuccess(''), 3000)
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/90 hover:bg-white/20"
                      >
                        استعادة
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}
          </div>
          )}
        </div>

        {/* QR للطباعة — لوحة للتعليق في النزل */}
        <AdminQRPrint show={showQRPrint} onToggle={() => setShowQRPrint((v) => !v)} />

        <p className="text-center text-white/50 text-sm mt-6">
          <a href="/" className="text-accent underline" data-testid="link-to-guest">العودة لصفحة الزبون</a>
          <span className="block mt-1 text-white/40 text-xs">إصدار التطبيق: {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}</span>
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
          <ModalFocusTrap active={!!duplicateReport} onDeactivate={() => setDuplicateReport(null)}>
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
          </ModalFocusTrap>
        </div>
      )}
    </div>
  )
}
