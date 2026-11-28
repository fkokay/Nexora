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
import { pageDateScope } from '../custom-page/pageBindings';
import catalog from './financeJournalLedgerOperations.fixture.json';

// "Yevmiye Defterleri" standart tanımı (finance-journal-ledger.json): fiş listesi (sunucu sayfalı), fiş penceresi (başlık, satırlar,
// zincir) ve ters kayıt. Ters kayıt sunucunun `canReverse` bayrağıyla açılır; kaynaklı fişte (isSourced) uyarılı ayrı soru çıkar.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'finance-journal-ledger';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; version: number; definition: Definition };

const J1 = '99999999-0000-0000-0000-000000000001';
const J2 = '99999999-0000-0000-0000-000000000002';
const J3 = '99999999-0000-0000-0000-000000000003';
const ENTRIES = '/api/finance/general-ledger/entries';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const entry = (id: string, code: string, description: string, extra: Record<string, unknown> = {}) => ({
  id, code, entryDate: '2026-11-03', description, sourceType: 'Manual', sourceId: null, createdAt: '2026-11-03T09:00:00Z', accountingBasis: 'TDHP',
  totalDebit: 1500, totalCredit: 1500, isReversed: false, isSourced: false, isReversal: false, canReverse: true, sourceLabel: 'Manuel fiş', ...extra,
});
const entries = () => [
  entry(J1, 'YF-0001', 'Kira tahakkuku'),
  entry(J2, 'YF-0002', 'Satış faturası SF-12', { sourceType: 'SalesInvoice', sourceId: 'x', isSourced: true, sourceLabel: 'Satış faturası' }),
  entry(J3, 'YF-0003', 'Ters kayıt: YF-0000', { sourceType: 'ManualReversal', isSourced: true, isReversal: true, canReverse: false, sourceLabel: 'Ters kayıt' }),
];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let selectedCode = '';
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  const one = new RegExp(`^${ENTRIES}/([0-9a-f-]{36})$`).exec(path);
  if (method === 'GET') {
    if (path === ENTRIES) return { items: entries(), page: 1, pageSize: 50, total: 3, totalCount: 3 };
    if (one) {
      const item = entries().find((candidate) => candidate.id === one[1])!;
      return { ...item, reversedByEntryId: null, reversedByEntryCode: null, reversalOfEntryCode: item.isReversal ? 'YF-0000' : null,
        lines: [
          { lineNumber: 1, accountId: 'a1', accountCode: '770.01', accountName: 'Genel yönetim giderleri', description: 'Kasım kirası', debit: 1500, credit: 0 },
          { lineNumber: 2, accountId: 'a2', accountCode: '320.01', accountName: 'Satıcılar', description: 'Kasım kirası', debit: 0, credit: 1500 },
        ] };
    }
  } else if (method === 'POST' && new RegExp(`^${ENTRIES}/[0-9a-f-]{36}/reverse$`).test(path)) {
    return entry('99999999-0000-0000-0000-000000000009', 'YF-0009', 'Ters kayıt', { isReversal: true, canReverse: false });
  }
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
const selectedRow = () => screen.getAllByRole('row').find((row) => row.querySelector('td') && row.textContent?.includes(selectedCode))!;
const command = (id: string) => id === 'new' || id === 'more' ? screen.getByRole('toolbar', { name: '\u0130\u015flemler' }).querySelector<HTMLElement>(`[data-command="${id}"]`)! : within(selectedRow()).getByRole('button', { name: id === 'open' ? 'A\u00e7' : id });
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const writes = () => calls.filter((call) => call.method !== 'GET');
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const menuItem = async (name: RegExp) => within(selectedRow()).findByRole('button', { name }, T);
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
const select = async (code: string, id: string) => {
  selectedCode = code;
  fireEvent.click(await screen.findByText(code, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T));
  await waitFor(() => expect(gets(`${ENTRIES}/${id}`).length).toBeGreaterThan(0), T);
};
/** Ters kayıt sorusunu açar, gerekçeyi yazar ve onaylar; sorunun metnini döner. */
const reverse = async (reason: string) => {
  fireEvent.click(await menuItem(/Ters kayıt oluştur/));
  const prompt = await screen.findByRole('alertdialog', {}, T);
  const text = prompt.textContent ?? '';
  expect(within(prompt).getByRole('textbox').getAttribute('maxlength')).toBe('240');
  fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: reason } });
  fireEvent.click(within(prompt).getByRole('button', { name: 'Ters kayıt oluştur' }));
  return text;
};

beforeEach(() => {
  calls = []; selectedCode = ''; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
});

describe('Yevmiye Defterleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect([...new Set(standard.definition.queries.map((item) => item.operation))].sort()).toEqual([...names].sort());
  });

  it('lists this month 50 per page with the server total and source labels; Yeni opens the voucher entry', async () => {
    setup();
    await screen.findByText('Kira tahakkuku', { selector: '.tenant-page-data-grid td' }, T);
    const list = gets(ENTRIES)[0];
    expect([query(list.url).get('from'), query(list.url).get('to')]).toEqual([pageDateScope().ayBasi, today()]);
    expect(query(list.url).get('page')).toBe('1');
    expect(query(list.url).get('pageSize')).toBe('50');
    expect(document.body.textContent).toContain('Satış faturası');
    await waitFor(() => expect(document.querySelector('.list-v2-title')?.textContent ?? '').toContain('3'), T);
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'finance-journal-voucher-document' });
  });

  it('A opens the read-only voucher Belge screen', async () => {
    setup();
    await select('YF-0001', J1);
    await ready('open');
    fireEvent.click(command('open'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'finance-journal-voucher-document', params: { id: J1 } });
  });

  it('a manual voucher reverses with a required reason, today as the date and no source warning', async () => {
    setup();
    await select('YF-0001', J1);
    const text = await reverse('Yanlış hesap');
    expect(text).toContain('YF-0001 · Fiş ters çevrilsin mi?');
    expect(text).not.toContain('belgesinden geldi');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `${ENTRIES}/${J1}/reverse` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ entryDate: today(), reason: 'Yanlış hesap' });
  });

  it('a sourced voucher warns that the source document must be voided on its own screen', async () => {
    setup();
    await select('YF-0002', J2);
    const text = await reverse('Fatura iptal edilecek');
    expect(text).toContain('Bu fiş Satış faturası belgesinden geldi. Ters kayıttan sonra belgeyi kendi ekranından iptal edin.');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`${ENTRIES}/${J2}/reverse`);
    expect(JSON.parse(writes()[0].body!)).toEqual({ entryDate: today(), reason: 'Fatura iptal edilecek' });
  });

  it('reversal is disabled when the server says canReverse false, and for a non-admin', async () => {
    setup();
    await select('YF-0003', J3);
    expect(within(selectedRow()).queryByRole('button', { name: /Ters kay\u0131t olu\u015ftur/ })).toBeNull();
    closeMenu();
    cleanup();
    calls = [];
    setup('TenantUser');
    await select('YF-0001', J1);
    expect(within(selectedRow()).queryByRole('button', { name: /Ters kay\u0131t olu\u015ftur/ })).toBeNull();
    closeMenu();
    expect(writes()).toEqual([]);
  });
});
