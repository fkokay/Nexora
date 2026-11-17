import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import ManufacturingOrdersPage from '../ManufacturingOrdersPage';
import ManufacturingRecipesPage from '../ManufacturingRecipesPage';
import ManufacturingWorkCentersPage from '../ManufacturingWorkCentersPage';
import ManufacturingMrpPage from '../ManufacturingMrpPage';
import { orderNextStep, orderPageFigures, orderStatusTag } from './orderList';
import type { ManufacturingOrder } from './types';

const op = (id: string, status: string, scheduled: boolean, extra: Record<string, unknown> = {}) => ({
  id, sequence: 10, workCenterId: 'wc1', workCenterCode: 'WC-01', workCenterName: 'Dolum hattı', setupMinutes: 10, runMinutes: 50,
  minimumWaitDaysAfterPrevious: 0, setupFamilyCode: '', sequenceSetupMinutes: 0, plannedEnergyQuantityKwh: 1, plannedEnergyCostPerKwhBase: 2,
  plannedEnergyCostBase: 2, plannedCostBase: 100, scheduledStartDate: scheduled ? '2026-11-18' : null, scheduledEndDate: scheduled ? '2026-11-18' : null,
  scheduledStartMinuteOfDay: scheduled ? 480 : null, scheduledEndMinuteOfDay: scheduled ? 540 : null, scheduledStartSecondOfDay: null,
  scheduledEndSecondOfDay: null, status, actualSetupMinutes: null, actualRunMinutes: null, actualEnergyQuantityKwh: null,
  actualEnergyCostPerKwhBase: null, actualEnergyCostBase: null, actualCostBase: status === 'Completed' ? 120 : null, performedByEmployeeId: null,
  performedByEmployeeName: null, startedAt: null, completedAt: null, capacityDays: [], ...extra,
});
const order = (id: string, status: string, operations: unknown[], extra: Record<string, unknown> = {}) => ({
  id, code: `UE-${id}`, billOfMaterialId: 'b1', billOfMaterialName: 'RC-014 · Salça reçetesi', warehouseId: 'w1', warehouseName: 'Üretim Deposu',
  plannedQuantity: 1200, sourceSalesOrderId: null, sourceSalesOrderLineNumber: null, sourceSalesOrderCode: null, actualGoodQuantity: null,
  scrapQuantity: null, scrapReason: null, status, plannedDate: '2026-11-18', completedAt: null,
  lines: [{ componentStockItemId: 's1', componentCode: 'HMD-01', componentName: 'Domates', requiredQuantity: 50, standardUnitCostBaseSnapshot: 4, plannedCostBase: 200 }],
  operations, ...extra,
});
const orders = [
  order('o1', 'Planned', [op('p1', 'Planned', false)]),
  order('o2', 'Planned', [op('p2', 'Planned', true)]),
  order('o3', 'Completed', [op('p3', 'Completed', true)], { actualGoodQuantity: 1180, scrapQuantity: 20 }),
  order('o4', 'Cancelled', [op('p4', 'Planned', false)]),
];
const bom = (id: string, code: string, isActive: boolean, orderCount: number) => ({
  id, code, name: `${code} reçetesi`, productStockItemId: 'st1', productName: 'Domates salçası 830 g', productTrackingMode: 'None', outputQuantity: 1,
  isActive, orderCount, rowVersion: 'AA==', lines: [], operations: [],
});
const workCenters = [
  { id: 'wc1', code: 'WC-01', name: 'Dolum hattı', capacityMinutesPerDay: 480, laborCostPerHourBase: 100, overheadCostPerHourBase: 50, workingDaysMask: 31, isActive: true, shiftStartMinuteOfDay: 480, shiftEndMinuteOfDay: 960 },
];

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/manufacturing/orders/') return { items: orders, page: 1, pageSize: 25, totalCount: orders.length, openOrderCount: 23 };
  if (path === '/api/manufacturing/boms/') return [bom('b1', 'RC-014', true, 2), bom('b2', 'RC-009', true, 0)];
  if (path === '/api/manufacturing/work-centers/') return workCenters;
  if (path.startsWith('/api/manufacturing/work-centers/') && path.endsWith('/calendar'))
    return { workCenterId: 'wc1', workingDaysMask: 31, shiftStartMinuteOfDay: 480, shiftEndMinuteOfDay: 960, capacityOverrides: [], annualCapacityRules: [], shiftRotations: [] };
  if (path.endsWith('/setup-rules')) return [];
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D03', name: 'Üretim Deposu', isActive: true }];
  if (path === '/api/hr/employees/') return [];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/manufacturing/mrp/plans') return [];
  if (path.startsWith('/api/stock/items')) return { items: [], pageSize: 100, totalCount: 0 };
  return [];
}

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const reason = (id: string) => command(id).getAttribute('title') ?? '';
function openMenu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}
const row = (text: string) => screen.getByText(text).closest('tr')!;

