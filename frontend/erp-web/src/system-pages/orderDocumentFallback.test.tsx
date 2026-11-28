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
const INVOICE_KEY = 'sales-invoice-document';
const OLD_INVOICE_KEY = 'sales-invoice-create';
const OLD_VOUCHER_KEY = 'finance-journal-vouchers';
const VOUCHER_DOCUMENT_KEY = 'finance-journal-voucher-document';
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

afterEach(() => { cleanup(); setPageParams(KEY, {}); setPageParams('sales-orders', {}); setPageParams(QUOTE_KEY, {}); setPageParams('sales-quote-create', {}); setPageParams(INVOICE_KEY, {}); setPageParams(OLD_INVOICE_KEY, {}); setPageParams(OLD_VOUCHER_KEY, {}); setPageParams(VOUCHER_DOCUMENT_KEY, {}); setPageParams('sales-invoices', {}); });

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

describe('Belge fatura kartı açık değilse', () => {
  it('kimlikli istek fatura listesine Belge sayfasını tetiklemeyen bir parametreyle döner ve bu sekme kapanır', async () => {
    const closed: string[] = [];
    const onClose = (event: Event) => closed.push((event as CustomEvent<{ page: string }>).detail.page);
    window.addEventListener(CLOSE_PAGE_EVENT, onClose);
    try {
      setPageParams(INVOICE_KEY, { id: 'i1' });
      const onNavigate = vi.fn();
      show(onNavigate, INVOICE_KEY);
      await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-invoices'));
      expect(pageParamsOf('sales-invoices')).toEqual({ belgeFaturaId: 'i1' });
      expect(closed).toContain(INVOICE_KEY);
      expect(onNavigate).not.toHaveBeenCalledWith(INVOICE_KEY);
    } finally { window.removeEventListener(CLOSE_PAGE_EVENT, onClose); }
  });

  it('kimliksiz istek eski Yeni fatura ekranını açar', async () => {
    const onNavigate = vi.fn();
    show(onNavigate, INVOICE_KEY);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-invoices'));
  });
});

describe('Eski yeni fatura anahtarı', () => {
  it('boş fatura Belgesine yönlenir ve eski sekmeyi kapatır', async () => {
    const closed: string[] = [];
    const onClose = (event: Event) => closed.push((event as CustomEvent<{ page: string }>).detail.page);
    window.addEventListener(CLOSE_PAGE_EVENT, onClose);
    try {
      const onNavigate = vi.fn();
      show(onNavigate, OLD_INVOICE_KEY);
      await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(INVOICE_KEY));
      expect(closed).toContain(OLD_INVOICE_KEY);
    } finally { window.removeEventListener(CLOSE_PAGE_EVENT, onClose); }
  });
});

describe('Eski yevmiye fişi anahtarı', () => {
  it('boş yevmiye Belgesine yönlenir ve eski sekmeyi kapatır', async () => {
    const closed: string[] = [];
    const onClose = (event: Event) => closed.push((event as CustomEvent<{ page: string }>).detail.page);
    window.addEventListener(CLOSE_PAGE_EVENT, onClose);
    try {
      const onNavigate = vi.fn();
      show(onNavigate, OLD_VOUCHER_KEY);
      await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(VOUCHER_DOCUMENT_KEY));
      expect(closed).toContain(OLD_VOUCHER_KEY);
    } finally { window.removeEventListener(CLOSE_PAGE_EVENT, onClose); }
  });
});
