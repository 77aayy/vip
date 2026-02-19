import { getSettings } from '@/services/storage'

interface PreviousPrizeStepProps {
  prizeLabel: string
  code: string
  /** اسم الضيف — لتفصيل الخطاب (جائزتك السابقة يا [الاسم]) */
  guestName?: string
  /** رقم الجوال — لملء رسالة واتساب (اختياري) */
  guestPhone?: string
  /** رقم هوية الضيف أو آخر أرقام (لإدراجه في رسالة واتساب) */
  guestId?: string
  /** بعد الإرسال (اختياري) للعودة للعجلة أو البداية */
  onDone?: () => void
}

/** بناء نص واتساب مع توقيت/هاش للتحقق من مصدر النظام */
function buildWhatsAppText(prizeLabel: string, code: string, name?: string, phone?: string, idNum?: string): string {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const hash = Math.random().toString(36).slice(2, 8).toUpperCase()
  const lines = [
    '🏨 طلب جائزة (جائزتك السابقة)',
    '',
    `👤 الضيف: ${name ?? 'ضيف'}`,
    `📱 الجوال: ${phone ?? '-'}`,
    `🪪 رقم الهوية: ${idNum ?? '-'}`,
    `🎁 الجائزة: ${prizeLabel}`,
    `🔑 كود التحقق: ${code}`,
    '',
    `🕒 ${ts} | #${hash}`,
  ]
  return lines.join('\n')
}

export function PreviousPrizeStep({ prizeLabel, code, guestName = '', guestPhone = '', guestId = '', onDone }: PreviousPrizeStepProps) {
  const settings = getSettings()
  const whatsAppNumber = (settings.whatsAppNumber ?? '').replace(/\D/g, '')

  const handleSendWhatsApp = () => {
    const text = buildWhatsAppText(prizeLabel, code, guestName.trim() || undefined, guestPhone.trim() || undefined, guestId.trim() || undefined)
    const url = `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    onDone?.()
  }

  const cardStyle = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,248,246,0.99) 100%)',
    border: '2px solid rgba(212, 175, 55, 0.45)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(212,175,55,0.15)',
  }
  const textStyle = { color: '#2c2825', fontFamily: 'Tajawal, Cairo, sans-serif' }
  const mutedStyle = { color: '#5c5348', fontFamily: 'Tajawal, Cairo, sans-serif' }

  return (
    <div className="w-full max-w-sm mx-auto py-4 sm:py-6 px-2 sm:px-1 animate-fade-in">
      <div className="rounded-2xl p-5 shadow-lg" style={cardStyle}>
        <p className="text-center text-[1rem] font-medium mb-1" style={textStyle}>
          {guestName.trim() ? `جائزتك السابقة يا ${guestName.trim()}` : 'جائزتك السابقة'}
        </p>
        <p className="text-center text-[0.9375rem] mb-4" style={mutedStyle}>
          لقد قمت بتدوير العجلة مسبقاً. يمكنك إرسال بيانات الجائزة للاستقبال مرة أخرى.
        </p>
        <div
          className="rounded-xl py-3.5 px-4 mb-4 border-2"
          style={{
            background: 'linear-gradient(135deg, rgba(232,197,71,0.22) 0%, rgba(212,175,55,0.12) 50%, rgba(184,134,11,0.18) 100%)',
            borderColor: 'rgba(217,119,6,0.55)',
            boxShadow: '0 2px 12px rgba(212,175,55,0.2), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
        >
          <p className="text-center text-[0.75rem] mb-0.5" style={mutedStyle}>الجائزة</p>
          <p className="text-center font-bold text-[1rem] mb-0.5" style={{ ...textStyle, color: '#92400e' }}>
            🎁 {prizeLabel}
          </p>
          <p className="text-center text-[0.75rem] mt-2.5 mb-0.5" style={mutedStyle}>كود التحقق</p>
          <p className="text-center font-mono text-base font-semibold tracking-widest" style={textStyle}>{code}</p>
        </div>
        <button
          type="button"
          onClick={handleSendWhatsApp}
          className="w-full min-h-[48px] py-3 rounded-xl text-white text-[0.9375rem] font-medium flex items-center justify-center gap-2 active:scale-[0.99] transition-colors touch-manipulation"
          style={{
            background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 50%, #b8860b 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          إرسال واتساب للاستقبال
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="w-full min-h-[44px] mt-3 py-2.5 rounded-xl border-2 text-[0.8125rem] touch-manipulation"
            style={{ borderColor: 'rgba(212,175,55,0.5)', color: '#5c5348' }}
          >
            العودة للبداية
          </button>
        )}
      </div>
    </div>
  )
}
