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
const calls: Array<{ url: string; method: string; body?: unknown }> = [];
/** Overrides the case page (e.g. a full first page of 100). */
let casePage: { items: unknown[]; total: number } | null = null;
/** While set, /transition requests wait for it (a running step). */
let hold: Promise<void> | null = null;

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/foreign-trade/cases') return casePage ?? { items: cases, total: cases.length };
  if (path === '/api/foreign-trade/capabilities') return { canCreate: true, canUpdate: true, canAdvance: true };
  if (path.startsWith('/api/screen-views/')) return { id: null, fields: [] };
  if (path.endsWith('/transition')) return cases[0];
  if (path.endsWith('/inventory-documents'))
    return [{ id: 'd1', code: 'IRS-0042', documentDate: '2026-11-09', warehouseName: 'Merkez Depo', lineCount: 3, isLinked: false }];
  return [];
}

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/transition') && hold) await hold;
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
  casePage = null;
  hold = null;
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
    renderScreen(<ForeignTradePage token="t" role="TenantAdmin" />);
    await screen.findAllByText('IHR-001');
    const cell = screen.getAllByText('IHR-001').find((node) => node.closest('tr'))!;
    expect(within(cell.closest('tr')!).getByText('Taslak').className).toContain('nx-status-tag is-info');
    expect(screen.queryByRole('button', { name: 'İhracat dosyası' })).toBeNull();
    // The panel no longer carries Düzenle / İptal et.
    expect(screen.queryByRole('button', { name: /Düzenle/ })).toBeNull();
    // Nothing is current until the user picks a row (list type).
    await waitFor(() => expect(reason('open')).toBe('Önce bir kayıt seçin'));
    fireEvent.click(cell);
    await waitFor(() => expect(command('open').getAttribute('aria-disabled')).not.toBe('true'));
    expect(reason('delete')).toBe("Dosya silinemez; İşlemler'den iptal edin.");
    const items = openMenu();
    expect(items).toEqual(['İthalat dosyası', 'İhracat dosyası', 'Planlandı aşamasına geçir', 'İptal et', 'CSV olarak dışa aktar']);
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
    renderScreen(<ForeignTradePage token="t" role="TenantAdmin" />);
    await screen.findAllByText('IHR-001');
    fireEvent.click(screen.getAllByText('IHR-002').find((node) => node.closest('tr'))!);
    await waitFor(() => expect(reason('open')).toBe('Yalnız Taslak ve Planlandı dosyalar düzenlenebilir'));
    expect(openMenu()).toEqual(['İthalat dosyası', 'İhracat dosyası', 'Gümrükte aşamasına geçir', 'Stok belgesi bağla…', 'CSV olarak dışa aktar']);
  });

  it('İlerle is in İşlemler with the panel conditions: a missing prerequisite disables it until filled in the panel', async () => {
    renderScreen(<ForeignTradePage token="t" role="TenantAdmin" />);
    await screen.findAllByText('IHR-001');
    // Shipped → Gümrükte needs a customs reference (none on the case).
    fireEvent.click(screen.getAllByText('IHR-002').find((node) => node.closest('tr'))!);
    const panel = await screen.findByRole('region', { name: 'Sonraki adım' });
    expect(within(panel).queryByRole('button', { name: /aşamasına geçir/ })).toBeNull();
    fireEvent.click(command('more'));
    const step = await screen.findByRole('menuitem', { name: /Gümrükte aşamasına geçir/ });
    expect(step.getAttribute('aria-disabled')).toBe('true');
    expect(step.getAttribute('title') ?? step.textContent).toContain('Önce paneldeki gerekli alanları doldurun');
    fireEvent.click(command('more'));
    fireEvent.change(within(panel).getByLabelText('Gümrük referansı'), { target: { value: 'GB-26-1' } });
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(await screen.findByRole('menuitem', { name: /Gümrükte aşamasına geçir/ }));
    });
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url === '/api/foreign-trade/cases/c2/transition')).toBe(true));
    const transition = calls.find((call) => call.url === '/api/foreign-trade/cases/c2/transition')!;
    expect(transition.body).toEqual({ status: 'CustomsClearance', customsReference: 'GB-26-1' });
    // No detail save before this step (customs reference travels with the transition).
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('İlerle to Sevkte saves the panel prerequisites through PUT first, then moves the case', async () => {
    casePage = { items: [{ ...tradeCase('c3', 'IHR-003', 'Booked'), incotermsCode: null }], total: 1 };
    renderScreen(<ForeignTradePage token="t" role="TenantAdmin" />);
    fireEvent.click((await screen.findAllByText('IHR-003')).find((node) => node.closest('tr'))!);
    const panel = await screen.findByRole('region', { name: 'Sonraki adım' });
    fireEvent.change(within(panel).getByLabelText('Planlanan sevkiyat'), { target: { value: '2026-12-05' } });
    fireEvent.change(within(panel).getByLabelText('Incoterms 2020'), { target: { value: 'FOB' } });
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(await screen.findByRole('menuitem', { name: /Sevkte aşamasına geçir/ }));
    });
    await waitFor(() => expect(calls.some((call) => call.url === '/api/foreign-trade/cases/c3/transition')).toBe(true));
    const writes = calls.filter((call) => call.method !== 'GET');
    expect(writes.map((call) => `${call.method} ${call.url}`)).toEqual([
      'PUT /api/foreign-trade/cases/c3',
      'POST /api/foreign-trade/cases/c3/transition',
    ]);
    expect(writes[0].body).toMatchObject({ plannedShipDate: '2026-12-05', incotermsCode: 'FOB', declaredValue: 1000, salesOrderId: 'so1' });
    expect(writes[1].body).toEqual({ status: 'Shipped', customsReference: null });
  });

  it('while a case step runs, double click does not open its form', async () => {
    let release: () => void = () => {};
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderScreen(<ForeignTradePage token="t" role="TenantAdmin" />);
    const draft = (await screen.findAllByText('IHR-001')).find((node) => node.closest('tr'))!;
    fireEvent.click(draft);
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(await screen.findByRole('menuitem', { name: /Planlandı aşamasına geçir/ }));
    });
    await waitFor(() => expect(calls.some((call) => call.url.endsWith('/c1/transition'))).toBe(true));
    fireEvent.doubleClick(draft);
    expect(screen.queryByRole('dialog', { name: 'Dosyayı düzenle' })).toBeNull();
    await act(async () => {
      release();
    });
  });

  it('stage chips filter the list; double click on a draft opens its form', async () => {
    renderScreen(<ForeignTradePage token="t" role="TenantAdmin" />);
    await screen.findAllByText('IHR-001');
    expect(document.querySelector('.foreign-trade-stages')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sevkte' }));
    await waitFor(() => expect(screen.queryAllByText('IHR-001').filter((node) => node.closest('tr'))).toHaveLength(0));
    expect(screen.getAllByText('IHR-002').some((node) => node.closest('tr'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sevkte' }));
    const draft = (await screen.findAllByText('IHR-001')).find((node) => node.closest('tr'))!;
    fireEvent.doubleClick(draft);
    expect(await screen.findByRole('dialog', { name: 'Dosyayı düzenle' })).toBeTruthy();
  });

  it('the footer says "ilk 100 / toplam N" with the total the endpoint returns', async () => {
    casePage = {
      items: Array.from({ length: 100 }, (_, index) => tradeCase(`m${index}`, `IHR-${String(index).padStart(3, '0')}`, 'Draft')),
      total: 137,
    };
    renderScreen(<ForeignTradePage token="t" role="TenantAdmin" />);
    expect(await screen.findByText('ilk 100 / toplam 137')).toBeTruthy();
  });

  it('status tones', () => {
    expect(tradeStatusTone('Closed')).toBe('ok');
    expect(tradeStatusTone('CustomsClearance')).toBe('warn');
    expect(tradeStatusTone('Cancelled')).toBe('off');
  });
});

describe('Dış Ticaret stock document link', () => {
  it('links the chosen posted document with the same body', async () => {
    renderScreen(<ForeignTradePage token="t" role="TenantAdmin" />);
    fireEvent.click((await screen.findAllByText('IHR-002'))[0].closest('tr')!);
    // The panel's select + button became a selection list opened from İşlemler (once the documents are loaded).
    await screen.findByText('Stok belgesi bağla');
    fireEvent.click(command('more'));
    await act(async () => fireEvent.click(await screen.findByRole('menuitem', { name: /Stok belgesi bağla/ })));
    const dialog = await screen.findByRole('dialog', { name: /Stok belgesi seç/ });
    fireEvent.click(within(dialog).getByText('IRS-0042'));
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Bağla' })));
    await waitFor(() =>
      expect(calls).toContainEqual({ url: '/api/foreign-trade/cases/c2/inventory-document', method: 'POST', body: { documentId: 'd1' } }),
    );
  });
});
