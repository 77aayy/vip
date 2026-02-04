/**
 * Token Validation (Security Layer):
 * ولد Token فريد (UUID) في الجلسة. يُرسل مع كل إرسال للشيت.
 * السيرفر يتأكد إن الـ Token صالح ولم يُستخدم من قبل → يمنع Postman/غمر الداتا.
 */

const SESSION_TOKEN_KEY = 'wheel_session_token'

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getOrCreateSessionToken(): string {
  if (typeof sessionStorage === 'undefined') return generateUUID()
  let token = sessionStorage.getItem(SESSION_TOKEN_KEY)
  if (!token) {
    token = generateUUID()
    sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  }
  return token
}
