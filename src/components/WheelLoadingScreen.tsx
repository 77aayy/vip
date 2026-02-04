import { useEffect } from 'react'

const DURATION_MS = 3000

interface WheelLoadingScreenProps {
  onComplete: () => void
}

export function WheelLoadingScreen({ onComplete }: WheelLoadingScreenProps) {
  useEffect(() => {
    const t = setTimeout(onComplete, DURATION_MS)
    return () => clearTimeout(t)
  }, [onComplete])

  return (
    <div
      className="w-full max-w-sm mx-auto py-12 px-6 flex flex-col items-center justify-center min-h-[200px] rounded-2xl animate-fade-in"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,248,246,0.99) 100%)',
        border: '2px solid rgba(212, 175, 55, 0.45)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(212,175,55,0.15)',
      }}
    >
      <div
        className="w-12 h-12 rounded-full border-[3px] border-amber-200/60 border-t-amber-500 animate-spin mb-5"
        aria-hidden
      />
      <p
        className="text-center text-[1rem] font-medium leading-relaxed"
        style={{
          color: '#2c2825',
          fontFamily: 'Tajawal, Cairo, sans-serif',
        }}
      >
        بنشوف لك أحلى جائزة من إليت ...
      </p>
    </div>
  )
}
