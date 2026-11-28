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
import catalog from './salesQuotesOperations.fixture.json';

// "Satış Teklifleri" standart tanımı (sales-quotes.json, v2: Liste kalıbı) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// Aç ve Yeni teklif Belge sayfasını (sales-quote-document) açar; Kabul et, Reddet ve Siparişe çevir satır eylemidir.
// `salesQuotesOperations.fixture.json` ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; template?: { name: string }; components: { id: string; type: string; props?: Record<string, unknown> }[];
  queries: { id: string; operation: string }[] };
const KEY = 'sales-quotes';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as
  { title: string; version: number; stage: string; definition: Definition };

const Q1 = 'eeeeeeee-0000-0000-0000-000000000001';
const Q2 = 'eeeeeeee-0000-0000-0000-000000000002';
const Q3 = 'eeeeeeee-0000-0000-0000-000000000003';
const O1 = 'dddddddd-0000-0000-0000-000000000001';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const quote = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, customerId: 'c1', customerCode: '120.01', customerName: 'Acme', quoteDate: '2026-11-01', validUntil: '2099-12-01', currencyCode: 'TRY',
  status, grandTotal: 1200, lineCount: 1, createdAt: '2026-11-01T08:00:00Z', hasSalesOrder: false, revisionNumber: 1, salespersonName: 'PER001 · Ayşe Kaya',
  salesOrderId: null, salesOrderCode: null, ...extra,
});
const rows = () => [
  quote(Q1, 'T-1', 'Draft'),
  quote(Q2, 'T-2', 'Sent'),
  quote(Q3, 'T-3', 'Accepted', { hasSalesOrder: true, salesOrderId: O1, salesOrderCode: 'S-1' }),
];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET' && path === '/api/sales/quotes') {
    const status = new URLSearchParams(url.split('?')[1] ?? '').get('status');
    const items = rows().filter((row) => !status || row.status === status);
    return { items, page: 1, pageSize: 25, totalCount: items.length, pageGrandTotal: 1200 * items.length, pageCurrencyCode: 'TRY', pageMixedCurrencies: false };
  }
  if (method === 'POST' && /^\/api\/sales\/quotes\/[^/]+\/(accept|reject|convert-to-order)$/.test(path)) return rows()[0];
  if (method === 'DELETE' && /^\/api\/sales\/quotes\/[^/]+$/.test(path)) return null;
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        screenKey: KEY, source: 'standard', standardVersion: standard.version, definitionJson: JSON.stringify(standard.definition) };
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
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const writes = () => calls.filter((call) => call.method !== 'GET');
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const cell = (text: string) => screen.findByText(text, { selector: '.tenant-page-data-grid td' }, T);
const rowOf = (text: string) => screen.getByText(text, { selector: '.tenant-page-data-grid td' }).closest('tr')!;
const rowButtons = (text: string) => within(rowOf(text)).queryAllByRole('button').map((button) => button.textContent?.trim() ?? '');
const select = async (name: string) => {
  fireEvent.click(await cell(name));
  await waitFor(() => expect(rowOf(name).getAttribute('aria-selected') === 'true' || rowOf(name).classList.contains('is-selected')
    || rowOf(name).getAttribute('aria-current') === 'true').toBe(true), T);
};

beforeEach(() => {
  calls = []; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  setPageParams(KEY, {});
});

describe('Satış Teklifleri standart tanımı', { timeout: 30000 }, () => {
  it('is a v2 preview Liste standard that uses only operations from the catalog fixture', () => {
    expect(standard).toMatchObject({ version: 2, stage: 'preview' });
    expect(standard.definition.template).toEqual({ name: 'list' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads 25 per page; the Yanıt bekleyen metric filters the list to İletildi', async () => {
    setup();
    await cell('T-1');
    expect(query(gets('/api/sales/quotes')[0].url).get('pageSize')).toBe('25');
    const metric = await screen.findByRole('button', { name: /Yanıt bekleyen/ }, T);
    await waitFor(() => expect(metric.textContent).toContain('1'), T);
    fireEvent.click(metric);
    await waitFor(() => expect(query(gets('/api/sales/quotes').at(-1)!.url).get('status')).toBe('Sent'), T);
    await waitFor(() => expect(screen.queryByText('T-1', { selector: '.tenant-page-data-grid td' })).toBeNull(), T);
  });

  it('Yeni teklif and Aç open the Belge page; Aç sends the quote id', async () => {
    setup();
    await select('T-1');
    await waitFor(() => expect(command('open').getAttribute('aria-disabled')).not.toBe('true'), T);
    fireEvent.click(command('open'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'sales-quote-document', params: { id: Q1 } });
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toMatchObject({ page: 'sales-quote-document', params: {} });
  });

  it('row actions follow the status: Sent → Kabul et / Reddet; Accepted without an order → Siparişe çevir; with an order → Siparişi aç', async () => {
    setup();
    await cell('T-1');
    expect(rowButtons('T-1').filter((name) => /Kabul|Reddet|Siparişe/.test(name))).toEqual([]);
    expect(rowButtons('T-2')).toEqual(expect.arrayContaining(['Kabul et', 'Reddet']));
    expect(rowButtons('T-2')).not.toContain('Siparişe çevir');
    expect(rowButtons('T-3')).toContain('Siparişi aç');
    expect(rowButtons('T-3')).not.toContain('Siparişe çevir');
  });

  it('Kabul et asks first, then posts the accept route and refreshes the list', async () => {
    setup();
    await cell('T-2');
    const lists = gets('/api/sales/quotes').length;
    fireEvent.click(within(rowOf('T-2')).getByRole('button', { name: /^Kabul et/ }));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('T-2');
    expect(writes()).toEqual([]);
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/sales/quotes/${Q2}/accept` });
    await waitFor(() => expect(gets('/api/sales/quotes').length).toBeGreaterThan(lists), T);
  });

  it('Sil is offered to an admin on a Draft without an order only', async () => {
    setup();
    const deletable = () => { const button = command('delete'); return !!button && button.getAttribute('aria-disabled') !== 'true'; };
    await select('T-2');
    expect(deletable()).toBe(false);
    await select('T-1');
    await waitFor(() => expect(deletable()).toBe(true), T);
    fireEvent.click(command('delete'));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(within(dialog).getByRole('heading').textContent).toBe('T-1 · Acme teklifi silinsin mi?');
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'DELETE', url: `/api/sales/quotes/${Q1}` });
  });

  it('the quoteId page param still opens that quote (in the Belge page)', async () => {
    setPageParams(KEY, { quoteId: Q1 });
    setup();
    await waitFor(() => expect(navigations.some((item) => item.page === 'sales-quote-document')).toBe(true), T);
    expect(navigations.find((item) => item.page === 'sales-quote-document')).toMatchObject({ params: { id: Q1 } });
  });
});
