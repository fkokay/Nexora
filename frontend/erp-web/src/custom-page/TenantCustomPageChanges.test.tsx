import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const G1 = '11111111-1111-1111-1111-111111111111';
const G2 = '22222222-2222-2222-2222-222222222222';
const G3 = '44444444-4444-4444-4444-444444444444';
const M1 = '55555555-5555-5555-5555-555555555555';

type Param = { name: string; in: string; type: string; required?: boolean };
const op = (name: string, label: string, kind: 'read' | 'write', pageKind: string, method: string, route: string, parameters: Param[],
  extra: Record<string, unknown> = {}) => ({
  name, label, module: 'Stok', kind, pageKind, method, route,
  parameters: parameters.map((parameter) => ({ required: false, items: null, ...parameter })),
  result: { shape: kind === 'read' && extra.record !== true ? 'list' : 'record', rowsPath: null,
    columns: [{ code: 'id', label: 'Kimlik', dataType: 'guid' }, { code: 'name', label: 'Ad', dataType: 'text' }], flatten: [], metaPaths: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true, routeVariants: [], bodyMap: null, ...extra,
});
const operations = [
  op('stok.kart.olustur', 'Stok kartı oluştur', 'write', 'insert', 'POST', '/api/stock/items', [{ name: 'name', in: 'body', type: 'text' }, { name: 'customFields', in: 'body', type: 'map' }]),
  op('stok.kart.liste', 'Stok kartları', 'read', 'read', 'GET', '/api/stock/items', []),
  op('stok.kart.getir', 'Stok kartı', 'read', 'read', 'GET', '/api/stock/items/{id}', [{ name: 'id', in: 'route', type: 'guid', required: true }], { record: true }),
  op('stok.kart.guncelle', 'Stok kartı güncelle', 'write', 'update', 'PUT', '/api/stock/items/{id}',
    [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'name', in: 'body', type: 'text' }], { sourceOperation: 'stok.kart.getir' }),
  op('stok.hareket.liste', 'Hareketler', 'read', 'read', 'GET', '/api/stock/movements', []),
  op('stok.hareket.ters', 'Hareketi ters kaydet', 'write', 'insert', 'POST', '/api/stock/movements/{id}/reverse', [{ name: 'id', in: 'route', type: 'guid', required: true }]),
  op('stok.ozelAlan.tanimlar', 'Özel alan tanımları', 'read', 'read', 'GET', '/api/stock/custom-fields', []),
];
const q = (id: string, name: string, kind: string, operation: string, parameters: [string, string, string][] = [], runOn = 'manual') =>
  ({ id, name, kind, runOn, operation, parameters: parameters.map(([pname, binding, type]) => ({ name: pname, binding, type })) });
