/**
 * Cubic-Bezier(0.1, 0, 0, 1) — حركة "فخمة" في التباطؤ (احتكاك/جاذبية).
 * استخدام: progress = cubicBezierEaseOut(elapsed / duration)
 * المصدر: نفس شعور CSS transition: transform 17s cubic-bezier(0.1, 0, 0, 1)
 */

const P0 = { x: 0, y: 0 }
const P1 = { x: 0.1, y: 0 }
const P2 = { x: 0, y: 1 }
const P3 = { x: 1, y: 1 }

function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t
  const u2 = u * u
  const u3 = u2 * u
  const t2 = t * t
  const t3 = t2 * t
  return u3 * p0 + 3 * u2 * t * p1 + 3 * u * t2 * p2 + t3 * p3
}

/** يعيد y للـ bezier عند نفس الـ x = t_linear (حل معكوس تقريبي) */
export function cubicBezierEaseOut(tLinear: number): number {
  if (tLinear <= 0) return 0
  if (tLinear >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2
    const x = bezierPoint(mid, P0.x, P1.x, P2.x, P3.x)
    if (x < tLinear) lo = mid
    else hi = mid
  }
  const t = (lo + hi) / 2
  return bezierPoint(t, P0.y, P1.y, P2.y, P3.y)
}
