import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import ForeignTradePage from '../ForeignTradePage';
import { tradeStatusTone } from './tradeStatus';

const tradeCase = (id: string, referenceCode: string, status: string) => ({
  id, direction: 'Export', status, purchaseOrderId: null, salesOrderId: 'so1', referenceCode, originCountryCode: 'TR', destinationCountryCode: 'DE',
  incotermsCode: 'FOB', harmonizedSystemCode: null, transportMode: 'Road', carrierReference: null, customsReference: null, declaredValue: 1000,
  currencyCode: 'EUR', plannedShipDate: null, actualShipDate: null, plannedArrivalDate: null, actualArrivalDate: null, notes: null,
  updatedAt: '2026-11-10T10:00:00Z', inventoryPostingRequired: false, purchaseReceiptId: null, salesDeliveryId: null, inventoryDocumentLinkedAt: null,
});
const cases = [tradeCase('c1', 'IHR-001', 'Draft'), tradeCase('c2', 'IHR-002', 'Shipped')];
const calls: Array<{ url: string; method: string }> = [];

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/foreign-trade/cases') return { items: cases, total: cases.length };
  if (path === '/api/foreign-trade/capabilities') return { canCreate: true, canUpdate: true, canAdvance: true };
  if (path.startsWith('/api/screen-views/')) return { id: null, fields: [] };
  if (path.endsWith('/transition')) return cases[0];
  return [];
}

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    return new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
  calls.length = 0;
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
const reason = (id: string) => command(id).getAttribute('title') ?? '';
function openMenu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  return items;
}

describe('Dış Ticaret frame', () => {
  it('moves create, edit and cancel to the action bar and keeps their conditions', async () => {
    renderScreen(<ForeignTradePage token="t" />);
    await screen.findAllByText('IHR-001');
    const cell = screen.getAllByText('IHR-001').find((node) => node.closest('tr'))!;
    expect(within(cell.closest('tr')!).getByText('Taslak').className).toContain('nx-status-tag is-info');
    expect(screen.queryByRole('button', { name: 'İhracat dosyası' })).toBeNull();
    // The panel no longer carries Düzenle / İptal et.
    expect(screen.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    // The first visible case is selected by default (unchanged behaviour).
    await waitFor(() => expect(command('open').getAttribute('aria-disabled')).not.toBe('true'));
    expect(reason('delete')).toBe("Dosya silinemez; İşlemler'den iptal edin.");
    const items = openMenu();
    expect(items).toEqual(['İthalat dosyası', 'İhracat dosyası', 'İptal et']);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'İptal et' }));
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Dosya iptal edilsin mi? Bu işlem geri alınamaz.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Evet, iptal et' }));
    });
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url.includes('/cases/c1/'))).toBe(true));
  });

  it('a shipped case cannot be edited or cancelled', async () => {
    renderScreen(<ForeignTradePage token="t" />);
    await screen.findAllByText('IHR-001');
    fireEvent.click(screen.getAllByText('IHR-002').find((node) => node.closest('tr'))!);
    await waitFor(() => expect(reason('open')).toBe('Yalnız Taslak ve Planlandı dosyalar düzenlenebilir'));
    expect(openMenu()).toEqual(['İthalat dosyası', 'İhracat dosyası']);
  });

  it('status tones', () => {
    expect(tradeStatusTone('Closed')).toBe('ok');
    expect(tradeStatusTone('CustomsClearance')).toBe('warn');
    expect(tradeStatusTone('Cancelled')).toBe('off');
  });
});
