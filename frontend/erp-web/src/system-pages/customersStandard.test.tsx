import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './customersOperations.fixture.json';

// "Cari Hesaplar" standart tanımı (customers.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'customers';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const C1 = '22222222-0000-0000-0000-000000000001';
const C2 = '22222222-0000-0000-0000-000000000002';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const customer = (id: string, code: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, code, name, type: 'Both', taxNumber: '1234567890', isActive: true, createdAt: '2026-01-01T00:00:00Z', rowVersion: `rv-${code}`,
  groupId: null, groupName: 'Bayiler', currencyCode: 'TRY', riskLimit: 250000, paymentTermDays: 30, identityNumber: null, taxOffice: 'Konya VD',
  parentCompanyId: null, parentCompanyName: null, subsidiaryCount: 0, customFields: {}, isEInvoiceRegistered: true, eInvoiceRecipientAlias: null,
  phone: '0 332 000 00 00', email: 'info@ornek.test', website: null, contactName: 'Ali Veli', contactPhone: null, contactEmail: null,
  priceListCode: null, receivableAccountCode: '120.01', payableAccountCode: null, bankName: null, bankBranchCode: null, iban: null, ...extra,
});
const rows = () => [customer(C1, 'C-1001', 'FATİH KOKAY'), customer(C2, 'C-1002', 'ÖRNEK TEKSTİL', { type: 'Supplier', currencyCode: 'EUR', taxNumber: null })];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/customers') return { items: rows(), page: 1, pageSize: 25, totalCount: 2 };
    if (path === '/api/customers/counts') {
      return { totalCount: 128, activeCount: 121, inactiveCount: 7, customerCount: 80, supplierCount: 31, bothCount: 17, dealerCount: 0,
        employeeCount: 0, eInvoiceRegisteredCount: 14, riskLimitDefinedCount: 9 };
    }
    const one = /^\/api\/customers\/([^/]+)$/.exec(path);
    if (one) {
      const row = rows().find((item) => item.id === one[1])!;
      return { ...row, defaultAddressId: 'a1', defaultAddressLabel: 'Merkez', defaultAddressLine: 'Feritpaşa Mah.', defaultAddressCity: 'Konya',
        defaultAddressDistrict: 'Selçuklu', defaultAddressPostalCode: '42000', defaultAddressCountryCode: 'TR', defaultAddressLatitude: null, defaultAddressLongitude: null };
    }
    if (/^\/api\/customers\/[^/]+\/balance$/.test(path)) {
      return { currencyCode: 'TRY', balance: 186242, balanceSide: 'Debit', riskLimit: 250000, balanceAmount: 186242, balanceSideCode: 'B', limitUsagePercent: 74.5 };
    }
  } else if (method === 'PUT' && /^\/api\/customers\/[^/]+$/.test(path)) {
    return rows()[0];
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
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const writes = () => calls.filter((call) => call.method !== 'GET');
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const menuItem = async (name: RegExp) => {
  fireEvent.click(command('more'));
  return screen.findByRole('menuitem', { name });
};
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
const select = async (name: string, id: string) => {
  fireEvent.click(await screen.findByText(name, { selector: '.tenant-page-data-grid td' }, T));
  await waitFor(() => expect(gets(`/api/customers/${id}`).length).toBeGreaterThan(0), T);
  await ready('open');
};

beforeEach(() => {
  calls = []; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  for (const page of ['customer-create', 'customer-ledger', 'sales-order-create', 'sales-invoices']) setPageParams(page, {});
});

describe('Cari Hesaplar standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads the first page of 25 and the counters with one counts request', async () => {
    setup();
    await screen.findByText('FATİH KOKAY', { selector: '.tenant-page-data-grid td' }, T);
    const list = gets('/api/customers');
    expect(list.length).toBeGreaterThan(0);
    expect(query(list[0].url).get('page')).toBe('1');
    expect(query(list[0].url).get('pageSize')).toBe('25');
    await waitFor(() => expect(gets('/api/customers/counts')).toHaveLength(1), T);
    await waitFor(() => expect(document.body.textContent).toContain('tüm kayıtlar · 121 aktif'), T);
    // Satır görünümleri: tür ve durum etiketleri.
    expect(screen.getAllByText('Müşteri & Tedarikçi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aktif').length).toBeGreaterThan(0);
  });

  it('Aç opens the card standard with customerId; Yeni opens an empty card', async () => {
    setup();
    await select('FATİH KOKAY', C1);
    fireEvent.click(command('open'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toEqual({ page: 'customer-create', params: { customerId: C1 }, replace: false, from: KEY });
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toMatchObject({ page: 'customer-create', params: {}, replace: false });
  });

  it('İşlemler opens the legacy sales screens with customerId and the ledger with the selected account', async () => {
    setup();
    await select('FATİH KOKAY', C1);
    fireEvent.click(await menuItem(/Yeni sipariş/));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toEqual({ page: 'sales-order-create', params: { customerId: C1 }, replace: false, from: KEY });
    fireEvent.click(await menuItem(/^Satış faturaları/));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toEqual({ page: 'sales-invoices', params: { customerId: C1 }, replace: false, from: KEY });
    fireEvent.click(await menuItem(/Cari Hesap Hareketleri/));
    await waitFor(() => expect(navigations).toHaveLength(3), T);
    expect(navigations[2]).toEqual({ page: 'customer-ledger', params: { customerId: C1 }, replace: false, from: KEY });
  });

  it('sales document starts are disabled for a supplier', async () => {
    setup();
    await select('ÖRNEK TEKSTİL', C2);
    const item = await menuItem(/Yeni sipariş/);
    expect(item.getAttribute('aria-disabled')).toBe('true');
    closeMenu();
  });

  it('Pasife al asks first, then PUTs the source card with isActive false and no address', async () => {
    setup();
    await select('FATİH KOKAY', C1);
    fireEvent.click(await menuItem(/Pasife al/));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('FATİH KOKAY');
    expect(writes()).toEqual([]);
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/customers/${C1}` });
    const body = JSON.parse(writes()[0].body!);
    expect(body).toMatchObject({ id: C1, code: 'C-1001', name: 'FATİH KOKAY', isActive: false, rowVersion: 'rv-C-1001' });
    expect(body.address).toBeUndefined();
    expect(Object.keys(body).filter((key) => key.includes('.'))).toEqual([]);
  });

  it('detail panel shows the balance with its B/A side, risk limit usage and the default address', async () => {
    setup();
    await select('FATİH KOKAY', C1);
    fireEvent.click(screen.getByLabelText('Detay paneli'));
    await waitFor(() => expect(gets(`/api/customers/${C1}/balance`).length).toBeGreaterThan(0), T);
    await waitFor(() => expect(document.body.textContent).toContain('TRY B'), T);
    expect(document.body.textContent).toContain('Limit kullanımı %');
    await waitFor(() => expect(document.body.textContent).toContain('Merkez · Feritpaşa Mah. · Selçuklu / Konya'), T);
  });
});
