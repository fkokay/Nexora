import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TenantCustomPage from '../TenantCustomPage';
import { KeepAliveViews } from '../WorkspaceComponents';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { setPageParams } from '../pageNavigation';

// Düzenlenebilir tablonun motor eklemeleri gerçek çalışma zamanıyla: başlangıç satırları (E1), seçim doldurması (E2), sunucu
// önizlemesi ve hesaplanan sütun (E3), atlanan satırlar ve sunucu satır hataları.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const D1 = '11111111-1111-1111-1111-111111111111';
const S1 = '22222222-2222-2222-2222-222222222221';
const S2 = '22222222-2222-2222-2222-222222222222';
const T = { timeout: 8000 };
const op = (name: string, kind: string, pageKind: string, method: string, route: string, parameters: unknown[], result: Record<string, unknown>) => ({
  name, label: name, module: 'Test', kind, pageKind, method, route, parameters,
  result: { shape: 'list', rowsPath: null, columns: [], flatten: [], metaPaths: [], ...result }, sourceOperation: null, fixedBody: null,
  since: '2026-11-22', deprecated: false, allowed: true, routeVariants: [], bodyMap: null,
});
const lineItems = [{ code: 'stockItemId', label: 'Stok', dataType: 'guid', required: true }, { code: 'quantity', label: 'Miktar', dataType: 'decimal', required: true },
  { code: 'unitPrice', label: 'Fiyat', dataType: 'decimal', required: false }];
const operations = [
  op('t.kalem.liste', 'read', 'read', 'GET', '/api/doc/{docId}/lines', [{ name: 'docId', in: 'route', type: 'guid', required: true }], { rowsPath: 'lines' }),
  op('t.stok.liste', 'read', 'read', 'GET', '/api/stocks', [], {}),
  op('t.onizle', 'read', 'read', 'POST', '/api/doc/preview', [{ name: 'lines', in: 'body', type: 'list', required: true,
    items: [...lineItems, { code: 'rowKey', label: 'Satır', dataType: 'text', required: false }] }], { rowsPath: 'lines', metaPaths: ['grandTotal'] }),
  op('t.kaydet', 'write', 'insert', 'POST', '/api/doc', [{ name: 'requestId', in: 'body', type: 'text', required: true },
    { name: 'lines', in: 'body', type: 'list', required: true, items: lineItems }], { shape: 'record' }),
];

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let linesResponse: () => Promise<unknown>;
let previewResponse: (body: Record<string, unknown>) => Promise<unknown>;
let saveResponse: () => Promise<unknown>;

const definition = (gridProps: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  components: [
    { id: 'rid', type: 'input', name: 'rid', props: { inputType: 'text', autoId: true, hidden: true } },
    { id: 'g', type: 'editableGrid', name: 'kalemler', props: {
      gridMode: 'list', title: 'Kalemler', maxRows: 300, fillQuery: 'qLines', fillColumns: { 'stockItemId@label': 'stockName', quantity: 'remaining' },
      skipWhenZero: 'quantity', lookupFills: { stockItemId: { unitPrice: 'salesPrice' } },
      gridColumns: ['stockItemId|Stok|lookup:qStock:id:code:name|required', 'quantity|Miktar|number|min:0', 'unitPrice|Fiyat|number|min:0', 'lineTotal|Tutar|calc:qPrev:lineTotal'],
      ...gridProps } },
    { id: 'toplam', type: 'text', props: { text: 'Genel toplam: {{onizleme.meta.grandTotal}}' } },
    { id: 'kaydet', type: 'button', name: 'kaydet', props: { text: 'Kaydet', actionType: 'query', queryId: 'qSave' } },
  ],
  queries: [
    { id: 'qLines', name: 'kalemKaynak', kind: 'read', runOn: 'load', operation: 't.kalem.liste', parameters: [{ name: 'docId', binding: '{{sayfa.parametre.docId}}', type: 'guid' }] },
    { id: 'qStock', name: 'stoklar', kind: 'read', runOn: 'load', operation: 't.stok.liste', parameters: [] },
    { id: 'qPrev', name: 'onizleme', kind: 'read', runOn: ['kalemler'], runDebounceMs: 150, operation: 't.onizle',
      parameters: [{ name: 'lines', binding: '{{kalemler.satirlar}}', type: 'list' }] },
    { id: 'qSave', name: 'kaydetSorgu', kind: 'insert', runOn: 'manual', operation: 't.kaydet',
      parameters: [{ name: 'requestId', binding: '{{rid.value}}', type: 'text' }, { name: 'lines', binding: '{{kalemler.satirlar}}', type: 'list' }] },
  ],
});

