export type CatalogFile = { path: string; content: string; sha256?: string }
export type CatalogKind = 'dataSource' | 'action'
export type CatalogEntry = {
  kind: CatalogKind
  code: string
  jsonPath: string
  sqlPath: string | null
  json: Record<string, unknown>
  sql: string | null
}

const folders: Record<CatalogKind, string> = { dataSource: 'veri', action: 'eylemler' }
const kindByFolder: Record<string, CatalogKind> = { veri: 'dataSource', eylemler: 'action' }
const sqlHolder: Record<CatalogKind, 'source' | 'run'> = { dataSource: 'source', action: 'run' }

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

function embed(entry: CatalogEntry): Record<string, unknown> {
  if (entry.sql === null) return entry.json
  const key = sqlHolder[entry.kind]
  return { ...entry.json, [key]: { ...(entry.json[key] as Record<string, unknown>), sql: entry.sql } }
}

export function buildBundle(entries: CatalogEntry[]) {
  return {
    schemaVersion: 1,
    dataSources: entries.filter(e => e.kind === 'dataSource').sort(ordinal).map(embed),
    actions: entries.filter(e => e.kind === 'action').sort(ordinal).map(embed)
  }
}

export function entryFiles(root: string, entry: CatalogEntry): CatalogFile[] {
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
