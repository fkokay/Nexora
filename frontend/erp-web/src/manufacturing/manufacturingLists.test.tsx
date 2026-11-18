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
import ManufacturingWorkCenterCreatePage from '../ManufacturingWorkCenterCreatePage';
import ManufacturingOrderCreatePage from '../ManufacturingOrderCreatePage';
import ManufacturingRecipeCreatePage from '../ManufacturingRecipeCreatePage';
import ManufacturingPage from '../ManufacturingPage';
import { useState } from 'react';
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
  { id: 'wc2', code: 'WC-02', name: 'Yedek dolum', capacityMinutesPerDay: 480, laborCostPerHourBase: 90, overheadCostPerHourBase: 40, workingDaysMask: 31, isActive: true, shiftStartMinuteOfDay: 480, shiftEndMinuteOfDay: 960 },
];

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/manufacturing/orders/') return { items: orders, page: 1, pageSize: 25, totalCount: orders.length, openOrderCount: 23 };
  if (path === '/api/manufacturing/boms/')
    return [
      bom('b1', 'RC-014', true, 2),
      bom('b2', 'RC-009', true, 0),
      {
        ...bom('b3', 'RC-ED', true, 0),
        lines: [{ componentStockItemId: 's1', componentName: 'Domates', quantity: 2, scrapPercent: 5, standardUnitCostBase: 4 }],
        operations: [
          { sequence: 1, workCenterId: 'wc1', workCenterName: 'Dolum hattı', setupMinutes: 10, runMinutesPerOutputUnit: 2, minimumWaitDaysAfterPrevious: 0,
            setupFamilyCode: 'A', plannedEnergyKwhPerOutput: 0.5, plannedEnergyCostPerKwhBase: 3, eligibleWorkCenterIds: ['wc1', 'wc2'] },
        ],
      },
    ];
  if (path === '/api/manufacturing/work-centers/') return workCenters;
  if (path.startsWith('/api/manufacturing/work-centers/') && path.endsWith('/calendar'))
    return { workCenterId: 'wc1', workingDaysMask: 31, shiftStartMinuteOfDay: 480, shiftEndMinuteOfDay: 960, capacityOverrides: [], annualCapacityRules: [], shiftRotations: [] };
  if (path.endsWith('/setup-rules')) return [];
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D03', name: 'Üretim Deposu', isActive: true }];
  if (path === '/api/hr/employees/') return [];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/manufacturing/mrp/plans') return [];
  if (path.startsWith('/api/stock/items'))
    return {
      items: [
        { id: 'st1', code: 'MAM-01', name: 'Domates salçası 830 g', unitCode: 'AD', trackingMode: 'None', isActive: true },
        { id: 's1', code: 'HMD-01', name: 'Domates', unitCode: 'KG', trackingMode: 'None', isActive: true },
      ],
      pageSize: 100,
      totalCount: 2,
    };
  return [];
}

