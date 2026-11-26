import { describe, expect, it } from 'vitest'
import { buildBundle, entryFiles, findCatalogRoot, readCatalogEntries, toCatalogColumnType, type CatalogFile } from './catalogFiles'

const R = 'modules/crm'
const f = (path: string, content: string): CatalogFile => ({ path: `${R}/${path}`, content })
const ds = (code: string, extra: object = {}) => JSON.stringify({ code, label: code, source: { sql: `${code}.sql` }, parameters: [], columns: [], ...extra })

describe('katalog dosya formatı', () => {
  it('findCatalogRoot_prefers_module_code_then_single_candidate_else_null', () => {
    expect(findCatalogRoot('crm', ['modules/crm', 'modules/x'], ['modules/x'])).toBe('modules/crm')
    expect(findCatalogRoot(null, ['modules/a', 'modules/b'], ['modules/b'])).toBe('modules/b')
    expect(findCatalogRoot(null, ['modules/a', 'modules/b'], ['modules/a', 'modules/b'])).toBeNull()
    expect(findCatalogRoot(null, [], [])).toBeNull()
  })

  it('readCatalogEntries_inlines_sibling_sql_and_reports_missing_file', () => {
    const ok = readCatalogEntries(R, [f('veri/cariler.json', ds('cariler')), f('veri/cariler.sql', 'select 1')])
    expect(ok.errors).toEqual([])
    expect(ok.entries[0]).toMatchObject({ kind: 'dataSource', code: 'cariler', sql: 'select 1', sqlPath: `${R}/veri/cariler.sql` })
    const missing = readCatalogEntries(R, [f('veri/cariler.json', ds('cariler'))])
    expect(missing.entries).toEqual([])
    expect(missing.errors).toEqual(['veri/cariler.json: SQL dosyası bulunamadı (cariler.sql).'])
  })

  it('readCatalogEntries_rejects_code_filename_mismatch_and_sql_path_with_slash', () => {
    const a = readCatalogEntries(R, [f('veri/cariler.json', ds('baska')), f('veri/baska.sql', 'x')])
    expect(a.entries).toEqual([])
    expect(a.errors).toHaveLength(1)
    const b = readCatalogEntries(R, [f('veri/cariler.json', ds('cariler', { source: { sql: '../cariler.sql' } })), f('veri/cariler.sql', 'x')])
    expect(b.entries).toEqual([])
    expect(b.errors[0]).toMatch(/^veri\/cariler\.json:/)
  })

  it('readCatalogEntries_uses_run_sql_for_actions', () => {
    const json = JSON.stringify({ code: 'sil', label: 'Sil', target: 't', kind: 'delete', run: { sql: 'sil.sql' } })
    const r = readCatalogEntries(R, [f('eylemler/sil.json', json), f('eylemler/sil.sql', 'delete x')])
    expect(r.errors).toEqual([])
    expect(r.entries[0]).toMatchObject({ kind: 'action', sql: 'delete x' })
  })

  it('buildBundle_matches_2a_shape_sorted_by_code', () => {
    const { entries } = readCatalogEntries(R, [
      f('veri/b.json', ds('b')), f('veri/b.sql', 'select b'),
      f('veri/a.json', JSON.stringify({ code: 'a', label: 'A', source: { erpOperation: 'x' }, parameters: [], columns: [] })),
      f('eylemler/z.json', JSON.stringify({ code: 'z', label: 'Z', target: 't', kind: 'update', run: { sql: 'z.sql' } })), f('eylemler/z.sql', 'update z')
    ])
    expect(buildBundle(entries)).toEqual({
      schemaVersion: 1,
      dataSources: [
        { code: 'a', label: 'A', source: { erpOperation: 'x' }, parameters: [], columns: [] },
        { code: 'b', label: 'b', source: { sql: 'select b' }, parameters: [], columns: [] }
      ],
      actions: [{ code: 'z', label: 'Z', target: 't', kind: 'update', run: { sql: 'update z' } }]
    })
  })

  it('entryFiles_writes_sql_before_json', () => {
    const { entries } = readCatalogEntries(R, [f('veri/a.json', ds('a')), f('veri/a.sql', 'select 1')])
    const files = entryFiles(R, entries[0])
    expect(files.map(x => x.path)).toEqual([`${R}/veri/a.sql`, `${R}/veri/a.json`])
    expect(files[1].content).toBe(`${JSON.stringify(entries[0].json, null, 2)}\n`)
  })

  it('toCatalogColumnType_maps_report_types', () => {
    expect(['number', 'decimal', 'date', 'boolean', 'string', 'guid'].map(toCatalogColumnType))
      .toEqual(['int', 'decimal', 'date', 'bool', 'text', 'text'])
  })
})