const liste = q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load');
const kart = q('qk', 'kart', 'read', 'stok.kart.getir', [['id', '{{liste.seciliSatir.id}}', 'guid']], 'load');
const guncelle = q('qg', 'guncelle', 'update', 'stok.kart.guncelle', [['id', '{{liste.seciliSatir.id}}', 'guid'], ['name', '{{ad.value}}', 'text']]);
const olustur = q('qo', 'olustur', 'insert', 'stok.kart.olustur', [['name', '{{ad.value}}', 'text']]);
const adInput = { id: 'in-ad', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad', defaultValue: '{{kart.rows[0].name}}' } };
const listeTable = { id: 't', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Kartlar', columns: ['name'] } };
const card = (extra: Record<string, unknown> = {}) => ({ id: 'fc', type: 'formCard', props: { title: 'Kart', inputs: ['in-ad'], recordKey: '{{kart.rows[0].id}}', ...extra } });

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];

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
    if (endpoint === '/api/stock/items' && method === 'GET') return [{ id: G2, name: 'Var olan' }, { id: G3, name: 'Diğer' }];
    if (endpoint === `/api/stock/items/${G2}` && method === 'GET') return { id: G2, name: 'Var olan', rowVersion: 'v1' };
    if (endpoint === `/api/stock/items/${G3}` && method === 'GET') return { id: G3, name: 'Diğer', rowVersion: 'w1' };
    if (endpoint === '/api/stock/movements') return [{ id: M1, name: 'Giriş' }];
    if (endpoint === '/api/stock/custom-fields') return [{ code: 'RENK', label: 'Renk', dataType: 'Text', isRequired: false }];
    if (endpoint === '/api/stock/items' && method === 'POST') return { id: G1 };
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
// Izgaranın sütun seçici ve filtreleri de sütun etiketini taşır; sayfa girişi ızgara dışında aranır.
const pageField = (label: string) => screen.getAllByLabelText(label).find((element) => !element.closest('.advanced-grid'))!;
const type = (label: string, value: string) => fireEvent.change(pageField(label), { target: { value } });
const adValue = () => (pageField('Ad') as HTMLInputElement).value;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const cardRow = (index: number) => document.querySelectorAll<HTMLElement>('[data-testid="kartlar"] tbody tr, .tenant-page-data-grid tbody tr')[index];
const selectCard = async (index: number, expected: string) => {
  fireEvent.click(cardRow(index));
  await waitFor(() => expect(adValue()).toBe(expected));
};

beforeEach(() => { calls = []; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Değişiklik izleme', () => {
  it('recordKey change resets owned inputs', async () => {
    setup([adInput, card(), listeTable, { id: 'bar', type: 'actionBar', props: { saveQuery: 'qg' } }], [liste, kart, guncelle]);
    await screen.findByText('Var olan');
    await selectCard(0, 'Var olan');
    type('Ad', 'Değişti');
    await selectCard(1, 'Diğer');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await settle();
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ url: `/api/stock/items/${G3}`, method: 'PUT', body: `{"id":"${G3}","name":"Diğer","rowVersion":"w1"}` });
  });

  it('trackChanges shows change count', async () => {
    setup([adInput, card({ trackChanges: true }), listeTable], [liste, kart]);
    await screen.findByText('Var olan');
    await selectCard(0, 'Var olan');
    expect(screen.queryByText('1 değişiklik')).toBeNull();
    type('Ad', 'Değişti');
    expect(screen.getByText('1 değişiklik')).toBeTruthy();
    type('Ad', 'Var olan');
    expect(screen.queryByText('1 değişiklik')).toBeNull();
  });

  it('dirty form confirms row change', async () => {
    setup([adInput, card({ trackChanges: true }), listeTable], [liste, kart]);
    await screen.findByText('Var olan');
    await selectCard(0, 'Var olan');
    type('Ad', 'Değişti');
    fireEvent.click(cardRow(1));
    let confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Kayıt değiştirilsin mi?')).toBeTruthy();
    expect(within(confirm).getByText('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));
    await settle();
    expect(cardRow(0).getAttribute('aria-current')).toBe('true');
    expect(cardRow(1).getAttribute('aria-current')).toBeNull();
    expect(adValue()).toBe('Değişti');
    expect(calls.some((call) => call.url === `/api/stock/items/${G3}`)).toBe(false);
    fireEvent.click(cardRow(1));
    confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Devam' }));
    await waitFor(() => expect(adValue()).toBe('Diğer'));
    expect(cardRow(1).getAttribute('aria-current')).toBe('true');
  });

  it('refresh-driven selection clear does not confirm', async () => {
    setup([adInput, card({ trackChanges: true }), listeTable, { id: 'bar', type: 'actionBar', props: {} }], [liste, kart]);
    await screen.findByText('Var olan');
    await selectCard(0, 'Var olan');
    type('Ad', 'Değişti');
    fireEvent.click(command('refresh'));
    await waitFor(() => expect(calls.filter((call) => call.url === '/api/stock/items')).toHaveLength(2));
    await waitFor(() => expect(cardRow(0).getAttribute('aria-current')).toBeNull());
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('row click in a non-record table does not confirm', async () => {
    const ters = q('qt', 'ters', 'insert', 'stok.hareket.ters', [['id', '{{hareketler.seciliSatir.id}}', 'guid']]);
    setup([adInput, card({ trackChanges: true }), listeTable,
      { id: 'th', type: 'dataTable', name: 'hareketler', props: { query: 'qhl', title: 'Hareketler', columns: ['name'], rowActions: ['tb'] } },
      { id: 'tb', type: 'button', props: { text: 'Ters kayıt', actionType: 'query', queryId: 'qt' } }],
    [liste, kart, q('qhl', 'hareketListe', 'read', 'stok.hareket.liste', [], 'load'), ters]);
    await screen.findByText('Giriş');
    await selectCard(0, 'Var olan');
    type('Ad', 'Değişti');
    fireEvent.click(screen.getByRole('button', { name: 'Ters kayıt' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].url).toBe(`/api/stock/movements/${M1}/reverse`);
    expect(screen.queryByText('Kayıt değiştirilsin mi?')).toBeNull();
    // Hareket satırına tıklamak da sormaz.
    fireEvent.click(screen.getByText('Giriş'));
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(adValue()).toBe('Değişti');
  });

  it('record row change clears save-path sonuc', async () => {
    setup([adInput, card(), listeTable, { id: 'h', type: 'heading', props: { title: 'Kart: {{olustur.sonuc.id}}' } },
      { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [liste, kart, olustur]);
    await screen.findByText('Var olan');
    await ready('save');
    type('Ad', 'Kalem');
    fireEvent.click(command('save'));
    await waitFor(() => expect(screen.getByRole('heading', { name: `Kart: ${G1}` })).toBeTruthy());
    fireEvent.click(cardRow(0));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Kart:' })).toBeTruthy());
  });

  it('Yeni over dirty page confirms and resets grids, blocks and sonuc', async () => {
    const olusturCf = q('qo', 'olustur', 'insert', 'stok.kart.olustur', [['name', '{{ad.value}}', 'text'], ['customFields', '{{ozel.degerler}}', 'map']]);
    setup([{ ...adInput, props: { inputType: 'text', label: 'Ad' } }, { id: 'h', type: 'heading', props: { title: 'Kart: {{olustur.sonuc.id}}' } },
      { id: 'g', type: 'editableGrid', name: 'izleme', props: { title: 'Lotlar', gridMode: 'list', gridColumns: ['trackingCode|Lot|text'] } },
      { id: 'cf', type: 'customFieldsBlock', name: 'ozel', props: { title: 'Özel', definitionsQuery: 'qtd' } },
      { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo', newInputs: ['in-ad'] } }],
    [q('qtd', 'tanimlar', 'read', 'stok.ozelAlan.tanimlar', [], 'load'), olusturCf]);
    await screen.findByLabelText('Renk');
    await ready('save');
    type('Ad', 'Kalem');
    fireEvent.click(command('save'));
    await waitFor(() => expect(screen.getByRole('heading', { name: `Kart: ${G1}` })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    type('Lot (satır 1)', 'L1');
    type('Renk', 'Mavi');
    await ready('new');
    fireEvent.click(command('new'));
    let confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Yeni kayıt')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));
    await settle();
    expect((screen.getByLabelText('Lot (satır 1)') as HTMLInputElement).value).toBe('L1');
    fireEvent.click(command('new'));
    confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Devam' }));
    await waitFor(() => expect(screen.queryByLabelText('Lot (satır 1)')).toBeNull());
    expect((screen.getByLabelText('Renk') as HTMLInputElement).value).toBe('');
    expect(adValue()).toBe('');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Kart:' })).toBeTruthy());
  });

  it('dirty dialog close confirms', async () => {
    setup([{ id: 'g', type: 'editableGrid', name: 'izleme', props: { title: 'Lotlar', gridMode: 'list', gridColumns: ['trackingCode|Lot|text'] } },
      { id: 'ac', type: 'button', props: { text: 'Hareketler', actionType: 'openDialog', dialogId: 'd1' } },
      { id: 'd1', type: 'dialog', props: { title: 'Hareket ekle', contains: ['g'] } }], []);
    fireEvent.click(await screen.findByRole('button', { name: 'Hareketler' }));
    let dialog = await screen.findByRole('dialog');
    // Temiz pencere sormadan kapanır.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Hareketler' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Satır ekle' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kapat' }));
    let confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Pencere kapatılsın mı?')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));
    await settle();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Lot (satır 1)'), { key: 'Escape' });
    confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Hareketler' }));
    await screen.findByRole('dialog');
    expect(screen.queryByLabelText('Lot (satır 1)')).toBeNull();
  });
});
