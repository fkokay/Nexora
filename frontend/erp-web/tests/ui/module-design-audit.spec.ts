import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type Screen = { group: string; label: string; index: number }
type Finding = { screen: string; viewport: string; check: string; detail: string }

const auditDir = resolve('test-results/ui-design-audit')

async function openAllModules(page: Page) {
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: /modül ve ekran arama|module and screen search/i })
  if (!await dialog.isVisible().catch(() => false)) {
    await page.locator('.module-launcher-section-heading').getByRole('button', { name: /tüm modüller|all modules/i }).click()
  }
  await expect(dialog).toBeVisible()
  const allModules = dialog.getByRole('button', { name: /tüm modüller|all modules/i })
  if (await allModules.count()) await allModules.click()

  const groups = dialog.locator('.workspace-search-group')
  for (let index = 0; index < await groups.count(); index += 1) {
    const header = groups.nth(index).locator('> button')
    if (await header.getAttribute('aria-expanded') !== 'true') await header.click()
  }
  return { dialog, groups }
}

async function discoverScreens(page: Page): Promise<Screen[]> {
  const { dialog, groups } = await openAllModules(page)
  const screens: Screen[] = []
  for (let groupIndex = 0; groupIndex < await groups.count(); groupIndex += 1) {
    const group = groups.nth(groupIndex)
    const groupName = (await group.locator('> button b').innerText()).trim()
    const options = group.locator('button[role="option"]')
    for (let index = 0; index < await options.count(); index += 1) {
      const label = (await options.nth(index).locator('b').innerText()).trim()
      screens.push({ group: groupName, label, index })
    }
  }
  await dialog.getByRole('button', { name: /aramayı kapat|close search/i }).click()
  await expect(dialog).toBeHidden()
  return screens
}

async function openScreen(page: Page, screen: Screen) {
  const closeButtons = page.locator('.workspace-tab-close')
  while (await closeButtons.count()) {
    const currentCount = await closeButtons.count()
    await closeButtons.first().click()
    await expect(closeButtons).toHaveCount(currentCount - 1)
  }
  const { dialog, groups } = await openAllModules(page)
  let group = groups.nth(0)
  for (let index = 0; index < await groups.count(); index += 1) {
    const candidate = groups.nth(index)
    if ((await candidate.locator('> button b').innerText()).trim() === screen.group) {
      group = candidate
      break
    }
  }
  await expect(group.locator('> button b')).toHaveText(screen.group)
  const options = group.locator('button[role="option"]')
  const option = options.nth(screen.index)
  await expect(option.locator('b')).toHaveText(screen.label)
  await option.click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page.locator('#root')).toContainText(/\S/, { timeout: 10_000 })
  const activeTab = page.locator('.workspace-tabs [role="tab"][aria-selected="true"]')
  await expect(activeTab).toBeVisible()
  const activeTabText = (await activeTab.innerText()).trim()
  if (activeTabText) expect(activeTabText.toLocaleLowerCase()).toContain(screen.label.toLocaleLowerCase())
}

async function inspectLayout(page: Page, screen: Screen, viewport: string, findings: Finding[]) {
  const state = await page.evaluate(() => {
    const root = document.documentElement
    const main = document.querySelector('main.main-area, main.auth-shell, main.auth-tenant-shell')
    const visibleText = (main?.textContent || document.body.textContent || '').replace(/\s+/g, ' ').trim()
    const unlabeled = [...document.querySelectorAll('button, input:not([type="hidden"]), select, textarea')]
      .filter((element) => {
        const node = element as HTMLInputElement
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || node.getAttribute('aria-hidden') === 'true') return false
        if (node.getBoundingClientRect().width === 0 || node.getBoundingClientRect().height === 0) return false
        const text = (node.innerText || node.value || '').trim()
        const hasLabel = node.labels && node.labels.length > 0
        const iconLabel = [...node.querySelectorAll('svg')].some(svg =>
          svg.getAttribute('aria-label') || svg.getAttribute('title') || svg.querySelector('title')?.textContent?.trim(),
        )
        return !text && !hasLabel && !node.getAttribute('aria-label') && !node.getAttribute('aria-labelledby') && !node.getAttribute('title') && !iconLabel
      })
      .slice(0, 12)
      .map((node) => {
        const element = node as HTMLElement
        const classNames = String(element.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')
        const scope = element.closest('section, form, header, nav') as HTMLElement | null
        const scopeName = scope ? `${scope.tagName.toLowerCase()}.${String(scope.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')}` : 'no-section'
        return `${element.tagName.toLowerCase()}.${classNames || '(no-class)'} in ${scopeName}`
      })

    return {
      viewportWidth: window.innerWidth,
      documentWidth: root.scrollWidth,
      mainWidth: main?.scrollWidth ?? root.scrollWidth,
      textLength: visibleText.length,
      unlabeled,
    }
  })

  if (state.documentWidth > state.viewportWidth + 2) {
    findings.push({ screen: screen.label, viewport, check: 'horizontal-overflow', detail: `Document ${state.documentWidth}px wide in a ${state.viewportWidth}px viewport.` })
  }
  if (state.textLength < 20) {
    findings.push({ screen: screen.label, viewport, check: 'empty-screen', detail: `Only ${state.textLength} visible text characters were rendered.` })
  }
  if (state.unlabeled.length) {
    findings.push({ screen: screen.label, viewport, check: 'unlabeled-controls', detail: state.unlabeled.join(', ') })
  }
}

