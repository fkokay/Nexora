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
import catalog from './financeAccountsOperations.fixture.json';

// "Kasalar" (finance-accounts.json) ve "Bankalar" (finance-banks.json) standart tanımları gerçek çalışma zamanıyla çizilir; API
// sahte yanıtlar döner. İki tanım aynı yapıdadır ve aynı işlemleri kullanır; yalnız gizli `hesapTuru` (Cash / Bank) değişir.
// `financeAccountsOperations.fixture.json` ErpOperationCatalog'un bu sayfaların kullandığı işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const read = (key: string) => JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${key}.json`), 'utf8')) as
  { title: string; version: number; stage: string; definition: Definition };

// Hesap, hareket ve transfer kimlikleri ayrı ailelerdendir: yanlış kimlik bağlayan bir iptal URL'si testte görünür.
const K1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const K2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const B1 = 'aaaaaaaa-0000-0000-0000-0000000000b1';
const H1 = 'dddddddd-0000-0000-0000-000000000001';
const H2 = 'dddddddd-0000-0000-0000-000000000002';
const H3 = 'dddddddd-0000-0000-0000-000000000003';
const H4 = 'dddddddd-0000-0000-0000-000000000004';
const TR = 'eeeeeeee-0000-0000-0000-000000000001';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const account = (id: string, code: string, name: string, type: 'Cash' | 'Bank', extra: Record<string, unknown> = {}) => ({
  id, code, name, type, currencyCode: 'TRY', isActive: true, balance: 48250, transactionCount: 4, createdAt: '2026-01-01T00:00:00Z', ...extra,
});
const accounts = () => [
  account(K1, 'KASA-01', 'Merkez kasa', 'Cash'),
  account(K2, 'KASA-02', 'Eski kasa', 'Cash', { isActive: false, balance: 0, transactionCount: 0 }),
  account(B1, 'BNK-01', 'Ziraat TL', 'Bank', { balance: -1200, transactionCount: 9 }),
];
const movement = (id: string, description: string, extra: Record<string, unknown>) => ({
  id, transactionDate: '2026-11-02', direction: 'Inflow', amount: 1000, currencyCode: 'TRY', description, reference: null, sourceType: 'Manuel',
  sourceCode: null, reversalOfId: null, createdAt: '2026-11-02T08:00:00Z', transferId: null, cashFlowCategory: 'Operating', inflow: 1000, outflow: null,
  sourceKind: 'Manual', isReversal: false, isReversed: false, canVoid: false, canVoidTransfer: false, canChangeCashFlow: true, ...extra,
});
const detail = (id: string) => {
  const row = accounts().find((item) => item.id === id)!;
  return {
    id: row.id, code: row.code, name: row.name, type: row.type, currencyCode: row.currencyCode, isActive: row.isActive, balance: row.balance,
    createdAt: row.createdAt, transactionPage: 1, transactionPageSize: 50, transactionTotalCount: 4, totalCount: 4, pageInflow: 2000, pageOutflow: 3500,
    transactions: [
      movement(H1, 'Elle giriş · avans', { canVoid: true }),
      movement(H2, 'Ters kayıt · avans', { isReversal: true, sourceKind: 'Reversal', direction: 'Outflow', inflow: null, outflow: 1000, canChangeCashFlow: false }),
      movement(H3, 'Kasa/banka döviz transferi', { sourceKind: 'Transfer', sourceType: 'Transfer', sourceCode: 'TRF-0007', transferId: TR, direction: 'Outflow',
        inflow: null, outflow: 2500, cashFlowCategory: 'InternalTransfer', canVoidTransfer: true, canChangeCashFlow: false }),
      movement(H4, 'Müşteri tahsilatı', { sourceKind: 'CustomerCollection', sourceType: 'Tahsilat', sourceCode: 'TH-2026-0004' }),
    ],
  };
};

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  const type = query(url).get('type');
  if (method === 'GET') {
    if (path === '/api/finance/accounts') return accounts().filter((item) => !type || item.type === type);
    if (path === '/api/finance/accounts/summary') {
      return type === 'Bank'
        ? { accountCount: 1, activeCount: 1, inactiveCount: 0, negativeBalanceCount: 1, currencyCount: 1, totalBalance: -1200, currencyCode: 'TRY' }
        : { accountCount: 2, activeCount: 1, inactiveCount: 1, negativeBalanceCount: 0, currencyCount: 1, totalBalance: 48250, currencyCode: 'TRY' };
    }
    const one = /^\/api\/finance\/accounts\/([0-9a-f-]{36})$/.exec(path);
    if (one && accounts().some((item) => item.id === one[1])) return detail(one[1]);
  } else if (method === 'POST') {
    const status = /^\/api\/finance\/accounts\/([0-9a-f-]{36})\/status$/.exec(path);
    if (status) return { id: status[1], isActive: query(url).get('isActive') === 'true' };
    if (/^\/api\/finance\/accounts\/[0-9a-f-]{36}\/transactions\/[0-9a-f-]{36}\/void$/.test(path)) return { id: 'ffffffff-0000-0000-0000-000000000001', status: 'Voided' };
    if (path === `/api/finance/transfers/${TR}/void`) return { id: TR, code: 'TRF-0007', status: 'Voided' };
    if (/^\/api\/finance\/accounts\/[0-9a-f-]{36}\/movements$/.test(path)) return movement('dddddddd-0000-0000-0000-000000000009', 'Yeni', {});
  } else if (method === 'DELETE' && /^\/api\/finance\/accounts\/[0-9a-f-]{36}$/.test(path)) {
    return null;
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(key: 'finance-accounts' | 'finance-banks' = 'finance-accounts', params: Record<string, string> = {}, role = 'TenantAdmin') {
  const standard = read(key);
  setPageParams(key, params);
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${key}/published`) {
      return { id: 'sp', code: `@${key}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        screenKey: key, source: 'standard', standardVersion: standard.version, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={key} token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const settle = (ms = 50) => new Promise((done) => setTimeout(done, ms));
const pageToolbar = () => screen.getByRole('toolbar', { name: '\u0130\u015flemler' });
const command = (id: string) => id === 'new'
  ? pageToolbar().querySelector<HTMLElement>(`[data-command="${id}"]`)!
  : id === 'more' ? within(pageToolbar()).getByRole('button', { name: '\u0044i\u011fer i\u015flemler' }) : screen.getByRole('button', { name: ( ({ open: 'Ekstre', edit: 'D\u00fczenle', statusOff: 'Pasife al', statusOn: 'Etkinle\u015ftir', delete: 'Sil', manual: 'Manuel hareket', transfer: 'Transfer / d\u00f6viz' } as Record<string, string>)[id] ?? id) });
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const writes = () => calls.filter((call) => call.method !== 'GET');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const statements = (id: string) => gets(`/api/finance/accounts/${id}`);
const menuItem = async (name: RegExp) => {
  const detail = document.querySelector('.list-template-detail');
  const direct = detail ? within(detail as HTMLElement).queryByRole('button', { name }) : null;
  if (direct) return direct;
  fireEvent.click(within(pageToolbar()).getByRole('button', { name: '\u0044i\u011fer i\u015flemler' }));
  return within(pageToolbar()).findByRole('menuitem', { name }, T);
};
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
const listRow = async (text: string) => {
  await screen.findByText(text, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
  return screen.getAllByRole('row').find((row) => row.querySelector('td') && within(row).queryByText(text)) as HTMLElement;
};
const select = async (name: string, _id?: string) => {
  fireEvent.click(await screen.findByText(name, { selector: '.tenant-page-data-grid td' }, T));
  await waitFor(() => expect(document.querySelector('.tenant-page-data-grid tr.is-selected')?.textContent).toContain(name), T);

};
const confirmLast = async () => {
  const dialog = await screen.findByRole('alertdialog', {}, T);
  fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
  return dialog;
};
/** Ekstre adımını hesapla açar ve satırları bekler. */
const openStatement = async (id = K1) => {
  setup('finance-accounts');
  await select(id === K1 ? 'Merkez kasa' : 'Ziraat TL', id);
  fireEvent.click(command('open'));
  await waitFor(() => expect(statements(id).length).toBeGreaterThan(0), T);
  await listRow('Elle giriş · avans');
};

beforeEach(() => {
  calls = []; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  for (const page of ['finance-accounts', 'finance-banks', 'finance-account-create']) setPageParams(page, {});
});

describe('Kasalar standart tanımı', { timeout: 30000 }, () => {
  it('both standards use exactly the operations of the catalog fixture; the status operations carry a fixed isActive query', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    for (const key of ['finance-accounts', 'finance-banks']) {
      const standard = read(key);
      expect(standard.version).toBe(2);
      expect(standard.stage).toBe('preview');
      expect([...new Set(standard.definition.queries.map((item) => item.operation))].sort()).toEqual([...names].sort());
    }
    const fixed = (name: string) => (catalog.operations.find((operation) => operation.name === name) as { fixedQuery?: unknown }).fixedQuery;
    expect(fixed('finans.hesap.pasifeAl')).toEqual({ isActive: false });
    expect(fixed('finans.hesap.aktifEt')).toEqual({ isActive: true });
  });

  it('lists only cash accounts with the summary of the same type; transfer targets are read without a type', async () => {
    setup();
    const row = await listRow('Merkez kasa');
    const lists = gets('/api/finance/accounts');
    expect(lists.some((call) => query(call.url).get('type') === 'Cash')).toBe(true);
    expect(lists.some((call) => !query(call.url).has('type'))).toBe(true);
    expect(gets('/api/finance/accounts/summary').map((call) => query(call.url).get('type'))).toEqual(['Cash']);
    expect(screen.queryByText('Ziraat TL', { selector: '.tenant-page-data-grid td' })).toBeNull();
    expect(row.textContent).toContain('KASA-01');
    expect(row.textContent).toContain('Kasa');
    expect(within(row).getByText('Aktif').className).toContain('tone-success');
    expect(within(await listRow('Eski kasa')).getByText('Pasif').className).toContain('tone-info');
    await waitFor(() => expect(document.body.textContent).toContain('2 hesaptan · 1 pasif'), T);
    expect(document.body.textContent).toContain('Toplam bakiye');
    expect(document.body.textContent).not.toContain('Eksi bakiyeli hesap');
    // Ekstre ancak hesap seçilince okunur.
    expect(calls.filter((call) => /^\/api\/finance\/accounts\/[0-9a-f-]{36}$/.test(call.url.split('?')[0]))).toEqual([]);
  });

  it('Yeni opens the card with accountType Cash; Düzenle opens it with the selected accountId', async () => {
    setup();
    await select('Merkez kasa', K1);
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'finance-account-create', params: { accountType: 'Cash' } });
    fireEvent.click(await menuItem(/^Düzenle/));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toMatchObject({ page: 'finance-account-create', params: { accountId: K1 } });
  });

  it('Pasife al asks first and posts the status with isActive=false; Etkinleştir posts isActive=true', async () => {
    setup();
    await select('Merkez kasa', K1);
    fireEvent.click(await menuItem(/Pasife al/));
    const confirm = await screen.findByRole('alertdialog', {}, T);
    expect(confirm.textContent).toContain('KASA-01 · Merkez kasa');
    expect(writes()).toEqual([]);
    fireEvent.click(within(confirm).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/finance/accounts/${K1}/status?isActive=false` });
    await waitFor(() => expect(gets('/api/finance/accounts/summary').length).toBeGreaterThan(1), T);

    await select('Eski kasa', K2);
    fireEvent.click(await menuItem(/Etkinleştir/));
    await confirmLast();
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toMatchObject({ method: 'POST', url: `/api/finance/accounts/${K2}/status?isActive=true` });
  });

  it('Sil is hidden for an account with movements and deletes an empty account after confirmation', async () => {
    setup();
    await select('Merkez kasa', K1);
    fireEvent.click(within(pageToolbar()).getByRole('button', { name: '\u0044i\u011fer i\u015flemler' }));
    expect(within(pageToolbar()).queryByRole('menuitem', { name: /^Sil/ })).toBeNull();
    closeMenu();
    await select('Eski kasa', K2);
    const item = await menuItem(/^Sil/);
    expect(item.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(item);
    await confirmLast();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'DELETE', url: `/api/finance/accounts/${K2}` });
  });

  it('Ekstre opens a statement window for the selected account with server paging', async () => {
    setup();
    await select('Merkez kasa', K1);
    fireEvent.click(command('open'));
    const dialog = await screen.findByRole('dialog', { name: /Ekstre/ }, T);
    await waitFor(() => expect(statements(K1).length).toBeGreaterThan(0), T);
    expect(query(statements(K1)[0].url).get('page')).toBe('1');
    expect(query(statements(K1)[0].url).get('pageSize')).toBe('50');
    await within(dialog).findByText('Elle giri\u015f \u00b7 avans', {}, T);
    expect(dialog.textContent).toContain('KASA-01 \u00b7 Merkez kasa');
    expect(dialog.textContent).toContain('D\u00f6viz');
    expect(dialog.textContent).not.toContain('bu sayfa');
  });

  it('Ekstre opens only the selected account statement', async () => {
    setup();
    await select('Eski kasa', K2);
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: /Ekstre/ }, T);
    await waitFor(() => expect(statements(K2).length).toBeGreaterThan(0), T);
    expect(statements(K1)).toEqual([]);
  });

  it('statement rows: labels, sources and the row commands follow the server flags', async () => {
    await openStatement();
    const headers = [...document.querySelectorAll('.tenant-page-data-grid th')].map((th) => th.textContent?.trim());
    for (const label of ['Tarih', 'Kaynak', 'Açıklama', 'Nakit akışı', 'Referans', 'Giriş', 'Çıkış', 'Durum']) expect(headers).toContain(label);
    const manual = await listRow('Elle giriş · avans');
    const reversal = await listRow('Ters kayıt · avans');
    const transfer = await listRow('Kasa/banka döviz transferi');
    const collection = await listRow('Müşteri tahsilatı');
    expect(within(manual).getByRole('button', { name: 'Hareketi iptal et' })).toBeTruthy();
    expect(within(manual).queryByRole('button', { name: 'Transferi iptal et' })).toBeNull();
    expect(within(transfer).getByRole('button', { name: 'Transferi iptal et' })).toBeTruthy();
    expect(within(transfer).queryByRole('button', { name: 'Hareketi iptal et' })).toBeNull();
    expect(within(reversal).queryByRole('button', { name: /iptal et/ })).toBeNull();
    expect(within(collection).queryByRole('button', { name: /iptal et/ })).toBeNull();
    // Nakit akışı sınıfı yalnız izinli satırlarda (transfer ve ters kayıt hayır).
    expect(within(manual).getByRole('button', { name: 'Nakit akışı sınıfı' })).toBeTruthy();
    expect(within(transfer).queryByRole('button', { name: 'Nakit akışı sınıfı' })).toBeNull();
    expect(transfer.textContent).toContain('TRF-0007');
    expect(transfer.textContent).toContain('İç transfer');
    expect(manual.textContent).toContain('İşletme');
    expect(within(reversal).getAllByText('Ters kayıt').length).toBeGreaterThan(0);
  });

  it('Hareketi iptal et confirms, then posts the void with the ACCOUNT id and the row TRANSACTION id', async () => {
    await openStatement();
    fireEvent.click(within(await listRow('Elle giriş · avans')).getByRole('button', { name: 'Hareketi iptal et' }));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('Elle giriş · avans');
    expect(dialog.textContent).toContain('Ters kayıtla iptal et');
    expect(writes()).toEqual([]);
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/finance/accounts/${K1}/transactions/${H1}/void` });
    // Ekstre, liste ve özet yenilenir.
    await waitFor(() => expect(statements(K1).length).toBeGreaterThan(1), T);
  });

  it('Transferi iptal et posts the void of the row transferId', async () => {
    await openStatement();
    fireEvent.click(within(await listRow('Kasa/banka döviz transferi')).getByRole('button', { name: 'Transferi iptal et' }));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('TRF-0007');
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/finance/transfers/${TR}/void` });
  });

  it('Manuel hareket posts a movement with a request id to the selected account', async () => {
    await openStatement();
    fireEvent.click(await menuItem(/Manuel hareket/));
    const dialog = await screen.findByRole('dialog', { name: /Manuel hareket/ }, T);
    expect(input('hareketTarihi').value).toBe(today());
    fireEvent.change(input('hareketYonu'), { target: { value: 'Outflow' } });
    fireEvent.change(input('hareketTutari'), { target: { value: '150' } });
    fireEvent.change(input('hareketAciklamasi'), { target: { value: 'Kırtasiye' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/finance/accounts/${K1}/movements`);
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ requestId: expect.stringMatching(GUID), transactionDate: today(), direction: 'Outflow', amount: 150,
      description: 'Kırtasiye', cashFlowCategory: 'Unclassified' });
  });
});

