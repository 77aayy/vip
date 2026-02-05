#!/usr/bin/env node
/**
 * يتحقق من صفحة الأدمن ورسالة Firebase عبر Playwright
 * تشغيل: npx playwright run scripts/check-admin-firebase.mjs (أو node بعد تثبيت playwright)
 */
import { chromium } from 'playwright'

const ADMIN_URL = 'http://localhost:5175/admin'

async function main() {
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)
    const firebaseBox = await page.locator('[class*="green-500"], [class*="amber-500"], [class*="red-500"]').first()
    const text = await firebaseBox.textContent().catch(() => null)
    const fullText = text || await page.locator('body').textContent()
    const hasFirebaseOk = fullText?.includes('Firebase يعمل') || fullText?.includes('Firebase يعمل')
    const hasError = fullText?.includes('ناقص') || fullText?.includes('غير موجودة')
    const hasPermission = fullText?.includes('صلاحيات مرفوضة')
    const hasDisabled = fullText?.includes('غير مفعّل')
    console.log('=== نتيجة التحقق من صفحة الأدمن ===')
    console.log('URL:', ADMIN_URL)
    console.log('نص صندوق Firebase:', text || '(لم يُعثر)')
    if (hasFirebaseOk && !hasError) {
      console.log('النتيجة: ✅ Firebase مضبوط ويعمل')
    } else if (hasError) {
      console.log('النتيجة: ❌ ملف .env ناقص أو مفاتيح Firebase غير موجودة')
    } else if (hasPermission) {
      console.log('النتيجة: ⚠️ Firebase مضبوط لكن صلاحيات Firestore مرفوضة')
    } else if (hasDisabled) {
      console.log('النتيجة: ⚠️ Firestore غير مفعّل في المشروع')
    } else {
      console.log('النتيجة: تحقق يدوياً — فتح', ADMIN_URL)
    }
  } catch (e) {
    console.error('خطأ:', e.message)
    console.log('تأكد أن السيرفر يعمل: npm run dev')
  } finally {
    await browser?.close()
  }
}

main()
