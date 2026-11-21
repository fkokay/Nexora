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
import catalog from './financeJournalVouchersOperations.fixture.json';

// "Yevmiye Fişi" standart tanımı (finance-journal-vouchers.json): belge bilgileri, hesap seçicili satır ızgarası, borç / alacak
// sütun toplamları (editableGrid `totals`) ve `{{fisSatirlari.toplam.*}}` ile Dengeli / Dengede değil rozetleri.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'finance-journal-vouchers';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const A1 = 'cccccccc-0000-0000-0000-000000000001';
const A2 = 'cccccccc-0000-0000-0000-000000000002';
const A3 = 'cccccccc-0000-0000-0000-000000000003';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const ledgerAccount = (id: string, code: string, name: string, isActive = true) => ({
  id, code, name, isActive, statementSection: 'Asset', hasMovements: false, accountType: 'Asset', normalBalance: 'Debit', currencyCode: null,
  ifrsAccountCode: null, ifrsAccountName: null, ifrsStatementSection: 'Unclassified', accountClass: code[0],
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET' && path === '/api/finance/general-ledger/accounts') {
    return [ledgerAccount(A1, '770.01', 'Genel yönetim giderleri'), ledgerAccount(A2, '320.01', 'Satıcılar'), ledgerAccount(A3, '999.99', 'Kapalı hesap', false)];
  }
  if (method === 'POST' && path === '/api/finance/general-ledger/entries/manual') {
    return { id: '99999999-0000-0000-0000-000000000001', code: 'YF-0001', entryDate: today(), description: 'Kira', sourceType: 'Manual', sourceId: null,
      accountingBasis: 'TDHP', totalDebit: 1500, totalCredit: 1500 };
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
const settle = (ms = 50) => new Promise((done) => setTimeout(done, ms));
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`);
const ready = (id: string) => waitFor(() => expect(command(id)?.getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const rowIds = () => [...document.querySelectorAll<HTMLInputElement>('input[id^="page-grid-fisSatirlari-"][id$="-debit"]')]
  .map((element) => /page-grid-fisSatirlari-(.+)-debit$/.exec(element.id)![1]);
const cellInput = (row: string, code: string) => document.getElementById(`page-grid-fisSatirlari-${row}-${code}`) as HTMLInputElement;
const totalCell = (code: string) => document.querySelector(`.tenant-page-grid tfoot [data-total="${code}"]`);
const optionTexts = () => within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
const pick = async (element: HTMLInputElement, option: string) => {
  fireEvent.click(element);
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`) }, T));
};
/** Izgarada en az `count` satır olmasını sağlar ve satır anahtarlarını döner. */
const ensureRows = async (count: number) => {
  await screen.findByRole('button', { name: 'Satır ekle' }, T);
  while (rowIds().length < count) fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
  return rowIds();
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

describe('Yevmiye Fişi standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect([...new Set(standard.definition.queries.map((item) => item.operation))].sort()).toEqual([...names].sort());
  });

  it('totals the debit and credit columns and shows Dengeli only when they match', async () => {
    setup();
    const [r1, r2] = await ensureRows(2);
    expect(input('fisTarihi').value).toBe(today());
    await waitFor(() => expect(totalCell('debit')?.textContent).toContain('0,00'), T);
    expect(screen.queryByText('Borç = Alacak ✓ Dengeli')).toBeNull();
    fireEvent.change(cellInput(r1, 'debit'), { target: { value: '1500' } });
    await waitFor(() => expect(totalCell('debit')?.textContent).toContain('1.500,00'), T);
    expect(screen.getByText('Fiş dengede değil')).toBeTruthy();
    fireEvent.change(cellInput(r2, 'credit'), { target: { value: '1500' } });
    await waitFor(() => expect(screen.getByText('Borç = Alacak ✓ Dengeli')).toBeTruthy(), T);
    expect(totalCell('credit')?.textContent).toContain('1.500,00');
    expect(screen.queryByText('Fiş dengede değil')).toBeNull();
  });

  it('the account picker lists active accounts only and Kaydet posts the header with the lines, then opens the ledger', async () => {
    setup();
    const [r1, r2] = await ensureRows(2);
    fireEvent.change(input('aciklama'), { target: { value: 'Kasım kirası' } });
    fireEvent.click(cellInput(r1, 'accountId'));
    await waitFor(() => expect(optionTexts().length).toBe(2), T);
    expect(optionTexts().join(' ')).not.toContain('999.99');
    fireEvent.click(screen.getByRole('option', { name: /^770\.01/ }));
    fireEvent.change(cellInput(r1, 'debit'), { target: { value: '1500' } });
    await pick(cellInput(r2, 'accountId'), '320.01');
    fireEvent.change(cellInput(r2, 'description'), { target: { value: 'Ekim kirası' } });
    fireEvent.change(cellInput(r2, 'credit'), { target: { value: '1500' } });
    await waitFor(() => expect(screen.getByText('Borç = Alacak ✓ Dengeli')).toBeTruthy(), T);
    await ready('save');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe('/api/finance/general-ledger/entries/manual');
    // Boş satır açıklaması ve boş taraf gönderilmez (sunucu fiş açıklamasını ve 0'ı kullanır).
    expect(JSON.parse(writes()[0].body!)).toEqual({
      entryDate: today(), accountingBasis: 'TDHP', description: 'Kasım kirası',
      lines: [{ accountId: A1, debit: 1500 }, { accountId: A2, description: 'Ekim kirası', credit: 1500 }],
    });
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'finance-journal-ledger' });
  });

  it('a non-admin sees the lock alert and no save command', async () => {
    setup('TenantUser');
    expect(await screen.findByText('Yevmiye fişi kaydetmek için firma yöneticisi yetkisi gerekir.', {}, T)).toBeTruthy();
    await settle(100);
    expect(command('save')).toBeNull();
    expect(writes()).toEqual([]);
  });
});
