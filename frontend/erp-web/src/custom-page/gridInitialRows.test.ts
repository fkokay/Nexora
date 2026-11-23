import { describe, expect, it } from 'vitest';
import { initialGridState, parseInitialRowsMap, seedDrafts } from './gridInitialRows';
import { gridReducer, gridScope, parseGridColumns, type GridState } from './gridState';

const columns = parseGridColumns([
  'stockItemId|Stok|lookup:stoklar:id:code:name|required', 'quantity|Miktar|number|required', 'unitCode|Birim|text',
  'deliveryDate|Teslim|date', 'free|Bedelsiz|checkbox', 'lineTotal|Tutar|calc:onizleme:lineTotal',
]);
const list = { mode: 'list' as const, maxRows: 200 };

describe('parseInitialRowsMap', () => {
  it('defaults every editable column to its own field and skips calc columns', () => {
    expect(parseInitialRowsMap(undefined, columns)).toEqual({
      cells: { stockItemId: 'stockItemId', quantity: 'quantity', unitCode: 'unitCode', deliveryDate: 'deliveryDate', free: 'free' }, labels: {},
    });
  });

  it('reads cell and label entries and drops unknown codes, bad fields and non-strings', () => {
    const map = parseInitialRowsMap(['quantity=remainingQuantity', 'stockItemId@label=stockName', 'nope=x', 'unitCode=bad field',
      'lineTotal=lineTotal', 'unitCode=__proto__', 42, 'quantity', 'deliveryDate=line.date'], columns);
    expect(map.cells.quantity).toBe('remainingQuantity');
    expect(map.cells.unitCode).toBe('unitCode');
    expect(map.cells.deliveryDate).toBe('line.date');
    expect(map.cells).not.toHaveProperty('lineTotal');
    expect(map.labels).toEqual({ stockItemId: 'stockName' });
  });
});

describe('seedDrafts', () => {
  it('converts source values to cell text with stable source keys', () => {
    const map = parseInitialRowsMap(['stockItemId@label=stockName', 'deliveryDate=line.date'], columns);
    const drafts = seedDrafts(columns, [
      { stockItemId: 's1', stockName: 'Koli', quantity: 10.5, unitCode: 'ADET', line: { date: '2026-11-04T00:00:00' }, free: true, lineTotal: 99 },
      { stockItemId: 's2', quantity: 0, unitCode: null },
    ], map);
    expect(drafts).toEqual([
      { key: 'kaynak-1', origin: 'source', cells: { stockItemId: 's1', quantity: '10.5', unitCode: 'ADET', deliveryDate: '2026-11-04', free: true }, labels: { stockItemId: 'Koli' } },
      { key: 'kaynak-2', origin: 'source', cells: { stockItemId: 's2', quantity: '0' } },
    ]);
  });
});

describe('initialGridState', () => {
  const map = parseInitialRowsMap(undefined, columns);
  const rows = [{ stockItemId: 's1', quantity: 2 }];

  it('is empty until the query answers, then seeds loaded rows that are not dirty', () => {
    expect(initialGridState(undefined, columns, map, 'null', null).rows).toEqual([]);
    const state = initialGridState(undefined, columns, map, 'k1', rows);
    expect(state.rows.map((draft) => draft.cells)).toEqual([{ stockItemId: 's1', quantity: '2' }]);
    expect(gridScope('list', columns, state, [], 'id').degisti).toBe(false);
    expect(gridScope('list', columns, state, [], 'id').satirlar).toEqual([{ stockItemId: 's1', quantity: 2 }]);
  });

  it('keeps user edits for the same key and replaces rows for another key', () => {
    let state: GridState = initialGridState(undefined, columns, map, 'k1', rows);
    state = gridReducer(state, { type: 'edit', key: 'kaynak-1', code: 'quantity', value: '5' }, list);
    expect(state.rows[0].origin).toBe('source');
    expect(gridScope('list', columns, state, [], 'id').degisti).toBe(true);
    expect(initialGridState(state, columns, map, 'k1', [{ stockItemId: 's9', quantity: 1 }])).toBe(state);
    const other = initialGridState(state, columns, map, 'k2', [{ stockItemId: 's9', quantity: 1 }]);
    expect(other.rows.map((draft) => draft.cells.stockItemId)).toEqual(['s9']);
    // Sıfırlama saklı durumu siler: son yüklenen satırlara dönülür.
    expect(initialGridState(undefined, columns, map, 'k1', rows).rows[0].cells.quantity).toBe('2');
  });

  it('adopts refreshed rows for the same key only while the grid is untouched', () => {
    const state = initialGridState(undefined, columns, map, 'k1', rows);
    const refreshed = initialGridState(state, columns, map, 'k1', [{ stockItemId: 's1', quantity: 3 }]);
    expect(refreshed.rows[0].cells.quantity).toBe('3');
    expect(gridScope('list', columns, refreshed, [], 'id').degisti).toBe(false);
    const added = gridReducer(state, { type: 'add' }, list);
    expect(added.rows.map((draft) => draft.key)).toEqual(['kaynak-1', 'yeni-1']);
    expect(initialGridState(added, columns, map, 'k1', [{ stockItemId: 's1', quantity: 3 }])).toBe(added);
  });
});
