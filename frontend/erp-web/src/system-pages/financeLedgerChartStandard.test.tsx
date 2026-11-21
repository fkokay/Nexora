import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import catalog from './financeLedgerChartOperations.fixture.json';

// "Hesap Planı" standart tanımı (finance-ledger-chart.json): düz liste + sınıf süzgeci, sağda hesap kartı (yeni / düzenle),
// pasife al / etkinleştir (kaynak kayıt finans.muhasebe.hesap.getir), sil, Tek Düzen Hesap Planı ve muavin penceresi.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'finance-ledger-chart';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const A1 = 'cccccccc-0000-0000-0000-000000000001';
const A2 = 'cccccccc-0000-0000-0000-000000000002';
const A3 = 'cccccccc-0000-0000-0000-000000000003';
const NEW = 'cccccccc-0000-0000-0000-0000000000aa';
const ACCOUNTS = '/api/finance/general-ledger/accounts';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const ledgerAccount = (id: string, code: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, code, name, isActive: true, statementSection: 'Asset', hasMovements: false, accountType: 'Asset', normalBalance: 'Debit', currencyCode: null,
  ifrsAccountCode: null, ifrsAccountName: null, ifrsStatementSection: 'Unclassified', accountClass: code[0], ...extra,
});
const accounts = () => [
  ledgerAccount(A1, '100.01', 'Merkez kasa', { hasMovements: true }),
  ledgerAccount(A2, '120.001', 'Alıcılar · Yurt içi'),
  ledgerAccount(A3, '600.01', 'Yurt içi satışlar', { isActive: false, statementSection: 'Revenue', accountType: 'Revenue', normalBalance: 'Credit' }),
];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  const one = new RegExp(`^${ACCOUNTS}/([0-9a-f-]{36})$`).exec(path);
  if (method === 'GET') {
    if (path === ACCOUNTS) return accounts();
    if (path === `${ACCOUNTS}/standard-chart`) return { template: 'TDHP', version: '2026', sourceUrl: null, totalAccounts: 300, existingAccounts: 3, accountsToAdd: 297 };
    if (one) return accounts().find((item) => item.id === one[1]);
    if (/\/statement$/.test(path)) {
      return { from: null, to: null, openingDebit: 0, openingCredit: 0, openingBalanceDebit: 0, openingBalanceCredit: 0, totalDebit: 0, totalCredit: 0,
        closingBalanceDebit: 0, closingBalanceCredit: 0, totalCount: 0, page: 1, pageSize: 50, totalPages: 0, lines: [] };
    }
  } else if (method === 'POST') {
    if (path === ACCOUNTS) return ledgerAccount(NEW, '120.002', 'Yeni alıcı');
    if (path === `${ACCOUNTS}/standard-chart/apply`) return { template: 'TDHP', addedCount: 297, preservedExistingCount: 3, totalAccounts: 300 };
  } else if (method === 'PUT' && one) {
    return accounts().find((item) => item.id === one[1]);
  } else if (method === 'DELETE' && one) {
    return null;
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
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const writes = () => calls.filter((call) => call.method !== 'GET');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const menuItem = async (name: RegExp) => {
  fireEvent.click(command('more')!);
  return screen.findByRole('menuitem', { name }, T);
};
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
const select = async (name: string, id: string) => {
  fireEvent.click(await screen.findByText(name, { selector: '.tenant-page-data-grid td' }, T));
  await waitFor(() => expect(gets(`${ACCOUNTS}/${id}`).length).toBeGreaterThan(0), T);
};
const confirmLast = async () => {
  const dialog = await screen.findByRole('alertdialog', {}, T);
  const text = dialog.textContent;
  fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
  return text;
};

beforeEach(() => { calls = []; api.mockReset(); localStorage.clear(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Hesap Planı standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect([...new Set(standard.definition.queries.map((item) => item.operation))].sort()).toEqual([...names].sort());
  });

  it('lists the flat chart with class, type, working side and status labels', async () => {
    setup();
    await screen.findByText('Merkez kasa', { selector: '.tenant-page-data-grid td' }, T);
    const headers = [...document.querySelectorAll('.tenant-page-data-grid th')].map((th) => th.textContent?.trim());
    for (const label of ['Kod', 'Hesap', 'Sınıf', 'Tip', 'Çalışma şekli', 'Durum']) expect(headers).toContain(label);
    const passive = screen.getAllByRole('row').find((row) => within(row).queryByText('Yurt içi satışlar'))!;
    expect(passive.textContent).toContain('Gelir');
    expect(passive.textContent).toContain('Alacak');
    expect(within(passive).getByText('Pasif').className).toContain('tone-info');
    expect(screen.queryByText('Hesap planını firma yöneticisi düzenler.')).toBeNull();
    // Hesap kartı ve muavin seçimle okunur.
    expect(calls.filter((call) => new RegExp(`^${ACCOUNTS}/[0-9a-f-]{36}`).test(call.url))).toEqual([]);
  });

  it('edit: the selected account fills the card and Kaydet PUTs it from the account read', async () => {
    setup();
    await select('Alıcılar · Yurt içi', A2);
    await waitFor(() => expect(input('kod').value).toBe('120.001'), T);
    expect(input('ad').value).toBe('Alıcılar · Yurt içi');
    fireEvent.change(input('ad'), { target: { value: 'Alıcılar (yurt içi)' } });
    await ready('save');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `${ACCOUNTS}/${A2}` });
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ code: '120.001', name: 'Alıcılar (yurt içi)', statementSection: 'Asset', accountType: 'Asset',
      normalBalance: 'Debit', isActive: true });
  });

  it('Yeni clears the card and Kaydet POSTs a new active account', async () => {
    setup();
    await screen.findByText('Merkez kasa', { selector: '.tenant-page-data-grid td' }, T);
    await ready('new');
    fireEvent.click(command('new')!);
    await waitFor(() => expect(input('kod').value).toBe(''), T);
    fireEvent.change(input('kod'), { target: { value: '120.002' } });
    fireEvent.change(input('ad'), { target: { value: 'Yeni alıcı' } });
    await ready('save');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: ACCOUNTS });
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ code: '120.002', name: 'Yeni alıcı', isActive: true });
  });

  it('Pasife al confirms and PUTs the account read with isActive false; Etkinleştir sends true', async () => {
    setup();
    await select('Merkez kasa', A1);
    await select('Alıcılar · Yurt içi', A2);
    fireEvent.click(await menuItem(/Pasife al/));
    expect(await confirmLast()).toContain('120.001 · Alıcılar · Yurt içi');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `${ACCOUNTS}/${A2}` });
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ code: '120.001', isActive: false });

    await select('Yurt içi satışlar', A3);
    fireEvent.click(await menuItem(/Etkinleştir/));
    await confirmLast();
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toMatchObject({ method: 'PUT', url: `${ACCOUNTS}/${A3}` });
    expect(JSON.parse(writes()[1].body!)).toMatchObject({ code: '600.01', isActive: true });
  });

  it('Sil is disabled for an account with movements and deletes after confirmation otherwise', async () => {
    setup();
    await select('Merkez kasa', A1);
    expect((await menuItem(/^Sil/)).getAttribute('aria-disabled')).toBe('true');
    closeMenu();
    await select('Alıcılar · Yurt içi', A2);
    const item = await menuItem(/^Sil/);
    await waitFor(() => expect(item.getAttribute('aria-disabled')).not.toBe('true'), T);
    fireEvent.click(item);
    await confirmLast();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'DELETE', url: `${ACCOUNTS}/${A2}` });
  });

  it('Tek Düzen Hesap Planı shows the preview counts before applying', async () => {
    setup();
    await waitFor(() => expect(gets(`${ACCOUNTS}/standard-chart`)).toHaveLength(1), T);
    await screen.findByText('Merkez kasa', { selector: '.tenant-page-data-grid td' }, T);
    fireEvent.click(await menuItem(/Tek Düzen Hesap Planı/));
    const text = await confirmLast();
    expect(text).toContain('eksik 297 hesap');
    expect(text).toContain('Var olan 3 hesap');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `${ACCOUNTS}/standard-chart/apply` });
  });

  it('Hareketleri gör opens the ledger statement of the selected account', async () => {
    setup();
    await select('Merkez kasa', A1);
    fireEvent.click(await menuItem(/Hareketleri gör/));
    await screen.findByRole('dialog', { name: /Muavin · 100\.01 Merkez kasa/ }, T);
    await waitFor(() => expect(gets(`${ACCOUNTS}/${A1}/statement`).length).toBeGreaterThan(0), T);
  });

  it('a non-admin sees the read-only note and no new / save commands', async () => {
    setup('TenantUser');
    await screen.findByText('Merkez kasa', { selector: '.tenant-page-data-grid td' }, T);
    expect(await screen.findByText('Hesap planını firma yöneticisi düzenler.', {}, T)).toBeTruthy();
    await settle(100);
    expect(command('new')).toBeNull();
    expect(command('save')).toBeNull();
    expect(input('kod')).toBeNull();
  });
});
