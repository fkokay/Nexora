import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import FixedAssetsPage from '../FixedAssetsPage';

// Characterization tests of the asset workflows (dispose, assign / return, depreciation, acquisition and tax postings):
// the request paths and bodies stay as they were when the forms leave the side panel.

const asset = (id: string, code: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, assetCode: code, name, category: 'Makine', acquisitionDate: '2025-01-01', inServiceDate: '2025-01-01', acquisitionCostBase: 120000,
  residualValueBase: 0, usefulLifeMonths: 60, accumulatedDepreciationBase: 20000, status: 'Active', supplierAccountId: null, sourceReference: null,
  purchaseInvoiceId: null, rowVersion: 'AA==', vukTaxYear: null, vukDepreciationLowerLimitTry: null, vukCommuniqueNumber: null, vukSourceUrl: null,
  vukUsefulLifeCode: null, vukUsefulLifeDescription: null, vukUsefulLifeTableYear: null, vukUsefulLifeCommuniqueNumber: null,
  vukUsefulLifeMonths: null, vukNormalDepreciationRatePercent: null, vukTaxDepreciationStartDate: null, ...extra,
});
const assets = [
  asset('a1', 'DV-0001', 'Dolum makinesi'),
  asset('a3', 'DV-0003', 'Kazan', { vukUsefulLifeCode: '01.1', vukUsefulLifeDescription: 'Kazanlar', vukUsefulLifeMonths: 120 }),
];

function respond(url: string): { status: number; body: unknown } {
  const path = url.split('?')[0];
  const ok = (body: unknown) => ({ status: 200, body });
  if (path.startsWith('/api/screen-views/')) return { status: 404, body: {} };
  if (path === '/api/fixed-assets') return ok({ items: assets, page: 1, pageSize: 200, totalCount: assets.length });
  if (path === '/api/hr/employees') return ok([{ id: 'e1', personnelCode: 'P-001', fullName: 'Ayşe Demir', status: 'Active' }]);
  if (path === '/api/finance/general-ledger/accounts')
    return ok([{ id: 'acc1', code: '320.01', name: 'Satıcılar', isActive: true, statementSection: 'Liabilities' }]);
  if (/\/depreciation-schedule$/.test(path))
    return ok({ assetId: 'a1', method: 'StraightLine', currencyBasis: 'Base', acquisitionCostBase: 120000, residualValueBase: 0, accumulatedDepreciationBase: 20000,
      rows: [{ periodStart: '2026-11-01', amountBase: 2000, isPosted: false, journalEntryId: null }] });
  if (path === '/api/fixed-assets/a3/tax-depreciation-schedule')
    return ok({ assetId: 'a3', schedule: 'VUK', isStatutoryFiling: false, confirmationRequired: true, source: 'x', vukUsefulLifeCode: '01.1',
      vukUsefulLifeDescription: 'Kazanlar', vukUsefulLifeTableYear: 2024, vukUsefulLifeCommuniqueNumber: 339, vukUsefulLifeMonths: 120,
      annualRatePercent: 10, taxDepreciationStartDate: '2025-01-01',
      rows: [{ periodStart: '2025-01-01', amountBase: 1000, isPosted: true }, { periodStart: '2025-02-01', amountBase: 1000, isPosted: false }] });
  if (/\/(disposal|tax-depreciation-schedule)$/.test(path)) return { status: 404, body: {} };
  if (/\/acquisition-posting$/.test(path)) return ok({ assetId: 'a1', purchaseInvoiceCode: null, journalEntryId: null, entryDate: null, lines: [] });
  if (/\/assignments$/.test(path))
    return ok([{ id: 'as1', employeeId: 'e1', employee: 'Ayşe Demir', assignedDate: '2026-01-05', returnedDate: null, location: 'Üretim', notes: null, rowVersion: 'Rk==' }]);
  return ok([]);
}

