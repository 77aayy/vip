/**
 * تحليل ملف كشف الإيراد — استخراج الأعمدة المتاحة
 * تشغيل: node scripts/analyze-revenue.cjs "path/to/file.xlsx"
 */
const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

const filePath = process.argv[2] || path.join(__dirname, '..', 'GuestsStatistical_Ar (2).xlsx')
if (!fs.existsSync(filePath)) {
  console.error('الملف غير موجود:', filePath)
  process.exit(1)
}

function str(v) {
  if (v == null) return ''
  return String(v).trim()
}

function findColIndex(header, keys) {
  for (let i = 0; i < header.length; i++) {
    const cell = str(header[i]).toLowerCase().replace(/\s/g, '')
    for (const k of keys) {
      if (cell.includes(k) || k.includes(cell)) return i
    }
  }
  return -1
}

const buf = fs.readFileSync(filePath)
const wb = XLSX.read(buf, { type: 'buffer' })
const first = wb.SheetNames[0]
const ws = wb.Sheets[first]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

// ابحث عن صف العناوين — قد يكون الصف 0 أو 1 أو أكثر
let headerRowIdx = 0
for (let r = 0; r < Math.min(5, rows.length); r++) {
  const row = rows[r] || []
  const hasPhone = row.some((c, i) => {
    const s = str(c).toLowerCase()
    return s.includes('جوال') || s.includes('phone') || s.includes('رقم')
  })
  const hasAmount = row.some((c) => {
    const s = str(c).toLowerCase()
    return s.includes('إيراد') || s.includes('مبلغ') || s.includes('revenue')
  })
  if (hasPhone || hasAmount) {
    headerRowIdx = r
    break
  }
}
const header = rows[headerRowIdx] || []
const phoneIdx = findColIndex(header, ['phone', 'جوال', 'رقم', 'mobile', 'tel', 'الجوال'])
const nameIdx = findColIndex(header, ['name', 'اسم', 'اسم العميل', 'الاسم'])
const spentIdx = findColIndex(header, ['total_spent', 'totalspent', 'spent', 'إيراد', 'ايراد', 'مبلغ', 'revenue', 'المبلغ'])
const idIdx = findColIndex(header, ['id', 'هوية', 'رقم الهوية', 'identity', 'national_id'])

console.log('=== تحليل ملف كشف الإيراد ===')
console.log('الملف:', path.basename(filePath))
console.log('الشيت:', first)
console.log('عدد الصفوف:', rows.length)
console.log('عناوين الأعمدة (صف', headerRowIdx + 1, '):')
header.forEach((h, i) => { if (str(h)) console.log('  ', i, ':', JSON.stringify(str(h))) })
console.log('')
console.log('الأعمدة المكتشفة:')
console.log('  عمود الجوال:', phoneIdx >= 0 ? `index ${phoneIdx} "${header[phoneIdx]}"` : 'غير موجود')
console.log('  عمود الاسم:', nameIdx >= 0 ? `index ${nameIdx} "${header[nameIdx]}"` : 'غير موجود')
console.log('  عمود الإيراد/المبلغ:', spentIdx >= 0 ? `index ${spentIdx} "${header[spentIdx]}"` : 'غير موجود')
console.log('  عمود رقم الهوية:', idIdx >= 0 ? `index ${idIdx} "${header[idIdx]}"` : 'غير موجود')
console.log('')

if (rows.length < 2) {
  console.log('الملف فارغ أو فيه صف العناوين فقط.')
  process.exit(0)
}

console.log('صف العناوين (index):', headerRowIdx)
console.log('')

// عيّنات من الصفوف (بعد صف العناوين)
const dataStart = headerRowIdx + 1
// نسخة خام من أول 25 صفوف لعرض الهيكل
console.log('نسخة خام من أول 25 صفوف (كل الخلايا غير الفارغة):')
for (let i = 0; i < Math.min(25, rows.length); i++) {
  const row = rows[i] || []
  const nonEmpty = row.map((c, idx) => (str(c) ? `${idx}:"${str(c).slice(0, 25)}"` : null)).filter(Boolean)
  console.log('  سطر', i + 1, ':', nonEmpty.join(' | '))
}
