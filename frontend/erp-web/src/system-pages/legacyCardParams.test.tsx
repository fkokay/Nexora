import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import { WorkspacePageRouter } from '../WorkspacePageRouter';
import { openWorkspacePage, pageParamsOf, setPageParams } from '../pageNavigation';
import type * as AppTypes from '../erp-types';

// Sistem liste sayfası kartını sayfa parametresiyle açar (ör. customers → `@customer-create`, `customerId`). Kartın sistem
// sayfası yayımlı değilken hedef anahtarın eski ekranı çizilir: eski ekran parametredeki kaydı düzenleme kipinde açmalı,
// parametresiz açılış bugünkü gibi kalmalı.

const C1 = 'c0000000-0000-0000-0000-000000000001';
const C2 = 'c0000000-0000-0000-0000-000000000002';
const O1 = 'd0000000-0000-0000-0000-000000000001';
const O2 = 'd0000000-0000-0000-0000-000000000002';
const E1 = 'e0000000-0000-0000-0000-000000000001';
const F1 = 'f0000000-0000-0000-0000-000000000001';
const T1 = 'a0000000-0000-0000-0000-000000000001';
const B1 = 'b0000000-0000-0000-0000-000000000001';
const MISSING = '99999999-0000-0000-0000-000000000009';

const customer = (id: string, code: string, name: string) => ({
  id, code, name, type: 'Customer', taxNumber: null, isActive: true, createdAt: '2026-11-01', rowVersion: 'AA==',
  groupId: null, groupName: null, currencyCode: 'TRY', riskLimit: null, paymentTermDays: 0, isEInvoiceRegistered: false,
});
const opportunity = (id: string, code: string, name: string) => ({
  id, code, name, customerId: null, customerName: null, stage: 'Proposal', estimatedValue: 1000,
  currencyCode: 'TRY', probabilityPercent: 50, expectedCloseDate: null, nextActivityAt: null, notes: null, updatedAt: '2026-11-01T00:00:00Z',
});
const employee = (id: string, fullName: string) => ({
  id, personnelCode: 'P-001', fullName, department: null, jobTitle: null, employmentCategory: null, workEmail: null,
  hireDate: '2026-01-01', terminationDate: null, status: 'Active', userId: null, rowVersion: 'AA==',
});
const asset = (id: string, name: string) => ({
  id, assetCode: 'DV-001', name, category: null, acquisitionDate: '2026-01-01', inServiceDate: '2026-01-01',
  acquisitionCostBase: 1000, residualValueBase: 0, usefulLifeMonths: 60, accumulatedDepreciationBase: 0, status: 'Active',
  supplierAccountId: null, sourceReference: null, purchaseInvoiceId: null, rowVersion: 'AA==',
});
const tradeCase = (id: string, referenceCode: string) => ({
  id, direction: 'Import', status: 'Draft', purchaseOrderId: null, salesOrderId: null, referenceCode, originCountryCode: 'DE',
  destinationCountryCode: 'TR', incotermsCode: null, harmonizedSystemCode: null, transportMode: 'Sea', carrierReference: null,
  customsReference: null, declaredValue: 100, currencyCode: 'EUR', plannedShipDate: null, actualShipDate: null, plannedArrivalDate: null,
  actualArrivalDate: null, notes: null, updatedAt: '2026-11-01T00:00:00Z', inventoryPostingRequired: false, purchaseReceiptId: null,
  salesDeliveryId: null, inventoryDocumentLinkedAt: null,
});
const records: Record<string, unknown> = {
  [`/api/customers/${C1}`]: customer(C1, 'C-1001', 'FATİH KOKAY'),
  [`/api/customers/${C2}`]: customer(C2, 'C-1002', 'AYŞE YILMAZ'),
  [`/api/crm/opportunities/${O1}`]: opportunity(O1, 'FRS-1', 'Fırsat 1'),
  [`/api/crm/opportunities/${O2}`]: opportunity(O2, 'FRS-2', 'Fırsat 2'),
  [`/api/hr/employees/${E1}`]: employee(E1, 'Personel 1'),
  [`/api/fixed-assets/${F1}`]: asset(F1, 'Kıymet 1'),
  [`/api/foreign-trade/cases/${T1}`]: tradeCase(T1, 'ITH-0001'),
  [`/api/finance/accounts/${B1}`]: {
    id: B1, code: 'B-1', name: 'Banka 1', type: 'Bank', currencyCode: 'TRY', isActive: true, balance: 0, createdAt: '2026-11-01',
    transactions: [], transactionPage: 1, transactionPageSize: 1, transactionTotalCount: 0,
  },
};

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (Object.prototype.hasOwnProperty.call(records, path)) return records[path];
  if (path.includes(MISSING)) throw new Error('Kayıt bulunamadı.');
  if (path.endsWith('/depreciation-schedule'))
    return { assetId: F1, method: 'StraightLine', currencyBasis: 'TRY', acquisitionCostBase: 1000, residualValueBase: 0, accumulatedDepreciationBase: 0, rows: [] };
  if (path.endsWith('/disposal')) throw new Error('Elden çıkarma yok.');
  if (path.endsWith('/acquisition-posting')) return { isPosted: false };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/customers/' || path === '/api/crm/opportunities/') return { items: [], page: 1, pageSize: 50, total: 0, totalCount: 0 };
  if (path === '/api/fixed-assets') return { items: [], page: 1, pageSize: 200, totalCount: 0 };
  if (path === '/api/foreign-trade/cases') return { items: [], total: 0 };
  if (path === '/api/foreign-trade/capabilities') return { canCreate: true, canUpdate: true, canAdvance: true };
  if (path === '/api/location-definitions/') return { provinces: [], districts: [] };
  return [];
}

