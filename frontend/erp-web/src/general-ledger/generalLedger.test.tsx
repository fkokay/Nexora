import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { localDateString } from '../erpApi';
import GeneralLedgerPage from '../GeneralLedgerPage';

const account = (id: string, code: string, name: string, isActive = true) => ({
  id, code, name, isActive, statementSection: 'Unclassified', hasMovements: false, accountType: 'Unclassified', normalBalance: 'Both',
  currencyCode: null, ifrsAccountCode: null, ifrsAccountName: null, ifrsStatementSection: 'Unclassified',
});
const accounts = [account('a100', '100', 'Kasa'), account('a320', '320', 'Satıcılar'), account('a770', '770', 'Genel yönetim giderleri')];
const entry = (id: string, code: string, sourceType: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, code, entryDate: '2026-11-16', description: `${code} açıklaması`, sourceType, sourceId: `src-${id}`, createdAt: '2026-11-16T10:00:00Z',
  accountingBasis: 'TDHP', totalDebit: amount, totalCredit: amount, ...extra,
});
const entries = [
  entry('e1', 'YF-2026-000416', 'Manual', 35000),
  entry('e2', 'YF-2026-000415', 'SalesInvoice', 86730),
  entry('e3', 'YF-2026-000410', 'Manual', 1850),
];
const detailOf = (summary: ReturnType<typeof entry>, isReversed = false) => ({
  ...summary,
  isReversed,
  lines: [
    { lineNumber: 1, accountId: 'a770', accountCode: '770', accountName: 'Genel yönetim giderleri', description: 'Kira', debit: summary.totalDebit, credit: 0 },
    { lineNumber: 2, accountId: 'a100', accountCode: '100', accountName: 'Kasa', description: 'Kira', debit: 0, credit: summary.totalCredit },
  ],
});
const emptySources = {
  baseCurrencyCode: 'TRY', salesInvoices: [], salesDeliveries: [], purchaseInvoices: [], purchaseReceipts: [], salesReturns: [], supplierReturns: [],
  customerCollections: [], supplierPayments: [], fxRevaluations: [], inventoryAdjustments: [],
};

const overrides = new Map<string, (url: string, init?: RequestInit) => unknown>();
function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  const override = overrides.get(path);
  if (override) return override(url, init);
  if (path === '/api/finance/general-ledger/accounts') return accounts;
  if (path === '/api/finance/general-ledger/mappings') return [];
  if (path === '/api/finance/general-ledger/sources') return emptySources;
  if (path === '/api/finance/general-ledger/entries') return { items: entries, page: 1, pageSize: 50, total: entries.length };
  if (path === '/api/finance/general-ledger/entries/e1') return detailOf(entries[0]);
  if (path === '/api/finance/general-ledger/entries/e2') return detailOf(entries[1]);
  if (path === '/api/finance/general-ledger/entries/e3') return detailOf(entries[2], true);
  if (path === '/api/finance/general-ledger/entries/manual') return { ...entry('n1', 'YF-2026-000500', 'Manual', 1250.5) };
  if (path.endsWith('/reverse')) return entry('r1', 'YF-2026-000501', 'ManualReversal', 35000, { sourceId: 'e1' });
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return [];
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
  apiMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  overrides.clear();
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

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const posts = (path: string) =>
  apiMock.mock.calls.filter(([url, , init]) => url === path && (init as RequestInit | undefined)?.method === 'POST');
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));

function pickAccount(index: number, code: string) {
  const input = screen.getByRole('combobox', { name: `${index}. satır hesabı` });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: code } });
  fireEvent.blur(input);
}
const voucherForm = () => screen.getByRole('combobox', { name: '1. satır hesabı' }).closest('form')!;

describe('Yevmiye fişi (characterization)', () => {
  it('posts the same manual entry body: date, basis, description, filled lines only, fallback line description', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    fireEvent.change(screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi'), { target: { value: 'Kira tahakkuku' } });
    pickAccount(1, '770');
    fireEvent.change(screen.getByRole('textbox', { name: '1. satır borç' }), { target: { value: '1.250,50' } });
    pickAccount(2, '100');
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır alacak' }), { target: { value: '1250,50' } });
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır açıklaması' }), { target: { value: 'Kasa çıkışı' } });
    fireEvent.submit(voucherForm());
    await settle();
    const calls = posts('/api/finance/general-ledger/entries/manual');
    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0])).toEqual({
      entryDate: localDateString(),
      accountingBasis: 'TDHP',
      description: 'Kira tahakkuku',
      lines: [
        { accountId: 'a770', description: 'Kira tahakkuku', debit: 1250.5, credit: 0 },
        { accountId: 'a100', description: 'Kasa çıkışı', debit: 0, credit: 1250.5 },
      ],
    });
    expect(await screen.findByText('YF-2026-000500 manuel yevmiye fişi kaydedildi.')).toBeTruthy();
  });

  it('does not post an unbalanced voucher and says which side to fix', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    fireEvent.change(screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi'), { target: { value: 'Dengesiz' } });
    pickAccount(1, '770');
    fireEvent.change(screen.getByRole('textbox', { name: '1. satır borç' }), { target: { value: '100' } });
    pickAccount(2, '100');
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır alacak' }), { target: { value: '90' } });
    fireEvent.submit(voucherForm());
    await settle();
    expect(posts('/api/finance/general-ledger/entries/manual')).toHaveLength(0);
    expect(screen.getByText('Fiş dengeli değil: alacağa 10,00 ekleyin ya da borcu azaltın.')).toBeTruthy();
  });

  it('shows the server error (e.g. a closed fiscal period) and keeps the lines', async () => {
    overrides.set('/api/finance/general-ledger/entries/manual', () => {
      throw new Error('Kapalı mali döneme kayıt yapılamaz.');
    });
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    fireEvent.change(screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi'), { target: { value: 'Kapalı dönem' } });
    pickAccount(1, '770');
    fireEvent.change(screen.getByRole('textbox', { name: '1. satır borç' }), { target: { value: '5' } });
    pickAccount(2, '100');
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır alacak' }), { target: { value: '5' } });
    fireEvent.submit(voucherForm());
    await settle();
    expect(screen.getByText('Kapalı mali döneme kayıt yapılamaz.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: '1. satır borç' }) as HTMLInputElement).value).toBe('5');
  });

  it('Enter on the last line amount adds a line and does not save', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    expect(screen.getAllByRole('combobox', { name: /satır hesabı/ })).toHaveLength(3);
    fireEvent.keyDown(screen.getByRole('textbox', { name: '3. satır borç' }), { key: 'Enter' });
    await settle(50);
    expect(screen.getAllByRole('combobox', { name: /satır hesabı/ })).toHaveLength(4);
    expect(posts('/api/finance/general-ledger/entries/manual')).toHaveLength(0);
  });

  it('a firm user cannot enter a voucher', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantUser" view="voucher" />);
    await settle();
    expect(screen.getByText('Yevmiye fişi kaydetmek için firma yöneticisi yetkisi gerekir.')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: '1. satır hesabı' })).toBeNull();
  });
});
