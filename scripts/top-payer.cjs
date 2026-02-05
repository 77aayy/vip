/**
 * استخراج بيانات نزيل (أو نزلاء) الأعلى دفعاً في ملف كشف الإيراد — مع كل الأعمدة
 * تشغيل: node scripts/top-payer.cjs "path/to/file.xlsx"
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

function parseAmount(v) {
  if (v == null) return 0
  let s = String(v).trim()
  if (!s) return 0
  const ar = '٠١٢٣٤٥٦٧٨٩'
  const en = '0123456789'
  for (let i = 0; i < 10; i++) s = s.split(ar[i]).join(en[i])
  s = s.replace(/[^\d.,\-]/g, '').replace(/\s/g, '')
  if (!s) return 0
  const commaCount = (s.match(/,/g) || []).length
  const dotCount = (s.match(/\./g) || []).length
  if (commaCount > 0 && dotCount > 0) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (commaCount > 0) {
    s = s.replace(/,/g, '.')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function findColIndex(header, keys) {
  for (let i = 0; i < header.length; i++) {
    const cell = str(header[i]).toLowerCase().replace(/\s/g, '')
    if (!cell) continue
    for (const k of keys) {
      const kNorm = k.toLowerCase().replace(/\s/g, '')
      if (!kNorm) continue
      if (cell.includes(kNorm) || kNorm.includes(cell)) return i
    }
  }
  return -1
}

const buf = fs.readFileSync(filePath)
const wb = XLSX.read(buf, { type: 'buffer' })
const first = wb.SheetNames[0]
const ws = wb.Sheets[first]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

// صف العناوين: نبحث عن سطر فيه "المدفوع" أو "الاجمالي" مع "إسم العميل" أو "رقم الهوية"
let headerRowIdx = 0
for (let r = 0; r < Math.min(35, rows.length); r++) {
  const row = rows[r] || []
  const cells = row.map((c) => str(c))
  const hasAmount = cells.some((c) => /مدفوع|اجمالي|إيراد|مبلغ|revenue|المبلغ/i.test(c))
  const hasNameOrId = cells.some((c) => /اسم العميل|إسم العميل|رقم الهوية|هوية|جوال|phone/i.test(c))
  if (hasAmount && hasNameOrId) {
    headerRowIdx = r
    break
  }
}

const header = rows[headerRowIdx] || []
const phoneIdx = findColIndex(header, ['phone', 'جوال', 'رقم', 'mobile', 'tel', 'الجوال', 'رقم الجوال'])
const nameIdx = findColIndex(header, ['name', 'اسم', 'اسم العميل', 'الاسم', 'إسم العميل'])
const spentIdx = findColIndex(header, ['total_spent', 'totalspent', 'spent', 'إيراد', 'ايراد', 'مبلغ', 'revenue', 'المبلغ', 'المدفوع', 'مدفوع', 'الاجمالي', 'اجمالي'])
const idIdx = findColIndex(header, ['id', 'هوية', 'رقم الهوية', 'identity', 'national_id'])

if (spentIdx < 0) {
  console.error('لم يُعثر على عمود المبلغ/الإيراد في الملف.')
  process.exit(1)
}

const dataStart = headerRowIdx + 1
let maxAmount = 0
const topRows = []

// تجاهل المبالغ غير المنطقية (مثل تواريخ إكسل أو أخطاء)
const MAX_REALISTIC_AMOUNT = 50_000_000

for (let i = dataStart; i < rows.length; i++) {
  const row = rows[i] || []
  const amount = parseAmount(row[spentIdx])
  if (amount <= 0 || amount > MAX_REALISTIC_AMOUNT) continue
  if (amount > maxAmount) {
    maxAmount = amount
    topRows.length = 0
    topRows.push({ rowIndex: i + 1, row, amount })
  } else if (amount === maxAmount) {
    topRows.push({ rowIndex: i + 1, row, amount })
  }
}

console.log('=== نزيل/نزلاء الأعلى دفعاً في الملف ===')
console.log('الملف:', path.basename(filePath))
console.log('الشيت:', first)
console.log('أعلى مبلغ:', maxAmount, 'ريال')
console.log('عدد الصفوف بالأعلى مبلغ:', topRows.length)
console.log('')

if (topRows.length === 0) {
  console.log('لا توجد صفوف بيانات بمبلغ أكبر من صفر.')
  process.exit(0)
}

for (let t = 0; t < topRows.length; t++) {
  const { rowIndex, row, amount } = topRows[t]
  console.log('--- صف رقم', rowIndex, '(مبلغ:', amount, 'ريال) ---')
  for (let col = 0; col < header.length; col++) {
    const title = str(header[col])
    if (!title) continue
    const value = row[col]
    const display = value != null && String(value).trim() !== '' ? String(value).trim() : '(فارغ)'
    console.log('  ', title, ':', display)
  }
  console.log('')
}
