import { test, expect } from '@playwright/test'

/**
 * Test: Does the loyalty wheel physically spin?
 * Flow: Enter phone 0512345678 → complete registration → wait for wheel-loading (or wheel) → observe spin.
 */
test.describe('عجلة الولاء — دوران فعلي', () => {
  test('إدخال رقم 0512345678 وتكملة التسجيل وانتظار العجلة — هل تدور العجلة فعلياً؟', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /عجلة الولاء/i })).toBeVisible()

    await page.getByTestId('btn-spin-request').click()
    await expect(page.getByPlaceholder('رقم الجوال')).toBeVisible()

    await page.getByTestId('input-phone').fill('0512345678')
    await page.waitForTimeout(1000)

    // For new guest: register form appears. Fill name and id, then register.
    const nameInput = page.getByTestId('input-name')
    if (await nameInput.isVisible({ timeout: 3000 })) {
      await nameInput.fill('Test Guest')
      await page.getByPlaceholder('الهوية').fill('1234')
      await page.getByTestId('btn-register-and-spin').click()
    } else {
      const spinWheelBtn = page.getByTestId('btn-spin-wheel')
      await expect(spinWheelBtn).toBeVisible({ timeout: 3000 })
      await spinWheelBtn.click()
      await page.waitForTimeout(1000)
    }

    // Wait for wheel-loading to finish (3s) or wheel to appear directly
    const wheelLoadingText = page.getByText(/بنشوف لك أحلى جائزة/)
    const wheelRotate = page.getByTestId('wheel-rotate')
    if (await wheelLoadingText.isVisible({ timeout: 500 })) {
      await expect(wheelLoadingText).not.toBeVisible({ timeout: 5000 })
    }
    await expect(wheelRotate).toBeVisible({ timeout: 8000 })

    // Capture initial computed transform (animation drives the visual rotation)
    const initialTransform = await wheelRotate.evaluate(
      (el) => getComputedStyle(el as HTMLElement).transform
    )
    await page.waitForTimeout(3000)

    const laterTransform = await wheelRotate.evaluate(
      (el) => getComputedStyle(el as HTMLElement).transform
    )

    const spun = initialTransform !== laterTransform

    // eslint-disable-next-line no-console
    console.log('WHEEL SPIN REPORT: initial=', initialTransform, 'later=', laterTransform, 'physicallySpun=', spun)
    expect(spun, 'العجلة يجب أن تدور فعلياً (تحول العنصر يتغير)').toBe(true)

    // التحقق من عدم وجود سكرول في الصفحة (صفحة مدمجة على الجوال)
    const scrollState = await page.evaluate(() => ({
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      htmlOverflow: getComputedStyle(document.documentElement).overflowY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      rootOverflow: (() => {
        const root = document.getElementById('root')
        return root ? getComputedStyle(root).overflow : ''
      })(),
    }))
    expect(scrollState.htmlScrollTop, 'صفحة الضيف: لا سكرول عمودي على html').toBe(0)
    expect(scrollState.bodyScrollTop, 'صفحة الضيف: لا سكرول عمودي على body').toBe(0)
    expect(scrollState.htmlOverflow, 'html يجب أن يكون overflow-y hidden على صفحة الضيف').toBe('hidden')
    expect(scrollState.bodyOverflow, 'body يجب أن يكون overflow-y hidden على صفحة الضيف').toBe('hidden')
  })
})
