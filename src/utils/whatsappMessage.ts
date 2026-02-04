/**
 * إضافة توقيت وهاش في آخر رسالة واتساب عشان موظف الاستقبال يعرف إن الرسالة من السيستم مش مكتوبة يدوي.
 */
export function appendVerificationSuffix(text: string): string {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const hash = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${text}\n\n🕒 ${ts} | #${hash}`
}
