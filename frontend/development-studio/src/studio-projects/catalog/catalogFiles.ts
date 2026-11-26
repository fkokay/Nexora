export type CatalogFile = { path: string; content: string; sha256?: string }
export type SqlCatalogKind = 'dataSource' | 'action'
export type CatalogKind = SqlCatalogKind | 'component'
/** Veri kaynağı ya da eylem: `<klasör>/<kod>.json` (+ isteğe bağlı `<kod>.sql`). */
export type SqlCatalogEntry = {
  kind: SqlCatalogKind
  code: string
  jsonPath: string
  sqlPath: string | null
  json: Record<string, unknown>
  sql: string | null
}
/** Yazılımcı bileşeni: `bilesenler/<kod>/bilesen.json` (css/javascript olmadan) + `stil.css` + `kod.js`. */
export type ComponentCatalogEntry = {
  kind: 'component'
  code: string
  jsonPath: string
  cssPath: string
  jsPath: string
  json: Record<string, unknown>
  css: string
  javascript: string
}
export type CatalogEntry = SqlCatalogEntry | ComponentCatalogEntry

export const COMPONENT_FOLDER = 'bilesenler'
export const COMPONENT_FILES = { json: 'bilesen.json', css: 'stil.css', js: 'kod.js' } as const

const folders: Record<SqlCatalogKind, string> = { dataSource: 'veri', action: 'eylemler' }
const kindByFolder: Record<string, SqlCatalogKind> = { veri: 'dataSource', eylemler: 'action' }
const sqlHolder: Record<SqlCatalogKind, 'source' | 'run'> = { dataSource: 'source', action: 'run' }

/** Bileşen klasörü dosya yolları (kök + bilesenler/<kod>/…). */
export function componentPaths(root: string, code: string) {
  const dir = `${root.replace(/\/+$/, '')}/${COMPONENT_FOLDER}/${code}`
  return { dir, jsonPath: `${dir}/${COMPONENT_FILES.json}`, cssPath: `${dir}/${COMPONENT_FILES.css}`, jsPath: `${dir}/${COMPONENT_FILES.js}` }
}

/** Dosyaya yazılan bileşen JSON'u: css ve javascript ayrı dosyalardadır. */
function componentJson(json: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...json }
  delete rest.css
  delete rest.javascript
  return rest
}

const moduleRoot = (dir: string) => {
  const clean = dir.replace(/^\/+|\/+$/g, '')
  return clean.startsWith('modules/') ? clean : `modules/${clean}`
}

