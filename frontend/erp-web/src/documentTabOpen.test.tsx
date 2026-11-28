import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceTabs } from './useWorkspaceTabs';
import { openWorkspacePage, requestClosePage, setPageParams } from './pageNavigation';

// Liste sayfasından "Yeni" ile açılan Belge sekmesi: Türkçe başlıkla açılır, Belge sayfası bu firmada sistem sayfası değilse
// (eski karta yönlenip kendini kapatınca) etkin sekme açan listede kalır ve sekme listede takılı kalmaz.

const DOCUMENT_KEYS: Record<string, { tr: string; en: string }> = {
  'sales-order-document': { tr: 'Sipariş Belgesi', en: 'Sales order document' },
  'sales-quote-document': { tr: 'Teklif Belgesi', en: 'Sales quote document' },
  'purchase-order-document': { tr: 'Satınalma Siparişi Belgesi', en: 'Purchase order document' },
  'inventory-transfer-document': { tr: 'Depo transferi belgesi', en: 'Warehouse transfer document' },
  'finance-journal-voucher-document': { tr: 'Yevmiye Fişi Belgesi', en: 'Journal voucher document' },
  'manufacturing-recipe-document': { tr: 'Üretim reçetesi', en: 'Production recipe' },
};

function workspace(locale: 'tr' | 'en' = 'tr') {
  return renderHook(() => useWorkspaceTabs({
    standaloneStudio: false, embeddedStudioTool: false, tenantId: undefined, platformSession: false, locale, pageResults: [],
    onSelectModule: () => {},
  }));
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { cleanup(); for (const key of [...Object.keys(DOCUMENT_KEYS), 'sales-orders']) setPageParams(key, {}); });

describe('Belge sekmesi', () => {
  for (const [key, titles] of Object.entries(DOCUMENT_KEYS)) {
    it(`${key} listeden yeni sekmede Türkçe ve İngilizce başlıkla açılır, ham anahtarla değil`, () => {
      for (const locale of ['tr', 'en'] as const) {
        const { result, unmount } = workspace(locale);
        act(() => { result.current.setPage('sales-orders'); });
        act(() => { openWorkspacePage({ page: key, params: {}, replace: false, from: 'sales-orders' }); });
        expect(result.current.page).toBe(key);
        expect(result.current.moduleTabs.find((tab) => tab.id === key)?.label).toBe(titles[locale]);
        unmount();
      }
    });
  }

  it('eski karta yönlenip kapanan Belge sekmesi etkin sekmeyi açan listede bırakır ve listede takılı kalmaz', () => {
    const { result } = workspace();
    act(() => { result.current.setPage('customers'); });
    act(() => { result.current.setPage('sales-orders'); });
    act(() => { openWorkspacePage({ page: 'sales-order-document', params: {}, replace: false, from: 'sales-orders' }); });
    expect(result.current.page).toBe('sales-order-document');
    // LegacyDocumentCard'ın etkisi: aynı çizimde önce eski ekrana geçer, sonra kendini kapatır.
    act(() => { result.current.setPage('sales-orders'); requestClosePage('sales-order-document'); });
    expect(result.current.moduleTabs.map((tab) => tab.id)).toEqual(['customers', 'sales-orders']);
    expect(result.current.page).toBe('sales-orders');
  });

  it('listede takılı kalmış Belge sekmesine tıklanınca (setPage) etkinleşir', () => {
    const { result } = workspace();
    act(() => { result.current.setPage('sales-orders'); });
    act(() => { result.current.setPage('sales-order-document'); });
    act(() => { result.current.setPage('sales-orders'); });
    act(() => { result.current.setPage('sales-order-document'); });
    expect(result.current.page).toBe('sales-order-document');
  });
});

describe('Belge sekmesi çalışma alanında (yönlendirici ile)', () => {
  it('Belge sistem sayfası değilse Yeni etkin sekmeyi listede bırakır, Belge sekmesi kapanır', async () => {
    const { Suspense } = await import('react');
    const { render, waitFor } = await import('@testing-library/react');
    const { WorkspacePageRouter } = await import('./WorkspacePageRouter');
    const tenant = { id: 't1', name: 'Firma', role: 'TenantAdmin' } as never;
    const noop = () => {};
    let ws: ReturnType<typeof useWorkspaceTabs> | undefined;
    function Harness() {
      ws = useWorkspaceTabs({ standaloneStudio: false, embeddedStudioTool: false, tenantId: undefined, platformSession: false, locale: 'tr', pageResults: [], onSelectModule: noop });
      return <Suspense fallback={null}>
        <WorkspacePageRouter page={ws.page} token="tok" tenant={tenant} locale="tr" platformStatus="" selectedModuleMenu={null}
          pendingCustomerInvoiceId={null} initialCustomerSearch="" onOpenSalesInvoice={noop} onOpenPurchaseInvoices={noop}
          onInitialInvoiceOpened={noop} pendingPurchaseSupplier={null} onInitialSupplierOpened={noop} onNavigate={ws.setPage}
          onLocaleChange={noop} onThemeChange={noop} requestApi={(async () => ({})) as never} onOpenStudio={noop} onDevelopModuleStarter={noop}
          systemPages={{ status: 'ready', screens: { 'sales-orders': { mode: 'standard', revision: 1 } }, aliases: {}, legacy: new Set(), openLegacy: noop, closeLegacy: noop, dropScreen: noop } as never} />
      </Suspense>;
    }
    render(<Harness />);
    act(() => { ws!.setPage('customers'); });
    act(() => { ws!.setPage('sales-orders'); });
    act(() => { openWorkspacePage({ page: 'sales-order-document', params: {}, replace: false, from: 'sales-orders' }); });
    await waitFor(() => expect(ws!.moduleTabs.map((tab) => tab.id)).not.toContain('sales-order-document'));
    expect(ws!.page).toBe('sales-orders');
  });
});
