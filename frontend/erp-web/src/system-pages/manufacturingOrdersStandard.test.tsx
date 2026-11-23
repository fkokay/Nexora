import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './manufacturingOrdersOperations.fixture.json';

// "Üretim emirleri" standart tanımı (manufacturing-orders.json): şirket geneli sayaçlar, durum süzgeci, satır bayraklarına bağlı
// durum adımları (çizelgele, serbest bırak, tamamla, iptal), detay panelinde rota operasyonları (iki rota parametreli başlat /
// tamamla) ve mamul lot / seri satırlı üretim bildirimi. API sahte yanıtlar döner.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'manufacturing-orders';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const O1 = '77777777-0000-0000-0000-000000000001';
const O2 = '77777777-0000-0000-0000-000000000002';
const O3 = '77777777-0000-0000-0000-000000000003';
const O4 = '77777777-0000-0000-0000-000000000004';
const O5 = '77777777-0000-0000-0000-000000000005';
const O6 = '77777777-0000-0000-0000-000000000006';
const P2A = '88888888-0000-0000-0000-00000000002a';
const P2B = '88888888-0000-0000-0000-00000000002b';
const E1 = '99999999-0000-0000-0000-000000000001';

const op = (id: string, sequence: number, status: string, scheduled: boolean) => ({
  id, sequence, workCenterId: 'wc1', workCenterCode: 'WC-01', workCenterName: 'Dolum hattı', setupMinutes: 10, runMinutes: 50,
  minimumWaitDaysAfterPrevious: 0, setupFamilyCode: '', sequenceSetupMinutes: 0, laborCostPerHourBase: 100, overheadCostPerHourBase: 50,
  plannedEnergyQuantityKwh: 1.5, plannedEnergyCostPerKwhBase: 2, plannedEnergyCostBase: 3, plannedCostBase: 100,
  scheduledStartDate: scheduled ? '2026-11-18' : null, scheduledEndDate: scheduled ? '2026-11-18' : null,
  scheduledStartMinuteOfDay: scheduled ? 480 : null, scheduledEndMinuteOfDay: scheduled ? 540 : null, scheduledStartSecondOfDay: null,
  scheduledEndSecondOfDay: null, status, actualSetupMinutes: status === 'Completed' ? 12 : null, actualRunMinutes: status === 'Completed' ? 55 : null,
  actualEnergyQuantityKwh: null, actualEnergyCostPerKwhBase: null, actualEnergyCostBase: null, actualCostBase: status === 'Completed' ? 120 : null,
  performedByEmployeeId: null, performedByEmployeeName: null, startedAt: null, completedAt: null, capacityDays: [],
});
type Flags = { canSchedule?: boolean; canRelease?: boolean; canComplete?: boolean; canCancel?: boolean; startedOperationCount?: number };
const order = (id: string, code: string, status: string, operations: ReturnType<typeof op>[], flags: Flags, extra: Record<string, unknown> = {}) => ({
  id, code, billOfMaterialId: 'b1', billOfMaterialName: 'Salça reçetesi', warehouseId: 'w1', warehouseName: 'Üretim Deposu',
  sourceSalesOrderId: null, sourceSalesOrderLineNumber: null, sourceSalesOrderCode: null, plannedQuantity: 1200, actualGoodQuantity: null,
  scrapQuantity: null, scrapReason: null, status, plannedDate: '2026-11-18', completedAt: null,
  lines: [{ componentStockItemId: 's1', componentCode: 'HMD-01', componentName: 'Domates', requiredQuantity: 50, standardUnitCostBaseSnapshot: 4, plannedCostBase: 200 }],
  operations, productStockItemId: 'st1', productCode: 'MAM-01', productName: 'Domates salçası 830 g', productTrackingMode: 'None',
  operationCount: operations.length, scheduledOperationCount: operations.filter((item) => item.scheduledStartDate).length,
  startedOperationCount: flags.startedOperationCount ?? 0, completedOperationCount: operations.filter((item) => item.status === 'Completed').length,
  canSchedule: flags.canSchedule ?? false, canRelease: flags.canRelease ?? false, canComplete: flags.canComplete ?? false, canCancel: flags.canCancel ?? false,
  componentCodes: 'HMD-01', plannedMaterialCostBase: 200, plannedOperationCostBase: 100, plannedCostBase: 300, actualOperationCostBase: null,
  routeSummary: `${operations.length} op · çizelgelenmedi`, sourceText: 'Stoka üretim', ...extra,
});
const orders = () => [
  order(O1, 'URE-001', 'Planned', [op('p1', 1, 'Planned', false)], { canSchedule: true, canCancel: true }),
  order(O2, 'URE-002', 'Released', [op(P2A, 1, 'InProgress', true), op(P2B, 2, 'Planned', true)], { canCancel: true, startedOperationCount: 1 },
    { sourceSalesOrderCode: 'SS-0001', sourceSalesOrderLineNumber: 1, sourceText: 'SS-0001 · satır 1', routeSummary: '0 / 2 tamamlandı' }),
  order(O3, 'URE-003', 'Released', [op('p3', 1, 'Completed', true)], { canComplete: true, canCancel: true, startedOperationCount: 1 },
    { productTrackingMode: 'Lot', routeSummary: '1 / 1 tamamlandı' }),
  order(O4, 'URE-004', 'Completed', [op('p4', 1, 'Completed', true)], {}, { actualGoodQuantity: 1180, scrapQuantity: 20, routeSummary: '1 / 1 tamamlandı' }),
  order(O5, 'URE-005', 'Planned', [op('p5', 1, 'Planned', true)], { canRelease: true, canCancel: true }, { routeSummary: '1 op · çizelgelendi' }),
  order(O6, 'URE-006', 'Released', [op('p6', 1, 'Completed', true)], { canComplete: true, canCancel: true, startedOperationCount: 1 },
    { routeSummary: '1 / 1 tamamlandı' }),
];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  const single = /^\/api\/manufacturing\/orders\/([^/]+)$/.exec(path);
  if (method === 'GET') {
    if (path === '/api/manufacturing/orders')
      return { items: orders(), page: 1, pageSize: 25, totalCount: 6, openOrderCount: 23, unscheduledOrderCount: 4, completedOrderCount: 7, openPlannedCostBase: 125000 };
    if (single) return orders().find((item) => item.id === single[1]);
    if (path === '/api/manufacturing/operators') return [{ id: E1, code: 'P-01', fullName: 'Ayşe Demir' }];
  } else if (method === 'POST') {
    const id = /^\/api\/manufacturing\/orders\/([^/]+)\//.exec(path)?.[1];
    const found = orders().find((item) => item.id === id);
    if (path.endsWith('/complete') && !path.includes('/operations/'))
      return { order: found, baseCurrencyCode: 'TRY', totalCostBase: 400, unitCostBase: 0.33, operationCostBase: 120, costStatus: 'Complete' };
    if (path.endsWith('/cancel')) return null;
    if (found) return found;
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup() {
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
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt('TenantAdmin')} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const GRID = '.tenant-page-data-grid td, .tenant-page-data-grid td *';
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const lists = () => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === '/api/manufacturing/orders');
const writes = () => calls.filter((call) => call.method !== 'GET');
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const text = () => document.body.textContent ?? '';
const cell = (value: string) => screen.findAllByText(value, { selector: GRID }, T).then((found) => found[0]);
const rowOf = (value: string) => screen.getAllByText(value, { selector: GRID })[0].closest('tr')!;
const menuItem = async (name: RegExp) => {
  fireEvent.click(command('more'));
  return screen.findByRole('menuitem', { name }, T);
};
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
const menuNames = async () => {
  fireEvent.click(command('more'));
  await screen.findAllByRole('menuitem', {}, T);
  const names = screen.queryAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '');
  closeMenu();
  return names;
};
const select = async (code: string) => {
  fireEvent.click(await cell(code));
  await waitFor(() => expect(rowOf(code).getAttribute('aria-selected') === 'true' || rowOf(code).classList.contains('is-selected')
    || rowOf(code).getAttribute('aria-current') === 'true').toBe(true), T);
};
const confirm = async (expected: string) => {
  const dialog = await screen.findByRole('alertdialog', {}, T);
  expect(dialog.textContent).toContain(expected);
  expect(writes()).toEqual([]);
  fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
};
const openDetail = async (code: string) => {
  await select(code);
  // İşlem Çubuğu Aç'a bağlı değil; detay paneli "Detay paneli" anahtarıyla (ya da satırı açarak, rowOpenAction) açılır.
  const panel = screen.getByLabelText('Detay paneli') as HTMLInputElement;
  if (!panel.checked) fireEvent.click(panel);
  await waitFor(() => expect(input('detayPaneli').checked).toBe(true), T);
  await waitFor(() => expect(screen.getAllByRole('tab').some((tab) => /^Rota/.test(tab.textContent ?? ''))).toBe(true), T);
};
const routeTab = async () => {
  fireEvent.click(screen.getAllByRole('tab').find((tab) => /^Rota/.test(tab.textContent ?? ''))!);
  await screen.findByText('Operasyonlar sırayla, serbest bırakılmış emirde ve planlanan başlangıç gününden itibaren başlatılır.', {}, T);
};

