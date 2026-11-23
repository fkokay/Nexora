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
import catalog from './fixedAssetsOperations.fixture.json';

// "Duran Varlıklar" standart tanımı (fixed-assets.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `fixedAssetsOperations.fixture.json` ErpOperationCatalog'un bu sayfanın kullandığı duranVarlik.* işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'fixed-assets';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as
  { title: string; version: number; stage: string; module: string; definition: Definition };

const A1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const A2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const asset = (id: string, assetCode: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, assetCode, name, category: 'Makine', acquisitionDate: '2026-01-10', inServiceDate: '2026-01-15', acquisitionCostBase: 120000, residualValueBase: 0,
  usefulLifeMonths: 60, accumulatedDepreciationBase: 18000, status: 'Active', supplierAccountId: null, sourceReference: null, purchaseInvoiceId: null,
  rowVersion: 'rv', vukTaxYear: 2026, vukDepreciationLowerLimitTry: 12000, vukCommuniqueNumber: 580, remainingBookValueBase: 102000,
  monthlyDepreciationBase: 2000, depreciatedMonths: 9, ...extra,
});
const assets = () => [
  asset(A1, 'DV-CNC-01', 'CNC tezgâhı'),
  asset(A2, 'DV-TST-02', 'Eski forklift', { status: 'Disposed', accumulatedDepreciationBase: 40000, remainingBookValueBase: 0 }),
];
const record = (id: string) => ({
  ...assets().find((item) => item.id === id)!, currentAssignee: 'P-001 · Ayşe Yılmaz', currentAssignmentId: null, purchaseInvoiceCode: 'AF-2026-0007',
  hasVukProfile: false, vukScheduleAssetId: null, isDisposed: id === A2,
});
const schedule = (id: string) => ({
  assetId: id, method: 'StraightLineMonthlyAfterInServiceMonth', acquisitionCostBase: 120000, residualValueBase: 0, accumulatedDepreciationBase: 18000,
  nextPeriodStart: '2026-11-01', nextAmountBase: 2000,
  rows: [{ periodStart: '2026-10-01', amountBase: 2000, isPosted: true, journalEntryId: 'eeeeeeee-0000-0000-0000-000000000001' },
    { periodStart: '2026-11-01', amountBase: 2000, isPosted: false, journalEntryId: null }],
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/fixed-assets') {
      const status = query(url).get('status');
      const items = assets().filter((item) => !status || item.status === status);
      return { items, page: 1, pageSize: 25, totalCount: items.length };
    }
    if (path === '/api/fixed-assets/summary') {
      return { count: 2, activeCount: 1, disposedCount: 1, acquisitionCostBase: 240000, accumulatedDepreciationBase: 58000, netBookValueBase: 182000,
        currentMonthDepreciationEstimateBase: 2000 };
    }
    const one = /^\/api\/fixed-assets\/([0-9a-f-]{36})$/.exec(path);
    if (one) return record(one[1]);
    const plan = /^\/api\/fixed-assets\/([0-9a-f-]{36})\/depreciation-schedule$/.exec(path);
    if (plan) return schedule(plan[1]);
  } else if (method === 'POST') {
    const posting = /^\/api\/fixed-assets\/([0-9a-f-]{36})\/depreciation-postings$/.exec(path);
    if (posting) return { id: 'ffffffff-0000-0000-0000-000000000001', assetId: posting[1], periodStart: '2026-11-01', periodEnd: '2026-11-30', amountBase: 2000,
      journalEntryId: 'eeeeeeee-0000-0000-0000-000000000002' };
    const disposal = /^\/api\/fixed-assets\/([0-9a-f-]{36})\/disposals$/.exec(path);
    if (disposal) return { id: 'ffffffff-0000-0000-0000-000000000002', assetId: disposal[1], disposalDate: today(), reason: 'Satış', proceedsBase: 50000 };
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
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const cell = (text: string) => screen.findByText(text, { selector: '.tenant-page-data-grid td' }, T);
const rowOf = (text: string) => screen.getByText(text, { selector: '.tenant-page-data-grid td' }).closest('tr')!;
const menuItem = async (name: RegExp) => {
  fireEvent.click(command('more'));
  return screen.findByRole('menuitem', { name }, T);
};
const menuNames = async () => {
  fireEvent.click(command('more'));
  await screen.findAllByRole('menuitem', {}, T);
  const names = screen.queryAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '');
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  return names;
};
const select = async (name: string) => {
  fireEvent.click(await cell(name));
  await waitFor(() => expect(rowOf(name).classList.contains('is-selected') || rowOf(name).getAttribute('aria-selected') === 'true').toBe(true), T);
};
const confirmLast = async () => {
  const dialog = await screen.findByRole('alertdialog', {}, T);
  fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
  return dialog;
};

