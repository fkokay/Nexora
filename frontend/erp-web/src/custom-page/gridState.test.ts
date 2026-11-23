import { describe, expect, it } from 'vitest';
import vectors from './gridColumns.vectors.json';
import { makeVariantDrafts } from '../inventory/variantDrafts';
import {
  GRID_UNIQUE, MATRIX_DIMENSION_COLUMNS, addBlockedMessage, emptyGridState, fixedRowValues, gridColumnRoot, gridMaxRowsMessage, gridReducer, gridScope,
  gridMinRowsMessage, iterationRows, parseColumnEntries, parseGridColumn, parseGridColumns, validateGrid, wireRow, type GridAction, type GridColumn, type GridState,
} from './gridState';

const column = (text: string): GridColumn => {
  const parsed = parseGridColumn(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.column;
};

const stage = { mode: 'stage' as const, maxRows: 50 };
const list = { mode: 'list' as const, maxRows: 50 };
const matrix = { mode: 'matrix' as const, maxRows: 10 };
const run = (state: GridState, actions: GridAction[], opts: { mode: 'stage' | 'list' | 'matrix'; maxRows: number }) =>
  actions.reduce((current, action) => gridReducer(current, action, opts), state);

const unitColumns = [column('unitCode|Birim|text|required,unique,upperCase,maxLength:8'), column('factorToBase|Katsayı|number|required,min:0.000001,step:0.000001')];
const sourceRows = [{ id: 'u1', unitCode: 'KOLI', factorToBase: 12 }, { id: 'u2', unitCode: 'PALET', factorToBase: 480 }];

describe('grid columns', () => {
  it('valid column vectors parse', () => {
    for (const vector of vectors.valid) {
      const parsed = parseGridColumn(vector.text);
      expect(parsed, vector.text).toMatchObject({ ok: true });
      if (parsed.ok) {
        expect(parsed.column.code, vector.text).toBe(vector.code);
        expect(parsed.column.inputType, vector.text).toBe(vector.inputType);
        expect(gridColumnRoot(parsed.column.code), vector.text).toBe(vector.root);
      }
    }
    expect(column('unitCode|Birim|text|required,unique,upperCase,maxLength:8')).toEqual({
      code: 'unitCode', label: 'Birim', inputType: 'text', rules: { required: true, unique: true, upperCase: true, readOnly: false, maxLength: 8 },
    });
    expect(column('factorToBase|Katsayı|number|required,min:0.000001,step:0.000001').rules).toEqual({
      required: true, unique: false, upperCase: false, readOnly: false, min: 0.000001, step: 0.000001,
    });
  });

  it('invalid column vectors fail', () => {
    for (const text of vectors.invalid) {
      const parsed = parseGridColumn(text);
      expect(parsed, text).toMatchObject({ ok: false });
      if (!parsed.ok) expect(parsed.error, text).not.toBe('');
    }
  });

  it('parseGridColumns drops invalid and caps at 16', () => {
    const texts = ['x|X|money', ...Array.from({ length: 18 }, (_, index) => `c${index}|C${index}|text`), 42];
    const parsed = parseGridColumns(texts);
    expect(parsed).toHaveLength(16);
    expect(parsed[0].code).toBe('c0');
    expect(parseGridColumns('c|C|text')).toEqual([]);
  });

  it('matrix dimension columns', () => {
    expect(MATRIX_DIMENSION_COLUMNS.map((item) => [item.code, item.label, item.rules.required, item.rules.maxLength])).toEqual([
      ['name', 'Özellik adı', true, 40], ['values', 'Değerler', true, undefined],
    ]);
  });
});

describe('gridReducer', () => {
  it('stage add edit remove undo', () => {
    let state = run(emptyGridState('k1'), [{ type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'unitCode', value: 'KUTU' }], stage);
    expect(state.added).toEqual([{ key: 'yeni-1', cells: { unitCode: 'KUTU' } }]);
    state = gridReducer(state, { type: 'remove', key: 'u1' }, stage);
    expect(state.removed).toEqual(['u1']);
    expect(gridReducer(state, { type: 'remove', key: 'u1' }, stage).removed).toEqual(['u1']);
    state = gridReducer(state, { type: 'undoRemove', key: 'u1' }, stage);
    expect(state.removed).toEqual([]);
    expect(state.added).toHaveLength(1);
    // Kaynak satır düzenlenemez.
    expect(gridReducer(state, { type: 'edit', key: 'u1', code: 'unitCode', value: 'X' }, stage)).toBe(state);
  });

  it('stage remove of added row deletes it', () => {
    const state = run(emptyGridState(null), [{ type: 'add' }, { type: 'add' }, { type: 'remove', key: 'yeni-1' }], stage);
    expect(state.added.map((draft) => draft.key)).toEqual(['yeni-2']);
    expect(state.removed).toEqual([]);
    expect(gridReducer(state, { type: 'add' }, stage).added.map((draft) => draft.key)).toEqual(['yeni-2', 'yeni-3']);
  });

  it('maxRows blocks add with message', () => {
    const opts = { mode: 'list' as const, maxRows: 2 };
    const full = run(emptyGridState(null), [{ type: 'add' }, { type: 'add' }], opts);
    expect(full.rows).toHaveLength(2);
    expect(addBlockedMessage(full, opts)).toBe('En fazla 2 satır eklenebilir.');
    expect(gridReducer(full, { type: 'add' }, opts)).toBe(full);
    expect(addBlockedMessage(emptyGridState(null), opts)).toBeNull();
    expect(gridMaxRowsMessage(5)).toBe('En fazla 5 satır eklenebilir.');
    // Tam dolu tablo kaydı engellemez.
    expect(validateGrid('list', [column('a|A|text')], full, [], 'id', 2)).toEqual({});
    const over: GridState = { ...full, rows: [...full.rows, { key: 'yeni-9', cells: {} }] };
    expect(validateGrid('list', [column('a|A|text')], over, [], 'id', 2)).toEqual({ '': { '': 'En fazla 2 satır eklenebilir.' } });
    // Varyant kipinde en fazla 10 özellik satırı.
    const dims = run(emptyGridState(null), Array.from({ length: 12 }, () => ({ type: 'add' as const })), { mode: 'matrix', maxRows: 50 });
    expect(dims.rows).toHaveLength(10);
  });

  it('commit prunes only given keys', () => {
    let state = run(emptyGridState('k'), [{ type: 'add' }, { type: 'add' }, { type: 'remove', key: 'u1' }, { type: 'remove', key: 'u2' }], stage);
    state = gridReducer(state, { type: 'commit', list: 'eklenenSatir', keys: ['yeni-1'] }, stage);
    expect(state.added.map((draft) => draft.key)).toEqual(['yeni-2']);
    expect(state.removed).toEqual(['u1', 'u2']);
    state = gridReducer(state, { type: 'commit', list: 'silinenSatir', keys: ['u2'] }, stage);
    expect(state.removed).toEqual(['u1']);
    expect(state.added.map((draft) => draft.key)).toEqual(['yeni-2']);
  });

  it('reset on new sourceKey clears staged', () => {
    const staged = run(emptyGridState('a'), [{ type: 'add' }, { type: 'remove', key: 'u1' }], stage);
    const reset = gridReducer(staged, { type: 'reset', sourceKey: 'b' }, stage);
    expect(reset).toMatchObject({ added: [], removed: [], sourceKey: 'b' });
    // Aynı anahtarla açık sıfırlama (Yeni) da temizler.
    expect(gridReducer(staged, { type: 'reset', sourceKey: 'a' }, stage)).toMatchObject({ added: [], removed: [], sourceKey: 'a' });
    // Liste kipi satırları temizler.
    const rows = run(emptyGridState(null), [{ type: 'add' }], list);
    expect(gridReducer(rows, { type: 'reset', sourceKey: null }, list).rows).toEqual([]);
  });

  it('removed key missing from refreshed source is dropped', () => {
    const staged = run(emptyGridState('a'), [{ type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'unitCode', value: 'KUTU' }, { type: 'edit', key: 'yeni-1', code: 'factorToBase', value: '6' }, { type: 'remove', key: 'u1' }, { type: 'remove', key: 'u2' }], stage);
    const refreshed = [sourceRows[1]];
    const scope = gridScope('stage', unitColumns, staged, refreshed, 'id');
    expect(scope.silinenler).toEqual([sourceRows[1]]);
    expect(scope.silinenSayisi).toBe(1);
    expect(iterationRows('silinenSatir', unitColumns, staged, refreshed, 'id')).toEqual([{ key: 'u2', row: sourceRows[1] }]);
    const pruned = gridReducer(staged, { type: 'reset', sourceKey: 'a', sourceKeys: ['u2'] }, stage);
    expect(pruned.removed).toEqual(['u2']);
    expect(pruned.added).toEqual(staged.added);
  });
});

describe('validateGrid', () => {
  it('required and unique messages', () => {
    const state = run(emptyGridState('k'), [
      { type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'unitCode', value: 'koli' }, { type: 'edit', key: 'yeni-1', code: 'factorToBase', value: '24' },
      { type: 'add' }, { type: 'edit', key: 'yeni-2', code: 'factorToBase', value: 'abc' },
      { type: 'add' }, { type: 'edit', key: 'yeni-3', code: 'unitCode', value: 'kutu' }, { type: 'edit', key: 'yeni-3', code: 'factorToBase', value: '2' },
    ], stage);
    expect(validateGrid('stage', unitColumns, state, sourceRows, 'id')).toEqual({
      'yeni-1': { unitCode: GRID_UNIQUE },
      'yeni-2': { unitCode: 'Bu alan zorunludur.', factorToBase: 'Geçerli bir sayı girin.' },
    });
    // Silinecek kaynak satırın değeri yeniden kullanılabilir.
    const removed = gridReducer(state, { type: 'remove', key: 'u1' }, stage);
    expect(validateGrid('stage', unitColumns, removed, sourceRows, 'id')['yeni-1']).toBeUndefined();
    // Liste kipinde iki yeni satır birbirini tekrarlarsa ikisi de işaretlenir.
    const listState = run(emptyGridState(null), [
      { type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'unitCode', value: 'Ab' }, { type: 'edit', key: 'yeni-1', code: 'factorToBase', value: '1' },
      { type: 'add' }, { type: 'edit', key: 'yeni-2', code: 'unitCode', value: 'AB ' }, { type: 'edit', key: 'yeni-2', code: 'factorToBase', value: '1' },
    ], list);
    expect(validateGrid('list', unitColumns, listState, [], 'id')).toEqual({ 'yeni-1': { unitCode: GRID_UNIQUE }, 'yeni-2': { unitCode: GRID_UNIQUE } });
  });

  it('matrix rows use the fixed dimension columns', () => {
    const state = run(emptyGridState(null), [{ type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'name', value: 'R'.repeat(41) }], matrix);
    expect(validateGrid('matrix', [], state, [], 'id')).toEqual({ 'yeni-1': { name: 'En fazla 40 karakter girilebilir.', values: 'Bu alan zorunludur.' } });
  });
});

describe('gridScope', () => {
  it('list scope nests dotted columns and types values', () => {
    const columns = [column('trackingCode|Lot|text|required,upperCase'), column('quantity|Miktar|number'), column('expiryDate|SKT|date'),
      column('aktif|Aktif|checkbox'), column('attributes.Renk|Renk|text'), column('attributes.Boy|Boy|number'), column('note|Not|text')];
    const state = run(emptyGridState(null), [
      { type: 'add' },
      { type: 'edit', key: 'yeni-1', code: 'trackingCode', value: ' lot-1 ' }, { type: 'edit', key: 'yeni-1', code: 'quantity', value: '2.5' },
      { type: 'edit', key: 'yeni-1', code: 'expiryDate', value: '2027-01-31' }, { type: 'edit', key: 'yeni-1', code: 'aktif', value: true },
      { type: 'edit', key: 'yeni-1', code: 'attributes.Renk', value: 'Mavi' }, { type: 'edit', key: 'yeni-1', code: 'attributes.Boy', value: '10' },
      { type: 'edit', key: 'yeni-1', code: 'note', value: '  ' },
      { type: 'add' }, { type: 'edit', key: 'yeni-2', code: 'trackingCode', value: 'b' },
    ], list);
    const scope = gridScope('list', columns, state, [], 'id');
    expect(scope.satirlar).toEqual([
      { trackingCode: 'LOT-1', quantity: 2.5, expiryDate: '2027-01-31', aktif: true, attributes: { Renk: 'Mavi', Boy: '10' } },
      { trackingCode: 'B' },
    ]);
    expect(scope.degisti).toBe(true);
    expect(gridScope('list', columns, emptyGridState(null), [], 'id')).toEqual({ satirlar: [], eklenenler: [], silinenler: [], eklenenSayisi: 0, silinenSayisi: 0, satirSayisi: 0, degisti: false });
  });

  it('unsafe keys never reach wire rows', () => {
    const columns = [column('__proto__|P|text'), column('attributes.constructor|C|text'), column('ok|Ok|text')];
    const state = run(emptyGridState(null), [{ type: 'add' }, { type: 'edit', key: 'yeni-1', code: '__proto__', value: 'x' },
      { type: 'edit', key: 'yeni-1', code: 'attributes.constructor', value: 'y' }, { type: 'edit', key: 'yeni-1', code: 'ok', value: 'z' }], list);
    const [row] = gridScope('list', columns, state, [], 'id').satirlar as Record<string, unknown>[];
    expect(JSON.stringify(row)).toBe('{"ok":"z"}');
  });

  it('stage scope combines source rows and staged changes', () => {
    const state = run(emptyGridState('k'), [{ type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'unitCode', value: 'kutu' }, { type: 'edit', key: 'yeni-1', code: 'factorToBase', value: '6' }, { type: 'remove', key: 'u1' }], stage);
    expect(gridScope('stage', unitColumns, state, sourceRows, 'id')).toEqual({
      satirlar: [sourceRows[1], { unitCode: 'KUTU', factorToBase: 6 }], eklenenler: [{ unitCode: 'KUTU', factorToBase: 6 }], silinenler: [sourceRows[0]],
      eklenenSayisi: 1, silinenSayisi: 1, satirSayisi: 2, degisti: true,
    });
  });

  it('matrix scope equals makeVariantDrafts', () => {
    const state = run(emptyGridState(null), [
      { type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'name', value: 'Renk' }, { type: 'edit', key: 'yeni-1', code: 'values', value: 'Kırmızı, Mavi' },
      { type: 'add' }, { type: 'edit', key: 'yeni-2', code: 'name', value: 'Beden' }, { type: 'edit', key: 'yeni-2', code: 'values', value: 'S,M' },
    ], matrix);
    const scope = gridScope('matrix', [], state, [], 'id', { code: 'TS', name: 'Tişört' });
    expect(scope.satirlar).toEqual(makeVariantDrafts('TS', 'Tişört', [{ name: 'Renk', values: 'Kırmızı, Mavi' }, { name: 'Beden', values: 'S,M' }]));
    expect(scope.satirlar).toHaveLength(4);
    expect(scope.degisti).toBe(true);
  });

  it('iterationRows added in wire shape and removed as source rows', () => {
    const state = run(emptyGridState('k'), [
      { type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'unitCode', value: 'kutu' }, { type: 'edit', key: 'yeni-1', code: 'factorToBase', value: '6' },
      { type: 'add' }, { type: 'edit', key: 'yeni-2', code: 'unitCode', value: 'çuval' }, { type: 'edit', key: 'yeni-2', code: 'factorToBase', value: '50' },
      { type: 'remove', key: 'u2' }, { type: 'remove', key: 'u1' },
    ], stage);
    expect(iterationRows('eklenenSatir', unitColumns, state, sourceRows, 'id')).toEqual([
      { key: 'yeni-1', row: { unitCode: 'KUTU', factorToBase: 6 } }, { key: 'yeni-2', row: { unitCode: 'ÇUVAL', factorToBase: 50 } },
    ]);
    // Kaynak satır sırasıyla.
    expect(iterationRows('silinenSatir', unitColumns, state, sourceRows, 'id')).toEqual([{ key: 'u1', row: sourceRows[0] }, { key: 'u2', row: sourceRows[1] }]);
  });

  it('stage unique also compares against the fixed row (base unit)', () => {
    const state = run(emptyGridState('a'), [{ type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'unitCode', value: 'adet' },
      { type: 'edit', key: 'yeni-1', code: 'factorToBase', value: '2' }], stage);
    expect(validateGrid('stage', unitColumns, state, sourceRows, 'id', 50)).toEqual({});
    const fixed = fixedRowValues('Ana birim: {{kart.rows[0].unitCode}} (1)', unitColumns, (path) => (path === 'kart.rows[0].unitCode' ? 'ADET' : undefined));
    expect(fixed).toEqual({ unitCode: ['ADET'] });
    expect(validateGrid('stage', unitColumns, state, sourceRows, 'id', 50, fixed)).toEqual({ 'yeni-1': { unitCode: GRID_UNIQUE } });
    // meta.baseUnitCode is base + column code; unrelated bindings (even ones merely ending with the code) and non-unique columns are ignored.
    expect(fixedRowValues('{{birimler.meta.baseUnitCode}} · {{kart.rows[0].name}} {{x.factorToBase}} {{x.altUnitCode}}', unitColumns, () => 'KG')).toEqual({ unitCode: ['KG'] });
  });
});

describe('lookup (picker) columns', () => {
  it('parses lookup:<query>:<value>:<label>[:<description>] with required, unique and readOnly', () => {
    expect(column('stockItemId|Stok kartı|lookup:stoklar:id:code:name|required,unique')).toEqual({
      code: 'stockItemId', label: 'Stok kartı', inputType: 'lookup',
      rules: { required: true, unique: true, upperCase: false, readOnly: false },
      lookup: { query: 'stoklar', valueColumn: 'id', labelColumn: 'code', descriptionColumn: 'name' },
    });
    expect(column('unitCode|Birim|lookup:birimler:unitCode:unitCode').lookup).toEqual({ query: 'birimler', valueColumn: 'unitCode', labelColumn: 'unitCode', descriptionColumn: '' });
    expect(column('loc|Konum|lookup:q-1:balance.id:balance.code|readOnly').rules.readOnly).toBe(true);
  });

  it('rejects broken lookup types and rules of other types', () => {
    for (const text of ['a|A|lookup', 'a|A|lookup:', 'a|A|lookup:q', 'a|A|lookup:q:id', 'a|A|lookup:q:id:code:name:x', 'a|A|lookup:q x:id:code',
      'a|A|lookup:q:id:', 'a|A|lookup:q:1d:code', 'a|A|lookup:q:id:code|upperCase', 'a|A|lookup:q:id:code|maxLength:4', 'a|A|lookup:q:id:code|min:1']) {
      expect(parseGridColumn(text), text).toMatchObject({ ok: false });
    }
  });

  it('an empty picker cell is omitted from the wire; labels never reach it', () => {
    const columns = [column('stockItemId|Stok|lookup:stoklar:id:code:name|required'), column('fromStorageLocationId|Konum|lookup:k:id:code')];
    const state = run(emptyGridState(null), [{ type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'stockItemId', value: 'S1', label: 'KLM · Kalem' },
      { type: 'edit', key: 'yeni-1', code: 'fromStorageLocationId', value: '' }], list);
    expect(state.rows[0].labels).toEqual({ stockItemId: 'KLM · Kalem' });
    expect(gridScope('list', columns, state, [], 'id').satirlar).toEqual([{ stockItemId: 'S1' }]);
    expect(wireRow(columns, state.rows[0])).toEqual({ stockItemId: 'S1' });
    // An edit without a label drops the stored one (the value no longer matches it).
    const edited = gridReducer(state, { type: 'edit', key: 'yeni-1', code: 'stockItemId', value: 'S2' }, list);
    expect(edited.rows[0].labels).toBeUndefined();
    expect(validateGrid('list', columns, run(state, [{ type: 'edit', key: 'yeni-1', code: 'stockItemId', value: '' }], list), [], 'id'))
      .toEqual({ 'yeni-1': { stockItemId: 'Bu alan zorunludur.' } });
  });

  it('clearColumn empties a column in every editable row, labels included', () => {
    const state = run(emptyGridState(null), [{ type: 'add' }, { type: 'add' },
      { type: 'edit', key: 'yeni-1', code: 'loc', value: 'L1', label: 'A-01' }, { type: 'edit', key: 'yeni-1', code: 'qty', value: '2' },
      { type: 'edit', key: 'yeni-2', code: 'loc', value: 'L2', label: 'A-02' }], list);
    const cleared = gridReducer(state, { type: 'clearColumn', code: 'loc' }, list);
    expect(cleared.rows.map((draft) => [draft.cells, draft.labels])).toEqual([[{ qty: '2' }, undefined], [{}, undefined]]);
    expect(gridReducer(cleared, { type: 'clearColumn', code: 'loc' }, list)).toBe(cleared);
    // Stage mode clears only the new rows (source rows are read-only).
    const staged = run(emptyGridState('k'), [{ type: 'add' }, { type: 'edit', key: 'yeni-1', code: 'loc', value: 'L1' }], stage);
    expect(gridReducer(staged, { type: 'clearColumn', code: 'loc' }, stage).added[0].cells).toEqual({});
  });

  it('minRows blocks a grid with fewer rows; stage counts kept source rows', () => {
    const columns = [column('q|Miktar|number')];
    expect(validateGrid('list', columns, emptyGridState(null), [], 'id', 100, undefined, 1)).toEqual({ '': { '': gridMinRowsMessage(1) } });
    expect(gridMinRowsMessage(1)).toBe('En az 1 kalem girin.');
    const one = run(emptyGridState(null), [{ type: 'add' }], list);
    expect(validateGrid('list', columns, one, [], 'id', 100, undefined, 1)).toEqual({});
    expect(validateGrid('list', columns, one, [], 'id', 100, undefined, 0)).toEqual({});
    expect(validateGrid('stage', unitColumns, emptyGridState('k'), sourceRows, 'id', 50, undefined, 2)).toEqual({});
    const removed = run(emptyGridState('k'), [{ type: 'remove', key: 'u1' }], stage);
    expect(validateGrid('stage', unitColumns, removed, sourceRows, 'id', 50, undefined, 2)).toEqual({ '': { '': gridMinRowsMessage(2) } });
  });

  it('satirSayisi counts the shown rows', () => {
    const state = run(emptyGridState(null), [{ type: 'add' }, { type: 'add' }], list);
    expect(gridScope('list', [column('q|Q|number')], state, [], 'id').satirSayisi).toBe(2);
  });

  it('parseColumnEntries splits on the first = only', () => {
    expect(parseColumnEntries(['unitCode==Ana birim', 'stockItemId=satir.isActive == true && satir.id != a.value', 'bad', '=x', 7, 'unitCode=KG=Kilogram']))
      .toEqual({ unitCode: ['=Ana birim', 'KG=Kilogram'], stockItemId: ['satir.isActive == true && satir.id != a.value'] });
    expect(parseColumnEntries(undefined)).toEqual({});
  });
});
