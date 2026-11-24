import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './foreignTradeOperations.fixture.json';

// "Dış Ticaret Dosyaları" standart tanımı (foreign-trade.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'foreign-trade';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const id = (n: number) => `44444444-0000-0000-0000-${String(n).padStart(12, '0')}`;
const DOC = '55555555-0000-0000-0000-000000000001';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const fileOf = (n: number, referenceCode: string, direction: 'Import' | 'Export', status: string, extra: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = {
    id: id(n), direction, status, purchaseOrderId: direction === 'Import' ? 'po1' : null, salesOrderId: direction === 'Export' ? 'so1' : null,
    referenceCode, originCountryCode: direction === 'Import' ? 'DE' : 'TR', destinationCountryCode: direction === 'Import' ? 'TR' : 'DE',
    incotermsCode: 'FOB', harmonizedSystemCode: '844332', transportMode: 'Sea', carrierReference: null, customsReference: null,
    declaredValue: 125000, currencyCode: 'EUR', plannedShipDate: '2026-12-01', actualShipDate: null, plannedArrivalDate: '2026-12-15',
    actualArrivalDate: null, notes: null, updatedAt: '2026-11-20T00:00:00Z', inventoryPostingRequired: true, purchaseReceiptId: null,
    salesDeliveryId: null, inventoryDocumentLinkedAt: null, orderCode: direction === 'Import' ? 'PO-001' : 'SO-001',
    counterpartyName: direction === 'Import' ? 'Berlin Makine GmbH' : 'Hamburg Handel', ...extra,
  };
  row.route = `${row.originCountryCode} → ${row.destinationCountryCode}`;
  row.shipDate = row.actualShipDate ?? row.plannedShipDate;
  row.arrivalDate = row.actualArrivalDate ?? row.plannedArrivalDate;
  return row;
};
const rows = () => [
  fileOf(1, 'EXP-001', 'Export', 'Draft'),
  fileOf(2, 'EXP-002', 'Export', 'Booked', { plannedShipDate: null, incotermsCode: null }),
  fileOf(3, 'IMP-003', 'Import', 'Booked', { carrierReference: 'MSKU-1' }),
  fileOf(4, 'EXP-004', 'Export', 'Shipped', { actualShipDate: '2026-11-20' }),
  fileOf(5, 'IMP-005', 'Import', 'Shipped', { customsReference: '26TR34001' }),
  fileOf(6, 'IMP-006', 'Import', 'CustomsClearance'),
  fileOf(7, 'IMP-007', 'Import', 'Arrived', { actualArrivalDate: '2026-11-21' }),
  fileOf(8, 'EXP-008', 'Export', 'Arrived', { actualArrivalDate: '2026-11-21', salesDeliveryId: 'd1' }),
  fileOf(9, 'EXP-009', 'Export', 'Cancelled'),
  fileOf(10, 'IMP-010', 'Import', 'Arrived', { purchaseReceiptId: 'r1' }),
];
const summary = { totalCount: 9, importCount: 4, exportCount: 5, draftCount: 1, bookedCount: 2, shippedCount: 2, customsClearanceCount: 1,
  arrivedCount: 2, closedCount: 0, cancelledCount: 1 };
