import { describe, expect, it } from 'vitest';
import { lookupFillValues, parseLookupFill } from './gridLookupFill';
import { gridReducer, parseGridColumns, type GridDraft, type GridState } from './gridState';

const columns = parseGridColumns([
  'stockItemId|Stok|lookup:stoklar:id:code:name|required', 'warehouseId|Depo|lookup:depolar:id:name', 'unitCode|Birim|text',
  'unitPrice|Birim fiyat|number', 'vatPercent|KDV %|number', 'lineTotal|Tutar|calc:onizleme:lineTotal', 'dueDate|Vade|date',
]);
const rules = parseLookupFill(['stockItemId:unitCode=baseUnitCode', 'stockItemId:unitPrice=salesPrice', 'stockItemId:vatPercent=vatRate',
  'stockItemId:dueDate=meta.due', 'unitCode:unitPrice=x', 'stockItemId:lineTotal=total', 'stockItemId:warehouseId=defaultWarehouseId',
  'stockItemId:stockItemId=id', 'stockItemId:nope=x', 'bad entry', 7, 'stockItemId:unitPrice=listPrice'], columns);
const list = { mode: 'list' as const, maxRows: 50 };
const stock = { id: 's1', baseUnitCode: 'ADET', salesPrice: 12.5, vatRate: 20, listPrice: 14, meta: { due: '2026-12-01T00:00:00' } };

describe('parseLookupFill', () => {
  it('keeps rules from a lookup column into a non-calc column other than itself; the last rule per target wins', () => {
    expect(rules).toEqual([
      { lookup: 'stockItemId', target: 'unitCode', field: 'baseUnitCode' },
      { lookup: 'stockItemId', target: 'vatPercent', field: 'vatRate' },
      { lookup: 'stockItemId', target: 'dueDate', field: 'meta.due' },
      { lookup: 'stockItemId', target: 'warehouseId', field: 'defaultWarehouseId' },
      { lookup: 'stockItemId', target: 'unitPrice', field: 'listPrice' },
    ]);
  });
});

describe('lookupFillValues', () => {
  const draft = (cells: GridDraft['cells'], filled?: Record<string, string>): GridDraft => ({ key: 'yeni-1', cells, ...(filled ? { filled } : {}) });

  it('fills empty targets from the chosen option row', () => {
    expect(lookupFillValues(rules, 'stockItemId', draft({ stockItemId: 's1' }), stock, columns))
      .toEqual({ unitCode: 'ADET', vatPercent: '20', dueDate: '2026-12-01', unitPrice: '14' });
  });

  it('never overwrites a value the user typed, but replaces what the previous choice filled', () => {
    const typed = draft({ unitCode: 'KOLI', unitPrice: '14', vatPercent: '10' }, { unitPrice: '14', vatPercent: '20' });
    expect(lookupFillValues(rules, 'stockItemId', typed, { ...stock, listPrice: 30, vatRate: 1 }, columns))
      .toEqual({ unitPrice: '30', dueDate: '2026-12-01' });
  });

  it('does nothing for another column, a cleared choice or missing fields', () => {
    expect(lookupFillValues(rules, 'warehouseId', draft({}), stock, columns)).toEqual({});
    expect(lookupFillValues(rules, 'stockItemId', draft({}), null, columns)).toEqual({});
    expect(lookupFillValues(rules, 'stockItemId', draft({}), { id: 's2', vatRate: null }, columns)).toEqual({});
  });

  it('the fill action writes cells, records them as filled and keeps origin', () => {
    let state: GridState = { added: [], removed: [], rows: [{ key: 'kaynak-1', cells: { unitCode: 'X' }, origin: 'source', labels: { unitCode: 'old' } }], sourceKey: null, nextKey: 1 };
    state = gridReducer(state, { type: 'fill', key: 'kaynak-1', values: { unitCode: 'ADET' } }, list);
    expect(state.rows[0]).toEqual({ key: 'kaynak-1', cells: { unitCode: 'ADET' }, origin: 'source', filled: { unitCode: 'ADET' } });
    state = gridReducer(state, { type: 'edit', key: 'kaynak-1', code: 'unitCode', value: 'KOLI' }, list);
    expect(state.rows[0]).toEqual({ key: 'kaynak-1', cells: { unitCode: 'KOLI' }, origin: 'source', filled: { unitCode: 'ADET' } });
  });
});
