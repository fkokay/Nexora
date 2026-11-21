import { afterEach, describe, expect, it } from 'vitest';
import { applyClientFilters, filterChips, filterChoices, filterScope, filterStorageKey, formatFilterEntry, loadFilterValues, parseFilterEntries, presetFromPageParams, resolveKind, saveFilterValues, type ResolvedFilter } from './filterBarModel';

const resolved = (entry: string, kind: ResolvedFilter['kind'], label = entry.split('|')[0], choices: ResolvedFilter['choices'] = []): ResolvedFilter =>
  ({ ...parseFilterEntries([entry])[0], kind, label, choices });

describe('süzgeç alanı modeli', () => {
  it('filters öğelerini okur, geçersiz ve yinelenenleri atlar, aynı biçimde yazar', () => {
    const specs = parseFilterEntries(['warehouseId|select|row|warehouseId|Depo|depolar:id:name', 'status|auto|more', 'bad|liste|row', 'status|text|row', 'x|range|row|p']);
    expect(specs).toEqual([
      { key: 'warehouseId', kind: 'select', place: 'row', param: 'warehouseId', label: 'Depo', options: { query: 'depolar', valueColumn: 'id', labelColumn: 'name' } },
      { key: 'status', kind: 'auto', place: 'more' },
      // Aralık parametre taşımaz (sunucu da reddeder).
      { key: 'x', kind: 'range', place: 'row' },
    ]);
    expect(specs.map(formatFilterEntry)).toEqual(['warehouseId|select|row|warehouseId|Depo|depolar:id:name', 'status|auto|more', 'x|range|row']);
  });

  it('auto türü sütun biçiminden, değer etiketinden ve veri türünden çıkar', () => {
    const auto = parseFilterEntries(['k|auto|row'])[0];
    expect(resolveKind(auto, { format: 'money' })).toBe('range');
    expect(resolveKind(auto, { format: 'date' })).toBe('date');
    expect(resolveKind(auto, { hasValueLabels: true })).toBe('select');
    expect(resolveKind(auto, { dataType: 'Boolean' })).toBe('toggle');
    expect(resolveKind(auto, { format: 'code' })).toBe('text');
    // Parametreli süzgeç tek değer taşır.
    expect(resolveKind(parseFilterEntries(['k|auto|row|p'])[0], { format: 'number' })).toBe('text');
    expect(resolveKind(parseFilterEntries(['k|auto|row|p'])[0], { paramType: 'bool' })).toBe('toggle');
  });

  it('sayfada uygular: metin içerir, seçim eşit, aralık, aç/kapa ve seçili sütunlarda arama', () => {
    const rows = [
      { code: 'A1', name: 'Vida', type: 'R', qty: 5, active: true },
      { code: 'B2', name: 'Somun', type: 'I', qty: 50, active: false },
      { code: 'C3', name: 'Pul', type: 'R', qty: 500, active: true },
    ];
    const filters = [resolved('type|select|row', 'select'), resolved('qty|range|more', 'range'), resolved('active|toggle|row', 'toggle'), resolved('name|text|more', 'text'), resolved('srv|text|row|p', 'text')];
    const apply = (values: Record<string, unknown>, search = '') => applyClientFilters(rows, filters, { search, values: values as never }, { columns: ['code'], server: false }).map((row) => row.code);
    expect(apply({})).toEqual(['A1', 'B2', 'C3']);
    expect(apply({ type: 'R' })).toEqual(['A1', 'C3']);
    expect(apply({ qty: { min: '10', max: '' } })).toEqual(['B2', 'C3']);
    expect(apply({ active: true, qty: { min: '', max: '100' } })).toEqual(['A1']);
    expect(apply({ name: 'SOM' })).toEqual(['B2']);
    // Parametreli süzgeç sunucuya gider; satırlara uygulanmaz.
    expect(apply({ srv: 'yok' })).toEqual(['A1', 'B2', 'C3']);
    expect(apply({}, 'c')).toEqual(['C3']);
    // Arama parametresi varsa arama sunucudadır.
    expect(applyClientFilters(rows, filters, { search: 'c', values: {} }, { columns: ['code'], server: true })).toHaveLength(3);
    // Değer etiketi de aranır.
    expect(applyClientFilters(rows, [resolved('type|text|row', 'text')], { search: '', values: { type: 'giriş' } }, null, { type: { R: 'Giriş' } }).map((row) => row.code)).toEqual(['A1', 'C3']);
  });

  it('kapsam değerleri: parametre adıyla, iç içe anahtar, boş metin null, aç/kapa true/false', () => {
    const filters = [resolved('warehouseId|select|row|warehouseId', 'select'), resolved('stockItem.category|text|more', 'text'), resolved('inactive|toggle|row|includeInactive', 'toggle'), resolved('qty|range|more', 'range')];
    expect(filterScope(filters, { search: ' vida ', values: { warehouseId: 'w1', qty: { min: '1', max: '' } } }, 'q')).toEqual({
      arama: ' vida ', q: 'vida', warehouseId: 'w1', stockItem: { category: null }, includeInactive: false, qty: { min: '1', max: null },
    });
    expect(filterScope(filters, { search: '', values: { inactive: true } }, 'q')).toMatchObject({ q: null, warehouseId: null, includeInactive: true });
  });

  it('saklama anahtarı firma + sayfa + bileşen başınadır', () => {
    expect(filterStorageKey('inventory-stock', 'suzgec', 't1')).toBe('nexora.filterBar.t1.inventory-stock.suzgec');
    expect(filterStorageKey('inventory-stock', 'suzgec')).toBe('nexora.filterBar.inventory-stock.suzgec');
  });

  it('sorgudan seçenekli seçim süzgecinin seçili satırı seciliSatir altında, değer düz kalır', () => {
    const spec = parseFilterEntries(['warehouseId|select|row|warehouseId|Depo|depolar:id:name'])[0];
    const merkez = { id: 'w1', code: 'MRK', name: 'Merkez' };
    const filters: ResolvedFilter[] = [{ ...spec, kind: 'select', label: 'Depo', choices: filterChoices(spec, { optionRows: [merkez], rows: [] }) }, resolved('inactive|toggle|row|includeInactive', 'toggle')];
    expect(filterScope(filters, { search: '', values: { warehouseId: 'w1' } })).toEqual({ arama: '', warehouseId: 'w1', includeInactive: false, seciliSatir: { warehouseId: merkez } });
    expect(filterScope(filters, { search: '', values: {} })).toMatchObject({ warehouseId: null, seciliSatir: { warehouseId: null } });
    // Seçeneklerde olmayan (silinmiş) değer: değer korunur, seçili satır yoktur.
    expect(filterScope(filters, { search: '', values: { warehouseId: 'eski' } })).toMatchObject({ warehouseId: 'eski', seciliSatir: { warehouseId: null } });
  });

  it('çipler seçenek etiketini, aralığı ve aç/kapa etiketini gösterir', () => {
    const filters = [resolved('type|select|row', 'select', 'Durum', [{ value: 'R', label: 'Minimum altı' }]), resolved('qty|range|more', 'range', 'Depo bakiyesi'), resolved('inactive|toggle|row', 'toggle', 'Pasifler dahil')];
    expect(filterChips(filters, { search: '', values: { type: 'R', qty: { min: '10', max: '500' }, inactive: true } })).toEqual([
      { key: 'type', label: 'Durum', text: 'Minimum altı' }, { key: 'qty', label: 'Depo bakiyesi', text: '10 – 500' }, { key: 'inactive', label: 'Pasifler dahil', text: '' },
    ]);
  });

  it('seçenekler kaynak sorgudan, değer etiketlerinden ya da satırlardaki farklı değerlerden gelir', () => {
    const spec = parseFilterEntries(['w|select|row|||depolar:id:name'])[0];
    expect(filterChoices(spec, { optionRows: [{ id: '1', name: 'Merkez' }], rows: [] })).toEqual([{ value: '1', label: 'Merkez', row: { id: '1', name: 'Merkez' } }]);
    expect(filterChoices(parseFilterEntries(['t|select|row'])[0], { valueLabels: { R: 'Giriş', I: 'Çıkış' }, rows: [] })).toEqual([{ value: 'R', label: 'Giriş' }, { value: 'I', label: 'Çıkış' }]);
    expect(filterChoices(parseFilterEntries(['t|select|row'])[0], { rows: [{ t: 'b' }, { t: 'a' }, { t: 'b' }, { t: null }] })).toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]);
  });
});

