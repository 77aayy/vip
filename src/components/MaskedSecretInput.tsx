import { useState } from 'react'

export interface MaskedSecretInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'tel' | 'url' | 'text'
  label: string
  /** عند showLastChars=0 يعرض "مضبوط"؛ عند >0 يعرض •••••••• + آخر N أحرف */
  showLastChars?: number
}

export function MaskedSecretInput({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  label,
  showLastChars = 0,
}: MaskedSecretInputProps) {
  const [showSecret, setShowSecret] = useState(false)
  const hasValue = (value ?? '').trim().length > 0
  const maskedDisplay =
    showLastChars > 0 && hasValue
      ? `••••••••${(value ?? '').slice(-showLastChars)}`
      : 'مضبوط'

  return (
    <div>
      <label className="block text-white/70 text-sm mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        {!showSecret && hasValue ? (
          <>
            <span
              className={`px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white/70 font-mono ${showLastChars > 0 ? '' : 'truncate max-w-[16rem]'}`}
              title={showLastChars > 0 ? undefined : 'مضبوط'}
            >
              {maskedDisplay}
            </span>
            <button
              type="button"
              onClick={() => setShowSecret(true)}
              className="px-3 py-2 rounded-lg bg-white/10 text-accent text-sm hover:bg-white/20 border border-white/20 shrink-0"
            >
              إظهار
            </button>
          </>
        ) : (
          <>
            <input
              type={type}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value.trim())}
              placeholder={placeholder}
              className="flex-1 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40"
            />
            {hasValue && (
              <button
                type="button"
                onClick={() => setShowSecret(false)}
                className="px-3 py-2 rounded-lg bg-white/10 text-white/70 text-sm hover:bg-white/20 border border-white/20 shrink-0"
              >
                إخفاء
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
