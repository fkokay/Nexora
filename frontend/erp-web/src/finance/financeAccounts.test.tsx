import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { FinancePage } from '../FinancePages';

const account = (id: string, code: string, name: string, type: 'Cash' | 'Bank', balance: number, transactionCount: number, isActive = true) => ({
  id, code, name, type, currencyCode: 'TRY', balance, transactionCount, isActive, createdAt: '2026-01-02T10:00:00Z',
});
const accounts = [
  account('b1', 'BNK-01', 'Ana banka', 'Bank', 2500, 4),
  account('b2', 'BNK-02', 'Kredi kartı hesabı', 'Bank', -1000, 2),
  account('b3', 'BNK-03', 'Yeni banka', 'Bank', 0, 0),
  account('c1', 'KASA-01', 'Merkez kasa', 'Cash', 800, 3),
];
const movement = (id: string, direction: 'Inflow' | 'Outflow', amount: number, sourceType: string | null, extra: Record<string, unknown> = {}) => ({
  id, transactionDate: '2026-11-10', direction, amount, currencyCode: 'TRY', description: `${id} açıklaması`, reference: null, sourceType,
  sourceCode: null, reversalOfId: null, createdAt: '2026-11-10T10:00:00Z', transferId: null, cashFlowCategory: 'Unclassified', ...extra,
});
const detailOf = (id: string) => {
  const row = accounts.find((item) => item.id === id)!;
  return {
    id: row.id, code: row.code, name: row.name, type: row.type, currencyCode: row.currencyCode, isActive: row.isActive, balance: row.balance,
    createdAt: row.createdAt, transactionPage: 1, transactionPageSize: 50, transactionTotalCount: 3,
    transactions: [
      movement('m1', 'Inflow', 3000, 'Manuel hareket'),
      movement('m2', 'Outflow', 500, 'Hesap transferi', { transferId: 't1', sourceCode: 'TR-1' }),
      movement('m3', 'Outflow', 100, null, { reversalOfId: 'm0' }),
    ],
  };
};

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/accounts') return accounts;
  const m = path.match(/^\/api\/finance\/accounts\/([^/]+)$/);
  if (m) return detailOf(m[1]);
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
  apiMock.mockImplementation(async (url: string) => respond(url));
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
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const reason = (id: string) => command(id).getAttribute('title') ?? '';
function menuItem(id: string) {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(command('more'));
  return document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`)!;
}
const closeMenu = () => {
  if (document.querySelector('[role="menu"]')) fireEvent.click(command('more'));
};
const grid = () => document.querySelector<HTMLElement>('.list-v2-list table')!;
const row = (code: string) => within(grid()).getByText(code).closest('tr')!;
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.nx-summary-item')).map((card) =>
    Array.from(card.querySelectorAll('.nx-summary-text > *'))
      .map((part) => part.textContent?.replace(/\s+/g, ' ').trim())
      .join(' '),
  );
const posts = (path: string) =>
  apiMock.mock.calls.filter(([url, , init]) => String(url) === path && (init as RequestInit | undefined)?.method === 'POST');

describe('Bankalar / Kasalar list', () => {
  it('shows the list type: balance and negative-balance cards, status tags, no row buttons, nothing current', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-banks" />);
    await settle();
    expect(cards()).toEqual(['Toplam bakiye 1.500,00 TRY tüm banka hesapları', 'Eksi bakiyeli hesap 1 tüm banka hesapları']);
    expect(within(row('BNK-02')).getByText('-1.000,00 TRY').closest('td')!.className).toContain('nx-num');
    expect(within(row('BNK-01')).getByText('Aktif').className).toContain('is-ok');
    expect(within(grid()).queryByRole('button', { name: 'Pasifleştir' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Yeni banka/ })).toBeNull();
    expect(reason('open')).toBe('Önce bir kayıt seçin');
    expect(reason('delete')).toBe('Önce bir kayıt seçin');
    expect(within(grid()).queryByText('KASA-01')).toBeNull();
  });

  it('the negative-balance card filters the list', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-banks" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Eksi bakiyeli hesap/ }));
    await settle(50);
    expect(within(grid()).queryByText('BNK-01')).toBeNull();
    expect(within(grid()).getByText('BNK-02')).toBeTruthy();
  });

  it('a kasa list has no negative-balance card', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-accounts" />);
    await settle();
    expect(cards()).toEqual(['Toplam bakiye 800,00 TRY tüm kasa hesapları']);
  });

  it('Sil keeps today\'s rule; Pasifleştir in İşlemler posts the same status change', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-banks" />);
    await settle();
    fireEvent.click(row('BNK-01').cells[2]);
    await settle(50);
    expect(reason('delete')).toBe('Hareketi olan hesap silinemez; pasifleştirin.');
    fireEvent.click(menuItem('account-status'));
    await settle();
    expect(posts('/api/finance/accounts/b1/status?isActive=false')).toHaveLength(1);
    fireEvent.click(row('BNK-03').cells[2]);
    await settle(50);
    expect(command('delete').getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('Hesap ekstresi', () => {
  it('a double click opens the statement; reversals act on the selected movement with today\'s conditions', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-banks" />);
    await settle();
    fireEvent.doubleClick(row('BNK-01').cells[2]);
    await settle();
    const surface = document.querySelector<HTMLElement>('.doc-surface')!;
    expect(surface).toBeTruthy();
    expect(within(surface).getAllByText('BNK-01').length).toBeGreaterThan(0);
    expect(surface.textContent).toContain('3.000,00 TRY');
    expect(reason('save')).toBe('Hesap ekstresi salt okunurdur');
    expect(reason('filter')).toBe('Belge açıkken kullanılamaz');
    expect(menuItem('movement-void').getAttribute('title')).toBe('Önce ekstreden bir hareket seçin');
    closeMenu();
    fireEvent.click(within(surface).getByText('m3 açıklaması'));
    expect(menuItem('movement-void').getAttribute('title')).toBe('Ters kayıt satırı iptal edilemez');
    closeMenu();
    fireEvent.click(within(surface).getByText('m2 açıklaması'));
    expect(menuItem('movement-void').getAttribute('title')).toBe('Yalnız manuel hareket iptal edilir');
    expect(menuItem('transfer-void').getAttribute('aria-disabled')).toBeNull();
    closeMenu();
    fireEvent.click(within(surface).getByText('m1 açıklaması'));
    fireEvent.click(menuItem('movement-void'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ters kayıtla iptal et' }));
    await settle();
    expect(posts('/api/finance/accounts/b1/transactions/m1/void')).toHaveLength(1);
  });

  it('Transferi iptal et posts the same transfer void for the selected transfer movement', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-banks" />);
    await settle();
    fireEvent.doubleClick(row('BNK-01').cells[2]);
    await settle();
    const surface = document.querySelector<HTMLElement>('.doc-surface')!;
    fireEvent.click(within(surface).getByText('m2 açıklaması'));
    fireEvent.click(menuItem('transfer-void'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ters kayıtla iptal et' }));
    await settle();
    expect(posts('/api/finance/transfers/t1/void')).toHaveLength(1);
  });

  it('Transfer / döviz opens in the drawer and posts the same transfer body', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-banks" />);
    await settle();
    fireEvent.doubleClick(row('BNK-01').cells[2]);
    await settle();
    fireEvent.click(menuItem('account-transfer'));
    await settle(50);
    const form = document.querySelector<HTMLElement>('.dd-drawer form')!;
    fireEvent.change(form.querySelector<HTMLSelectElement>('select.rf-must')!, { target: { value: 'b3' } });
    const numbers = form.querySelectorAll<HTMLInputElement>('input[type="number"].rf-must');
    fireEvent.change(numbers[0], { target: { value: '100' } });
    fireEvent.submit(form);
    await settle();
    const calls = posts('/api/finance/transfers');
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String((calls[0][2] as RequestInit).body));
    expect(body).toMatchObject({ fromAccountId: 'b1', toAccountId: 'b3', amount: 100, exchangeRate: 1, reference: null, description: 'Kasa/banka döviz transferi' });
    expect(typeof body.requestId).toBe('string');
  });

  it('the cash-flow class posts the same change; a firm user cannot change it', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-banks" />);
    await settle();
    fireEvent.doubleClick(row('BNK-01').cells[2]);
    await settle();
    const surface = document.querySelector<HTMLElement>('.doc-surface')!;
    const select = within(within(surface).getByText('m1 açıklaması').closest('tr')!).getByRole('combobox', { name: 'Nakit akışı sınıfı' });
    fireEvent.change(select, { target: { value: 'Investing' } });
    await settle();
    const calls = posts('/api/finance/accounts/b1/transactions/m1/cash-flow-category');
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String((calls[0][2] as RequestInit).body))).toEqual({ cashFlowCategory: 'Investing' });
    cleanup();
    renderScreen(<FinancePage token="t" role="TenantUser" section="finance-banks" />);
    await settle();
    fireEvent.doubleClick(row('BNK-01').cells[2]);
    await settle();
    const userSurface = document.querySelector<HTMLElement>('.doc-surface')!;
    const userSelect = within(within(userSurface).getByText('m1 açıklaması').closest('tr')!).getByRole('combobox', { name: 'Nakit akışı sınıfı' });
    expect((userSelect as HTMLSelectElement).disabled).toBe(true);
  });

  it('Manuel hareket opens the form in a drawer and posts the same body', async () => {
    renderScreen(<FinancePage token="t" role="TenantAdmin" section="finance-banks" />);
    await settle();
    fireEvent.doubleClick(row('BNK-01').cells[2]);
    await settle();
    fireEvent.click(menuItem('account-movement'));
    await settle(50);
    const drawer = document.querySelector<HTMLElement>('.dd-drawer, [role="dialog"]')!;
    expect(drawer).toBeTruthy();
    const form = drawer.querySelector('form')!;
    const amount = form.querySelector<HTMLInputElement>('input[type="number"]')!;
    fireEvent.change(amount, { target: { value: '250' } });
    fireEvent.change(form.querySelector<HTMLInputElement>('input.rf-must:not([type])')!, { target: { value: 'Masraf' } });
    fireEvent.submit(form);
    await settle();
    const calls = posts('/api/finance/accounts/b1/movements');
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String((calls[0][2] as RequestInit).body));
    expect(body).toMatchObject({ direction: 'Inflow', amount: 250, description: 'Masraf', reference: null, cashFlowCategory: 'Unclassified' });
    expect(typeof body.requestId).toBe('string');
  });
});
