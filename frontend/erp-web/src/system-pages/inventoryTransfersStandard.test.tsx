import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { ActionBarSlotProvider } from '../action-bar/ActionBarSlot';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import catalog from './inventoryTransfersOperations.fixture.json';

// Depolar arası transferler standart tanımı (inventory-transfers.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `inventoryTransfersOperations.fixture.json` ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };

// Vitest runs from frontend/erp-web.
const standardPath = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-transfers.json');
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { screenKey: string; title: string; version: number; definition: Definition };

const KEY = 'inventory-transfers';
const W0 = 'aaaaaaaa-0000-0000-0000-000000000000';
const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const W2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const L1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const L2 = 'bbbbbbbb-0000-0000-0000-000000000002';
const L9 = 'bbbbbbbb-0000-0000-0000-000000000009';
const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';
const S3 = '11111111-0000-0000-0000-000000000003';
const T1 = 'cccccccc-0000-0000-0000-000000000001';
const T2 = 'cccccccc-0000-0000-0000-000000000002';
const TRANSFERS = '/api/warehouses/transfers';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;
const warehouse = (id: string, code: string, name: string, isActive = true) => ({ id, code, name, isActive, rowVersion: `rv-${code}` });
const location = (id: string, warehouseId: string, code: string, name: string, isActive = true) =>
  ({ id, warehouseId, code, name, parentLocationId: null, isActive, rowVersion: `rv-${code}` });
const card = (id: string, code: string, name: string, isActive = true) => ({ id, code, name, barcode: null, unitCode: 'ADET', category: null, minimumStock: 0, isActive,
  createdAt: '2026-01-01T00:00:00Z', rowVersion: `rv-${code}` });
const summary = (id: string, code: string, status: 'Posted' | 'Voided') => ({ id, code, fromWarehouseId: W1, fromWarehouseName: 'Merkez', toWarehouseId: W2,
  toWarehouseName: 'Şube', transferDate: '2026-11-02', status, lineCount: 1, createdAt: '2026-11-02T08:00:00Z' });

const cards = [card(S1, 'KLM', 'Kalem'), card(S2, 'DFT', 'Defter'), card(S3, 'ESK', 'Eski kart', false)];
const units: Record<string, unknown> = {
  [S1]: { baseUnitCode: 'ADET', conversions: [{ id: 'u1', unitCode: 'KOLI', factorToBase: 12, isActive: true }, { id: 'u2', unitCode: 'PALET', factorToBase: 480, isActive: false }] },
  [S2]: { baseUnitCode: 'ADET', conversions: [{ id: 'u3', unitCode: 'PAKET', factorToBase: 10, isActive: true }] },
};

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
/** Sonraki oluşturma isteklerinin hatası (sırayla tüketilir). */
let createFailures: string[] = [];

