import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePageRouter } from '../WorkspacePageRouter';
import { useSystemPageMap } from './useSystemPageMap';
import { resetSystemPreviewForTests } from '../workspace-storage';
import type * as AppTypes from '../erp-types';
import { openWorkspacePage, pageParamsOf, setPageParams } from '../pageNavigation';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));
vi.mock('../InventoryWarehousesPage', () => ({ default: () => <div>Eski depo ekranı</div> }));
vi.mock('../CrmOpportunitiesPage', () => ({ default: () => <div>Eski fırsat ekranı</div> }));

const KEY = 'inventory-warehouses';
const tenant = { id: 't1', name: 'Firma', role: 'TenantAdmin' } as unknown as AppTypes.Tenant;
const noop = () => {};

function Harness({ page = KEY, tenantId = 't1' }: { page?: string; tenantId?: string }) {
  const systemPages = useSystemPageMap('tok', tenantId);
  return <Suspense fallback={<div>Suspense…</div>}>
    <WorkspacePageRouter page={page} token="tok" tenant={tenant} locale="tr" platformStatus="" selectedModuleMenu={null}
      pendingCustomerInvoiceId={null} initialCustomerSearch="" onOpenSalesInvoice={noop} onOpenPurchaseInvoices={noop}
      onInitialInvoiceOpened={noop} pendingPurchaseSupplier={null} onInitialSupplierOpened={noop} onNavigate={noop}
      onLocaleChange={noop} onThemeChange={noop} requestApi={api as never} onOpenStudio={noop} onDevelopModuleStarter={noop}
      systemPages={systemPages} />
  </Suspense>;
}

const tableDefinition = (queries: unknown[] = []) => JSON.stringify({ schemaVersion: 2, components: [{ id: 'h', type: 'heading', props: { text: 'Depo başlığı' } }], queries });
const published = (source: 'override' | 'standard', definitionJson = tableDefinition()) => ({
  id: 'p1', code: `@${KEY}`, name: 'Depo Yönetimi', description: null, revision: 3, forms: [],
  rights: { view: true }, definitionJson, screenKey: KEY, source, standardVersion: 1,
});
const notFound = () => Object.assign(new Error('Sistem sayfası bulunamadı.'), { status: 404 });

function mockServer(options: { runtime?: unknown; publishedResult?: unknown | (() => never) }) {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint === '/api/system-pages/runtime') {
      if (options.runtime instanceof Error) throw options.runtime;
      return options.runtime;
    }
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      if (typeof options.publishedResult === 'function') return (options.publishedResult as () => never)();
      return options.publishedResult;
    }
    if (endpoint.includes('/queries/')) return { columns: [], rows: [] };
    throw new Error(`unexpected ${endpoint}`);
  });
}

afterEach(() => { cleanup(); api.mockReset(); });

