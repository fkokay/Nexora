import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import GeneralLedgerPage from '../GeneralLedgerPage';

const account = (id: string, code: string, name: string, isActive = true) => ({
  id, code, name, isActive, statementSection: 'Asset', hasMovements: false, accountType: 'Asset', normalBalance: 'Debit',
  currencyCode: null, ifrsAccountCode: null, ifrsAccountName: null, ifrsStatementSection: 'Unclassified',
});
const accounts = [account('a120', '120', 'Alıcılar'), account('a600', '600', 'Yurt içi satışlar'), account('a601', '601', 'Yurt dışı satışlar'), account('a320', '320', 'Satıcılar', false)];
const mappings = [
  { mappingKey: 'sales.receivable', label: 'Müşteri alacakları', accountId: 'a120', accountCode: '120', accountName: 'Alıcılar' },
  { mappingKey: 'sales.revenue', label: 'Satış gelirleri', accountId: null, accountCode: null, accountName: null },
  { mappingKey: 'purchase.payable', label: 'Tedarikçi borçları', accountId: 'a320', accountCode: '320', accountName: 'Satıcılar' },
];

function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/general-ledger/accounts') return accounts;
  if (path === '/api/finance/general-ledger/mappings') return mappings;
  if (path.startsWith('/api/finance/general-ledger/mappings/')) return init?.method ? {} : {};
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
async function settle(ms = 200) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const puts = () => apiMock.mock.calls.filter(([url, , init]) => String(url).startsWith('/api/finance/general-ledger/mappings/') && (init as RequestInit | undefined)?.method === 'PUT');
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));

// --- Interaction steps (the only part that follows the UI) ---
async function openMappings(role = 'TenantAdmin') {
  renderScreen(<GeneralLedgerPage token="t" role={role} view="mappings" />);
  await settle();
}
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const barCommand = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
/** Opens the mapping (by its label) in the card, picks the account and saves it (Kaydet). */
async function assign(label: string, code: string) {
  const row = [...document.querySelectorAll<HTMLElement>('tr[data-mapping-key]')].find((tr) => tr.textContent?.includes(label))!;
  fireEvent.click(row);
  await settle(50);
  const input = screen.getByRole('combobox', { name: `${label} için hesap ara` });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: code } });
  fireEvent.blur(input);
  await settle(50);
  fireEvent.click(barCommand('save'));
  await settle(50);
}
const pickerFor = (label: string) => screen.queryByRole('combobox', { name: `${label} için hesap ara` });
// ---

describe('Hesap eşleştirmeleri (characterization)', () => {
  it('puts the mapping key and the chosen account for a missing mapping without asking', async () => {
    await openMappings();
    await assign('Satış gelirleri', '600');
    await settle();
    expect(puts()).toHaveLength(1);
    expect(puts()[0][0]).toBe('/api/finance/general-ledger/mappings/sales.revenue');
    expect(bodyOf(puts()[0])).toEqual({ mappingKey: 'sales.revenue', accountId: 'a600' });
  });

  it('asks before replacing an existing mapping and sends nothing when refused', async () => {
    await openMappings();
    fireEvent.click(screen.getAllByRole('button', { name: /^Tümü/ })[0]);
    await settle(50);
    await assign('Müşteri alacakları', '601');
    expect(screen.getByText('Hesap eşleştirmesi değiştirilsin mi?')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Vazgeç/ }).at(-1)!);
    await settle();
    expect(puts()).toHaveLength(0);
    await assign('Müşteri alacakları', '601');
    fireEvent.click(screen.getByRole('button', { name: /^Eşleştirmeyi değiştir/ }));
    await settle();
    expect(puts()).toHaveLength(1);
    expect(bodyOf(puts()[0])).toEqual({ mappingKey: 'sales.receivable', accountId: 'a601' });
  });

  it('lets a tenant user see but not change the mappings', async () => {
    await openMappings('TenantUser');
    expect(pickerFor('Satış gelirleri')).toBeNull();
    expect(screen.getAllByText(/Satış gelirleri/).length).toBeGreaterThan(0);
    fireEvent.click([...document.querySelectorAll<HTMLElement>('tr[data-mapping-key]')].find((tr) => tr.textContent?.includes('Satış gelirleri'))!);
    await settle(50);
    expect(pickerFor('Satış gelirleri')).toBeNull();
    expect(barCommand('save').getAttribute('title')).toBe('Hesap eşleştirmelerini firma yöneticisi düzenler');
  });
});
