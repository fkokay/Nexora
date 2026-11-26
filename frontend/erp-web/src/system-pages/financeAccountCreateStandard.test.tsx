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
import catalog from './financeAccountCreateOperations.fixture.json';

// "Kasa/Banka kartı" standart tanımı (finance-account-create.json): yeni ve düzenleme tek tanım. `{{sayfa.parametre.accountId}}`
// boşsa yeni kart (finans.hesap.olustur), doluysa o kart düzenlenir (finans.hesap.getir + finans.hesap.guncelle).
// `accountType` sayfa parametresi (Kasalar / Bankalar listesinden) türü sabitler.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'finance-account-create';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const K1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const NEW = 'aaaaaaaa-0000-0000-0000-0000000000aa';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const card = (extra: Record<string, unknown> = {}) => ({
  id: K1, code: 'KASA-01', name: 'Merkez kasa', type: 'Cash', currencyCode: 'TRY', isActive: true, balance: 48250, createdAt: '2026-01-01T00:00:00Z',
  transactionPage: 1, transactionPageSize: 50, transactionTotalCount: 4, totalCount: 4, transactions: [], ...extra,
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET' && path === `/api/finance/accounts/${K1}`) return card();
  if (method === 'POST' && path === '/api/finance/accounts') {
    return { id: NEW, code: 'KASA-02', name: 'Şube kasa', type: 'Cash', currencyCode: 'TRY', isActive: true, balance: 0, transactionCount: 0, createdAt: '2026-11-21' };
  }
  if (method === 'PUT' && path === `/api/finance/accounts/${K1}`) return { ...card(), transactions: undefined };
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(params: Record<string, string> = {}) {
  setPageParams(KEY, params);
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
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt('TenantAdmin')} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const settle = (ms = 50) => new Promise((done) => setTimeout(done, ms));
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const posts = () => writes().filter((call) => call.method === 'POST' && call.url === '/api/finance/accounts');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const title = () => document.querySelector('.tenant-custom-page-header h1, .list-v2-title h1')?.textContent;
const openNew = async (params: Record<string, string> = {}) => {
  setup(params);
  await waitFor(() => expect(input('kod')).toBeTruthy(), T);
  await ready('save');
};
const openCard = async () => {
  setup({ accountId: K1 });
  await waitFor(() => expect(input('ad').value).toBe('Merkez kasa'), T);
  await ready('save');
};

let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };
beforeEach(() => { calls = []; navigations = []; api.mockReset(); localStorage.clear(); window.addEventListener(OPEN_PAGE_EVENT, onNavigate); });
afterEach(() => {
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  setPageParams(KEY, {});
});

describe('Kasa/Banka kartı standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect([...new Set(standard.definition.queries.map((item) => item.operation))].sort()).toEqual([...names].sort());
  });

  it('new cash card: title, no card read, opening balance, and one POST with the entered values', async () => {
    await openNew({ accountType: 'Cash' });
    expect(title()).toBe('Kasa/Banka Kartı Tanımlama');
    expect(calls.filter((call) => call.method === 'GET')).toEqual([]);
    expect(input('acilisBakiyesi')).toBeTruthy();
    // Yeni kartta döviz TRY ile başlar (emptyDefault) ve dokunulmadan gönderilir.
    expect(input('doviz').value).toBe('TRY');
    type('kod', 'kasa-02');
    type('ad', 'Şube kasa');
    type('acilisBakiyesi', '500');
    fireEvent.click(command('save'));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    expect(JSON.parse(posts()[0].body!)).toEqual({ code: 'KASA-02', name: 'Şube kasa', type: 'Cash', currencyCode: 'TRY', openingBalance: 500 });
    await settle(100);
    expect(writes().filter((call) => call.method === 'PUT')).toEqual([]);
    // Kayıttan sonra oluşturulan kart aynı sekmede düzenleme kipinde açılır (ikinci Kaydet yinelenen kart oluşturmaz).
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: KEY, params: { accountId: NEW } });
  });

  it('accountType Bank fixes the type: the select is disabled and the POST carries Bank', async () => {
    await openNew({ accountType: 'Bank' });
    await waitFor(() => expect(input('tur').value).toBe('Bank'), T);
    expect(input('tur').disabled).toBe(true);
    type('kod', 'bnk-02');
    type('ad', 'Vakıf USD');
    type('doviz', 'usd');
    fireEvent.click(command('save'));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    expect(JSON.parse(posts()[0].body!)).toMatchObject({ code: 'BNK-02', name: 'Vakıf USD', type: 'Bank', currencyCode: 'USD' });
  });

  it('Kaydet ve yeni (new card only) creates and stays on an empty card', async () => {
    await openNew({ accountType: 'Cash' });
    type('kod', 'kasa-03');
    type('ad', 'Birinci');
    type('doviz', 'TRY');
    // Kaydet ve yeni is a bar button next to Kaydet.
    fireEvent.click(await waitFor(() => { const button = screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>('[data-command="save-and-new"]'); expect(button).not.toBeNull(); return button!; }));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    await waitFor(() => expect(input('kod').value).toBe(''), T);
    expect(input('ad').value).toBe('');
  });

  it('edit: reads the card, hides the opening balance and PUTs the card with openingBalance 0', async () => {
    await openCard();
    await waitFor(() => expect(title()).toBe('KASA-01 · Merkez kasa'), T);
    expect(input('acilisBakiyesi')).toBeNull();
    expect(input('tur').disabled).toBe(true);
    expect(document.body.textContent).toContain('4 hareket');
    await settle();
    expect(command('more')).toBeNull();
    type('ad', 'Merkez kasa TL');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/finance/accounts/${K1}` });
    // Gövde kaynak kayıttan (finans.hesap.getir) başlar; açılış bakiyesi sabit 0 gider.
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ code: 'KASA-01', name: 'Merkez kasa TL', type: 'Cash', currencyCode: 'TRY', openingBalance: 0 });
    expect(posts()).toEqual([]);
    // Güncellemeden sonra kart açık kalır: "Kartı aç" yalnız yeni kartta (oluşturma sonrası) çalışır.
    await settle(100);
    expect(navigations).toEqual([]);
  });
});
