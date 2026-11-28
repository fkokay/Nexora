import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { commandReason } from '../action-bar/commandReason';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const G1 = '11111111-1111-1111-1111-111111111111';
const G2 = '22222222-2222-2222-2222-222222222222';

const op = (name: string, label: string, kind: 'read' | 'write', pageKind: string, method: string, route: string,
  parameters: { name: string; in: string; type: string; required?: boolean }[], extra: Record<string, unknown> = {}) => ({
  name, label, module: 'Stok', kind, pageKind, method, route, parameters: parameters.map((parameter) => ({ required: false, ...parameter })),
  result: kind === 'read' && extra.record !== true
    ? { shape: 'list', rowsPath: null, columns: [{ code: 'id', label: 'Kimlik', dataType: 'guid' }, { code: 'name', label: 'Ad', dataType: 'text' }], flatten: [], metaPaths: [] }
    : { shape: 'record', rowsPath: null, columns: [{ code: 'id', label: 'Kimlik', dataType: 'guid' }, { code: 'name', label: 'Ad', dataType: 'text' }], flatten: [], metaPaths: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true, routeVariants: [], bodyMap: null, ...extra,
});
const operations = [
  op('stok.kart.olustur', 'Stok kartı oluştur', 'write', 'insert', 'POST', '/api/stock/items', [{ name: 'name', in: 'body', type: 'text' }]),
  op('stok.birim.ekle', 'Stok kartına birim ekle', 'write', 'insert', 'POST', '/api/stock/items/{itemId}/units',
    [{ name: 'itemId', in: 'route', type: 'guid', required: true }, { name: 'unitCode', in: 'body', type: 'text' }]),
  op('stok.kart.liste', 'Stok kartları', 'read', 'read', 'GET', '/api/stock/items', []),
  op('stok.kart.getir', 'Stok kartı', 'read', 'read', 'GET', '/api/stock/items/{id}', [{ name: 'id', in: 'route', type: 'guid', required: true }], { record: true }),
  op('stok.kart.guncelle', 'Stok kartı güncelle', 'write', 'update', 'PUT', '/api/stock/items/{id}',
    [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'name', in: 'body', type: 'text' }], { sourceOperation: 'stok.kart.getir' }),
  op('stok.ozet', 'Özet', 'read', 'read', 'GET', '/api/stock/summary', []),
  op('stok.hareket.ekle', 'Stok hareketi ekle', 'write', 'insert', 'POST', '/api/stock/movements', [{ name: 'quantity', in: 'body', type: 'decimal' }]),
  op('stok.hareket.ters', 'Hareketi ters kaydet', 'write', 'insert', 'POST', '/api/stock/movements/{id}/reverse',
    [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'reason', in: 'body', type: 'text' }]),
  op('stok.kart.sil', 'Stok kartı sil', 'write', 'delete', 'DELETE', '/api/stock/items/{id}', [{ name: 'id', in: 'route', type: 'guid', required: true }], { allowed: false }),
  op('stok.bakiye.sayfa', 'Bakiye', 'read', 'read', 'GET', '/api/stock/balances', [{ name: 'belowMinimumOnly', in: 'query', type: 'bool' }], {
    result: { shape: 'list', rowsPath: 'items', columns: [{ code: 'id', label: 'Kimlik', dataType: 'guid' }], flatten: [],
      metaPaths: ['totalCount', 'belowMinimumCount', 'pageValuationAmountBase', 'pageUnitCode'] },
  }),
];

const q = (id: string, name: string, kind: string, operation: string, parameters: [string, string, string][] = [], runOn = 'manual') =>
  ({ id, name, kind, runOn, operation, parameters: parameters.map(([pname, binding, type]) => ({ name: pname, binding, type })) });
