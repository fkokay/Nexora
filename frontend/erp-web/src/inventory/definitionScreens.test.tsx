import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import InventoryWarehousesPage from '../InventoryWarehousesPage';
import WarehouseLocationsPage from '../WarehouseLocationsPage';
import { ConfirmDialogHost } from '../confirmDialog';
import { LOCATION_REQUEST_EVENT, LOCATION_REQUEST_KEY } from '../warehouse-locations/locationRequest';

// Depolar and Raf ve Konumlar as definition screens (mockup 04 "2 · Tanım ekranı" / "2b · Sil onayı"):
// list on the left, the selected record's form on the right, Sil explains why it is blocked and offers Pasife al.

type Row = { id: string; code: string; name: string; isActive: boolean; rowVersion: string };
let warehouses: Row[] = [];
let locations: Record<string, Array<Row & { warehouseId: string; parentLocationId: string | null }>> = {};
type CustomValue = { definitionId: string; code: string; label: string; dataType: string; maxLength: number; definitionVersion: number; isRequired: boolean; value: string };
let customFields: CustomValue[] = [];
const textField = (code: string, label: string, value: string, isRequired = false): CustomValue =>
  ({ definitionId: code, code, label, dataType: 'Text', maxLength: 50, definitionVersion: 1, isRequired, value });
/** Someone else changed the warehouse (a new array, as a fresh GET would give). */
const changeWarehouseElsewhere = (id: string, patch: Partial<Row>) => {
  warehouses = warehouses.map((row) => (row.id === id ? { ...row, ...patch } : row));
};

