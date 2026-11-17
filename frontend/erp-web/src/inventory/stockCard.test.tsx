import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import InventoryStockPage from '../InventoryStockPage';
import { ConfirmDialogHost } from '../confirmDialog';
import type { StockItem } from '../erp-types';
import {
  STOCK_CARD_DEFAULTS,
  STOCK_CARD_SECTION_FIELDS,
  changedCustomFields,
  changedStockCardFields,
  stockCardCompletion,
  stockCardSectionState,
  stockCardSummary,
  stockCardValuesOf,
} from './stockCardForm';

const warehouses = [{ id: 'w1', code: 'D1', name: 'Merkez Depo', isActive: true, rowVersion: 'AA' }];
const card = (id: string, code: string, name: string, extra: Partial<StockItem> = {}): StockItem => ({
  id, code, name, barcode: null, unitCode: 'ADET', category: 'Ambalaj', minimumStock: 500, isActive: true,
  createdAt: '2026-03-02T09:00:00Z', rowVersion: 'AA', trackingMode: 'None', procurementLeadTimeDays: 5,
  manufacturingLeadTimeDays: 0, maximumStock: 2000, ...extra,
});
const balance = (id: string, code: string, name: string, onHand: number, available: number, minimum: number, value: number) => ({
  stockItemId: id, code, name, unitCode: 'ADET', minimumStock: minimum, quantityOnHand: onHand, belowMinimum: onHand < minimum,
  reservedQuantity: onHand - available, availableQuantity: available, valuationAmountBase: value, unvaluedQuantity: 0, baseCurrencyCode: 'TRY',
});
const rows = [
  { balance: balance('s1', 'AMB-1010', 'Koli 20×20', 900, 900, 100, 9000), stockItem: card('s1', 'AMB-1010', 'Koli 20×20', { minimumStock: 100 }) },
  {
    balance: balance('s2', 'AMB-2040', 'Koli 40×30×30 çift oluklu', 420, 160, 500, 14700),
    stockItem: card('s2', 'AMB-2040', 'Koli 40×30×30 çift oluklu', { barcode: '8690000204012', trackingMode: 'Lot' }),
  },
  { balance: balance('s3', 'AMB-3050', 'Koli 50×40', 50, 50, 10, 1000), stockItem: card('s3', 'AMB-3050', 'Koli 50×40', { minimumStock: 10, isActive: true }) },
];
const listPage = { items: rows, page: 1, pageSize: 25, totalCount: 3, belowMinimumCount: 1 };

