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
const columns = [{ code: 'id', label: 'Kimlik', dataType: 'guid' }, { code: 'name', label: 'Ad', dataType: 'text' }];

const op = (name: string, kind: 'read' | 'write', pageKind: string, method: string, route: string,
  parameters: { name: string; in: string; type: string; required?: boolean }[], extra: Record<string, unknown> = {}) => ({
  name, label: name, module: 'Stok', kind, pageKind, method, route, parameters: parameters.map((parameter) => ({ required: false, ...parameter })),
  result: { shape: extra.record === true || kind === 'write' ? 'record' : 'list', rowsPath: null, columns, flatten: [], metaPaths: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true, routeVariants: [], bodyMap: null, ...extra,
});
const operations = [
  op('stok.kart.liste', 'read', 'read', 'GET', '/api/stock/items', []),
  op('stok.kart.getir', 'read', 'read', 'GET', '/api/stock/items/{id}', [{ name: 'id', in: 'route', type: 'guid', required: true }], { record: true }),
  op('stok.kart.olustur', 'write', 'insert', 'POST', '/api/stock/items', [{ name: 'name', in: 'body', type: 'text' }]),
  op('stok.kart.guncelle', 'write', 'update', 'PUT', '/api/stock/items/{id}',
    [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'name', in: 'body', type: 'text' }], { sourceOperation: 'stok.kart.getir' }),
  op('stok.birim.ekle', 'write', 'insert', 'POST', '/api/stock/items/{itemId}/units',
    [{ name: 'itemId', in: 'route', type: 'guid', required: true }, { name: 'unitCode', in: 'body', type: 'text' }]),
];

const q = (id: string, name: string, kind: string, operation: string, parameters: [string, string, string][] = [], runOn = 'manual') =>
  ({ id, name, kind, runOn, operation, parameters: parameters.map(([pname, binding, type]) => ({ name: pname, binding, type })) });
const queries = [
  q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load'),
  q('qk', 'kart', 'read', 'stok.kart.getir', [['id', '{{liste.seciliSatir.id}}', 'guid']], 'load'),
  q('qo', 'olustur', 'insert', 'stok.kart.olustur', [['name', '{{ad.value}}', 'text']]),
  q('qg', 'guncelle', 'update', 'stok.kart.guncelle', [['id', '{{kart.rows[0].id}}', 'guid'], ['name', '{{ad.value}}', 'text']]),
  q('qb', 'birimEkleYeni', 'insert', 'stok.birim.ekle', [['itemId', '{{olustur.sonuc.id}}', 'guid'], ['unitCode', '{{birim.value}}', 'text']]),
];

