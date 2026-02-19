import { test, expect } from '@playwright/test'

/**
 * مسار الضيف الكامل: استعلام → عجلة → جائزة.
 * إذا لم يكن الرقم مسجلاً في القاعدة (تخزين محلي أو Firestore) فلن يظهر زر التدوير
 * وسيظهر نموذج التسجيل بدلاً منه. في بيئة الاختبار مع قاعدة فارغة نتحقق من ظهور
 * إما زر «ادور العجلة» (عند وجود الضيف) أو حقول التسجيل.
 * عند توفر بيانات تجريبية (ضيف مسجّل للرقم المستخدم) يمكن التحقق من إكمال اللفة وظهور شاشة الجائزة.
 */
test.describe('صفحة الضيف — مسار كامل', () => {
  test('فتح الصفحة وطلب العجلة وإدخال رقم ثم التحقق من ظهور العجلة أو نموذج التسجيل', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /عجلة الولاء/i })).toBeVisible()

    await page.getByTestId('btn-spin-request').click()
    await expect(page.getByPlaceholder('رقم الجوال')).toBeVisible()

    await page.getByTestId('input-phone').fill('0501111222')
    await page.waitForTimeout(2500)

    const spinWheelBtn = page.getByTestId('btn-spin-wheel')
    const registerNameInput = page.getByTestId('input-name')
    await expect(spinWheelBtn.or(registerNameInput)).toBeVisible({ timeout: 5000 })
  })

  test('عند ظهور زر التدوير: النقر وتدوير العجلة والتحقق من شاشة الجائزة', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /عجلة الولاء/i })).toBeVisible()

    await page.getByTestId('btn-spin-request').click()
    await expect(page.getByPlaceholder('رقم الجوال')).toBeVisible()

    await page.getByTestId('input-phone').fill('0501111222')
    await page.waitForTimeout(2500)

    const spinWheelBtn = page.getByTestId('btn-spin-wheel')
    if ((await spinWheelBtn.isVisible()) === false) {
      test.skip()
      return
    }

    await spinWheelBtn.click()
    await page.waitForTimeout(1000)

    const mainSpinBtn = page.getByTestId('btn-spin-request')
    await expect(mainSpinBtn).toBeVisible({ timeout: 5000 })
    await mainSpinBtn.click()

    await expect(page.getByText(/مبروك/)).toBeVisible({ timeout: 35000 })
  })
})
