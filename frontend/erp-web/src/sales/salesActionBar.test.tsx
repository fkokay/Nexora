import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { PageCommandsSlot } from '../commands/PageCommandsSlot';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import SalesQuotesPage from '../SalesQuotesPage';
import SalesOrdersPage from '../SalesOrdersPage';
import SalesInvoicesPage from '../SalesInvoicesPage';
import SalesDeliveriesScreenPage from '../SalesDeliveriesScreenPage';
import SalesCustomerRequestsPage from '../sales-customer-requests/SalesCustomerRequestsPage';
import SalesReturnsPage from '../SalesReturnsPage';
import SalesDistributionPage from '../SalesDistributionPage';
import SalesPromotionsPage from '../SalesPromotionsPage';

const warehouses = [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const quote = (id: string, status: string) => ({
  id, code: `T-${id}`, customerId: 'c1', customerName: 'Acme', quoteDate: '2026-11-01', validUntil: '2026-12-01',
  currencyCode: 'TRY', status, grandTotal: 100, lineCount: 1, createdAt: '2026-11-01', hasSalesOrder: false, revisionNumber: 1,
});
const invoice = (id: string, status: string) => ({
  id, code: `F-${id}`, deliveryId: null, deliveryCode: null, orderId: null, orderCode: null, customerId: 'c1',
  customerName: 'Acme', invoiceDate: '2026-11-01', currencyCode: 'TRY', status, grandTotal: 100, lineCount: 1, createdAt: '2026-11-01',
});
const invoiceDetail = (id: string, status: string) => ({
  ...invoice(id, status), subtotal: 100, discountTotal: 0, taxTotal: 0, ledgerEntryId: null, lines: [], paidAmount: 0,
  returnedAmount: 0, outstandingAmount: 100, collections: [], returns: [], customFields: [], eDocumentScenario: null,
  eDocumentTypeCode: null, eDocumentRecipientAlias: null, eCommercePurchaseUrl: null, eCommercePaymentTaxId: null,
  eCommercePaymentTitle: null, eCommercePaymentAlias: null, eCommercePaymentAgentName: null, eCommercePaymentType: null,
  eCommercePaymentDate: null, eCommercePaymentDueDate: null, eCommercePaymentMeans: null, eCommercePaymentInstructionNote: null,
  eCommerceIntermediaryCountry: null, eCommerceIntermediaryCountryCode: null, eCommerceIntermediaryCity: null,
  eCommerceIntermediaryDistrict: null, deliveryCarrierTaxId: null, deliveryCarrierName: null, deliveryCarrierSurname: null,
  deliverySentAt: null,
});
const delivery = (id: string, status: string) => ({
  id, code: `I-${id}`, orderId: null, orderCode: null, warehouseId: 'w1', warehouseName: 'Ana depo', deliveryDate: '2026-11-01',
  status, lineCount: 1, createdAt: '2026-11-01', hasSalesInvoice: false, invoiceStatus: null, invoiceId: null,
});

const order = {
  id: 'o1', code: 'S-o1', quoteId: null, quoteCode: '', customerId: 'c1', customerName: 'Acme', orderDate: '2026-11-01',
  requestedDeliveryDate: null, currencyCode: 'TRY', status: 'Open', grandTotal: 100, lineCount: 1, createdAt: '2026-11-01',
};
const salesReturn = {
  id: 'r1', code: 'IADE-r1', salesInvoiceId: 'i1', invoiceCode: 'F-i1', customerName: 'Acme', warehouseName: 'Ana depo',
  returnDate: '2026-11-02', status: 'Posted', currencyCode: 'TRY', grandTotal: 100, lineCount: 1,
};

// Answers the Satış screens' requests with small, well-formed data.
function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/warehouses/') return warehouses;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/hr/employees/' || path === '/api/finance/accounts') return [];
  if (path === '/api/sales/quotes/exchange-rates') return { baseCurrencyCode: 'TRY', rates: [] };
  if (path === '/api/sales/quotes/') return page([quote('q1', 'Draft'), quote('q2', 'Sent')]);
  if (path === '/api/sales/quotes/q1') return { ...quote('q1', 'Draft'), notes: null, deliveryTerms: null, subtotal: 100, discountTotal: 0, taxTotal: 0, lines: [], customFields: [] };
  if (path === '/api/sales/quotes/q1/revisions') return [{ id: 'q1', code: 'T-q1', revisionNumber: 1, status: 'Draft', quoteDate: '2026-11-01', grandTotal: 100, currencyCode: 'TRY' }];
  if (path === '/api/sales/invoices/') return page([invoice('i1', 'Posted'), invoice('i2', 'Voided')]);
  if (path === '/api/sales/invoices/i1') return invoiceDetail('i1', 'Posted');
  if (path === '/api/sales/invoices/i2') return invoiceDetail('i2', 'Voided');
  if (path === '/api/sales/deliveries/')
    return page([delivery('d1', 'Posted'), delivery('d2', 'Voided'), { ...delivery('d3', 'Posted'), hasSalesInvoice: true, invoiceStatus: 'Posted', invoiceId: 'i1' }]);
  if (path === '/api/sales/deliveries/d1') return { ...delivery('d1', 'Posted'), lines: [] };
  if (path === '/api/sales/orders/') return page([order]);
  if (path === '/api/sales/orders/o1') return { ...order, subtotal: 100, discountTotal: 0, taxTotal: 0, lines: [], customFields: [] };
  if (path === '/api/sales/orders/o1/deliveries') return [];
  if (path === '/api/sales/returns/') return page([salesReturn]);
  if (path === '/api/sales/returns/r1') return { ...salesReturn, subtotal: 100, discountTotal: 0, taxTotal: 0, lines: [] };
  if (path === '/api/sales/promotions/') return [];
  return page([]);
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
  apiMock.mockImplementation(async (url: string) => respond(url));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  sessionStorage.clear();
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

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const primary = (id: string) => command(id).getAttribute('data-primary') === 'true';
const reason = (id: string) => command(id).getAttribute('title') ?? command(id).getAttribute('aria-label') ?? '';
function openMenu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  // Closed with the trigger: Escape would also close an open document detail.
  fireEvent.click(command('more'));
  return items;
}
// Header buttons the UI audit (and the document detail header) would report as duplicates of the bar.
const headerButtonTexts = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.heading-actions button, .page-heading button, .list-v2-heading button, .list-v2-export-slot button, .rf-toolbar button, .doc-surface-actions button'))
    .map((node) => node.textContent?.trim() ?? '');