/** Write requests the page sent (method, path, parsed body). */
const writes: Array<{ method: string; path: string; body: unknown }> = [];

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') writes.push({ method, path: url.split('?')[0], body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(method === 'POST' && url.split('?')[0] === '/api/manufacturing/work-centers/' ? { id: 'wc-new' } : respond(url)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  writes.length = 0;
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
  it('İş merkezleri (definition screen): nothing open by itself; a row opens its record; Sil explains', async () => {
    const onNavigate = vi.fn();
    renderScreen(<ManufacturingWorkCentersPage token="t" onNavigate={onNavigate} />);
    const [cell] = await screen.findAllByText('Dolum hattı');
    expect(within(cell.closest('tr')!).getByText('Aktif').className).toContain('nx-status-tag');
    expect(document.querySelector('.nx-def.work-center-def')).toBeTruthy();
    expect(screen.getByText('Bir iş merkezi seçin ya da F2 ile yeni iş merkezi ekleyin.')).toBeTruthy();
    await waitFor(() => expect(reason('open')).toBe('Önce bir kayıt seçin'));
    fireEvent.click(cell);
    const pane = await screen.findByRole('complementary', { name: 'Seçili iş merkezi ayrıntısı' });
    expect(within(pane).getByRole('tab', { name: 'Çalışma takvimi' })).toBeTruthy();
    expect(reason('delete')).toBe('İş merkezi silinemez; durumu Genel sekmesinden değiştirilir.');
    // Core fields stay read-only for an existing record (no PUT): the Genel tab lists them as facts.
    fireEvent.click(within(pane).getByRole('tab', { name: 'Genel' }));
    expect(within(pane).queryByPlaceholderText('WC-MONTAJ')).toBeNull();
    // Esc while typing in the record's fields keeps it open (calendar / rule edits have no discard prompt).
    fireEvent.click(within(pane).getByRole('tab', { name: 'Çalışma takvimi' }));
    const shiftInput = await waitFor(() => {
      const input = pane.querySelector<HTMLInputElement>('input');
      expect(input).toBeTruthy();
      return input!;
    });
    fireEvent.keyDown(shiftInput, { key: 'Escape' });
    expect(screen.getByRole('complementary', { name: 'Seçili iş merkezi ayrıntısı' })).toBeTruthy();
    // Esc elsewhere closes the record.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(await screen.findByText('Bir iş merkezi seçin ya da F2 ile yeni iş merkezi ekleyin.')).toBeTruthy();
    // The close button does too (the only way out of the drawer on touch below 1280px).
    fireEvent.click(cell);
    const reopened = await screen.findByRole('complementary', { name: 'Seçili iş merkezi ayrıntısı' });
    fireEvent.click(within(reopened).getByRole('button', { name: 'Detay panelini kapat' }));
    expect(await screen.findByText('Bir iş merkezi seçin ya da F2 ile yeni iş merkezi ekleyin.')).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('İş merkezleri: Yeni (F2) opens the form in the pane with the same POST body; a draft asks before a row opens', async () => {
    renderScreen(<ManufacturingWorkCentersPage token="t" onNavigate={vi.fn()} />);
    const [cell] = await screen.findAllByText('Dolum hattı');
    await waitFor(() => expect(enabled('new')).toBe(true));
    fireEvent.click(command('new'));
    const form = await waitFor(() => {
      const element = document.getElementById('mfg-wc-create');
      expect(element).toBeTruthy();
      return element!;
    });
    const name = within(form).getByPlaceholderText('Montaj hattı');
    fireEvent.change(name, { target: { value: 'Paketleme' } });
    // A typed draft: picking a row asks first; Vazgeç keeps the form.
    fireEvent.click(cell);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    });
    expect(document.getElementById('mfg-wc-create')).toBeTruthy();
    fireEvent.change(within(form).getByPlaceholderText('WC-MONTAJ'), { target: { value: 'WC-PKT' } });
    const numbers = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    fireEvent.change(numbers[0], { target: { value: '450' } });
    fireEvent.change(numbers[1], { target: { value: '120.5' } });
    fireEvent.change(numbers[2], { target: { value: '30' } });
    await act(async () => {
      fireEvent.submit(name.closest('form')!);
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'POST',
      path: '/api/manufacturing/work-centers/',
      body: { code: 'WC-PKT', name: 'Paketleme', capacityMinutesPerDay: 450, laborCostPerHourBase: 120.5, overheadCostPerHourBase: 30 },
    });
    await waitFor(() => expect(document.getElementById('mfg-wc-create')).toBeNull());
    expect(screen.getByText('İş merkezi oluşturuldu.')).toBeTruthy();
  });

  it('İş merkezleri: the calendar and setup-rule PUT bodies', async () => {
    renderScreen(<ManufacturingWorkCentersPage token="t" onNavigate={vi.fn()} />);
    const [cell] = await screen.findAllByText('Dolum hattı');
    fireEvent.click(cell);
    const pane = await screen.findByRole('complementary', { name: 'Seçili iş merkezi ayrıntısı' });
    fireEvent.click(within(pane).getByRole('tab', { name: 'Çalışma takvimi' }));
    const start = await within(pane).findByLabelText('Vardiya başlangıcı');
    await waitFor(() => expect((start as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(start, { target: { value: '07:30' } });
    fireEvent.change(within(pane).getByLabelText('Vardiya bitişi'), { target: { value: '16:00' } });
    await act(async () => {
      fireEvent.click(within(pane).getByRole('button', { name: 'Takvimi kaydet' }));
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'PUT',
      path: '/api/manufacturing/work-centers/wc1/calendar',
      body: { workingDaysMask: 31, shiftStartMinuteOfDay: 450, shiftEndMinuteOfDay: 960, capacityOverrides: [], annualCapacityRules: [], shiftRotations: [] },
    });
    // Setup rules: one transition A → B, 15 minutes.
    let add: HTMLElement | null = null;
    for (const tab of ['Genel', 'İstisnalar', 'Çalışma takvimi']) {
      fireEvent.click(within(pane).getByRole('tab', { name: tab }));
      add = within(pane).queryByRole('button', { name: 'Geçiş ekle' });
      if (add) break;
    }
    fireEvent.click(add!);
    // The row is keyed by its family codes, so it is looked up again after each change.
    const ruleInput = (index: number) => {
      const ruleRows = pane.querySelectorAll<HTMLElement>('.calendar-override-row');
      return ruleRows[ruleRows.length - 1].querySelectorAll<HTMLInputElement>('input')[index];
    };
    fireEvent.change(ruleInput(0), { target: { value: 'A' } });
    fireEvent.change(ruleInput(1), { target: { value: 'B' } });
    fireEvent.change(ruleInput(2), { target: { value: '15' } });
    await act(async () => {
      fireEvent.click(within(pane).getByRole('button', { name: 'Kuralları kaydet' }));
    });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toEqual({
      method: 'PUT',
      path: '/api/manufacturing/work-centers/wc1/setup-rules',
      body: { rules: [{ fromSetupFamilyCode: 'A', toSetupFamilyCode: 'B', setupMinutes: 15, isTransitionAllowed: true }] },
    });
  });

  it('İş merkezi tanımla (create page): the POST body', async () => {
    renderScreen(<ManufacturingWorkCenterCreatePage token="t" onNavigate={vi.fn()} />);
    const name = await screen.findByPlaceholderText('Montaj hattı');
    fireEvent.change(name, { target: { value: 'Paketleme' } });
    fireEvent.change(screen.getByPlaceholderText('WC-MONTAJ'), { target: { value: 'WC-PKT' } });
    const numbers = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    fireEvent.change(numbers[0], { target: { value: '450' } });
    fireEvent.change(numbers[1], { target: { value: '120.5' } });
    fireEvent.change(numbers[2], { target: { value: '30' } });
    await act(async () => {
      fireEvent.submit(name.closest('form')!);
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'POST',
      path: '/api/manufacturing/work-centers/',
      body: { code: 'WC-PKT', name: 'Paketleme', capacityMinutesPerDay: 450, laborCostPerHourBase: 120.5, overheadCostPerHourBase: 30 },
    });
  });

  it('Malzeme planlama: plan history is in İşlemler', async () => {
    renderScreen(<ManufacturingMrpPage token="t" onNavigate={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Malzeme planlama' });
    await waitFor(() => expect(openMenu()).toEqual(['Plan geçmişi']));
  });
});

describe('Create / edit forms: request bodies', () => {
  function RecipeHarness() {
    const [section, setSection] = useState<'manufacturing-recipes' | 'manufacturing-recipe-create'>('manufacturing-recipes');
    return <ManufacturingPage token="t" section={section} onNavigate={(key) => setSection(key as typeof section)} />;
  }

  it('Reçete düzenle: the PUT body (lines, operations, rowVersion)', async () => {
    renderScreen(<RecipeHarness />);
    await screen.findByText('RC-ED reçetesi');
    fireEvent.click(within(row('RC-ED reçetesi')).getAllByText('Domates salçası 830 g')[0]);
    await waitFor(() => expect(enabled('open')).toBe(true));
    await act(async () => {
      fireEvent.click(command('open'));
    });
    const quantity = await screen.findByLabelText('Bileşen miktarı');
    fireEvent.change(quantity, { target: { value: '2.5' } });
    await act(async () => {
      fireEvent.submit(quantity.closest('form')!);
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'PUT',
      path: '/api/manufacturing/boms/b3',
      body: {
        code: 'RC-ED',
        name: 'RC-ED reçetesi',
        productStockItemId: 'st1',
        outputQuantity: 1,
        lines: [{ componentStockItemId: 's1', quantity: 2.5, scrapPercent: 5, standardUnitCostBase: 4 }],
        operations: [
          {
            sequence: 1, workCenterId: 'wc1', setupMinutes: 10, runMinutesPerOutputUnit: 2, minimumWaitDaysAfterPrevious: 0,
            setupFamilyCode: 'A', plannedEnergyKwhPerOutput: 0.5, plannedEnergyCostPerKwhBase: 3, eligibleWorkCenterIds: ['wc1', 'wc2'],
          },
        ],
        rowVersion: 'AA==',
      },
    });
  });

  it('Reçete düzenle: the route is a kit line table and its edits reach the PUT body; the navigator holds the checklist', async () => {
    renderScreen(<RecipeHarness />);
    await screen.findByText('RC-ED reçetesi');
    fireEvent.click(within(row('RC-ED reçetesi')).getAllByText('Domates salçası 830 g')[0]);
    await waitFor(() => expect(enabled('open')).toBe(true));
    await act(async () => {
      fireEvent.click(command('open'));
    });
    const navigator = await screen.findByRole('tablist', { name: 'Reçete bölümleri' });
    for (const name of [/Kimlik/, /Bileşenler/, /Rota/]) expect(within(navigator).getByRole('tab', { name })).toBeTruthy();
    expect(screen.queryByText('Kaydetmeden önce')).toBeNull();
    fireEvent.click(within(navigator).getByRole('tab', { name: /Rota/ }));
    const route = screen.getByRole('region', { name: 'Rota' }).querySelector('table.dd-lines')!;
    fireEvent.change(within(route as HTMLElement).getByLabelText('Kurulum (dk)'), { target: { value: '12' } });
    await act(async () => {
      fireEvent.submit(route.closest('form')!);
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect((writes[0].body as { operations: unknown[] }).operations).toEqual([
      {
        sequence: 1, workCenterId: 'wc1', setupMinutes: 12, runMinutesPerOutputUnit: 2, minimumWaitDaysAfterPrevious: 0,
        setupFamilyCode: 'A', plannedEnergyKwhPerOutput: 0.5, plannedEnergyCostPerKwhBase: 3, eligibleWorkCenterIds: ['wc1', 'wc2'],
      },
    ]);
  });

  it('Reçete oluştur: an invalid field in a hidden section opens that section', async () => {
    renderScreen(<ManufacturingRecipeCreatePage token="t" onNavigate={vi.fn()} />);
    const navigator = await screen.findByRole('tablist', { name: 'Reçete bölümleri' });
    expect(within(navigator).getByRole('tab', { selected: true }).textContent).toContain('Kimlik');
    // The empty component picker's required input sits in the hidden Bileşenler section.
    const components = document.querySelector<HTMLElement>('[data-rf-section="components"]')!;
    expect(components.hidden).toBe(true);
    const required = components.querySelector<HTMLElement>('input[required], select[required]')!;
    fireEvent.invalid(required);
    await waitFor(() => expect(within(navigator).getByRole('tab', { selected: true }).textContent).toContain('Bileşenler'));
    expect(components.hidden).toBe(false);
  });

  it('Yeni üretim emri: the POST body', async () => {
    renderScreen(<ManufacturingOrderCreatePage token="t" onNavigate={vi.fn()} />);
    const recipe = await screen.findByRole('combobox', { name: /Reçete/ });
    await waitFor(() => expect(within(recipe).queryByText('RC-ED · RC-ED reçetesi')).toBeTruthy());
    fireEvent.change(recipe, { target: { value: 'b3' } });
    fireEvent.change(screen.getByPlaceholderText('URE-2026-001'), { target: { value: 'URE-77' } });
    const quantity = document.querySelector<HTMLInputElement>('#manufacturing-order-create-form input[type="number"]')!;
    fireEvent.change(quantity, { target: { value: '40' } });
    fireEvent.change(document.querySelector<HTMLInputElement>('#manufacturing-order-create-form input[type="date"]')!, { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByText('Depo seçin'));
    fireEvent.click(await screen.findByRole('option', { name: /Üretim Deposu/ }));
    await act(async () => {
      fireEvent.submit(document.getElementById('manufacturing-order-create-form')!);
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'POST',
      path: '/api/manufacturing/orders/',
      body: {
        code: 'URE-77', billOfMaterialId: 'b3', warehouseId: 'w1', plannedQuantity: 40, plannedDate: '2026-12-01',
        sourceSalesOrderId: null, sourceSalesOrderLineNumber: null,
      },
    });
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
      'Ürün reçetesi', 'Üretim emri', 'Sıra', 'Stok kartı', 'Miktar', 'Fire %', 'Birim maliyet', 'Satır işlemleri', 'Bileşen ekle',
      'Bileşeni kaldır', 'Bileşenler', 'reçeteden, salt okunur', 'Gereken miktar', 'Planlanan maliyet', 'Kurulum dk', 'Çalışma dk',
      'Miktar reçete çıktısı başınadır; birim maliyet baz para birimindedir.',
      'İş merkezi kaydı', 'İş merkezi oluşturuldu.', 'Bir iş merkezi seçin ya da F2 ile yeni iş merkezi ekleyin.',
      'Çekirdek alanlar kayıttan sonra değiştirilemez; çalışma takvimi ve kurulum kuralları bu ekrandan ayarlanır.',
      'Reçete bölümleri', 'Kimlik', 'Rota / operasyonlar', '/ 50 operasyon · isteğe bağlı', 'Gelişmiş', 'Kurulum (dk)',
      'Rota isteğe bağlıdır; henüz operasyon yok.', 'Operasyon ekle (2/50)',
    ])
      if (localizedUiText(text) === text) missing.push(text);
    expect(missing).toEqual([]);
  });
});
