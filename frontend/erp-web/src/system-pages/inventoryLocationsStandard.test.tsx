import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { ActionBarSlotProvider } from '../action-bar/ActionBarSlot';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { setPageParams } from '../pageNavigation';
import catalog from './inventoryWarehouseOperations.fixture.json';

// Raf ve Konumlar standart tanımı (inventory-locations.json, sürüm 2, Liste kalıbı) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// Yeni konum / Düzenle birer pencere; Bakiyeler ve Konumlandırma denetimi tablo pencereleri.
// İşlemler `inventoryWarehouseOperations.fixture.json` anlık görüntüsündendir (Depo Yönetimi testiyle ortak).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Operation = (typeof catalog.operations)[number];
type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };

const standardPath = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-locations.json');
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { screenKey: string; title: string; version: number; definition: Definition };

const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const W2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const L1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const L2 = 'bbbbbbbb-0000-0000-0000-000000000002';
const NEW = 'bbbbbbbb-0000-0000-0000-0000000000aa';
const S1 = 'cccccccc-0000-0000-0000-000000000001';
const KEY = 'inventory-locations';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;
const location = (id: string, code: string, name: string, parentLocationId: string | null = null, isActive = true) =>
  ({ id, warehouseId: W1, code, name, parentLocationId, isActive, rowVersion: `rv-${code}` });

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let operations: Operation[] = catalog.operations;

function respond(url: string, method: string, body?: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/warehouses') return [{ id: W1, code: 'MRK', name: 'Merkez', isActive: true, rowVersion: 'w1' }, { id: W2, code: 'YDK', name: 'Yedek', isActive: true, rowVersion: 'w2' }];
    if (path === `/api/warehouses/${W1}/locations`) return [location(L1, 'A-01', 'Raf A'), location(L2, 'A-01-03', 'Raf A göz 3', L1)];
    if (path === `/api/warehouses/${W2}/locations`) return [];
    if (/^\/api\/warehouses\/[^/]+\/locations\/[^/]+\/balances$/.test(path)) {
      return { id: L1, warehouseId: W1, code: 'A-01', name: 'Raf A', asOfDate: '2026-11-19',
        items: [{ stockItemId: S1, stockItemCode: 'KLM', stockItemName: 'Kalem', unitCode: 'ADET', quantity: 4 }] };
    }
    if (/^\/api\/warehouses\/[^/]+\/location-reconciliation$/.test(path)) {
      return { id: W1, code: 'MRK', name: 'Merkez', asOfDate: '2026-11-19',
        items: [{ stockItemId: S1, stockItemCode: 'KLM', stockItemName: 'Kalem', unitCode: 'ADET', warehouseQuantity: 10, locatedQuantity: 4, unlocatedQuantity: 6 }] };
    }
  } else {
    const parsed = body ? JSON.parse(body) as Record<string, unknown> : {};
    if (path === `/api/warehouses/${W1}/locations` && method === 'POST') return { ...location(NEW, String(parsed.code), String(parsed.name)), parentLocationId: parsed.parentLocationId ?? null };
    if (/^\/api\/warehouses\/[^/]+\/locations\/[^/]+$/.test(path) && method === 'PUT') {
      return { ...location(path.split('/')[5], String(parsed.code), String(parsed.name), (parsed.parentLocationId as string | null) ?? null, parsed.isActive !== false), rowVersion: 'rv-new' };
    }
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return {
        id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [],
        rights: { view: true, insert: true, update: true, delete: true }, screenKey: KEY, source: 'standard', standardVersion: standard.version,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url: endpoint, method, body });
    return respond(endpoint, method, body);
  });
  return render(
    <CommandProvider>
      <ActionBarSlotProvider breadcrumb={<nav aria-label="Konum">Ana Sayfa › Raf ve Konumlar</nav>}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      </ActionBarSlotProvider>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const writes = () => calls.filter((call) => call.method !== 'GET');
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const settle = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const cell = (text: string) => screen.getByText(text, { selector: '.tenant-page-data-grid td' });
const detail = () => document.querySelector('.tenant-page-detail') as HTMLElement;
const warehouseSelect = () => within(screen.getByRole('region', { name: 'Süzgeçler' })).getByRole('combobox', { name: 'Depo' }) as HTMLInputElement;
const metric = (label: string) => screen.getByText(label, { selector: '.tenant-metric-label' }).closest('article')!.querySelector('strong')?.textContent;
/** Depolar'dan geçiş: sayfa `warehouseId` parametresiyle açılır. */
const openOn = async (warehouseId = W1, role = 'TenantAdmin') => {
  setPageParams(KEY, { warehouseId });
  setup(role);
  await screen.findByText('A-01', { selector: '.tenant-page-data-grid td' }, T);
};
const selectLocation = async (code = 'A-01-03') => {
  fireEvent.click(cell(code));
  await waitFor(() => expect(detail().querySelector('h3')?.textContent).toBe(code === 'A-01' ? 'Raf A' : 'Raf A göz 3'), T);
};
const moreItem = async (name: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: 'Diğer işlemler' }));
  fireEvent.click(await screen.findByRole('menuitem', { name }, T));
};

beforeEach(() => {
  calls = []; operations = catalog.operations; api.mockReset();
  localStorage.clear();
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  setPageParams(KEY, {});
});

