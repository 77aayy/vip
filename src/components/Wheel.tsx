import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSound } from '@/hooks/useSound'
import { cubicBezierEaseOut } from '@/utils/easing'
import type { Prize } from '@/types'

const SEGMENT_COLORS = [
  '#f5f0e6',
  '#e0d5c4',
  '#f5f0e6',
  '#e0d5c4',
  '#f5f0e6',
  '#e0d5c4',
]

/** حجم خط نصوص الشرائح — يسمح بعرض العبارة كاملة داخل الشريحة كما في المرجع */
const SEGMENT_FONT_SIZE = 15.6

interface WheelProps {
  prizes: Prize[]
  onSpinEnd: (prize: Prize) => void
  disabled?: boolean
  /** indices of prizes that can still be won (when exhausted, المؤشر لا يقع عليها) */
  availableIndices?: number[]
  /** تخطي الهدية والتسجيل في عضوية إليت الفضية مباشرة */
  onSkipGift?: () => void
  /** عند الضغط على "اضغط هنا" بدون تخطي التحقق — يفتح شاشة ادخل رقمك */
  onSpinRequest?: () => void
  /** عندما يكون true يضغط الزر يدير العجلة مباشرة (بعد التسجيل مثلاً) */
  skipPhoneCheck?: boolean
  /** قيمة تتغير لتفعيل دوران تلقائي مرة واحدة (مثلاً بعد التحقق من عميل) */
  triggerSpin?: number
  /** index الجائزة المُحددة من الـ Logic (GuestPage أو السيرفر) — العجلة فقط "تمثّل" الحركة */
  targetWinnerIndex?: number | null
  /** عند الضغط على "لف" مع skipPhoneCheck — الـ Parent يحدد الجائزة ثم يطلق triggerSpin */
  onSpinClick?: () => void
  /** تقدم الدوران 0..1 — لربط شريط التحميل بالعجلة */
  onSpinProgress?: (progress: number) => void
  /** اسم الضيف — للمخاطبة أثناء الدوران (هديتك في الطريق يا [الاسم]...) */
  guestName?: string
}