describe('Bankalar standart tanımı', { timeout: 30000 }, () => {
  it('lists bank accounts only, shows the negative balance metric and opens a Bank card', async () => {
    setup('finance-banks');
    const row = await listRow('Ziraat TL');
    expect(row.textContent).toContain('Banka');
    expect(gets('/api/finance/accounts').some((call) => query(call.url).get('type') === 'Bank')).toBe(true);
    expect(gets('/api/finance/accounts/summary').map((call) => query(call.url).get('type'))).toEqual(['Bank']);
    expect(screen.queryByText('Merkez kasa', { selector: '.tenant-page-data-grid td' })).toBeNull();
    await waitFor(() => expect(document.body.textContent).toContain('Eksi bakiyeli hesap'), T);
    await waitFor(() => expect(command('new').getAttribute('aria-disabled')).not.toBe('true'), T);
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'finance-account-create', params: { accountType: 'Bank' } });
  });

  it('the bank statement voids with the bank account id', async () => {
    setup('finance-banks');
    await select('Ziraat TL', B1);
    fireEvent.click(command('open'));
    await waitFor(() => expect(statements(B1).length).toBeGreaterThan(0), T);
    await waitFor(() => expect(document.body.textContent).toContain('Banka · TRY'), T);
    fireEvent.click(within(await listRow('Elle giriş · avans')).getByRole('button', { name: 'Hareketi iptal et' }));
    await confirmLast();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/finance/accounts/${B1}/transactions/${H1}/void`);
    await settle();
  });
});
