import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(__dirname, '..')

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return cssFiles(full)
    return name.endsWith('.css') ? [full] : []
  })
}

// tokens.css is the single source and is allowed to define --erp-* aliases and font names.
const sheets = cssFiles(srcDir)
  .filter((file) => relative(srcDir, file) !== join('design', 'tokens.css'))
  .map((file) => ({ name: relative(srcDir, file).split(sep).join('/'), text: readFileSync(file, 'utf8') }))

function offenders(pattern: RegExp): string[] {
  return sheets.flatMap(({ name, text }) => {
    const hits = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))]
    return hits.map((m) => `${name}: ${m[0]}`)
  })
}

// A "color token" value is a literal color or a reference to a color token.
// Non-color legacy tokens (radius, sizes, shadows) may stay in the legacy stylesheets.
const colorValue = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(|color-mix\(|var\(--nx-)/i


// ---- hue test helpers -------------------------------------------------------
const colorLiteral = /#(?<hex>[0-9a-f]{3,8})(?![0-9a-z_-])|(?<fn>rgba?|hsla?)\((?<args>[^()]*)\)/gi

function toHsl(m: RegExpMatchArray): { h: number; s: number; l: number } | null {
  let r: number, g: number, b: number
  const hex = m.groups?.hex
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    if (full.length !== 6 && full.length !== 8) return null
    ;[r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  } else {
    const parts = (m.groups?.args ?? '').trim().split(/[\s,/]+/)
    if (m.groups?.fn?.toLowerCase().startsWith('rgb')) {
      const v = (x: string) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x) / 255)
      ;[r, g, b] = parts.slice(0, 3).map(v)
    } else {
      const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360
      const s = parseFloat(parts[1]) / 100
      const l = parseFloat(parts[2]) / 100
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      const channel = (t: number) => {
        const x = (t + 1) % 1
        return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p
      }
      ;[r, g, b] = [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
    }
  }
  if ([r, g, b].some((n) => Number.isNaN(n))) return null
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}

// Purple/violet family: hue 235-300, saturation >= 0.20, not near-black/near-white
// (the 0.95-0.995 band is pale lilac tint, also forbidden; pure white stays allowed).
const isPurple = ({ h, s, l }: { h: number; s: number; l: number }) => h >= 235 && h <= 300 && s >= 0.2 && l >= 0.08 && l < 0.995
// Gold/amber/olive: saturated gold (hue 38-52, s >= 0.6) plus the muted dark-theme olive/brown backgrounds
// (hue 35-60, s >= 0.15, lightness 0.08-0.95) that sat behind accent text.
const isGold = ({ h, s, l }: { h: number; s: number; l: number }) =>
  (h >= 38 && h <= 52 && s >= 0.6) || (h >= 35 && h <= 60 && s >= 0.15 && l >= 0.08 && l <= 0.95)

// Gold is allowed ONLY for the brand logo mark: the login/launcher/sidebar/topbar "N" badge and wordmark.
// Selectors (and the --nexora-brand-gold custom property) listed here are the complete allowlist.
const brandMark = /brand-mark|auth-logo|auth-wordmark|side-brand|topbar-brand|module-launcher-brand/
// The launcher background "custom color" swatch is a hue picker (conic-gradient across the whole wheel),
// so amber and violet stops are the point of the control, not an accent.
const huePicker = /launcher-background-custom/
function isAllowed(code: string, index: number, family: 'purple' | 'gold'): boolean {
  const open = code.lastIndexOf('{', index)
  const selector = code.slice(Math.max(code.lastIndexOf('}', open), code.lastIndexOf(';', open)) + 1, open)
  const declStart = Math.max(code.lastIndexOf(';', index), open)
  const declaration = code.slice(declStart + 1, index)
  if (huePicker.test(selector)) return true
  // The brand-mark exemption covers gold only; purple is never allowed, not even on the logo.
  return family === 'gold' && (brandMark.test(selector) || /--nexora-brand-gold\s*:/.test(declaration))
}

describe('legacy stylesheets converge on --nx tokens', () => {
  it('scans a non-trivial set of stylesheets', () => {
    expect(sheets.length).toBeGreaterThan(50)
  })

  it('no stylesheet redefines --erp-* color tokens', () => {
    const redefined = sheets.flatMap(({ name, text }) =>
      [...text.matchAll(/(--erp-[a-z0-9-]+)\s*:\s*([^;}]+)/gi)]
        .filter((m) => colorValue.test(m[2].trim()))
        .map((m) => `${name}: ${m[1]}: ${m[2].trim()}`),
    )
    expect(redefined).toEqual([])
  })

  it('no var() fallback carries a hex color', () => {
    expect(offenders(/var\(--[\w-]+,\s*#/)).toEqual([])
  })

  it('old accent colors are gone', () => {
    expect(offenders(/#(7060df|6844df|a99bff|0876d1|0A192F)(?![0-9a-f])/i)).toEqual([])
  })

  it('no purple/violet or gold color literal remains (one accent: --nx-primary)', () => {
    const found = sheets.flatMap(({ name, text }) => {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
      const hits: string[] = []
      for (const m of code.matchAll(colorLiteral)) {
        const hsl = toHsl(m)
        if (!hsl) continue
        const family = isPurple(hsl) ? 'purple' : isGold(hsl) ? 'gold' : null
        if (!family) continue
        const line = code.slice(0, m.index).split('\n').length
        if (isAllowed(code, m.index ?? 0, family)) continue
        hits.push(`${name}:${line} ${family} ${m[0]}`)
      }
      return hits
    })
    expect(found).toEqual([])
  })

  // Selector + declaration-body pairs of every plain rule (comments stripped).
  const rules = sheets.flatMap(({ name, text }) => {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '')
    return [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ name, selector: m[1].trim(), body: m[2] }))
  })

  it('hover/pressed fills on blue buttons use --nx-primary-hover, never --nx-primary-strong', () => {
    // --nx-primary-strong is a TEXT color (light #1846a3, dark #9dbcff); as a fill under white text it is unreadable in dark.
    const found = rules
      .filter((r) => /background(-color)?\s*:\s*var\(--nx-primary-strong\)/.test(r.body))
      .map((r) => `${r.name}: ${r.selector.slice(-120)}`)
    expect(found).toEqual([])
  })

  it('text on a --nx-primary / --nx-primary-hover fill is --nx-on-primary (or white)', () => {
    // Local aliases (e.g. --rf-accent: var(--nx-primary)) are resolved within the same stylesheet; an alias with
    // several definitions (themes) counts as primary when any of them is.
    const declarations = (body: string) =>
      [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)].map((m) => ({ prop: m[1].trim(), value: m[2].replace(/!important/, '').trim() }))
    const fills = new Set(['var(--nx-primary)', 'var(--nx-primary-hover)'])
    const onPrimary = /^(var\(--nx-on-primary\)|#fff(fff)?|white)$/i
    const found = sheets.flatMap(({ name, text }) => {
      const sheetRules = rules.filter((r) => r.name === name)
      const aliases = new Map<string, string[]>()
      for (const r of sheetRules)
        for (const { prop, value } of declarations(r.body))
          if (prop.startsWith('--')) aliases.set(prop, [...(aliases.get(prop) ?? []), value])
      const resolve = (value: string, depth = 0): string[] => {
        const alias = /^var\((--[\w-]+)(?:\s*,[^)]*)?\)$/.exec(value)
        if (!alias || depth > 5 || !aliases.has(alias[1])) return [value]
        return aliases.get(alias[1])!.flatMap((v) => resolve(v, depth + 1))
      }
      void text
      return sheetRules.flatMap((r) => {
        const decls = declarations(r.body)
        const fill = decls.find((d) => d.prop === 'background' || d.prop === 'background-color')
        const color = decls.find((d) => d.prop === 'color')
        if (!fill || !color || !resolve(fill.value).some((v) => fills.has(v))) return []
        return resolve(color.value).every((v) => onPrimary.test(v)) ? [] : [`${name}: ${r.selector.slice(-120)} (color: ${color.value})`]
      })
    })
    expect(found).toEqual([])
  })

  it('--nx-primary-on-ink is used only on fixed-dark surfaces', () => {
    // Login story panel, launcher welcome banner and the (always --nx-ink) workspace icon rail.
    const fixedDark = /auth-story|auth-feature|module-launcher-welcome|workspace-rail/
    const found = rules
      .filter((r) => r.body.includes('--nx-primary-on-ink') && !fixedDark.test(r.selector))
      .map((r) => `${r.name}: ${r.selector.slice(-120)}`)
    expect(found).toEqual([])
  })

  it('color-mix tints use the theme surface, not white', () => {
    expect(offenders(/color-mix\([^;]*var\(--nx-primary\)[^;]*,\s*white\)/)).toEqual([])
  })

  it('no stylesheet names DM Sans, Manrope or Inter directly', () => {
    expect(offenders(/(DM Sans|Manrope|(?<![\w-])Inter(?![\w-]))/i)).toEqual([])
  })
})
