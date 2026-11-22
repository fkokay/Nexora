import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './salesDeliveriesOperations.fixture.json';
import { T, page, query, salesHarness } from './salesStandardHarness';

// "Satış İrsaliyeleri" standart tanımı (sales-deliveries.json): siparişli ve siparişsiz irsaliyeler tek listede (karar 2).
// `salesDeliveriesOperations.fixture.json` ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-deliveries';
const D1 = 'ffffffff-0000-0000-0000-000000000001';
const D2 = 'ffffffff-0000-0000-0000-000000000002';
const D3 = 'ffffffff-0000-0000-0000-000000000003';
const O1 = 'dddddddd-0000-0000-0000-000000000001';
const I1 = '99999999-0000-0000-0000-000000000001';
const C1 = '22222222-0000-0000-0000-000000000001';

const row = (id: string, code: string, kind: 'Order' | 'Invoice' | 'Standalone', status: string, extra: Record<string, unknown> = {}) => ({
  id, kind, isStandalone: kind === 'Standalone', salesDeliveryId: kind === 'Standalone' ? null : id, code,
  orderId: kind === 'Order' ? O1 : null, orderCode: kind === 'Order' ? 'S-1' : null, customerId: C1, customerName: 'Acme',
  warehouseId: 'w1', warehouseName: 'Merkez', deliveryDate: '2026-11-03', status, lineCount: 1, createdAt: '2026-11-03T08:00:00Z',
  hasSalesInvoice: false, invoiceId: null, invoiceCode: null, invoiceStatus: null, ...extra,
});
const rows = () => [
  row(D1, 'IRS-1', 'Order', 'Posted'),
  row(D2, 'IRS-2', 'Order', 'Posted', { hasSalesInvoice: true, invoiceId: I1, invoiceCode: 'F-1', invoiceStatus: 'Voided' }),
  row(D3, 'SI-3', 'Standalone', 'Draft'),
];
const view = (id: string, code: string, extra: Record<string, unknown> = {}) => ({
  id, code, orderId: O1, orderCode: 'S-1', warehouseId: 'w1', warehouseName: 'Merkez', deliveryDate: '2026-11-03', status: 'Posted', createdAt: '2026-11-03T08:00:00Z',
  hasSalesInvoice: false, invoiceStatus: null, invoiceId: null,
  lines: [{ orderLineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli', unitCode: 'ADET', quantity: 4, unitPrice: 100, discountPercent: 0, vatPercent: 20, currencyCode: 'TRY' }],
  ...extra,
});

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/sales/deliveries/all') {
      const unbilled = query(url).get('unbilledOnly') === 'true';
      return page(rows().filter((item) => !unbilled || (item.status === 'Posted' && !item.hasSalesInvoice)));
    }
    if (path === `/api/sales/deliveries/${D1}`) return view(D1, 'IRS-1');
    if (path === `/api/sales/deliveries/${D2}`) return view(D2, 'IRS-2', { hasSalesInvoice: true, invoiceStatus: 'Voided', invoiceId: I1 });
    if (path === '/api/sales/invoices/custom-fields') return [];
  } else if (method === 'POST' && path === `/api/sales/deliveries/${D1}/invoice`) {
    return { id: I1, code: 'F-9', status: 'Posted' };
  } else if (method === 'POST' && path === `/api/sales/deliveries/${D1}/void`) {
    return null;
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); h.listen(); });
afterEach(() => { h.reset(); cleanup(); });

const openDelivery = async (code: string) => {
  await h.selectRow(code);
  await waitFor(() => expect(h.command('open').getAttribute('aria-disabled')).not.toBe('true'), T);
  fireEvent.click(h.command('open'));
  return h.dialog(new RegExp(`Satış irsaliyesi · ${code}`));
};

describe('Satış İrsaliyeleri standart tanımı', { timeout: 30000 }, () => {
  it('is a v1 preview standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 1, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('lists both kinds from the unified endpoint; Faturalanmamış filters to unbilled', async () => {
    h.setup();
    await screen.findByText('SI-3', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    expect(query(h.gets('/api/sales/deliveries/all')[0].url).get('pageSize')).toBe('25');
    expect(screen.getAllByText('Siparişsiz').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Siparişli').length).toBeGreaterThan(0);
    const metric = await screen.findByRole('button', { name: /Faturalanmamış/ }, T);
    await waitFor(() => expect(metric.textContent).toContain('1'), T);
    fireEvent.click(metric);
    await waitFor(() => expect(query(h.lastGet('/api/sales/deliveries/all').url).get('unbilledOnly')).toBe('true'), T);
  });

  it('a standalone row does not open here: Aç is disabled and İşlemler offers the legacy screen', async () => {
    h.setup();
    await h.selectRow('SI-3');
    await waitFor(() => expect(h.command('open').getAttribute('aria-disabled')).toBe('true'), T);
    const standalone = await h.menuAfter('/api/sales/deliveries/all');
    expect(standalone.some((item) => item.startsWith('Eski ekranda aç'))).toBe(true);
    expect(standalone).not.toContain('İptal et');
    fireEvent.click(await h.menuItem(/Eski ekranda aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-delivery-create', params: { customerId: C1 } });
    expect(h.gets(`/api/sales/deliveries/${D3}`)).toEqual([]);
  });

  it('Faturalaştır posts the invoice form with the nested e-document fields', async () => {
    h.setup();
    const opened = await openDelivery('IRS-1');
    await waitFor(() => expect(opened.textContent).toContain('STK-1'), T);
    fireEvent.click(within(opened).getByRole('tab', { name: /Fatura İşlemleri/ }));
    fireEvent.change(await within(opened).findByLabelText('Alıcı e-Fatura etiketi', {}, T), { target: { value: 'urn:mail:a@b.test' } });
    fireEvent.click(within(opened).getByRole('button', { name: 'Faturalaştır' }));
    await h.confirm('“IRS-1” için satış faturası');
    await h.waitWrites(1);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/sales/deliveries/${D1}/invoice` });
    const body = JSON.parse(h.writes()[0].body!);
    expect(body).toMatchObject({ invoiceType: 'Wholesale', eDocument: { recipientAlias: 'urn:mail:a@b.test' } });
    expect(Object.keys(body).filter((key) => key.includes('.'))).toEqual([]);
  });

  it('İptal et is offered only to an admin, and the row invoice link shows only with an invoice', async () => {
    h.setup('TenantUser');
    await h.selectRow('IRS-1');
    await waitFor(() => expect(h.command('open').getAttribute('aria-disabled')).not.toBe('true'), T);
    expect(h.menuItems()).not.toContain('İptal et');
    cleanup();
    h.setup();
    await h.selectRow('IRS-1');
    expect(await h.menuAfter(`/api/sales/deliveries/${D1}`)).toContain('İptal et');
    const invoiced = screen.getAllByRole('row').find((item) => within(item).queryByText('IRS-2'))!;
    fireEvent.click(within(invoiced).getByRole('button', { name: 'Faturayı aç' }));
    await waitFor(() => expect(h.state.navigations.some((item) => item.page === 'sales-invoices')).toBe(true), T);
    expect(h.state.navigations.find((item) => item.page === 'sales-invoices')).toMatchObject({ params: { invoiceId: I1 } });
    const plain = screen.getAllByRole('row').find((item) => within(item).queryByText('IRS-1'))!;
    expect(within(plain).queryByRole('button', { name: 'Faturayı aç' })).toBeNull();
  });
});
