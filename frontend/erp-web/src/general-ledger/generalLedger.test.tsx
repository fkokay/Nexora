import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { localDateString } from '../erpApi';
import GeneralLedgerPage from '../GeneralLedgerPage';

const account = (id: string, code: string, name: string, isActive = true) => ({
  id, code, name, isActive, statementSection: 'Unclassified', hasMovements: false, accountType: 'Unclassified', normalBalance: 'Both',
  currencyCode: null, ifrsAccountCode: null, ifrsAccountName: null, ifrsStatementSection: 'Unclassified',
});
const accounts = [account('a100', '100', 'Kasa'), account('a320', '320', 'Satıcılar'), account('a770', '770', 'Genel yönetim giderleri')];
const entry = (id: string, code: string, sourceType: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, code, entryDate: '2026-11-16', description: `${code} açıklaması`, sourceType, sourceId: `src-${id}`, createdAt: '2026-11-16T10:00:00Z',
  accountingBasis: 'TDHP', totalDebit: amount, totalCredit: amount, ...extra,
});
const entries = [
  entry('e1', 'YF-2026-000416', 'Manual', 35000),
  entry('e2', 'YF-2026-000415', 'SalesInvoice', 86730),
  entry('e3', 'YF-2026-000410', 'Manual', 1850),
];
const detailOf = (summary: ReturnType<typeof entry>, isReversed = false) => ({
  ...summary,
  isReversed,
  lines: [
    { lineNumber: 1, accountId: 'a770', accountCode: '770', accountName: 'Genel yönetim giderleri', description: 'Kira', debit: summary.totalDebit, credit: 0 },
    { lineNumber: 2, accountId: 'a100', accountCode: '100', accountName: 'Kasa', description: 'Kira', debit: 0, credit: summary.totalCredit },
  ],
});
const emptySources = {
  baseCurrencyCode: 'TRY', salesInvoices: [], salesDeliveries: [], purchaseInvoices: [], purchaseReceipts: [], salesReturns: [], supplierReturns: [],
  customerCollections: [], supplierPayments: [], fxRevaluations: [], inventoryAdjustments: [],
};

const overrides = new Map<string, (url: string, init?: RequestInit) => unknown>();
function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  const override = overrides.get(path);
  if (override) return override(url, init);
  if (path === '/api/finance/general-ledger/accounts') return accounts;
  if (path === '/api/finance/general-ledger/mappings') return [];
  if (path === '/api/finance/general-ledger/sources') return emptySources;
  if (path === '/api/finance/general-ledger/entries') return { items: entries, page: 1, pageSize: 50, total: entries.length };
  if (path === '/api/finance/general-ledger/entries/e1') return detailOf(entries[0]);
  if (path === '/api/finance/general-ledger/entries/e2') return detailOf(entries[1]);
  if (path === '/api/finance/general-ledger/entries/e3') return detailOf(entries[2], true);
  if (path === '/api/finance/general-ledger/entries/manual') return { ...entry('n1', 'YF-2026-000500', 'Manual', 1250.5) };
  if (path.endsWith('/reverse')) return entry('r1', 'YF-2026-000501', 'ManualReversal', 35000, { sourceId: 'e1' });
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return [];
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  apiMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  overrides.clear();
  sessionStorage.clear();
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

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const posts = (path: string) =>
  apiMock.mock.calls.filter(([url, , init]) => url === path && (init as RequestInit | undefined)?.method === 'POST');
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));

function pickAccount(index: number, code: string) {
  const input = screen.getByRole('combobox', { name: `${index}. satır hesabı` });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: code } });
  fireEvent.blur(input);
}
const voucherForm = () => screen.getByRole('combobox', { name: '1. satır hesabı' }).closest('form')!;