describe('katalog bileşen dosyaları', () => {
  const comp = (code: string, extra: object = {}) => JSON.stringify({ code, label: `${code} etiketi`, settings: [], ...extra })

  it('reads component folder into entry and builds bundle components', () => {
    const r = readCatalogEntries(R, [
      f('veri/a.json', JSON.stringify({ code: 'a', label: 'A', source: { erpOperation: 'x' }, parameters: [], columns: [] })),
      f('bilesenler/zHarita/bilesen.json', comp('zHarita', { description: 'Harita', height: 320, settings: [{ name: 'donem', label: 'Dönem', type: 'choice', options: ['Bu ay', 'Bu yıl'], default: 'Bu ay' }] })),
      f('bilesenler/zHarita/stil.css', '.kutu{}'),
      f('bilesenler/zHarita/kod.js', 'ciz()'),
      f('bilesenler/bTakvim/bilesen.json', comp('bTakvim')),
      f('bilesenler/bTakvim/stil.css', ''),
      f('bilesenler/bTakvim/kod.js', 'takvim()')
    ])
    expect(r.errors).toEqual([])
    expect(r.entries.find(e => e.code === 'zHarita')).toEqual({
      kind: 'component', code: 'zHarita',
      jsonPath: `${R}/bilesenler/zHarita/bilesen.json`, cssPath: `${R}/bilesenler/zHarita/stil.css`, jsPath: `${R}/bilesenler/zHarita/kod.js`,
      json: JSON.parse(comp('zHarita', { description: 'Harita', height: 320, settings: [{ name: 'donem', label: 'Dönem', type: 'choice', options: ['Bu ay', 'Bu yıl'], default: 'Bu ay' }] })),
      css: '.kutu{}', javascript: 'ciz()'
    })
    const bundle = buildBundle(r.entries)
    expect(bundle.dataSources.map(d => d.code)).toEqual(['a'])
    expect(bundle.actions).toEqual([])
    expect(bundle.components).toEqual([
      { code: 'bTakvim', label: 'bTakvim etiketi', css: '', javascript: 'takvim()', settings: [] },
      {
        code: 'zHarita', label: 'zHarita etiketi', description: 'Harita', css: '.kutu{}', javascript: 'ciz()', height: 320,
        settings: [{ name: 'donem', label: 'Dönem', type: 'choice', options: ['Bu ay', 'Bu yıl'], default: 'Bu ay' }]
      }
    ])
    expect(Object.keys(bundle.components![1])).toEqual(['code', 'label', 'description', 'css', 'javascript', 'height', 'settings'])
    // Bileşensiz katalogların paketi değişmez.
    expect('components' in buildBundle(r.entries.filter(e => e.kind !== 'component'))).toBe(false)
  })

  it('missing css or js file reports error', () => {
    const noCss = readCatalogEntries(R, [f('bilesenler/harita/bilesen.json', comp('harita')), f('bilesenler/harita/kod.js', 'x')])
    expect(noCss.entries).toEqual([])
    expect(noCss.errors).toEqual(['harita: stil.css ya da kod.js bulunamadı.'])
    const noJs = readCatalogEntries(R, [f('bilesenler/harita/bilesen.json', comp('harita')), f('bilesenler/harita/stil.css', '')])
    expect(noJs.errors).toEqual(['harita: stil.css ya da kod.js bulunamadı.'])
    const mismatch = readCatalogEntries(R, [f('bilesenler/harita/bilesen.json', comp('baska')), f('bilesenler/harita/stil.css', ''), f('bilesenler/harita/kod.js', 'x')])
    expect(mismatch.entries).toEqual([])
    expect(mismatch.errors[0]).toMatch(/^bilesenler\/harita\/bilesen\.json:/)
  })

  it('entryFiles writes bilesen.json stil.css kod.js', () => {
    const { entries } = readCatalogEntries(R, [
      f('bilesenler/harita/bilesen.json', comp('harita', { css: 'eski', javascript: 'eski' })), f('bilesenler/harita/stil.css', '.a{}'), f('bilesenler/harita/kod.js', 'ciz()')
    ])
    const files = entryFiles(R, entries[0])
    expect(files.map(x => x.path)).toEqual([`${R}/bilesenler/harita/stil.css`, `${R}/bilesenler/harita/kod.js`, `${R}/bilesenler/harita/bilesen.json`])
    expect(files[0].content).toBe('.a{}')
    expect(files[1].content).toBe('ciz()')
    expect(JSON.parse(files[2].content)).toEqual({ code: 'harita', label: 'harita etiketi', settings: [] })
    expect(files[2].content.endsWith('\n')).toBe(true)
  })
})