describe('süzgeç değerlerinin saklanması', () => {
  afterEach(() => localStorage.clear());

  it('yalnız tanımdaki anahtarları geri okur; boş değerler saklanmaz', () => {
    saveFilterValues('k', { search: 'vi', values: { a: 'x', b: '', c: { min: '1', max: '' }, gone: true } });
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ search: 'vi', values: { a: 'x', c: { min: '1', max: '' }, gone: true } });
    expect(loadFilterValues('k', parseFilterEntries(['a|text|row', 'c|range|more']))).toEqual({ search: 'vi', values: { a: 'x', c: { min: '1', max: '' } } });
    saveFilterValues('k', { search: '', values: { a: '' } });
    expect(localStorage.getItem('k')).toBeNull();
    localStorage.setItem('k', '{bozuk');
    expect(loadFilterValues('k', [])).toEqual({ search: '', values: {} });
  });
});

describe('sayfa parametreleriyle süzgeç', () => {
  it('aynı adlı parametreli süzgeci doldurur ve saklanan değerin önüne geçer; parametresiz süzgeç ve boş değer etkilenmez', () => {
    const specs = parseFilterEntries(['warehouseId|select|row|warehouseId|Depo|depolar:id:name', 'isActive|select|row||Durum', 'pasif|toggle|row|includeInactive']);
    const stored = { search: 'ra', values: { warehouseId: 'eski', isActive: 'true' } };
    expect(presetFromPageParams(stored, specs, { warehouseId: 'w2', isActive: 'false', includeInactive: 'true' }))
      .toEqual({ search: 'ra', values: { warehouseId: 'w2', isActive: 'true', pasif: true } });
    expect(presetFromPageParams(stored, specs, { warehouseId: '  ' })).toBe(stored);
    expect(presetFromPageParams(stored, specs, {})).toBe(stored);
  });

  it('arama kutusunun searchParam adlı sayfa parametresi arama metnini doldurur', () => {
    const stored = { search: 'eski', values: {} };
    expect(presetFromPageParams(stored, [], { q: ' C-1001 ' }, 'q')).toEqual({ search: 'C-1001', values: {} });
    expect(presetFromPageParams(stored, [], { q: 'C-1001' })).toBe(stored);
    expect(presetFromPageParams(stored, [], { q: '  ' }, 'q')).toBe(stored);
  });
});
