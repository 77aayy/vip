/**
 * محاكاة تحليل ملف العملاء/الربط — للتأكد من سبب استخراج 0
 * تشغيل: node scripts/debug-guest-parse.cjs "path/to/file.xlsx"
 */
const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

const filePath = process.argv[2] || path.join(__dirname, '..', 'العملاء2 05_02_2026 س4 د48.xlsx')
if (!fs.existsSync(filePath)) {
  console.error('الملف غير موجود:', filePath)
  process.exit(1)
}

function str(v) {
  if (v == null) return ''
  return String(v).trim()
}

function normForMatch(s) {
  return s
    .normalize('NFC')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
}

function normalizePhone(v) {
  if (v == null) return ''
  return String(v).replace(/\D/g, '').slice(-9)
}

function normalizeId(v) {
  if (v == null) return ''
  return String(v).replace(/\D/g, '').slice(-10)
}

function findColIndex(header, keys) {
  for (let i = 0; i < header.length; i++) {
    const cell = normForMatch(str(header[i]))
    if (!cell) continue
    for (const k of keys) {
      const kn = normForMatch(k)
      if (!kn) continue
      if (cell.includes(kn) || kn.includes(cell)) return i
    }
  }
  return -1
}

function findColIndexCellContains(header, keys) {
  for (let i = 0; i < header.length; i++) {
    const cell = normForMatch(str(header[i]))
    if (!cell) continue
    for (const k of keys) {
      const kn = normForMatch(k)
      if (!kn) continue
      if (cell.includes(kn)) return i
    }
  }
  return -1
}

function findHeaderRowForMapping(rows) {
  const phoneKeys = ['رقم الجوال', 'جوال', 'الجوال', 'جوال العميل', 'هاتف', 'هاتف العميل', 'تليفون', 'رقم التليفون', 'phone', 'mobile', 'tel', 'رقم الموبايل']
  const idOrNameKeys = ['رقم الهوية', 'الهوية', 'الاسم', 'إسم العميل', 'اسم العميل', 'اسم', 'name', 'identity', 'national_id']
  for (let r = 0; r < Math.min(40, rows.length); r++) {
    const row = rows[r] || []
    let hasPhone = false
    let hasIdOrName = false
    for (const cell of row) {
      const s = normForMatch(str(cell))
      if (!s) continue
      for (const k of phoneKeys) {
        if (normForMatch(k).length > 0 && (s.includes(normForMatch(k)) || normForMatch(k).includes(s))) {
          hasPhone = true
          break
        }
      }
      for (const k of idOrNameKeys) {
        if (normForMatch(k).length > 0 && (s.includes(normForMatch(k)) || normForMatch(k).includes(s))) {
          hasIdOrName = true
          break
        }
      }
    }
    if (hasPhone && hasIdOrName) return r
  }
  return 0
}

const buf = fs.readFileSync(filePath)
const wb = XLSX.read(buf, { type: 'buffer' })
const first = wb.SheetNames[0]
const ws = wb.Sheets[first]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

console.log('=== تشخيص تحليل ملف العملاء ===')
console.log('الملف:', path.basename(filePath))
console.log('الشيت:', first)
console.log('إجمالي الصفوف في الملف:', rows.length)
console.log('')

const headerRowIdx = findHeaderRowForMapping(rows)
console.log('صف العناوين المُكتشف (index):', headerRowIdx)

const header = rows[headerRowIdx] || []
const phoneIdx = findColIndex(header, ['رقم الجوال', 'جوال', 'الجوال', 'جوال العميل', 'هاتف', 'هاتف العميل', 'تليفون', 'رقم التليفون', 'phone', 'mobile', 'tel', 'رقم الموبايل'])
let idIdx = findColIndexCellContains(header, ['رقم الهوية', 'رقمالهوية', 'identity', 'national_id'])
if (idIdx < 0) idIdx = findColIndex(header, ['هوية', 'id'])
const nameIdx = findColIndex(header, ['الاسم', 'إسم العميل', 'اسم العميل', 'اسم', 'name'])

console.log('عمود الجوال (index):', phoneIdx, phoneIdx >= 0 ? `"${str(header[phoneIdx])}"` : '— غير موجود')
console.log('عمود رقم الهوية (index):', idIdx, idIdx >= 0 ? `"${str(header[idIdx])}"` : '— غير موجود')
console.log('عمود الاسم (index):', nameIdx, nameIdx >= 0 ? `"${str(header[nameIdx])}"` : '— غير موجود')
console.log('')

const dataStart = headerRowIdx + 1
let extracted = 0
let skippedNoPhone = 0
let skippedPhoneShort = 0
const samplePhones = []

for (let i = dataStart; i < rows.length; i++) {
  const row = rows[i] || []
  const rawPhone = row[phoneIdx]
  const phone = normalizePhone(rawPhone)
  if (!phone) {
    skippedNoPhone++
    continue
  }
  if (phone.length < 9) {
    skippedPhoneShort++
    continue
  }
  extracted++
  if (samplePhones.length < 5) samplePhones.push({ raw: rawPhone, normalized: phone })
}

console.log('صفوف البيانات (من صف', dataStart + 1, 'لآخر):', rows.length - dataStart)
console.log('تم استخراج (جوال 9+ خانات):', extracted)
console.log('تخطية (لا جوال):', skippedNoPhone)
console.log('تخطية (جوال أقل من 9):', skippedPhoneShort)
if (samplePhones.length) {
  console.log('عينة جوال:', samplePhones.map((p) => `"${p.raw}" → ${p.normalized}`).join(' | '))
}
if (extracted === 0 && dataStart < rows.length) {
  const firstDataRow = rows[dataStart] || []
  console.log('')
  console.log('أول صف بيانات (قيمة عمود الجوال):', JSON.stringify(firstDataRow[phoneIdx]), '→ normalized:', JSON.stringify(normalizePhone(firstDataRow[phoneIdx])))
}
console.log('')
process.exit(extracted > 0 ? 0 : 1)