export function findCatalogRoot(moduleCode: string | null, moduleDirs: string[], dirsWithCatalog: string[]): string | null {
  void moduleDirs
  if (moduleCode) return `modules/${moduleCode}`
  const candidates = [...new Set(dirsWithCatalog.map(moduleRoot))]
  return candidates.length === 1 ? candidates[0] : null
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function readCatalogEntries(root: string, files: CatalogFile[]): { entries: CatalogEntry[]; errors: string[] } {
  const prefix = `${root.replace(/\/+$/, '')}/`
  const byPath = new Map(files.map(file => [file.path, file]))
  const entries: CatalogEntry[] = []
  const errors: string[] = []
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  for (const file of sorted) {
    if (!file.path.startsWith(prefix)) continue
    const relative = file.path.slice(prefix.length)
    const component = /^bilesenler\/([^/]+)\/bilesen\.json$/.exec(relative)
    if (component) {
      const code = component[1]
      let json: unknown
      try { json = JSON.parse(file.content) } catch { errors.push(`${relative}: JSON okunamadı.`); continue }
      if (!isRecord(json)) { errors.push(`${relative}: JSON bir nesne olmalı.`); continue }
      if (json.code !== code) { errors.push(`${relative}: klasör adı ile içindeki kod aynı olmalı (${code}).`); continue }
      const paths = componentPaths(root, code)
      const css = byPath.get(paths.cssPath)
      const js = byPath.get(paths.jsPath)
      if (!css || !js) { errors.push(`${code}: stil.css ya da kod.js bulunamadı.`); continue }
      entries.push({ kind: 'component', code, jsonPath: file.path, cssPath: paths.cssPath, jsPath: paths.jsPath, json, css: css.content, javascript: js.content })
      continue
    }
    const match = /^(veri|eylemler)\/([^/]+)\.json$/.exec(relative)
    if (!match) continue
    const kind = kindByFolder[match[1]]
    const code = match[2]
    let json: unknown
    try { json = JSON.parse(file.content) } catch { errors.push(`${relative}: JSON okunamadı.`); continue }
    if (!isRecord(json)) { errors.push(`${relative}: JSON bir nesne olmalı.`); continue }
    if (json.code !== code) { errors.push(`${relative}: dosya adı ile içindeki kod aynı olmalı (${code}).`); continue }
    const holder = json[sqlHolder[kind]]
    const reference = isRecord(holder) ? holder.sql : undefined
    if (reference === undefined || reference === null) {
      entries.push({ kind, code, jsonPath: file.path, sqlPath: null, json, sql: null })
      continue
    }
    if (typeof reference !== 'string' || reference !== `${code}.sql`) {
      errors.push(`${relative}: SQL dosya adı ${code}.sql olmalı ve klasör içermemeli.`)
      continue
    }
    const sqlPath = `${prefix}${match[1]}/${code}.sql`
    const sqlFile = byPath.get(sqlPath)
    if (!sqlFile) { errors.push(`${relative}: SQL dosyası bulunamadı (${code}.sql).`); continue }
    entries.push({ kind, code, jsonPath: file.path, sqlPath, json, sql: sqlFile.content })
  }
  return { entries, errors }
}

const ordinal = (a: CatalogEntry, b: CatalogEntry) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

function embed(entry: SqlCatalogEntry): Record<string, unknown> {
  if (entry.sql === null) return entry.json
  const key = sqlHolder[entry.kind]
  return { ...entry.json, [key]: { ...(entry.json[key] as Record<string, unknown>), sql: entry.sql } }
}

/** Paketteki bileşen: `code, label, description?, css, javascript, height?, settings` (stil.css ve kod.js gömülür). */
function embedComponent(entry: ComponentCatalogEntry): Record<string, unknown> {
  const json = componentJson(entry.json)
  const ordered: Record<string, unknown> = { code: json.code, label: json.label }
  if ('description' in json) ordered.description = json.description
  ordered.css = entry.css
  ordered.javascript = entry.javascript
  if ('height' in json) ordered.height = json.height
  ordered.settings = json.settings ?? []
  // Bilinmeyen anahtarlar olduğu gibi gider; sunucu reddeder ve hatayı gösterir.
  for (const key of Object.keys(json)) if (!(key in ordered)) ordered[key] = json[key]
  return ordered
}

const isSqlEntry = (entry: CatalogEntry): entry is SqlCatalogEntry => entry.kind !== 'component'
const isComponentEntry = (entry: CatalogEntry): entry is ComponentCatalogEntry => entry.kind === 'component'

/** `components` yalnız bileşen varsa eklenir: bileşensiz katalogların paketi (ve özeti) değişmez. */
export function buildBundle(entries: CatalogEntry[]) {
  const sql = entries.filter(isSqlEntry)
  const components = entries.filter(isComponentEntry).sort(ordinal).map(embedComponent)
  return {
    schemaVersion: 1,
    dataSources: sql.filter(e => e.kind === 'dataSource').sort(ordinal).map(embed),
    actions: sql.filter(e => e.kind === 'action').sort(ordinal).map(embed),
    ...(components.length ? { components } : {})
  } as { schemaVersion: number; dataSources: Record<string, unknown>[]; actions: Record<string, unknown>[]; components?: Record<string, unknown>[] }
}

/** Kaydedilecek dosyalar; JSON en sonda (başvurduğu dosyalar önce yazılır, yarım kalan kayıt eksik dosyaya başvurmaz). */
export function entryFiles(root: string, entry: CatalogEntry): CatalogFile[] {
  if (entry.kind === 'component') {
    const paths = componentPaths(root, entry.code)
    return [
      { path: paths.cssPath, content: entry.css },
      { path: paths.jsPath, content: entry.javascript },
      { path: paths.jsonPath, content: `${JSON.stringify(componentJson(entry.json), null, 2)}
` }
    ]
  }
  const dir = `${root.replace(/\/+$/, '')}/${folders[entry.kind]}`
  const files: CatalogFile[] = []
  if (entry.sql !== null) files.push({ path: `${dir}/${entry.code}.sql`, content: entry.sql })
  files.push({ path: `${dir}/${entry.code}.json`, content: `${JSON.stringify(entry.json, null, 2)}\n` })
  return files
}

export function toCatalogColumnType(dataType: string): 'text' | 'int' | 'decimal' | 'date' | 'bool' {
  switch (dataType) {
    case 'number': return 'int'
    case 'decimal': return 'decimal'
    case 'date': return 'date'
    case 'boolean': return 'bool'
    default: return 'text'
  }
}
