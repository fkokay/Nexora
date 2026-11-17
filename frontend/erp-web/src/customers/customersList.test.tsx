import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import { CustomersPage } from '../CustomersPage';
import { customerTypeLabel } from './customerLabels';

const customer = (id: string, extra: Record<string, unknown> = {}) => ({
  id, code: `C-${id}`, name: `Cari ${id}`, type: 'Customer', taxNumber: '1234567890', isActive: true, createdAt: '2026-11-01',
  rowVersion: 'AA==', groupId: null, groupName: null, currencyCode: 'TRY', riskLimit: null, paymentTermDays: 30,
  isEInvoiceRegistered: false, ...extra,
});
const customers = [
  customer('c1', { isEInvoiceRegistered: true, riskLimit: 400000, groupName: 'Toptan' }),
  customer('c2', { type: 'Both' }),
  customer('c3', { type: 'Supplier', isActive: false }),
];
const listFields = [
  ['code', 'Cari kodu'], ['name', 'Ünvan'], ['groupName', 'Cari grubu'], ['type', 'Tür'], ['currencyCode', 'Döviz'],
  ['paymentTermDays', 'Vade'], ['taxNumber', 'Vergi no'], ['status', 'Durum'], ['actions', 'İşlemler'],
].map(([key, label], position) => ({ key, label, visible: true, position }));
const detailFields = [
  { key: 'groupName', label: 'Cari grubu', visible: true, position: 0, section: 'Genel Bilgiler' },
  { key: 'riskLimit', label: 'Risk limiti', visible: true, position: 1, section: 'Finans' },
];

function respond(url: string): unknown {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  if (path === '/api/customers/') {
    if (params.get('pageSize') === '1') {
      const type = params.get('type'), status = params.get('status');
      const count = customers.filter(
        (item) => (!type || item.type === type) && (!status || (status === 'Active') === item.isActive),
      ).length;
      return { items: [], totalCount: count };
    }
    // The search is honoured (code or name), like the API's `q`.
    const q = (params.get('q') ?? '').toLocaleLowerCase('tr-TR');
    const rows = customers.filter((item) => !q || `${item.code} ${item.name}`.toLocaleLowerCase('tr-TR').includes(q));
    return { items: rows, totalCount: rows.length };
  }
  if (path === '/api/screen-views/customers/active') return { fields: listFields, pageSettings: null };
  if (path === '/api/screen-views/customer-details/active') return { fields: detailFields };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/customers/c1/balance') return { currencyCode: 'TRY', balance: 186242, balanceSide: 'Debit', riskLimit: 400000 };
  if (path.endsWith('/balance')) return { currencyCode: 'TRY', balance: 0, balanceSide: 'Balanced', riskLimit: null };
  if (path.endsWith('/addresses')) return [];
  if (path === '/api/customers/c1') return customers[0];
  if (path === '/api/location-definitions/') return { provinces: [], districts: [] };
  return [];
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  apiMock.mockImplementation(async (url: string) => respond(url));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  apiMock.mockImplementation(async (url: string) => respond(url));
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
function renderList(role = 'TenantAdmin', onNavigate = vi.fn()) {
  renderScreen(
    <CustomersPage token="t" role={role} initialSearch="" onNavigate={onNavigate} onOpenSalesInvoice={vi.fn()} onOpenPurchaseInvoices={vi.fn()} />,
  );
  return onNavigate;
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const reason = (id: string) => command(id).getAttribute('title') ?? command(id).getAttribute('aria-label') ?? '';
function menuItems() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}
const grid = () => document.querySelector<HTMLElement>('.list-v2-list table')!;
const row = (code: string) => within(grid()).getAllByText(code)[0].closest('tr')!;
const panel = () => document.querySelector<HTMLElement>('aside.sales-ld');
const fetched = (path: string) => apiMock.mock.calls.filter(([url]) => url === path).length;
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.nx-summary-item')).map((card) =>
    Array.from(card.querySelectorAll('.nx-summary-text > *'))
      .map((part) => part.textContent?.replace(/\s+/g, ' ').trim())
      .join(' '),
  );

async function settle(ms = 400) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('Cari türü adı', () => {
  it('"Both" has one name everywhere: Müşteri & Tedarikçi', () => {
    expect(customerTypeLabel('Both')).toBe('Müşteri & Tedarikçi');
  });

  it('the filter chip and the list tag say Müşteri & Tedarikçi (not Diğer)', async () => {
    renderList();
    await settle();
    const chips = screen.getByRole('group', { name: 'Cari türü' });
    expect(within(chips).getByRole('button', { name: /Müşteri & Tedarikçi/ })).toBeTruthy();
    expect(within(chips).queryByRole('button', { name: /Diğer/ })).toBeNull();
    expect(within(row('C-c2')).getByText('Müşteri & Tedarikçi').className).toContain('nx-status-tag');
  });
});

