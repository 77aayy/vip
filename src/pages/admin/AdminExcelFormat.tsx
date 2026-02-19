interface AdminExcelFormatProps {
  show: boolean
  onToggle: () => void
}

export function AdminExcelFormat({ show, onToggle }: AdminExcelFormatProps) {
  return (
    <div className="mb-6 p-4 rounded-2xl bg-surface-card border border-white/[0.06] shadow-card">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2 text-right">
        <span className={`inline-block transition-transform duration-200 ${show ? 'rotate-180' : ''}`} aria-hidden>▼</span>
        <h2 className="text-white font-semibold text-[0.9375rem] flex-1">تنسيق ملف الإكسل</h2>
      </button>
      {show && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <ul className="text-white/80 text-sm space-y-1.5 list-disc list-inside leading-relaxed">
            <li>الصف الأول = عناوين الأعمدة (يُقرأ تلقائياً).</li>
            <li><strong>قوائم الفضي/الذهبي/البلاتيني:</strong> مطلوب عمود جوال. اختياري: اسم، إيراد، رقم الهوية.</li>
            <li><strong>كشف الإيراد:</strong> يمكن رفع حتى 5 ملفات. مطلوب عمود جوال أو رقم الهوية + عمود المدفوع أو الاجمالي.</li>
            <li><strong>بيانات النزلاء:</strong> ارفع ملفاً واحداً أو حتى 50 ملف. عمود رقم الجوال + رقم الهوية و/أو الاسم.</li>
            <li>الرفع يستبدل القائمة الحالية (محلياً وعلى Firebase إن كان مفعّلاً).</li>
          </ul>
          <p className="text-white/60 text-xs mt-2">صيغ مقبولة: .xlsx, .xls, .csv — يُقرأ أول شيت فقط.</p>
        </div>
      )}
    </div>
  )
}