export function Wheel({
  prizes,
  onSpinEnd,
  disabled,
  availableIndices,
  onSkipGift,
  onSpinRequest,
  skipPhoneCheck = false,
  triggerSpin = 0,
  targetWinnerIndex = null,
  onSpinClick,
  onSpinProgress,
  guestName = '',
}: WheelProps) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const { playTick } = useSound()
  const lastTickedSegment = useRef(-1)
  const lastTriggerSpin = useRef(0)
  const onSpinProgressRef = useRef(onSpinProgress)
  onSpinProgressRef.current = onSpinProgress

  useEffect(() => {
    if (triggerSpin > 0 && triggerSpin !== lastTriggerSpin.current && !spinning) {
      lastTriggerSpin.current = triggerSpin
      handleSpin()
    }
  }, [triggerSpin, spinning])

  const segmentAngle = 360 / prizes.length
  const segmentFontSize = prizes.length > 12 ? 11 : prizes.length > 10 ? 13 : 15.6
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 400
  const size = typeof window !== 'undefined'
    ? Math.min(isNarrow ? 300 : 340, window.innerWidth - (isNarrow ? 24 : 32))
    : 340
  const rimWidth = 12
  const innerSize = size - 8
  const cx = innerSize / 2
  const cy = innerSize / 2
  const segmentRadius = innerSize / 2 - 6
  // نصف قطر النص في منتصف الشريحة لعرض العبارة كاملة كما في المرجع
  const textRadius = segmentRadius - 40

  const segments = useMemo(() => {
    return prizes.map((p, i) => {
      const startAngle = i * segmentAngle
      const endAngle = startAngle + segmentAngle
      const midAngle = (startAngle + endAngle) / 2
      const rad = (midAngle - 90) * (Math.PI / 180)
      const tx = cx + textRadius * Math.cos(rad)
      const ty = cy + textRadius * Math.sin(rad)
      // زاوية من مركز النص إلى مركز العجلة (بالدرجات)؛ النص يُدار بحيث يكون مقروءاً عند وقوف المؤشر على الجائزة (أعلى الحروف للخارج)
      const angleToCenterRad = Math.atan2(cy - ty, cx - tx)
      let angleToCenterDeg = (angleToCenterRad * 180) / Math.PI
      if (angleToCenterDeg < 0) angleToCenterDeg += 360
      const textRotation = (angleToCenterDeg + 270) % 360
      const label = p.label
      const displayLabelLines: string[] = label.includes(' ')
        ? [label.split(' ')[0], label.split(' ').slice(1).join(' ')]
        : [label]
      const path = describeArc(cx, cy, segmentRadius, startAngle, endAngle)
      const clipPathD = path
      return {
        ...p,
        startAngle,
        endAngle,
        path,
        clipPathD,
        fill: p.color ?? SEGMENT_COLORS[i % SEGMENT_COLORS.length],
        textX: tx,
        textY: ty,
        textRotation,
        displayLabelLines,
      }
    })
  }, [prizes, segmentAngle, size, cx, cy, segmentRadius, textRadius])

  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'

  /** أي شريحة تقع تحت المؤشر (أعلى العجلة) عند الدوران = rotation — يتوافق مع اتجاه CSS rotate */
  function getSegmentIndexAtTop(rot: number): number {
    let a = ((rot % 360) + 360) % 360
    if (a >= 360) a = 0
    if (isRtl) a = (360 - a) % 360
    const i = Math.floor(a / segmentAngle) % prizes.length
    return i
  }

  function handleSpin() {
    if (spinning || disabled) return
    const indices = availableIndices ?? prizes.map((_, i) => i)
    const canPick = indices.length > 0 ? indices : prizes.map((_, i) => i)
    setSpinning(true)
    lastTickedSegment.current = -1
    onSpinProgressRef.current?.(0)
    const winnerIndex =
      targetWinnerIndex != null && canPick.includes(targetWinnerIndex)
        ? targetWinnerIndex
        : canPick[Math.floor(Math.random() * canPick.length)]
    const winnerMidAngle = winnerIndex * segmentAngle + segmentAngle / 2
    const extraTurns = 3
    const currentMod = ((rotation % 360) + 360) % 360
    const targetAngle = isRtl ? (360 - winnerMidAngle) % 360 : winnerMidAngle
    const offsetToWinner = (targetAngle - currentMod + 360) % 360
    const totalRotation = rotation + extraTurns * 360 + offsetToWinner
    const start = performance.now()
    const startRot = rotation
    const totalDelta = totalRotation - startRot
    const durationMaxMs = 22000
    // Cubic-Bezier(0.1, 0, 0, 1) — حركة فخمة (احتكاك/جاذبية)، العجلة بتهدي ببطء
    const run = (now: number) => {
      const elapsed = now - start
      const tLinear = Math.min(1, elapsed / durationMaxMs)
      const progress = cubicBezierEaseOut(tLinear)
      const base = startRot + totalDelta * progress
      const swayStart = 0.72
      let sway: number
      if (progress < swayStart || progress >= 1) {
        sway = 0
      } else {
        const t = (progress - swayStart) / (1 - swayStart)
        const inOut = Math.sin(Math.PI * t) * Math.sin(Math.PI * t)
        sway = -0.5 * segmentAngle * inOut
      }
      const current = base + sway
      setRotation(current)
      const cb = onSpinProgressRef.current
      if (cb) flushSync(() => cb(progress))
      const segmentIndex = Math.floor((current - startRot) / segmentAngle)
      if (segmentIndex > lastTickedSegment.current) {
        lastTickedSegment.current = segmentIndex
        playTick()
      }
      const done = progress >= 0.999 || elapsed >= durationMaxMs
      if (!done) {
        requestAnimationFrame(run)
      } else {
        const cb = onSpinProgressRef.current
        if (cb) flushSync(() => cb(1))
        setRotation(totalRotation)
        setSpinning(false)
        const finalIndex = getSegmentIndexAtTop(totalRotation)
        const prize = prizes[finalIndex]
        onSpinEnd({ id: prize.id, label: prize.label, percent: prize.percent })
      }
    }
    requestAnimationFrame(run)
  }

  const wheelSize = size + rimWidth * 2 + 16
  const raysSize = wheelSize + 48

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-[432px] min-w-0 mx-auto px-0 py-2 sm:py-6 safe-area-pb">
      <div className="relative mx-auto" style={{ width: raysSize, height: raysSize }}>
        <div
          className="wheel-glow relative rounded-full select-none touch-none p-4 overflow-visible"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: wheelSize,
            height: wheelSize,
            background: '#d9c9a8',
          }}
        >
        <div
          className="wheel-rays absolute rounded-full pointer-events-none"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: raysSize,
            height: raysSize,
            background: `conic-gradient(from 0deg,
              transparent 0deg 7deg,
              rgba(232,197,71,0.18) 7deg 15deg,
              transparent 15deg 22deg,
              rgba(212,175,55,0.22) 22deg 30deg,
              transparent 30deg 37deg,
              rgba(232,197,71,0.18) 37deg 45deg,
              transparent 45deg 52deg,
              rgba(212,175,55,0.22) 52deg 60deg,
              transparent 60deg 67deg,
              rgba(232,197,71,0.18) 67deg 75deg,
              transparent 75deg 82deg,
              rgba(212,175,55,0.22) 82deg 90deg,
              transparent 90deg 97deg,
              rgba(232,197,71,0.18) 97deg 105deg,
              transparent 105deg 112deg,
              rgba(212,175,55,0.22) 112deg 120deg,
              transparent 120deg 127deg,
              rgba(232,197,71,0.18) 127deg 135deg,
              transparent 135deg 142deg,
              rgba(212,175,55,0.22) 142deg 150deg,
              transparent 150deg 157deg,
              rgba(232,197,71,0.18) 157deg 165deg,
              transparent 165deg 172deg,
              rgba(212,175,55,0.22) 172deg 180deg,
              transparent 180deg 187deg,
              rgba(232,197,71,0.18) 187deg 195deg,
              transparent 195deg 202deg,
              rgba(212,175,55,0.22) 202deg 210deg,
              transparent 210deg 217deg,
              rgba(232,197,71,0.18) 217deg 225deg,
              transparent 225deg 232deg,
              rgba(212,175,55,0.22) 232deg 240deg,
              transparent 240deg 247deg,
              rgba(232,197,71,0.18) 247deg 255deg,
              transparent 255deg 262deg,
              rgba(212,175,55,0.22) 262deg 270deg,
              transparent 270deg 277deg,
              rgba(232,197,71,0.18) 277deg 285deg,
              transparent 285deg 292deg,
              rgba(212,175,55,0.22) 292deg 300deg,
              transparent 300deg 307deg,
              rgba(232,197,71,0.18) 307deg 315deg,
              transparent 315deg 322deg,
              rgba(212,175,55,0.22) 322deg 330deg,
              transparent 330deg 337deg,
              rgba(232,197,71,0.18) 337deg 345deg,
              transparent 345deg 352deg,
              rgba(212,175,55,0.22) 352deg 360deg)`,
            mask: 'radial-gradient(circle, transparent 42%, black 55%)',
            WebkitMask: 'radial-gradient(circle, transparent 42%, black 55%)',
          }}
          aria-hidden
        />
        <div
          className="absolute rounded-full"
          style={{
            width: size + rimWidth * 2,
            height: size + rimWidth * 2,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: rimNotchedGradient(),
            boxShadow: '0 0 0 1.5px rgba(184, 134, 11, 0.45), inset 0 2px 10px rgba(255,255,255,0.3), inset 0 -2px 6px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <div
            className="absolute rounded-full bg-[#f5f0e6]"
            style={{
              width: size - 4,
              height: size - 4,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              marginTop: 0,
              boxShadow: 'inset 0 0 0 1px rgba(139,90,43,0.25)',
            }}
          />

          <div
            className="absolute rounded-full overflow-hidden"
            style={{
              width: size - 8,
              height: size - 8,
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              transition: spinning ? 'none' : undefined,
            }}
          >
            <svg width={innerSize} height={innerSize} viewBox={`0 0 ${innerSize} ${innerSize}`}>
              <defs>
                {segments.map((seg, i) => (
                  <clipPath key={`clip-${seg.id}`} id={`segment-clip-${i}`} clipPathUnits="userSpaceOnUse">
                    <path d={seg.clipPathD} fillRule="nonzero" />
                  </clipPath>
                ))}
              </defs>
              {segments.map((seg) => (
                <path
                  key={seg.id}
                  d={seg.path}
                  fill={seg.fill}
                  stroke="rgba(139,90,43,0.22)"
                  strokeWidth="0.8"
                  style={{ shapeRendering: 'geometricPrecision' }}
                />
              ))}
              {segments.map((seg, i) => (
                <g
                  key={`t-${seg.id}`}
                  clipPath={`url(#segment-clip-${i})`}
                  className="pointer-events-none"
                >
                  <text
                    x={seg.textX}
                    y={seg.textY}
                    textAnchor="middle"
                    fill="#3d3428"
                    fontSize={segmentFontSize}
                    fontWeight="700"
                    fontFamily="Tajawal, Cairo, sans-serif"
                    transform={`rotate(${seg.textRotation}, ${seg.textX}, ${seg.textY})`}
                  >
                    {seg.displayLabelLines.length === 2 ? (
                      <>
                        <tspan x={seg.textX} dy={-segmentFontSize * 0.5}>{seg.displayLabelLines[0]}</tspan>
                        <tspan x={seg.textX} dy={segmentFontSize}>{seg.displayLabelLines[1]}</tspan>
                      </>
                    ) : (
                      <tspan x={seg.textX} dy={0}>{seg.displayLabelLines[0]}</tspan>
                    )}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: '50%',
              top: rimWidth + 26,
              transform: 'translate(-50%, -100%)',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.22))',
            }}
          >
            <svg width="28" height="38" viewBox="0 0 28 38" fill="none" className="block" style={{ transform: 'rotate(180deg)' }}>
              <path
                d="M14 2 L24 34 L14 38 L4 34 Z"
                fill="url(#needleGrad)"
                stroke="#6b5028"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <circle cx="14" cy="36" r="2.8" fill="#fff" opacity="0.92" stroke="#8b6914" strokeWidth="1" />
              <circle cx="14" cy="36" r="1.2" fill="#9a7209" />
              <defs>
                <linearGradient id="needleGrad" x1="14" y1="2" x2="14" y2="38" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f5ecd1" />
                  <stop offset="30%" stopColor="#e0c968" />
                  <stop offset="100%" stopColor="#a67c32" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div
            className="absolute rounded-full z-10 flex items-center justify-center"
            style={{
              width: size * 0.144,
              height: size * 0.144,
              minWidth: 34,
              minHeight: 34,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: `
                radial-gradient(circle at 28% 28%, #f0d872 0%, #e8c547 15%, #d4af37 35%, #b8860b 55%, #9a7209 80%, #8b6914 100%)
              `,
              boxShadow: 'inset 0 3px 12px rgba(255,255,255,0.4), inset 0 -2px 8px rgba(0,0,0,0.3), 0 0 0 2px rgba(212,175,55,0.5), 0 3px 12px rgba(0,0,0,0.35)',
            }}
          >
            <div
              className="rounded-full"
              style={{
                width: '42%',
                height: '42%',
                background: 'radial-gradient(circle at 35% 35%, #c9a227 0%, #b8860b 40%, #8b6914 100%)',
                boxShadow: 'inset 0 2px 6px rgba(255,255,255,0.15), inset 0 -1px 4px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </div>
      </div>
      <div className="mt-3 sm:mt-6 flex flex-row flex-wrap items-end justify-center gap-3 sm:gap-6 w-full max-w-[432px] min-w-0 mx-auto px-0" style={{ direction: 'ltr' }}>
        <div className="flex-1 min-w-0 sm:min-w-[200px] w-full sm:w-auto sm:max-w-[280px] flex flex-col items-center gap-1 sm:gap-1.5 min-h-[44px] sm:min-h-[120px]">
          {!skipPhoneCheck && (
            <p
              className="text-[0.6875rem] text-center leading-tight flex-1"
              style={{ color: '#5c5348', fontFamily: 'Tajawal, Cairo, sans-serif' }}
            >
              لو كنت عضو إليت (فضي - ذهبي - بلاتيني) ابشر بسعدك.. مفاجأتنا بانتظارك!
            </p>
          )}
          <button
            type="button"
            data-testid="btn-spin-request"
            onClick={
              skipPhoneCheck
                ? (onSpinClick ?? handleSpin)
                : (onSpinRequest ?? handleSpin)
            }
            disabled={spinning || disabled}
            className={`w-full min-h-[48px] py-3.5 rounded-xl text-white font-bold active:scale-[0.99] transition-all disabled:opacity-40 disabled:pointer-events-none touch-manipulation ${spinning ? 'animate-wheel-btn-pulse text-[0.7rem] whitespace-nowrap overflow-hidden text-ellipsis px-2' : 'text-[0.9375rem] leading-tight'}`}
            style={{
              fontFamily: 'Tajawal, Cairo, sans-serif',
              background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 25%, #b8860b 60%, #9a7209 100%)',
              boxShadow: spinning ? undefined : '0 3px 12px rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.2)',
            }}
          >
            {spinning
              ? (guestName?.trim()
                  ? `هديتك في الطريق يا ${guestName.trim()} وجالسين نختار لك الأجمل ✨🎁`
                  : 'هديتك في الطريق وجالسين نختار لك الأجمل ✨🎁')
              : 'اضغط هنا'}
          </button>
        </div>
        {onSkipGift && !skipPhoneCheck && (
          <div className="flex-1 min-w-0 sm:min-w-[200px] w-full sm:w-auto sm:max-w-[280px] flex flex-col items-center gap-1 sm:gap-1.5 min-h-[44px] sm:min-h-[120px]">
            <p
              className="text-[0.6875rem] text-center leading-tight flex-1"
              style={{ color: '#5c5348', fontFamily: 'Tajawal, Cairo, sans-serif' }}
            >
              عضو جديد ما بنقصر معك لك عضوية فضية مجاناً
              <br />
              سجل الان لفتح عجلة الحظ
              <br />
              التسجيل مفتوح الان مجانى لفترة محدودة
            </p>
            <button
              type="button"
              onClick={onSkipGift}
              data-testid="btn-skip-gift"
              className="w-full min-h-[48px] py-3.5 rounded-xl text-[0.9375rem] font-bold active:scale-[0.99] transition-all border-2 touch-manipulation"
              style={{
                fontFamily: 'Tajawal, Cairo, sans-serif',
                color: '#2c2825',
                borderColor: 'rgba(212, 175, 55, 0.7)',
                background: 'rgba(255,255,255,0.5)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            >
              اضغط للتسجيل مجاناً
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const large = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function rimNotchedGradient(): string {
  const light = '#e4d4a0'
  const dark = '#b8923e'
  const step = 6
  const stops: string[] = []
  for (let i = 0; i < 360; i += step) {
    const isLight = Math.floor(i / step) % 2 === 0
    stops.push(`${isLight ? light : dark} ${i}deg`)
  }
  stops.push(`${light} 360deg`)
  return `conic-gradient(from 0deg, ${stops.join(', ')})`
}
