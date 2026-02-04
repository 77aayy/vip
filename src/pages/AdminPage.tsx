import { useCallback, useEffect, useState } from 'react'
import { parseMemberFile, parseRevenueFile } from '@/services/excelParser'
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
  checkFirebaseConnection,
  getNewMembersLogAsync,
  clearNewMembersLogAsync,
  type FirebaseCheckResult,
  type NewMemberLogEntry,
} from '@/services/firestoreLoyaltyService'
import { getNewMembersLog, clearNewMembersLog } from '@/services/storage'
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

export function AdminPage() {
  const [loading, setLoading] = useState<UploadKey | null>(null)
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

  useEffect(() => {
    checkFirebaseConnection().then(setFirebaseCheck)
  }, [])

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

  const handleFile = useCallback(async (key: UploadKey, file: File) => {
    setError('')
    setSuccess('')
    setLoading(key)
    try {
      if (key === 'revenue') {
        const rows = await parseRevenueFile(file)
        setRevenue(rows)
        if (useFirestore) {
          await writeRevenueBatch(rows)
          const c = await getCountsAsync()
          setCounts(c)
        } else {
          setCounts((c) => ({ ...c, revenue: rows.length }))
        }
      } else {
        const rows = await parseMemberFile(file)
        if (key === 'silver') {
          setSilver(rows)
          if (useFirestore) {
            await writeSilverBatch(rows)
            const c = await getCountsAsync()
            setCounts(c)
          } else {
            setCounts((c) => ({ ...c, silver: rows.length }))
          }
        } else if (key === 'gold') {
          setGold(rows)
          if (useFirestore) {
            await writeGoldBatch(rows)
            const c = await getCountsAsync()
            setCounts(c)
          } else {
            setCounts((c) => ({ ...c, gold: rows.length }))
          }
        } else {
          setPlatinum(rows)
          if (useFirestore) {
            await writePlatinumBatch(rows)
            const c = await getCountsAsync()
            setCounts(c)
          } else {
            setCounts((c) => ({ ...c, platinum: rows.length }))
          }
        }
      }
      setSuccess(`تم رفع الملف: ${file.name}${useFirestore ? ' (Firebase)' : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ في قراءة الملف')
    } finally {
      setLoading(null)
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
              fetchPriority="high"
              style={{ background: 'transparent', mixBlendMode: 'multiply' }}
            />
          </div>
          <h1 className="text-xl font-semibold text-white text-center">لوحة التحكم</h1>
        </header>

        {/* فحص Firebase — إيه معمول وإيه ناقص */}
        {firebaseCheck && (
          <div
            className={`mb-4 p-3 rounded-xl text-sm ${
              firebaseCheck.firestoreStatus === 'ok'
                ? 'bg-green-500/20 text-green-200'
                : firebaseCheck.configOk
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'bg-red-500/20 text-red-200'
            }`}
          >
            <div className="font-medium mb-1">
              {firebaseCheck.firestoreStatus === 'ok' ? '✅ Firebase يعمل' : '🔍 فحص Firebase'}
            </div>
            <div className="text-white/90">{firebaseCheck.message}</div>
            {firebaseCheck.projectId && (
              <div className="text-white/60 text-xs mt-1">المشروع: {firebaseCheck.projectId}</div>
            )}
          </div>
        )}

        {/* 4 upload icons */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {(['silver', 'gold', 'platinum', 'revenue'] as const).map((key) => (
            <label
              key={key}
              className="flex flex-col items-center justify-center rounded-2xl bg-surface-card border border-white/[0.06] p-6 min-h-[88px] cursor-pointer active:scale-[0.98] transition-transform shadow-card touch-manipulation"
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(key, f)
                  e.target.value = ''
                }}
                disabled={loading !== null}
              />
              <span className="text-4xl mb-2">{ICONS[key]}</span>
              <span className="text-white/90 font-medium text-center text-sm">{LABELS[key]}</span>
              <span className="text-white/50 text-xs mt-1">{counts[key]} سجل</span>
              {loading === key && <span className="text-white/60 text-xs mt-1">جاري الرفع...</span>}
            </label>
          ))}
        </div>

        {error && <div className="mb-4 p-3 rounded-xl bg-red-500/20 text-red-200 text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 rounded-xl bg-green-500/20 text-green-200 text-sm">{success}</div>}

        {/* سجل العضويات الجديدة — لضمّها للفضية */}
        <div className="rounded-2xl bg-surface-card border border-white/[0.06] p-4 mb-6 shadow-card">
          <h2 className="text-white font-semibold text-[0.9375rem] mb-2">سجل العضويات الجديدة</h2>
          <p className="text-white/60 text-xs mb-3">
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
                    {newMembersLog.map((entry) => (
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
        </div>

        {/* Settings */}
        <div className="rounded-2xl bg-surface-card border border-white/[0.06] p-4 space-y-4 shadow-card">
          <h2 className="text-white font-semibold text-[0.9375rem]">الإعدادات</h2>

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

          <div className="border-t border-white/20 pt-4 mt-4">
            <h3 className="text-white font-semibold text-[0.9375rem] mb-2">عجلة الحظ — الجوائز (5 إلى 8)</h3>
            <p className="text-white/60 text-xs mb-3">حدد عدد مرات المكسب أو اختر عدد لا نهائي لكل جائزة. عند نفاد العدد لا يقع المؤشر عليها.</p>
            {settings.prizes.map((p, idx) => {
              const usage = getPrizeUsage()[p.id] ?? 0
              const maxWins = p.maxWins ?? 0
              return (
                <div key={p.id} className="mb-3 p-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex gap-2 items-center mb-1.5 flex-wrap">
                    <input
                      type="text"
                      placeholder="اسم الجائزة"
                      value={p.label}
                      onChange={(e) => {
                        const next = [...settings.prizes]
                        next[idx] = { ...next[idx], label: e.target.value }
                        setSettingsState((s) => ({ ...s, prizes: next }))
                      }}
                      className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="%"
                      value={p.percent}
                      onChange={(e) => {
                        const next = [...settings.prizes]
                        next[idx] = { ...next[idx], percent: Number(e.target.value) || 0 }
                        setSettingsState((s) => ({ ...s, prizes: next }))
                      }}
                      className="w-14 px-2 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                    />
                    {settings.prizes.length > 5 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = settings.prizes.filter((_, i) => i !== idx)
                          setSettingsState((s) => ({ ...s, prizes: next }))
                        }}
                        className="px-2 py-1 rounded bg-red-500/30 text-red-200 text-sm"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3 items-center flex-wrap text-sm">
                    <label className="flex items-center gap-1.5 text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!p.unlimited}
                        onChange={(e) => {
                          const next = [...settings.prizes]
                          next[idx] = { ...next[idx], unlimited: e.target.checked, maxWins: e.target.checked ? undefined : (next[idx].maxWins ?? 8) }
                          setSettingsState((s) => ({ ...s, prizes: next }))
                        }}
                        className="rounded"
                      />
                      عدد لا نهائي
                    </label>
                    {!p.unlimited && (
                      <>
                        <label className="text-white/70">عدد مرات المكسب:</label>
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
                          className="w-16 px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm"
                        />
                        <span className="text-white/50">مستخدم {usage} من {maxWins || 0}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {settings.prizes.length < 8 && (
              <button
                type="button"
                onClick={() => {
                  const id = `p-${Date.now()}`
                  const newPrize: Prize = { id, label: 'جائزة جديدة', percent: 10, unlimited: true }
                  setSettingsState((s) => ({ ...s, prizes: [...s.prizes, newPrize] }))
                }}
                className="text-sm text-accent underline"
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
              placeholder="966500000000"
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
            <label className="block text-white/70 text-sm mb-1">رسالة الفضي (استخدم {`{points}`} و {`{next}`})</label>
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
            <label className="block text-white/70 text-sm mb-1">رسالة الذهبي</label>
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
            <label className="block text-white/70 text-sm mb-1">رسالة البلاتيني</label>
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
            <label className="block text-white/70 text-sm mb-1">نص طلب التسجيل (للجدد)</label>
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
            <label className="block text-white/70 text-sm mb-1">رسالة تم وصول الرسالة للاستقبال</label>
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

        <p className="text-center text-white/50 text-sm mt-6">
          <a href="/" className="text-accent underline" data-testid="link-to-guest">العودة لصفحة الزبون</a>
        </p>
      </div>
    </div>
  )
}
