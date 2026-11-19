import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './inventoryWarehouseOperations.fixture.json';

// Depo Yönetimi standart tanımı (inventory-warehouses.json, sürüm 2) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
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
const values = (value: string) => [{ definitionId: 'd1', code: 'BOLGE', label: 'Bölge', dataType: 'Text', maxLength: 40, definitionVersion: 1, isRequired: false, value }];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let operations: Operation[] = catalog.operations;
let rows = [warehouse(W1, 'MRK', 'Merkez'), warehouse(W2, 'YDK', 'Yedek depo'), warehouse(W3, 'ESK', 'Eski depo', false)];
/** Kayıtlı özel alan değeri (PUT sonrası okuma yeni değeri döner). */
let bolgeValue = 'Marmara';
let failures: { method: string; url: string; status: number; error: string }[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string, body?: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/warehouses') return rows;
    if (path === '/api/warehouses/custom-fields') return [{ id: 'd1', code: 'BOLGE', label: 'Bölge', dataType: 'Text', maxLength: 40, version: 1, isRequired: false, isActive: true }];
    if (/^\/api\/warehouses\/[^/]+\/custom-fields$/.test(path)) return values(bolgeValue);
    if (path === `/api/warehouses/${W1}/locations`) return [{ id: L1, warehouseId: W1, code: 'A-01', name: 'Raf A', parentLocationId: null, isActive: true, rowVersion: 'l1' }];
    if (/^\/api\/warehouses\/[^/]+\/locations$/.test(path)) return [];
  } else {
    const parsed = body ? JSON.parse(body) as Record<string, unknown> : {};
    if (path === '/api/warehouses' && method === 'POST') return warehouse(NEW, String(parsed.code), String(parsed.name));
    if (/^\/api\/warehouses\/[^/]+$/.test(path) && method === 'PUT') {
      const id = path.split('/')[3];
      return warehouse(id, String(parsed.code), String(parsed.name), true, 'rv-new');
    }
    if (/^\/api\/warehouses\/[^/]+\/custom-fields$/.test(path) && method === 'PUT') {
      bolgeValue = String((parsed.values as Record<string, string>).BOLGE ?? '');
      return values(bolgeValue);
    }
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
const bolge = () => screen.getByLabelText('Bölge') as HTMLInputElement;
const menuItems = async () => {
  fireEvent.click(command('more'));
  const items = await screen.findAllByRole('menuitem', {}, T);
  return items;
};
const openList = async (role = 'TenantAdmin') => {
  setup(role);
  await screen.findByText('Merkez', { selector: '.tenant-page-data-grid td' }, T);
};
const selectWarehouse = async (name = 'Merkez', id = W1) => {
  fireEvent.click(cell(name));
  await waitFor(() => expect(input('depoAdi').value).toBe(name), T);
  await waitFor(() => expect(gets(`/api/warehouses/${id}/custom-fields`).length).toBeGreaterThan(0), T);
  await waitFor(() => expect(bolge().value).toBe('Marmara'), T);
};

beforeEach(() => {
  calls = []; failures = []; bolgeValue = 'Marmara'; operations = catalog.operations; navigations = []; api.mockReset();
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
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect(standard.version).toBe(2);
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
    // Süzgeç yalnız yüklenen satırlara uygulanır: liste yeniden okunmaz.
    expect(gets('/api/warehouses')).toHaveLength(1);
  });

  it('nothing selected shows the new warehouse form; a row opens its record with custom fields and locations', async () => {
    await openList();
    expect(screen.getByRole('heading', { name: 'Yeni depo' })).toBeTruthy();
    expect(input('depoKodu').value).toBe('');
    await selectWarehouse();
    expect(input('depoKodu').value).toBe('MRK');
    expect(screen.queryByRole('heading', { name: 'Yeni depo' })).toBeNull();
    expect(gets(`/api/warehouses/${W1}/locations`)).toHaveLength(1);
    expect(await screen.findByText('A-01', { selector: '.tenant-page-data-grid td' }, T)).toBeTruthy();
    // Depo listesi tek çağrıda gelir; tek kayıt okuması yoktur.
    expect(calls.filter((call) => /^\/api\/warehouses\/[^/]+$/.test(call.url.split('?')[0]) && !call.url.includes('custom-fields') && call.method === 'GET')).toEqual([]);
  });

  it('a rename sends only the warehouse PUT with the row version of the selected row', async () => {
    await openList();
    await selectWarehouse();
    await ready('save');
    type('depoAdi', 'Merkez depo');
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: `/api/warehouses/${W1}` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ code: 'MRK', name: 'Merkez depo', rowVersion: 'rv-MRK' });
    // Liste kayıttan sonra yenilenir.
    await waitFor(() => expect(gets('/api/warehouses').length).toBeGreaterThan(1), T);
  });

  it('a custom field change sends only the custom field PUT', async () => {
    await openList();
    await selectWarehouse();
    await ready('save');
    fireEvent.change(bolge(), { target: { value: 'Ege' } });
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toEqual({ method: 'PUT', url: `/api/warehouses/${W1}/custom-fields`, body: '{"values":{"BOLGE":"Ege"}}' });
  });

  it('nothing changed: Kaydet writes nothing', async () => {
    await openList();
    await selectWarehouse();
    await ready('save');
    ctrlS();
    await settle(150);
    expect(writes()).toEqual([]);
  });

  it('partial failure: a retry sends the warehouse PUT again with the same row version and not the saved custom fields', async () => {
    await openList();
    await selectWarehouse();
    await ready('save');
    type('depoAdi', 'Merkez depo');
    fireEvent.change(bolge(), { target: { value: 'Ege' } });
    failures = [{ method: 'PUT', url: `/api/warehouses/${W1}`, status: 409, error: 'Depo başka bir işlemde değiştirildi.' }];
    ctrlS();
    await screen.findByText(/Depo başka bir işlemde değiştirildi/, {}, T);
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual([`PUT /api/warehouses/${W1}/custom-fields`, `PUT /api/warehouses/${W1}`]);
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(3), T);
    expect(writes()[2].url).toBe(`/api/warehouses/${W1}`);
    expect(JSON.parse(writes()[2].body!)).toMatchObject({ rowVersion: 'rv-MRK' });
  });

  it('Yeni then save posts one warehouse with its custom fields; the cleared form does not post again', async () => {
    await openList();
    await selectWarehouse();
    await ready('new');
    fireEvent.click(command('new'));
    await waitFor(() => expect(input('depoKodu').value).toBe(''), T);
    expect(screen.getByRole('heading', { name: 'Yeni depo' })).toBeTruthy();
    type('depoKodu', 'yeni');
    type('depoAdi', 'Yeni depo');
    await waitFor(() => expect(bolge().value).toBe(''), T);
    fireEvent.change(bolge(), { target: { value: 'Karadeniz' } });
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/warehouses' });
    expect(JSON.parse(writes()[0].body!)).toEqual({ code: 'YENI', name: 'Yeni depo', customFields: { BOLGE: 'Karadeniz' } });
    await waitFor(() => expect(input('depoKodu').value).toBe(''), T);
    ctrlS();
    await settle(150);
    expect(writes()).toHaveLength(1);
  });

  it('Diğer: Devre dışı bırak posts the fixed status body after confirmation; a passive warehouse offers Yeniden etkinleştir', async () => {
    await openList();
    await selectWarehouse();
    const items = await menuItems();
    expect(items.map((item) => item.textContent)).not.toContain('Yeniden etkinleştir');
    fireEvent.click(items.find((item) => item.textContent === 'Devre dışı bırak')!);
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('MRK · Merkez devre dışı bırakılsın mı?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toEqual({ method: 'POST', url: `/api/warehouses/${W1}/status`, body: '{"isActive":false,"confirmation":true}' });
  });

  it('passive warehouse: custom fields are read only, no Lokasyon ekle, status menu offers activation', async () => {
    await openList();
    fireEvent.click(cell('Eski depo'));
    await waitFor(() => expect(input('depoAdi').value).toBe('Eski depo'), T);
    expect(screen.getByText('Devre dışı depoda değerler kaydedilemez.')).toBeTruthy();
    await waitFor(() => expect(bolge().disabled).toBe(true), T);
    expect(screen.queryByRole('button', { name: 'Lokasyon ekle' })).toBeNull();
    const items = await menuItems();
    expect(items.map((item) => item.textContent)).not.toContain('Devre dışı bırak');
    fireEvent.click(items.find((item) => item.textContent === 'Yeniden etkinleştir')!);
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, T)).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toEqual({ method: 'POST', url: `/api/warehouses/${W3}/status`, body: '{"isActive":true,"confirmation":true}' });
  });

  it('status change waits for unsaved edits', async () => {
    await openList();
    await selectWarehouse();
    type('depoAdi', 'Değişti');
    fireEvent.click(command('more'));
    const item = await screen.findByRole('menuitem', { name: /Devre dışı bırak/ }, T);
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });

  it('Tümünü yönet and Lokasyon ekle open Raf ve Konumlar with the warehouse as page parameter', async () => {
    await openList();
    await selectWarehouse();
    fireEvent.click(await screen.findByRole('button', { name: '1 · Tümünü yönet ›' }, T));
    fireEvent.click(screen.getByRole('button', { name: 'Lokasyon ekle' }));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    for (const request of navigations) expect(request).toMatchObject({ page: 'inventory-locations', params: { warehouseId: W1 }, replace: false });
  });

  it('TenantUser sees no Lokasyon ekle (locations are TenantAdmin-only)', async () => {
    await openList('TenantUser');
    await selectWarehouse();
    expect(await screen.findByRole('button', { name: '1 · Tümünü yönet ›' }, T)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lokasyon ekle' })).toBeNull();
  });
});
