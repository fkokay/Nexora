import { Suspense } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePageRouter } from '../WorkspacePageRouter';
import { useSystemPageMap } from './useSystemPageMap';
import { setPageParams } from '../pageNavigation';
import type * as AppTypes from '../erp-types';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));
vi.mock('../CustomersPage', () => ({ CustomersPage: ({ initialEdit }: { initialEdit?: boolean }) => <div>{initialEdit ? 'Eski cari düzenleme' : 'Eski cari ekranı'}</div> }));

const tenant = { id: 't1', name: 'Firma', role: 'TenantAdmin' } as unknown as AppTypes.Tenant;
const noop = () => {};

function Harness({ page = 'customer-edit' }: { page?: string }) {
  const systemPages = useSystemPageMap('tok', 't1');
  return <Suspense fallback={<div>Suspense…</div>}>
    <WorkspacePageRouter page={page} token="tok" tenant={tenant} locale="tr" platformStatus="" selectedModuleMenu={null}
      pendingCustomerInvoiceId={null} initialCustomerSearch="" onOpenSalesInvoice={noop} onOpenPurchaseInvoices={noop}
      onInitialInvoiceOpened={noop} pendingPurchaseSupplier={null} onInitialSupplierOpened={noop} onNavigate={noop}
      onLocaleChange={noop} onThemeChange={noop} requestApi={api as never} onOpenStudio={noop} onDevelopModuleStarter={noop}
      systemPages={systemPages} />
  </Suspense>;
}

const definitionJson = JSON.stringify({ schemaVersion: 2, components: [{ id: 'h', type: 'heading', props: { text: 'Kart {{sayfa.parametre.customerId}}' } }], queries: [] });
const aliasRuntime = {
  screens: { 'customer-create': { mode: 'standard', revision: 1 } },
  aliases: { 'customer-edit': { screenKey: 'customer-create', param: 'customerId' } },
};

function mockServer(runtime: unknown) {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint === '/api/system-pages/runtime') return runtime;
    if (endpoint === '/api/system-pages/customer-create/published')
      return { id: 'p1', code: '@customer-create', name: 'Cari kart', description: null, revision: 1, forms: [], rights: { view: true }, definitionJson, screenKey: 'customer-create', source: 'standard', standardVersion: 1 };
    throw new Error(`unexpected ${endpoint}`);
  });
}

afterEach(() => { cleanup(); api.mockReset(); setPageParams('customer-edit', {}); setPageParams('customer-create', {}); });

describe('system page aliases (E7)', () => {
  it('opens the target system page in the alias tab with the alias tab params', async () => {
    setPageParams('customer-edit', { customerId: 'c-1' });
    mockServer(aliasRuntime);
    render(<Harness />);
    // İlk testte tembel yüklenen sayfa modülü derlenir.
    expect(await screen.findByText('Kart c-1', {}, { timeout: 15000 })).toBeTruthy();
    expect(screen.queryByText('Eski cari düzenleme')).toBeNull();
  });

  it('a restored alias tab without its param stays on the legacy screen', async () => {
    mockServer(aliasRuntime);
    render(<Harness />);
    expect(await screen.findByText('Eski cari düzenleme')).toBeTruthy();
    expect(api).not.toHaveBeenCalledWith('/api/system-pages/customer-create/published', 'tok');
  });

  it('waits for the map, then renders legacy when the runtime has no alias or its target is not mapped', async () => {
    setPageParams('customer-edit', { customerId: 'c-1' });
    mockServer({ screens: { 'customer-create': { mode: 'standard', revision: 1 } } });
    const first = render(<Harness />);
    expect(screen.getByText('Sayfa yükleniyor…')).toBeTruthy();
    expect(await screen.findByText('Eski cari düzenleme')).toBeTruthy();
    first.unmount();
    mockServer({ screens: {}, aliases: aliasRuntime.aliases });
    render(<Harness />);
    expect(await screen.findByText('Eski cari düzenleme')).toBeTruthy();
  });

  it('Eski ekranda aç on the alias switches the target key to legacy', async () => {
    setPageParams('customer-edit', { customerId: 'c-1' });
    mockServer(aliasRuntime);
    render(<Harness />);
    await screen.findByText('Kart c-1', {}, { timeout: 15000 });
    fireEvent.click(screen.getByRole('button', { name: 'Eski ekranda aç' }));
    expect(await screen.findByText('Eski cari düzenleme')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Yeni tasarıma dön/ }));
    expect(await screen.findByText('Kart c-1')).toBeTruthy();
  });
});