beforeEach(() => {
  calls = []; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  for (const page of [KEY, 'fixed-asset-card', 'fixed-asset-create']) setPageParams(page, {});
});

describe('Duran Varlıklar standart tanımı', { timeout: 30000 }, () => {
  it('is a version 1 preview of the Duran Varlık module and uses only operations from the catalog fixture', () => {
    expect(standard.version).toBe(1);
    expect(standard.stage).toBe('preview');
    expect(standard.module).toBe('Duran Varlık');
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads the first page of 25, the four summary metrics and the status labels; details are read only after a selection', async () => {
    setup();
    await cell('CNC tezgâhı');
    const list = gets('/api/fixed-assets');
    expect(query(list[0].url).get('page')).toBe('1');
    expect(query(list[0].url).get('pageSize')).toBe('25');
    expect(query(list[0].url).has('status')).toBe(false);
    await waitFor(() => expect(gets('/api/fixed-assets/summary').length).toBeGreaterThan(0), T);
    const text = () => document.body.textContent ?? '';
    for (const label of ['Edinim maliyeti', 'Birikmiş amortisman', 'Net defter değeri', 'Bu ay amortisman']) expect(text()).toContain(label);
    await waitFor(() => expect(text()).toContain('240.000,00'), T);
    expect(text()).toContain('182.000,00');
    expect(within(rowOf('CNC tezgâhı')).getByText('Etkin').className).toContain('tone-success');
    expect(within(rowOf('Eski forklift')).getByText('Elden çıkarıldı').className).toContain('tone-info');
    expect(rowOf('CNC tezgâhı').textContent).toContain('102.000,00');
    // Seçim yokken kayıt ve plan okunmaz.
    expect(calls.filter((call) => /^\/api\/fixed-assets\/[0-9a-f-]{36}/.test(call.url.split('?')[0]))).toEqual([]);
  });

  it('the status selection filters the list with status; the summary does not follow the status', async () => {
    setup();
    await cell('CNC tezgâhı');
    await waitFor(() => expect(gets('/api/fixed-assets/summary').length).toBeGreaterThan(0), T);
    const before = gets('/api/fixed-assets').length;
    fireEvent.change(input('durumSecimi'), { target: { value: 'Disposed' } });
    await waitFor(() => expect(gets('/api/fixed-assets').length).toBeGreaterThan(before), T);
    expect(query(gets('/api/fixed-assets').at(-1)!.url).get('status')).toBe('Disposed');
    for (const call of gets('/api/fixed-assets/summary')) expect(query(call.url).has('status')).toBe(false);
  });

  it('Yeni opens the acquisition page; Aç and a double click open the card with assetId', async () => {
    setup();
    await select('CNC tezgâhı');
    await ready('new');
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'fixed-asset-create' });
    await ready('open');
    fireEvent.click(command('open'));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toMatchObject({ page: 'fixed-asset-card', params: { assetId: A1 } });
    fireEvent.doubleClick(rowOf('Eski forklift'));
    await waitFor(() => expect(navigations).toHaveLength(3), T);
    expect(navigations[2]).toMatchObject({ page: 'fixed-asset-card', params: { assetId: A2 } });
  });

  it('İşlemler: Sil is always disabled; depreciation, disposal and Zimmetle only for an active asset', async () => {
    setup();
    await select('CNC tezgâhı');
    const sil = await menuItem(/^Sil/);
    expect(sil.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    let names = await menuNames();
    for (const name of ['Amortismanı kaydet', 'Elden çıkar', 'Zimmetle (eski ekranda)', 'Eski ekranda aç']) expect(names.some((item) => item.includes(name))).toBe(true);
    await select('Eski forklift');
    names = await menuNames();
    expect(names.some((item) => item.includes('Amortismanı kaydet'))).toBe(false);
    expect(names.some((item) => item.includes('Elden çıkar'))).toBe(false);
    expect(names.some((item) => item.includes('Zimmetle'))).toBe(false);
    expect(names.some((item) => item.includes('Eski ekranda aç'))).toBe(true);
  });

  it('Zimmetle opens the legacy fixed asset screen (no assignment write in v1)', async () => {
    setup();
    await select('CNC tezgâhı');
    fireEvent.click(await menuItem(/Zimmetle/));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'fixed-assets', legacy: true });
    expect(writes()).toEqual([]);
  });

  it('Amortismanı kaydet shows the next period from the schedule, asks first and posts that periodStart', async () => {
    setup();
    await select('CNC tezgâhı');
    await waitFor(() => expect(gets(`/api/fixed-assets/${A1}/depreciation-schedule`).length).toBeGreaterThan(0), T);
    fireEvent.click(await menuItem(/Amortismanı kaydet/));
    const dialog = await screen.findByRole('dialog', { name: /Amortismanı kaydet/ }, T);
    await waitFor(() => expect(dialog.textContent).toContain('01.11.2026'), T);
    expect(dialog.textContent).toContain('2.000,00');
    const save = within(dialog).getByRole('button', { name: 'Amortismanı kaydet' });
    await waitFor(() => expect(save.getAttribute('aria-disabled') === 'true' || (save as HTMLButtonElement).disabled).toBe(false), T);
    fireEvent.click(save);
    const confirm = await screen.findByRole('alertdialog', {}, T);
    expect(confirm.textContent).toContain('Bu kayıt yevmiyeye yazılır ve arayüzden geri alınamaz.');
    expect(writes()).toEqual([]);
    fireEvent.click(within(confirm).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/fixed-assets/${A1}/depreciation-postings` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ periodStart: '2026-11-01' });
    await waitFor(() => expect(gets('/api/fixed-assets/summary').length).toBeGreaterThan(1), T);
  });

  it('Elden çıkar defaults today and 0, asks first and posts the disposal with an idempotency key', async () => {
    setup();
    await select('CNC tezgâhı');
    fireEvent.click(await menuItem(/^Elden çıkar/));
    const dialog = await screen.findByRole('dialog', { name: /Elden çıkarma kaydı/ }, T);
    expect(input('cikarmaTarihi').value).toBe(today());
    expect(input('cikarmaTahsilati').value).toBe('0');
    fireEvent.change(input('cikarmaTahsilati'), { target: { value: '50000' } });
    fireEvent.change(input('cikarmaAciklamasi'), { target: { value: 'Satış' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Elden çıkarmayı kaydet' }));
    const confirm = await confirmLast();
    expect(confirm.textContent).toContain('Kıymet kalıcı olarak elden çıkarılır. Yevmiye fişi yazılır; arayüzden geri alınamaz.');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/fixed-assets/${A1}/disposals` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ disposalDate: today(), proceedsBase: 50000, reason: 'Satış', idempotencyKey: expect.stringMatching(GUID) });
  });

  it('detail panel: progress, monthly depreciation, current assignee and linked invoice of the selected asset', async () => {
    setup();
    await select('CNC tezgâhı');
    const panel = screen.getByLabelText('Detay paneli') as HTMLInputElement;
    if (!panel.checked) fireEvent.click(panel);
    const text = () => document.body.textContent ?? '';
    await waitFor(() => expect(text()).toContain('P-001 · Ayşe Yılmaz'), T);
    expect(text()).toContain('9 / 60 ay');
    expect(text()).toContain('Aylık amortisman');
    expect(text()).toContain('AF-2026-0007');
  });
});
