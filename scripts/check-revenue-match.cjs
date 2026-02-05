/**
 * يقرأ ملف الإيراد + ملف العملاء ويطابق — يعرض من لم يُربط (مثل الـ 22)
 * تشغيل: node scripts/check-revenue-match.cjs
 */
const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

const revenuePath = path.join(__dirname, '..', 'GuestsStatistical_Ar (2).xlsx')
const guestsPath = path.join(__dirname, '..', 'العملاء2 05_02_2026 س4 د48.xlsx')

if (!fs.existsSync(revenuePath)) {
  console.error('ملف الإيراد غير موجود:', revenuePath)
  process.exit(1)
}
if (!fs.existsSync(guestsPath)) {
  console.error('ملف العملاء غير موجود:', guestsPath)
  process.exit(1)
}

function str(v) {
  if (v == null) return ''
  return String(v).trim()
}

function norm(s) {
  return s.normalize('NFC').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase()
}

function normalizeId(v) {
  if (v == null) return ''
  return String(v).replace(/\D/g, '').slice(-10)
}

function parseAmount(v) {
  if (v == null) return 0
  let s = String(v).trim().replace(/[^\d.,\-]/g, '').replace(/,/g, '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

// ---- 1) تحميل ملف العملاء وبناء id→phone و name→[phones]
const guestsBuf = fs.readFileSync(guestsPath)
const guestsWb = XLSX.read(guestsBuf, { type: 'buffer' })
const guestsWs = guestsWb.Sheets[guestsWb.SheetNames[0]]
const guestsRows = XLSX.utils.sheet_to_json(guestsWs, { header: 1, defval: '' })

const gHeader = guestsRows[0] || []
function findCol(h, keys) {
  for (let i = 0; i < h.length; i++) {
    const c = norm(str(h[i]))
    if (!c) continue
    for (const k of keys) {
      if (c.includes(norm(k)) || norm(k).includes(c)) return i
    }
  }
  return -1
}

const gPhoneIdx = findCol(gHeader, ['رقم الجوال', 'جوال', 'phone'])
const gIdIdx = findCol(gHeader, ['رقم الهوية']) >= 0 ? findCol(gHeader, ['رقم الهوية']) : findCol(gHeader, ['الهوية'])
const gNameIdx = findCol(gHeader, ['الاسم', 'إسم العميل'])

const idToPhone = new Map()
const nameToPhones = new Map()
for (let i = 1; i < guestsRows.length; i++) {
  const row = guestsRows[i] || []
  const phone = str(row[gPhoneIdx]).replace(/\D/g, '').slice(-9)
  if (phone.length < 9) continue
  const idNum = gIdIdx >= 0 ? normalizeId(row[gIdIdx]) : ''
  const name = gNameIdx >= 0 ? str(row[gNameIdx]) : ''
  if (idNum.length >= 9) idToPhone.set(idNum, phone)
  if (name && name.length >= 4) {
    const key = norm(name)
    if (!nameToPhones.has(key)) nameToPhones.set(key, [])
    if (!nameToPhones.get(key).includes(phone)) nameToPhones.get(key).push(phone)
  }
}

console.log('ملف العملاء: عدد (رقم هوية → جوال)', idToPhone.size)
console.log('ملف العملاء: عدد أسماء → جوال', nameToPhones.size)
console.log('')

// ---- 2) تحميل ملف الإيراد (نفس منطق findHeaderRow + أعمدة)
const revBuf = fs.readFileSync(revenuePath)
const revWb = XLSX.read(revBuf, { type: 'buffer' })
const revWs = revWb.Sheets[revWb.SheetNames[0]]
const revRows = XLSX.utils.sheet_to_json(revWs, { header: 1, defval: '' })

const revKeys = ['المدفوع', 'مدفوع', 'إيراد', 'رقم الهوية', 'إسم العميل', 'اسم العميل']
let revHeaderIdx = 0
for (let r = 0; r < Math.min(50, revRows.length); r++) {
  const row = revRows[r] || []
  let n = 0
  for (const cell of row) {
    const s = norm(str(cell))
    if (!s) continue
    for (const k of revKeys) {
      if (s.includes(norm(k)) || norm(k).includes(s)) { n++; break }
    }
  }
  if (n >= 2) { revHeaderIdx = r; break }
}

const revHeader = revRows[revHeaderIdx] || []
const revIdIdx = findCol(revHeader, ['رقم الهوية', 'الهوية'])
const revNameIdx = findCol(revHeader, ['إسم العميل', 'اسم العميل', 'الاسم'])
const revSpentIdx = findCol(revHeader, ['المدفوع', 'الاجمالي', 'إيراد'])

if (revSpentIdx < 0 || (revIdIdx < 0 && revNameIdx < 0)) {
  console.error('لم يُعثر على أعمدة الإيراد (المدفوع + رقم الهوية أو الاسم)')
  process.exit(1)
}

// دمج صفوف الإيراد حسب id أو name (نفس مفتاح الربط)
const revByKey = new Map()
for (let i = revHeaderIdx + 1; i < revRows.length; i++) {
  const row = revRows[i] || []
  const amount = parseAmount(row[revSpentIdx])
  if (amount <= 0) continue
  const idNum = revIdIdx >= 0 ? normalizeId(row[revIdIdx]) : ''
  const name = revNameIdx >= 0 ? str(row[revNameIdx]) : ''
  const key = idNum.length >= 9 ? `id:${idNum}` : (name && name.length >= 4 ? `name:${norm(name)}` : '')
  if (!key) continue
  if (!revByKey.has(key)) revByKey.set(key, { idNumber: idNum || undefined, name: name || undefined, total_spent: 0 })
  revByKey.get(key).total_spent += amount
}

const revenueRows = [...revByKey.values()]
console.log('ملف الإيراد: صفوف فريدة (بعد الدمج)', revenueRows.length)
console.log('')

// ---- 3) محاولة ربط كل صف إيراد بجوال
let linked = 0
const unmatched = []
for (const row of revenueRows) {
  let phone = ''
  if (row.idNumber && row.idNumber.length >= 9) {
    phone = idToPhone.get(row.idNumber) || ''
  }
  if (!phone && row.name) {
    const phones = nameToPhones.get(norm(row.name))
    if (phones && phones.length === 1) phone = phones[0]
  }
  if (phone && phone.length >= 9) {
    linked++
  } else {
    unmatched.push({ idNumber: row.idNumber, name: row.name })
  }
}

console.log('تم الربط برقم جوال:', linked)
console.log('لم يُربط:', unmatched.length)
console.log('')
if (unmatched.length > 0) {
  console.log('عينة من غير المربوطين (رقم هوية | اسم):')
  unmatched.slice(0, 25).forEach((u, i) => {
    console.log(' ', i + 1, '|', u.idNumber || '—', '|', (u.name || '—').slice(0, 40))
  })
  if (unmatched.length > 25) console.log(' ... و', unmatched.length - 25, 'غيرهم')
}