// "METHOD /path" → a gate the response waits for (a save in flight) or a server refusal.
let held: Record<string, Promise<void>> = {};
let refused: Record<string, string> = {};
// "METHOD /path" → a 409 Response with this server message (for screens that read the Response themselves).
let conflicts: Record<string, string> = {};
function respond(url: string, init?: RequestInit): unknown {
  const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
  if (refused[key]) return Promise.reject(new Error(refused[key]));
  const gate = held[key];
  return gate ? gate.then(() => respondNow(url, init)) : respondNow(url, init);
}
function respondNow(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (path === '/api/warehouses/' && method === 'POST')
    return { id: 'w-new', code: String(body.code).toUpperCase(), name: body.name, isActive: true, rowVersion: 'NEW' };
  if (path === '/api/warehouses/') return warehouses;
  const status = path.match(/^\/api\/warehouses\/([^/]+)\/status$/);
  if (status) return { ...warehouses.find((w) => w.id === status[1])!, isActive: body.isActive, rowVersion: 'ST' };
  const locationPut = path.match(/^\/api\/warehouses\/([^/]+)\/locations\/([^/]+)$/);
  if (locationPut && method === 'PUT') return { id: locationPut[2], warehouseId: locationPut[1], code: body.code, name: body.name, parentLocationId: body.parentLocationId, isActive: body.isActive, rowVersion: 'L2' };
  const locationList = path.match(/^\/api\/warehouses\/([^/]+)\/locations$/);
  if (locationList && method === 'POST')
    return { id: 'l-new', warehouseId: locationList[1], code: body.code, name: body.name, parentLocationId: body.parentLocationId, isActive: true, rowVersion: 'LN' };
  if (locationList) return locations[locationList[1]] ?? [];
  if (/\/locations\/[^/]+\/balances$/.test(path)) return { items: [] };
  if (path.endsWith('/location-reconciliation')) return { items: [] };
  const warehousePut = path.match(/^\/api\/warehouses\/([^/]+)$/);
  if (warehousePut && method === 'PUT') return { id: warehousePut[1], code: String(body.code).toUpperCase(), name: body.name, isActive: true, rowVersion: 'BB' };
  if (/^\/api\/warehouses\/[^/]+\/custom-fields$/.test(path))
    return method === 'PUT' ? customFields.map((field) => ({ ...field, value: body.values[field.code] ?? '' })) : customFields;
  if (path === '/api/warehouses/custom-fields') return [{ id: 'f1', code: 'BOLGE', label: 'Bölge', dataType: 'Text', maxLength: 50, version: 1, isRequired: false, isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return { items: [], page: 1, pageSize: 50, totalCount: 0 };
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    apiMock(url, _token, init);
    const conflict = conflicts[`${init?.method ?? 'GET'} ${url.split('?')[0]}`];
    if (conflict) return new Response(JSON.stringify({ error: conflict }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(await respond(url, init)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
beforeEach(() => {
  held = {};
  refused = {};
  conflicts = {};
  customFields = [textField('BOLGE', 'Bölge', 'Marmara')];
  warehouses = [
    { id: 'w1', code: 'D1', name: 'Ana depo', isActive: true, rowVersion: 'AA' },
    { id: 'w2', code: 'D2', name: 'Yedek depo', isActive: true, rowVersion: 'AB' },
    { id: 'w3', code: 'D9', name: 'Eski depo', isActive: false, rowVersion: 'AC' },
  ];
  locations = {
    w1: [
      { id: 'l1', warehouseId: 'w1', code: 'A-01', name: 'Raf A', parentLocationId: null, isActive: true, rowVersion: 'L1' },
      { id: 'l2', warehouseId: 'w1', code: 'A-01-03', name: 'Raf A göz 3', parentLocationId: 'l1', isActive: true, rowVersion: 'L3' },
      { id: 'l3', warehouseId: 'w1', code: 'X-9', name: 'Eski raf', parentLocationId: null, isActive: false, rowVersion: 'L9' },
    ],
    w2: [],
  };
  apiMock.mockImplementation(async (url: string, _token?: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockReset();
  sessionStorage.clear();
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
const primary = (id: string) => command(id).getAttribute('data-primary') === 'true';
function openMenu() {
  fireEvent.click(command('more'));
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
const listRegion = () => document.querySelector<HTMLElement>('.nx-def-list .advanced-grid-scroll')!;
const listRows = () => within(listRegion()).getAllByRole('row').slice(1);
const rowOf = (code: string) => listRows().find((row) => row.textContent?.includes(code))!;
const pane = () => document.querySelector<HTMLElement>('.nx-def-pane')!;
const field = (label: RegExp) => within(pane()).getByLabelText(label) as HTMLInputElement;
const calls = (method: string, pattern: RegExp) =>
  apiMock.mock.calls.filter(([url, , init]) => (init?.method ?? 'GET') === method && pattern.test(String(url).split('?')[0]));
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));

async function selectWarehouse(code: string) {
  await act(async () => {
    fireEvent.click(rowOf(code));
  });
  await settle();
}

describe('Depolar definition screen', () => {
  it('shows an empty form pane until a row is selected, then loads the row into the form with its locations', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    expect(within(pane()).getByText('Bir depo seçin ya da F2 ile yeni depo ekleyin.')).toBeTruthy();
    expect(listRows()).toHaveLength(3);
    // The status column uses the status tag.
    expect(within(rowOf('D9')).getByText('Pasif').className).toContain('nx-status-tag');
    await selectWarehouse('D1');
    expect(rowOf('D1').getAttribute('aria-current')).toBe('true');
    expect(field(/^Depo kodu/).value).toBe('D1');
    expect(field(/^Depo adı/).value).toBe('Ana depo');
    expect(field(/^Bölge/).value).toBe('Marmara');
    expect(calls('GET', /^\/api\/warehouses\/w1\/custom-fields$/)).toHaveLength(1);
    // Lokasyonlar: the warehouse's locations, read-only, with the parent shown as a child row.
    const card = within(pane()).getByRole('region', { name: 'Lokasyonlar' });
    expect(within(card).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'KodAdDurum',
      'A-01Raf AAktif',
      '└ A-01-03Raf A göz 3Aktif',
      'X-9Eski rafPasif',
    ]);
    expect(within(card).queryByRole('textbox')).toBeNull();
    // Nothing changed: Kaydet says why it is not needed.
    expect(enabled('save')).toBe(false);
    expect(command('save').title).toBe('Kaydedilecek değişiklik yok');
  });

  it('moves to the next warehouse with ↓ and asks before leaving a changed form', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    expect(within(pane()).getByText('1 alan değişti')).toBeTruthy();
    expect(within(pane()).getByText('Önceki: Ana depo')).toBeTruthy();
    // Declined: the form and the current row stay on D1.
    fireEvent.keyDown(listRegion(), { key: 'ArrowDown' });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Kaydedilmemiş değişiklikler kaybolacak');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Vazgeç/ }));
    await settle();
    expect(field(/^Depo adı/).value).toBe('Ana depo 2');
    expect(rowOf('D1').getAttribute('aria-current')).toBe('true');
    // Accepted: D2 loads.
    fireEvent.keyDown(listRegion(), { key: 'ArrowDown' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await settle();
    await waitFor(() => expect(field(/^Depo kodu/).value).toBe('D2'));
    expect(rowOf('D2').getAttribute('aria-current')).toBe('true');
    expect(within(pane()).queryByText('1 alan değişti')).toBeNull();
  });

  it('Ctrl+S saves the right-hand form through the existing endpoints with the row version', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    fireEvent.change(field(/^Bölge/), { target: { value: 'Ege' } });
    expect(within(pane()).getByText('2 alan değişti')).toBeTruthy();
    expect(primary('save')).toBe(true);
    await act(async () => {
      fireEvent.keyDown(field(/^Depo adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    const put = calls('PUT', /^\/api\/warehouses\/w1$/);
    expect(put).toHaveLength(1);
    expect(bodyOf(put[0])).toEqual({ code: 'D1', name: 'Ana depo 2', rowVersion: 'AA' });
    const values = calls('PUT', /^\/api\/warehouses\/w1\/custom-fields$/);
    expect(values).toHaveLength(1);
    expect(bodyOf(values[0])).toEqual({ values: { BOLGE: 'Ege' } });
    // Saved: the list row and the form baseline follow; the next save uses the new row version.
    expect(rowOf('D1').textContent).toContain('Ana depo 2');
    expect(within(pane()).queryByText(/alan değişti/)).toBeNull();
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 3' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    const second = calls('PUT', /^\/api\/warehouses\/w1$/);
    expect(bodyOf(second[1])).toEqual({ code: 'D1', name: 'Ana depo 3', rowVersion: 'BB' });
    // Only the changed part is sent.
    expect(calls('PUT', /^\/api\/warehouses\/w1\/custom-fields$/)).toHaveLength(1);
  });

  it('F2 opens an empty form, asks first when the open form has changes, and creates the warehouse', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    expect(primary('new')).toBe(true);
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Değişti' } });
    fireEvent.keyDown(document.body, { key: 'F2' });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Yeni kayıt')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Vazgeç/ }));
    await settle();
    expect(field(/^Depo adı/).value).toBe('Değişti');
    fireEvent.keyDown(document.body, { key: 'F2' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await settle();
    expect(within(pane()).getByRole('heading', { name: 'Yeni depo' })).toBeTruthy();
    expect(listRows().some((row) => row.getAttribute('aria-current') === 'true')).toBe(false);
    expect(field(/^Depo kodu/).value).toBe('');
    // Create keeps the custom fields of the former dialog.
    expect(field(/^Bölge/).value).toBe('');
    fireEvent.change(field(/^Depo kodu/), { target: { value: 'd5' } });
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Yeni şube' } });
    fireEvent.change(field(/^Bölge/), { target: { value: 'Ege' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    const post = calls('POST', /^\/api\/warehouses\/$/);
    expect(post).toHaveLength(1);
    expect(bodyOf(post[0])).toEqual({ code: 'd5', name: 'Yeni şube', customFields: { BOLGE: 'Ege' } });
    // The new warehouse is listed and open in the form.
    await waitFor(() => expect(rowOf('D5').getAttribute('aria-current')).toBe('true'));
    expect(field(/^Depo kodu/).value).toBe('D5');
  });

  it('Esc closes the form (asking first when it has changes)', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D2');
    fireEvent.keyDown(listRegion(), { key: 'Escape' });
    await settle();
    expect(within(pane()).getByText('Bir depo seçin ya da F2 ile yeni depo ekleyin.')).toBeTruthy();
    expect(rowOf('D2').getAttribute('aria-current')).toBeNull();
    await selectWarehouse('D2');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'X' } });
    fireEvent.keyDown(field(/^Depo adı/), { key: 'Escape' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await settle();
    expect(within(pane()).queryByRole('textbox')).toBeNull();
  });

  it('Esc still closes the form while a dialog is left open in a hidden view, but not under an open dialog', async () => {
    renderScreen(
      <>
        <div hidden><div role="dialog" aria-modal="true" /><div className="modal-backdrop" /></div>
        <InventoryWarehousesPage token="t" role="TenantAdmin" />
      </>,
    );
    await settle();
    await selectWarehouse('D2');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    fireEvent.keyDown(listRegion(), { key: 'Escape' });
    await settle();
    expect(rowOf('D2').getAttribute('aria-current')).toBe('true');
    dialog.remove();
    fireEvent.keyDown(listRegion(), { key: 'Escape' });
    await settle();
    expect(rowOf('D2').getAttribute('aria-current')).toBeNull();
  });

  it('Sil explains that warehouses are not deleted and offers Pasife al (Enter) / Vazgeç (Esc)', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    expect(enabled('delete')).toBe(false);
    expect(command('delete').title).toBe('Önce bir kayıt seçin');
    await selectWarehouse('D1');
    expect(enabled('delete')).toBe(true);
    await act(async () => {
      fireEvent.click(command('delete'));
    });
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('D1 · Ana depo silinemez');
    expect(dialog.textContent).toContain('Depolar silinmez; geçmiş hareketler korunur.');
    expect(dialog.textContent).toContain('Sıfırdan farklı bakiyesi olan depo kapatılamaz.');
    const buttons = within(dialog).getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual(['VazgeçEsc', 'Pasife alEnter']);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Vazgeç/ }));
    await settle();
    expect(calls('POST', /\/status$/)).toHaveLength(0);
    await act(async () => {
      fireEvent.keyDown(listRegion(), { key: 'Delete', ctrlKey: true });
    });
    dialog = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Pasife al/ }));
    });
    await settle();
    const status = calls('POST', /^\/api\/warehouses\/w1\/status$/);
    expect(status).toHaveLength(1);
    expect(bodyOf(status[0])).toEqual({ isActive: false, confirmation: true });
    // Only one confirmation was asked; the row is now Pasif and the form stays on it.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(rowOf('D1')).getByText('Pasif')).toBeTruthy();
    expect(field(/^Depo kodu/).value).toBe('D1');
    // A passive warehouse: nothing more Sil could offer.
    expect(enabled('delete')).toBe(false);
    expect(command('delete').title).toBe('Depolar silinemez; bu depo zaten pasif.');
    // The saved row version is the one the status change returned.
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(bodyOf(calls('PUT', /^\/api\/warehouses\/w1$/)[0]).rowVersion).toBe('ST');
  });

  it('keeps the open warehouse while its save runs (no row switch, Yeni or Esc)', async () => {
    let release = () => {};
    held['PUT /api/warehouses/w1'] = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(enabled('new')).toBe(false);
    expect(command('new').title).toBe('İşlem sürüyor…');
    await selectWarehouse('D2');
    fireEvent.keyDown(document.body, { key: 'F2' });
    fireEvent.keyDown(listRegion(), { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(rowOf('D1').getAttribute('aria-current')).toBe('true');
    await act(async () => {
      release();
    });
    await settle();
    // The result lands in the record that was saved.
    expect(field(/^Depo kodu/).value).toBe('D1');
    expect(field(/^Depo adı/).value).toBe('Ana depo 2');
    expect(within(pane()).queryByText(/alan değişti/)).toBeNull();
    expect(rowOf('D1').textContent).toContain('Ana depo 2');
  });

  it('a refused Pasife al shows the server message once and the warehouse stays active', async () => {
    refused['POST /api/warehouses/w1/status'] = 'STK-1 için stok bakiyesi sıfır olmadan depo devre dışı bırakılamaz.';
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    await act(async () => {
      fireEvent.click(command('delete'));
    });
    await act(async () => {
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Pasife al/ }));
    });
    await settle();
    expect(screen.getAllByText('STK-1 için stok bakiyesi sıfır olmadan depo devre dışı bırakılamaz.')).toHaveLength(1);
    expect(within(rowOf('D1')).getByText('Aktif')).toBeTruthy();
    expect(enabled('delete')).toBe(true);
  });

  it('a refresh never overwrites a change made elsewhere: a changed form keeps its row version', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    // Someone else renamed D1 meanwhile; Yenile loads the new row version.
    changeWarehouseElsewhere('w1', { name: 'Başka ad', rowVersion: 'ZZ' });
    await act(async () => {
      fireEvent.click(command('refresh'));
    });
    await settle();
    expect(rowOf('D1').textContent).toContain('Başka ad');
    // The changed form is kept; another field is edited and saved with the version it was loaded with, so the
    // server answers with its conflict instead of the other change being overwritten.
    expect(field(/^Depo adı/).value).toBe('Ana depo 2');
    fireEvent.change(field(/^Depo kodu/), { target: { value: 'D1X' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo kodu/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(bodyOf(calls('PUT', /^\/api\/warehouses\/w1$/)[0])).toEqual({ code: 'D1X', name: 'Ana depo 2', rowVersion: 'AA' });
  });

  it('a refresh rebuilds an unchanged form from the new row, which then saves with the new version', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    changeWarehouseElsewhere('w1', { name: 'Başka ad', rowVersion: 'ZZ' });
    await act(async () => {
      fireEvent.click(command('refresh'));
    });
    await settle();
    expect(field(/^Depo adı/).value).toBe('Başka ad');
    expect(within(pane()).queryByText(/alan değişti/)).toBeNull();
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Başka ad 2' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(bodyOf(calls('PUT', /^\/api\/warehouses\/w1$/)[0]).rowVersion).toBe('ZZ');
  });

  it('an empty required custom field does not block a rename; it is checked when custom values are saved', async () => {
    customFields = [textField('BOLGE', 'Bölge', '', true), textField('NOT', 'Not', '')];
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    expect(field(/^Bölge/).required).toBe(false);
    expect(within(pane()).getByText('(BOLGE · Text · v1 · zorunlu)')).toBeTruthy();
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(calls('PUT', /^\/api\/warehouses\/w1$/)).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    // Saving custom values with the required one still empty: the server's message, nothing sent.
    fireEvent.change(field(/^Not/), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Not/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('“Bölge” alanı zorunludur.');
    expect(calls('PUT', /^\/api\/warehouses\/w1\/custom-fields$/)).toHaveLength(0);
  });

  it('a retry after a partial failure sends only the part that failed', async () => {
    refused['PUT /api/warehouses/w1/custom-fields'] = 'Özel alan kaydedilemedi.';
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    fireEvent.change(field(/^Bölge/), { target: { value: 'Ege' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Bölge/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('Özel alan kaydedilemedi.');
    expect(within(pane()).getByText('1 alan değişti')).toBeTruthy();
    delete refused['PUT /api/warehouses/w1/custom-fields'];
    await act(async () => {
      fireEvent.keyDown(field(/^Bölge/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(calls('PUT', /^\/api\/warehouses\/w1$/)).toHaveLength(1);
    expect(calls('PUT', /^\/api\/warehouses\/w1\/custom-fields$/)).toHaveLength(2);
    expect(within(pane()).queryByText(/alan değişti/)).toBeNull();
  });

  it('Ctrl+S with the focus on the list saves the right-hand form', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    listRegion().focus();
    await act(async () => {
      fireEvent.keyDown(listRegion(), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(calls('PUT', /^\/api\/warehouses\/w1$/)).toHaveLength(1);
  });

  it('a passive warehouse keeps its custom values read-only', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D9');
    expect(field(/^Bölge/).disabled).toBe(true);
    expect(within(pane()).getByText('Devre dışı depoda değerler kaydedilemez.')).toBeTruthy();
    expect(within(pane()).getByText('Geçmiş API üzerinden korunur.')).toBeTruthy();
    expect(field(/^Depo adı/).disabled).toBe(false);
  });

  it('shows the empty custom-field note when the tenant has none', async () => {
    customFields = [];
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    expect(within(pane()).getByText('Henüz depo özel alanı tanımlanmadı.')).toBeTruthy();
  });

  it('Esc returns the focus to the list', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    field(/^Depo adı/).focus();
    fireEvent.keyDown(field(/^Depo adı/), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(listRegion()));
  });

  it('keeps Sil away from a form with unsaved changes', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'X' } });
    expect(enabled('delete')).toBe(false);
    expect(command('delete').title).toBe('Önce değişiklikleri kaydedin veya vazgeçin');
  });

  it('keeps the status change in İşlemler away from a form with unsaved changes', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'X' } });
    openMenu();
    const status = document.querySelector<HTMLElement>('[role="menuitem"][data-item="warehouse-status"]')!;
    expect(status.getAttribute('aria-disabled')).toBe('true');
    expect(status.title).toBe('Önce değişiklikleri kaydedin veya vazgeçin');
    fireEvent.click(status);
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls('POST', /\/status$/)).toHaveLength(0);
  });

  it('a changed form made unchanged again after Yenile is rebuilt from the live row and saves with its version', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    changeWarehouseElsewhere('w1', { name: 'Başka ad', rowVersion: 'ZZ' });
    await act(async () => {
      fireEvent.click(command('refresh'));
    });
    await settle();
    expect(field(/^Depo adı/).value).toBe('Ana depo 2');
    // The edit undone: the form is unchanged again and shows the live row, not the stale one.
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo' } });
    await settle();
    expect(field(/^Depo adı/).value).toBe('Başka ad');
    expect(within(pane()).queryByText(/alan değişti/)).toBeNull();
    fireEvent.change(field(/^Depo kodu/), { target: { value: 'D1X' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo kodu/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(bodyOf(calls('PUT', /^\/api\/warehouses\/w1$/)[0])).toEqual({ code: 'D1X', name: 'Başka ad', rowVersion: 'ZZ' });
  });

  it('a save refused with a conflict (409) shows the server message exactly once and keeps the changes', async () => {
    const message = 'Kayıt başka bir kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin.';
    refused['PUT /api/warehouses/w1'] = message;
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    await selectWarehouse('D1');
    fireEvent.change(field(/^Depo adı/), { target: { value: 'Ana depo 2' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Depo adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(field(/^Depo adı/).value).toBe('Ana depo 2');
    expect(within(pane()).getByText('1 alan değişti')).toBeTruthy();
  });

  it('İşlemler keeps the field catalog, the status change and CSV; Lokasyon ekle hands over to Raf ve Konumlar', async () => {
    const onNavigate = vi.fn();
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle();
    expect(openMenu()).toEqual(['Depo alan tanımları', 'CSV olarak dışa aktar']);
    fireEvent.mouseDown(document.body);
    await selectWarehouse('D1');
    expect(openMenu()).toEqual(['Devre dışı bırak', 'Depo alan tanımları', 'CSV olarak dışa aktar']);
    fireEvent.mouseDown(document.body);
    fireEvent.click(within(pane()).getByRole('button', { name: /Lokasyon ekle/ }));
    expect(onNavigate).toHaveBeenCalledWith('inventory-locations');
    expect(JSON.parse(sessionStorage.getItem(LOCATION_REQUEST_KEY)!)).toEqual({ warehouseId: 'w1', create: true });
    // A passive warehouse takes no new location.
    await selectWarehouse('D9');
    expect(within(pane()).queryByRole('button', { name: /Lokasyon ekle/ })).toBeNull();
    expect(openMenu()).toContain('Yeniden etkinleştir');
  });

  it('TenantUser: no field catalog and no Lokasyon ekle (locations are TenantAdmin-only)', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantUser" onNavigate={vi.fn()} />);
    await settle();
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
    fireEvent.mouseDown(document.body);
    await selectWarehouse('D1');
    expect(within(pane()).getByRole('region', { name: 'Lokasyonlar' })).toBeTruthy();
    expect(within(pane()).queryByRole('button', { name: /Lokasyon ekle/ })).toBeNull();
  });
});

describe('Raf ve Konumlar definition screen', () => {
  const selectLocation = async (code: string) => {
    await act(async () => {
      fireEvent.click(rowOf(code));
    });
    await settle();
  };

  it('lists the warehouse locations on the left; nothing is selected until a row is clicked', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    expect(listRows().map((row) => row.getAttribute('aria-current'))).toEqual([null, null, null]);
    expect(within(pane()).getByText('Bir konum seçin ya da F2 ile yeni konum ekleyin.')).toBeTruthy();
    // Kod has its own mono column; the parent is shown by code.
    expect(within(rowOf('A-01-03')).getByText('A-01-03').className).toContain('nx-code');
    expect(within(rowOf('A-01-03')).getByText('A-01')).toBeTruthy();
  });

  it('row select loads the edit form; Ctrl+S saves it with the row version; Esc closes it', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01-03');
    expect(within(pane()).getByRole('heading', { name: 'A-01-03 konumunu düzenle' })).toBeTruthy();
    expect(field(/^Konum kodu/).value).toBe('A-01-03');
    expect(field(/^Konum adı/).value).toBe('Raf A göz 3');
    // The location balance stays under the form.
    expect(within(pane()).getByText('Konum bakiyesi')).toBeTruthy();
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Raf A göz 4' } });
    expect(within(pane()).getByText('1 alan değişti')).toBeTruthy();
    expect(within(pane()).getByText('Önceki: Raf A göz 3')).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(field(/^Konum adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    const put = calls('PUT', /^\/api\/warehouses\/w1\/locations\/l2$/);
    expect(put).toHaveLength(1);
    expect(bodyOf(put[0])).toEqual({ code: 'A-01-03', name: 'Raf A göz 4', parentLocationId: 'l1', isActive: true, rowVersion: 'L3' });
    expect(rowOf('A-01-03').textContent).toContain('Raf A göz 4');
    fireEvent.keyDown(listRegion(), { key: 'Escape' });
    await settle();
    expect(within(pane()).queryByRole('textbox')).toBeNull();
    expect(rowOf('A-01-03').getAttribute('aria-current')).toBeNull();
  });

  it('Sil explains that locations are not deleted and Pasife al saves the location as passive', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01');
    await act(async () => {
      fireEvent.click(command('delete'));
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('A-01 · Raf A silinemez');
    expect(dialog.textContent).toContain('Konumlar silinmez; geçmiş hareketler korunur.');
    expect(dialog.textContent).toContain('Etkin alt konumu ya da stok bakiyesi olan konum pasife alınamaz.');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Pasife al/ }));
    });
    await settle();
    const put = calls('PUT', /^\/api\/warehouses\/w1\/locations\/l1$/);
    expect(bodyOf(put[0])).toEqual({ code: 'A-01', name: 'Raf A', parentLocationId: null, isActive: false, rowVersion: 'L1' });
    expect(within(rowOf('Raf A')).getByText('Pasif')).toBeTruthy();
    expect(command('delete').title).toBe('Konumlar silinemez; bu konum zaten pasif.');
  });

  it('Yeni (F2) opens the create form, which says why it cannot be saved yet', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    expect(primary('new')).toBe(true);
    fireEvent.keyDown(document.body, { key: 'F2' });
    await settle();
    expect(within(pane()).getByRole('heading', { name: 'Konum oluştur' })).toBeTruthy();
    expect(primary('save')).toBe(true);
    expect(enabled('save')).toBe(false);
    expect(command('save').title).toBe('Konum kodu ve adı zorunludur.');
    fireEvent.change(field(/^Konum kodu/), { target: { value: 'b-02' } });
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Raf B' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Konum adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(bodyOf(calls('POST', /^\/api\/warehouses\/w1\/locations$/)[0])).toEqual({ code: 'B-02', name: 'Raf B', parentLocationId: null });
    await waitFor(() => expect(rowOf('B-02').getAttribute('aria-current')).toBe('true'));
  });

  it('opens on the warehouse and create form that Depolar handed over', async () => {
    sessionStorage.setItem(LOCATION_REQUEST_KEY, JSON.stringify({ warehouseId: 'w2', create: true }));
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await settle();
    expect(calls('GET', /^\/api\/warehouses\/w2\/locations$/).length).toBeGreaterThan(0);
    expect(within(pane()).getByRole('heading', { name: 'Konum oluştur' })).toBeTruthy();
    expect(sessionStorage.getItem(LOCATION_REQUEST_KEY)).toBeNull();
  });

  it('keeps the open location while its save runs', async () => {
    let release = () => {};
    held['PUT /api/warehouses/w1/locations/l2'] = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01-03');
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Raf A göz 4' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Konum adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    await selectLocation('X-9');
    fireEvent.keyDown(document.body, { key: 'F2' });
    fireEvent.keyDown(listRegion(), { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(rowOf('A-01-03').getAttribute('aria-current')).toBe('true');
    await act(async () => {
      release();
    });
    await settle();
    expect(within(pane()).getByRole('heading', { name: 'A-01-03 konumunu düzenle' })).toBeTruthy();
    expect(field(/^Konum adı/).value).toBe('Raf A göz 4');
    expect(within(pane()).queryByText(/alan değişti/)).toBeNull();
  });

  it('takes a hand-off while already open (Depolar → Lokasyon ekle)', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    expect(calls('GET', /^\/api\/warehouses\/w2\/locations$/)).toHaveLength(0);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(LOCATION_REQUEST_EVENT, { detail: { warehouseId: 'w2', create: true } }));
    });
    await settle();
    expect(calls('GET', /^\/api\/warehouses\/w2\/locations$/).length).toBeGreaterThan(0);
    expect(within(pane()).getByRole('heading', { name: 'Konum oluştur' })).toBeTruthy();
  });

  it('Aç (Enter) opens the current row into the form and focuses it', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01');
    expect(enabled('open')).toBe(true);
    await act(async () => {
      fireEvent.click(command('open'));
    });
    await waitFor(() => expect(document.activeElement).toBe(field(/^Konum kodu/)));
  });

  it('asks before leaving a changed location for another row', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01-03');
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Değişti' } });
    await act(async () => {
      fireEvent.click(rowOf('X-9'));
    });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Vazgeç/ }));
    await settle();
    expect(field(/^Konum adı/).value).toBe('Değişti');
    expect(rowOf('A-01-03').getAttribute('aria-current')).toBe('true');
    await act(async () => {
      fireEvent.click(rowOf('X-9'));
    });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await settle();
    expect(field(/^Konum kodu/).value).toBe('X-9');
  });

  it('asks before the Depo filter change drops a changed form', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01');
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Değişti' } });
    const pick = async () => {
      fireEvent.click(within(document.querySelector<HTMLElement>('.list-v2-filter')!).getAllByRole('button')[0]);
      const option = await screen.findByRole('option', { name: /Yedek depo/ });
      await act(async () => {
        fireEvent.click(option);
      });
    };
    await pick();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Vazgeç/ }));
    await settle();
    expect(calls('GET', /^\/api\/warehouses\/w2\/locations$/)).toHaveLength(0);
    expect(field(/^Konum adı/).value).toBe('Değişti');
    await pick();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await settle();
    expect(calls('GET', /^\/api\/warehouses\/w2\/locations$/).length).toBeGreaterThan(0);
    expect(within(pane()).queryByRole('textbox')).toBeNull();
  });

  it('a refresh keeps a changed location form on its row version and rebuilds an unchanged one', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01-03');
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Benim adım' } });
    locations = { ...locations, w1: locations.w1.map((row) => (row.id === 'l2' ? { ...row, name: 'Başkası', rowVersion: 'LZ' } : row)) };
    await act(async () => {
      fireEvent.click(command('refresh'));
    });
    await settle();
    expect(rowOf('A-01-03').textContent).toContain('Başkası');
    expect(field(/^Konum adı/).value).toBe('Benim adım');
    await act(async () => {
      fireEvent.keyDown(field(/^Konum adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(bodyOf(calls('PUT', /^\/api\/warehouses\/w1\/locations\/l2$/)[0]).rowVersion).toBe('L3');
    // An unchanged form shows the refreshed row and saves with its version.
    await selectLocation('X-9');
    locations = { ...locations, w1: locations.w1.map((row) => (row.id === 'l3' ? { ...row, name: 'Daha yeni', rowVersion: 'LX' } : row)) };
    await act(async () => {
      fireEvent.click(command('refresh'));
    });
    await settle();
    expect(field(/^Konum adı/).value).toBe('Daha yeni');
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Son ad' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Konum adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(bodyOf(calls('PUT', /^\/api\/warehouses\/w1\/locations\/l3$/)[0]).rowVersion).toBe('LX');
  });

  it('a changed location form made unchanged again after Yenile is rebuilt from the live row', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01-03');
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Benim adım' } });
    locations = { ...locations, w1: locations.w1.map((row) => (row.id === 'l2' ? { ...row, name: 'Başkası', rowVersion: 'LZ' } : row)) };
    await act(async () => {
      fireEvent.click(command('refresh'));
    });
    await settle();
    expect(field(/^Konum adı/).value).toBe('Benim adım');
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Raf A göz 3' } });
    await settle();
    expect(field(/^Konum adı/).value).toBe('Başkası');
    // Sil (Pasife al) is offered again and sends the live version.
    await act(async () => {
      fireEvent.click(command('delete'));
    });
    await act(async () => {
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Pasife al/ }));
    });
    await settle();
    expect(bodyOf(calls('PUT', /^\/api\/warehouses\/w1\/locations\/l2$/)[0])).toEqual({
      code: 'A-01-03', name: 'Başkası', parentLocationId: 'l1', isActive: false, rowVersion: 'LZ',
    });
  });

  it('a save refused with 409 shows the server message exactly once and keeps the changes', async () => {
    const message = 'Konum başka bir kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin.';
    conflicts['PUT /api/warehouses/w1/locations/l2'] = message;
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    await selectLocation('A-01-03');
    fireEvent.change(field(/^Konum adı/), { target: { value: 'Raf A göz 4' } });
    await act(async () => {
      fireEvent.keyDown(field(/^Konum adı/), { key: 's', ctrlKey: true });
    });
    await settle();
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(field(/^Konum adı/).value).toBe('Raf A göz 4');
    expect(within(pane()).getByText('1 alan değişti')).toBeTruthy();
  });

  it('TenantUser: the selected location is shown read-only, without Yeni or Sil', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantUser" />);
    await settle();
    expect(within(pane()).getByText('Bir konum seçin.')).toBeTruthy();
    await selectLocation('A-01');
    expect(within(pane()).queryByRole('textbox')).toBeNull();
    expect(within(pane()).getByText('Konum bakiyesi')).toBeTruthy();
    expect(command('new')).toBeNull();
    expect(command('delete')).toBeNull();
  });
});
