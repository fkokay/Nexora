import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import FixedAssetsPage from '../FixedAssetsPage';

const asset = (id: string, code: string, name: string, status = 'Active') => ({
  id, assetCode: code, name, category: 'Makine', acquisitionDate: '2025-01-01', inServiceDate: '2025-01-01', acquisitionCostBase: 120000,
  residualValueBase: 0, usefulLifeMonths: 60, accumulatedDepreciationBase: 20000, status, supplierAccountId: null, sourceReference: null,
  purchaseInvoiceId: null, rowVersion: 'AA==', vukTaxYear: null, vukDepreciationLowerLimitTry: null, vukCommuniqueNumber: null, vukSourceUrl: null,
  vukUsefulLifeCode: null, vukUsefulLifeDescription: null, vukUsefulLifeTableYear: null, vukUsefulLifeCommuniqueNumber: null,
  vukUsefulLifeMonths: null, vukNormalDepreciationRatePercent: null, vukTaxDepreciationStartDate: null,
});
const assets = [asset('a1', 'DV-0001', 'Dolum makinesi'), asset('a2', 'DV-0002', 'Eski makine', 'Disposed')];
const fields = [['assetCode', 'Kıymet kodu'], ['name', 'Kıymet'], ['acquisitionCostBase', 'Edinim maliyeti'], ['status', 'Durum'], ['actions', 'İşlemler']]
  .map(([key, label], position) => ({ key, label, visible: true, position, fixed: key === 'actions' }));

function respond(url: string): { status: number; body: unknown } {
  const path = url.split('?')[0];
  const ok = (body: unknown) => ({ status: 200, body });
  if (path === '/api/screen-views/fixed-assets/active') return ok({ id: null, fields });
  if (path.startsWith('/api/screen-views/')) return ok({ fields: [] });
  if (path === '/api/fixed-assets') return ok({ items: assets, page: 1, pageSize: 200, totalCount: assets.length });
  if (/\/depreciation-schedule$/.test(path)) return ok({ assetId: 'a1', method: 'StraightLine', currencyBasis: 'Base', acquisitionCostBase: 120000, residualValueBase: 0, accumulatedDepreciationBase: 20000, rows: [] });
  if (/\/(disposal|tax-depreciation-schedule)$/.test(path)) return { status: 404, body: {} };
  if (/\/acquisition-posting$/.test(path)) return ok({ assetId: 'a1', purchaseInvoiceCode: null, journalEntryId: null, entryDate: null, lines: [] });
  if (/\/assignments$/.test(path)) return ok([]);
  return ok([]);
}

const writes: Array<{ method: string; path: string; body: unknown }> = [];

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      writes.push({ method, path: url.split('?')[0], body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify(asset('a9', 'DV-0099', 'Yeni')), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const { status, body } = respond(url);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  writes.length = 0;
  localStorage.clear();
});

function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const reason = (id: string) => command(id).getAttribute('title') ?? '';
function openMenu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}

describe('Duran Varlıklar register', () => {
  it('has no row menu; the panel buttons are in İşlemler; Yeni opens the acquisition form', async () => {
    renderScreen(<FixedAssetsPage token="t" locale="tr" />);
    await screen.findByText('Dolum makinesi');
    expect(screen.getByRole('heading', { name: 'Duran Varlıklar' })).toBeTruthy();
    expect(document.querySelector('.sales-row-menu-trigger, [aria-haspopup="menu"][aria-label*="DV-0001"]')).toBeNull();
    expect(within(screen.getByText('Dolum makinesi').closest('tr')!).getByText('Etkin').className).toContain('nx-status-tag is-ok');
    // Nothing is current until the user picks a row.
    await waitFor(() => expect(reason('open')).toBe('Önce bir kayıt seçin'));
    expect(screen.getByText('Özetini görmek için bir kıymet seçin.')).toBeTruthy();
    fireEvent.click(within(screen.getByText('Dolum makinesi').closest('tr')!).getByText('Etkin'));
    await screen.findByText('Aylık amortisman');
    await waitFor(() => expect(openMenu()).toEqual(['Amortismanı kaydet', 'Zimmetle', 'Elden çıkar', 'CSV olarak dışa aktar']));
    expect(screen.queryByRole('button', { name: 'Amortismanı kaydet' })).toBeNull();
    expect(enabled('delete')).toBe(false);
    expect(reason('delete')).toBe("Kıymet silinemez; İşlemler'den elden çıkarın.");
    // A disposed asset offers no workflow.
    fireEvent.click(within(screen.getByText('Eski makine').closest('tr')!).getByText('Elden çıkarıldı'));
    await waitFor(() => expect(openMenu()).toEqual(['CSV olarak dışa aktar']));
    await act(async () => {
      fireEvent.click(command('new'));
    });
    expect(await screen.findByRole('heading', { name: 'Edinim kaydı oluştur' })).toBeTruthy();
  });

  it('Edinim kaydı: the POST body', async () => {
    renderScreen(<FixedAssetsPage token="t" locale="tr" />);
    await screen.findByText('Dolum makinesi');
    await waitFor(() => expect(enabled('new')).toBe(true));
    await act(async () => {
      fireEvent.click(command('new'));
    });
    await screen.findByRole('heading', { name: 'Edinim kaydı oluştur' });
    const field = (label: string) => screen.getByLabelText(label, { exact: false, selector: 'input' }) as HTMLInputElement;
    fireEvent.change(field('Kıymet kodu'), { target: { value: 'DV-0100' } });
    fireEvent.change(field('Ad'), { target: { value: 'Paketleme robotu' } });
    fireEvent.change(field('Kategori'), { target: { value: 'Makine' } });
    fireEvent.change(field('Edinim tarihi'), { target: { value: '2026-10-01' } });
    fireEvent.change(field('Kullanıma giriş'), { target: { value: '2026-10-15' } });
    const form = field('Kıymet kodu').closest('form')!;
    const numbers = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    // Field order on the form: useful life (months), acquisition cost, residual value.
    numbers.forEach((input, index) => fireEvent.change(input, { target: { value: String([60, 96000, 6000][index] ?? input.value) } }));
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe('POST');
    expect(writes[0].path).toBe('/api/fixed-assets');
    expect(writes[0].body).toEqual({
      assetCode: 'DV-0100', name: 'Paketleme robotu', category: 'Makine', acquisitionDate: '2026-10-01', inServiceDate: '2026-10-15',
      acquisitionCostBase: 96000, residualValueBase: 6000, usefulLifeMonths: 60, sourceReference: null, supplierAccountId: null, purchaseInvoiceId: null,
    });
  });
});