const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/warehouses') return [warehouse(W0, 'ESK', 'Eski depo', false), warehouse(W1, 'MRK', 'Merkez'), warehouse(W2, 'SUB', 'Şube')];
    if (path === `/api/warehouses/${W1}/locations`) return [location(L1, W1, 'A-01', 'Raf 1'), location(L9, W1, 'X-09', 'Kapalı raf', false)];
    if (path === `/api/warehouses/${W2}/locations`) return [location(L2, W2, 'B-01', 'Raf B')];
    if (path === TRANSFERS) return { items: [summary(T1, 'TR-1', 'Posted'), summary(T2, 'TR-2', 'Voided')], page: 1, pageSize: 50, totalCount: 2 };
    if (path === `${TRANSFERS}/${T1}`) {
      return { transfer: summary(T1, 'TR-1', 'Posted'), lines: [{ stockItemId: S1, code: 'KLM', name: 'Kalem', unitCode: 'ADET', quantity: 24, enteredQuantity: 2,
        enteredUnitCode: 'KOLI', fromStorageLocationId: L1, fromStorageLocationCode: 'A-01', fromStorageLocationName: 'Raf 1', toStorageLocationId: null,
        toStorageLocationCode: null, toStorageLocationName: null, displayQuantity: 2, displayUnitCode: 'KOLI' }] };
    }
    if (path === '/api/stock/items') {
      const q = (query(url).get('q') ?? '').toLocaleLowerCase('tr');
      const items = cards.filter((item) => !q || item.code.toLocaleLowerCase('tr').includes(q) || item.name.toLocaleLowerCase('tr').includes(q));
      return { items, page: 1, pageSize: 50, totalCount: items.length };
    }
    const unit = /^\/api\/stock\/items\/([^/]+)\/units$/.exec(path);
    if (unit && units[unit[1]]) return units[unit[1]];
  } else if (method === 'POST') {
    if (path === TRANSFERS) {
      const failure = createFailures.shift();
      if (failure) throw Object.assign(new Error(failure), { status: 409, serverError: failure });
      return { ...summary('cccccccc-0000-0000-0000-000000000009', 'TR-9', 'Posted') };
    }
    if (path === `${TRANSFERS}/${T1}/void`) return { id: T1, code: 'TR-1', status: 'Voided' };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === '/api/system-pages/inventory-transfers/published') {
      return {
        id: 'sp', code: '@inventory-transfers', name: standard.title, description: null, revision: 1, forms: [],
        rights: { view: true, insert: true, update: true, delete: false }, screenKey: KEY, source: 'standard', standardVersion: 1,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: catalog.operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBarSlotProvider breadcrumb={<nav aria-label="Konum">Ana Sayfa › Depolar arası transferler</nav>}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      </ActionBarSlotProvider>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const settle = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const writes = () => calls.filter((call) => call.method !== 'GET');
const creates = () => writes().filter((call) => call.url === TRANSFERS);
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const cellInput = (row: number, code: string) => document.getElementById(`page-grid-kalemler-yeni-${row}-${code}`) as HTMLInputElement;
const listRow = async (code: string) => {
  await screen.findByText(code, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
  return screen.getAllByRole('row').find((row) => row.querySelector('td') && within(row).queryByText(code)) as HTMLElement;
};
const optionTexts = () => within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
/** Arama kutusunu (giriş ya da ızgara hücresi) açar, isteğe bağlı arar ve metni `option` ile başlayan seçeneği seçer. */
const pick = async (element: HTMLInputElement, option: string, search?: string) => {
  fireEvent.click(element);
  if (search !== undefined) fireEvent.change(element, { target: { value: search } });
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`) }, T));
};
const newDialog = () => screen.getByRole('dialog', { name: 'Depolar arası transfer' });
const openNew = async () => {
  await listRow('TR-1');
  await waitFor(() => expect(command('new').getAttribute('aria-disabled')).not.toBe('true'), T);
  fireEvent.click(command('new'));
  await screen.findByRole('dialog', { name: 'Depolar arası transfer' }, T);
  // Kaynak depo ilk etkin depoyla açılır (pasif "Eski depo" seçenek dışı).
  await waitFor(() => expect(input('kaynakDepo').value).toBe('Merkez'), T);
};
const save = () => fireEvent.click(within(newDialog()).getByRole('button', { name: 'Transferi kaydet' }));
/** Hedef depo, bir stok satırı (KLM, 2 KOLI, kaynak konum A-01). */
const fillOneLine = async () => {
  await pick(input('hedefDepo'), 'Şube');
  fireEvent.click(within(newDialog()).getByRole('button', { name: 'Kalem ekle' }));
  const row = Number(/yeni-(\d+)-/.exec(newDialog().querySelector('tbody tr:last-child input')!.id)![1]);
  await pick(cellInput(row, 'stockItemId'), 'KLM', 'kal');
  await waitFor(() => expect(cellInput(row, 'stockItemId').value).toBe('KLM · Kalem'), T);
  await pick(cellInput(row, 'unitCode'), 'KOLI');
  fireEvent.change(cellInput(row, 'quantity'), { target: { value: '2' } });
  await pick(cellInput(row, 'fromStorageLocationId'), 'A-01');
  return row;
};
const requestIdOf = (call: Call) => (JSON.parse(call.body!) as { requestId: string }).requestId;

beforeEach(() => {
  calls = []; createFailures = []; api.mockReset();
  localStorage.clear();
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Depolar arası transferler standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect([...new Set(standard.definition.queries.map((item) => item.operation))].sort()).toEqual([...names].sort());
    expect(standard.version).toBe(1);
  });

  it('lists transfers 50 per page with status labels; void is offered only on posted rows', async () => {
    setup();
    const posted = await listRow('TR-1');
    expect(query(gets(TRANSFERS)[0].url).get('page')).toBe('1');
    expect(query(gets(TRANSFERS)[0].url).get('pageSize')).toBe('50');
    const headers = [...document.querySelectorAll('.tenant-page-data-grid th')].map((th) => th.textContent?.trim());
    for (const label of ['Transfer kodu', 'Tarih', 'Kaynak depo', 'Hedef depo', 'Stok kalemi', 'Durum']) expect(headers).toContain(label);
    expect(posted.textContent).toContain('Merkez');
    expect(posted.textContent).toContain('Şube');
    expect(within(posted).getByText('Kaydedildi').className).toContain('tone-success');
    const voided = await listRow('TR-2');
    expect(within(voided).getByText('İptal edildi').className).toContain('tone-info');
    expect(within(posted).getByRole('button', { name: 'Transferi iptal et' })).toBeTruthy();
    expect(within(voided).queryByRole('button', { name: 'Transferi iptal et' })).toBeNull();
    expect(within(voided).getByRole('button', { name: 'Kalemler' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.list-v2-count')?.textContent).toContain('2'), T);
    // Nothing is read for the new-transfer dialog's line pickers until a line asks for it.
    expect(calls.filter((call) => /\/units$/.test(call.url.split('?')[0]))).toEqual([]);
  });

  it('Kalemler opens the read-only lines dialog of the row', async () => {
    setup();
    fireEvent.click(within(await listRow('TR-1')).getByRole('button', { name: 'Kalemler' }));
    const dialog = await screen.findByRole('dialog', { name: 'TR-1 · Merkez → Şube' }, T);
    await within(dialog).findByText('KLM', { selector: 'td, td *' }, T);
    expect(gets(`${TRANSFERS}/${T1}`)).toHaveLength(1);
    expect(within(dialog).getByText('Kaynak ve hedef hareketler tek transfer kaydına bağlıdır.')).toBeTruthy();
    const line = within(dialog).getAllByRole('row').find((row) => row.querySelector('td'))!;
    expect(line.textContent).toContain('2 KOLI');
    expect(line.textContent).toContain('24 ADET');
    expect(line.textContent).toContain('A-01 Raf 1');
    expect(within(dialog).queryByRole('button', { name: /Kaydet/ })).toBeNull();
  });

  it('a new transfer uses picker cells with row-scoped units and posts the legacy body', async () => {
    setup();
    await openNew();
    const dialog = newDialog();
    expect(input('transferTarihi').value).toBe(today());
    expect(input('istekKimligi')).toBeNull();
    // The target depot hides passive depots and the source depot.
    fireEvent.click(input('hedefDepo'));
    expect(optionTexts()).toEqual(['ŞubeSUB']);
    fireEvent.blur(input('hedefDepo'));
    await pick(input('hedefDepo'), 'Şube');
    expect(within(dialog).getByText(/Kalem: 0 \/ 100/)).toBeTruthy();

    // Row 1: server search for the stock card (passive cards hidden), units of that card only.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kalem ekle' }));
    fireEvent.click(cellInput(1, 'stockItemId'));
    fireEvent.change(cellInput(1, 'stockItemId'), { target: { value: 'k' } });
    await waitFor(() => expect(gets('/api/stock/items').some((call) => query(call.url).get('q') === 'k')).toBe(true), T);
    await waitFor(() => expect(optionTexts()).toEqual(['KLMKalem']), T);
    fireEvent.click(screen.getByRole('option', { name: /^KLM/ }));
    await waitFor(() => expect(cellInput(1, 'stockItemId').value).toBe('KLM · Kalem'), T);
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/units`)).toHaveLength(1), T);
    // The unit cell starts on the static base-unit option and lists only the card's active conversions.
    expect(cellInput(1, 'unitCode').value).toBe('Ana birim');
    fireEvent.click(cellInput(1, 'unitCode'));
    await waitFor(() => expect(optionTexts()).toEqual(['Ana birim', 'KOLI']), T);
    fireEvent.click(screen.getByRole('option', { name: 'KOLI' }));
    fireEvent.change(cellInput(1, 'quantity'), { target: { value: '2' } });
    fireEvent.click(cellInput(1, 'fromStorageLocationId'));
    await waitFor(() => expect(optionTexts()).toEqual(['A-01Raf 1']), T);
    fireEvent.click(screen.getByRole('option', { name: /^A-01/ }));
    fireEvent.click(cellInput(1, 'toStorageLocationId'));
    await waitFor(() => expect(optionTexts()).toEqual(['B-01Raf B']), T);
    fireEvent.blur(cellInput(1, 'toStorageLocationId'));
    // Typing in a location cell filters its options on the client: the stock search is not re-run. (Closing the stock cell
    // cleared its search; that debounced re-read settles first.)
    await settle(400);
    const stockSearches = gets('/api/stock/items').length;
    fireEvent.click(cellInput(1, 'toStorageLocationId'));
    fireEvent.change(cellInput(1, 'toStorageLocationId'), { target: { value: 'zz' } });
    await screen.findByText('Sonuç bulunamadı.', {}, T);
    await settle(400);
    expect(gets('/api/stock/items')).toHaveLength(stockSearches);
    fireEvent.blur(cellInput(1, 'toStorageLocationId'));
    expect(cellInput(1, 'toStorageLocationId').value).toBe('');

    // Row 2: another card; its unit options come from its own units read, the first row keeps its labels.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kalem ekle' }));
    await pick(cellInput(2, 'stockItemId'), 'DFT', 'def');
    await waitFor(() => expect(gets(`/api/stock/items/${S2}/units`)).toHaveLength(1), T);
    fireEvent.click(cellInput(2, 'unitCode'));
    await waitFor(() => expect(optionTexts()).toEqual(['Ana birim', 'PAKET']), T);
    fireEvent.blur(cellInput(2, 'unitCode'));
    fireEvent.change(cellInput(2, 'quantity'), { target: { value: '1' } });
    expect(cellInput(1, 'stockItemId').value).toBe('KLM · Kalem');
    expect(cellInput(1, 'unitCode').value).toBe('KOLI');
    expect(cellInput(1, 'fromStorageLocationId').value).toBe('A-01 · Raf 1');
    expect(within(dialog).getByText(/Kalem: 2 \/ 100/)).toBeTruthy();
    // Each card's units are read once.
    expect(gets(`/api/stock/items/${S1}/units`)).toHaveLength(1);

    save();
    await waitFor(() => expect(creates()).toHaveLength(1), T);
    const body = JSON.parse(creates()[0].body!);
    expect(body).toEqual({
      requestId: expect.stringMatching(GUID), fromWarehouseId: W1, toWarehouseId: W2, transferDate: today(),
      lines: [{ stockItemId: S1, unitCode: 'KOLI', quantity: 2, fromStorageLocationId: L1 }, { stockItemId: S2, quantity: 1 }],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Depolar arası transfer' })).toBeNull(), T);
    await waitFor(() => expect(gets(TRANSFERS).length).toBeGreaterThan(1), T);
  });

  it('changing a depot clears that side\'s location in every line', async () => {
    setup();
    await openNew();
    await fillOneLine();
    await pick(cellInput(1, 'toStorageLocationId'), 'B-01');
    expect(cellInput(1, 'toStorageLocationId').value).toBe('B-01 · Raf B');
    // Source → Şube: source locations are cleared; target locations stay (target depot unchanged).
    await pick(input('kaynakDepo'), 'Şube');
    await waitFor(() => expect(cellInput(1, 'fromStorageLocationId').value).toBe(''), T);
    expect(cellInput(1, 'toStorageLocationId').value).toBe('B-01 · Raf B');
    expect(cellInput(1, 'stockItemId').value).toBe('KLM · Kalem');
    // The target still renders the hidden (now equal to source) depot; picking Merkez clears target locations.
    expect(input('hedefDepo').value).toBe('Şube');
    await pick(input('hedefDepo'), 'Merkez');
    await waitFor(() => expect(cellInput(1, 'toStorageLocationId').value).toBe(''), T);
  });

  it('an empty grid is blocked by minRows; nothing is posted', async () => {
    setup();
    await openNew();
    await pick(input('hedefDepo'), 'Şube');
    save();
    await within(newDialog()).findByText('En az 1 kalem girin.', {}, T);
    await settle(100);
    expect(creates()).toEqual([]);
  });

  it('a retry after a failed save sends the same requestId; a successful save starts a new one', async () => {
    setup();
    await openNew();
    await fillOneLine();
    createFailures = ['Geçici hata'];
    save();
    await within(newDialog()).findByText(/Geçici hata/, {}, T);
    expect(creates()).toHaveLength(1);
    // The dialog stays open; the retry is the same request.
    save();
    await waitFor(() => expect(creates()).toHaveLength(2), T);
    expect(requestIdOf(creates()[1])).toBe(requestIdOf(creates()[0]));
    expect(JSON.parse(creates()[1].body!)).toEqual(JSON.parse(creates()[0].body!));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Depolar arası transfer' })).toBeNull(), T);

    // The next transfer gets a new id.
    await openNew();
    await fillOneLine();
    save();
    await waitFor(() => expect(creates()).toHaveLength(3), T);
    expect(requestIdOf(creates()[2])).toMatch(GUID);
    expect(requestIdOf(creates()[2])).not.toBe(requestIdOf(creates()[0]));
  });

  it('reopening the dialog after a failed save starts a new request', async () => {
    setup();
    await openNew();
    await fillOneLine();
    createFailures = ['Geçici hata'];
    save();
    await within(newDialog()).findByText(/Geçici hata/, {}, T);
    fireEvent.click(within(newDialog()).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, T)).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Depolar arası transfer' })).toBeNull(), T);
    await openNew();
    // The grid starts empty again.
    expect(newDialog().querySelector('tbody input')).toBeNull();
    await fillOneLine();
    save();
    await waitFor(() => expect(creates()).toHaveLength(2), T);
    expect(requestIdOf(creates()[1])).not.toBe(requestIdOf(creates()[0]));
  });

  it('voids from the row and from the Diğer menu with a described, length-capped reason', async () => {
    setup();
    fireEvent.click(within(await listRow('TR-1')).getByRole('button', { name: 'Transferi iptal et' }));
    let prompt = await screen.findByRole('alertdialog', {}, T);
    expect(prompt.textContent).toContain('İptal nedeni');
    expect(prompt.textContent).toContain('TR-1 · Kaynak ve hedef depodaki tüm transfer hareketleri birlikte ters kayıtla iptal edilecek. Hedef stok kullanılmışsa işlem reddedilir.');
    expect(within(prompt).getByRole('textbox').getAttribute('maxlength')).toBe('160');
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Yanlış depo' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Transferi iptal et' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`${TRANSFERS}/${T1}/void`);
    expect(JSON.parse(writes()[0].body!)).toEqual({ reason: 'Yanlış depo', confirmation: true });

    // The row action selected TR-1 and the refreshed list keeps it selected: the Diğer menu command voids the same row.
    await settle(100);
    await waitFor(() => expect(document.querySelector('.tenant-page-data-grid tr.is-selected')?.textContent).toContain('TR-1'), T);
    fireEvent.click(command('more'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Transferi iptal et/ }, T));
    prompt = await screen.findByRole('alertdialog', {}, T);
    expect(prompt.textContent).toContain('TR-1 · Kaynak ve hedef depodaki');
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Mükerrer kayıt' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Transferi iptal et' }));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(JSON.parse(writes()[1].body!)).toEqual({ reason: 'Mükerrer kayıt', confirmation: true });
  });
});
