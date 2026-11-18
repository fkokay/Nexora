import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import GeneralLedgerPage from '../GeneralLedgerPage';

const accounts = [{ id: 'a600', code: '600', name: 'Yurt içi satışlar', isActive: true, statementSection: 'Revenue', hasMovements: true }];
const mappings = [
  { mappingKey: 'SalesRevenue', label: 'Satış geliri', accountId: 'a600', accountCode: '600', accountName: 'Yurt içi satışlar' },
  { mappingKey: 'PurchasePayable', label: 'Satıcılar', accountId: null, accountCode: null, accountName: null },
];
const src = (id: string, code: string, amount: number, requiredMappings: string[]) => ({
  id, code, entryDate: '2026-11-16', description: `${code} açıklama`, amount, currencyCode: 'TRY', requiredMappings,
});
const sources = {
  baseCurrencyCode: 'TRY',
  salesInvoices: [src('s1', 'SF-1', 1000, ['SalesRevenue']), src('s2', 'SF-2', 500, ['SalesRevenue'])],
  salesDeliveries: [], salesReturns: [],
  purchaseInvoices: [src('p1', 'AF-1', 300, ['PurchasePayable'])],
  purchaseReceipts: [], supplierReturns: [], customerCollections: [], supplierPayments: [], fxRevaluations: [], inventoryAdjustments: [],
};
const preview = (sourceId: string) => ({
  sourceType: sourceId === 'p1' ? 'PurchaseInvoice' : 'SalesInvoice', sourceId, code: null, entryDate: '2026-11-16', description: null,
  lines: [
    { lineNumber: 1, accountId: 'a120', accountCode: '120', accountName: 'Alıcılar', description: 'x', debit: 1000, credit: 0 },
    { lineNumber: 2, accountId: 'a600', accountCode: '600', accountName: 'Yurt içi satışlar', description: 'x', debit: 0, credit: 1000 },
  ],
  totalDebit: 1000, totalCredit: 1000,
  canTransfer: sourceId !== 'p1' && sourceId !== 's2',
  blockingReason: sourceId === 's2' ? 'Kapalı mali döneme kayıt yapılamaz.' : sourceId === 'p1' ? 'Hesap eşleştirmesi eksik.' : null,
});

function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/general-ledger/accounts') return accounts;
  if (path === '/api/finance/general-ledger/mappings') return mappings;
  if (path === '/api/finance/general-ledger/sources') return sources;
  if (path === '/api/finance/general-ledger/transfer/preview') return preview(JSON.parse(String(init?.body)).sourceId);
  if (path === '/api/finance/general-ledger/transfer') return { id: 'e1', code: 'YF-1', totalDebit: 1000, totalCredit: 1000 };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return {};
}
const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
  }
  apiMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
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
async function settle(ms = 450) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
/** Requests to `path` (exact, without query), in order, as { method, body }. */
const calls = (path: string) =>
  apiMock.mock.calls
    .map(([url, , init]) => ({ url: String(url), init: init as RequestInit | undefined }))
    .filter(({ url }) => url.split('?')[0] === path)
    .map(({ init }) => ({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }));
const PREVIEW = '/api/finance/general-ledger/transfer/preview';
const TRANSFER = '/api/finance/general-ledger/transfer';
const SOURCES = '/api/finance/general-ledger/sources';