describe('Üretim emirleri list', () => {
  it('shows status tags, summary cards and no current row until the user picks one', async () => {
    const onNavigate = vi.fn();
    renderScreen(<ManufacturingOrdersPage token="t" onNavigate={onNavigate} />);
    await screen.findByText('UE-o1');
    expect(within(row('UE-o1')).getByText('Planlandı').className).toContain('nx-status-tag is-info');
    expect(within(row('UE-o3')).getByText('Tamamlandı').className).toContain('is-ok');
    expect(within(row('UE-o4')).getByText('İptal edildi').className).toContain('is-off');
    // Route summary in the recipe cell: unscheduled warns.
    expect(within(row('UE-o1')).getByText('op · çizelgelenmedi')).toBeTruthy();
    const cards = document.querySelector<HTMLElement>(".nx-summary-row")!;
    expect(within(cards).getByText('23')).toBeTruthy();
    expect(within(cards).getByText('firma geneli · Planlandı + Serbest bırakıldı')).toBeTruthy();
    // Unscheduled: only the planned order with an unscheduled route (the cancelled one is not planned).
    const unscheduled = within(cards).getByText('Çizelgelenmemiş').closest('.nx-summary-item')!;
    expect(within(unscheduled as HTMLElement).getByText('1')).toBeTruthy();
    await waitFor(() => expect(enabled('new')).toBe(true));
    expect(enabled('open')).toBe(false);
    expect(reason('open')).toBe('Önce bir kayıt seçin');
    fireEvent.click(command('new'));
    expect(onNavigate).toHaveBeenCalledWith('manufacturing-order-create');
  });

  it('single click selects; Aç opens the detail panel; workflow steps are in İşlemler; Sil explains', async () => {
    renderScreen(<ManufacturingOrdersPage token="t" onNavigate={vi.fn()} />);
    await screen.findByText('UE-o2');
    fireEvent.click(within(row('UE-o2')).getByText('Üretim Deposu'));
    await waitFor(() => expect(enabled('open')).toBe(true));
    expect(enabled('delete')).toBe(false);
    expect(reason('delete')).toBe("Üretim emri silinemez; İşlemler'den iptal edin.");
    expect(openMenu()).toEqual(['Serbest bırak', 'İptal et', 'CSV olarak dışa aktar']);
    await act(async () => {
      fireEvent.click(command('open'));
    });
    const panel = await screen.findByRole('complementary', { name: 'Üretim emri özeti' });
    expect(within(panel).getByText('UE-o2')).toBeTruthy();
    expect(within(panel).getByText('Sıradaki adım')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Serbest bırak' })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Bileşenler' }));
    expect(within(panel).getByText('Domates')).toBeTruthy();
    // The planned order with an unscheduled route offers scheduling first.
    fireEvent.click(within(row('UE-o1')).getByText('Üretim Deposu'));
    await waitFor(() => expect(openMenu()).toEqual(['Kapasiteye çizelgele', 'İptal et', 'CSV olarak dışa aktar']));
    // A completed order has no workflow step.
    fireEvent.click(within(row('UE-o3')).getByText('Üretim Deposu'));
    await waitFor(() => expect(openMenu()).toEqual(['CSV olarak dışa aktar']));
  });

  it('double click on a row opens the panel, not on the checkbox cell', async () => {
    renderScreen(<ManufacturingOrdersPage token="t" onNavigate={vi.fn()} />);
    await screen.findByText('UE-o1');
    const checkboxCell = row('UE-o1').querySelector('.advanced-grid-select-cell');
    if (checkboxCell) fireEvent.doubleClick(checkboxCell);
    expect(screen.queryByRole('complementary', { name: 'Üretim emri özeti' })).toBeNull();
    fireEvent.doubleClick(within(row('UE-o1')).getByText('Üretim Deposu'));
    expect(await screen.findByRole('complementary', { name: 'Üretim emri özeti' })).toBeTruthy();
  });
});