describe('Cari Hesaplar list', () => {
  it('shows the list type: summary cards, code column, tags, numbers, footer', async () => {
    renderList();
    await settle();
    expect(cards()).toEqual([
      'Cari kartı 3 tüm kayıtlar · 2 aktif',
      'Pasif 1 tüm kayıtlar',
      'e-Fatura mükellefi 1 / 3 bu sayfa',
      'Risk limiti tanımlı 1 / 3 bu sayfa',
    ]);
    expect(screen.getByRole('checkbox', { name: 'Tümünü seç' })).toBeTruthy();
    expect(within(row('C-c1')).getByText('C-c1').closest('td')!.className).toContain('nx-code');
    expect(within(row('C-c1')).getByText('e-Fatura').className).toContain('is-ok');
    expect(within(row('C-c3')).getByText('Pasif').className).toContain('is-off');
    expect(within(row('C-c1')).getByText('Aktif').className).toContain('is-ok');
    expect(within(row('C-c1')).getByText('gün').closest('td')!.className).toContain('nx-num');
    const footer = document.querySelector<HTMLElement>('.nx-list-footer')!;
    expect(footer.textContent).toContain('Enter kartı aç');
    expect(footer.textContent).toContain('3 / 3');
    // The former header buttons are on the bar.
    expect(screen.queryByRole('button', { name: /Yeni cari kartı/ })).toBeNull();
    expect(screen.queryByText('Dışa aktar')).toBeNull();
  });

  it('bar: Yeni is primary, Sil explains that cards are deactivated, Aç needs a chosen row', async () => {
    const onNavigate = renderList();
    await settle();
    expect(command('new').getAttribute('data-primary')).toBe('true');
    expect(enabled('delete')).toBe(false);
    expect(reason('delete')).toContain('Cari silinmez, pasife alınır');
    expect(enabled('open')).toBe(false);
    expect(reason('open')).toContain('Önce bir kayıt seçin');
    // Nothing is current before the user chooses a row.
    expect(document.querySelector('tr[aria-current="true"]')).toBeNull();
    fireEvent.click(command('new'));
    expect(onNavigate).toHaveBeenCalledWith('customer-create');
  });

  it('a click selects the row (no card opens); a double click and Aç open the card', async () => {
    const onNavigate = renderList();
    await settle();
    fireEvent.click(row('C-c2'));
    await waitFor(() => expect(row('C-c2').getAttribute('aria-current')).toBe('true'));
    expect(onNavigate).not.toHaveBeenCalledWith('customer-edit');
    expect(enabled('open')).toBe(true);
    fireEvent.click(command('open'));
    expect(onNavigate).toHaveBeenCalledWith('customer-edit');
    expect(sessionStorage.getItem('nexora.customer-edit-id')).toBe('c2');
    onNavigate.mockClear();
    fireEvent.doubleClick(within(row('C-c1')).getByText('Cari c1'));
    expect(onNavigate).toHaveBeenCalledWith('customer-edit');
    expect(sessionStorage.getItem('nexora.customer-edit-id')).toBe('c1');
  });

  it('İşlemler holds the former header and panel actions; import only for TenantAdmin', async () => {
    renderList();
    await settle();
    expect(menuItems()).toEqual(['Gruplar', 'CSV / Excel içe aktar', 'CSV olarak dışa aktar']);
    fireEvent.click(row('C-c1'));
    await waitFor(() => expect(row('C-c1').getAttribute('aria-current')).toBe('true'));
    expect(menuItems()).toEqual([
      'Yeni sipariş', 'Yeni teklif', 'Yeni irsaliye', 'Yeni fatura', 'Cari mutabakatı', 'Adresler', 'Özel alanlar',
      'Satış faturaları', 'Pasife al', 'Gruplar', 'CSV / Excel içe aktar', 'CSV olarak dışa aktar',
    ]);
    cleanup();
    renderList('TenantUser');
    await settle();
    expect(menuItems()).not.toContain('CSV / Excel içe aktar');
  });

  it('sales actions are disabled with a reason on a supplier card', async () => {
    renderList();
    await settle();
    fireEvent.click(row('C-c3'));
    await waitFor(() => expect(row('C-c3').getAttribute('aria-current')).toBe('true'));
    fireEvent.click(command('more'));
    const order = screen.getByRole('menuitem', { name: /Yeni sipariş/ });
    expect(order.getAttribute('aria-disabled')).toBe('true');
    expect(order.getAttribute('title')).toContain('Satış işlemleri yalnız müşteri ve bayi kartlarında');
    expect(screen.getByRole('menuitem', { name: /Etkinleştir/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Alış faturaları/ })).toBeTruthy();
  });

  it('arriving from the global search makes the first match current, not the first row of the unfiltered load', async () => {
    // The searched list answers after the list's first, unfiltered load has rendered.
    apiMock.mockImplementation(async (url: string) => {
      if (/^\/api\/customers\/\?q=Cari/.test(url) && url.includes('pageSize=25')) await new Promise((resolve) => setTimeout(resolve, 80));
      return respond(url);
    });
    renderScreen(
      <CustomersPage token="t" role="TenantAdmin" initialSearch="Cari c2" onNavigate={vi.fn()} onOpenSalesInvoice={vi.fn()} onOpenPurchaseInvoices={vi.fn()} />,
    );
    await settle();
    await waitFor(() => expect(row('C-c2').getAttribute('aria-current')).toBe('true'));
    expect(document.querySelectorAll('tr[aria-current="true"]')).toHaveLength(1);
  });

  it('Excel (Ctrl+E) is still the export of every page of the search, not the grid page', async () => {
    renderList();
    await settle();
    apiMock.mockClear();
    await act(async () => {
      fireEvent.click(command('export'));
    });
    await waitFor(() =>
      expect(apiMock.mock.calls.some(([url]) => String(url).startsWith('/api/customers/?') && String(url).includes('pageSize=100'))).toBe(true),
    );
  });

  it('the detail panel (Ctrl+.) shows the chosen account and its /balance; nothing loads before a choice', async () => {
    renderList();
    await settle();
    fireEvent.keyDown(window, { key: '.', ctrlKey: true });
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(panel()!.textContent).toContain('Özetini görmek için listeden bir cari seçin.');
    expect(fetched('/api/customers/c1/balance')).toBe(0);
    fireEvent.click(row('C-c1'));
    await waitFor(() => expect(panel()!.textContent).toContain('186.242,00 TRY'));
    const p = within(panel()!);
    expect(p.getByText('B').getAttribute('title')).toBe('Borç bakiyesi');
    expect(panel()!.textContent).toContain('400.000,00 TRY');
    expect(panel()!.textContent).toContain('%46,6');
    expect(p.getByText('e-Fatura').className).toContain('is-ok');
    expect(p.getByRole('tab', { name: 'Genel Bilgiler' })).toBeTruthy();
    expect(p.getByRole('tab', { name: 'İletişim' })).toBeTruthy();
    expect(fetched('/api/customers/c1/balance')).toBe(1);
  });
});

