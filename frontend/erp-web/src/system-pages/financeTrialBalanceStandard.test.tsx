import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { pageDateScope } from '../custom-page/pageBindings';
import catalog from './financeTrialBalanceOperations.fixture.json';

// "Mizan" standart tanımı (finance-trial-balance.json): dönem, standart, düzey (alt / ana) ve kapsam (yalnız hareketli) sunucu
// parametreleridir; genel toplamlar ve denge durumu sunucu meta alanlarından gelir. Muavin yalnız TDHP alt hesap düzeyinde açılır.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'finance-trial-balance';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; version: number; definition: Definition };

const A1 = 'cccccccc-0000-0000-0000-000000000001';
const A2 = 'cccccccc-0000-0000-0000-000000000002';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const row = (accountId: string, code: string, name: string, debit: number, credit: number) => ({
  accountId, code, name, isActive: true, statementSection: 'Asset', openingDebit: 0, openingCredit: 0, debit, credit,
  balanceDebit: debit > credit ? debit - credit : 0, balanceCredit: credit > debit ? credit - debit : 0, accountClass: code[0],
});
let balanced = true;
let complete = true;
function trialBalance(params: URLSearchParams) {
  const basis = params.get('basis') ?? 'TDHP';
  const level = params.get('level') ?? 'sub';
  const accounts = basis === 'IFRS'
    ? [row('IFRS:1000', '1000', 'Cash and equivalents', 50000, 0), row('IFRS:4000', '4000', 'Revenue', 0, 50000)]
    : level === 'main'
      ? [row('MAIN:100', '100', 'Kasa', 50000, 0), row('MAIN:600', '600', 'Yurt içi satışlar', 0, 50000)]
      : [row(A1, '100.01', 'Merkez kasa', 50000, 0), row(A2, '600.01', 'Yurt içi satışlar', 0, balanced ? 50000 : 40000)];
  return {
    from: params.get('from'), to: params.get('to'), basis, level, movedOnly: params.get('movedOnly') === 'true',
    totalOpeningDebit: 0, totalOpeningCredit: 0, totalDebit: 50000, totalCredit: balanced ? 50000 : 40000, totalBalanceDebit: 50000,
    totalBalanceCredit: balanced ? 50000 : 40000, unmappedAccountCount: complete ? 0 : 3, isComplete: complete, isBalanced: balanced,
    accountCount: 12, movedAccountCount: 2, accounts,
  };
}

type Call = { url: string; method: string };
let calls: Call[] = [];

