import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} block exists`).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const light = block(':root')
const dark = block('html[data-theme="dark"]')

const colorTokens = [
  '--nx-ink', '--nx-ink-2', '--nx-primary', '--nx-primary-strong', '--nx-primary-soft',
  '--nx-canvas', '--nx-surface', '--nx-line', '--nx-line-soft', '--nx-text', '--nx-muted',
  '--nx-ok', '--nx-ok-bg', '--nx-warn', '--nx-warn-bg', '--nx-bad', '--nx-bad-bg', '--nx-changed',
]
const otherTokens = [
  '--nx-font', '--nx-font-mono', '--nx-radius-control', '--nx-radius-card',
  '--nx-control-h', '--nx-row-h-dense', '--nx-row-h-comfort',
]

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('design tokens', () => {
  it('each required token is defined in :root', () => {
    for (const t of [...colorTokens, ...otherTokens]) expect(light[t], t).toBeTruthy()
  })

  it('each color token is redefined under html[data-theme="dark"]', () => {
    for (const t of colorTokens) expect(dark[t], t).toBeTruthy()
  })

  it('light values match the spec', () => {
    expect(light).toMatchObject({
      '--nx-primary': '#1f5fd1',
      '--nx-primary-strong': '#1846a3',
      '--nx-primary-soft': '#e8f0fd',
      '--nx-ink': '#0f1b2d',
      '--nx-ink-2': '#1a2a40',
      '--nx-canvas': '#f3f5f8',
      '--nx-surface': '#ffffff',
      '--nx-line': '#dfe3e9',
      '--nx-line-soft': '#eef1f4',
      '--nx-text': '#1b2430',
      '--nx-muted': '#667085',
      '--nx-ok': '#13804b',
      '--nx-ok-bg': '#e5f5ec',
      '--nx-warn': '#b45309',
      '--nx-warn-bg': '#fdf1e1',
      '--nx-bad': '#c4321f',
      '--nx-bad-bg': '#fde9e6',
      '--nx-changed': '#e0a100',
      '--nx-font': '"Segoe UI", Inter, system-ui, sans-serif',
      '--nx-control-h': '31px',
      '--nx-row-h-dense': '30px',
      '--nx-row-h-comfort': '38px',
    })
  })

  it('legacy --erp-* aliases point at --nx tokens', () => {
    const aliases = [
      '--erp-primary', '--erp-accent', '--erp-color-primary', '--erp-bg', '--erp-surface',
      '--erp-border', '--erp-text', '--erp-canvas', '--erp-ink', '--erp-line',
    ]
    for (const a of aliases) {
      const m = css.match(new RegExp(`${a}\\s*:\\s*([^;]+);`))
      expect(m?.[1].trim(), a).toMatch(/^var\(--nx-[\w-]+\)$/)
    }
  })

  it('text-role legacy aliases never resolve to ink, canvas or surface', () => {
    const globalComponents = readFileSync(resolve(__dirname, '..', 'global-components.css'), 'utf8')
    const textRole = [
      '--erp-ink', '--erp-text', '--erp-muted', '--erp-muted-ink', '--erp-faint-ink', '--erp-text-muted',
      '--erp-subtle', '--erp-color-text', '--erp-color-muted', '--erp-workbench-text', '--erp-workbench-muted',
    ]
    const resolveAlias = (source: string, name: string) =>
      source.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim()
    for (const a of textRole) {
      expect(resolveAlias(css, a), a).toMatch(/^var\(--nx-(text|muted)\)$/)
    }
    for (const a of ['--credit-ink', '--credit-muted']) {
      expect(resolveAlias(globalComponents, a), a).toMatch(/^var\(--nx-(text|muted)\)$/)
    }
  })

  it('dark text/surface pairs meet 4.5:1', () => {
    expect(contrast(dark['--nx-text'], dark['--nx-surface'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(dark['--nx-muted'], dark['--nx-surface'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(dark['--nx-primary-strong'], dark['--nx-primary-soft'])).toBeGreaterThanOrEqual(4.5)
  })
})
