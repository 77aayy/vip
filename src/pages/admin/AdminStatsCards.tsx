import { getPrizeUsage } from '@/services/storage'
import type { NewMemberLogEntry } from '@/services/firestoreLoyaltyService'
import type { Settings } from '@/types'

interface AdminStatsCardsProps {
  useFirestore: boolean
  analyticsPrizeUsage: Record<string, number> | null
  newMembersLog: NewMemberLogEntry[]
  settings: Settings
}

export function AdminStatsCards({
  useFirestore,
  analyticsPrizeUsage,
  newMembersLog,
  settings,
}: AdminStatsCardsProps) {
  const usage = useFirestore ? (analyticsPrizeUsage ?? getPrizeUsage()) : getPrizeUsage()
  const totalSpins = Object.values(usage).reduce((a, b) => a + b, 0)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const newMembersLast30 = newMembersLog.filter((e) => e.createdAt >= thirtyDaysAgo).length
  const prizes = settings.prizes
  const withUsage = prizes.map((p) => ({ prize: p, count: usage[p.id] ?? 0 }))
  const mostWon = withUsage.length ? withUsage.reduce((a, b) => (a.count >= b.count ? a : b), withUsage[0]!) : null
  const leastWon = withUsage.length ? withUsage.reduce((a, b) => (a.count <= b.count ? a : b), withUsage[0]!) : null
  const unwonList = withUsage.filter((x) => x.count === 0)
  const notWonYet = unwonList.length
  const unwonNames = unwonList.map((x) => x.prize.label).join('، ')
  const avgPerPrize = prizes.length > 0 ? Math.round(totalSpins / prizes.length) : 0

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
      <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.06] border border-white/10 min-w-0">
        <p className="text-white/50 text-[0.6rem] sm:text-[0.65rem] truncate mb-0.5">إجمالي الدورات</p>
        <p className="text-white font-semibold text-xs sm:text-sm truncate">{(totalSpins).toLocaleString('ar-SA')}</p>
      </div>
      <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.06] border border-white/10 min-w-0">
        <p className="text-white/50 text-[0.6rem] sm:text-[0.65rem] truncate mb-0.5">تسجيلات (30 يوم)</p>
        <p className="text-white font-semibold text-xs sm:text-sm truncate">{newMembersLast30.toLocaleString('ar-SA')}</p>
      </div>
      <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.06] border border-white/10 min-w-0">
        <p className="text-white/50 text-[0.6rem] sm:text-[0.65rem] truncate mb-0.5">عدد الجوائز</p>
        <p className="text-white font-semibold text-xs sm:text-sm truncate">{prizes.length}</p>
      </div>
      {mostWon && (
        <div className="p-2.5 sm:p-3 rounded-xl bg-primary-500/10 border border-primary-500/30 min-w-0 col-span-2 sm:col-span-1">
          <p className="text-primary-200/80 text-[0.6rem] sm:text-[0.65rem] truncate mb-0.5">الأكثر فوزاً</p>
          <p className="text-white font-semibold text-[0.65rem] sm:text-[0.75rem] line-clamp-2 break-words leading-tight" title={mostWon.prize.label}>{mostWon.prize.label}</p>
          <p className="text-primary-200 text-[0.6rem] sm:text-[0.65rem] mt-0.5">{(mostWon.count).toLocaleString('ar-SA')} مرة</p>
        </div>
      )}
      {leastWon && (
        <div className="p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 min-w-0 col-span-2 sm:col-span-1">
          <p className="text-amber-200/80 text-[0.6rem] sm:text-[0.65rem] truncate mb-0.5">الأقل فوزاً</p>
          <p className="text-white font-semibold text-[0.65rem] sm:text-[0.75rem] line-clamp-2 break-words leading-tight" title={leastWon.prize.label}>{leastWon.prize.label}</p>
          <p className="text-amber-200 text-[0.6rem] sm:text-[0.65rem] mt-0.5">{(leastWon.count).toLocaleString('ar-SA')} مرة</p>
        </div>
      )}
      <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.06] border border-white/10 min-w-0">
        <p className="text-white/50 text-[0.6rem] sm:text-[0.65rem] truncate mb-0.5">لم تُربح بعد</p>
        <p className="text-white font-semibold text-[0.65rem] sm:text-[0.75rem] line-clamp-2 break-words leading-tight" title={unwonNames || undefined}>
          {unwonNames || '—'}
        </p>
        <p className="text-white/40 text-[0.6rem] mt-0.5">{notWonYet} جائزة</p>
      </div>
      <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.06] border border-white/10 min-w-0">
        <p className="text-white/50 text-[0.6rem] sm:text-[0.65rem] truncate mb-0.5">متوسط / جائزة</p>
        <p className="text-white font-semibold text-xs sm:text-sm truncate">{avgPerPrize.toLocaleString('ar-SA')}</p>
        <p className="text-white/40 text-[0.6rem] mt-0.5">دورة</p>
      </div>
    </div>
  )
}