function setup(gridProps: Record<string, unknown> = {}) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint.endsWith('/published')) {
      return { id: 'p', code: 'p', name: 'Belge', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify(definition(gridProps)) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url: endpoint, method, body });
    if (endpoint === `/api/doc/${D1}/lines`) return linesResponse();
    if (endpoint === '/api/stocks') return [{ id: S1, code: 'STK-1', name: 'Koli', salesPrice: 12.5 }, { id: S2, code: 'STK-2', name: 'Bant', salesPrice: 3 }];
    if (endpoint === '/api/doc/preview') return previewResponse(body!);
    if (endpoint === '/api/doc' && method === 'POST') return saveResponse();
    throw new Error(`unexpected ${method} ${endpoint}`);
  });
  return render(<CommandProvider><KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews><ConfirmDialogHost /></CommandProvider>);
}

/** Önizleme yanıtı: satırlar ters sırada döner (eşleme dizinle değil anahtarla yapılmalı). */
const echoPreview = (body: Record<string, unknown>) => {
  const lines = (body.lines as Record<string, unknown>[]).map((line) => ({ rowKey: line.rowKey, lineTotal: Number(line.quantity) * Number(line.unitPrice ?? 0) }));
  return Promise.resolve({ lines: [...lines].reverse(), grandTotal: lines.reduce((sum, line) => sum + line.lineTotal, 0) });
};
const previews = () => calls.filter((call) => call.url === '/api/doc/preview');
const saves = () => calls.filter((call) => call.url === '/api/doc');
const cell = (key: string, code: string) => document.getElementById(`page-grid-kalemler-${key}-${code}`) as HTMLInputElement;
const calc = (row: number) => screen.getByLabelText(`Tutar (satır ${row})`).textContent;
const type = (element: HTMLInputElement, value: string) => fireEvent.change(element, { target: { value } });

beforeEach(() => {
  calls = [];
  linesResponse = () => Promise.resolve({ lines: [{ stockItemId: S1, stockName: 'Koli', remaining: 2, unitPrice: 10 }, { stockItemId: S2, stockName: 'Bant', remaining: 0, unitPrice: 3 }] });
  previewResponse = echoPreview;
  saveResponse = () => Promise.resolve({ id: 'new' });
  api.mockReset();
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  setPageParams('custom-page:p', {});
});