// --- Interaction steps (the only part that follows the UI) ---
async function previewRow(code: string) {
  fireEvent.click(screen.getAllByText(code)[0].closest('tr')!);
  await settle();
}
// The commands are in İşlemler; a disabled menu item is reported through `disabled` like the former button.
function menuItem(id: string) {
  if (!document.querySelector('[role="menu"]')) {
    const bar = screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
    fireEvent.click(bar.querySelector<HTMLElement>('[data-command="more"]')!);
  }
  const item = document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`)!;
  Object.defineProperty(item, 'disabled', { configurable: true, get: () => item.getAttribute('aria-disabled') === 'true' });
  return item as HTMLElement & { disabled: boolean };
}
const transferOneButton = () => menuItem('transfer-one');
async function transferPreviewed() {
  fireEvent.click(transferOneButton());
  await settle(50);
  fireEvent.click(screen.getByRole('button', { name: 'Evet, aktar' }));
  await settle();
}
async function tickRows(numbers: number[]) {
  for (const number of numbers) fireEvent.click(screen.getByLabelText(`Satırı seç ${number}`));
  await settle(50);
}
async function transferTicked() {
  fireEvent.click(menuItem('transfer-selected'));
  await settle(50);
  const confirm = screen.queryByRole('button', { name: 'Aktar' });
  if (confirm) fireEvent.click(confirm);
  await settle();
}
// ---

describe('Aktarılabilir Kaynaklar (characterization)', () => {
  it('loads accounts, mappings and sources, then previews the first row and the row the user picks', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="transfer-sources" />);
    await settle(1200);
    await settle();
    expect(calls('/api/finance/general-ledger/accounts')[0]).toEqual({ method: 'GET', body: undefined });
    expect(calls('/api/finance/general-ledger/mappings')[0]).toEqual({ method: 'GET', body: undefined });
    expect(calls(SOURCES)[0]).toEqual({ method: 'GET', body: undefined });
    expect(calls(PREVIEW).at(-1)).toEqual({ method: 'POST', body: { sourceType: 'SalesInvoice', sourceId: 's1' } });
    await previewRow('AF-1');
    expect(calls(PREVIEW).at(-1)).toEqual({ method: 'POST', body: { sourceType: 'PurchaseInvoice', sourceId: 'p1' } });
    expect(calls(TRANSFER)).toEqual([]);
  });

  it('transfers the previewed source after the confirmation, then reloads the sources', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="transfer-sources" />);
    await settle(1200);
    await settle();
    const loads = calls(SOURCES).length;
    await transferPreviewed();
    expect(calls(TRANSFER)).toEqual([{ method: 'POST', body: { sourceType: 'SalesInvoice', sourceId: 's1' } }]);
    expect(calls(SOURCES).length).toBe(loads + 1);
  });

  it('a source the preview blocks (closed fiscal period) cannot be transferred', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="transfer-sources" />);
    await settle(1200);
    await settle();
    await previewRow('SF-2');
    expect(calls(PREVIEW).at(-1)).toEqual({ method: 'POST', body: { sourceType: 'SalesInvoice', sourceId: 's2' } });
    expect(screen.getByText('Kapalı mali döneme kayıt yapılamaz.')).toBeTruthy();
    expect(transferOneButton().disabled).toBe(true);
    fireEvent.click(transferOneButton());
    await settle(50);
    expect(calls(TRANSFER)).toEqual([]);
  });

  // Today's behaviour, pinned as found (controller ruling: not fixed): the grid reports ticked rows by its internal React
  // keys (".0:$SalesInvoice-s1"), which never equal the page's row keys, so "Seçilenleri aktar" stays at (0) and nothing is
  // posted. Fixing it would open a GL-posting path without the closed-period preview check.
  it('bulk transfer today: ticked rows are not recognised, so no POST is sent', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="transfer-sources" />);
    await settle(1200);
    await settle();
    await tickRows([1, 2, 3]);
    // The visible symptom: the item still counts none and stays closed with its reason.
    const item = menuItem('transfer-selected');
    expect(item.textContent).toContain('Seçilenleri aktar (0)');
    expect(item.disabled).toBe(true);
    expect(item.getAttribute('title')).toBe('Aktarıma hazır kaynakları işaretleyin');
    await transferTicked();
    expect(calls(TRANSFER)).toEqual([]);
  });

  it('a company user sees no transfer list and sends no preview', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantUser" view="transfer-sources" />);
    await settle(1200);
    await settle();
    expect(calls(PREVIEW)).toEqual([]);
    expect(screen.queryByText('SF-1')).toBeNull();
  });
});