describe('Yevmiye fişi (characterization)', () => {
  it('posts the same manual entry body: date, basis, description, filled lines only, fallback line description', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    fireEvent.change(screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi'), { target: { value: 'Kira tahakkuku' } });
    pickAccount(1, '770');
    fireEvent.change(screen.getByRole('textbox', { name: '1. satır borç' }), { target: { value: '1.250,50' } });
    pickAccount(2, '100');
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır alacak' }), { target: { value: '1250,50' } });
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır açıklaması' }), { target: { value: 'Kasa çıkışı' } });
    fireEvent.submit(voucherForm());
    await settle();
    const calls = posts('/api/finance/general-ledger/entries/manual');
    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0])).toEqual({
      entryDate: localDateString(),
      accountingBasis: 'TDHP',
      description: 'Kira tahakkuku',
      lines: [
        { accountId: 'a770', description: 'Kira tahakkuku', debit: 1250.5, credit: 0 },
        { accountId: 'a100', description: 'Kasa çıkışı', debit: 0, credit: 1250.5 },
      ],
    });
    expect(await screen.findByText('YF-2026-000500 manuel yevmiye fişi kaydedildi.')).toBeTruthy();
    // The first test of the file also pays the cold module load; on a busy machine that alone can pass 15 s.
  }, 40000);

  it('does not post an unbalanced voucher and says which side to fix', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    fireEvent.change(screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi'), { target: { value: 'Dengesiz' } });
    pickAccount(1, '770');
    fireEvent.change(screen.getByRole('textbox', { name: '1. satır borç' }), { target: { value: '100' } });
    pickAccount(2, '100');
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır alacak' }), { target: { value: '90' } });
    fireEvent.submit(voucherForm());
    await settle();
    expect(posts('/api/finance/general-ledger/entries/manual')).toHaveLength(0);
    expect(screen.getByText('Fiş dengeli değil: alacağa 10,00 ekleyin ya da borcu azaltın.')).toBeTruthy();
  });

  it('shows the server error (e.g. a closed fiscal period) and keeps the lines', async () => {
    overrides.set('/api/finance/general-ledger/entries/manual', () => {
      throw new Error('Kapalı mali döneme kayıt yapılamaz.');
    });
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    fireEvent.change(screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi'), { target: { value: 'Kapalı dönem' } });
    pickAccount(1, '770');
    fireEvent.change(screen.getByRole('textbox', { name: '1. satır borç' }), { target: { value: '5' } });
    pickAccount(2, '100');
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır alacak' }), { target: { value: '5' } });
    fireEvent.submit(voucherForm());
    await settle();
    expect(screen.getByText('Kapalı mali döneme kayıt yapılamaz.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: '1. satır borç' }) as HTMLInputElement).value).toBe('5');
  });

  it('Enter on the last line amount adds a line and does not save', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    expect(screen.getAllByRole('combobox', { name: /satır hesabı/ })).toHaveLength(3);
    fireEvent.keyDown(screen.getByRole('textbox', { name: '3. satır borç' }), { key: 'Enter' });
    await settle(50);
    expect(screen.getAllByRole('combobox', { name: /satır hesabı/ })).toHaveLength(4);
    expect(posts('/api/finance/general-ledger/entries/manual')).toHaveLength(0);
  });

  it('a firm user cannot enter a voucher', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantUser" view="voucher" />);
    await settle();
    expect(screen.getByText('Yevmiye fişi kaydetmek için firma yöneticisi yetkisi gerekir.')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: '1. satır hesabı' })).toBeNull();
  });
});

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const reason = (id: string) => command(id).getAttribute('title') ?? '';
function menuItem(id: string) {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(command('more'));
  return document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`)!;
}
const closeMenu = () => {
  if (document.querySelector('[role="menu"]')) fireEvent.click(command('more'));
};
const grid = () => document.querySelector<HTMLElement>('.list-v2-list table')!;
const row = (code: string) => within(grid()).getByText(code).closest('tr')!;
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.nx-summary-item')).map((card) =>
    Array.from(card.querySelectorAll('.nx-summary-text > *'))
      .map((part) => part.textContent?.replace(/\s+/g, ' ').trim())
      .join(' '),
  );
const entryCalls = () =>
  apiMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/finance/general-ledger/entries?'));

describe('Yevmiye Defterleri list', () => {
  it('shows the list type: page-scoped cards, Borç / Alacak columns, source tags, footer totals; no implicit current row', async () => {
    const navigate = vi.fn();
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="journal-ledger" onNavigate={navigate} />);
    await settle();
    expect(screen.getByRole('heading', { name: /Yevmiye Defterleri/ })).toBeTruthy();
    expect(cards()).toEqual([
      'Fiş sayısı 3 tümü',
      'Borç = alacak toplamı 123.580,00 TRY bu sayfa · 3 fiş',
      'Aktarılmayı bekleyen kaynak 0 tümü · İşlemler › Aktarılabilir kaynaklar',
      'Ters kayıt 0 bu sayfa',
    ]);
    const debit = within(row('YF-2026-000415')).getAllByText('86.730,00')[0].closest('td')!;
    expect(debit.className).toContain('nx-num');
    expect(within(row('YF-2026-000416')).getByText('Manuel fiş').className).toContain('is-info');
    expect(within(row('YF-2026-000415')).getByText('Satış faturası').className).toContain('is-off');
    expect(screen.queryByRole('button', { name: 'Yeni fiş' })).toBeNull();
    expect(document.querySelector('.nx-list-footer')!.textContent).toContain('Bu sayfa toplamı Borç 123.580,00 · Alacak 123.580,00');
    expect(enabled('new')).toBe(true);
    expect(enabled('open')).toBe(false);
    expect(reason('open')).toBe('Önce bir kayıt seçin');
    expect(menuItem('journal-reverse').getAttribute('title')).toBe('Önce bir kayıt seçin');
    fireEvent.click(menuItem('journal-transfer-sources'));
    expect(navigate).toHaveBeenLastCalledWith('finance-transfer-sources');
    fireEvent.click(command('new'));
    expect(navigate).toHaveBeenLastCalledWith('finance-journal-vouchers');
    expect(document.querySelector('.doc-surface')).toBeNull();
  });

  it('a firm user sees no pending-sources card and cannot reverse', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantUser" view="journal-ledger" />);
    await settle();
    expect(cards().some((card) => card.startsWith('Aktarılmayı bekleyen'))).toBe(false);
    fireEvent.click(row('YF-2026-000416').cells[2]);
    await settle();
    expect(menuItem('journal-reverse').getAttribute('title')).toBe('Ters kaydı yalnız firma yöneticisi oluşturabilir');
  });

  it("Ters kayıt oluştur (İşlemler) keeps today's condition and posts the same reversal", async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="journal-ledger" />);
    await settle();
    fireEvent.click(row('YF-2026-000415').cells[2]);
    await settle();
    expect(menuItem('journal-reverse').getAttribute('title')).toBe('Kaynaklı fiş kaynak belgeden iptal edilir');
    closeMenu();
    fireEvent.click(row('YF-2026-000410').cells[2]);
    await settle();
    expect(menuItem('journal-reverse').getAttribute('title')).toBe('Bu fişin ters kaydı var');
    closeMenu();
    fireEvent.click(row('YF-2026-000416').cells[2]);
    await settle();
    const item = menuItem('journal-reverse');
    expect(item.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(item);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Yanlış hesap' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ters kaydı oluştur' }));
    await settle();
    const calls = posts('/api/finance/general-ledger/entries/e1/reverse');
    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0])).toEqual({ entryDate: localDateString(), reason: 'Yanlış hesap' });
    expect(screen.getByText('YF-2026-000501 ters kayıt oluşturuldu.')).toBeTruthy();
  });

  it('marks an entry whose reversal is on the same page and counts reversals of the page', async () => {
    overrides.set('/api/finance/general-ledger/entries', () => ({
      items: [entry('r9', 'YF-2026-000417', 'ManualReversal', 1850, { sourceId: 'e3' }), ...entries],
      page: 1,
      pageSize: 50,
      total: 4,
    }));
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="journal-ledger" />);
    await settle();
    expect(within(row('YF-2026-000410')).getByText('Ters kaydı var')).toBeTruthy();
    expect(within(row('YF-2026-000417')).getByText('Ters kayıt').className).toContain('is-warn');
    expect(cards()[3]).toBe('Ters kayıt 1 bu sayfa');
  });

  it('the Standart filter filters on the server from page 1; source chips filter the page only', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="journal-ledger" />);
    await settle();
    fireEvent.change(document.querySelector<HTMLSelectElement>('.list-v2-toolbar select[aria-label="Standart"]')!, { target: { value: 'IFRS' } });
    await settle();
    expect(entryCalls().at(-1)).toContain('accountingBasis=IFRS');
    expect(entryCalls().at(-1)).toContain('page=1');
    const before = entryCalls().length;
    fireEvent.click(screen.getByRole('button', { name: /^Manuel/ }));
    await settle();
    expect(entryCalls().length).toBe(before);
    expect(within(grid()).queryByText('YF-2026-000415')).toBeNull();
    expect(document.querySelector('.nx-list-footer')!.textContent).toContain('Gösterilen fişler Borç 36.850,00');
  });

  it('a double click opens the read-only entry document; Kaydet / Sil / Filtre explain why they are off', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="journal-ledger" />);
    await settle();
    fireEvent.doubleClick(row('YF-2026-000416').cells[2]);
    await settle();
    const surface = document.querySelector<HTMLElement>('.doc-surface')!;
    expect(surface).toBeTruthy();
    expect(within(surface).getAllByText('YF-2026-000416').length).toBeGreaterThan(0);
    const lines = within(surface).getByRole('table', { name: 'Yevmiye satırları' });
    expect(within(lines).getAllByRole('row')).toHaveLength(3);
    expect(within(surface).getByText('Dengeli')).toBeTruthy();
    expect(surface.querySelector('.doc-flow')).toBeNull();
    expect(reason('save')).toBe('Kaydedilmiş fiş değiştirilemez');
    expect(reason('delete')).toBe('Kaydedilmiş fiş silinemez — İşlemler › Ters kayıt oluştur');
    expect(reason('filter')).toBe('Belge açıkken kullanılamaz');
    expect(menuItem('journal-reverse').getAttribute('aria-disabled')).toBeNull();
  });

  it('the number link opens the entry', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="journal-ledger" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'YF-2026-000415 fişini aç' }));
    await settle();
    expect(document.querySelector('.doc-surface')).toBeTruthy();
  });
});

describe('Yevmiye fişi on the document form', () => {
  it('draws the document header and lines card; the bar Kaydet saves; Vazgeç and Son fişler go to the ledger', async () => {
    const navigate = vi.fn();
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" onNavigate={navigate} />);
    await settle();
    const form = document.querySelector<HTMLElement>('.record-form.doc-form')!;
    expect(form).toBeTruthy();
    expect(within(form).getByRole('heading', { level: 1 }).textContent).toBe('Yeni yevmiye fişi');
    expect(form.querySelector('.doc-flow')).toBeNull();
    expect(within(form).getByRole('table').className).toContain('dd-lines');
    expect(within(form).getByText('Borç = Alacak')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Fişi kaydet/ })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi'), { target: { value: 'Kira' } });
    pickAccount(1, '770');
    fireEvent.change(screen.getByRole('textbox', { name: '1. satır borç' }), { target: { value: '10' } });
    pickAccount(2, '100');
    fireEvent.change(screen.getByRole('textbox', { name: '2. satır alacak' }), { target: { value: '10' } });
    expect(within(form).getByText('Dengeli')).toBeTruthy();
    fireEvent.click(command('save'));
    await settle();
    expect(posts('/api/finance/general-ledger/entries/manual')).toHaveLength(1);
    fireEvent.click(menuItem('journal-recent'));
    expect(navigate).toHaveBeenLastCalledWith('finance-journal-ledger');
    fireEvent.click(within(form).getByRole('button', { name: 'Vazgeç' }));
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('F2 (Yeni) asks before clearing an entered voucher', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    fireEvent.change(screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi'), { target: { value: 'Taslak' } });
    fireEvent.click(command('new'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Devam' }));
    await settle(50);
    expect((screen.getByPlaceholderText('Örn. Kasa sayım farkı düzeltmesi') as HTMLInputElement).value).toBe('');
  });

  it('without an active account Kaydet says why', async () => {
    overrides.set('/api/finance/general-ledger/accounts', () => []);
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="voucher" />);
    await settle();
    expect(reason('save')).toBe('Aktif hesap yok; fiş kaydedilemez. Önce hesap planına hesap ekleyin.');
  });
});