async function verifyGlobalSearch(page: Page, screen: Screen) {
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: /modül ve ekran arama|module and screen search/i })
  const hasDialog = await dialog.isVisible().catch(() => false)
  const searchArea = hasDialog ? dialog : page.locator('.module-launcher-search')
  await expect(searchArea).toBeVisible()
  await searchArea.getByRole('textbox').fill(screen.label)
  const option = searchArea.getByRole('option').first()
  await expect(option).toContainText(screen.label)
  await option.click()
  if (hasDialog) await expect(dialog).toBeHidden()
  const activeTab = page.locator('.workspace-tabs [role="tab"][aria-selected="true"]')
  const activeTabText = (await activeTab.innerText()).trim()
  if (activeTabText) expect(activeTabText.toLocaleLowerCase()).toContain(screen.label.toLocaleLowerCase())
  else await expect(activeTab).toHaveAttribute('aria-label', /modül arama|module search/i)
}

test('authorized module screens render, navigate, and remain usable at desktop and mobile sizes', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(20 * 60 * 1000)
  const findings: Finding[] = []
  const runtimeErrors: string[] = []
  const consoleErrors: string[] = []
  const apiErrors: string[] = []
  let currentScreen = 'application startup'
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', async (message) => {
    if (message.type() === 'error') {
      const location = message.location()
      const source = location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : ''
      const diagnostic = await Promise.all(message.args().slice(1).map(async (argument) => {
        try { return await argument.evaluate(value => value?.stack || value?.message || '') }
        catch { return '' }
      }))
      const stack = diagnostic.find(value => value)?.trim()
      consoleErrors.push(`${currentScreen}: ${message.text()}${source}${stack ? `\n${stack}` : ''}`)
    }
  })
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) apiErrors.push(`${response.status()} ${response.url()}`)
  })

  await page.goto(baseURL!, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.module-launcher-topbar, main.main-area')).toBeVisible({ timeout: 30_000 })
  const screens = await discoverScreens(page)
  expect(screens.length, 'The authorized module index should provide screens to audit.').toBeGreaterThan(0)
  const filter = process.env.NEXORA_UI_SCREEN_FILTER?.trim().toLocaleLowerCase()
  const auditScreens = filter ? screens.filter(screen => `${screen.group} ${screen.label}`.toLocaleLowerCase().includes(filter)) : screens
  expect(auditScreens.length, `No authorized screen matched NEXORA_UI_SCREEN_FILTER="${filter}".`).toBeGreaterThan(0)
  await verifyGlobalSearch(page, auditScreens[0])

  for (const screen of auditScreens) {
    currentScreen = screen.label
    const runtimeStart = runtimeErrors.length
    const consoleStart = consoleErrors.length
    const apiStart = apiErrors.length
    await page.setViewportSize({ width: 1440, height: 900 })
    try {
      await openScreen(page, screen)
      await inspectLayout(page, screen, 'desktop 1440×900', findings)

      await page.setViewportSize({ width: 390, height: 844 })
      await inspectLayout(page, screen, 'mobile 390×844', findings)
      await page.setViewportSize({ width: 1440, height: 900 })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      findings.push({ screen: screen.label, viewport: 'both', check: 'screen-navigation', detail })
      await mkdir(auditDir, { recursive: true })
      const fileName = screen.label.replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'screen'
      await page.screenshot({ path: resolve(auditDir, `${fileName}.png`), fullPage: true }).catch(() => undefined)
      await page.keyboard.press('Escape').catch(() => undefined)
      await page.setViewportSize({ width: 1440, height: 900 })
    }

    const newRuntimeErrors = runtimeErrors.slice(runtimeStart)
    const newConsoleErrors = [...new Set(consoleErrors.slice(consoleStart))]
    const newApiErrors = apiErrors.slice(apiStart)
    if (newRuntimeErrors.length) findings.push({ screen: screen.label, viewport: 'both', check: 'javascript-runtime', detail: newRuntimeErrors.join(' | ') })
    if (newConsoleErrors.length) findings.push({ screen: screen.label, viewport: 'both', check: 'console-error', detail: newConsoleErrors.join(' | ') })
    if (newApiErrors.length) findings.push({ screen: screen.label, viewport: 'both', check: 'api-response', detail: newApiErrors.join(' | ') })
  }

  await mkdir(auditDir, { recursive: true })
  const report = {
    baseURL,
    completedAt: new Date().toISOString(),
    screensAvailable: screens.length,
    screensAudited: auditScreens.length,
    viewports: ['desktop 1440×900', 'mobile 390×844'],
    findings,
  }
  await writeFile(resolve(auditDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  await testInfo.attach('ui-design-audit.json', { path: resolve(auditDir, 'report.json'), contentType: 'application/json' })
  expect(findings, `UI audit found ${findings.length} issue(s). See test-results/ui-design-audit/report.json and the Playwright HTML report.`).toEqual([])
})