const olustur = q('qo', 'olustur', 'insert', 'stok.kart.olustur', [['name', '{{ad.value}}', 'text']]);
const birimOnceki = q('qb', 'birimEkle', 'insert', 'stok.birim.ekle', [['itemId', '{{onceki.sonuc.id}}', 'guid'], ['unitCode', '{{birim.value}}', 'text']]);
const birimNamed = q('qb', 'birimEkle', 'insert', 'stok.birim.ekle', [['itemId', '{{olustur.sonuc.id}}', 'guid'], ['unitCode', '{{birim.value}}', 'text']]);
const hareket = q('qh', 'hareketEkle', 'insert', 'stok.hareket.ekle', [['quantity', '{{miktar.value}}', 'decimal']]);
const adInput = { id: 'in-ad', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad' } };
const birimInput = { id: 'in-birim', type: 'input', name: 'birim', props: { inputType: 'text', label: 'Birim' } };
const miktarInput = { id: 'in-miktar', type: 'input', name: 'miktar', props: { inputType: 'number', label: 'Miktar' } };

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let failUnits = 0;

function setup(components: unknown[], queries: unknown[]) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint.endsWith('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (endpoint === '/api/stock/items' && method === 'GET') return [{ id: G2, name: 'Var olan' }];
    if (endpoint === `/api/stock/items/${G2}` && method === 'GET') return { id: G2, name: 'Var olan', rowVersion: `v${calls.length}` };
    if (endpoint === '/api/stock/summary') return [{ id: G1, name: 'özet' }];
    if (endpoint.startsWith('/api/stock/balances')) return { items: [], totalCount: 0, belowMinimumCount: 3, pageValuationAmountBase: 1234.5, pageUnitCode: null };
    if (endpoint === '/api/stock/items' && method === 'POST') return { id: G1 };
    if (endpoint.endsWith('/units')) {
      if (failUnits > 0) { failUnits -= 1; throw Object.assign(new Error('Birim kodu geçersiz'), { status: 400, serverError: 'Birim kodu geçersiz' }); }
      return { id: 'u1' };
    }
    return { id: 'x1' };
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'));
const writes = () => calls.filter((call) => call.method !== 'GET');
const pageStatus = () => document.querySelector('.tenant-custom-page-content > .tenant-page-action-status')?.textContent;
const ctrlS = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 's', ctrlKey: true });
// Izgaranın sütun seçici ve filtreleri de sütun etiketini taşır; sayfa girişi ızgara dışında aranır.
const pageField = (label: string) => screen.getAllByLabelText(label).find((element) => !element.closest('.advanced-grid'))!;
const type = (label: string, value: string) => fireEvent.change(pageField(label), { target: { value } });