describe('system page routing', () => {
  it('map failure renders legacy', async () => {
    mockServer({ runtime: Object.assign(new Error('boom'), { status: 500 }) });
    render(<Harness />);
    expect(await screen.findByText('Eski depo ekranı')).toBeTruthy();
    expect(api).not.toHaveBeenCalledWith(`/api/system-pages/${KEY}/published`, 'tok');
  });

  it('shows loading for built-in keys until the map arrives', async () => {
    let resolve: (value: unknown) => void = noop;
    api.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<Harness />);
    expect(screen.getByText('Sayfa yükleniyor…')).toBeTruthy();
    expect(screen.queryByText('Eski depo ekranı')).toBeNull();
    await act(async () => { resolve({ screens: {} }); });
    expect(await screen.findByText('Eski depo ekranı')).toBeTruthy();
  });

  it('does not block built-in keys without a standard while the map loads', async () => {
    api.mockImplementation(() => new Promise(() => {}));
    render(<Harness page="crm-opportunities" />);
    expect(await screen.findByText('Eski fırsat ekranı')).toBeTruthy();
    expect(screen.queryByText('Sayfa yükleniyor…')).toBeNull();
  });

  it('falls back to legacy when the map does not arrive within 5 seconds', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      api.mockImplementation((_endpoint: string, _token: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise(() => {});
      });
      render(<Harness />);
      expect(screen.getByText('Sayfa yükleniyor…')).toBeTruthy();
      await act(async () => { vi.advanceTimersByTime(4999); });
      expect(screen.getByText('Sayfa yükleniyor…')).toBeTruthy();
      expect(signal?.aborted).toBe(false);
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(signal?.aborted).toBe(true);
      expect(screen.queryByText('Sayfa yükleniyor…')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    expect(await screen.findByText('Eski depo ekranı')).toBeTruthy();
    expect(api).not.toHaveBeenCalledWith(`/api/system-pages/${KEY}/published`, 'tok');
  });

  it('override key renders system page from system endpoint', async () => {
    mockServer({ runtime: { screens: { [KEY]: { mode: 'override', revision: 3 } } }, publishedResult: published('override') });
    render(<Harness />);
    expect(await screen.findByRole('heading', { name: 'Depo Yönetimi' })).toBeTruthy();
    expect(api).toHaveBeenCalledWith(`/api/system-pages/${KEY}/published`, 'tok');
    expect(screen.queryByText('Eski depo ekranı')).toBeNull();
  });

  it('standard key renders system page', async () => {
    mockServer({ runtime: { screens: { [KEY]: { mode: 'standard', revision: 1 } } }, publishedResult: published('standard') });
    render(<Harness />);
    expect(await screen.findByText('Depo başlığı')).toBeTruthy();
    expect(screen.queryByText('Eski depo ekranı')).toBeNull();
  });

  it('unmapped key renders legacy', async () => {
    mockServer({ runtime: { screens: { 'sales-orders': { mode: 'standard', revision: 1 } } } });
    render(<Harness />);
    expect(await screen.findByText('Eski depo ekranı')).toBeTruthy();
    expect(screen.queryByText('Eski ekran görüntüleniyor.')).toBeNull();
  });

  it('Eski ekranda aç shows legacy with bar and Yeni tasarıma dön returns', async () => {
    mockServer({ runtime: { screens: { [KEY]: { mode: 'override', revision: 3 } } }, publishedResult: published('override') });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Eski ekranda aç' }));
    expect(await screen.findByText('Eski depo ekranı')).toBeTruthy();
    expect(screen.getByText('Eski ekran görüntüleniyor.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yeni tasarıma dön' }));
    expect(await screen.findByRole('heading', { name: 'Depo Yönetimi' })).toBeTruthy();
    expect(screen.queryByText('Eski depo ekranı')).toBeNull();
  });

  it('a navigation with legacy (erpPage legacyScreen) switches that key to the legacy screen and carries the params', async () => {
    mockServer({ runtime: { screens: { [KEY]: { mode: 'override', revision: 3 } } }, publishedResult: published('override') });
    render(<Harness />);
    expect(await screen.findByRole('heading', { name: 'Depo Yönetimi' })).toBeTruthy();
    act(() => openWorkspacePage({ page: 'customers', params: {}, replace: false, legacy: true }));
    expect(screen.queryByText('Eski depo ekranı')).toBeNull();
    act(() => openWorkspacePage({ page: KEY, params: { warehouseId: 'w1' }, replace: true, from: KEY, legacy: true }));
    expect(await screen.findByText('Eski depo ekranı')).toBeTruthy();
    expect(screen.getByText('Eski ekran görüntüleniyor.')).toBeTruthy();
    expect(pageParamsOf(KEY)).toEqual({ warehouseId: 'w1' });
    setPageParams(KEY, {});
  });

  it('stale map 404 falls back to legacy', async () => {
    mockServer({ runtime: { screens: { [KEY]: { mode: 'override', revision: 3 } } }, publishedResult: () => { throw notFound(); } });
    render(<Harness />);
    expect(await screen.findByText('Eski depo ekranı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Eski ekran görüntüleniyor.')).toBeNull();
  });

  it('non-404 failure still offers Eski ekranda aç', async () => {
    mockServer({ runtime: { screens: { [KEY]: { mode: 'override', revision: 3 } } }, publishedResult: () => { throw Object.assign(new Error('Sunucu hatası.'), { status: 500 }); } });
    render(<Harness />);
    expect((await screen.findByRole('alert')).textContent).toContain('Sunucu hatası.');
    fireEvent.click(screen.getByRole('button', { name: 'Eski ekranda aç' }));
    expect(await screen.findByText('Eski depo ekranı')).toBeTruthy();
  });

  it('system page query run uses encoded @ code', async () => {
    const sqlQuery = { id: 'q1', name: 'depolar', kind: 'read', runOn: 'load', parameters: [] };
    mockServer({ runtime: { screens: { [KEY]: { mode: 'override', revision: 3 } } }, publishedResult: published('override', tableDefinition([sqlQuery])) });
    render(<Harness />);
    await waitFor(() => expect(api).toHaveBeenCalledWith(`/api/custom-pages/%40${KEY}/queries/q1/run`, 'tok', expect.anything()));
  });

  it('does not wait for the map on custom-page keys and refetches per tenant', async () => {
    api.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/api/system-pages/runtime') return { screens: {} };
      if (endpoint === '/api/custom-pages/ozel/published') return { ...published('override'), code: 'ozel', name: 'Özel sayfa' };
      throw new Error(`unexpected ${endpoint}`);
    });
    const { rerender } = render(<Harness page="custom-page:ozel" />);
    expect(await screen.findByRole('heading', { name: 'Özel sayfa' })).toBeTruthy();
    rerender(<Harness page="custom-page:ozel" tenantId="t2" />);
    await waitFor(() => expect(api.mock.calls.filter(([endpoint]) => endpoint === '/api/system-pages/runtime')).toHaveLength(2));
  });
});

