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
const QUOTE_KEY = 'sales-quote-document';
const tenant = { id: 't1', name: 'Firma', role: 'TenantAdmin' } as unknown as AppTypes.Tenant;
const noop = () => {};

function show(onNavigate: (page: string) => void, page = KEY) {
  return render(<Suspense fallback={null}>
    <WorkspacePageRouter page={page} token="tok" tenant={tenant} locale="tr" platformStatus="" selectedModuleMenu={null}
      pendingCustomerInvoiceId={null} initialCustomerSearch="" onOpenSalesInvoice={noop} onOpenPurchaseInvoices={noop}
      onInitialInvoiceOpened={noop} pendingPurchaseSupplier={null} onInitialSupplierOpened={noop} onNavigate={onNavigate}
      onLocaleChange={noop} onThemeChange={noop} requestApi={api as never} onOpenStudio={noop} onDevelopModuleStarter={noop}
      systemPages={{ status: 'ready', screens: {}, aliases: {}, legacy: new Set(), openLegacy: noop, closeLegacy: noop, dropScreen: noop } as never} />
  </Suspense>);
}

afterEach(() => { cleanup(); setPageParams(KEY, {}); setPageParams('sales-orders', {}); setPageParams(QUOTE_KEY, {}); setPageParams('sales-quote-create', {}); });

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

  it('kimliksiz istek sipariş listesini açar', async () => {
    const onNavigate = vi.fn();
    show(onNavigate);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-orders'));
  });
});

describe('Belge teklif kartı açık değilse', () => {
  it('kimlikli teklif eski teklif kartında quoteId ile açılır, bu sekme kapanır ve Belge sayfasına dönülmez', async () => {
    const closed: string[] = [];
    const onClose = (event: Event) => closed.push((event as CustomEvent<{ page: string }>).detail.page);
    window.addEventListener(CLOSE_PAGE_EVENT, onClose);
    try {
      setPageParams(QUOTE_KEY, { id: 'q1' });
      const onNavigate = vi.fn();
      show(onNavigate, QUOTE_KEY);
      await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-quote-create'));
      expect(pageParamsOf('sales-quote-create')).toEqual({ quoteId: 'q1' });
      expect(closed).toContain(QUOTE_KEY);
      expect(onNavigate).not.toHaveBeenCalledWith(QUOTE_KEY);
    } finally { window.removeEventListener(CLOSE_PAGE_EVENT, onClose); }
  });

  it('kimliksiz istek eski Yeni teklif ekranını açar', async () => {
    const onNavigate = vi.fn();
    show(onNavigate, QUOTE_KEY);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-quote-create'));
  });
});
