import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import SalesDistributionPage from '../SalesDistributionPage';

// Dağıtım planı keeps its plan layout (needs table + selected stock summary); only the frame, bar and colours follow
// the design language (mockup 06: "Yalnızca çerçeve + çubuk + renkler; düzen aynı kalır").

const need = (n: number, uncovered: number) => ({
  stockItemId: `s${n}`, stockCode: `MAM-100${n}`, stockName: `Ürün ${n}`, unitCode: 'ADET',
  openDemand: 800, onHand: 500, activeReserved: 100, available: 400, uncovered, openOrderCount: 3, orders: [],
});
function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'MRK', name: 'Merkez Depo', isActive: true, rowVersion: 'AA' }];
  if (path === '/api/sales/orders/distribution-plan')
    return { items: [need(1, 400), need(2, 0)], page: 1, pageSize: 25, totalCount: 2, method: 'Açık satış siparişleri' };
  return { fields: [] };
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

async function renderPage() {
  render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        <SalesDistributionPage token="t" />
      </KeepAliveViews>
    </CommandProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('Dağıtım planı frame', () => {
  it('keeps the plan layout: needs table and the selected stock summary side by side in one card', async () => {
    await renderPage();
    const panel = screen.getByRole('region', { name: 'Stok ihtiyaçları' });
    const workspace = panel.querySelector('.sales-distribution-workspace')!;
    expect(workspace.querySelector('.sales-distribution-table-wrap')).toBeTruthy();
    expect(within(workspace as HTMLElement).getByRole('complementary', { name: 'Seçili stok özeti' }).textContent).toContain('Ürün 1');
  });

  it('quantity columns are numeric cells (right-aligned, tabular); a shortfall is marked by its class (warning colour + weight), not a <b>', async () => {
    await renderPage();
    const table = document.querySelector<HTMLElement>('.sales-distribution-table-wrap table')!;
    const headers = Array.from(table.querySelectorAll('thead th')).filter((th) => th.classList.contains('nx-num')).map((th) => th.textContent);
    expect(headers).toEqual(['Açık talep', 'Depo mevcudu', 'Rezervasyon', 'Kullanılabilir', 'Açıkta kalan', 'Sipariş']);
    const first = Array.from(table.querySelectorAll('tbody tr'))[0];
    expect(first.querySelectorAll('td.nx-num')).toHaveLength(6);
    const short = first.querySelector('.sales-distribution-short');
    expect(short?.textContent).toBe('400 ADET');
    expect(first.querySelector('td.nx-num b')).toBeNull();
    // No shortfall: plain value.
    const second = Array.from(table.querySelectorAll('tbody tr'))[1];
    expect(second.querySelector('.sales-distribution-short')).toBeNull();
  });
});