beforeEach(() => { calls = []; failUnits = 0; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Kayıt dizisi', () => {
  it('actionBar sequence runs steps in order with onceki', async () => {
    setup([adInput, birimInput, { id: 'bar', type: 'actionBar', props: { saveSequence: ['qo', 'qb'] } }], [olustur, birimOnceki]);
    await ready('save');
    type('Ad', 'Kalem');
    type('Birim', 'KUTU');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (2 işlem)'));
    expect(writes()).toEqual([
      { url: '/api/stock/items', method: 'POST', body: '{"name":"Kalem"}' },
      { url: `/api/stock/items/${G1}/units`, method: 'POST', body: '{"unitCode":"KUTU"}' },
    ]);
  });

  it('sequenceWhen skips create on edit', async () => {
    const guncelle = q('qg', 'guncelle', 'update', 'stok.kart.guncelle', [['id', '{{liste.seciliSatir.id}}', 'guid'], ['name', '{{ad.value}}', 'text']]);
    setup([
      adInput,
      { id: 't', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Kartlar', columns: ['name'] } },
      { id: 'bar', type: 'actionBar', props: { saveSequence: ['qo', 'qg'], sequenceWhen: ['qo=liste.seciliSatir.id == null', 'qg=liste.seciliSatir.id != null'] } },
    ], [q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load'), q('qk', 'kart', 'read', 'stok.kart.getir', [['id', '{{liste.seciliSatir.id}}', 'guid']], 'load'), olustur, guncelle]);
    await screen.findByText('Var olan');
    await ready('save');
    type('Ad', 'Yeni');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (1 işlem)'));
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual(['POST /api/stock/items']);
    calls = [];
    fireEvent.click(document.querySelector('.tenant-page-data-grid tbody tr')!);
    await waitFor(() => expect(calls.some((call) => call.url === `/api/stock/items/${G2}`)).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/stock/items/${G2}` });
  });

  it('persisted sonuc skips create on second save', async () => {
    failUnits = 1;
    setup([adInput, birimInput, { id: 'bar', type: 'actionBar', props: { saveSequence: ['qo', 'qb'], sequenceWhen: ['qo=olustur.sonuc.id == null'] } }], [olustur, birimNamed]);
    await ready('save');
    type('Ad', 'Kalem');
    type('Birim', 'KUTU');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('Stok kartına birim ekle başarısız: Birim kodu geçersiz. Önceki 1 işlem kaydedildi; kalan adımlar çalıştırılmadı.'));
    expect(document.querySelector('.tenant-page-action-status.is-warning')).not.toBeNull();
    calls = [];
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (1 işlem)'));
    expect(writes()).toEqual([{ url: `/api/stock/items/${G1}/units`, method: 'POST', body: '{"unitCode":"KUTU"}' }]);
  });

  it('full success clears sequence sonuc; partial failure keeps it', async () => {
    failUnits = 1;
    setup([
      adInput, birimInput, { id: 'h', type: 'heading', props: { title: 'Kart: {{olustur.sonuc.id}}' } },
      { id: 'bar', type: 'actionBar', props: { saveSequence: ['qo', 'qb'], sequenceWhen: ['qo=olustur.sonuc.id == null'] } },
    ], [olustur, birimNamed]);
    await ready('save');
    type('Ad', 'Kalem');
    fireEvent.click(command('save'));
    await waitFor(() => expect(screen.getByRole('heading', { name: `Kart: ${G1}` })).toBeTruthy());
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (1 işlem)'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Kart:' })).toBeTruthy());
    // Sonraki kayıt yeni kart oluşturur.
    calls = [];
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes().map((call) => call.url)).toEqual(['/api/stock/items', `/api/stock/items/${G1}/units`]));
  });

  it('partial failure reruns only source reads and refreshQueries', async () => {
    failUnits = 1;
    const guncelle = q('qg', 'guncelle', 'update', 'stok.kart.guncelle', [['id', '{{liste.seciliSatir.id}}', 'guid'], ['name', '{{ad.value}}', 'text']]);
    const birimEdit = q('qb', 'birimEkle', 'insert', 'stok.birim.ekle', [['itemId', '{{liste.seciliSatir.id}}', 'guid'], ['unitCode', '{{birim.value}}', 'text']]);
    setup([
      adInput, birimInput,
      { id: 't', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Kartlar', columns: ['name'] } },
      { id: 'sb', type: 'button', props: { text: 'Kartı kaydet', actionType: 'sequence', saveSequence: ['qg', 'qb'], refreshQueries: ['qs'] } },
    ], [
      q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load'), q('qk', 'kart', 'read', 'stok.kart.getir', [['id', '{{liste.seciliSatir.id}}', 'guid']], 'load'),
      q('qs', 'ozet', 'read', 'stok.ozet', [], 'manual'), guncelle, birimEdit,
    ]);
    await screen.findByText('Var olan');
    const row = () => document.querySelector<HTMLElement>('.tenant-page-data-grid tbody tr')!;
    fireEvent.click(row());
    await waitFor(() => expect(calls.filter((call) => call.method === 'GET' && call.url === `/api/stock/items/${G2}`)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    type('Birim', 'KUTU');
    const listReads = () => calls.filter((call) => call.method === 'GET' && call.url === '/api/stock/items').length;
    const before = listReads();
    fireEvent.click(screen.getByRole('button', { name: 'Kartı kaydet' }));
    await waitFor(() => expect(document.querySelector('.tenant-page-action-feedback.is-warning')?.textContent)
      .toBe('Stok kartına birim ekle başarısız: Birim kodu geçersiz. Önceki 1 işlem kaydedildi; kalan adımlar çalıştırılmadı.'));
    await waitFor(() => expect(calls.filter((call) => call.method === 'GET' && call.url === `/api/stock/items/${G2}`)).toHaveLength(2));
    await waitFor(() => expect(calls.filter((call) => call.url === '/api/stock/summary')).toHaveLength(1));
    expect(listReads()).toBe(before);
    expect(row().getAttribute('aria-current')).toBe('true');
  });
});

describe('Pencere', () => {
  const dialogButton = { id: 'ac', type: 'button', props: { text: 'Hareketler', actionType: 'openDialog', dialogId: 'd1' } };
  const dialog = (props: Record<string, unknown> = {}) => ({ id: 'd1', type: 'dialog', name: 'hareketPenceresi', props: { title: 'Hareket ekle', contains: ['in-miktar'], saveQuery: 'qh', ...props } });

  it('ctrl+s in dialog runs dialog save only', async () => {
    setup([adInput, miktarInput, dialogButton, dialog(), { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [olustur, hareket]);
    await ready('save');
    // Pencere kapalıyken sahiplendiği giriş çizilmez.
    expect(screen.queryByLabelText('Miktar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hareketler' }));
    const opened = await screen.findByRole('dialog', { name: 'Hareket ekle' });
    expect(document.activeElement).toBe(within(opened).getByLabelText('Miktar'));
    type('Miktar', '5');
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ url: '/api/stock/movements', method: 'POST', body: '{"quantity":5}' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toMatchObject({ url: '/api/stock/items', method: 'POST' });
  });

  it('ctrl+s with a save-less dialog open does not run page save', async () => {
    setup([adInput, miktarInput, dialogButton, dialog({ saveQuery: undefined }), { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [olustur, hareket]);
    await ready('save');
    fireEvent.click(screen.getByRole('button', { name: 'Hareketler' }));
    await screen.findByRole('dialog', { name: 'Hareket ekle' });
    ctrlS();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('dialog').querySelector('.tenant-page-dialog-footer button')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(1));
  });

  it('open dialog from moreButtons', async () => {
    setup([miktarInput, dialogButton, dialog(), { id: 'bar', type: 'actionBar', props: { moreButtons: ['ac'] } }], [hareket]);
    await screen.findByRole('toolbar', { name: 'İşlemler çubuğu' });
    await waitFor(() => expect(command('more')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Hareketler' })).toBeNull();
    fireEvent.click(command('more'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Hareketler/ }));
    expect(await screen.findByRole('dialog', { name: 'Hareket ekle' })).toBeTruthy();
  });

  it('sequence button in moreButtons runs the sequence', async () => {
    setup([adInput, birimInput, { id: 'sb', type: 'button', props: { text: 'Kart ve birim', actionType: 'sequence', saveSequence: ['qo', 'qb'] } },
      { id: 'bar', type: 'actionBar', props: { moreButtons: ['sb'] } }], [olustur, birimOnceki]);
    await waitFor(() => expect(command('more')).toBeTruthy());
    type('Ad', 'Kalem');
    fireEvent.click(command('more'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Kart ve birim/ }));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (2 işlem)'));
    expect(writes().map((call) => call.url)).toEqual(['/api/stock/items', `/api/stock/items/${G1}/units`]);
  });

  it('dialog resetOnOpen clears owned inputs', async () => {
    setup([miktarInput, { id: 'fc', type: 'formCard', props: { title: 'Hareket', inputs: ['in-miktar'] } }, dialogButton,
      dialog({ contains: ['fc'] })], [hareket]);
    fireEvent.click(await screen.findByRole('button', { name: 'Hareketler' }));
    await screen.findByRole('dialog');
    type('Miktar', '7');
    expect((screen.getByLabelText('Miktar') as HTMLInputElement).value).toBe('7');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hareketler' }));
    await screen.findByRole('dialog');
    expect((screen.getByLabelText('Miktar') as HTMLInputElement).value).toBe('');
  });

  it('closed dialog inputs are not validated', async () => {
    const required = { ...miktarInput, props: { ...miktarInput.props, required: true } };
    const both = q('qo', 'olustur', 'insert', 'stok.kart.olustur', [['name', '{{ad.value}}', 'text'], ['quantity', '{{miktar.value}}', 'decimal']]);
    setup([adInput, required, dialogButton, dialog(), { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [both, hareket]);
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(pageStatus()).not.toBe('Formda düzeltilmesi gereken alanlar var.');
    // Açık pencerenin girişi doğrulanır.
    calls = [];
    fireEvent.click(screen.getByRole('button', { name: 'Hareketler' }));
    await screen.findByRole('dialog');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Bu alan zorunludur.')).toBeTruthy());
    expect(writes()).toHaveLength(0);
  });
});

describe('İstem ve onay', () => {
  const ters = q('qt', 'ters', 'insert', 'stok.hareket.ters', [['id', '{{hareketler.seciliSatir.id}}', 'guid'], ['reason', '{{tersBtn.yanit}}', 'text']]);
  const page = () => setup([
    { id: 't', type: 'dataTable', name: 'hareketler', props: { query: 'ql', title: 'Hareketler', columns: ['name'], rowActions: ['tb'] } },
    { id: 'tb', type: 'button', name: 'tersBtn', props: { text: 'Ters kayıt', actionType: 'query', queryId: 'qt', promptLabel: 'Gerekçe', promptRequired: true, confirmEnabled: true, confirmText: 'Emin misiniz?' } },
  ], [q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load'), ters]);

  it('prompt answer binds as yanit and cancel sends nothing', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Ters kayıt' }));
    let prompt = await screen.findByRole('alertdialog');
    expect(within(prompt).getByText('Gerekçe')).toBeTruthy();
    fireEvent.click(within(prompt).getByRole('button', { name: 'Vazgeç' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ters kayıt' }));
    prompt = await screen.findByRole('alertdialog');
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Yanlış depo' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Ters kayıt' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    // İstem bir onaydır: confirmEnabled varken ayrıca onay sorulmaz.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writes()[0]).toEqual({ url: `/api/stock/movements/${G2}/reverse`, method: 'POST', body: '{"reason":"Yanlış depo"}' });
  });

  const listReads = () => calls.filter((call) => call.method === 'GET' && call.url === '/api/stock/items').length;
  const answer = async (button: string, text: string) => {
    fireEvent.click(await screen.findByRole('button', { name: button }));
    const prompt = await screen.findByRole('alertdialog');
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: text } });
    fireEvent.click(within(prompt).getByRole('button', { name: button }));
  };

  it('row action prompted write refreshes only refreshQueries', async () => {
    page();
    await screen.findByText('Var olan');
    const before = listReads();
    await answer('Ters kayıt', 'Yanlış depo');
    await waitFor(() => expect(writes()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listReads()).toBe(before);
  });

  it('prompted button without refreshQueries reruns load queries', async () => {
    const not = q('qn', 'notEkle', 'insert', 'stok.hareket.ekle', [['quantity', '{{notBtn.yanit}}', 'decimal']]);
    setup([
      { id: 't', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Kartlar', columns: ['name'] } },
      { id: 'nb', type: 'button', name: 'notBtn', props: { text: 'Not ekle', actionType: 'query', queryId: 'qn', promptLabel: 'Miktar notu' } },
    ], [q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load'), not]);
    await screen.findByText('Var olan');
    const before = listReads();
    await answer('Not ekle', '3');
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() => expect(listReads()).toBe(before + 1));
  });

  it('sequence button with confirm asks once', async () => {
    setup([adInput, birimInput,
      { id: 'sb', type: 'button', props: { text: 'Kart ve birim', actionType: 'sequence', saveSequence: ['qo', 'qb'], confirmEnabled: true, confirmText: 'Kart ve birim kaydedilsin mi?' } }],
    [olustur, birimOnceki]);
    fireEvent.click(await screen.findByRole('button', { name: 'Kart ve birim' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Kart ve birim kaydedilsin mi?')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(document.querySelector('.tenant-page-action-feedback.is-success')?.textContent).toBe('İşlem tamamlandı. (2 işlem)'));
  });
});

describe('Yeni ve kayıt tablosu seçimi', () => {
  it('yeni clears record table selection so the sequence creates', async () => {
    const guncelle = q('qg', 'guncelle', 'update', 'stok.kart.guncelle', [['id', '{{kart.rows[0].id}}', 'guid'], ['name', '{{ad.value}}', 'text']]);
    setup([
      adInput,
      { id: 't', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Kartlar', columns: ['name'] } },
      { id: 'kartKarti', type: 'formCard', props: { title: 'Kart', inputs: ['in-ad'], recordKey: '{{kart.rows[0].id}}' } },
      { id: 'bar', type: 'actionBar', props: { newInputs: ['in-ad'], saveSequence: ['qo', 'qg'], sequenceWhen: ['qo=kart.rows[0].id == null', 'qg=kart.rows[0].id != null'] } },
    ], [q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load'), q('qk', 'kart', 'read', 'stok.kart.getir', [['id', '{{liste.seciliSatir.id}}', 'guid']], 'load'), olustur, guncelle]);
    fireEvent.click(await screen.findByText('Var olan'));
    await waitFor(() => expect(calls.some((call) => call.url === `/api/stock/items/${G2}`)).toBe(true));
    const row = () => document.querySelector('.tenant-page-data-grid tbody tr')!;
    await waitFor(() => expect(row().getAttribute('aria-current')).toBe('true'));
    await ready('new');
    fireEvent.click(command('new'));
    await waitFor(() => expect(row().getAttribute('aria-current')).toBeNull());
    // Yeni seçime bağlı kart okumasını hemen boşaltır: hemen yazılan değer sonradan sıfırlanmaz, hemen kaydetmek de oluşturur.
    type('Ad', 'Yeni kart');
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()).toEqual([{ url: '/api/stock/items', method: 'POST', body: '{"name":"Yeni kart"}' }]);
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });
});

describe('Bağlı gösterge', () => {
  const bakiye = q('qbk', 'bakiye', 'read', 'stok.bakiye.sayfa', [['belowMinimumOnly', '{{minimumAlti.value}}', 'bool']], 'load');
  const metric = (props: Record<string, unknown>) => ({ id: `m-${String(props.title).length}`, type: 'metric', props });
  const card = (title: string) => screen.getByText(title).closest('.tenant-page-metric') as HTMLElement;

  it('bound metric value is formatted as money', async () => {
    setup([metric({ title: 'Stok değeri', value: '{{bakiye.meta.pageValuationAmountBase}}', format: 'money' }),
      metric({ title: 'Minimum altı', value: '{{bakiye.meta.belowMinimumCount}}', format: 'number' })], [bakiye]);
    await waitFor(() => expect(card('Stok değeri').querySelector('strong')?.textContent).toBe('1.234,50'));
    expect(card('Minimum altı').querySelector('strong')?.textContent).toBe('3');
    expect(card('Stok değeri').querySelector('.tenant-report-unbound')).toBeNull();
  });

  it('empty bound metric shows dash', async () => {
    setup([metric({ title: 'Birim', value: '{{bakiye.meta.pageUnitCode}}' })], [bakiye]);
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/stock/balances'))).toBe(true));
    await waitFor(() => expect(card('Birim').querySelector('strong')?.textContent).toBe('—'));
    expect(card('Birim').querySelector('.tenant-report-unbound')).toBeNull();
  });

  it('metric filter toggles checkbox input', async () => {
    const checkbox = { id: 'in-min', type: 'input', name: 'minimumAlti', props: { inputType: 'checkbox', label: 'Minimum altı seçimi' } };
    setup([checkbox, metric({ title: 'Minimum altı', value: '{{bakiye.meta.belowMinimumCount}}', format: 'number', filterInput: 'in-min', filterValue: 'true' })], [bakiye]);
    await waitFor(() => expect(card('Minimum altı').querySelector('strong')?.textContent).toBe('3'));
    const box = screen.getByLabelText('Minimum altı seçimi') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(card('Minimum altı'));
    await waitFor(() => expect(box.checked).toBe(true));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/stock/balances?belowMinimumOnly=true')).toBe(true));
    expect(card('Minimum altı').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(card('Minimum altı'));
    await waitFor(() => expect(box.checked).toBe(false));
  });
});

describe('İşlem yetkisi', () => {
  it('query button and row action disabled when operation not allowed', async () => {
    const sil = q('qs', 'kartSil', 'delete', 'stok.kart.sil', [['id', '{{liste.seciliSatir.id}}', 'guid']]);
    setup([
      { id: 't', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Kartlar', columns: ['name'], rowActions: ['b-row'] } },
      { id: 'b-sil', type: 'button', props: { text: 'Kartı sil', actionType: 'query', queryId: 'qs' } },
      { id: 'b-row', type: 'button', props: { text: 'Kaldır', actionType: 'query', queryId: 'qs' } },
      { id: 'bar', type: 'actionBar', props: { deleteQuery: 'qs' } },
    ], [q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load'), sil]);
    await screen.findByText('Var olan');
    const button = await screen.findByRole('button', { name: 'Kartı sil' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('title')).toBe('Bu işlem için yetkiniz yok');
    const rowAction = screen.getByRole('button', { name: 'Kaldır' });
    expect(rowAction).toHaveProperty('disabled', true);
    expect(rowAction.getAttribute('title')).toBe('Bu işlem için yetkiniz yok');
    fireEvent.click(rowAction);
    fireEvent.click(button);
    fireEvent.click(screen.getByText('Var olan'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(commandReason(command('delete'))).toBe('Bu işlem için yetkiniz yok');
    expect(writes()).toHaveLength(0);
  });
});
