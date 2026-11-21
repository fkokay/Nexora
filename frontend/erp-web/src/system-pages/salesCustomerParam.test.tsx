import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import SalesInvoicesPage from '../SalesInvoicesPage';
import SalesOrdersPage from '../SalesOrdersPage';
import { pageParamsOf, setPageParams } from '../pageNavigation';

// Karar 3: eski satış ekranları sistem sayfasının `erpPage` + `params: customerId` gezinmesini sayfa parametresinden okur.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', async (original) => ({ ...(await original<typeof import('../erpApi')>()), api }));

const C1 = '22222222-0000-0000-0000-000000000001';
let urls: string[] = [];

function mockApi() {
  api.mockImplementation(async (endpoint: string) => {
    urls.push(endpoint);
    if (endpoint.startsWith(`/api/customers/${C1}`)) return { id: C1, code: 'C-1001', name: 'FATİH KOKAY', type: 'Both', isActive: true, currencyCode: 'TRY' };
    if (endpoint.startsWith('/api/warehouses')) return [];
    if (endpoint.includes('/screen-views/')) return { fields: [] };
    return { items: [], page: 1, pageSize: 25, totalCount: 0, rates: [], baseCurrencyCode: 'TRY' };
  });
}
const props = { token: 't', role: 'TenantAdmin', onNavigate: () => {} };
const T = { timeout: 10000 };

beforeEach(() => { urls = []; api.mockReset(); mockApi(); sessionStorage.clear(); });
afterEach(() => { cleanup(); setPageParams('sales-invoices', {}); setPageParams('sales-order-create', {}); });

describe('eski satış ekranları customerId sayfa parametresi', { timeout: 30000 }, () => {
  it('invoice list filters by the customer once, shows a removable filter and consumes the param', async () => {
    setPageParams('sales-invoices', { customerId: C1 });
    render(<CommandProvider><KeepAliveViews activeKey="v" openKeys={['v']}><SalesInvoicesPage {...props} /></KeepAliveViews></CommandProvider>);
    await waitFor(() => expect(urls.some((url) => url.startsWith('/api/sales/invoices/?') && url.includes(`customerId=${C1}`))).toBe(true), T);
    expect(await screen.findByText('C-1001 · FATİH KOKAY', {}, T)).toBeTruthy();
    expect(pageParamsOf('sales-invoices')).toEqual({});
    urls = [];
    fireEvent.click(screen.getByRole('button', { name: 'Cari süzgecini kaldır' }));
    await waitFor(() => expect(urls.some((url) => url.startsWith('/api/sales/invoices/?'))).toBe(true), T);
    expect(urls.filter((url) => url.startsWith('/api/sales/invoices/?')).every((url) => !url.includes('customerId='))).toBe(true);
  });

  it('a create screen takes the customer from the page param and clears it', async () => {
    setPageParams('sales-order-create', { customerId: C1 });
    render(<CommandProvider><KeepAliveViews activeKey="v" openKeys={['v']}><SalesOrdersPage {...props} createOrderPage /></KeepAliveViews></CommandProvider>);
    await waitFor(() => expect(urls).toContain(`/api/customers/${C1}`), T);
    expect(pageParamsOf('sales-order-create')).toEqual({});
  });
});