describe('English labels of the new Cari texts', () => {
  it('translates the bar reasons, menu items, cards and panel texts', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    for (const text of [
      'Cari silinmez, pasife alınır', 'Satış işlemleri yalnız müşteri ve bayi kartlarında', 'Cari mutabakatı', 'Gruplar',
      'CSV olarak dışa aktar', 'Cari kartı', 'e-Fatura mükellefi', 'Risk limiti tanımlı', 'tüm kayıtlar', 'aramayla eşleşen',
      'aktif', 'e-Fatura', 'Limit kullanımı', 'Özetini görmek için listeden bir cari seçin.', 'Cari özeti', 'Alış faturaları',
      '↑↓ gez · Boşluk işaretle · Enter kartı aç · Çift tık aç · Ctrl+. detay paneli', 'Cari kayıtları',
      '— yeni sipariş, teklif, irsaliye, fatura ve pasife alma', 'Müşteri & Tedarikçi',
    ])
      expect(localizedUiText(text), text).not.toBe(text);
  });
});

describe('Cari kartı (kayıt formu v3)', () => {
  it('an opened card shows the name as the title and code, status, type and summary under it', async () => {
    sessionStorage.setItem('nexora.customer-edit-id', 'c1');
    renderScreen(
      <CustomersPage token="t" role="TenantAdmin" initialSearch="" initialEdit onNavigate={vi.fn()} onOpenSalesInvoice={vi.fn()} onOpenPurchaseInvoices={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Cari c1' })).toBeTruthy());
    const head = screen.getByRole('heading', { name: 'Cari c1' }).closest<HTMLElement>('.record-form')!;
    expect(within(head).getByText('C-c1').className).toContain('rf-code');
    expect(within(head).getAllByText('Aktif')[0].className).toContain('nx-status-tag');
    expect(head.textContent).toContain('Toptan · Vade 30 gün · TRY · Vergi no 1234567890');
  });
});
