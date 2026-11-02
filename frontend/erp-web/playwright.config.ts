import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const baseURL = process.env.NEXORA_UI_BASE_URL || 'http://127.0.0.1:5173'
const localURL = new URL(baseURL).hostname === 'localhost' || new URL(baseURL).hostname === '127.0.0.1'
const storageState = process.env.NEXORA_UI_STORAGE_STATE
  ? resolve(process.env.NEXORA_UI_STORAGE_STATE)
  : resolve('.auth/ui-design-audit.json')

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results/ui-design-audit',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    storageState,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './tests/ui/global-setup.ts',
  ...(localURL ? {
    webServer: {
      command: process.env.NEXORA_UI_SERVER_COMMAND || 'npm run dev -- --host 127.0.0.1 --port 5173 --logLevel silent',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  } : {}),
})
