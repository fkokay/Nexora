import { chromium, type FullConfig } from '@playwright/test'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export default async function globalSetup(config: FullConfig) {
  const baseURL = process.env.NEXORA_UI_BASE_URL || String(config.projects[0]?.use.baseURL || 'http://127.0.0.1:5173')
  const statePath = process.env.NEXORA_UI_STORAGE_STATE
    ? resolve(process.env.NEXORA_UI_STORAGE_STATE)
    : resolve('.auth/ui-design-audit.json')

  let savedStateExists = false
  try {
    await stat(statePath)
    savedStateExists = true
  } catch {
    // Create a signed-in state below when credentials are provided.
  }

  const email = process.env.NEXORA_UI_EMAIL
  const password = process.env.NEXORA_UI_PASSWORD
  if (savedStateExists) {
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ baseURL, storageState: statePath })
      const page = await context.newPage()
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      const isSignedIn = await page.evaluate(async () => {
        const token = localStorage.getItem('aierp.accessToken')
        if (!token) return false
        try {
          const response = await fetch('/api/auth/tenants', { headers: { Authorization: `Bearer ${token}` } })
          return response.ok
        } catch { return false }
      }).catch(() => false)
      await context.close()
      if (isSignedIn) return
    } finally {
      await browser.close()
    }
  }

  if (!email || !password) {
    throw new Error(
      `${savedStateExists ? 'The saved UI audit session is no longer authenticated. ' : 'UI audit needs an authenticated session. '}` +
      'Set NEXORA_UI_STORAGE_STATE to a current Playwright storage-state file, ' +
      'or set NEXORA_UI_EMAIL and NEXORA_UI_PASSWORD (plus NEXORA_UI_TENANT when the account has multiple companies).',
    )
  }

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ baseURL })
    const page = await context.newPage()
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

    if (await page.locator('input[type="email"]').count()) {
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      await page.getByRole('button', { name: /giriş yap|sign in/i }).click()
    }

    const tenantChoice = page.locator('.auth-company-row, .auth-tenant-option')
    await page.waitForFunction(() => Boolean(
      document.querySelector('.module-launcher-topbar') ||
      document.querySelector('main.main-area') ||
      document.querySelector('.auth-company-row, .auth-tenant-option') ||
      document.querySelector('[role="alert"]'),
    ), undefined, { timeout: 30_000 })

    if (await tenantChoice.count()) {
      const companyChoiceVisible = await tenantChoice.first().isVisible().catch(() => false)
      if (!companyChoiceVisible) {
        await page.locator('.module-launcher-topbar, main.main-area').first().waitFor({ state: 'visible', timeout: 30_000 })
      } else if (await tenantChoice.first().isDisabled()) {
        // A single-company login selects its tenant automatically; the choice row
        // can briefly render disabled while that request is still in flight.
        await page.locator('.module-launcher-topbar, main.main-area').first().waitFor({ state: 'visible', timeout: 30_000 })
      } else {
        const company = process.env.NEXORA_UI_TENANT?.trim()
        if (!company && await tenantChoice.count() > 1) {
          throw new Error('Account has multiple companies; set NEXORA_UI_TENANT to the company name or code used by the audit.')
        }
        const choice = company
          ? tenantChoice.filter({ hasText: company }).first()
          : tenantChoice.first()
        if (!await choice.count()) throw new Error(`Could not find the company specified by NEXORA_UI_TENANT: ${company}`)
        await choice.click()
      }
    }

    await page.waitForFunction(() => Boolean(
      document.querySelector('.module-launcher-topbar') || document.querySelector('main.main-area'),
    ), undefined, { timeout: 30_000 })
    await mkdir(dirname(statePath), { recursive: true })
    await context.storageState({ path: statePath })
    await context.close()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not prepare the UI audit session: ${message}`)
  } finally {
    await browser.close()
  }
}