const COMMON = /^(yeni|kaydet|sil|yazdır|excel|xlsx|csv|dışa aktar|yenile)(?!\p{L})/iu;
const duplicates = () => headerButtonTexts().filter((text) => COMMON.test(text));
const row = (code: string) => screen.getByText(code, { exact: false }).closest('tr')!;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

describe('PageCommandsSlot', () => {
  it('registers only while mounted, so a later detail registration takes over', async () => {
    function Screen({ detail }: { detail: boolean }) {
      return (
        <>
          {!detail && <PageCommandsSlot commands={{ new: { primary: true, run: () => undefined } }} />}
          {detail && <PageCommandsSlot commands={{ print: { run: () => undefined } }} />}
        </>
      );
    }
    const view = renderScreen(<Screen detail={false} />);
    await settle();
    expect(enabled('new')).toBe(true);
    expect(enabled('print')).toBe(false);
    view.rerender(
      <CommandProvider>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><Screen detail /></KeepAliveViews>
      </CommandProvider>,
    );
    await settle();
    expect(enabled('print')).toBe(true);
    expect(enabled('new')).toBe(false);
  });
});

describe('Satış Teklifleri', () => {
  it('moves Yeni, the header actions and the export to the bar', async () => {
    const onNavigate = vi.fn();
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle();
    expect(enabled('new')).toBe(true);
    expect(primary('new')).toBe(true);
    expect(enabled('export')).toBe(true);
    expect(screen.queryByRole('button', { name: /Yeni teklif/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Teklif alanları' })).toBeNull();
    expect(duplicates()).toEqual([]);
    expect(openMenu()).toEqual(['Teklif alanları', 'CSV olarak dışa aktar']);
    expect(enabled('open')).toBe(false);
    fireEvent.keyDown(window, { key: 'F2' });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-quote-create'));
  });

  it('opens and deletes the selected quote; only a draft can be deleted', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(row('T-q2'));
    await waitFor(() => expect(enabled('open')).toBe(true));
    expect(enabled('delete')).toBe(false);
    expect(reason('delete')).toContain('Yalnızca taslak teklifler silinebilir.');
    fireEvent.click(row('T-q1'));
    await waitFor(() => expect(enabled('delete')).toBe(true));
  });

  it('Enter on a focused row opens that row, not the previously selected one', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(row('T-q2'));
    await waitFor(() => expect(enabled('open')).toBe(true));
    const focused = row('T-q1');
    focused.focus();
    fireEvent.keyDown(focused, { key: 'Enter' });
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/sales/quotes/q1', 't'));
    expect(apiMock).not.toHaveBeenCalledWith('/api/sales/quotes/q2', 't');
  });

  it('the open draft quote prints and deletes from the bar, with its actions in İşlemler', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(row('T-q1'));
    await act(async () => {
      fireEvent.click(command('open'));
    });
    await waitFor(() => expect(enabled('print')).toBe(true));
    expect(enabled('delete')).toBe(true);
    expect(openMenu()).toEqual(['Düzenle', 'İletildi yap', 'Revizyon oluştur']);
    expect(duplicates()).toEqual([]);
    // The detail header keeps its workflow buttons; Yazdır and Sil moved to the bar.
    const detailButtons = Array.from(document.querySelectorAll('.doc-surface-actions button')).map((node) => node.textContent?.trim());
    expect(detailButtons).toContain('Düzenle');
    expect(detailButtons.some((text) => /Yazdır|^Sil$/.test(text ?? ''))).toBe(false);
  });

  it('non-admins get no delete and no field catalog', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantUser" onNavigate={vi.fn()} />);
    await settle();
    expect(enabled('delete')).toBe(false);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
  });
});

