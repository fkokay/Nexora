import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePageRouter } from '../WorkspacePageRouter';
import { useSystemPageMap } from './useSystemPageMap';
import { navigationTarget, runNavigation } from '../custom-page/navigationActions';
import { OPEN_PAGE_EVENT, pageParamsOf, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';
import type * as AppTypes from '../erp-types';

// E-L: erpPage `legacy: true` sets the target tab's page params and opens that key's legacy screen, also when the key has
// a system page and is the current page.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));
vi.mock('../InventoryWarehousesPage', async () => {
  const { usePageParams } = await import('../pageNavigation');
  return { default: () => <div>Eski depo ekranı {usePageParams('inventory-warehouses').warehouseId ?? '-'}</div> };
});

const KEY = 'inventory-warehouses';
const tenant = { id: 't1', name: 'Firma', role: 'TenantAdmin' } as unknown as AppTypes.Tenant;
const noop = () => {};
const button = { id: 'b1', type: 'button', props: { text: 'Eski ekranda düzenle', actionType: 'erpPage', pageKey: KEY, legacy: true, params: ['warehouseId=w1'] } };
const definitionJson = JSON.stringify({ schemaVersion: 2, components: [{ id: 'h', type: 'heading', props: { text: 'Depo başlığı' } }, button], queries: [] });

function Harness() {
  const systemPages = useSystemPageMap('tok', 't1');
  return <Suspense fallback={<div>Suspense…</div>}>
    <WorkspacePageRouter page={KEY} token="tok" tenant={tenant} locale="tr" platformStatus="" selectedModuleMenu={null}
      pendingCustomerInvoiceId={null} initialCustomerSearch="" onOpenSalesInvoice={noop} onOpenPurchaseInvoices={noop}
      onInitialInvoiceOpened={noop} pendingPurchaseSupplier={null} onInitialSupplierOpened={noop} onNavigate={noop}
      onLocaleChange={noop} onThemeChange={noop} requestApi={api as never} onOpenStudio={noop} onDevelopModuleStarter={noop}
      systemPages={systemPages} />
  </Suspense>;
}
function mockServer() {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint === '/api/system-pages/runtime') return { screens: { [KEY]: { mode: 'standard', revision: 1 } } };
    if (endpoint === `/api/system-pages/${KEY}/published`)
      return { id: 'p1', code: `@${KEY}`, name: 'Depo Yönetimi', description: null, revision: 1, forms: [], rights: { view: true }, definitionJson, screenKey: KEY, source: 'standard', standardVersion: 1 };
    throw new Error(`unexpected ${endpoint}`);
  });
}

afterEach(() => { cleanup(); api.mockReset(); setPageParams(KEY, {}); });

describe('erpPage legacy flag', () => {
  it('navigationTarget carries legacy only for erpPage with legacy: true', () => {
    expect(navigationTarget({ actionType: 'erpPage', pageKey: KEY, legacy: true, params: ['a=1'] }, {})).toEqual({ kind: 'workspace', page: KEY, params: { a: '1' }, replace: true, legacy: true });
    expect(navigationTarget({ actionType: 'erpPage', pageKey: KEY, legacy: 'yes' }, {})).toEqual({ kind: 'workspace', page: KEY, params: {}, replace: true });
    expect(navigationTarget({ actionType: 'page', pageCode: `@${KEY}`, legacy: true }, {})).toEqual({ kind: 'workspace', page: KEY, params: {}, replace: true });
  });

  it('runNavigation sends the legacy request with the params', async () => {
    const seen: WorkspaceOpenRequest[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent<WorkspaceOpenRequest>).detail);
    window.addEventListener(OPEN_PAGE_EVENT, listener);
    try {
      await runNavigation({ actionType: 'erpPage', pageKey: KEY, legacy: true, params: ['warehouseId=w1'] }, () => ({}), 'from-tab');
    } finally { window.removeEventListener(OPEN_PAGE_EVENT, listener); }
    expect(seen).toEqual([{ page: KEY, params: { warehouseId: 'w1' }, replace: true, from: 'from-tab', legacy: true }]);
    expect(pageParamsOf(KEY)).toEqual({ warehouseId: 'w1' });
  });

  it('a button on the system page opens its own key legacy screen with the params; Geri returns to the system page', async () => {
    mockServer();
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Eski ekranda düzenle' }));
    expect(await screen.findByText('Eski depo ekranı w1')).toBeTruthy();
    expect(screen.queryByText('Depo başlığı')).toBeNull();
    expect(screen.getByText('Eski ekran görüntüleniyor.')).toBeTruthy();
  });

  it('without the flag the same navigation stays on the system page', async () => {
    mockServer();
    render(<Harness />);
    await screen.findByText('Depo başlığı');
    await act(async () => { await runNavigation({ actionType: 'erpPage', pageKey: KEY, params: ['warehouseId=w2'] }, () => ({}), KEY); });
    expect(await screen.findByText('Depo başlığı')).toBeTruthy();
    expect(screen.queryByText(/Eski depo ekranı/)).toBeNull();
  });
});
