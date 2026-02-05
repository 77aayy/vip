import * as XLSX from 'xlsx'
import type { MemberRow, RevenueRow } from '@/types'

function normalizePhone(v: unknown): string {
  if (v == null) return ''
  const s = String(v).replace(/\D/g, '')
  return s.slice(-9)
}

function num(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** تحويل قيمة لمبلغ — يدعم الأرقام العربية والرموز والفاصلة العشرية */
function parseAmount(v: unknown): number {
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

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function normForMatch(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
}

/** تطبيع الاسم للمقارنة — إزالة التشكيل، توحيد الألف والياء */
function normalizeNameForMatch(name: string): string {
  if (!name || typeof name !== 'string') return ''
  let s = name
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/^(السيد|الاستاذ|الدكتور|المهندس|أ\.?\s*|Mr\.?\s*|Mrs\.?\s*|Ms\.?\s*)\s*/i, '')
  return s
}

function findColIndex(row: unknown[], keys: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const cell = normForMatch(str(row[i]))
    if (!cell) continue
    for (const k of keys) {
      const kn = normForMatch(k)
      if (kn.length > 0 && (cell.includes(kn) || kn.includes(cell))) return i
    }
  }
  return -1
}

export interface ParseMemberResult {
  rows: MemberRow[]
  rawDataRows: number
}

export function parseMemberFile(file: File): Promise<ParseMemberResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) return resolve({ rows: [], rawDataRows: 0 })
        const wb = XLSX.read(data, { type: 'binary' })
        const first = wb.SheetNames[0]
        if (!first) return resolve({ rows: [], rawDataRows: 0 })
        const ws = wb.Sheets[first]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        if (rows.length < 2) return reject(new Error('الملف فارغ أو فيه صف العناوين فقط. أضف صفوف بيانات تحت الصف الأول.'))
        const header = rows[0] as unknown[]
        const phoneIdx = findColIndex(header, ['phone', 'جوال', 'رقم', 'mobile', 'tel', 'رقم الجوال'])
        const nameIdx = findColIndex(header, ['name', 'اسم', 'اسم العميل'])
        const spentIdx = findColIndex(header, ['total_spent', 'totalspent', 'spent', 'إيراد', 'ايراد', 'مبلغ'])
        const idIdx = findColIndex(header, ['id', 'هوية', 'رقم الهوية', 'identity', 'national_id'])
        if (phoneIdx < 0) {
          return reject(new Error('عمود الجوال غير موجود. المطلوب: عمود بعنوان "جوال" أو "phone" أو "رقم" في الصف الأول.'))
        }
        const out: MemberRow[] = []
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[]
          const phone = normalizePhone(row[phoneIdx])
          if (!phone) continue
          const idNum = idIdx >= 0 ? str(row[idIdx]).replace(/\D/g, '').slice(-10) : undefined
          out.push({
            phone,
            name: nameIdx >= 0 ? str(row[nameIdx]) : '',
            total_spent: spentIdx >= 0 ? num(row[spentIdx]) : 0,
            ...(idNum && idNum.length >= 9 && { idNumber: idNum }),
          })
        }
        if (out.length === 0) {
          return reject(new Error('لم يُعثر على أي رقم جوال صالح في الملف. تأكد أن عمود الجوال يحتوي أرقاماً (٩ خانات على الأقل).'))
        }
        resolve({ rows: out, rawDataRows: rows.length - 1 })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsBinaryString(file)
  })
}

/** نتيجة استيراد كشف الإيراد قبل ربط رقم الهوية بالجوال */
export interface RevenueParseRow {
  idNumber?: string
  phone?: string
  name?: string
  total_spent: number
}

function normalizeId(v: unknown): string {
  if (v == null) return ''
  return String(v).replace(/\D/g, '').slice(-10)
}

function findHeaderRow(rows: unknown[][]): number {
  const keys = ['المدفوع', 'مدفوع', 'المبلغ', 'إيراد', 'ايراد', 'رقم الهوية', 'هوية', 'إسم العميل', 'اسم العميل', 'الاجمالي', 'اجمالي', 'paid', 'revenue', 'phone', 'جوال', 'رقم الجوال']
  for (let r = 0; r < Math.min(50, rows.length); r++) {
    const row = (rows[r] || []) as unknown[]
    let matchCount = 0
    for (const cell of row) {
      const s = normForMatch(str(cell))
      if (!s) continue
      for (const k of keys) {
        const kn = normForMatch(k)
        if (kn.length > 0 && (s.includes(kn) || kn.includes(s))) {
          matchCount++
          break
        }
      }
    }
    if (matchCount >= 2) return r
  }
  return 0
}

