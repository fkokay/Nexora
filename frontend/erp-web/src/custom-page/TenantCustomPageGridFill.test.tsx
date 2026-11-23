import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';

// Genel motor ekleri (listeli tablo): sorgudan doldurma (fillQuery/fillColumns/skipWhenZero), seçimle doldurma (lookupFills) ve
// formül sütunları (formulas). İstek gövdesi ERP işlem kataloğunun liste öğeleriyle süzülür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const O1 = '11111111-1111-1111-1111-111111111111';
const O2 = '22222222-2222-2222-2222-222222222222';
const col = (code: string, dataType = 'text') => ({ code, label: code, dataType });
const operation = (name: string, kind: 'read' | 'write', method: string, route: string, parameters: unknown[], columns: unknown[]) => ({
  name, label: name, module: 'Test', kind, pageKind: kind === 'read' ? 'read' : 'insert', method, route, parameters,
  result: { shape: kind === 'read' ? 'list' : 'record', rowsPath: null, columns, flatten: [], metaPaths: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-22', deprecated: false, allowed: true, routeVariants: [], bodyMap: null,
});
const item = (code: string, dataType = 'decimal') => ({ code, label: code, dataType, required: false });
const operations = [
  operation('test.kalanlar', 'read', 'GET', '/api/orders/{orderId}/remaining', [{ name: 'orderId', in: 'route', type: 'guid', required: true, items: null }],
    [col('lineNumber', 'int'), col('stockItemId', 'guid'), col('stockName'), col('remainingQuantity', 'decimal'), col('unitPrice', 'decimal')]),
  operation('test.stoklar', 'read', 'GET', '/api/stock-options', [], [col('id', 'guid'), col('code'), col('name'), col('purchasePrice', 'decimal')]),
  // lineVat formül sütununun öğesi yok: gönderilmez; lineNet formül sütununun öğesi var: gönderilir.
  operation('test.kabul', 'write', 'POST', '/api/receipts', [{ name: 'lines', in: 'body', type: 'list', required: false,
    items: [item('lineNumber', 'int'), item('stockItemId', 'guid'), item('quantity'), item('unitPrice'), item('lineNet')] }], []),
];
const REMAINING: Record<string, Record<string, unknown>[]> = {
  [O1]: [{ lineNumber: 1, stockItemId: 'S1', stockName: 'Kalem', remainingQuantity: 4, unitPrice: 10 }, { lineNumber: 2, stockItemId: 'S2', stockName: 'Defter', remainingQuantity: 2, unitPrice: 5 }],
  [O2]: [],
};
const STOCKS = [{ id: 'S1', code: 'KLM', name: 'Kalem', purchasePrice: 7.5 }, { id: 'S2', code: 'DFT', name: 'Defter', purchasePrice: 4 },
  { id: 'S3', code: 'SLG', name: 'Silgi', purchasePrice: 2 }];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];

function setup(components: unknown[], queries: unknown[]) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint.endsWith('/published')) {
      return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    const order = /^\/api\/orders\/([^/]+)\/remaining$/.exec(endpoint)?.[1];
    if (order) return REMAINING[order] ?? [];
    if (endpoint === '/api/stock-options') return STOCKS;
    return { id: 'R1' };
  });
  return render(
    <CommandProvider>
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 5000 };
const q = (id: string, kind: string, op: string, parameters: [string, string, string][], runOn: string) =>
  ({ id, name: id, kind, runOn, operation: op, parameters: parameters.map(([name, binding, type]) => ({ name, binding, type })) });
const queries = [
  q('qk', 'read', 'test.kalanlar', [['orderId', '{{siparis.value}}', 'guid']], 'load'),
  q('qs', 'read', 'test.stoklar', [], 'load'),
  q('qy', 'insert', 'test.kabul', [['lines', '{{g.satirlar}}', 'list']], 'manual'),
];
const siparis = { id: 'siparis', type: 'input', name: 'siparis', props: { inputType: 'text', label: 'Sipariş' } };
const grid = { id: 'g', type: 'editableGrid', name: 'g', props: {
  title: 'Kalemler', gridMode: 'list', minRows: 1, totals: ['lineNet', 'lineVat'],
  gridColumns: ['lineNumber|Satır|number|readOnly', 'stockItemId|Stok|lookup:qs:id:code:name|required', 'quantity|Miktar|number|min:0',
    'unitPrice|Fiyat|number', 'lineNet|Net|number', 'lineVat|KDV|number', 'stockName|Stok adı|text|readOnly', 'remainingQuantity|Kalan|number|readOnly'],
  fillQuery: 'qk', fillColumns: { quantity: 'remainingQuantity' }, skipWhenZero: 'quantity',
  lookupFills: { stockItemId: { unitPrice: 'purchasePrice' } },
  formulas: { lineNet: 'quantity * unitPrice', lineVat: 'quantity * unitPrice * 20 / 100' },
} };
const summary = { id: 'ozet', type: 'text', props: { text: 'Satır {{g.satirSayisi}} Net {{g.toplam.lineNet}} KDV {{g.toplam.lineVat}}' } };
const kaydet = { id: 'kaydet', type: 'button', props: { text: 'Kaydet', actionType: 'query', queryId: 'qy' } };

