import { describe, expect, it } from 'vitest';
import type { ErpOperation } from './erpOperations';
import { CALC_EMPTY, calcText, previewRows, previewScopeState, readPreviewTrigger, withRowKeys } from './previewQueries';
import type { PageQueryDefinition, QueryState } from './usePageQueries';

const op = (extra: Partial<ErpOperation> = {}): ErpOperation => ({
  name: 'satis.fatura.onizle', label: 'Önizle', module: 'Satış', kind: 'read', pageKind: 'read', method: 'POST', route: '/api/sales/invoices/preview',
  parameters: [
    { name: 'customerId', in: 'body', type: 'guid', required: true },
    { name: 'lines', in: 'body', type: 'list', required: true, items: [
      { code: 'stockItemId', label: 'Stok', dataType: 'guid', required: true }, { code: 'rowKey', label: 'Satır', dataType: 'text', required: false }] },
  ],
  result: { shape: 'list', rowsPath: 'lines', columns: [], metaPaths: ['grandTotal'] }, sourceOperation: null, fixedBody: null, since: '1', deprecated: false, allowed: true,
  ...extra,
});
const query: PageQueryDefinition = { id: 'onizleme', name: 'onizleme', runOn: 'manual', kind: 'read', operation: 'satis.fatura.onizle',
  parameters: [{ name: 'customerId', binding: '{{musteri.value}}', type: 'guid' }, { name: 'lines', binding: '{{kalemler.satirlar}}', type: 'list' }] };
const state = (rows: Record<string, unknown>[]): QueryState => ({ rows, rowCount: rows.length, columns: [], truncated: false, loading: false, error: '', ran: true });

describe('readPreviewTrigger', () => {
  it('reads runOn names and a bounded debounce', () => {
    expect(readPreviewTrigger({ runOn: 'load' })).toBeNull();
    expect(readPreviewTrigger({ runOn: ['kalemler', 'musteri', 'kalemler', 'bad name', 3] })).toEqual({ watch: ['kalemler', 'musteri'], debounceMs: 400 });
    expect(readPreviewTrigger({ runOn: [], runDebounceMs: 150 })).toEqual({ watch: [], debounceMs: 150 });
    expect(readPreviewTrigger({ runOn: ['a'], runDebounceMs: 100 })?.debounceMs).toBe(400);
    expect(readPreviewTrigger({ runOn: ['a'], runDebounceMs: 3001 })?.debounceMs).toBe(400);
  });
});

describe('withRowKeys', () => {
  const rows = [{ key: 'kaynak-1', row: { stockItemId: 's1' } }, { key: 'yeni-3', row: { stockItemId: 's2' } }];
  it('adds the draft key to each row of a list parameter whose items declare rowKey', () => {
    const values = withRowKeys(op(), query, { customerId: 'c1', lines: [{ stockItemId: 's1' }, { stockItemId: 's2' }] },
      (path) => (path === 'kalemler.satirlar' ? rows : null));
    expect(values).toEqual({ customerId: 'c1', lines: [{ stockItemId: 's1', rowKey: 'kaynak-1' }, { stockItemId: 's2', rowKey: 'yeni-3' }] });
  });
  it('sends nothing extra when the operation does not declare rowKey', () => {
    const plain = op({ parameters: [{ name: 'lines', in: 'body', type: 'list', required: true, items: [{ code: 'stockItemId', label: 'Stok', dataType: 'guid', required: true }] }] });
    const values = { lines: [{ stockItemId: 's1' }] };
    expect(withRowKeys(plain, query, values, () => rows)).toBe(values);
    expect(withRowKeys(undefined, query, values, () => rows)).toBe(values);
  });
});

describe('previewRows and calcText', () => {
  it('matches result rows by rowKey, never by index', () => {
    const result = [{ rowKey: 'yeni-3', lineTotal: 1200.5 }, { rowKey: 'kaynak-1', lineTotal: 0, tax: { amount: 7 } }];
    const rows = previewRows(op(), state(result));
    expect(calcText(rows, 'kaynak-1', 'lineTotal')).toBe('0,00');
    expect(calcText(rows, 'yeni-3', 'lineTotal')).toBe('1.200,50');
    expect(calcText(rows, 'kaynak-1', 'tax.amount')).toBe('7,00');
    expect(calcText(rows, 'yeni-9', 'lineTotal')).toBe(CALC_EMPTY);
    expect(calcText(rows, 'yeni-3', 'missing')).toBe(CALC_EMPTY);
  });
  it('reads the rowsPath array of a record result', () => {
    const record = op({ result: { shape: 'record', rowsPath: 'lines', columns: [] } });
    expect(previewRows(record, state([{ grandTotal: 5, lines: [{ rowKey: 'a', lineTotal: 1 }] }]))).toEqual([{ rowKey: 'a', lineTotal: 1 }]);
    expect(previewRows(record, state([{ grandTotal: 5 }]))).toEqual([]);
    expect(previewRows(undefined, state([{ rowKey: 'a' }]))).toEqual([]);
  });
});

describe('previewScopeState', () => {
  const result = { ...state([{ rowKey: 'a' }]), meta: { grandTotal: 10 } };
  it('hides a stale, pending or failed result', () => {
    expect(previewScopeState(undefined)).toMatchObject({ rows: [], eskidi: true });
    expect(previewScopeState({ result, ranKey: 'k1', wantKey: 'k1', pending: false })).toMatchObject({ rows: [{ rowKey: 'a' }], meta: { grandTotal: 10 }, eskidi: false });
    expect(previewScopeState({ result, ranKey: 'k1', wantKey: 'k2', pending: true })).toMatchObject({ rows: [], loading: true, eskidi: true });
    expect(previewScopeState({ result: { ...result, error: 'x' }, ranKey: 'k1', wantKey: 'k1', pending: false })).toMatchObject({ rows: [], error: 'x', eskidi: true });
    expect(previewScopeState({ result, ranKey: 'k1', wantKey: 'k1', pending: false }).meta).toEqual({ grandTotal: 10 });
  });
});