describe('editableGrid engine: initial rows, lookup fill, server preview', { timeout: 30000 }, () => {
  it('loads editable rows from the source query, previews by row key and saves only the user inputs', async () => {
    setPageParams('custom-page:p', { docId: D1 });
    setup();
    await waitFor(() => expect(cell('dolu-1', 'quantity')?.value).toBe('2'), T);
    expect(cell('dolu-2', 'quantity').value).toBe('0');
    expect(cell('dolu-1', 'unitPrice').value).toBe('10');
    expect((screen.getByLabelText('Stok (satır 1)') as HTMLInputElement).value).toContain('Koli');
    // Satır 2 (miktar 0) atlanır: önizlemeye ve kayda gitmez; önizleme yanıtı anahtarla eşlenir.
    await waitFor(() => expect(calc(1)).toBe('20,00'), T);
    expect(calc(2)).toBe('—');
    expect(previews()[0].body).toEqual({ lines: [{ stockItemId: S1, quantity: 2, unitPrice: 10, rowKey: 'dolu-1' }] });
    expect(screen.getByText('Genel toplam: 20')).toBeTruthy();

    type(cell('dolu-2', 'quantity'), '4');
    await waitFor(() => expect(calc(2)).toBe('12,00'), T);
    expect(calc(1)).toBe('20,00');
    expect(screen.getByText('Genel toplam: 32')).toBeTruthy();
    expect(previews().at(-1)!.body!.lines).toEqual([
      { stockItemId: S1, quantity: 2, unitPrice: 10, rowKey: 'dolu-1' }, { stockItemId: S2, quantity: 4, unitPrice: 3, rowKey: 'dolu-2' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(saves()).toHaveLength(1), T);
    const body = saves()[0].body!;
    expect(body.lines).toEqual([{ stockItemId: S1, quantity: 2, unitPrice: 10 }, { stockItemId: S2, quantity: 4, unitPrice: 3 }]);
    expect(typeof body.requestId).toBe('string');
    // Kayıttan sonra tablo son yüklenen satırlara döner.
    await waitFor(() => expect(cell('dolu-2', 'quantity').value).toBe('0'), T);
  });

  it('a pending or failed preview never blocks save; invalid rows skip the preview', async () => {
    setPageParams('custom-page:p', { docId: D1 });
    previewResponse = () => Promise.reject(Object.assign(new Error('Önizleme hatası'), { status: 400 }));
    setup();
    await waitFor(() => expect(previews()).toHaveLength(1), T);
    await waitFor(() => expect(screen.getByText('Genel toplam:')).toBeTruthy(), T);
    expect(calc(1)).toBe('—');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(saves()).toHaveLength(1), T);
    // Geçersiz satır (negatif miktar) önizlemeyi çalıştırmaz.
    previewResponse = echoPreview;
    const before = previews().length;
    type(cell('dolu-1', 'quantity'), '-1');
    await new Promise((done) => setTimeout(done, 400));
    expect(previews()).toHaveLength(before);
    type(cell('dolu-1', 'quantity'), '3');
    await waitFor(() => expect(calc(1)).toBe('30,00'), T);
  });

  it('a preview that never answers keeps "—" and does not block save', async () => {
    setPageParams('custom-page:p', { docId: D1 });
    previewResponse = () => new Promise(() => {});
    setup();
    await waitFor(() => expect(previews()).toHaveLength(1), T);
    expect(calc(1)).toBe('—');
    expect(screen.getByText('Genel toplam:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(saves()).toHaveLength(1), T);
    expect(saves()[0].body!.lines).toEqual([{ stockItemId: S1, quantity: 2, unitPrice: 10 }]);
  });

  it('blocks save while the initial rows are loading and shows server line errors on the sent row', async () => {
    setPageParams('custom-page:p', { docId: D1 });
    let release: (value: unknown) => void = () => {};
    linesResponse = () => new Promise((done) => { release = done; });
    setup();
    await waitFor(() => expect(calls.some((call) => call.url.endsWith('/lines'))).toBe(true), T);
    fireEvent.click(await screen.findByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.getByText('Kaynak kayıt yükleniyor; biraz sonra yeniden deneyin.')).toBeTruthy(), T);
    expect(saves()).toHaveLength(0);
    release({ lines: [{ stockItemId: S1, stockName: 'Koli', remaining: 0 }, { stockItemId: S2, stockName: 'Bant', remaining: 5, unitPrice: 3 }] });
    await waitFor(() => expect(cell('dolu-2', 'quantity')?.value).toBe('5'), T);
    saveResponse = () => Promise.reject(Object.assign(new Error('Doğrulama'), { status: 400, fieldErrors: { 'Lines[0].Quantity': ['Stok yetersiz.'] } }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(saves()).toHaveLength(1), T);
    // Gönderilen 0. satır tablonun 2. satırıdır (1. satır miktarı 0 olduğu için atlandı).
    const row2 = cell('dolu-2', 'quantity').closest('td')!;
    await waitFor(() => expect(row2.textContent).toContain('Stok yetersiz.'), T);
    expect(cell('dolu-1', 'quantity').closest('td')!.textContent).not.toContain('Stok yetersiz.');
  });

  it('a user choice in the lookup fills empty or previously filled cells, never typed ones', async () => {
    setup();
    // Başlangıç satırları sorgusu (parametresiz) boşta kalınca tablo çizilir.
    await waitFor(() => expect(screen.getByText('Henüz satır yok.')).toBeTruthy(), T);
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    await waitFor(() => expect(cell('yeni-1', 'stockItemId')).toBeTruthy(), T);
    fireEvent.click(cell('yeni-1', 'stockItemId'));
    fireEvent.click(await screen.findByRole('option', { name: /^STK-1/ }, T));
    await waitFor(() => expect(cell('yeni-1', 'unitPrice').value).toBe('12.5'), T);
    fireEvent.click(cell('yeni-1', 'stockItemId'));
    fireEvent.click(await screen.findByRole('option', { name: /^STK-2/ }, T));
    await waitFor(() => expect(cell('yeni-1', 'unitPrice').value).toBe('3'), T);
    type(cell('yeni-1', 'unitPrice'), '7');
    fireEvent.click(cell('yeni-1', 'stockItemId'));
    fireEvent.click(await screen.findByRole('option', { name: /^STK-1/ }, T));
    await new Promise((done) => setTimeout(done, 50));
    expect(cell('yeni-1', 'unitPrice').value).toBe('7');
  });
});