const { api, urls } = vi.hoisted(() => ({ api: vi.fn(), urls: [] as string[] }));
vi.mock('../erpApi', async (original) => ({ ...(await original<typeof import('../erpApi')>()), api }));
vi.mock('../authApi', async (original) => ({
  ...(await original<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) => {
    urls.push(url);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    try {
      return json(200, respond(url));
    } catch {
      return json(404, { title: 'Not Found', detail: 'Kayıt bulunamadı.' });
    }
  }),
}));

const tenant = { id: 't1', name: 'Firma', role: 'TenantAdmin' } as unknown as AppTypes.Tenant;
const noop = () => {};
const TOUCHED = ['customer-create', 'crm-opportunity-create', 'hr-employee-create', 'fixed-asset-card', 'foreign-trade-case', 'finance-account-create'];
const T = { timeout: 10000 };

function renderPage(page: string, onNavigate: (page: string) => void = noop) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        <Suspense fallback={<div>Suspense…</div>}>
          <WorkspacePageRouter page={page} token="tok" tenant={tenant} locale="tr" platformStatus="" selectedModuleMenu={null}
            pendingCustomerInvoiceId={null} initialCustomerSearch="" onOpenSalesInvoice={noop} onOpenPurchaseInvoices={noop}
            onInitialInvoiceOpened={noop} pendingPurchaseSupplier={null} onInitialSupplierOpened={noop} onNavigate={onNavigate}
            onLocaleChange={noop} onThemeChange={noop} requestApi={api as never} onOpenStudio={noop} onDevelopModuleStarter={noop} />
        </Suspense>
      </KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
const fetched = (path: string) => urls.some((url) => url.split('?')[0] === path);
const heading = (name: string | RegExp) => screen.findByRole('heading', { name }, T);
/** The list's param-less "Yeni" (or a menu open) on the still-open card tab. */
const openNew = (page: string, params: Record<string, string> = {}) =>
  act(async () => { openWorkspacePage({ page, params, replace: false }); });
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  urls.length = 0;
  api.mockReset();
  api.mockImplementation(async (url: string) => { urls.push(url); return respond(url); });
});
afterEach(() => {
  cleanup();
  for (const key of TOUCHED) setPageParams(key, {});
  sessionStorage.clear();
  localStorage.clear();
});