beforeEach(() => {
  calls = []; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
});

describe('Üretim emirleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads the first page of 25 with company-wide counters, route summary, source text and Turkish status labels', async () => {
    setup();
    await cell('URE-001');
    expect(query(lists()[0].url).get('page')).toBe('1');
    expect(query(lists()[0].url).get('pageSize')).toBe('25');
    await waitFor(() => expect(text()).toContain('125.000,00'), T);
    for (const title of ['Açık emir', 'Planlanan maliyet', 'Çizelgelenmemiş', 'Tamamlanan']) expect(text()).toContain(title);
    expect(text()).toContain('23');
    expect(text()).toContain('tüm kayıtlar · rotası takvimsiz');
    expect(within(rowOf('URE-001')).getByText('Planlandı')).toBeTruthy();
    expect(within(rowOf('URE-002')).getByText('Serbest bırakıldı')).toBeTruthy();
    expect(within(rowOf('URE-004')).getByText('Tamamlandı')).toBeTruthy();
    expect(rowOf('URE-001').textContent).toContain('1 op · çizelgelenmedi');
    expect(rowOf('URE-001').textContent).toContain('Stoka üretim');
    expect(rowOf('URE-002').textContent).toContain('SS-0001 · satır 1');
  });

  it('the Durum selection and the search reload the list with status and q', async () => {
    setup();
    await cell('URE-001');
    let before = lists().length;
    fireEvent.change(input('durumSecimi') as unknown as HTMLSelectElement, { target: { value: 'Released' } });
    await waitFor(() => expect(lists().length).toBeGreaterThan(before), T);
    expect(query(lists().at(-1)!.url).get('status')).toBe('Released');
    before = lists().length;
    const search = screen.getByPlaceholderText('Emir, reçete, depo veya sipariş ara');
    fireEvent.change(search, { target: { value: 'URE-00' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(lists().some((call) => query(call.url).get('q') === 'URE-00')).toBe(true), T);
    expect(lists().length).toBeGreaterThan(before);
  });

  it('İşlemler offers only the steps the selected row allows', async () => {
    setup();
    await select('URE-001');
    let names = await menuNames();
    expect(names.some((name) => name.includes('Kapasiteye çizelgele'))).toBe(true);
    expect(names.some((name) => name.includes('Serbest bırak'))).toBe(false);
    expect(names.some((name) => name.includes('Üretimi tamamla'))).toBe(false);
    expect(names.filter((name) => name.includes('İptal et'))).toHaveLength(1);
    await select('URE-005');
    names = await menuNames();
    expect(names.some((name) => name.includes('Serbest bırak'))).toBe(true);
    expect(names.some((name) => name.includes('Kapasiteye çizelgele'))).toBe(false);
    await select('URE-003');
    names = await menuNames();
    expect(names.some((name) => name.includes('Üretimi tamamla'))).toBe(true);
    await select('URE-004');
    fireEvent.click(command('more'));
    await new Promise((done) => setTimeout(done, 50));
    const left = screen.queryAllByRole('menuitem').map((item) => item.textContent ?? '');
    for (const step of ['Kapasiteye çizelgele', 'Serbest bırak', 'Üretimi tamamla', 'İptal et']) expect(left.some((name) => name.includes(step))).toBe(false);
    closeMenu();
  });

  it('Kapasiteye çizelgele posts the schedule step and refreshes the list', async () => {
    setup();
    await select('URE-001');
    const before = lists().length;
    fireEvent.click(await menuItem(/Kapasiteye çizelgele/));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/manufacturing/orders/${O1}/schedule` });
    expect(await screen.findByText(/URE-001 için iş merkezi kapasitesi ayrıldı/, {}, T)).toBeTruthy();
    await waitFor(() => expect(lists().length).toBeGreaterThan(before), T);
  });

  it('Serbest bırak posts the release step', async () => {
    setup();
    await select('URE-005');
    fireEvent.click(await menuItem(/Serbest bırak/));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/manufacturing/orders/${O5}/release` });
  });

  it('İptal et asks first; the text warns when operations already started', async () => {
    setup();
    await select('URE-001');
    fireEvent.click(await menuItem(/İptal et/));
    await confirm('URE-001 üretim emri iptal edilsin mi? Kapasite ayırmaları silinir; işlem geri alınamaz.');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/manufacturing/orders/${O1}/cancel` });

    await select('URE-002');
    fireEvent.click(await menuItem(/İptal et/));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('URE-002 üretim emri iptal edilsin mi? 1 operasyonun fiili kaydı var; iptal geri alınamaz.');
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toMatchObject({ method: 'POST', url: `/api/manufacturing/orders/${O2}/cancel` });
  });

  it('detail panel: route tab counter, operation start and completion with both route ids', async () => {
    setup();
    await openDetail('URE-002');
    await waitFor(() => expect(screen.getAllByRole('tab').some((tab) => (tab.textContent ?? '').replace(/\s+/g, ' ').trim() === 'Rota 2')).toBe(true), T);
    await routeTab();
    // Bekleyen operasyon: Başlat; devam eden: Tamamla.
    const start = await screen.findByRole('button', { name: 'Başlat' }, T);
    await waitFor(() => expect(start.hasAttribute('disabled')).toBe(false), T);
    fireEvent.click(start);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/manufacturing/orders/${O2}/operations/${P2B}/start` });

    fireEvent.click(await screen.findByRole('button', { name: 'Tamamla' }, T));
    const dialog = await screen.findByRole('dialog', { name: /Operasyonu tamamla/ }, T);
    await waitFor(() => expect(input('kurulumDk').value).toBe('10'), T);
    expect(input('calismaDk').value).toBe('50');
    fireEvent.change(input('calismaDk'), { target: { value: '55' } });
    fireEvent.click(input('operator'));
    fireEvent.click(await screen.findByRole('option', { name: /Ayşe Demir/ }, T));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fiili kayıtları kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toMatchObject({ method: 'POST', url: `/api/manufacturing/orders/${O2}/operations/${P2A}/complete` });
    expect(JSON.parse(writes()[1].body!)).toMatchObject({ actualSetupMinutes: 10, actualRunMinutes: 55, actualEnergyQuantityKwh: 1.5,
      actualEnergyCostPerKwhBase: 2, performedByEmployeeId: E1 });
  });

  it('operation steps are disabled while the order is not released', async () => {
    setup();
    await openDetail('URE-001');
    await routeTab();
    const start = await screen.findByRole('button', { name: 'Başlat' }, T);
    await waitFor(() => expect(start.hasAttribute('disabled') || start.getAttribute('aria-disabled') === 'true').toBe(true), T);
  });

  it('Üretimi tamamla: defaults from the order, lot rows, then the completion body', async () => {
    setup();
    await select('URE-003');
    fireEvent.click(await menuItem(/Üretimi tamamla/));
    const dialog = await screen.findByRole('dialog', { name: /Üretimi bildir · URE-003/ }, T);
    await waitFor(() => expect(input('iyiMiktar').value).toBe('1200'), T);
    expect(input('fireMiktar').value).toBe('0');
    expect(dialog.textContent).toContain('FEFO');
    fireEvent.change(input('iyiMiktar'), { target: { value: '1180' } });
    fireEvent.change(input('fireMiktar'), { target: { value: '20' } });
    fireEvent.change(input('fireNedeni'), { target: { value: 'Dolum kaybı' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Satır ekle' }));
    fireEvent.change(await within(dialog).findByLabelText('Lot / seri numarası (satır 1)', {}, T), { target: { value: 'LOT-2611' } });
    fireEvent.change(within(dialog).getByLabelText('Miktar (satır 1)'), { target: { value: '1180' } });
    fireEvent.change(within(dialog).getByLabelText('Son kullanma tarihi (satır 1)'), { target: { value: '2027-11-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bildir ve Tamamla' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/manufacturing/orders/${O3}/complete` });
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ actualGoodQuantity: 1180, scrapQuantity: 20, scrapReason: 'Dolum kaybı',
      finishedGoodsTracking: [{ trackingCode: 'LOT-2611', quantity: 1180, expiryDate: '2027-11-01' }] });
  });

  it('the lot / serial rows are hidden for an untracked product; the body has no tracking rows', async () => {
    setup();
    await select('URE-006');
    fireEvent.click(await menuItem(/Üretimi tamamla/));
    const dialog = await screen.findByRole('dialog', { name: /Üretimi bildir · URE-006/ }, T);
    await waitFor(() => expect(input('iyiMiktar').value).toBe('1200'), T);
    expect(within(dialog).queryByText('Lot / seri numaraları')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Satır ekle' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bildir ve Tamamla' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/manufacturing/orders/${O6}/complete` });
    const body = JSON.parse(writes()[0].body!);
    expect(body).toMatchObject({ actualGoodQuantity: 1200, scrapQuantity: 0 });
    expect(body.finishedGoodsTracking ?? []).toEqual([]);
  });
});