export interface ParseRevenueResult {
  rows: RevenueParseRow[]
  rawDataRows: number
}

export function parseRevenueFile(file: File): Promise<ParseRevenueResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) return resolve({ rows: [], rawDataRows: 0 })
        const wb = XLSX.read(data, { type: 'binary' })
        const first = wb.SheetNames[0]
        if (!first) return resolve({ rows: [], rawDataRows: 0 })
        const ws = wb.Sheets[first]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        if (rows.length < 2) return reject(new Error('الملف فارغ أو فيه صف العناوين فقط. أضف صفوف بيانات تحت الصف الأول.'))
        const headerRowIdx = findHeaderRow(rows)
        const header = (rows[headerRowIdx] || []) as unknown[]
        const phoneIdx = findColIndex(header, ['phone', 'جوال', 'الجوال', 'رقم', 'mobile', 'tel', 'رقم الجوال', 'الرقم', 'رقم الموبايل', 'هاتف', 'التليفون', 'رقم الهاتف', 'mobile_number', 'telephone'])
        const idIdx = findColIndex(header, ['رقم الهوية', 'رقمالهوية', 'id', 'هوية', 'identity', 'national_id'])
        const spentIdx = findColIndex(header, ['المدفوع', 'مدفوع', 'المبلغ', 'مبلغ', 'الاجمالي', 'اجمالي', 'الإجمالي', 'total_spent', 'totalspent', 'spent', 'إيراد', 'ايراد', 'revenue', 'paid'])
        const nameIdx = findColIndex(header, ['إسم العميل', 'اسم العميل', 'اسم', 'name', 'الاسم'])
        const hasId = idIdx >= 0
        const hasPhone = phoneIdx >= 0
        const hasAmount = spentIdx >= 0
        if (!hasId && !hasPhone) {
          return reject(new Error('عمود الجوال أو رقم الهوية غير موجود. المطلوب: عمود "جوال" أو "رقم الهوية" أو "phone" في صف العناوين.'))
        }
        if (!hasAmount) {
          return reject(new Error('عمود المبلغ/الإيراد غير موجود. المطلوب: عمود "المدفوع" أو "الاجمالي" أو "إيراد" أو "مبلغ".'))
        }
        const merged = new Map<string, RevenueParseRow>()
        const dataStart = headerRowIdx + 1
        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i] as unknown[]
          const idNum = hasId ? normalizeId(row[idIdx]) : ''
          const phone = hasPhone ? normalizePhone(row[phoneIdx]) : ''
          const amount = parseAmount(row[spentIdx])
          if (amount <= 0) continue
          const key = idNum && idNum.length >= 9 ? `id:${idNum}` : phone && phone.length >= 9 ? `phone:${phone}` : ''
          if (!key) continue
          const existing = merged.get(key)
          if (existing) {
            existing.total_spent += amount
          } else {
            merged.set(key, {
              ...(idNum && idNum.length >= 9 && { idNumber: idNum }),
              ...(phone && phone.length >= 9 && { phone }),
              name: nameIdx >= 0 ? str(row[nameIdx]) : undefined,
              total_spent: amount,
            })
          }
        }
        const out = [...merged.values()]
        if (out.length === 0) {
          return reject(new Error('لم يُعثر على أي صف صالح (جوال أو رقم هوية + مبلغ).'))
        }
        resolve({ rows: out, rawDataRows: rows.length - headerRowIdx - 1 })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsBinaryString(file)
  })
}

/** دمج صفوف إيراد من عدة ملفات (عدة فروع) — نفس النزيل يُجمّع إيراده */
export function mergeRevenueParseRows(arrays: RevenueParseRow[][]): RevenueParseRow[] {
  const byKey = new Map<string, RevenueParseRow>()
  const normId = (s: string) => s.replace(/\D/g, '').slice(-10)
  const normPhone = (s: string) => s.replace(/\D/g, '').slice(-9)
  for (const rows of arrays) {
    for (const row of rows) {
      const key =
        row.idNumber && row.idNumber.replace(/\D/g, '').length >= 9
          ? `id:${normId(row.idNumber)}`
          : row.phone && row.phone.replace(/\D/g, '').length >= 9
            ? `phone:${normPhone(row.phone)}`
            : ''
      if (!key) continue
      const existing = byKey.get(key)
      if (existing) {
        existing.total_spent += row.total_spent
        if (row.name && !existing.name) existing.name = row.name
        if (row.phone && !existing.phone) existing.phone = row.phone
        if (row.idNumber && !existing.idNumber) existing.idNumber = row.idNumber
      } else {
        byKey.set(key, { ...row })
      }
    }
  }
  return [...byKey.values()]
}