describe('Teklif oluşturma', () => {
  it('saves with Ctrl+S from the bar and asks before Yeni discards input', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantUser" onNavigate={vi.fn()} createQuotePage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    expect(primary('save')).toBe(true);
    expect(enabled('new')).toBe(true);
    expect(primary('new')).toBe(false);
    expect(duplicates()).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Kayıtlı cari olmadan teklif oluştur/ }));
    const name = await screen.findByPlaceholderText('Firma veya kişi adı');
    fireEvent.change(name, { target: { value: 'Yeni Müşteri' } });
    fireEvent.keyDown(window, { key: 'F2' });
    expect(await screen.findByText('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')).toBeTruthy();
    // Vazgeç keeps the input (and resolves the dialog so it does not carry over to the next test).
    fireEvent.click(document.querySelector<HTMLElement>('.workspace-confirm-actions button.secondary')!);
    await waitFor(() => expect(screen.queryByText('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')).toBeNull());
    expect((screen.getByPlaceholderText('Firma veya kişi adı') as HTMLInputElement).value).toBe('Yeni Müşteri');
  });
});

describe('Satış Siparişleri', () => {
  it('Yeni opens the order create page; field catalog and CSV are in İşlemler', async () => {
    const onNavigate = vi.fn();
    renderScreen(<SalesOrdersPage token="t" role="TenantDeveloper" onNavigate={onNavigate} />);
    await settle();
    expect(primary('new')).toBe(true);
    expect(enabled('export')).toBe(true);
    expect(screen.queryByRole('button', { name: /Yeni sipariş/ })).toBeNull();
    expect(duplicates()).toEqual([]);
    expect(openMenu()).toEqual(['Sipariş alanları', 'CSV olarak dışa aktar']);
    fireEvent.keyDown(window, { key: 'F2' });
    expect(onNavigate).toHaveBeenCalledWith('sales-order-create');
  });

  it('an open order holds the bar with its own actions, and gives it back when closed', async () => {
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(row('S-o1'));
    await act(async () => {
      fireEvent.click(command('open'));
    });
    await waitFor(() => expect(openMenu()).toEqual(['Stok ayır', 'İrsaliye oluştur']));
    expect(enabled('new')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Listeye dön' }));
    await waitFor(() => expect(openMenu()).toEqual(['Sipariş alanları', 'CSV olarak dışa aktar']));
  });

  it('the order create page saves through the bar', async () => {
    renderScreen(<SalesOrdersPage token="t" role="TenantUser" onNavigate={vi.fn()} createOrderPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    expect(primary('save')).toBe(true);
    expect(enabled('new')).toBe(true);
    expect(duplicates()).toEqual([]);
  });
});

describe('Satış Faturaları', () => {
  it('Yeni opens the invoice create page and the header buttons are gone', async () => {
    const onNavigate = vi.fn();
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle();
    expect(primary('new')).toBe(true);
    expect(enabled('export')).toBe(true);
    expect(screen.queryByRole('button', { name: /Fatura oluştur/ })).toBeNull();
    expect(duplicates()).toEqual([]);
    fireEvent.keyDown(window, { key: 'F2' });
    expect(onNavigate).toHaveBeenCalledWith('sales-invoice-create');
  });

  it('a posted invoice is cancelled, not deleted; a voided one can be deleted', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    // A row click opens the invoice; its detail owns the bar.
    fireEvent.click(row('F-i1'));
    await waitFor(() => expect(reason('delete')).toContain('Kesilmiş belge silinemez — İşlemler › Faturayı iptal et'));
    expect(enabled('delete')).toBe(false);
    expect(openMenu()).toEqual(['Faturayı iptal et']);
    fireEvent.click(screen.getByRole('button', { name: 'Listeye dön' }));
    // Back on the list, the selected posted invoice: Sil disabled, İptal et in İşlemler.
    await waitFor(() => expect(reason('delete')).toContain('Kesilmiş belge silinemez — İşlemler › İptal et'));
    expect(openMenu()).toEqual(['İptal et', 'CSV olarak dışa aktar']);
    fireEvent.click(row('F-i2'));
    fireEvent.click(await screen.findByRole('button', { name: 'Listeye dön' }));
    await waitFor(() => expect(enabled('delete')).toBe(true));
  });

  it('the invoice create page saves through the bar', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantUser" onNavigate={vi.fn()} openInvoiceCreate />);
    await waitFor(() => expect(command('save').getAttribute('data-primary')).toBe('true'));
    expect(enabled('save')).toBe(false);
    expect(reason('save')).toContain('Kaydetmek için müşteri ile her satırın stok ve deposunu seçin.');
    expect(enabled('new')).toBe(true);
    expect(duplicates()).toEqual([]);
  });
});