describe('system page draft preview (Studio ERP önizlemesi)', () => {
  const DRAFT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  afterEach(() => { window.history.replaceState(null, '', '/'); resetSystemPreviewForTests(); });

  it('renders the draft on the built-in screen key, with the preview banner, before the map or the legacy screen', async () => {
    window.history.replaceState(null, '', `/?page=${KEY}&systemPreview=${DRAFT}`);
    resetSystemPreviewForTests();
    api.mockImplementation(async (endpoint: string) => {
      if (endpoint === `/api/custom-pages/${DRAFT}/preview`) return { ...published('override'), id: DRAFT, name: 'Depo Yönetimi' };
      if (endpoint === '/api/system-pages/runtime') return new Promise(() => {});
      if (endpoint.includes('/queries/')) return { columns: [], rows: [] };
      throw new Error(`unexpected ${endpoint}`);
    });
    render(<Harness />);
    expect(await screen.findByText('Depo başlığı')).toBeTruthy();
    expect(screen.getByText('Studio taslak önizlemesi')).toBeTruthy();
    expect(screen.queryByText('Eski depo ekranı')).toBeNull();
    expect(api).not.toHaveBeenCalledWith(`/api/system-pages/${KEY}/published`, 'tok', expect.anything());
    // A draft preview has no legacy fallback link (it would not leave the preview).
    expect(screen.queryByRole('button', { name: 'Eski ekranda aç' })).toBeNull();
  });

  it('applies only to the screen key it was opened for', async () => {
    window.history.replaceState(null, '', `/?page=${KEY}&systemPreview=${DRAFT}`);
    resetSystemPreviewForTests();
    api.mockImplementation(() => new Promise(() => {}));
    render(<Harness page="crm-opportunities" />);
    expect(await screen.findByText('Eski fırsat ekranı')).toBeTruthy();
  });
});
