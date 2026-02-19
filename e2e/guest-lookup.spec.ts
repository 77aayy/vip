import { test, expect } from '@playwright/test'

test.describe('صفحة الضيف — مسار استعلام', () => {
  test('فتح الصفحة وإدخال رقم وعرض زر استعلام', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /عجلة الولاء/i })).toBeVisible()

    await page.getByTestId('btn-spin-request').click()
    await expect(page.getByPlaceholder('رقم الجوال')).toBeVisible()

    await page.getByTestId('input-phone').fill('0501234567')
    await expect(page.getByTestId('btn-lookup')).toBeEnabled()
  })

  test('مسار اضغط للتسجيل — إدخال رقم وظهور حقول التسجيل', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('btn-skip-gift').click()

    await page.getByTestId('input-phone').fill('0598765432')
    await expect(page.getByTestId('input-name')).toBeVisible({ timeout: 5000 })
  })
})