describe('Satış İrsaliyeleri', () => {
  it('Yeni, Aç and Sil follow the selected delivery; a shipped one is cancelled', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(primary('new')).toBe(true);
    expect(screen.queryByRole('button', { name: /Yeni irsaliye/ })).toBeNull();
    expect(duplicates()).toEqual([]);
    // The list highlights the first row until one is chosen; the bar acts on that row.
    expect(enabled('open')).toBe(true);
    fireEvent.click(row('I-d1'));
    await waitFor(() => expect(enabled('open')).toBe(true));
    expect(reason('delete')).toContain('Sevk edilmiş irsaliye silinemez — İşlemler › İptal et');
    expect(openMenu()).toEqual(['Faturalaştır', 'İptal et', 'CSV olarak dışa aktar']);
    fireEvent.click(row('I-d2'));
    await waitFor(() => expect(enabled('delete')).toBe(true));
  });

  it('F2 over an open delivery closes it and shows the create form', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'I-d1 irsaliye ayrıntılarını aç' }));
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    fireEvent.keyDown(window, { key: 'F2' });
    await waitFor(() => expect(document.querySelector('.doc-surface')).toBeNull());
    expect(document.querySelector('.sales-rf-fulfillment')).not.toBeNull();
    await waitFor(() => expect(enabled('save')).toBe(true));
  });

  it('an invoice opened from a delivery holds the bar until it is closed', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(row('I-d3'));
    await waitFor(() => expect(openMenu()).toContain('Faturayı aç'));
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Faturayı aç' }));
    });
    await waitFor(() => expect(openMenu()).toEqual(['Faturayı iptal et']));
    fireEvent.click(screen.getByRole('button', { name: 'Listeye dön' }));
    await waitFor(() => expect(openMenu()).toContain('CSV olarak dışa aktar'));
  });

  it('the create page keeps Yeni (a fresh draft) and Kaydet', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantUser" onNavigate={vi.fn()} createDeliveryPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    expect(enabled('new')).toBe(true);
    expect(duplicates()).toEqual([]);
  });
});

