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
import catalog from './fixedAssetCardOperations.fixture.json';

// "Kıymet kartı" standart tanımı (fixed-asset-card.json): sayfa parametresi assetId; salt okunur kart, beş sekme ve listeyle aynı
// pencereler. VUK planı yalnız profil varken okunur (`vukScheduleAssetId` profilsiz kıymette boş: yol parametresi eksik okuma
// gönderilmez; sunucu profilsiz plana 409 döner).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'fixed-asset-card';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as
  { title: string; version: number; stage: string; definition: Definition };

const A1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const Z1 = 'cccccccc-0000-0000-0000-000000000001';
const Z2 = 'cccccccc-0000-0000-0000-000000000002';
const ACC = 'dddddddd-0000-0000-0000-000000000001';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

let vuk = false;
let posted = false;
let disposed = false;
let invoiceLinked = false;
const record = () => ({
  id: A1, assetCode: 'DV-CNC-01', name: 'CNC tezgâhı', category: 'Makine', acquisitionDate: '2026-01-10', inServiceDate: '2026-01-15',
  acquisitionCostBase: 120000, residualValueBase: 0, usefulLifeMonths: 60, accumulatedDepreciationBase: 18000, status: disposed ? 'Disposed' : 'Active',
  supplierAccountId: null, sourceReference: 'SÖZ-42', purchaseInvoiceId: invoiceLinked ? 'bbbbbbbb-0000-0000-0000-000000000001' : null, rowVersion: 'rv',
  vukTaxYear: 2026, vukDepreciationLowerLimitTry: 12000, vukCommuniqueNumber: 580,
  vukUsefulLifeCode: vuk ? '10.1' : null, vukUsefulLifeDescription: vuk ? 'Binalar (betonarme)' : null,
  remainingBookValueBase: 102000, monthlyDepreciationBase: 2000, depreciatedMonths: 9,
  currentAssignee: 'P-001 · Ayşe Yılmaz', currentAssignmentId: Z1, purchaseInvoiceCode: invoiceLinked ? 'AF-2026-0007' : null,
  hasVukProfile: vuk, vukScheduleAssetId: vuk ? A1 : null, isDisposed: disposed,
  disposalDate: disposed ? '2026-11-20' : null, disposalReason: disposed ? 'Satış' : null, disposalProceedsBase: disposed ? 50000 : null,
  disposalBookValueBase: disposed ? 102000 : null, disposalGainLossBase: disposed ? -52000 : null, disposalJournalEntryId: null,
});
const schedule = (next: string) => ({
  assetId: A1, nextPeriodStart: next, nextAmountBase: 2000,
  rows: [{ periodStart: '2026-10-01', amountBase: 2000, isPosted: true, journalEntryId: 'eeeeeeee-0000-0000-0000-000000000001' },
    { periodStart: next, amountBase: 2000, isPosted: false, journalEntryId: null }],
});
const assignments = () => [
  { id: Z1, employeeId: 'ffffffff-0000-0000-0000-000000000001', employee: 'P-001 · Ayşe Yılmaz', assignedDate: '2026-10-01', returnedDate: null,
    location: 'Üretim', notes: null, rowVersion: 'rv-z1' },
  { id: Z2, employeeId: 'ffffffff-0000-0000-0000-000000000002', employee: 'P-002 · Mehmet Kaya', assignedDate: '2026-02-01', returnedDate: '2026-09-30',
    location: 'Depo', notes: null, rowVersion: 'rv-z2' },
];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === `/api/fixed-assets/${A1}`) return record();
    if (path === `/api/fixed-assets/${A1}/depreciation-schedule`) return schedule('2026-11-01');
    if (path === `/api/fixed-assets/${A1}/tax-depreciation-schedule`) {
      if (!vuk) throw Object.assign(new Error('Bu kıymette mali müşavir tarafından doğrulanmış VUK faydalı ömür profili yok.'), { status: 409 });
      return schedule('2026-12-01');
    }
    if (path === `/api/fixed-assets/${A1}/acquisition-posting`) {
      return posted
        ? { assetId: A1, purchaseInvoiceCode: null, journalEntryId: 'eeeeeeee-0000-0000-0000-0000000000a1', entryDate: '2026-01-10',
          lines: [{ accountId: ACC, accountCode: '253', accountName: 'Tesis, makine ve cihazlar', debit: 120000, credit: 0 },
            { accountId: 'dddddddd-0000-0000-0000-000000000002', accountCode: '320', accountName: 'Satıcılar', debit: 0, credit: 120000 }] }
        : { assetId: A1, purchaseInvoiceCode: invoiceLinked ? 'AF-2026-0007' : null, journalEntryId: null, entryDate: null, lines: [] };
    }
    if (path === `/api/fixed-assets/${A1}/assignments`) return assignments();
    if (path === '/api/finance/general-ledger/accounts') {
      return [{ id: ACC, code: '320.01', name: 'Satıcılar', isActive: true, type: 'Liability' }];
    }
  } else if (method === 'POST') {
    if (path === `/api/fixed-assets/${A1}/depreciation-postings`) return { id: 'p1', assetId: A1, periodStart: '2026-11-01', amountBase: 2000 };
    if (path === `/api/fixed-assets/${A1}/tax-depreciation-postings`) return { id: 'p2', assetId: A1, periodStart: '2026-12-01', amountBase: 2000 };
    if (path === `/api/fixed-assets/${A1}/acquisition-posting`) return { assetId: A1, journalEntryId: 'eeeeeeee-0000-0000-0000-0000000000a1', lines: [] };
    if (path === `/api/fixed-assets/${A1}/disposals`) return { id: 'd1', assetId: A1 };
    if (path === `/api/fixed-assets/${A1}/assignments/${Z1}/return`) return { id: Z1, returnedDate: today(), rowVersion: 'rv-z1b' };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(assetId: string | null = A1) {
  setPageParams(KEY, assetId ? { assetId } : {});
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
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler' }).querySelector<HTMLElement>(`[data-command="${id}"]`);
const moreButton = () => screen.getByRole('toolbar', { name: 'İşlemler' }).querySelector<HTMLElement>('[data-command="more"]') ?? within(screen.getByRole('toolbar', { name: 'İşlemler' })).getByRole('button', { name: 'Diğer işlemler' });
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const writes = () => calls.filter((call) => call.method !== 'GET');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const text = () => document.body.textContent ?? '';
const tab = (name: RegExp) => screen.findByRole('tab', { name }, T);
const cell = (value: string) => screen.findByText(value, { selector: '.tenant-page-data-grid td' }, T);
const menuItem = async (name: RegExp) => {
  fireEvent.click(moreButton());
  return screen.findByRole('menuitem', { name }, T);
};
const enabled = (button: HTMLElement) => waitFor(() => expect(button.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled).toBe(false), T);
const confirmLast = async () => {
  const dialog = await screen.findByRole('alertdialog', {}, T);
  fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
  return dialog;
};
const openCard = async () => {
  setup();
  await waitFor(() => expect(text()).toContain('P-001 · Ayşe Yılmaz'), T);
};

beforeEach(() => {
  calls = []; navigations = []; vuk = false; posted = false; disposed = false; invoiceLinked = false; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  for (const page of [KEY, 'fixed-assets']) setPageParams(page, {});
});

describe('Kıymet kartı standart tanımı', { timeout: 30000 }, () => {
  it('is a version 2 record-template preview and uses only operations from the catalog fixture', () => {
    expect(standard.version).toBe(2);
    expect(standard.stage).toBe('preview');
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('without assetId: nothing is read and a note points to the list', async () => {
    setup(null);
    await waitFor(() => expect(text()).toContain('Kıymet seçilmedi ya da bulunamadı.'), T);
    await new Promise((done) => setTimeout(done, 100));
    expect(calls.filter((call) => call.url.startsWith('/api/fixed-assets'))).toEqual([]);
  });

  it('header facts and tab counts; without a VUK profile the tax schedule is not requested and the switch is hidden', async () => {
    await openCard();
    expect(text()).toContain('CNC tezgâhı');
    expect(text()).toContain('DV-CNC-01 · Makine');
    expect(text()).toContain('9 / 60 ay');
    expect(text()).toContain('102.000,00');
    expect(screen.getAllByText('Etkin').length).toBeGreaterThan(0);
    await waitFor(async () => expect((await tab(/^Amortisman/)).textContent).toContain('2'), T);
    await waitFor(async () => expect((await tab(/Zimmet geçmişi/)).textContent).toContain('2'), T);
    expect(gets(`/api/fixed-assets/${A1}/tax-depreciation-schedule`)).toEqual([]);
    expect(input('defterTuru')).toBeNull();
    // Genel sekmesi: salt okunur alanlar; kalıntı değer ve VUK alt sınırı anlık görüntüsü.
    expect(input('kimlikAd').value).toBe('CNC tezgâhı');
    expect(text()).toContain('Kalıntı değer');
    expect(text()).toContain('GİB VUK amortisman alt sınırı');
  });

  it('Amortismanı kaydet posts the schedule nextPeriodStart after confirmation', async () => {
    await openCard();
    await waitFor(() => expect(gets(`/api/fixed-assets/${A1}/depreciation-schedule`).length).toBeGreaterThan(0), T);
    fireEvent.click(await menuItem(/Amortismanı kaydet/));
    const dialog = await screen.findByRole('dialog', { name: /Amortismanı kaydet/ }, T);
    const save = within(dialog).getByRole('button', { name: 'Amortismanı kaydet' });
    await enabled(save);
    fireEvent.click(save);
    const confirm = await confirmLast();
    expect(confirm.textContent).toContain('Bu kayıt yevmiyeye yazılır ve arayüzden geri alınamaz.');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/fixed-assets/${A1}/depreciation-postings` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ periodStart: '2026-11-01' });
  });

  it('Elden çıkar posts the disposal with an idempotency key after confirmation', async () => {
    await openCard();
    fireEvent.click(await menuItem(/^Elden çıkar/));
    const dialog = await screen.findByRole('dialog', { name: /Elden çıkarma kaydı/ }, T);
    fireEvent.change(input('cikarmaAciklamasi'), { target: { value: 'Hurda' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Elden çıkarmayı kaydet' }));
    await confirmLast();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/fixed-assets/${A1}/disposals`);
    expect(JSON.parse(writes()[0].body!)).toEqual({ disposalDate: today(), proceedsBase: 0, reason: 'Hurda', idempotencyKey: expect.stringMatching(GUID) });
  });

  it('VUK profile: the tax schedule is read and Vergi kaydı oluştur posts its nextPeriodStart after confirmation', async () => {
    vuk = true;
    await openCard();
    await waitFor(() => expect(gets(`/api/fixed-assets/${A1}/tax-depreciation-schedule`).length).toBeGreaterThan(0), T);
    fireEvent.click(await tab(/^VUK vergi amortismanı/));
    await waitFor(() => expect(text()).toContain('Yalnızca tahmindir'), T);
    expect(input('vukSiradaki').value).toBe('2026-12-01');
    fireEvent.click(await menuItem(/Vergi kaydı oluştur/));
    await confirmLast();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/fixed-assets/${A1}/tax-depreciation-postings` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ periodStart: '2026-12-01' });
  });

  it('Edinim muhasebesi: posted lines; invoice-linked note; otherwise an offset account and a confirmed posting', async () => {
    posted = true;
    await openCard();
    fireEvent.click(await tab(/Edinim muhasebesi/));
    expect(await cell('Tesis, makine ve cihazlar')).toBeTruthy();
    fireEvent.click(moreButton());
    expect(screen.queryByRole('menuitem', { name: /Edinimi yevmiyeleştir/ })).toBeNull();
    cleanup();

    posted = false; invoiceLinked = true; calls = [];
    await openCard();
    fireEvent.click(await tab(/Edinim muhasebesi/));
    await waitFor(() => expect(text()).toContain('Muhasebe kaynağı alış faturası AF-2026-0007'), T);
    fireEvent.click(moreButton());
    expect(screen.queryByRole('menuitem', { name: /Edinimi yevmiyeleştir/ })).toBeNull();
    cleanup();

    invoiceLinked = false; calls = [];
    await openCard();
    fireEvent.click(await menuItem(/Edinimi yevmiyeleştir/));
    const dialog = await screen.findByRole('dialog', { name: /Edinimi yevmiyeleştir/ }, T);
    const post = within(dialog).getByRole('button', { name: 'Yevmiyeleştir' });
    const account = input('karsiHesap');
    fireEvent.focus(account);
    fireEvent.change(account, { target: { value: 'Sat' } });
    fireEvent.click(await screen.findByRole('option', { name: /Satıcılar/ }, T));
    fireEvent.click(post);
    const confirm = await confirmLast();
    expect(confirm.textContent).toContain('Bu kayıt yevmiyeye yazılır ve arayüzden geri alınamaz.');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/fixed-assets/${A1}/acquisition-posting` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ offsetAccountId: ACC });
  });

  it('Zimmet geçmişi: İade al is disabled for a returned row and returns the open one with today and its rowVersion (no confirm)', async () => {
    await openCard();
    fireEvent.click(await tab(/Zimmet geçmişi/));
    const disabledItem = async () => { const item = await menuItem(/İade al/); return item.getAttribute('aria-disabled') === 'true' || (item as HTMLButtonElement).disabled; };
    expect(await disabledItem()).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(await cell('P-002 · Mehmet Kaya'));
    await new Promise((done) => setTimeout(done, 50));
    expect(await disabledItem()).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(await cell('P-001 · Ayşe Yılmaz'));
    fireEvent.click(await menuItem(/İade al/));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/fixed-assets/${A1}/assignments/${Z1}/return` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ returnedDate: today(), rowVersion: 'rv-z1' });
    // Zimmetle eski ekrana gider.
    fireEvent.click(await menuItem(/Zimmetle/));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'fixed-assets', legacy: true });
  });

  it('a disposed asset shows the disposal summary and no İşlemler writes', async () => {
    disposed = true;
    await openCard();
    await waitFor(() => expect(input('cikarmaNedeni')?.value).toBe('Satış'), T);
    expect(input('cikarmaTahsilat').value).toBe('50000');
    expect(screen.getAllByText('Elden çıkarıldı').length).toBeGreaterThan(0);
    fireEvent.click(moreButton());
    await screen.findAllByRole('menuitem', {}, T);
    const names = screen.queryAllByRole('menuitem').map((item) => item.textContent ?? '');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(names.some((name) => name.includes('Amortismanı kaydet') || name.includes('Elden çıkar'))).toBe(false);
  });
});
