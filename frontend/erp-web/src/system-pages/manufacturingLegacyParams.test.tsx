import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import { pageParamsOf, setPageParams } from '../pageNavigation';
import ManufacturingRecipeCreatePage from '../ManufacturingRecipeCreatePage';

// G-U20: Reçete listesi sistem sayfası eski reçete kartını `bomId` sayfa parametresiyle açar (erpPage `params` +
// `legacyScreen`); eski kart reçeteler yüklenince o reçeteyi düzenlemede açar ve yalnız bu parametreyi sekmeden siler.

const KEY = 'manufacturing-recipe-create';
const bom = (id: string, code: string) => ({
  id, code, name: `${code} reçetesi`, productStockItemId: 'st1', productName: 'Domates salçası 830 g', productTrackingMode: 'None',
  outputQuantity: 1, isActive: true, orderCount: 0, rowVersion: 'AA==',
  lines: [{ componentStockItemId: 's1', componentName: 'Domates', quantity: 2, scrapPercent: 5, standardUnitCostBase: 4 }],
  operations: [],
});

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/manufacturing/boms/') return [bom('b1', 'RC-014'), bom('b2', 'RC-009')];
  if (path === '/api/manufacturing/work-centers/') return [];
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D03', name: 'Üretim Deposu', isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.startsWith('/api/stock/items'))
    return {
      items: [
        { id: 'st1', code: 'MAM-01', name: 'Domates salçası 830 g', unitCode: 'AD', trackingMode: 'None', isActive: true },
        { id: 's1', code: 'HMD-01', name: 'Domates', unitCode: 'KG', trackingMode: 'None', isActive: true },
      ],
      pageSize: 100,
      totalCount: 2,
    };
  return [];
}

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../authApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../authApi')>()), authenticatedFetch: fetchMock }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  fetchMock.mockImplementation(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  fetchMock.mockClear();
  setPageParams(KEY, {});
  sessionStorage.clear();
  localStorage.clear();
});

const T = { timeout: 10000 };
function renderScreen(view: ReactNode) {
  return render(
    <StrictMode>
      <CommandProvider>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
        <ConfirmDialogHost />
      </CommandProvider>
    </StrictMode>,
  );
}

describe('eski reçete kartı bomId sayfa parametresi (G-U20)', { timeout: 30000 }, () => {
  it('opens the recipe from bomId for editing and drops only that param', async () => {
    setPageParams(KEY, { bomId: 'b2', other: 'x' });
    renderScreen(<ManufacturingRecipeCreatePage token="t" onNavigate={() => {}} />);
    await screen.findByDisplayValue('RC-009', {}, T);
    expect(document.body.textContent).toContain('Değişiklikleri Kaydet');
    expect(screen.getByDisplayValue('RC-009')).toBeTruthy();
    expect(screen.getByDisplayValue('RC-009 reçetesi')).toBeTruthy();
    expect(pageParamsOf(KEY)).toEqual({ other: 'x' });
  });

  it('an open card re-reads a new bomId', async () => {
    renderScreen(<ManufacturingRecipeCreatePage token="t" onNavigate={() => {}} />);
    expect((await screen.findAllByText('Ürün Reçetesi Tanımlama', {}, T)).length).toBeGreaterThan(0);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/manufacturing/boms/'))).toBe(true), T);
    act(() => setPageParams(KEY, { bomId: 'b1' }));
    await screen.findByDisplayValue('RC-014', {}, T);
    expect(document.body.textContent).toContain('Değişiklikleri Kaydet');
    expect(pageParamsOf(KEY)).toEqual({});
  });

  it('an unknown bomId stays in create mode with an error and is dropped', async () => {
    setPageParams(KEY, { bomId: 'missing' });
    renderScreen(<ManufacturingRecipeCreatePage token="t" onNavigate={() => {}} />);
    expect(await screen.findByText(/Reçete bulunamadı/, {}, T)).toBeTruthy();
    expect(screen.getAllByText('Ürün Reçetesi Tanımlama').length).toBeGreaterThan(0);
    expect(pageParamsOf(KEY)).toEqual({});
  });

  it('without bomId the card opens empty in create mode', async () => {
    renderScreen(<ManufacturingRecipeCreatePage token="t" onNavigate={() => {}} />);
    expect((await screen.findAllByText('Ürün Reçetesi Tanımlama', {}, T)).length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue('RC-014')).toBeNull();
    expect(screen.queryByText(/Reçete bulunamadı/)).toBeNull();
  });
});