describe('Other Satış screens', () => {
  it('Satış Talepleri: Yeni and CSV in the bar, no header buttons', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    expect(primary('new')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Yeni talep' })).toBeNull();
    expect(duplicates()).toEqual([]);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
    fireEvent.keyDown(window, { key: 'F2' });
    await waitFor(() => expect(enabled('save')).toBe(true));
    // Ctrl+S in the open form submits it: the empty required fields stop it at the browser's validation.
    const field = document.querySelector<HTMLInputElement>('.record-form input:not([type=hidden])')!;
    const form = field.form!;
    const attempts: string[] = [];
    form.addEventListener('invalid', () => attempts.push('invalid'), true);
    form.addEventListener('submit', () => attempts.push('submit'), true);
    field.focus();
    fireEvent.keyDown(field, { key: 's', ctrlKey: true });
    await waitFor(() => expect(attempts.length).toBeGreaterThan(0));
  });

  it('Satış İadeleri: Yeni opens the invoice list', async () => {
    const onNavigate = vi.fn();
    renderScreen(<SalesReturnsPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle();
    expect(primary('new')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Faturadan iade oluştur' })).toBeNull();
    expect(duplicates()).toEqual([]);
    fireEvent.keyDown(window, { key: 'F2' });
    expect(onNavigate).toHaveBeenCalledWith('sales-invoices');
  });

  it('Satış İadeleri: a posted return is cancelled, not deleted', async () => {
    renderScreen(<SalesReturnsPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(row('IADE-r1'));
    await waitFor(() => expect(reason('delete')).toContain('Kesilmiş belge silinemez — İşlemler › İadeyi iptal et'));
    expect(enabled('delete')).toBe(false);
    expect(openMenu()).toEqual(['Faturayı aç', 'İadeyi iptal et']);
  });

  it('Dağıtım planı: Excel from the grid, CSV in İşlemler', async () => {
    renderScreen(<SalesDistributionPage token="t" />);
    await settle();
    expect(enabled('refresh')).toBe(true);
    expect(duplicates()).toEqual([]);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
  });

  it('Kampanyalar: Yeni, Excel and the report toggle in the bar', async () => {
    renderScreen(<SalesPromotionsPage token="t" role="TenantAdmin" onBack={vi.fn()} />);
    await settle();
    expect(primary('new')).toBe(true);
    expect(enabled('refresh')).toBe(true);
    expect(enabled('export')).toBe(false);
    expect(reason('export')).toContain('Dışa aktarılacak kampanya yok.');
    expect(screen.queryByRole('button', { name: /Yeni kampanya/ })).toBeNull();
    expect(duplicates()).toEqual([]);
    expect(openMenu()).toEqual(['Performans raporu']);
    fireEvent.keyDown(window, { key: 'F2' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
