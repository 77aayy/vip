import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, devices } from '@playwright/test'

function loadEnv(): Record<string, string> {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return {}
  const text = readFileSync(path, 'utf-8')
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

const env = loadEnv()
const adminCode = process.env.VITE_ADMIN_CODE ?? env.VITE_ADMIN_CODE ?? 'e2e-admin-code'
if (!process.env.VITE_ADMIN_CODE) process.env.VITE_ADMIN_CODE = adminCode

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_ADMIN_CODE: adminCode,
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_PROJECT_ID: '',
    },
  },
})
