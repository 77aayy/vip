/**
 * أدوات توليد أكواد التحقق — فصل المنطق عن مكوّنات الواجهة.
 */

/** كود تحقق فريد — يستخدم crypto.getRandomValues لمقاومة التوقّع والتلاعب */
export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(8)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 8; i++) s += chars[arr[i]! % chars.length]
  } else {
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}