const components = (bar: Record<string, unknown> = { formDialog: 'kartPenceresi', newInputs: ['in-ad'] }) => [
  { id: 'bar', type: 'actionBar', props: bar },
  { id: 't', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Kartlar', columns: ['name'] } },
  { id: 'kartPenceresi', type: 'dialog', name: 'kartPenceresi', props: {
    title: 'Stok kartı', contains: ['sekmeler'], saveSequence: ['qo', 'qg', 'qb'], stopOnError: true, closeOnSave: true, saveLabel: 'Kaydet',
    sequenceWhen: ['qo=kart.rows[0].id == null && olustur.sonuc.id == null', 'qg=kart.rows[0].id != null', 'qb=kart.rows[0].id == null'],
  } },
  { id: 'sekmeler', type: 'tabs', props: { tabs: ['Genel=kimlik', 'Not=notKarti', 'Birim=birimKarti'] } },
  { id: 'kimlik', type: 'formCard', props: { title: 'Kimlik', inputs: ['in-ad'], recordKey: '{{kart.rows[0].id}}', trackChanges: true } },
  { id: 'notKarti', type: 'formCard', props: { title: 'Not', inputs: ['in-not'] } },
  { id: 'birimKarti', type: 'formCard', props: { title: 'Birim', inputs: ['in-birim'] } },
  { id: 'in-ad', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad', defaultValue: '{{kart.rows[0].name}}' } },
  { id: 'in-not', type: 'input', name: 'not', props: { inputType: 'text', label: 'Not' } },
  { id: 'in-birim', type: 'input', name: 'birim', props: { inputType: 'text', label: 'Birim' } },
];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let failUnits = 0;

function setup(list = components()) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint.endsWith('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components: list, queries }),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (endpoint === '/api/stock/items' && method === 'GET') return [{ id: G2, name: 'Var olan' }];
    if (endpoint === `/api/stock/items/${G2}` && method === 'GET') return { id: G2, name: 'Var olan', rowVersion: 'v1' };
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
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const tab = (name: string) => within(screen.getByRole('dialog')).getByRole('tab', { name: new RegExp(`^${name}`) });
const selectRow = async () => {
  fireEvent.click(await screen.findByText('Var olan'));
  await waitFor(() => expect(calls.some((call) => call.url === `/api/stock/items/${G2}`)).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 20));
};
const confirmContinue = async () => {
  const alert = await screen.findByRole('alertdialog');
  expect(alert.textContent).toContain('Kaydedilmemiş değişiklikler kaybolacak');
  fireEvent.click(within(alert).getByRole('button', { name: 'Devam' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
};

beforeEach(() => { calls = []; failUnits = 0; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Kayıt penceresi (formDialog)', () => {
  it('form dialog: yeni opens dialog, resets owned inputs and focuses first new input', async () => {
    setup();
    await selectRow();
    await ready('open');
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: 'Stok kartı' });
    await waitFor(() => expect(input('in-ad').value).toBe('Var olan'));
    fireEvent.click(tab('Birim'));
    type('in-birim', 'KUTU');
    expect(tab('Birim').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(command('new'));
    await waitFor(() => expect(tab('Genel').getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(document.activeElement).toBe(input('in-ad')));
    await waitFor(() => expect(input('in-ad').value).toBe(''));
    expect(input('in-birim').value).toBe('');
    // Yeni seçimi kaldırdı: kayıt yeni kart oluşturur, seçili kartı güncellemez.
    type('in-ad', 'Yeni kart');
    type('in-birim', 'ADET');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()).toEqual([
      { url: '/api/stock/items', method: 'POST', body: '{"name":"Yeni kart"}' },
      { url: `/api/stock/items/${G1}/units`, method: 'POST', body: '{"unitCode":"ADET"}' },
    ]);
  });

  it('yeni opens a closed dialog', async () => {
    setup();
    await ready('new');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(command('new'));
    await screen.findByRole('dialog', { name: 'Stok kartı' });
    await waitFor(() => expect(document.activeElement).toBe(input('in-ad')));
  });

  it('form dialog: aç needs a selection', async () => {
    setup();
    await screen.findByText('Var olan');
    await ready('new');
    expect(command('open').getAttribute('aria-disabled')).toBe('true');
    expect(commandReason(command('open'))).toBe('Önce bir kayıt seçin');
    fireEvent.click(command('open'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('form dialog: aç opens dialog with record values', async () => {
    setup();
    await selectRow();
    await ready('open');
    fireEvent.click(command('open'));
    const dialog = await screen.findByRole('dialog', { name: 'Stok kartı' });
    await waitFor(() => expect(within(dialog).getByLabelText('Ad')).toHaveProperty('value', 'Var olan'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/stock/items/${G2}` });
  });

  it('form dialog: enter on the selected row opens the record and keeps the selection', async () => {
    setup();
    await selectRow();
    await ready('open');
    const row = document.querySelector<HTMLElement>('.tenant-page-data-grid tbody tr')!;
    expect(row.getAttribute('aria-current')).toBe('true');
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    await screen.findByRole('dialog', { name: 'Stok kartı' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(row.getAttribute('aria-current')).toBe('true');
    await waitFor(() => expect(input('in-ad').value).toBe('Var olan'));
    type('in-ad', 'Düzenlendi');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: 'PUT', url: `/api/stock/items/${G2}`, body: expect.stringContaining('"name":"Düzenlendi"') });
  });

  it('form dialog: aç waits while the record read is loading', async () => {
    setup();
    fireEvent.click(await screen.findByText('Var olan'));
    // Seçim yapıldı, kart okuması gecikmede: pencere boş satırlarla (yeni kayıt sanılarak) açılmaz.
    await waitFor(() => expect(commandReason(command('open'))).toBe('Kayıt yükleniyor…'));
    fireEvent.click(command('open'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await ready('open');
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: 'Stok kartı' });
    await waitFor(() => expect(input('in-ad').value).toBe('Var olan'));
    expect(writes()).toHaveLength(0);
  });

  it('form dialog: F2 inside open dialog confirms when dirty', async () => {
    setup();
    await selectRow();
    await ready('open');
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: 'Stok kartı' });
    await waitFor(() => expect(input('in-ad').value).toBe('Var olan'));
    type('in-ad', 'Değişti');
    input('in-ad').focus();
    fireEvent.keyDown(input('in-ad'), { key: 'F2' });
    await confirmContinue();
    await waitFor(() => expect(input('in-ad').value).toBe(''));
    expect(screen.getByRole('dialog', { name: 'Stok kartı' })).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it('yeni after partial failure clears dialog save results', async () => {
    failUnits = 1;
    setup();
    await ready('new');
    fireEvent.click(command('new'));
    await screen.findByRole('dialog', { name: 'Stok kartı' });
    type('in-ad', 'Kalem');
    type('in-birim', 'KUTU');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kaydet' })).toHaveProperty('disabled', false));
    calls = [];
    fireEvent.click(command('new'));
    await confirmContinue();
    await waitFor(() => expect(input('in-ad').value).toBe(''));
    type('in-ad', 'Defter');
    type('in-birim', 'ADET');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()).toEqual([
      { url: '/api/stock/items', method: 'POST', body: '{"name":"Defter"}' },
      { url: `/api/stock/items/${G1}/units`, method: 'POST', body: '{"unitCode":"ADET"}' },
    ]);
  });

  it('no form dialog: open stays unbound and yeni keeps the inline behaviour', async () => {
    setup(components({ newInputs: ['in-ad'] }));
    await ready('new');
    expect(commandReason(command('open'))).toBe('Bu sayfada bağlanmadı');
    fireEvent.click(command('new'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
