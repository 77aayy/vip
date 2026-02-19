import { test, expect } from '@playwright/test'

const ADMIN_CODE = process.env.VITE_ADMIN_CODE ?? 'e2e-admin-code'

test.describe('مسار الأدمن — دخول ولوحة التحكم', () => {
  test('فتح /admin يعرض صفحة الدخول ثم الانتقال للوحة التحكم بعد إدخال الكود', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /لوحة التحكم/i })).toBeVisible()
    await expect(page.getByTestId('admin-code-input')).toBeVisible()

    await page.getByTestId('admin-code-input').fill(ADMIN_CODE)
    await page.getByRole('button', { name: /دخول/ }).click()

    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 })
    await expect(page.getByTestId('admin-dashboard')).toBeVisible({ timeout: 10000 })
  })
})