let documents: unknown[] = [];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  const byId = (value: string) => rows().find((row) => row.id === value);
  if (method === 'GET') {
    if (path === '/api/foreign-trade/cases') return { items: rows(), page: 1, pageSize: 50, total: 9, totalCount: 9 };
    if (path === '/api/foreign-trade/cases/summary') return summary;
    const docs = /^\/api\/foreign-trade\/cases\/([^/]+)\/inventory-documents$/.exec(path);
    if (docs) return documents;
    const one = /^\/api\/foreign-trade\/cases\/([^/]+)$/.exec(path);
    if (one && byId(one[1])) return byId(one[1]);
  } else if (method === 'POST') {
    const write = /^\/api\/foreign-trade\/cases\/([^/]+)\/(transition|inventory-document)$/.exec(path);
    if (write && byId(write[1])) return byId(write[1]);
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        screenKey: KEY, source: 'standard', standardVersion: 1, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const command = (name: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${name}"]`)!;
const ready = (name: string) => waitFor(() => expect(command(name).getAttribute('aria-disabled')).not.toBe('true'), T);
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const writes = () => calls.filter((call) => call.method !== 'GET');
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const input = (name: string) => document.getElementById(`page-input-${name}`) as HTMLInputElement;
const cell = (text: string) => screen.findByText(text, { selector: '.tenant-page-data-grid td' }, T);
const rowOf = (text: string) => screen.getAllByText(text, { selector: '.tenant-page-data-grid td' })[0].closest('tr')!;
const openMenu = () => fireEvent.click(command('more'));
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
const menuItem = async (name: RegExp) => {
  openMenu();
  return screen.findByRole('menuitem', { name }, T);
};
/** Seçer ve seçili dosyanın kaydı (disTicaret.dosya.getir) gelene kadar bekler. */
const select = async (code: string, n: number) => {
  fireEvent.click(await cell(code));
  await waitFor(() => expect(rowOf(code).getAttribute('aria-selected') === 'true' || rowOf(code).classList.contains('is-selected')
    || rowOf(code).getAttribute('aria-current') === 'true').toBe(true), T);
  await waitFor(() => expect(gets(`/api/foreign-trade/cases/${id(n)}`).length).toBeGreaterThan(0), T);
};
/** Menü öğesi görünür ve istenen durumda olana kadar menüyü yeniden açar (seçili kayıt yüklenince değişir). */
const itemWhen = async (name: RegExp, enabled: boolean) => {
  let item: HTMLElement | null = null;
  await waitFor(() => {
    closeMenu();
    openMenu();
    item = screen.queryByRole('menuitem', { name });
    expect(item).toBeTruthy();
    expect(item!.getAttribute('aria-disabled') === 'true').toBe(!enabled);
  }, T);
  return item! as HTMLElement;
};
const enabledItem = (name: RegExp) => itemWhen(name, true);
const disabledItem = (name: RegExp) => itemWhen(name, false);
/** Menü adlarını, koşul sağlanana kadar yeniden okur. */
const namesWhen = (check: (names: string[]) => void) => waitFor(() => {
  closeMenu();
  openMenu();
  const names = screen.queryAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '');
  closeMenu();
  check(names);
}, T);
/** Detay paneli tablonun araç çubuğundaki basılı/bırakılmış düğmedir (taslak 21). */
const panelOn = () => {
  const panel = screen.getByRole('button', { name: 'Detay paneli' });
  if (panel.getAttribute('aria-pressed') !== 'true') fireEvent.click(panel);
};
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  calls = []; navigations = []; documents = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  setPageParams('foreign-trade-case', {});
});