const writes: Array<{ path: string; body: unknown }> = [];
let failNextWrite = false;

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      writes.push({ path: url.split('?')[0], body: init?.body ? JSON.parse(String(init.body)) : null });
      if (failNextWrite) {
        failNextWrite = false;
        return new Response(JSON.stringify({ title: 'Sunucu hatası' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      const body = /\/disposals$/.test(url)
        ? { id: 'd1', assetId: 'a1', disposalDate: '2026-11-10', reason: 'Satış', proceedsBase: 5000, bookValueBase: 100000, gainLossBase: -95000, journalEntryId: null }
        : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const { status, body } = respond(url);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  writes.length = 0;
  failNextWrite = false;
  localStorage.clear();
});

function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
const command = (id: string) =>
  screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
async function selectAsset(name: string) {
  renderScreen(<FixedAssetsPage token="t" locale="tr" />);
  const cell = await screen.findByText(name);
  fireEvent.click(within(cell.closest('tr')!).getByText('Etkin'));
  await screen.findByText('Aylık amortisman');
  await waitFor(() => expect(enabled('more')).toBe(true));
}
async function runMore(label: string) {
  fireEvent.click(command('more'));
  await act(async () => {
    fireEvent.click(await screen.findByRole('menuitem', { name: label }));
  });
}
/** The form of an İşlemler workflow by its heading. */
async function formOf(title: string) {
  const heading = await screen.findByRole('heading', { name: title });
  return heading.closest('.hrp-record-form-host')!.querySelector('form')!;
}
const set = (form: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(form).getByLabelText(label, { exact: false, selector: 'input,select' }), { target: { value } });
async function openCard() {
  // Aç opens the asset card (record v3).
  if (enabled('open')) await act(async () => fireEvent.click(command('open')));
}
/** A section of the asset card (section navigator) or a tab inside it. */
async function showSection(name: RegExp) {
  fireEvent.click(await screen.findByRole('tab', { name }));
}

describe('Duran Varlık workflows (characterization)', () => {
  it('Elden çıkar: POST body; a retry after a failure reuses the idempotency key', async () => {
    await selectAsset('Dolum makinesi');
    await runMore('Elden çıkar');
    const form = await formOf('Elden çıkarma kaydı');
    // The workflow opens as a dialog from İşlemler (no longer a side-panel mode).
    expect(screen.getByRole('dialog', { name: 'Elden çıkarma kaydı' }).contains(form)).toBe(true);
    set(form, 'Elden çıkarma tarihi', '2026-11-10');
    set(form, 'Tahsilat', '5000');
    set(form, 'Açıklama', 'Satış');
    failNextWrite = true;
    await act(async () => fireEvent.submit(form));
    await waitFor(() => expect(writes).toHaveLength(1));
    await screen.findByText('Sunucu hatası');
    await act(async () => fireEvent.submit(await formOf('Elden çıkarma kaydı')));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0].path).toBe('/api/fixed-assets/a1/disposals');
    const [first, second] = writes.map((write) => write.body as Record<string, unknown>);
    expect(first).toEqual({ disposalDate: '2026-11-10', reason: 'Satış', proceedsBase: 5000, idempotencyKey: first.idempotencyKey });
    expect(typeof first.idempotencyKey).toBe('string');
    expect(second).toEqual(first);
  });

  it('Zimmetle: POST body', async () => {
    await selectAsset('Dolum makinesi');
    await runMore('Zimmetle');
    const form = await formOf('Zimmet kaydı');
    fireEvent.click(form.querySelector<HTMLElement>('.searchable-record-trigger')!);
    fireEvent.click((await screen.findAllByRole('option', { name: /Ayşe Demir/ }))[0]);
    set(form, 'Teslim tarihi', '2026-11-12');
    set(form, 'Konum', 'Hat 2');
    await act(async () => fireEvent.submit(form));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ path: '/api/fixed-assets/a1/assignments', body: { employeeId: 'e1', assignedDate: '2026-11-12', location: 'Hat 2', notes: null } });
  });

  it('Amortismanı kaydet: POST body', async () => {
    await selectAsset('Dolum makinesi');
    await runMore('Amortismanı kaydet');
    const form = await formOf('Amortismanı kaydet');
    set(form, 'Kaydedilecek dönem', '2026-11');
    await act(async () => fireEvent.submit(form));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ path: '/api/fixed-assets/a1/depreciation-postings', body: { periodStart: '2026-11-01' } });
  });

  it('İade al and Edinimi yevmiyeleştir: POST bodies', async () => {
    await selectAsset('Dolum makinesi');
    await openCard();
    await showSection(/Zimmet geçmişi/);
    fireEvent.click(await screen.findByRole('button', { name: 'İade al' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].path).toBe('/api/fixed-assets/a1/assignments/as1/return');
    expect(writes[0].body).toEqual({ returnedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), rowVersion: 'Rk==' });
    await showSection(/Edinim muhasebesi/);
    const account = await screen.findByLabelText('Edinim karşı hesabı');
    fireEvent.change(account, { target: { value: 'acc1' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Edinimi yevmiyeleştir' })));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toEqual({ path: '/api/fixed-assets/a1/acquisition-posting', body: { offsetAccountId: 'acc1' } });
  });

  it('Vergi kaydı oluştur: POST body for the first unposted period', async () => {
    await selectAsset('Kazan');
    await openCard();
    await showSection(/Amortisman tablosu/);
    await showSection(/^VUK$/);
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Vergi kaydı oluştur' })));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ path: '/api/fixed-assets/a3/tax-depreciation-postings', body: { periodStart: '2025-02-01' } });
  });

  it('Aç opens the read-only asset card with its sections; Vazgeç returns to the register', async () => {
    await selectAsset('Dolum makinesi');
    await openCard();
    expect(await screen.findByRole('heading', { name: 'Dolum makinesi' })).toBeTruthy();
    for (const name of [/Genel/, /Amortisman tablosu/, /Edinim muhasebesi/, /Zimmet geçmişi/, /Elden çıkarma/])
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    expect(enabled('save')).toBe(false);
    expect((screen.getByLabelText('Kıymet kodu') as HTMLInputElement).readOnly).toBe(true);
    await showSection(/Amortisman tablosu/);
    expect(await screen.findByText('Birikmiş amortisman')).toBeTruthy();
    expect(screen.getByText('Net defter değeri')).toBeTruthy();
    // The workflows stay in İşlemler on the card.
    await runMore('Zimmetle');
    expect(await screen.findByRole('dialog', { name: 'Zimmet kaydı' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Zimmet kaydı' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Zimmet kaydı' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Vazgeç/ }));
    expect(await screen.findByText('Kazan')).toBeTruthy();
  });
});
