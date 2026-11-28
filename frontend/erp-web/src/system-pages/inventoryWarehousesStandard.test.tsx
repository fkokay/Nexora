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
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './inventoryWarehouseOperations.fixture.json';

// Depo Yönetimi standart tanımı (inventory-warehouses.json, sürüm 3, Liste kalıbı) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// Yeni depo / Düzenle birer pencere; Pasife al / Etkinleştir / Konumlar satır eylemleri. Depo özel alanları bu sürümde yok.
// `inventoryWarehouseOperations.fixture.json`, ErpOperationCatalog'un depo işlemlerinin (yönetici, allowed: true) anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Operation = (typeof catalog.operations)[number];
type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };

const standardPath = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-warehouses.json');
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { screenKey: string; title: string; version: number; definition: Definition };

const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const W2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const W3 = 'aaaaaaaa-0000-0000-0000-000000000003';
const NEW = 'aaaaaaaa-0000-0000-0000-0000000000aa';
const L1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const KEY = 'inventory-warehouses';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;
const warehouse = (id: string, code: string, name: string, isActive = true, rowVersion = `rv-${code}`) => ({ id, code, name, isActive, rowVersion });

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let operations: Operation[] = catalog.operations;
let rows = [warehouse(W1, 'MRK', 'Merkez'), warehouse(W2, 'YDK', 'Yedek depo'), warehouse(W3, 'ESK', 'Eski depo', false)];
let failures: { method: string; url: string; status: number; error: string }[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string, body?: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/warehouses') return rows;
    if (path === `/api/warehouses/${W1}/locations`) return [{ id: L1, warehouseId: W1, code: 'A-01', name: 'Raf A', parentLocationId: null, isActive: true, rowVersion: 'l1' }];
    if (/^\/api\/warehouses\/[^/]+\/locations$/.test(path)) return [];
    if (path === '/api/warehouses/custom-fields') return [];
    if (/^\/api\/warehouses\/[^/]+\/custom-fields$/.test(path)) return [];
  } else {
    const parsed = body ? JSON.parse(body) as Record<string, unknown> : {};
    if (path === '/api/warehouses' && method === 'POST') return warehouse(NEW, String(parsed.code), String(parsed.name));
    if (/^\/api\/warehouses\/[^/]+$/.test(path) && method === 'PUT') {
      const id = path.split('/')[3];
      return warehouse(id, String(parsed.code), String(parsed.name), true, 'rv-new');
    }
    if (/^\/api\/warehouses\/[^/]+\/custom-fields$/.test(path) && method === 'PUT') return [];
    if (/^\/api\/warehouses\/[^/]+\/status$/.test(path) && method === 'POST') {
      const id = path.split('/')[3];
      const row = rows.find((item) => item.id === id)!;
      return { ...row, isActive: parsed.isActive === true };
    }
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return {
        id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 2, forms: [],
        rights: { view: true, insert: true, update: true, delete: true }, screenKey: KEY, source: 'standard', standardVersion: standard.version,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url: endpoint, method, body });
    const failure = failures.find((rule) => rule.method === method && endpoint.split('?')[0] === rule.url);
    if (failure) {
      failures = failures.filter((rule) => rule !== failure);
      throw Object.assign(new Error(failure.error), { status: failure.status, serverError: failure.error });
    }
    return respond(endpoint, method, body);
  });
  return render(
    <CommandProvider>
      <ActionBarSlotProvider breadcrumb={<nav aria-label="Konum">Ana Sayfa › Depo Yönetimi</nav>}>
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
const cell = (text: string) => screen.getByText(text, { selector: '.tenant-page-data-grid td' });
const rowOf = (text: string) => cell(text).closest('tr') as HTMLElement;
const detail = () => document.querySelector('.tenant-page-detail') as HTMLElement;
const openList = async (role = 'TenantAdmin') => {
  setup(role);
  await screen.findByText('Merkez', { selector: '.tenant-page-data-grid td' }, T);
};
const pick = async (name: string) => {
  fireEvent.click(cell(name));
  await waitFor(() => expect(detail().querySelector('h3')?.textContent).toBe(name), T);
};
const save = async () => {
  const dialog = await screen.findByRole('dialog', {}, T);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
};

beforeEach(() => {
  calls = []; failures = []; operations = catalog.operations; navigations = []; api.mockReset();
  rows = [warehouse(W1, 'MRK', 'Merkez'), warehouse(W2, 'YDK', 'Yedek depo'), warehouse(W3, 'ESK', 'Eski depo', false)];
  localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
});

describe('Depo Yönetimi standart tanımı', { timeout: 30000 }, () => {
  it('uses warehouse custom-field read and write operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect(standard.definition.queries.map((item) => item.operation).sort()).toEqual(
      ['depo.aktifEt', 'depo.guncelle', 'depo.konumlari', 'depo.listele', 'depo.olustur', 'depo.ozelAlanDegerleri', 'depo.ozelAlanKaydet', 'depo.ozelAlanTanimlari', 'depo.pasifeAl']);
    expect(standard.version).toBe(4);
  });

  it('lists warehouses with Aktif / Pasif; search and Durum filter the loaded rows', async () => {
    await openList();
    expect(gets('/api/warehouses')).toHaveLength(1);
    expect(screen.getAllByText('Pasif', { selector: '.tenant-page-data-grid td *' })).toHaveLength(1);
    fireEvent.change(input('suzgec'), { target: { value: 'yed' } });
    await waitFor(() => expect(screen.queryByText('Merkez', { selector: '.tenant-page-data-grid td' })).toBeNull(), T);
    expect(cell('Yedek depo')).toBeTruthy();
    fireEvent.change(input('suzgec'), { target: { value: '' } });
    const status = within(screen.getByRole('region', { name: 'Süzgeçler' })).getByLabelText('Durum') as HTMLSelectElement;
    fireEvent.change(status, { target: { value: 'false' } });
    await waitFor(() => expect(screen.queryByText('Merkez', { selector: '.tenant-page-data-grid td' })).toBeNull(), T);
    expect(cell('Eski depo')).toBeTruthy();
    expect(gets('/api/warehouses')).toHaveLength(1);
  });

  it('the card group asks for a selection, then shows the picked warehouse with its location count', async () => {
    await openList();
    expect(within(detail()).getByText('Bir depo seçin; ayrıntıları burada görün.')).toBeTruthy();
    await pick('Merkez');
    expect(within(detail()).queryByText('Bir depo seçin; ayrıntıları burada görün.')).toBeNull();
    await waitFor(() => expect(gets(`/api/warehouses/${W1}/locations`)).toHaveLength(1), T);
    const metric = within(detail()).getByText('Konum sayısı', { selector: '.tenant-metric-label' }).closest('article') as HTMLElement;
    await waitFor(() => expect(metric.querySelector('strong')?.textContent).toBe('1'), T);
    await pick('Eski depo');
    expect(within(detail()).getByText('Devre dışı depoda hareket girilemez.')).toBeTruthy();
  });

  it('Yeni depo opens an empty window and posts one warehouse with only code and name', async () => {
    await openList();
    await pick('Merkez');
    fireEvent.click(command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni depo' }, T);
    expect(input('yeniDepoKodu').value).toBe('');
    expect(input('yeniDepoAdi').value).toBe('');
    type('yeniDepoKodu', 'yeni');
    type('yeniDepoAdi', 'Yeni depo');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/warehouses' });
    expect(JSON.parse(writes()[0].body!)).toEqual({ code: 'YENI', name: 'Yeni depo' });
    // Pencere kapanır ve liste yenilenir.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yeni depo' })).toBeNull(), T);
    await waitFor(() => expect(gets('/api/warehouses').length).toBeGreaterThan(1), T);
  });

  it('Düzenle is off without a selection; the window opens filled and a rename sends the warehouse PUT with the row version', async () => {
    await openList();
    expect(command('open').getAttribute('aria-disabled')).toBe('true');
    await pick('Merkez');
    await waitFor(() => expect(command('open').getAttribute('aria-disabled')).not.toBe('true'), T);
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: 'Depo · MRK' }, T);
    expect(input('depoKodu').value).toBe('MRK');
    expect(input('depoAdi').value).toBe('Merkez');
    type('depoAdi', 'Merkez depo');
    await waitFor(() => expect(calls.some((call) => call.method === 'GET' && call.url === `/api/warehouses/${W1}/custom-fields`)).toBe(true), T);
    await new Promise((done) => setTimeout(done, 150));
    await save();
    await waitFor(() => expect(writes().length).toBe(2), T);
    expect(writes()[1]).toMatchObject({ method: 'PUT', url: `/api/warehouses/${W1}/custom-fields` });
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/warehouses/${W1}` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ code: 'MRK', name: 'Merkez depo', rowVersion: 'rv-MRK' });
    await waitFor(() => expect(gets('/api/warehouses').length).toBeGreaterThan(1), T);
  });

  it('Pasife al posts the fixed status body after confirmation; a passive row offers Etkinleştir instead', async () => {
    await openList();
    await pick('Merkez');
    expect(within(rowOf('Merkez')).queryByRole('button', { name: 'Etkinleştir' })).toBeNull();
    fireEvent.click(within(rowOf('Merkez')).getByRole('button', { name: 'Pasife al' }));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('MRK · Merkez pasife alınsın mı?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toEqual({ method: 'POST', url: `/api/warehouses/${W1}/status`, body: '{"isActive":false,"confirmation":true}' });

    await pick('Eski depo');
    expect(within(rowOf('Eski depo')).queryByRole('button', { name: 'Pasife al' })).toBeNull();
    fireEvent.click(within(rowOf('Eski depo')).getByRole('button', { name: 'Etkinleştir' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, T)).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toEqual({ method: 'POST', url: `/api/warehouses/${W3}/status`, body: '{"isActive":true,"confirmation":true}' });
  });

  it('Konumlar › opens Raf ve Konumlar with the warehouse as page parameter', async () => {
    await openList();
    await pick('Merkez');
    fireEvent.click(within(rowOf('Merkez')).getByRole('button', { name: 'Konumlar ›' }));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'inventory-locations', params: { warehouseId: W1 }, replace: false });
  });
});
