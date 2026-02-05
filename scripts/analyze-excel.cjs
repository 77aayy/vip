/**
 * تحليل ملف الإكسل — نفس منطق excelParser
 * تشغيل: node scripts/analyze-excel.cjs "path/to/file.xlsx"
 */
const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

const filePath = process.argv[2] || path.join(__dirname, '..', 'العملاء1 05_02_2026 س2 د17.xlsx')
if (!fs.existsSync(filePath)) {
  console.error('الملف غير موجود:', filePath)
  process.exit(1)
}

function normalizePhone(v) {
  if (v == null) return ''
  const s = String(v).replace(/\D/g, '')
  return s.slice(-9)
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

const header = rows[0] || []
const phoneIdx = findColIndex(header, ['phone', 'جوال', 'رقم', 'mobile', 'tel'])
const nameIdx = findColIndex(header, ['name', 'اسم', 'اسم العميل'])

console.log('=== تحليل ملف الإكسل ===')
console.log('الملف:', path.basename(filePath))
console.log('الشيت:', first)
console.log('عناوين الأعمدة:', header.join(' | '))
console.log('عمود الجوال (index):', phoneIdx, phoneIdx >= 0 ? `"${header[phoneIdx]}"` : 'غير موجود')
console.log('عمود الاسم (index):', nameIdx, nameIdx >= 0 ? `"${header[nameIdx]}"` : '')
console.log('')

const dataRows = rows.slice(1)
let validCount = 0
let invalidCount = 0
const invalidExamples = []
const phones = []
const duplicatePhones = new Map()
/** لكل رقم مكرر: قائمة { row, raw, name } */
const duplicateRowsByPhone = new Map()

for (let i = 0; i < dataRows.length; i++) {
  const row = dataRows[i] || []
  const rawPhone = row[phoneIdx]
  const phone = normalizePhone(rawPhone)
  if (!phone || phone.length < 9) {
    invalidCount++
    if (invalidExamples.length < 10) {
      invalidExamples.push({ row: i + 2, raw: rawPhone, name: nameIdx >= 0 ? row[nameIdx] : '' })
    }
  } else {
    validCount++
    phones.push(phone)
    const prev = duplicatePhones.get(phone) || 0
    duplicatePhones.set(phone, prev + 1)
    if (prev === 0) {
      duplicateRowsByPhone.set(phone, [])
    }
    duplicateRowsByPhone.get(phone).push({
      row: i + 2,
      raw: String(rawPhone ?? ''),
      name: nameIdx >= 0 ? str(row[nameIdx]) : ''
    })
  }
}

const uniquePhones = new Set(phones).size
const duplicatesCount = phones.length - uniquePhones
const dupDetails = [...duplicatePhones.entries()].filter(([, c]) => c > 1)

console.log('--- النتائج ---')
console.log('إجمالي صفوف البيانات:', dataRows.length)
console.log('صفوف صالحة (جوال 9+ أرقام):', validCount)
console.log('صفوف متجاهلة (جوال فارغ أو أقل من 9 أرقام):', invalidCount)
console.log('أرقام فريدة (بعد إزالة التكرار):', uniquePhones)
console.log('تكرار أرقام الجوال:', duplicatesCount, '(نفس الرقم في أكثر من صف)')
if (dupDetails.length > 0) {
  console.log('أمثلة أرقام مكررة:', dupDetails.slice(0, 5).map(([p, c]) => `${p} (${c}x)`).join(', '))
}
console.log('')
console.log('--- تفاصيل كل رقم مكرر (هل مكتوب مرتين في نفس الصف أم في صفوف مختلفة؟) ---')
for (const [phone, entries] of duplicateRowsByPhone) {
  if (entries.length <= 1) continue
  const rawValues = [...new Set(entries.map(e => JSON.stringify(e.raw)))]
  const sameRaw = rawValues.length === 1
  console.log(`رقم ${phone} (${entries.length}x):`)
  for (const e of entries) {
    console.log(`  سطر ${e.row} | القيمة الأصلية: "${e.raw}" | الاسم: ${e.name}`)
  }
  console.log(`  >> ${sameRaw ? 'نفس القيمة في صفوف مختلفة (تكرار حقيقي)' : 'قيم أصلية مختلفة (ممكن مكتوب مرتين في خلية أو صيغ مختلفة)'}`)
  console.log('')
}
if (invalidExamples.length > 0) {
  console.log('أمثلة صفوف متجاهلة:', invalidExamples.map((e) => `سطر ${e.row}: "${e.raw}"`).join(' | '))
}
console.log('')
console.log('--- الخلاصة ---')
if (invalidCount > 0) {
  console.log(`⚠️ ${invalidCount} صف تم تجاهله بسبب جوال غير صالح`)
}
if (duplicatesCount > 0) {
  console.log(`⚠️ ${duplicatesCount} صف له رقم جوال مكرر (Firebase يحفظ فريد = ${uniquePhones})`)
}
console.log('العدد المتوقع بعد الاستيراد:', uniquePhones)