describe('Raf ve Konumlar standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect(standard.version).toBe(2);
  });

  it('opens on the first warehouse and shows the location, active and unlocated-card indicators', async () => {
    setup();
    await waitFor(() => expect(warehouseSelect().value).toBe('MRK · Merkez'), T);
    expect(gets(`/api/warehouses/${W2}/locations`)).toEqual([]);
    await screen.findByText('A-01', { selector: '.tenant-page-data-grid td' }, T);
    await waitFor(() => expect(gets(`/api/warehouses/${W1}/location-reconciliation`).length).toBeGreaterThan(0), T);
    await waitFor(() => expect(metric('Konum')).toBe('2'), T);
    expect(metric('Aktif')).toBe('2');
    await waitFor(() => expect(metric('Konumsuz kalan kart')).toBe('1'), T);
  });

  it('a hand-off from Depolar opens on that warehouse (page parameter wins over the stored filter)', async () => {
    localStorage.setItem(`nexora.filterBar.t1.@${KEY}.suzgec`, JSON.stringify({ search: '', values: { warehouseId: W2 } }));
    await openOn(W1);
    expect(warehouseSelect().value).toBe('MRK · Merkez');
    expect(gets(`/api/warehouses/${W2}/locations`)).toEqual([]);
  });

  it('the card group asks for a selection, then shows the picked location', async () => {
    await openOn();
    expect(within(detail()).getByText('Bir konum seçin; ayrıntıları burada görün.')).toBeTruthy();
    await selectLocation();
    expect(within(detail()).queryByText('Bir konum seçin; ayrıntıları burada görün.')).toBeNull();
    const panel = detail().querySelector('.tenant-page-context') as HTMLElement;
    expect(Array.from(panel.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual(['Konum kodu', 'Konum adı', 'Durum']);
  });

  it('Düzenle opens the window filled from the row; save sends the full PUT with the row version', async () => {
    await openOn();
    await selectLocation();
    fireEvent.click(command('open'));
    const dialog = await screen.findByRole('dialog', { name: 'Konum · A-01-03' }, T);
    expect(input('konumKodu').value).toBe('A-01-03');
    expect(input('ustKonum').value).toBe(L1);
    expect((input('konumAktif') as HTMLInputElement).checked).toBe(true);
    type('konumAdi', 'Göz 3');
    fireEvent.change(input('ustKonum'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/warehouses/${W1}/locations/${L2}` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ code: 'A-01-03', name: 'Göz 3', parentLocationId: null, isActive: true, rowVersion: 'rv-A-01-03' });
    await waitFor(() => expect(gets(`/api/warehouses/${W1}/locations`).length).toBeGreaterThan(1), T);
  });

  it('Yeni konum opens an empty window and posts the new location to the chosen warehouse', async () => {
    await openOn();
    fireEvent.click(command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni konum' }, T);
    expect(input('yeniKonumKodu').value).toBe('');
    type('yeniKonumKodu', 'b-02');
    type('yeniKonumAdi', 'Raf B');
    fireEvent.change(input('yeniUstKonum'), { target: { value: L1 } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/warehouses/${W1}/locations` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ code: 'B-02', name: 'Raf B', parentLocationId: L1 });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yeni konum' })).toBeNull(), T);
  });

  it('Pasife al row action saves the row as passive after confirmation', async () => {
    await openOn();
    await selectLocation('A-01');
    fireEvent.click(within(cell('A-01').closest('tr') as HTMLElement).getByRole('button', { name: 'Pasife al' }));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('A-01 · Raf A pasife alınsın mı?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/warehouses/${W1}/locations/${L1}` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ isActive: false, code: 'A-01', name: 'Raf A', parentLocationId: null, rowVersion: 'rv-A-01' });
  });

  it('Bakiyeler opens the selected location balance in a table window', async () => {
    await openOn();
    await selectLocation('A-01');
    await moreItem(/Bakiyeler/);
    const dialog = await screen.findByRole('dialog', { name: 'Konum bakiyesi · A-01' }, T);
    await waitFor(() => expect(gets(`/api/warehouses/${W1}/locations/${L1}/balances`).length).toBeGreaterThan(0), T);
    expect(await within(dialog).findByText('Kalem', {}, T)).toBeTruthy();
    expect((within(dialog).getByText('Kalem', { selector: 'td' }).closest('tr') as HTMLElement).textContent).toContain('4');
  });

  it('Konumlandırma denetimi opens the reconciliation table in a window', async () => {
    await openOn();
    await moreItem(/Konumlandırma denetimi/);
    const dialog = await screen.findByRole('dialog', { name: 'Konumlandırma denetimi' }, T);
    expect(await within(dialog).findByText('Kalem', {}, T)).toBeTruthy();
    expect(within(dialog).getByText(/Konumu boş eski hareketler burada görünür/)).toBeTruthy();
    expect((within(dialog).getByText('Kalem', { selector: 'td' }).closest('tr') as HTMLElement).textContent).toContain('KLM');
    expect(within(dialog).getByText('6', { selector: 'td' })).toBeTruthy();
  });

  it('TenantUser: Yeni konum and Düzenle are off and there is no Pasife al; the balance stays readable', async () => {
    operations = catalog.operations.map((operation) => operation.name.startsWith('depo.konum.') && operation.kind === 'write'
      ? { ...operation, allowed: false } : operation);
    await openOn(W1, 'TenantUser');
    await selectLocation();
    await settle(50);
    expect(command('new').getAttribute('aria-disabled')).toBe('true');
    expect(command('open').getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Pasife al' })).toBeNull();
    await moreItem(/Bakiyeler/);
    expect(await screen.findByRole('dialog', { name: 'Konum bakiyesi · A-01-03' }, T)).toBeTruthy();
  });
});