describe('Tanımlı reçeteler list', () => {
  it('moves row actions to the action bar with their conditions', async () => {
    renderScreen(<ManufacturingRecipesPage token="t" onNavigate={vi.fn()} />);
    await screen.findByText('RC-014 reçetesi');
    expect(document.querySelector('.manufacturing-recipe-actions')).toBeNull();
    expect(within(row('RC-014 reçetesi')).getByText('Aktif').className).toContain('is-ok');
    fireEvent.click(within(row('RC-014 reçetesi')).getAllByText('Domates salçası 830 g')[0]);
    await waitFor(() => expect(enabled('open')).toBe(true));
    expect(enabled('delete')).toBe(false);
    expect(reason('delete')).toBe('Üretim emri referansı olan reçeteler silinemez.');
    expect(openMenu()).toEqual(['Pasife al', 'CSV olarak dışa aktar']);
    fireEvent.click(within(row('RC-009 reçetesi')).getAllByText('Domates salçası 830 g')[0]);
    await waitFor(() => expect(enabled('delete')).toBe(true));
  });
});

describe('İş merkezleri and Malzeme planlama frames', () => {
  it('İş merkezleri: Yeni opens the definition screen, Sil explains', async () => {
    const onNavigate = vi.fn();
    renderScreen(<ManufacturingWorkCentersPage token="t" onNavigate={onNavigate} />);
    const [cell] = await screen.findAllByText('Dolum hattı');
    expect(within(cell.closest('tr')!).getByText('Aktif').className).toContain('nx-status-tag');
    await waitFor(() => expect(enabled('new')).toBe(true));
    fireEvent.click(command('new'));
    expect(onNavigate).toHaveBeenCalledWith('manufacturing-work-center-create');
  });

  it('Malzeme planlama: plan history is in İşlemler', async () => {
    renderScreen(<ManufacturingMrpPage token="t" onNavigate={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Malzeme planlama' });
    await waitFor(() => expect(openMenu()).toEqual(['Plan geçmişi']));
  });
});

describe('order helpers', () => {
  const typed = orders as unknown as ManufacturingOrder[];
  it('status tags and next steps follow the workflow', () => {
    expect(orderStatusTag('Released')).toEqual({ tone: 'warn', label: 'Serbest bırakıldı' });
    expect(orderNextStep(typed[0])).toBe('schedule');
    expect(orderNextStep(typed[1])).toBe('release');
    expect(orderNextStep(typed[2])).toBeNull();
  });
  it('page figures leave cancelled orders out of the planned cost', () => {
    // Each order: 200 material + 100 operation; three are not cancelled.
    expect(orderPageFigures(typed)).toEqual({ plannedCost: 900, costedCount: 3, unscheduled: 1, completed: 1 });
  });
});

describe('English locale', () => {
  it('translates the new Üretim texts', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    const missing: string[] = [];
    for (const text of [
      'Açık emir', 'firma geneli · Planlandı + Serbest bırakıldı', 'Planlanan maliyet', 'emir · iptal hariç', 'Çizelgelenmemiş',
      'bu sayfa · rotası takvimsiz', 'Tamamlanan', 'op · çizelgelenmedi', 'op · çizelgelendi', 'tamamlandı', 'rota yok', 'op',
      'Üretim emri özeti', 'Sıradaki adım', 'İyi / fire', 'Fiili işlem maliyeti', 'Fire nedeni', 'Tamamlanma', 'Üretim türü',
      'Tutarlar firma baz para birimindedir.', 'Planlanan malzeme', 'Siparişe özel', 'Stoka üretim', 'Rota',
      "Üretim emri silinemez; İşlemler'den iptal edin.", 'Özetini görmek için listeden bir üretim emri seçin.',
      'Üretim emri kayıtları', 'Üretim emirleri yükleniyor…', 'Filtreyle eşleşen üretim emri yok',
      'Henüz üretim emri yok. Bir reçete oluşturduktan sonra ilk emri planlayabilirsiniz.', 'bileşen', 'operasyon', 'üretim emri',
      'Henüz ürün reçetesi yok. Yeni (F2) ile ilk reçeteyi oluşturun.', '↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç',
      'İş merkezi silinemez; durumu Genel sekmesinden değiştirilir.', 'İş merkezi kayıtları', 'Plan geçmişi', 'reçete', 'iş merkezi', 'depo',
      'kayıt · günlük kapasite 480 dk', 'Bu emirde bileşen satırı yok.', 'Operasyon rotası tanımlı değil.',
    ])
      if (localizedUiText(text) === text) missing.push(text);
    expect(missing).toEqual([]);
  });
});
