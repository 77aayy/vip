import { QRCodeSVG } from 'qrcode.react'

interface AdminQRPrintProps {
  show: boolean
  onToggle: () => void
}

export function AdminQRPrint({ show, onToggle }: AdminQRPrintProps) {
  return (
    <div className="mb-8 p-4 rounded-2xl bg-surface-card border border-white/[0.06] shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 text-right"
      >
        <span
          className={`inline-block transition-transform duration-200 ${show ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▼
        </span>
        <h2 className="text-white font-semibold text-[0.9375rem] flex-1">QR للطباعة — عجلة الحظ</h2>
      </button>
      {show && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div
            id="print-qr-card"
            className="mx-auto max-w-[320px] bg-white rounded-2xl p-6 shadow-xl text-center print:max-w-full print:p-8"
          >
            <div className="mb-3 text-[#0a0a0a] font-bold text-xl tracking-wide">عجلة الحظ</div>
            <p className="text-[#444] text-sm mb-4">امسح للعب وربح جوائز</p>
            <div className="flex justify-center">
              <div
                className="inline-flex items-center justify-center p-4 rounded-xl bg-white border-2 border-[#14b8a6]/30 w-[180px] h-[180px] overflow-hidden print:w-auto print:h-auto print:overflow-visible"
                id="qr-container"
              >
                <QRCodeSVG
                  value={(() => {
                    const pid = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
                    return pid ? `https://${pid}.web.app/` : (typeof window !== 'undefined' ? `${window.location.origin}/` : '/')
                  })()}
                  size={1024}
                  level="H"
                  includeMargin={false}
                  fgColor="#0a0a0a"
                  bgColor="#ffffff"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
            <p className="text-[#666] text-xs mt-4">امسح الكود لفتح صفحة العجلة</p>
            <div className="mt-4 flex flex-row justify-center gap-3 print:hidden">
              <button
                type="button"
                onClick={() => {
                  const svg = document.querySelector('#qr-container svg') as SVGSVGElement
                  if (!svg) return
                  const s = new XMLSerializer().serializeToString(svg)
                  const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const img = new Image()
                  img.onload = () => {
                    const c = document.createElement('canvas')
                    c.width = img.width
                    c.height = img.height
                    const ctx = c.getContext('2d')
                    if (ctx) {
                      ctx.fillStyle = '#fff'
                      ctx.fillRect(0, 0, c.width, c.height)
                      ctx.drawImage(img, 0, 0)
                      const a = document.createElement('a')
                      a.href = c.toDataURL('image/png')
                      a.download = 'qr-ajalat-alhaz.png'
                      a.click()
                    }
                    URL.revokeObjectURL(url)
                  }
                  img.src = url
                }}
                className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors shadow-md border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white"
                title="تحميل"
              >
                <span className="text-lg" aria-hidden>⬇</span>
                <span className="text-xs font-medium">تحميل</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl bg-stone-600 text-white font-medium hover:bg-stone-700 transition-colors shadow-md border-0 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 focus:ring-offset-white"
                title="طباعة A4"
              >
                <span className="text-lg" aria-hidden>🖨</span>
                <span className="text-xs font-medium">طباعة A4</span>
              </button>
            </div>
          </div>
          <p className="text-white/50 text-xs mt-3 text-center">
            الرابط ثابت — اطبع وعلّق في الاستقبال أو أي مكان
          </p>
        </div>
      )}
    </div>
  )
}