describe('Dış Ticaret Dosyaları standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads the first page of 50, the summary counts and Turkish labels', async () => {
    setup();
    await cell('EXP-001');
    const list = gets('/api/foreign-trade/cases');
    expect(query(list[0].url).get('page')).toBe('1');
    expect(query(list[0].url).get('pageSize')).toBe('50');
    await waitFor(() => expect(gets('/api/foreign-trade/cases/summary')).toHaveLength(1), T);
    await waitFor(() => expect(text()).toContain('Tümü 9 · İthalat 4 · İhracat 5 · Taslak 1 · Planlandı 2'), T);
    const draft = rowOf('EXP-001');
    expect(within(draft).getByText('İhracat')).toBeTruthy();
    expect(within(draft).getByText('Taslak')).toBeTruthy();
    expect(within(draft).getByText('SO-001')).toBeTruthy();
    expect(within(draft).getByText('Hamburg Handel')).toBeTruthy();
    expect(within(draft).getByText('TR → DE')).toBeTruthy();
    expect(within(rowOf('IMP-006')).getByText('Gümrükte')).toBeTruthy();
    expect(within(rowOf('EXP-009')).getByText('İptal')).toBeTruthy();
  });

  it('search, direction and stage selections filter the list; the summary follows only the search', async () => {
    setup();
    await cell('EXP-001');
    await waitFor(() => expect(gets('/api/foreign-trade/cases/summary')).toHaveLength(1), T);
    let before = gets('/api/foreign-trade/cases').length;
    fireEvent.change(input('yonSecimi'), { target: { value: 'Import' } });
    await waitFor(() => expect(gets('/api/foreign-trade/cases').length).toBeGreaterThan(before), T);
    expect(query(gets('/api/foreign-trade/cases').at(-1)!.url).get('direction')).toBe('Import');
    before = gets('/api/foreign-trade/cases').length;
    fireEvent.change(input('durumSecimi'), { target: { value: 'Shipped' } });
    await waitFor(() => expect(gets('/api/foreign-trade/cases').length).toBeGreaterThan(before), T);
    const last = query(gets('/api/foreign-trade/cases').at(-1)!.url);
    expect(last.get('direction')).toBe('Import');
    expect(last.get('status')).toBe('Shipped');
    expect(last.get('page')).toBe('1');
    for (const call of gets('/api/foreign-trade/cases/summary')) {
      expect(query(call.url).get('direction')).toBeNull();
      expect(query(call.url).get('status')).toBeNull();
    }
    const search = screen.getByPlaceholderText('Referans, gümrük veya taşıyıcı referansı ara');
    fireEvent.change(search, { target: { value: 'MSKU' } });
    await waitFor(() => expect(gets('/api/foreign-trade/cases').some((call) => query(call.url).get('q') === 'MSKU')).toBe(true), T);
    await waitFor(() => expect(gets('/api/foreign-trade/cases/summary').some((call) => query(call.url).get('q') === 'MSKU')).toBe(true), T);
  });

  it('Yeni carries the direction selection; İthalat/İhracat dosyası use a fixed direction', async () => {
    setup();
    await cell('EXP-001');
    await ready('new');
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0].page).toBe('foreign-trade-case');
    expect(navigations[0].params?.direction ?? '').toBe('');
    fireEvent.change(input('yonSecimi'), { target: { value: 'Import' } });
    await waitFor(() => expect(input('yonSecimi').value).toBe('Import'), T);
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toMatchObject({ page: 'foreign-trade-case', params: { direction: 'Import' } });
    fireEvent.click(await menuItem(/İhracat dosyası/));
    await waitFor(() => expect(navigations).toHaveLength(3), T);
    expect(navigations[2]).toMatchObject({ page: 'foreign-trade-case', params: { direction: 'Export' } });
  });

  it('Aç and a row double click open the card with id; a shipped case cannot be opened', async () => {
    setup();
    await select('EXP-001', 1);
    await ready('open');
    fireEvent.click(command('open'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'foreign-trade-case', params: { id: id(1) } });
    fireEvent.click(rowOf('IMP-003'));
    fireEvent.doubleClick(rowOf('IMP-003'));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toMatchObject({ page: 'foreign-trade-case', params: { id: id(3) } });

    await select('EXP-004', 4);
    await waitFor(() => expect(command('open').getAttribute('aria-disabled')).toBe('true'), T);
    expect(command('open').outerHTML).toContain('Yalnız Taslak ve Planlandı dosyalar düzenlenebilir');
    expect(screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector('[data-command="delete"]')).toBeNull();
  });

  it('İşlemler offers only the stage step of the selected case', async () => {
    setup();
    await select('EXP-001', 1);
    await enabledItem(/Planlandı aşamasına geçir/);
    closeMenu();
    await namesWhen((names) => {
      expect(names.some((name) => name.includes('İptal et'))).toBe(true);
      expect(names.some((name) => name.includes('Sevkte aşamasına geçir'))).toBe(false);
      expect(names.some((name) => name.includes('Stok belgesi bağla'))).toBe(false);
    });
    await select('IMP-006', 6);
    await enabledItem(/Varışı kaydet/);
    closeMenu();
    await namesWhen((names) => {
      expect(names.some((name) => name.includes('Planlandı aşamasına geçir'))).toBe(false);
      expect(names.some((name) => name.includes('İptal et'))).toBe(false);
    });
    await select('EXP-009', 9);
    await namesWhen((names) => {
      expect(names.some((name) => name.includes('İthalat dosyası'))).toBe(true);
      expect(names.some((name) => /aşamasına geçir|Varışı kaydet|^Kapat|İptal et|Stok belgesi/.test(name))).toBe(false);
    });
  });

  it('Planlandı posts the Booked transition and refreshes the list, the summary and the record', async () => {
    setup();
    await select('EXP-001', 1);
    await waitFor(() => expect(gets('/api/foreign-trade/cases/summary')).toHaveLength(1), T);
    const lists = gets('/api/foreign-trade/cases').length;
    const records = gets(`/api/foreign-trade/cases/${id(1)}`).length;
    fireEvent.click(await enabledItem(/Planlandı aşamasına geçir/));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/foreign-trade/cases/${id(1)}/transition` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ status: 'Booked' });
    expect(await screen.findByText(/^EXP-001: Planlandı aşamasına geçirildi\./, {}, T)).toBeTruthy();
    await waitFor(() => expect(gets('/api/foreign-trade/cases/summary').length).toBeGreaterThan(1), T);
    expect(gets('/api/foreign-trade/cases').length).toBeGreaterThan(lists);
    expect(gets(`/api/foreign-trade/cases/${id(1)}`).length).toBeGreaterThan(records);
  });

  it('Sevkte is disabled with a reason while prerequisites are missing; the panel lists them', async () => {
    setup();
    await select('EXP-002', 2);
    const item = await disabledItem(/Sevkte aşamasına geçir/);
    expect(item.getAttribute('title')).toContain('Önce dosyayı açıp planlanan sevk tarihi, beyan değeri ve Incoterms girin');
    closeMenu();
    panelOn();
    await waitFor(() => expect(text()).toContain('Sevke geçmek için gerekli'), T);
  });

  it('Sevkte dialog: an empty actual date is not sent (server uses today); a given date and carrier are', async () => {
    setup();
    await select('IMP-003', 3);
    fireEvent.click(await enabledItem(/Sevkte aşamasına geçir/));
    let dialog = await screen.findByRole('dialog', { name: /Sevkte aşamasına geçir · IMP-003/ }, T);
    expect(input('sevkTarihi').value).toBe('');
    await waitFor(() => expect(input('sevkTasiyici').value).toBe('MSKU-1'), T);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Geçir' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/foreign-trade/cases/${id(3)}/transition`);
    const body = JSON.parse(writes()[0].body!);
    expect(body).toMatchObject({ status: 'Shipped', carrierReference: 'MSKU-1' });
    expect(body.actualDate ?? null).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Sevkte aşamasına geçir/ })).toBeNull(), T);

    fireEvent.click(await enabledItem(/Sevkte aşamasına geçir/));
    dialog = await screen.findByRole('dialog', { name: /Sevkte aşamasına geçir · IMP-003/ }, T);
    fireEvent.change(input('sevkTarihi'), { target: { value: '2026-11-20' } });
    fireEvent.change(input('sevkTasiyici'), { target: { value: 'MSKU-2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Geçir' }));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(JSON.parse(writes()[1].body!)).toEqual({ status: 'Shipped', actualDate: '2026-11-20', carrierReference: 'MSKU-2' });
  });

  it('Gümrükte: an export needs a linked delivery; the import dialog sends the prefilled customs reference', async () => {
    setup();
    await select('EXP-004', 4);
    const item = await disabledItem(/Gümrükte aşamasına geçir/);
    expect(item.getAttribute('title')).toContain('Önce kayıtlı teslimat belgesini bu dosyaya bağlayın');
    closeMenu();
    panelOn();
    await waitFor(() => expect(text()).toContain('Gümrüğe geçmek için gerekli'), T);

    await select('IMP-005', 5);
    fireEvent.click(await enabledItem(/Gümrükte aşamasına geçir/));
    const dialog = await screen.findByRole('dialog', { name: /Gümrükte aşamasına geçir · IMP-005/ }, T);
    await waitFor(() => expect(input('gumrukReferansi').value).toBe('26TR34001'), T);
    fireEvent.change(input('gumrukReferansi'), { target: { value: '26TR34002' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Geçir' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/foreign-trade/cases/${id(5)}/transition`);
    expect(JSON.parse(writes()[0].body!)).toEqual({ status: 'CustomsClearance', customsReference: '26TR34002' });
  });

  it('Varışı kaydet posts Arrived with the entered actual date', async () => {
    setup();
    await select('IMP-006', 6);
    fireEvent.click(await enabledItem(/Varışı kaydet/));
    const dialog = await screen.findByRole('dialog', { name: /Varışı kaydet · IMP-006/ }, T);
    expect(input('varisTarihi').value).toBe('');
    fireEvent.change(input('varisTarihi'), { target: { value: '2026-11-22' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(JSON.parse(writes()[0].body!)).toEqual({ status: 'Arrived', actualDate: '2026-11-22' });
  });

  it('Kapat: an import without a linked receipt is disabled; an arrived export with its delivery closes', async () => {
    setup();
    await select('IMP-007', 7);
    const item = await disabledItem(/^Kapat$/);
    expect(item.getAttribute('title')).toContain('Kapatmak için gerçek varış tarihi ve ithalatta bağlı mal kabul belgesi gerekir');
    closeMenu();
    panelOn();
    await waitFor(() => expect(text()).toContain('Kapatmak için gerekli'), T);

    // Bağlı mal kabul var ama gerçek varış tarihi yok: yine kapatılamaz (|| / && önceliği).
    await select('IMP-010', 10);
    await disabledItem(/^Kapat$/);
    closeMenu();

    await select('EXP-008', 8);
    fireEvent.click(await enabledItem(/^Kapat$/));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/foreign-trade/cases/${id(8)}/transition` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ status: 'Closed' });
  });

  it('Stok belgesi bağla lists the receipts and links the selected document only', async () => {
    documents = [{ id: DOC, code: 'MK-0007', documentDate: '2026-11-21', warehouseName: 'Merkez', lineCount: 3, isLinked: false }];
    setup();
    await select('IMP-007', 7);
    fireEvent.click(await enabledItem(/Stok belgesi bağla/));
    const dialog = await screen.findByRole('dialog', { name: /Stok belgesi seç · IMP-007/ }, T);
    // Metin bileşeninin `title` özelliği çizilmez; yön açıklamanın kendisinden okunur.
    expect(dialog.textContent).toContain('kayıtlı mal kabul belgeleri');
    expect(dialog.textContent).not.toContain('irsaliye');
    expect(dialog.textContent).toContain('Bu adım yalnızca mevcut belgeyi bağlar; stok ikinci kez işlenmez.');
    expect(dialog.textContent).toContain('Belge tarihi');
    const docCell = await within(dialog).findByText('MK-0007', {}, T);
    fireEvent.click(docCell);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/foreign-trade/cases/${id(7)}/inventory-document` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ documentId: DOC });
    // closeOnSave: pencere kapanır; başarı iletisi pencerenin kendi durum satırındadır ve pencereyle birlikte kaybolur.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Stok belgesi seç/ })).toBeNull(), T);
  });

  it('Stok belgesi bağla shows the empty text when no posted document fits', async () => {
    setup();
    await select('EXP-004', 4);
    fireEvent.click(await enabledItem(/Stok belgesi bağla/));
    const dialog = await screen.findByRole('dialog', { name: /Stok belgesi seç · EXP-004/ }, T);
    expect(dialog.textContent).toContain('teslimat (irsaliye) belgeleri');
    await waitFor(() => expect(dialog.textContent).toContain('Uygun kayıtlı stok belgesi yok'), T);
  });

  it('İptal et asks first, then posts the Cancelled transition', async () => {
    setup();
    await select('IMP-003', 3);
    fireEvent.click(await enabledItem(/İptal et/));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('IMP-003');
    expect(dialog.textContent).toContain('geri alınamaz');
    expect(writes()).toEqual([]);
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(JSON.parse(writes()[0].body!)).toEqual({ status: 'Cancelled' });
  });

  it('detail panel: empty selection hint, steps and details, cancelled note, legal note', async () => {
    setup();
    await cell('EXP-001');
    panelOn();
    await waitFor(() => expect(text()).toContain('listeden bir dosya seçin'), T);
    await select('IMP-005', 5);
    await waitFor(() => expect(text()).toContain('Seçili dosya · İthalat'), T);
    expect(text()).toContain('Sevkte · sıradaki: Gümrükte');
    expect(text()).toContain('PO-001 · Berlin Makine GmbH');
    expect(text()).toContain('DE → TR · FOB');
    expect(text()).toContain('26TR34001');
    expect(text()).toContain('Bağlanmadı');
    expect(text()).toContain('İç operasyon kaydıdır; resmî gümrük beyannamesi değildir.');
    expect(text()).not.toContain('İptal edildi · sevk başlamadan kapatıldı');
    await select('EXP-009', 9);
    await waitFor(() => expect(text()).toContain('İptal edildi · sevk başlamadan kapatıldı'), T);
  });
});