const cell = (key: string, code: string) => document.getElementById(`page-grid-g-${key}-${code}`) as HTMLInputElement | null;
const type = (element: HTMLInputElement, value: string) => fireEvent.change(element, { target: { value } });
const writes = () => calls.filter((call) => call.method !== 'GET');
const fillOrder = async (id: string) => {
  type(await screen.findByLabelText('Sipariş', {}, T) as HTMLInputElement, id);
  await waitFor(() => expect(calls.some((call) => call.url === `/api/orders/${id}/remaining`)).toBe(true), T);
};

beforeEach(() => { calls = []; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('editableGrid fill, lookup fills and formulas', () => {
  it('fills from the query, computes formulas, skips zero rows and sends only list item fields', async () => {
    setup([siparis, grid, summary, kaydet], queries);
    await fillOrder(O1);
    await waitFor(() => expect(cell('dolu-1', 'quantity')?.value).toBe('4'), T);
    expect(cell('dolu-2', 'quantity')!.value).toBe('2');
    // Formül sütunu salt okunurdur ve satırın sayılarından hesaplanır.
    expect(cell('dolu-1', 'lineNet')!.value).toBe('40');
    expect(cell('dolu-1', 'lineNet')!.readOnly).toBe(true);
    expect(cell('dolu-1', 'lineVat')!.value).toBe('8');
    // Salt okunur gösterim sütunları doldurulur ama liste öğesi olmadığından gönderilmez.
    expect(cell('dolu-1', 'stockName')!.value).toBe('Kalem');
    expect(cell('dolu-1', 'remainingQuantity')!.value).toBe('4');
    await screen.findByText('Satır 2 Net 50 KDV 10', {}, T);

    // Sıfır miktarlı satır satirlar / satirSayisi / toplam dışında kalır.
    type(cell('dolu-2', 'quantity')!, '0');
    await screen.findByText('Satır 1 Net 40 KDV 8', {}, T);
    expect(cell('dolu-2', 'lineNet')!.value).toBe('0');

    // Seçimle doldurma: yeni satırda stok seçilince fiyat seçenek satırından yazılır.
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    fireEvent.click(cell('yeni-1', 'stockItemId')!);
    fireEvent.click(await screen.findByRole('option', { name: /SLG/ }, T));
    await waitFor(() => expect(cell('yeni-1', 'unitPrice')!.value).toBe('2'), T);
    type(cell('yeni-1', 'quantity')!, '3');
    await screen.findByText('Satır 2 Net 46 KDV 9.2', {}, T);

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toEqual({ url: '/api/receipts', method: 'POST', body: JSON.stringify({ lines: [
      { lineNumber: 1, stockItemId: 'S1', quantity: 4, unitPrice: 10, lineNet: 40 },
      { stockItemId: 'S3', quantity: 3, unitPrice: 2, lineNet: 6 },
    ] }) });
    // Başarılı kayıt düzenlemeleri atar; tablo doldurma sorgusunun güncel satırlarından yeniden türetilir (sorgu yenilenmediyse aynı satırlar).
    await waitFor(() => expect(cell('yeni-1', 'quantity')).toBeNull(), T);
    expect(cell('dolu-2', 'quantity')!.value).toBe('2');
  });

  it('rowNumberColumn numbers the sent rows 1..n after skipWhenZero, in display order', async () => {
    setup([siparis, { ...grid, props: { ...grid.props, rowNumberColumn: 'lineNumber', formulas: { lineNet: 'quantity * unitPrice', lineVat: 'lineNet * 20 / 100' } } }, summary, kaydet], queries);
    await fillOrder(O1);
    await waitFor(() => expect(cell('dolu-2', 'lineNumber')?.value).toBe('2'), T);
    expect(cell('dolu-1', 'lineNumber')!.readOnly).toBe(true);
    type(cell('dolu-1', 'quantity')!, '0');
    await waitFor(() => expect(cell('dolu-2', 'lineNumber')!.value).toBe('1'), T);
    expect(cell('dolu-1', 'lineNumber')!.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    fireEvent.click(cell('yeni-1', 'stockItemId')!);
    fireEvent.click(await screen.findByRole('option', { name: /SLG/ }, T));
    type(cell('yeni-1', 'quantity')!, '3');
    // Formül zinciri: lineVat yuvarlanmış lineNet'ten hesaplanır.
    await screen.findByText('Satır 2 Net 16 KDV 3.2', {}, T);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(JSON.parse(writes()[0].body!).lines).toEqual([
      { lineNumber: 1, stockItemId: 'S2', quantity: 2, unitPrice: 5, lineNet: 10 },
      { lineNumber: 2, stockItemId: 'S3', quantity: 3, unitPrice: 2, lineNet: 6 },
    ]);
  });

  it('keeps edits on a re-render with the same key, replaces rows on a new key and empties on an empty result', async () => {
    const not = { id: 'not', type: 'input', name: 'not', props: { inputType: 'text', label: 'Not' } };
    setup([siparis, not, grid, summary], queries);
    await fillOrder(O1);
    await waitFor(() => expect(cell('dolu-1', 'quantity')?.value).toBe('4'), T);
    type(cell('dolu-1', 'quantity')!, '1');
    type(screen.getByLabelText('Not') as HTMLInputElement, 'yeniden çiz');
    await screen.findByText('Satır 2 Net 20 KDV 4', {}, T);
    expect(cell('dolu-1', 'quantity')!.value).toBe('1');

    await fillOrder(O2);
    await waitFor(() => expect(cell('dolu-1', 'quantity')).toBeNull(), T);
    expect(screen.getByText('Henüz satır yok.')).toBeTruthy();
    await screen.findByText('Satır 0 Net 0 KDV 0', {}, T);

    // Yeni sonuç (O2 → O1) satırları yeniden doldurur; önceki düzenleme geri gelmez.
    type(screen.getByLabelText('Sipariş') as HTMLInputElement, O1);
    await waitFor(() => expect(cell('dolu-1', 'quantity')?.value).toBe('4'), T);
  });

  it('blocks the save with minRows when every filled row is skipped; skipped rows are not validated', async () => {
    setup([siparis, grid, summary, kaydet], queries);
    await fillOrder(O1);
    await waitFor(() => expect(cell('dolu-1', 'quantity')?.value).toBe('4'), T);
    type(cell('dolu-1', 'quantity')!, '');
    type(cell('dolu-2', 'quantity')!, '0');
    // Atlanan yeni satırın zorunlu stok hücresi hata vermez.
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByText('En az 1 kalem girin.', {}, T);
    expect(document.querySelector('.tenant-page-grid .tenant-page-input-error:not([role])')).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('a filled grid inside a dialog is not dirty until edited and refills when the dialog reopens', async () => {
    setup([siparis, grid, { id: 'ac', type: 'button', props: { text: 'Mal kabul', actionType: 'openDialog', dialogId: 'd1' } },
      { id: 'd1', type: 'dialog', props: { title: 'Mal kabul', contains: ['g'], saveQuery: 'qy' } }], queries);
    await fillOrder(O1);
    fireEvent.click(screen.getByRole('button', { name: 'Mal kabul' }));
    let dialog = await screen.findByRole('dialog', {}, T);
    await waitFor(() => expect(cell('dolu-1', 'quantity')?.value).toBe('4'), T);
    // Dokunulmamış (türetilmiş) tablo kirli değildir: kapatma sormaz.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), T);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mal kabul' }));
    dialog = await screen.findByRole('dialog', {}, T);
    type(cell('dolu-1', 'quantity')!, '1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    // Düzenlenmiş tablo kirlidir: kapatma onay ister; onaylanınca düzenlemeler atılır.
    const confirm = await screen.findByRole('alertdialog', {}, T);
    fireEvent.click(within(confirm).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), T);

    fireEvent.click(screen.getByRole('button', { name: 'Mal kabul' }));
    await screen.findByRole('dialog', {}, T);
    await waitFor(() => expect(cell('dolu-1', 'quantity')?.value).toBe('4'), T);
  });
});
