import { useState, useEffect, useMemo } from 'react'
import { useSound } from '@/hooks/useSound'

interface CodeResultProps {
  code: string
  prizeLabel: string
  /** اسم الضيف — إن وُجد (عميل جديد: الاسم المُدخل، عميل من القاعدة: الاسم المُستورد) */
  guestName?: string
  onCopy: () => void
  onWhatsApp: () => void
}

const CONFETTI_COLORS = ['#14b8a6', '#d4af37', '#f5f0e6', '#e8c547', '#fff', 'rgba(20,184,166,0.9)']

function ConfettiParticles() {
  const particles = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: 5 + Math.random() * 90,
      delay: Math.random() * 0.4,
      duration: 3.7 + Math.random() * 0.6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
      rotation: Math.random() * 360,
    }))
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none" aria-hidden>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-sm animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            top: '-8px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  )
}

export function CodeResult({ code, prizeLabel, guestName = '', onCopy: _onCopy, onWhatsApp }: CodeResultProps) {
  const [copied, setCopied] = useState(false)
  const { playCelebration } = useSound()

  useEffect(() => {
    playCelebration()
  }, [playCelebration])

  const handleCopy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        setCopied(false)
      })
  }

  const cardStyle = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,248,246,0.99) 100%)',
    border: '2px solid rgba(212, 175, 55, 0.45)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(212,175,55,0.15)',
  }
  const textStyle = { color: '#2c2825', fontFamily: 'Tajawal, Cairo, sans-serif' }
  const mutedStyle = { color: '#5c5348', fontFamily: 'Tajawal, Cairo, sans-serif' }

  return (
    <div className="w-full max-w-sm mx-auto py-6 animate-fade-in">
      <div className="relative rounded-2xl p-5 overflow-hidden animate-celebrate-pop" style={cardStyle}>
        <div
          className="absolute inset-0 opacity-25 rounded-2xl pointer-events-none"
          style={{
            background: 'linear-gradient(105deg, transparent 0%, rgba(212,175,55,0.12) 25%, transparent 50%, rgba(212,175,55,0.15) 75%, transparent 100%)',
            backgroundSize: '200% 200%',
          }}
        />
        <ConfettiParticles />
        <div className="relative z-10">
          <p className="text-center text-[0.8125rem] mb-0.5 flex items-center justify-center gap-1.5 flex-wrap" style={mutedStyle}>
            <span>{guestName.trim() ? `مبروك يا ${guestName.trim()}!` : 'مبروك!'}</span>
            <span className="font-medium text-[#b8860b]">جائزتك</span>
            <span>🎉</span>
          </p>
          <div
            className="rounded-xl py-3 px-4 mb-4 border-2 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(232,197,71,0.25) 0%, rgba(212,175,55,0.15) 50%, rgba(184,134,11,0.2) 100%)',
              borderColor: 'rgba(212,175,55,0.65)',
              boxShadow: '0 2px 12px rgba(212,175,55,0.2), inset 0 1px 0 rgba(255,255,255,0.4)',
            }}
          >
            <p className="font-bold text-[1.15rem] tracking-wide" style={{ ...textStyle, color: '#92400e' }}>
              🎁 {prizeLabel}
            </p>
          </div>
          <div
            className="rounded-xl py-3.5 px-4 mb-4 border border-amber-200/60 bg-amber-50/80"
          >
            <p className="text-center text-[0.75rem] mb-0.5" style={mutedStyle}>كود الاسترداد</p>
            <p className="text-center font-mono text-lg font-semibold tracking-widest select-all" style={textStyle}>
              {code}
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="w-full min-h-[48px] py-3 rounded-xl border-2 text-[0.9375rem] font-medium active:scale-[0.99] transition-all touch-manipulation"
              style={{
                borderColor: 'rgba(212,175,55,0.6)',
                color: '#2c2825',
                background: 'rgba(255,255,255,0.9)',
              }}
            >
              {copied ? 'تم النسخ ✓' : 'نسخ الكود'}
            </button>
            <button
              type="button"
              onClick={onWhatsApp}
              className="w-full min-h-[52px] py-3 px-3 rounded-xl text-white text-[0.8125rem] font-medium flex items-center justify-center gap-2 active:scale-[0.99] transition-all touch-manipulation leading-snug text-center"
              style={{
                background: 'linear-gradient(180deg, #e8c547 0%, #d4af37 50%, #b8860b 100%)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <span>نقاطك وكودك بضغطة واحدة ✨</span>
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </button>
          </div>
          <p className="text-center text-[0.75rem] mt-3.5" style={mutedStyle}>
            اضغط نسخ أو واتساب لمعرفة فئتك وإرسال البيانات للاستقبال
          </p>
        </div>
      </div>
    </div>
  )
}
