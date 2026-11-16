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
    expect(offenders(/#(7060df|6844df|a99bff|0876d1|0A192F)/i)).toEqual([])
  })

  it('no stylesheet names DM Sans, Manrope or Inter directly', () => {
    expect(offenders(/(DM Sans|Manrope|(?<![\w-])Inter(?![\w-]))/i)).toEqual([])
  })
})
