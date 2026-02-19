/**
 * One-off script to test if the wheel physically spins.
 * Run: node scripts/test-wheel-spin.mjs
 * Requires dev server on http://localhost:5176/
 */
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL || 'http://localhost:5176/'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 })
    await page.getByTestId('btn-spin-request').click()
    await page.getByPlaceholder('رقم الجوال').waitFor({ state: 'visible' })

    await page.getByTestId('input-phone').fill('0512345678')
    await page.waitForTimeout(500)

    const spinWheelBtn = page.getByTestId('btn-spin-wheel')
    const registerNameInput = page.getByTestId('input-name')

    let spinVisible = await spinWheelBtn.isVisible()
    let registerVisible = await registerNameInput.isVisible()

    if (!spinVisible && !registerVisible) {
      await page.waitForTimeout(2500)
      spinVisible = await spinWheelBtn.isVisible()
      registerVisible = await registerNameInput.isVisible()
    }

    if (registerVisible) {
      await page.getByTestId('input-name').fill('Test User')
      await page.getByPlaceholder('الهوية').fill('1234567890')
      await page.getByTestId('btn-register-and-spin').click()
    } else if (spinVisible) {
      await spinWheelBtn.click()
    } else {
      console.log('Neither spin nor register visible')
      await browser.close()
      process.exit(1)
    }

    const wheelRotate = page.getByTestId('wheel-rotate')
    await wheelRotate.waitFor({ state: 'visible', timeout: 15000 })

    const getComputedTransform = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="wheel-rotate"]')
        return el ? getComputedStyle(el).transform : null
      })
    const initialTransform = await getComputedTransform()
    await page.waitForTimeout(3000)
    const laterTransform = await getComputedTransform()

    const spun = initialTransform !== laterTransform && initialTransform !== 'none' && laterTransform !== 'none'
    console.log('Initial transform:', initialTransform)
    console.log('Later transform:', laterTransform)
    console.log('Wheel physically spins:', spun ? 'YES' : 'NO')
    process.exit(spun ? 0 : 1)
  } catch (e) {
    console.error(e)
    process.exit(2)
  } finally {
    await browser.close()
  }
}

main()
