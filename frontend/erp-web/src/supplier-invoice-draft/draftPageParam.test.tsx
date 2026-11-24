import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { pageParamsOf, setPageParams } from '../pageNavigation';
import StandaloneSupplierInvoiceDraftPage from '../StandaloneSupplierInvoiceDraftPage';

const summary = { id: 'd1', supplierId: 's1', supplierName: 'Ege', invoiceNumber: 'TF-9', invoiceDate: '2026-11-01', dueDate: null, currencyCode: 'TRY',
  status: 'Posted', grandTotal: 100, lineCount: 1, createdAt: '2026-11-01', updatedAt: '2026-11-01', rowVersion: 'AA==' };
const detail = { ...summary, notes: null, subtotal: 100, discountTotal: 0, taxTotal: 0, lines: [] };
function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/purchasing/standalone-invoices/') return { items: [summary], page: 1, pageSize: 50, totalCount: 1 };
  if (path === '/api/purchasing/standalone-invoices/d1') return detail;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/customers/') return { items: [], totalCount: 0 };
  return [];
}
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => cleanup());

describe('Alış faturası taslağı sayfa parametresiyle açılır', () => {
  it('a posted draft is not opened for editing: a note says so and the param is dropped', async () => {
    setPageParams('sales-purchase-invoice-drafts', { draftId: 'd1' });
    render(
      <CommandProvider>
        <KeepAliveViews activeKey="v" openKeys={['v']}><StandaloneSupplierInvoiceDraftPage token="t" role="TenantAdmin" /></KeepAliveViews>
      </CommandProvider>,
    );
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    await waitFor(() => expect(screen.getByText('TF-9 taslağı muhasebeleştirildi; düzenlenemez.')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(pageParamsOf('sales-purchase-invoice-drafts')).toEqual({});
  });
});