function respond(url: string, method: string): unknown {
  const [path, search] = url.split('?');
  const params = new URLSearchParams(search ?? '');
  if (method === 'GET') {
    if (path === '/api/finance/general-ledger/trial-balance') return trialBalance(params);
    if (path === `/api/finance/general-ledger/accounts/${A1}/statement`) {
      return { from: params.get('from'), to: params.get('to'), openingDebit: 0, openingCredit: 0, openingBalanceDebit: 1000, openingBalanceCredit: 0,
        totalDebit: 50000, totalCredit: 0, closingBalanceDebit: 51000, closingBalanceCredit: 0, totalCount: 1, page: 1, pageSize: 50, totalPages: 1,
        lines: [{ journalEntryId: 'j1', journalEntryCode: 'YF-2026-0001', entryDate: '2026-03-05', journalDescription: 'Satış', sourceType: 'SalesInvoice',
          lineNumber: 1, lineDescription: 'Peşin satış SF-12', debit: 50000, credit: 0 }] };
    }
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup() {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: false, update: false, delete: false },
        screenKey: KEY, source: 'standard', standardVersion: standard.version, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt('TenantUser')} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const settle = (ms = 50) => new Promise((done) => setTimeout(done, ms));
const trials = () => calls.filter((call) => call.url.split('?')[0] === '/api/finance/general-ledger/trial-balance');
const statements = () => calls.filter((call) => /\/statement$/.test(call.url.split('?')[0]));
const params = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const last = () => params(trials().at(-1)!.url);
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const cell = (text: string) => screen.findByText(text, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
const listRow = async (text: string) => {
  await cell(text);
  return screen.getAllByRole('row').find((item) => item.querySelector('td') && within(item).queryByText(text)) as HTMLElement;
};

beforeEach(() => { calls = []; balanced = true; complete = true; api.mockReset(); localStorage.clear(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Mizan standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect([...new Set(standard.definition.queries.map((item) => item.operation))].sort()).toEqual([...names].sort());
  });

  it('loads the year so far, TDHP, sub level and moved accounts only; totals and the balance state come from the server', async () => {
    setup();
    await cell('Merkez kasa');
    expect(trials()).toHaveLength(1);
    const first = last();
    expect([first.get('from'), first.get('to')]).toEqual([pageDateScope().yilBasi, today()]);
    expect(first.get('basis')).toBe('TDHP');
    expect(first.get('level')).toBe('sub');
    expect(first.get('movedOnly')).toBe('true');
    const headers = [...document.querySelectorAll('.tenant-page-data-grid th')].map((th) => th.textContent?.trim());
    for (const label of ['Hesap', 'Hesap adı', 'Açılış B', 'Açılış A', 'Dönem B', 'Dönem A', 'Bakiye B', 'Bakiye A']) expect(headers).toContain(label);
    await waitFor(() => expect(document.body.textContent).toContain('Mizan dengede'), T);
    expect(document.body.textContent).toContain('2 hareketli hesap');
    expect(document.body.textContent).not.toContain('Dengede değil');
    expect(screen.queryByText('IFRS eşlemesi eksik')).toBeNull();
    // Satır seçilmeden muavin okunmaz.
    expect(statements()).toEqual([]);
  });

  it('düzey Ana hesap sends level=main; unchecking the scope re-runs with movedOnly false', async () => {
    setup();
    await cell('Merkez kasa');
    fireEvent.change(input('duzey'), { target: { value: 'main' } });
    await waitFor(() => expect(last().get('level')).toBe('main'), T);
    await cell('Kasa');
    fireEvent.click(input('yalnizHareketli'));
    await waitFor(() => expect(last().get('movedOnly')).not.toBe('true'), T);
    // Kapsam kapalıyken değer "false" olarak gider (boş sayılıp düşürülmez).
    expect(last().get('movedOnly')).toBe('false');
    expect(last().get('level')).toBe('main');
  });

  it('IFRS disables the level select and shows the incomplete-mapping alert', async () => {
    complete = false;
    setup();
    await cell('Merkez kasa');
    fireEvent.change(input('standart'), { target: { value: 'IFRS' } });
    await waitFor(() => expect(last().get('basis')).toBe('IFRS'), T);
    await cell('Cash and equivalents');
    expect(input('duzey').disabled).toBe(true);
    expect(await screen.findByText('IFRS eşlemesi eksik', {}, T)).toBeTruthy();
    expect(document.body.textContent).toContain('3 hareketli hesapta IFRS eşlemesi eksik');
  });

  it('Bu ay assigns both dates and re-runs; an unbalanced result shows Dengede değil', async () => {
    balanced = false;
    setup();
    await cell('Merkez kasa');
    await waitFor(() => expect(document.body.textContent).toContain('Dengede değil'), T);
fireEvent.change(input('baslangic'), { target: { value: `${today().slice(0, 8)}01` } });
await waitFor(() => expect([last().get('from'), last().get('to')]).toEqual([`${today().slice(0, 8)}01`, today()]), T);
  });

  it('a row opens the ledger statement (muavin) of that account for the same period at TDHP sub level', async () => {
    setup();
    fireEvent.click(await cell('Merkez kasa'));
    await waitFor(() => expect(statements()).toHaveLength(1), T);
    const url = statements()[0].url;
    expect(url.split('?')[0]).toBe(`/api/finance/general-ledger/accounts/${A1}/statement`);
    expect([params(url).get('from'), params(url).get('to')]).toEqual([pageDateScope().yilBasi, today()]);
    fireEvent.click(within(await listRow('Merkez kasa')).getByRole('button', { name: 'Muavin' }));
    const dialog = await screen.findByRole('dialog', { name: /Muavin · 100\.01 Merkez kasa/ }, T);
    await within(dialog).findByText('Peşin satış SF-12', {}, T);
    expect(dialog.textContent).toContain('Kapanış borç');
  });

  it('main level rows have no Muavin command and send no statement request for the MAIN: key', async () => {
    setup();
    await cell('Merkez kasa');
    fireEvent.change(input('duzey'), { target: { value: 'main' } });
    await waitFor(() => expect(last().get('level')).toBe('main'), T);
    const main = await listRow('Kasa');
    expect(within(main).queryByRole('button', { name: 'Muavin' })).toBeNull();
    fireEvent.click(await cell('Kasa'));
    await settle(300);
    expect(statements()).toEqual([]);
  });
});
