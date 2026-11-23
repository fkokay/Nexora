import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import SalesDeliveriesScreenPage from '../SalesDeliveriesScreenPage';
import SalesQuotesPage from '../SalesQuotesPage';
import { pageParamsOf, setPageParams } from '../pageNavigation';

// P5: kartlar önizlemedeyken eski ekran varsayılandır; liste standartlarının *-create anahtarlarına gönderdiği her parametreyi
// eski ekran da okur (revisesQuoteId, salesRequestId, siparişsiz irsaliye deliveryId).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', async (original) => ({ ...(await original<typeof import('../erpApi')>()), api }));

const Q1 = '33333333-0000-0000-0000-000000000001';
const R1 = '44444444-0000-0000-0000-000000000001';
const D1 = '55555555-0000-0000-0000-000000000001';
const C1 = '22222222-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
let urls: string[] = [];

const quote = { id: Q1, code: 'TKL-7', customerId: C1, customerName: 'Acme', currencyCode: 'TRY', quoteDate: '2026-11-01', validUntil: '2099-01-01', status: 'Sent',
  revisionNumber: 1, notes: 'not', deliveryTerms: null, salespersonEmployeeId: null, hasSalesOrder: false, customFields: [],
  lines: [{ stockItemId: S1, stockCode: 'STK-1', stockName: 'Koli', quantity: 2, unitPrice: 10, discountPercent: 0, vatPercent: 20, unitCode: 'ADET' }] };

function mockApi() {
  api.mockImplementation(async (endpoint: string) => {
    urls.push(endpoint);
    if (endpoint === `/api/sales/quotes/${Q1}`) return quote;
    if (endpoint === `/api/sales/requests/${R1}`) {
      return { id: R1, code: 'TLP-1', customerId: C1, customerName: 'Acme', currencyCode: 'TRY', description: null,
        lines: [{ lineNumber: 1, stockItemId: S1, stockCode: 'STK-1', stockName: 'Koli', unitCode: 'ADET', quantity: 3 }] };
    }
    if (endpoint === `/api/sales/standalone-deliveries/${D1}`) {
      return { id: D1, code: 'SIRS-4', customerId: C1, warehouseId: 'w1', deliveryDate: '2026-11-05', status: 'Draft', lines: [{ stockItemId: S1, quantity: 4 }] };
    }
    if (endpoint.startsWith(`/api/customers/${C1}`)) return { id: C1, code: 'C-1', name: 'Acme', type: 'Customer', isActive: true, currencyCode: 'TRY' };
    if (endpoint.startsWith('/api/warehouses')) return [];
    if (endpoint.startsWith('/api/hr/employees')) return [];
    if (endpoint.includes('/custom-fields')) return [];
    if (endpoint.includes('/screen-views/')) return { fields: [] };
    return { items: [], page: 1, pageSize: 25, totalCount: 0, rates: [], baseCurrencyCode: 'TRY' };
  });
}
const props = { token: 't', role: 'TenantAdmin', onNavigate: () => {} };
const T = { timeout: 10000 };
const view = (node: React.ReactNode) => render(<CommandProvider><KeepAliveViews activeKey="v" openKeys={['v']}>{node}</KeepAliveViews></CommandProvider>);

beforeEach(() => { urls = []; api.mockReset(); mockApi(); sessionStorage.clear(); });
afterEach(() => { cleanup(); setPageParams('sales-quote-create', {}); setPageParams('sales-delivery-create', {}); });

describe('eski satış oluşturma ekranları liste parametrelerini okur', { timeout: 30000 }, () => {
  it('revisesQuoteId opens a revision draft of that quote and is consumed', async () => {
    setPageParams('sales-quote-create', { revisesQuoteId: Q1 });
    view(<SalesQuotesPage {...props} createQuotePage />);
    await waitFor(() => expect(urls).toContain(`/api/sales/quotes/${Q1}`), T);
    // Revizyon taslağı kaynağın kodundan sonraki revizyon kodunu alır.
    expect(await screen.findByText('TKL-7-R2', {}, T)).toBeTruthy();
    expect(pageParamsOf('sales-quote-create')).toEqual({});
  });

  it('salesRequestId prefills the quote from that request and is consumed', async () => {
    setPageParams('sales-quote-create', { salesRequestId: R1 });
    view(<SalesQuotesPage {...props} createQuotePage />);
    await waitFor(() => expect(urls).toContain(`/api/sales/requests/${R1}`), T);
    expect(pageParamsOf('sales-quote-create')).toEqual({});
  });

  it('the standalone delivery create screen opens the draft named by deliveryId', async () => {
    setPageParams('sales-delivery-create', { deliveryId: D1 });
    view(<SalesDeliveriesScreenPage {...props} createDeliveryPage />);
    await waitFor(() => expect(urls).toContain(`/api/sales/standalone-deliveries/${D1}`), T);
    expect(await screen.findByText('SIRS-4 taslağı düzenleniyor.', {}, T)).toBeTruthy();
    expect(pageParamsOf('sales-delivery-create')).toEqual({});
  });
});
