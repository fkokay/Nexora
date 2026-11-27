import { Suspense } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePageRouter } from '../WorkspacePageRouter';
import { CLOSE_PAGE_EVENT, pageParamsOf, setPageParams } from '../pageNavigation';
import type * as AppTypes from '../erp-types';

// Belge sipariş kartı (sales-order-document) bu firmada sistem sayfası değilse siparişin eski kartı açılır.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-order-document';
const tenant = { id: 't1', name: 'Firma', role: 'TenantAdmin' } as unknown as AppTypes.Tenant;
const noop = () => {};

function show(onNavigate: (page: string) => void) {
  return render(<Suspense fallback={null}>
    <WorkspacePageRouter page={KEY} token="tok" tenant={tenant} locale="tr" platformStatus="" selectedModuleMenu={null}
      pendingCustomerInvoiceId={null} initialCustomerSearch="" onOpenSalesInvoice={noop} onOpenPurchaseInvoices={noop}
      onInitialInvoiceOpened={noop} pendingPurchaseSupplier={null} onInitialSupplierOpened={noop} onNavigate={onNavigate}
      onLocaleChange={noop} onThemeChange={noop} requestApi={api as never} onOpenStudio={noop} onDevelopModuleStarter={noop}
      systemPages={{ status: 'ready', screens: {}, aliases: {}, legacy: new Set(), openLegacy: noop, closeLegacy: noop, dropScreen: noop } as never} />
  </Suspense>);
}

afterEach(() => { cleanup(); setPageParams(KEY, {}); setPageParams('sales-orders', {}); });

describe('Belge sipariş kartı açık değilse', () => {
  it('kimlikli sipariş eski listede o siparişin ayrıntısıyla açılır ve bu sekme kapanır', async () => {
    const closed: string[] = [];
    const onClose = (event: Event) => closed.push((event as CustomEvent<{ page: string }>).detail.page);
    window.addEventListener(CLOSE_PAGE_EVENT, onClose);
    try {
      setPageParams(KEY, { id: 'o1' });
      const onNavigate = vi.fn();
      show(onNavigate);
      await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-orders'));
      expect(pageParamsOf('sales-orders')).toEqual({ orderId: 'o1' });
      expect(closed).toContain(KEY);
    } finally { window.removeEventListener(CLOSE_PAGE_EVENT, onClose); }
  });

  it('kimliksiz istek eski Yeni sipariş ekranını açar', async () => {
    const onNavigate = vi.fn();
    show(onNavigate);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-order-create'));
  });
});
