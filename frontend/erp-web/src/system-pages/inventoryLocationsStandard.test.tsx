import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { setPageParams } from '../pageNavigation';
import catalog from './inventoryWarehouseOperations.fixture.json';

// Raf ve Konumlar standart tanımı (inventory-locations.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
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
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const settle = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const ctrlS = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 's', ctrlKey: true });
const cell = (text: string) => screen.getByText(text, { selector: '.tenant-page-data-grid td' });
const warehouseSelect = () => within(screen.getByRole('region', { name: 'Süzgeçler' })).getByLabelText('Depo') as HTMLSelectElement;
/** Depolar'dan geçiş: sayfa `warehouseId` parametresiyle açılır. */
const openOn = async (warehouseId = W1, role = 'TenantAdmin') => {
  setPageParams(KEY, { warehouseId });
  setup(role);
  await screen.findByText('A-01', { selector: '.tenant-page-data-grid td' }, T);
};
const selectLocation = async (code = 'A-01-03') => {
  fireEvent.click(cell(code));
  await waitFor(() => expect(gets(`/api/warehouses/${W1}/locations/${code === 'A-01' ? L1 : L2}/balances`).length).toBeGreaterThan(0), T);
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
  });

  it('without a warehouse nothing is read and the page asks for one', async () => {
    setup();
    expect(await screen.findByText('Konumları görmek için önce bir depo seçin.', {}, T)).toBeTruthy();
    await settle(200);
    expect(calls.filter((call) => /locations|reconciliation/.test(call.url))).toEqual([]);
    expect(screen.getByText('Konum eklemek için önce depo seçin.')).toBeTruthy();
    // Depo seçilince konumlar ve denetim o depo için okunur.
    await waitFor(() => expect(within(warehouseSelect()).getByRole('option', { name: 'Merkez' })).toBeTruthy(), T);
    fireEvent.change(warehouseSelect(), { target: { value: W1 } });
    await screen.findByText('A-01', { selector: '.tenant-page-data-grid td' }, T);
    expect(gets(`/api/warehouses/${W1}/location-reconciliation`).length).toBeGreaterThan(0);
  });

  it('a hand-off from Depolar opens on that warehouse (page parameter wins over the stored filter)', async () => {
    localStorage.setItem(`nexora.filterBar.t1.@${KEY}.suzgec`, JSON.stringify({ search: '', values: { warehouseId: W2 } }));
    await openOn(W1);
    expect(warehouseSelect().value).toBe(W1);
    expect(gets(`/api/warehouses/${W2}/locations`)).toEqual([]);
    expect(await screen.findByText('6', { selector: '.tenant-page-data-grid td' }, T)).toBeTruthy();
  });

  it('a selected location opens its form and its balance; save sends the full PUT with the row version', async () => {
    await openOn();
    await selectLocation();
    expect(input('konumKodu').value).toBe('A-01-03');
    expect(input('ustKonum').value).toBe(L1);
    expect((input('konumAktif') as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect(screen.getAllByText('Kalem', { selector: '.tenant-page-data-grid td' })).toHaveLength(2), T);
    await ready('save');
    type('konumAdi', 'Göz 3');
    fireEvent.change(input('ustKonum'), { target: { value: '' } });
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/warehouses/${W1}/locations/${L2}` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ code: 'A-01-03', name: 'Göz 3', parentLocationId: null, isActive: true, rowVersion: 'rv-A-01-03' });
  });

  it('nothing selected is the create form: save posts the new location to the chosen warehouse', async () => {
    await openOn();
    expect(screen.getByRole('heading', { name: 'Konum oluştur' })).toBeTruthy();
    expect(input('konumAktif')).toBeNull();
    await ready('save');
    type('konumKodu', 'b-02');
    type('konumAdi', 'Raf B');
    fireEvent.change(input('ustKonum'), { target: { value: L1 } });
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/warehouses/${W1}/locations` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ code: 'B-02', name: 'Raf B', parentLocationId: L1 });
    await waitFor(() => expect(input('konumKodu').value).toBe(''), T);
    ctrlS();
    await settle(150);
    expect(writes()).toHaveLength(1);
  });

  it('Diğer → Pasife al saves the row as passive after confirmation', async () => {
    await openOn();
    await selectLocation('A-01');
    fireEvent.click(command('more'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Pasife al/ }, T));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('A-01 · Raf A pasife alınsın mı?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/warehouses/${W1}/locations/${L1}` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ isActive: false, code: 'A-01', name: 'Raf A', parentLocationId: null, rowVersion: 'rv-A-01' });
  });

  it('TenantUser: read-only summary and balance, no form and no Pasife al', async () => {
    operations = catalog.operations.map((operation) => operation.name.startsWith('depo.konum.') && operation.kind === 'write'
      ? { ...operation, allowed: false } : operation);
    await openOn(W1, 'TenantUser');
    expect(screen.getByText('Bir konum seçin.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Konum oluştur' })).toBeNull();
    await selectLocation();
    expect(input('konumKodu')).toBeNull();
    await waitFor(() => expect(screen.getAllByText('Kalem', { selector: '.tenant-page-data-grid td' })).toHaveLength(2), T);
    expect(screen.getByRole('heading', { name: 'Depo konumu' })).toBeTruthy();
    fireEvent.click(command('more'));
    await settle();
    expect(screen.queryByRole('menuitem', { name: /Pasife al/ })).toBeNull();
  });
});