function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  if (init?.method === 'DELETE') return undefined;
  if (init?.method === 'PUT' && path.startsWith('/api/stock/items/')) return rows[1].stockItem;
  if (path === '/api/warehouses/') return warehouses;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/stock/categories/') return [];
  if (path.endsWith('/locations')) return [];
  if (path.startsWith('/api/tenant-settings/')) return { allowNegativeStock: false };
  if (path.endsWith('/units')) return { conversions: [{ id: 'u1', unitCode: 'KOLI', factorToBase: 25, isActive: true }] };
  if (path.endsWith('/variants')) return [];
  if (path === '/api/manufacturing/boms/')
    return [
      { id: 'b1', code: 'R-1', name: 'Koli montaj', productStockItemId: 's2', outputQuantity: 1, isActive: true, lines: [] },
      { id: 'b2', code: 'R-2', name: 'Koli baskı', productStockItemId: 's2', outputQuantity: 1, isActive: true, lines: [] },
    ];
  if (path === '/api/audit-events')
    return {
      items: [
        { id: 3, action: 'stock-item.updated', resource: 'AMB-2040-RED', userId: 'u2', userDisplayName: 'Ali V.', occurredAt: '2026-11-09T10:00:00Z' },
        { id: 2, action: 'stock-item.updated', resource: 'AMB-2040', userId: 'u1', userDisplayName: 'Ayşe K.', occurredAt: '2026-11-08T10:00:00Z' },
        { id: 1, action: 'stock-item.created', resource: 'AMB-2040', userId: 'u1', userDisplayName: 'Ayşe K.', occurredAt: '2026-03-02T09:00:00Z' },
      ],
      page: 1, pageSize: 20, totalCount: 3,
    };
  if (path === '/api/warehouses/balances/page') return listPage;
  return { items: [], page: 1, pageSize: 25, totalCount: 0, belowMinimumCount: 0 };
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) =>
    new Response(JSON.stringify(respond(url, init) ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  apiMock.mockImplementation(async (url: string, _token?: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  localStorage.clear();
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function renderStock(role = 'TenantAdmin', section?: 'inventory-stock-create') {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        <InventoryStockPage token="t" role={role} section={section} />
      </KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
const scroller = () => document.querySelector<HTMLElement>('.advanced-grid-scroll')!;
const form = () => document.querySelector<HTMLElement>('.inventory-item-record-form')!;
const header = () => form().querySelector<HTMLElement>('.rf-toolbar')!;
const navItem = (label: string) => within(form().parentElement!).getByRole('tab', { name: new RegExp(label) });

/** Opens AMB-2040 (the 2nd row) from the list with the keyboard. */
async function openSecondCard(role = 'TenantAdmin') {
  renderStock(role);
  await waitFor(() => expect(screen.getAllByText('Koli 20×20').length).toBeGreaterThan(0));
  await settle();
  scroller().focus();
  fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
  fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
  fireEvent.keyDown(scroller(), { key: 'Enter' });
  await waitFor(() => expect(screen.getByDisplayValue('AMB-2040')).toBeTruthy());
  await settle();
}

describe('stock card form helpers', () => {
  it('takes the baseline in form shape, so a loaded card has no changed field', () => {
    const item = card('x', 'K-1', 'Kart', { maximumStock: null, barcode: null, purchaseVatPercent: undefined });
    const values = stockCardValuesOf(item);
    expect(values.maximumStock).toBe('');
    expect(values.purchaseVatPercent).toBe('20');
    expect(changedStockCardFields(values, stockCardValuesOf(item))).toEqual([]);
    expect(changedStockCardFields({ ...values, minimumStock: '1000', name: 'Yeni' }, values)).toEqual(['name', 'minimumStock']);
    expect(changedCustomFields({ A: '1', B: '' }, { A: '1' })).toEqual([]);
    expect(changedCustomFields({ A: '2' }, { A: '1' })).toEqual(['A']);
  });

  it('section states: error for a required-empty or invalid field, done when filled, empty otherwise', () => {
    const values = { ...STOCK_CARD_DEFAULTS, code: 'K-1', name: 'Kart' };
    expect(stockCardSectionState(values, STOCK_CARD_SECTION_FIELDS.basic)).toBe('done');
    expect(stockCardSectionState({ ...values, name: ' ' }, STOCK_CARD_SECTION_FIELDS.basic)).toBe('error');
    expect(stockCardSectionState({ ...values, minimumStock: '-1' }, STOCK_CARD_SECTION_FIELDS.basic)).toBe('error');
    expect(stockCardSectionState({ ...values, salesVatPercent: '120' }, STOCK_CARD_SECTION_FIELDS.pricing)).toBe('error');
    expect(stockCardSectionState({ ...values, priceCurrencyCode: 'TR' }, STOCK_CARD_SECTION_FIELDS.pricing)).toBe('error');
    expect(stockCardSectionState(values, STOCK_CARD_SECTION_FIELDS.logistics)).toBe('empty');
    expect(stockCardSectionState({ ...values, netWeight: '1.5' }, STOCK_CARD_SECTION_FIELDS.logistics)).toBe('done');
    expect(stockCardSectionState(values, [], { extraFilled: 2 })).toBe('done');
    expect(stockCardSectionState(values, [], { invalid: true })).toBe('error');
    // New card: an untouched required field does not show "error", and defaults are not values.
    const blank = STOCK_CARD_DEFAULTS;
    const newCard = { reportable: () => false, hasValue: (key: keyof typeof blank) => blank[key] !== values[key] && values[key] !== '' };
    expect(stockCardSectionState(blank, STOCK_CARD_SECTION_FIELDS.basic, { reportable: () => false })).toBe('empty');
    expect(stockCardSectionState(blank, STOCK_CARD_SECTION_FIELDS.basic, { reportable: (key) => key === 'name' })).toBe('error');
    expect(stockCardSectionState(blank, STOCK_CARD_SECTION_FIELDS.pricing, { hasValue: () => false })).toBe('empty');
    expect(stockCardSectionState(values, STOCK_CARD_SECTION_FIELDS.basic, newCard)).toBe('done');
  });

  it('completion counts entered values and filled required fields only (defaults do not count)', () => {
    const all = [...STOCK_CARD_SECTION_FIELDS.basic, ...STOCK_CARD_SECTION_FIELDS.pricing, ...STOCK_CARD_SECTION_FIELDS.logistics];
    const full = Object.fromEntries(all.map((key) => [key, '1'])) as unknown as typeof STOCK_CARD_DEFAULTS;
    expect(stockCardCompletion(full, [])).toBe(100);
    expect(stockCardCompletion(full, ['', ''])).toBe(Math.round((all.length / (all.length + 2)) * 100));
    // A blank new card: only the pre-filled required unit (EA) and currency (TRY) count.
    expect(stockCardCompletion(STOCK_CARD_DEFAULTS, [])).toBe(Math.round((2 / all.length) * 100));
    expect(stockCardCompletion({ ...STOCK_CARD_DEFAULTS, salesVatPercent: '10', minimumStock: '0' }, [])).toBe(Math.round((3 / all.length) * 100));
    expect(stockCardSummary(card('x', 'K', 'K', { trackingMode: 'Lot' }))).toBe('Ambalaj · ADET · Lot takipli');
    expect(stockCardSummary(card('x', 'K', 'K', { category: null }))).toBe('ADET');
  });
});

describe('Stok kartı record screen (mockup 01 record part)', () => {
  it('header: image box, name, code, status tags, summary; navigator states, counts and completion', async () => {
    await openSecondCard();
    expect(header().querySelector('h1')!.textContent).toBe('Koli 40×30×30 çift oluklu');
    expect(header().querySelector('.rf-media')!.textContent).toBe('Görsel');
    const meta = header().querySelector<HTMLElement>('.rf-meta')!;
    expect(meta.querySelector('.rf-code')!.textContent).toBe('AMB-2040');
    expect(Array.from(meta.querySelectorAll('.nx-status-tag')).map((tag) => tag.textContent)).toEqual(['Aktif', 'Minimum altı']);
    expect(meta.textContent).toContain('Ambalaj · ADET · Lot takipli');
    // The code stays editable (the API accepts a new code) and a change is marked like any other field.
    const codeInput = screen.getByDisplayValue('AMB-2040') as HTMLInputElement;
    expect(codeInput.readOnly).toBe(false);
    fireEvent.change(codeInput, { target: { value: 'AMB-2041' } });
    expect(codeInput.closest('.rf-changed')!.textContent).toContain('Önceki: AMB-2040');
    expect(header().querySelector('.rf-dirty')!.textContent).toBe('1 alan değişti');
    fireEvent.change(codeInput, { target: { value: 'AMB-2040' } });
    // Cards of the first section in mockup order.
    const titles = Array.from(form().querySelectorAll('.rf-group-head h2')).map((h) => h.textContent);
    expect(titles.slice(0, 3)).toEqual(['Kimlik', 'Stok yönetimi', 'Birim dönüşümleri']);
    expect(within(form()).getByRole('table', { name: 'Birim dönüşümleri' }).textContent).toContain('KOLI');
    // Navigator: states and counts.
    expect(navItem('Genel ve Stok Yönetimi').querySelector('.rf-snav-state')!.className).toContain('is-done');
    expect(navItem('Lojistik ve Muhasebe').querySelector('.rf-snav-state')!.className).toContain('is-empty');
    expect(navItem('Varyantlar').querySelector('small')!.textContent).toBe('0');
    expect(navItem('Üretim Reçeteleri').querySelector('small')!.textContent).toBe('2');
    expect(screen.getByRole('progressbar', { name: 'Kart doluluğu' }).getAttribute('aria-valuenow')).toMatch(/^\d+$/);
    // No change yet.
    expect(header().querySelector('.rf-dirty')).toBeNull();
  });

  it('counts changed fields, marks them with the previous value and keeps the input while typing', async () => {
    await openSecondCard();
    const minimum = screen.getByLabelText('Minimum stok') as HTMLInputElement;
    minimum.focus();
    fireEvent.change(minimum, { target: { value: '1000' } });
    expect(screen.getByLabelText('Minimum stok')).toBe(minimum);
    expect(minimum.closest('.rf-changed')!.textContent).toContain('Önceki: 500');
    fireEvent.change(screen.getByLabelText('Maksimum stok'), { target: { value: '3000' } });
    expect(header().querySelector('.rf-dirty')!.textContent).toBe('2 alan değişti');
    // Back to the loaded value: no longer counted or marked.
    fireEvent.change(minimum, { target: { value: '500' } });
    expect(minimum.closest('.rf-changed')).toBeNull();
    expect(header().querySelector('.rf-dirty')!.textContent).toBe('1 alan değişti');
    // A required field left empty puts its section in the error state.
    fireEvent.change(screen.getByLabelText(/Stok adı/), { target: { value: '' } });
    expect(navItem('Genel ve Stok Yönetimi').querySelector('.rf-snav-state')!.className).toContain('is-error');
  });

  it('PgUp / PgDn walk the list order; a changed card asks first', async () => {
    await openSecondCard();
    const nav = within(header()).getByRole('group', { name: 'Kayıtlar arası gezinme' });
    expect(nav.textContent).toContain('2 / 3');
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    await waitFor(() => expect(screen.getByDisplayValue('AMB-3050')).toBeTruthy());
    expect(within(header()).getByRole('group', { name: 'Kayıtlar arası gezinme' }).textContent).toContain('3 / 3');
    // The last row of the loaded page: Sonraki is disabled and says why.
    const next = within(header()).getByRole('button', { name: 'Sonraki kayıt' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(next.title).toBe('Listenin bu sayfasının sonu');
    fireEvent.change(screen.getByLabelText('Minimum stok'), { target: { value: '77' } });
    fireEvent.keyDown(document.body, { key: 'PageUp' });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByDisplayValue('AMB-3050')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'PageUp' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await waitFor(() => expect(screen.getByDisplayValue('AMB-2040')).toBeTruthy());
    // Esc on the untouched card closes it without asking.
    await settle();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.inventory-item-record-form')).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('context panel: stock status from the list row and the card audit history (admin only)', async () => {
    await openSecondCard();
    const aside = form().querySelector<HTMLElement>('.rf-aside')!;
    // jsdom is narrower than 1280px: the panel starts closed and Ctrl+. opens it.
    if (aside.hidden) fireEvent.keyDown(document.body, { key: '.', ctrlKey: true });
    expect(aside.hidden).toBe(false);
    const status = within(aside).getByRole('region', { name: 'Stok durumu' });
    expect(status.textContent).toContain('420 ADET');
    expect(status.textContent).toContain('160 ADET');
    expect(status.textContent).toContain('35,00 TRY');
    expect(status.textContent).toContain('14.700,00 TRY');
    const history = await within(aside).findByRole('region', { name: 'Geçmiş' });
    await waitFor(() => expect(history.textContent).toContain('Ayşe K.'));
    expect(history.textContent).not.toContain('Ali V.');
    expect(within(aside).queryByRole('region', { name: 'Açık belgeler' })).toBeNull();
    cleanup();
    apiMock.mockClear();
    await openSecondCard('TenantUser');
    expect(apiMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/audit-events'), 't');
    expect(within(form().querySelector<HTMLElement>('.rf-aside')!).queryByRole('region', { name: 'Geçmiş' })).toBeNull();
  });

  it('create mode: no change note until something is entered, no record navigation or context panel', async () => {
    renderStock('TenantUser', 'inventory-stock-create');
    await waitFor(() => expect(screen.getByPlaceholderText('STK-1001')).toBeTruthy());
    await settle();
    expect(header().querySelector('.rf-dirty')).toBeNull();
    expect(within(header()).queryByRole('group', { name: 'Kayıtlar arası gezinme' })).toBeNull();
    expect(form().querySelector('.rf-aside')).toBeNull();
    expect((screen.getByPlaceholderText('STK-1001') as HTMLInputElement).readOnly).toBe(false);
    // Untouched sections are empty, not errors (defaults such as TRY / 20 are not entries).
    const state = (label: string) => navItem(label).querySelector('.rf-snav-state')!.className;
    expect(state('Genel ve Stok Yönetimi')).toContain('is-empty');
    expect(state('Fiyat ve Vergi')).toContain('is-empty');
    fireEvent.change(screen.getByPlaceholderText('Stok adı'), { target: { value: 'Vida' } });
    expect(header().querySelector('.rf-dirty')!.textContent).toBe('Kaydedilmemiş değişiklik var');
    // The code is still untouched: no error yet.
    expect(state('Genel ve Stok Yönetimi')).toContain('is-empty');
    // A touched required field left empty is an error.
    fireEvent.change(screen.getByPlaceholderText('Stok adı'), { target: { value: '' } });
    expect(state('Genel ve Stok Yönetimi')).toContain('is-error');
  });

  it('create mode: a save attempt shows the errors of untouched required fields', async () => {
    renderStock('TenantUser', 'inventory-stock-create');
    await waitFor(() => expect(screen.getByPlaceholderText('STK-1001')).toBeTruthy());
    await settle();
    const state = (label: string) => navItem(label).querySelector('.rf-snav-state')!.className;
    expect(state('Genel ve Stok Yönetimi')).toContain('is-empty');
    const code = screen.getByPlaceholderText('STK-1001');
    code.focus();
    fireEvent.keyDown(code, { key: 's', ctrlKey: true });
    await waitFor(() => expect(state('Genel ve Stok Yönetimi')).toContain('is-error'));
    expect(apiMock).not.toHaveBeenCalledWith('/api/stock/items/', 't', expect.objectContaining({ method: 'POST' }));
  });
});