/** صف من ملف الربط — رقم هوية أو اسم → جوال */
export interface MappingRow {
  idNumber?: string
  name?: string
  phone: string
}

/** تحليل ملف الربط (رقم الهوية + جوال) — من تصدير نظام الفندق */
export function parseMappingFile(file: File): Promise<MappingRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) return resolve([])
        const wb = XLSX.read(data, { type: 'binary' })
        const first = wb.SheetNames[0]
        if (!first) return resolve([])
        const ws = wb.Sheets[first]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        if (rows.length < 2) return reject(new Error('الملف فارغ. المطلوب: صف عناوين + صفوف بيانات.'))
        const header = rows[0] as unknown[]
        const phoneIdx = findColIndex(header, ['phone', 'جوال', 'الجوال', 'رقم', 'mobile', 'tel', 'رقم الجوال', 'رقم الموبايل', 'هاتف'])
        const idIdx = findColIndex(header, ['رقم الهوية', 'رقمالهوية', 'id', 'هوية', 'identity', 'national_id'])
        const nameIdx = findColIndex(header, ['إسم العميل', 'اسم العميل', 'اسم', 'name', 'الاسم'])
        if (phoneIdx < 0) return reject(new Error('عمود الجوال غير موجود. المطلوب: عمود "جوال" أو "phone" أو "رقم".'))
        if (idIdx < 0 && nameIdx < 0) return reject(new Error('عمود رقم الهوية أو الاسم غير موجود. المطلوب للربط.'))
        const out: MappingRow[] = []
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[]
          const phone = normalizePhone(row[phoneIdx])
          if (!phone || phone.length < 9) continue
          const idNum = idIdx >= 0 ? normalizeId(row[idIdx]) : undefined
          const name = nameIdx >= 0 ? str(row[nameIdx]) : undefined
          out.push({ phone, ...(idNum && idNum.length >= 9 && { idNumber: idNum }), ...(name && { name }) })
        }
        resolve(out)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsBinaryString(file)
  })
}

/** تحويل نتيجة الاستيراد إلى RevenueRow[] مع ربط رقم الهوية أو الاسم بالجوال من قوائم الزبائن + ملف الربط */
export function resolveRevenueToPhone(
  parsed: RevenueParseRow[],
  members: { phone: string; idNumber?: string; name?: string }[],
  options?: { useNameFallback?: boolean; mapping?: MappingRow[] }
): RevenueRow[] {
  const idToPhone = new Map<string, string>()
  for (const m of members) {
    if (m.idNumber && m.idNumber.length >= 9) {
      const normId = m.idNumber.replace(/\D/g, '').slice(-10)
      idToPhone.set(normId, m.phone.replace(/\D/g, '').slice(-9))
    }
  }
  for (const row of options?.mapping ?? []) {
    if (row.idNumber && row.idNumber.replace(/\D/g, '').length >= 9) {
      const normId = row.idNumber.replace(/\D/g, '').slice(-10)
      const ph = row.phone.replace(/\D/g, '').slice(-9)
      if (ph) idToPhone.set(normId, ph)
    }
  }

  /** اسم معتمد → [جوال] — للربط بالاسم (فقط عند وجود عضو واحد بنفس الاسم) */
  const nameToPhones = new Map<string, string[]>()
  const addName = (name: string, phone: string) => {
    const normName = normalizeNameForMatch(name)
    if (normName.length < 4) return
    const list = nameToPhones.get(normName) ?? []
    if (!list.includes(phone)) list.push(phone)
    nameToPhones.set(normName, list)
  }
  if (options?.useNameFallback) {
    for (const m of members) addName(m.name ?? '', m.phone.replace(/\D/g, '').slice(-9))
  }
  for (const row of options?.mapping ?? []) {
    if (row.name) addName(row.name, row.phone.replace(/\D/g, '').slice(-9))
  }

  const byPhone = new Map<string, number>()
  for (const row of parsed) {
    let phone = row.phone ? row.phone.replace(/\D/g, '').slice(-9) : ''
    if (!phone && row.idNumber) {
      const normId = row.idNumber.replace(/\D/g, '').slice(-10)
      phone = idToPhone.get(normId) ?? ''
    }
    if (!phone && row.name) {
      const normName = normalizeNameForMatch(row.name)
      if (normName.length >= 4) {
        const phones = nameToPhones.get(normName)
        if (phones && phones.length === 1) phone = phones[0]
      }
    }
    if (!phone || phone.length < 9) continue
    byPhone.set(phone, (byPhone.get(phone) ?? 0) + row.total_spent)
  }
  return [...byPhone.entries()].map(([phone, total_spent]) => ({ phone, total_spent }))
}