describe('eski kart ekranları kayıt parametresi', { timeout: 30000 }, () => {
  it('customer-create + customerId opens that account in edit mode (the param stays the tab record)', async () => {
    setPageParams('customer-create', { customerId: C1 });
    renderPage('customer-create');
    expect(await heading('FATİH KOKAY')).toBeTruthy();
    expect(fetched(`/api/customers/${C1}`)).toBe(true);
    expect(pageParamsOf('customer-create')).toEqual({ customerId: C1 });
    expect(screen.queryByRole('heading', { name: 'Cari Kart Tanımlama' })).toBeNull();
  });

  it('customer-create reopened with another customerId loads the new account', async () => {
    setPageParams('customer-create', { customerId: C1 });
    renderPage('customer-create');
    await heading('FATİH KOKAY');
    await act(async () => { setPageParams('customer-create', { customerId: C2 }); });
    expect(await heading('AYŞE YILMAZ')).toBeTruthy();
  });

  it('customer-create without the param stays a new card', async () => {
    renderPage('customer-create');
    expect(await heading('Cari Kart Tanımlama')).toBeTruthy();
    expect(urls.some((url) => /^\/api\/customers\/[0-9a-f-]{36}$/.test(url))).toBe(false);
  });

  it('customer-create with an unreadable customerId shows the error, not a crash', async () => {
    setPageParams('customer-create', { customerId: MISSING });
    renderPage('customer-create');
    expect(await screen.findByText('Kayıt bulunamadı.', {}, T)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cari listesine dön' })).toBeTruthy();
  });

  it('crm-opportunity-create + opportunityId opens that opportunity in edit mode; another id reloads', async () => {
    setPageParams('crm-opportunity-create', { opportunityId: O1 });
    renderPage('crm-opportunity-create');
    expect(await heading('Fırsat 1')).toBeTruthy();
    await act(async () => { setPageParams('crm-opportunity-create', { opportunityId: O2 }); });
    expect(await heading('Fırsat 2')).toBeTruthy();
  });

  it('crm-opportunity-create without the param stays a new opportunity; an unreadable id shows an error', async () => {
    renderPage('crm-opportunity-create');
    expect(await heading('Yeni fırsat')).toBeTruthy();
    expect(urls.some((url) => /^\/api\/crm\/opportunities\/[0-9a-f-]{36}$/.test(url))).toBe(false);
    await act(async () => { setPageParams('crm-opportunity-create', { opportunityId: MISSING }); });
    expect(await screen.findByText(/Fırsat açılamadı/, {}, T)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Yeni fırsat' })).toBeTruthy();
  });

  it('hr-employee-create + employeeId opens the employee edit form', async () => {
    setPageParams('hr-employee-create', { employeeId: E1 });
    renderPage('hr-employee-create');
    expect(await heading('Personel bilgilerini düzenle')).toBeTruthy();
    expect(fetched(`/api/hr/employees/${E1}`)).toBe(true);
  });

  it('hr-employee-create without the param has no edit form', async () => {
    renderPage('hr-employee-create');
    await waitFor(() => expect(urls.some((url) => url.startsWith('/api/hr/employees'))).toBe(true), T);
    await settle();
    expect(urls.some((url) => /^\/api\/hr\/employees\/[0-9a-f-]{36}$/.test(url))).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Personel bilgilerini düzenle' })).toBeNull();
  });

  it('fixed-asset-card + assetId opens that asset card', async () => {
    setPageParams('fixed-asset-card', { assetId: F1 });
    renderPage('fixed-asset-card');
    expect(await heading('Kıymet 1')).toBeTruthy();
    expect(pageParamsOf('fixed-asset-card')).toEqual({});
  });

  it('fixed-asset-card without the param shows the register, no card', async () => {
    renderPage('fixed-asset-card');
    await waitFor(() => expect(fetched('/api/fixed-assets')).toBe(true), T);
    await settle();
    expect(urls.some((url) => /^\/api\/fixed-assets\/[0-9a-f-]{36}$/.test(url.split('?')[0]))).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Kıymet 1' })).toBeNull();
  });

  it('foreign-trade-case + id opens the case form; direction opens a new case of that direction', async () => {
    setPageParams('foreign-trade-case', { id: T1 });
    renderPage('foreign-trade-case');
    expect(await heading('İthalat dosyasını düzenle')).toBeTruthy();
    expect(pageParamsOf('foreign-trade-case')).toEqual({});
    cleanup();
    setPageParams('foreign-trade-case', { direction: 'Export' });
    renderPage('foreign-trade-case');
    expect(await heading('İhracat dosyası oluştur')).toBeTruthy();
  });

  it('foreign-trade-case without params shows the case list', async () => {
    renderPage('foreign-trade-case');
    expect(await heading('İthalat ve ihracat dosyaları')).toBeTruthy();
    await settle();
    expect(screen.queryByRole('heading', { name: /dosyası oluştur|dosyasını düzenle/ })).toBeNull();
  });

  it('finance-account-create + accountId opens that bank account for editing', async () => {
    setPageParams('finance-account-create', { accountId: B1 });
    renderPage('finance-account-create');
    expect(await heading('Banka Hesabı Düzenle')).toBeTruthy();
    expect(fetched(`/api/finance/accounts/${B1}`)).toBe(true);
    expect(pageParamsOf('finance-account-create')).toEqual({});
  });

  it('finance-account-create + accountType=Bank opens a new bank card; without params a new cash card', async () => {
    setPageParams('finance-account-create', { accountType: 'Bank' });
    renderPage('finance-account-create');
    expect(await heading('Banka Kartı Tanımlama')).toBeTruthy();
    cleanup();
    renderPage('finance-account-create');
    expect(await heading('Kasa Kartı Tanımlama')).toBeTruthy();
  });

  it('finance-account-create with an unreadable accountId shows the error', async () => {
    setPageParams('finance-account-create', { accountId: MISSING });
    renderPage('finance-account-create');
    expect(await screen.findByText('Hesap açılamadı: Kayıt bulunamadı.', {}, T)).toBeTruthy();
  });
});

describe('kart sekmesinde açık kayıttan sonra Yeni ve yeniden açma', { timeout: 30000 }, () => {
  it('customer-create: a param-less Yeni after Aç returns to a new card', async () => {
    setPageParams('customer-create', { customerId: C1 });
    renderPage('customer-create');
    await heading('FATİH KOKAY');
    expect(pageParamsOf('customer-create')).toEqual({ customerId: C1 });
    await openNew('customer-create');
    expect(await heading('Cari Kart Tanımlama')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'FATİH KOKAY' })).toBeNull();
  });

  it('crm-opportunity-create: Yeni after Aç gives a new form; Vazgeç clears the param so the same record reopens', async () => {
    setPageParams('crm-opportunity-create', { opportunityId: O1 });
    const onNavigate = vi.fn();
    renderPage('crm-opportunity-create', onNavigate);
    await heading('Fırsat 1');
    await openNew('crm-opportunity-create');
    expect(await heading('Yeni fırsat')).toBeTruthy();
    await openNew('crm-opportunity-create', { opportunityId: O1 });
    await heading('Fırsat 1');
    fireEvent.click(screen.getByRole('button', { name: /Vazgeç/ }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('crm-opportunities'), T);
    expect(pageParamsOf('crm-opportunity-create')).toEqual({});
    expect(await heading('Yeni fırsat')).toBeTruthy();
    await openNew('crm-opportunity-create', { opportunityId: O1 });
    expect(await heading('Fırsat 1')).toBeTruthy();
  });

  it('hr-employee-create: Yeni personel after Aç closes the edit form; closing the form lets the same employee reopen', async () => {
    setPageParams('hr-employee-create', { employeeId: E1 });
    renderPage('hr-employee-create');
    await heading('Personel bilgilerini düzenle');
    await openNew('hr-employee-create');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Personel bilgilerini düzenle' })).toBeNull(), T);
    await openNew('hr-employee-create', { employeeId: E1 });
    await heading('Personel bilgilerini düzenle');
    const form = screen.getByRole('heading', { name: 'Personel bilgilerini düzenle' }).closest<HTMLElement>('.hrp-record-form')!;
    fireEvent.click(Array.from(form.querySelectorAll('button')).find((button) => /Vazgeç/.test(button.textContent ?? ''))!);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Personel bilgilerini düzenle' })).toBeNull(), T);
    expect(pageParamsOf('hr-employee-create')).toEqual({});
    await openNew('hr-employee-create', { employeeId: E1 });
    expect(await heading('Personel bilgilerini düzenle')).toBeTruthy();
  });

  it('finance-account-create: Yeni (accountType) after an opened account gives a fresh card of that type', async () => {
    setPageParams('finance-account-create', { accountId: B1 });
    renderPage('finance-account-create');
    await heading('Banka Hesabı Düzenle');
    await openNew('finance-account-create', { accountType: 'Bank' });
    expect(await heading('Banka Kartı Tanımlama')).toBeTruthy();
    await openNew('finance-account-create', { accountType: 'Cash' });
    expect(await heading('Kasa Kartı Tanımlama')).toBeTruthy();
  });

  it('foreign-trade-case: Yeni (direction) after an opened case gives a new case form', async () => {
    setPageParams('foreign-trade-case', { id: T1 });
    renderPage('foreign-trade-case');
    await heading('İthalat dosyasını düzenle');
    await openNew('foreign-trade-case', { direction: 'Import' });
    expect(await heading('İthalat dosyası oluştur')).toBeTruthy();
  });
});
