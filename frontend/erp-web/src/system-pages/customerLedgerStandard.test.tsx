import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { setPageParams } from '../pageNavigation';
import { pageDateScope } from '../custom-page/pageBindings';
import catalog from './customerLedgerOperations.fixture.json';

// "Cari Hesap Hareketleri" standart tanımı (customer-ledger.json): üstte cari seçici; seçilince ekstre görünür. Dönem düğmeleri `tarih` kökünden,
// borç / alacak / B-A bakiye sütunları ekstrenin hesaplanan üyelerinden gelir.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'customer-ledger';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const C1 = '22222222-0000-0000-0000-000000000001';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const line = (id: string, entryDate: string, direction: 'Debit' | 'Credit', amount: number, balance: number, description: string, extra: Record<string, unknown> = {}) => ({
  id, entryDate, direction, amount, currencyCode: 'TRY', description, reversalOfId: null, hasReversal: false, balance, isReversal: false,
  debitAmount: direction === 'Debit' ? amount : null, creditAmount: direction === 'Credit' ? amount : null,
  balanceAmount: Math.abs(balance), balanceSide: balance > 0 ? 'B' : balance < 0 ? 'A' : '', foreignCurrencyCode: null, ...extra,
});
let foreign = false;
const statement = (from: string, to: string) => ({
  customerId: C1, customerCode: 'C-1001', customerName: 'FATİH KOKAY', currencyCode: 'TRY', from, to,
  openingBalance: 12000, debitTotal: 210000, creditTotal: 35758, closingBalance: 186242, openingAmount: 12000, openingSide: 'B',
  closingAmount: 186242, closingSide: 'B', netMovement: 174242, openingAsOf: '2025-12-31', hasForeignCurrency: foreign,
  items: [
    line('l1', '2026-03-05', 'Debit', 150000, 162000, 'Satış faturası SF-2026-0012'),
    line('l2', '2026-04-12', 'Debit', 5000, 167000, 'Elle hareket · avans', { hasReversal: true }),
    line('l3', '2026-04-13', 'Credit', 5000, 162000, 'Ters kayıt', { isReversal: true, reversalOfId: 'l2' }),
    line('l4', '2026-06-20', 'Credit', 30758, 131242, 'Tahsilat TH-2026-0004', foreign ? { currencyCode: 'EUR', foreignCurrencyCode: 'EUR' } : {}),
  ],
});

type Call = { url: string; method: string };
let calls: Call[] = [];

function respond(url: string, method: string): unknown {
  const [path, search] = url.split('?');
  const params = new URLSearchParams(search ?? '');
  if (method === 'GET') {
    if (path === '/api/customers') {
      return { items: [{ id: C1, code: 'C-1001', name: 'FATİH KOKAY', type: 'Both', currencyCode: 'TRY', isActive: true, taxNumber: null, createdAt: '2026-01-01', rowVersion: 'r' }], page: 1, pageSize: 25, totalCount: 1 };
    }
    if (path === `/api/customers/${C1}/statement`) return statement(params.get('from') ?? '', params.get('to') ?? '');
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(customerId?: string) {
  setPageParams(KEY, customerId ? { customerId } : {});
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        screenKey: KEY, source: 'standard', standardVersion: 1, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method });
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
const statements = () => calls.filter((call) => call.url.split('?')[0] === `/api/customers/${C1}/statement`);
const range = (url: string) => { const params = new URLSearchParams(url.split('?')[1] ?? ''); return [params.get('from'), params.get('to')]; };
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const grid = () => document.querySelector('.tenant-page-data-grid') as HTMLElement;

beforeEach(() => { calls = []; foreign = false; api.mockReset(); localStorage.clear(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  setPageParams(KEY, {});
});

describe('Cari Hesap Hareketleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('opens with the customer lookup and a hint; choosing a customer shows the statement for the year so far', async () => {
    setup();
    expect(await screen.findByText('Ekstreyi görmek için yukarıdan bir cari hesap seçin.', {}, T)).toBeTruthy();
    // Adım göstergesi, cari listesi ve satır düğmesi yok; ekstre okunmaz.
    expect(screen.queryByRole('list', { name: 'Adımlar' })).toBeNull();
    expect(document.querySelector('.tenant-page-data-grid')).toBeNull();
    expect(screen.queryByRole('button', { name: /Ekstreyi gör/ })).toBeNull();
    expect(statements()).toEqual([]);
    fireEvent.click(input('cariSecimi'));
    fireEvent.click(await screen.findByRole('option', { name: /^FATİH KOKAY/ }, T));
    await waitFor(() => expect(statements()).toHaveLength(1), T);
    expect(range(statements()[0].url)).toEqual([pageDateScope().yilBasi, today()]);
    await screen.findByText('Satış faturası SF-2026-0012', {}, T);
    expect(screen.queryByText('Ekstreyi görmek için yukarıdan bir cari hesap seçin.')).toBeNull();
    expect(screen.queryByRole('button', { name: /Cari değiştir/ })).toBeNull();
    // Cari araması sunucuda yapılır (cari.listele q).
    expect(calls.some((call) => call.url.split('?')[0] === '/api/customers')).toBe(true);
  });

  it('customerId page param shows the statement directly with the header, B/A columns and reversal status columns', async () => {
    setup(C1);
    await waitFor(() => expect(statements()).toHaveLength(1), T);
    await screen.findByText('Satış faturası SF-2026-0012', {}, T);
    const header = document.body.textContent ?? '';
    expect(header).toContain('C-1001');
    expect(header).toContain('FATİH KOKAY · TRY');
    for (const label of ['Açılış', 'Dönem borç', 'Dönem alacak', 'Kapanış']) expect(header).toContain(label);
    const table = grid();
    for (const label of ['Borç', 'Alacak', 'Bakiye', 'Ters kayıt', 'Ters çevrildi']) expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    // Bakiye B/A birimiyle çizilir (balanceSide).
    expect(table.textContent).toMatch(/162\.000,00\s*B/);
    // Başlık sayacı sayfasız ekstrenin satır sayısıdır ({{ekstre.satirSayisi}}).
    await waitFor(() => expect(document.querySelector('.list-v2-title')?.textContent ?? '').toContain('4'), T);
  });

  it('period chips assign both dates and re-run the statement', async () => {
    setup(C1);
    await waitFor(() => expect(statements()).toHaveLength(1), T);
    const dates = pageDateScope();
    fireEvent.click(await screen.findByRole('button', { name: 'Bu ay' }, T));
    await waitFor(() => expect(statements().map((call) => range(call.url))).toContainEqual([dates.ayBasi, today()]), T);
    fireEvent.click(screen.getByRole('button', { name: 'Son 3 ay' }));
    await waitFor(() => expect(statements().map((call) => range(call.url))).toContainEqual([dates.ucAyOnce, today()]), T);
    expect(input('baslangic').value).toBe(dates.ucAyOnce);
  });

  it('warns when the end date is before the start date and when a foreign currency movement exists', async () => {
    foreign = true;
    setup(C1);
    await screen.findByText('Farklı dövizli hareket var', {}, T);
    expect(screen.queryByText('Tarih aralığı geçersiz')).toBeNull();
    fireEvent.change(input('baslangic'), { target: { value: '2026-05-01' } });
    fireEvent.change(input('bitis'), { target: { value: '2026-04-01' } });
    expect(await screen.findByText('Tarih aralığı geçersiz', {}, T)).toBeTruthy();
  });
});
