import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './inventoryStockOperations.fixture.json';

// "Yeni stok kartı" standart tanımı (inventory-stock-create.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// Sayfa `{{sayfa.parametre.id}}` okur: boşsa yeni kart, doluysa o kart düzenlenir (Stok Kartları listesinin Aç komutu).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Operation = (typeof catalog.operations)[number];
type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };

const KEY = 'inventory-stock-create';
// Vitest runs from frontend/erp-web.
const standardPath = resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`);
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { screenKey: string; title: string; definition: Definition };

const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';
const U1 = 'cccccccc-0000-0000-0000-000000000001';
const NEW = '11111111-0000-0000-0000-0000000000aa';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const card = (id: string, code: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, code, name, barcode: `869${code}`, unitCode: 'ADET', category: 'Kırtasiye', minimumStock: 10, isActive: true, createdAt: '2026-01-01T00:00:00Z',
  rowVersion: `rv-${code}`, trackingMode: 'None', procurementLeadTimeDays: 3, manufacturingLeadTimeDays: 0, purchaseListPrice: 5, salesListPrice: 8,
  priceCurrencyCode: 'TRY', purchaseVatPercent: 20, salesVatPercent: 20, exciseTaxPercent: 0, communicationTaxPercent: 0,
  purchaseDiscountPercent: 0, salesDiscountPercent: 0, maximumStock: 100, reorderPoint: 15, safetyStock: 5, netWeight: null, grossWeight: null,
  length: null, width: null, height: null, productImageUrl: null, purchaseAccountCode: null, salesAccountCode: null, costAccountCode: null,
  marketplaceProductId: null, parentStockItemId: null, isVariantParent: false, withholdingTaxPercent: 0, stampTaxPercent: 0, ...extra,
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let operations: Operation[] = catalog.operations;
/** Bir sonraki eşleşen isteği hataya çeviren kurallar (yöntem + yol öneki). */
let failures: { method: string; url: string; status: number; error: string; exact?: boolean }[] = [];
/** Verilirse kart özel alan değerleri okuması bu söz çözülene kadar bekler (kaynak okuması yükleniyor durumu). */
let valuesGate: Promise<void> | null = null;
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/stock/categories') return [{ id: 'k1', name: 'Kırtasiye' }];
    if (path === '/api/tenant-settings/operations') return { tenantId: 't1', allowNegativeStock: false, updatedByUserId: null, updatedAt: null, rowVersion: 'o1' };
    if (path === '/api/stock/items/custom-fields') {
      return [{ id: 'd1', code: 'RENK', label: 'Renk', dataType: 'Text', maxLength: 40, version: 1, isRequired: false, isActive: true }];
    }
    if (path === `/api/stock/items/${S1}`) return card(S1, 'KLM', 'Kalem');
    if (path === `/api/stock/items/${S2}`) return card(S2, 'DFT', 'Defter');
    if (/^\/api\/stock\/items\/[^/]+\/units$/.test(path)) return { baseUnitCode: 'ADET', conversions: [{ id: U1, unitCode: 'KOLI', factorToBase: 12 }] };
    if (/^\/api\/stock\/items\/[^/]+\/custom-fields$/.test(path)) {
      const value = path.includes(S2) ? 'Sarı' : 'Mavi';
      return [{ definitionId: 'd1', code: 'RENK', label: 'Renk', dataType: 'Text', maxLength: 40, definitionVersion: 1, isRequired: false, value }];
    }
    if (/^\/api\/stock\/items\/[^/]+\/variants$/.test(path)) return [];
    if (path === '/api/manufacturing/boms') return [{ id: 'b1', code: 'RC-1', name: 'Kalem reçetesi', productStockItemId: S1, productName: 'Kalem', productTrackingMode: 'None', outputQuantity: 1, isActive: true, orderCount: 2, rowVersion: 'b' }];
  } else {
    if (path === '/api/stock/items' && method === 'POST') return { ...card(S2, 'YENI', 'Yeni'), id: NEW };
    if (path === `/api/stock/items/${S1}` && method === 'PUT') return card(S1, 'KLM', 'Kalem');
    if (/^\/api\/stock\/items\/[^/]+\/units$/.test(path) && method === 'POST') return { id: 'u-new', unitCode: 'PK', factorToBase: 6 };
    if (/^\/api\/stock\/items\/[^/]+\/units\/[^/]+$/.test(path) && method === 'DELETE') return null;
    if (/^\/api\/stock\/items\/[^/]+\/custom-fields$/.test(path) && method === 'PUT') return [];
  }
  throw new Error(`unexpected ${method} ${url}`);
}

/** `id` verilirse sayfa o kartı düzenler (listenin Aç komutunun parametresi), verilmezse yeni kart açar. */
function setup(id?: string, role = 'TenantAdmin') {
  setPageParams(KEY, id ? { id } : {});
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return {
        id: 'sp-create', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [],
        rights: { view: true, insert: true, update: true, delete: true }, screenKey: KEY, source: 'standard', standardVersion: 1,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    const failure = failures.find((rule) => rule.method === method && (rule.exact ? endpoint.split('?')[0] === rule.url : endpoint.startsWith(rule.url)));
    if (failure) {
      failures = failures.filter((rule) => rule !== failure);
      throw Object.assign(new Error(failure.error), { status: failure.status, serverError: failure.error });
    }
    if (valuesGate && method === 'GET' && /^\/api\/stock\/items\/[^/]+\/custom-fields$/.test(endpoint)) await valuesGate;
    return respond(endpoint, method);
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
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const ctrlS = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 's', ctrlKey: true });
const title = () => document.querySelector('.tenant-custom-page-header h1, .list-v2-title h1')?.textContent;
const renk = () => screen.getByLabelText('Renk') as HTMLInputElement;
/** Yeni kart: sayfa yüklenir, Kaydet hazır olur. */
const openNew = async () => {
  setup();
  await waitFor(() => expect(input('kod')).toBeTruthy(), T);
  await ready('save');
};
/** Kayıtlı kart: kaynak okumaları (kart, özel alan değerleri) yüklenir. */
const openCard = async (id = S1, role = 'TenantAdmin') => {
  setup(id, role);
  await waitFor(() => expect(input('ad').value).toBe(id === S1 ? 'Kalem' : 'Defter'), T);
  fireEvent.click(tab('Özel alanlar'));
  await waitFor(() => expect(renk().value).toBe(id === S1 ? 'Mavi' : 'Sarı'), T);
  fireEvent.click(tab('Genel'));
  await ready('save');
};

beforeEach(() => {
  calls = []; failures = []; valuesGate = null; operations = catalog.operations; navigations = []; api.mockReset();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  setPageParams(KEY, {});
});

describe('Yeni stok kartı standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('header says Yeni stok kartı for a new card and Stok kartı <code> for a saved one', async () => {
    await openNew();
    expect(title()).toBe('Yeni stok kartı');
    expect(gets(`/api/stock/items/${S1}`)).toEqual([]);
    // Başlık bileşenleri gövdede tekrarlanmaz.
    expect(screen.queryByRole('heading', { level: 2, name: 'Yeni stok kartı' })).toBeNull();
    cleanup();
    await openCard();
    await waitFor(() => expect(title()).toBe('Stok kartı KLM'), T);
    expect(screen.queryByRole('heading', { level: 2, name: 'Stok kartı KLM' })).toBeNull();
  });

  it('yeni then save posts exactly one card and returns to the list', async () => {
    await openNew();
    await waitFor(() => expect(tab('Genel').getAttribute('aria-selected')).toBe('true'), T);
    expect(input('kod').value).toBe('');
    type('kod', 'yeni-1');
    type('ad', 'Yeni kart');
    type('anaBirim', 'adet');
    ctrlS();
    await waitFor(() => expect(writes().length).toBeGreaterThan(0), T);
    await settle(100);
    expect(writes().filter((call) => call.method === 'PUT')).toEqual([]);
    const posts = writes().filter((call) => call.url === '/api/stock/items' && call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body!)).toMatchObject({ code: 'YENI-1', name: 'Yeni kart', unitCode: 'ADET', customFields: {}, variants: [] });
    // Eski ekran gibi: kayıttan sonra Stok Kartları listesine dönülür ve liste yenilenir; form bir sonraki kart için boşalır.
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'inventory-stock', params: {}, replace: true, from: KEY, refresh: true });
    await waitFor(() => expect(input('kod').value).toBe(''), T);
    expect(input('ad').value).toBe('');
    // Aynı değerlerle ikinci bir kart oluşturulmaz: boş form kaydedilmez.
    ctrlS();
    await settle(100);
    expect(writes().filter((call) => call.url === '/api/stock/items' && call.method === 'POST')).toHaveLength(1);
  });

  it('opened card saves PUT with source rowVersion and custom field PUT', async () => {
    await openCard();
    type('ad', 'Kalem (mavi)');
    fireEvent.click(tab('Özel alanlar'));
    fireEvent.change(renk(), { target: { value: 'Kırmızı' } });
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    const put = writes()[0];
    expect(put).toMatchObject({ method: 'PUT', url: `/api/stock/items/${S1}` });
    expect(JSON.parse(put.body!)).toMatchObject({ id: S1, code: 'KLM', name: 'Kalem (mavi)', barcode: '869KLM', rowVersion: 'rv-KLM', maximumStock: 100 });
    expect(writes()[1]).toEqual({ method: 'PUT', url: `/api/stock/items/${S1}/custom-fields`, body: '{"values":{"RENK":"Kırmızı"}}' });
    await waitFor(() => expect(navigations.map((request) => request.page)).toEqual(['inventory-stock']), T);
    expect(writes().filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('save while a source read loads writes nothing', async () => {
    let release = () => {};
    valuesGate = new Promise((done) => { release = done; });
    setup(S1);
    await waitFor(() => expect(input('ad').value).toBe('Kalem'), T);
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/custom-fields`)).toHaveLength(1), T);
    type('ad', 'Kalem (mavi)');
    ctrlS();
    await screen.findByText('Kaynak kayıt yükleniyor; biraz sonra yeniden deneyin.', {}, T);
    expect(writes()).toEqual([]);
    release();
    fireEvent.click(tab('Özel alanlar'));
    await waitFor(() => expect(renk().value).toBe('Mavi'), T);
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual([`PUT /api/stock/items/${S1}`, `PUT /api/stock/items/${S1}/custom-fields`]);
  });

  it('unit staging sends POST and DELETE after card save', async () => {
    await openCard();
    fireEvent.click(tab('Birimler'));
    await screen.findByText('KOLI', {}, T);
    expect(screen.getByText('Ana birim: ADET (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    const unitInputs = screen.getAllByLabelText(/^Birim \(satır/);
    fireEvent.change(unitInputs[unitInputs.length - 1], { target: { value: 'pk' } });
    const factorInputs = screen.getAllByLabelText(/^Ana birim katsayısı \(satır/);
    fireEvent.change(factorInputs[factorInputs.length - 1], { target: { value: '6' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Satırı sil' })[0]);
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(4), T);
    expect(writes().map((call) => `${call.method} ${call.url} ${call.body ?? ''}`)).toEqual([
      `PUT /api/stock/items/${S1} ${writes()[0].body}`,
      `POST /api/stock/items/${S1}/units {"unitCode":"PK","factorToBase":6}`,
      `DELETE /api/stock/items/${S1}/units/${U1} `,
      `PUT /api/stock/items/${S1}/custom-fields ${writes()[3].body}`,
    ]);
  });

  it('tenant user gating', async () => {
    operations = catalog.operations.map((operation) => ['stok.kart.sil', 'stok.kart.birimEkle', 'stok.kart.birimSil'].includes(operation.name)
      ? { ...operation, allowed: false } : operation);
    await openCard(S1, 'TenantUser');
    fireEvent.click(tab('Birimler'));
    expect(await screen.findByText('Birim dönüşümlerini yalnız firma yöneticisi değiştirebilir.', {}, T)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Satır ekle' })?.hasAttribute('disabled') ?? true).toBe(true);
    expect(command('save').getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(tab('Genel'));
    type('ad', 'Kalem 2');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes().some((call) => call.method === 'PUT' && call.url === `/api/stock/items/${S1}`)).toBe(true), T);
    expect(writes().filter((call) => call.url.includes('/units'))).toEqual([]);
  });

  it('recipes are read only with product filter', async () => {
    await openNew();
    await settle(400);
    // Yeni kartın reçetesi yoktur: süzgeçsiz reçete listesi hiç okunmaz.
    expect(gets('/api/manufacturing/boms')).toEqual([]);
    cleanup();
    await openCard();
    await waitFor(() => expect(gets('/api/manufacturing/boms')).toHaveLength(1), T);
    expect(gets('/api/manufacturing/boms')[0].url).toBe(`/api/manufacturing/boms?productStockItemId=${S1}`);
    fireEvent.click(tab('Reçeteler'));
    expect(await screen.findByText('Kalem reçetesi', {}, T)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Satır ekle' })).toBeNull();
  });

  it('clearing an optional field on edit', async () => {
    await openCard();
    expect(input('barkod').value).toBe('869KLM');
    expect(input('maksimumStok').value).toBe('100');
    type('barkod', '');
    type('maksimumStok', '');
    ctrlS();
    await waitFor(() => expect(writes().some((call) => call.method === 'PUT' && call.url === `/api/stock/items/${S1}`)).toBe(true), T);
    const body = JSON.parse(writes().find((call) => call.method === 'PUT' && call.url === `/api/stock/items/${S1}`)!.body!) as Record<string, unknown>;
    expect({ barcode: body.barcode, maximumStock: body.maximumStock }).toEqual({ barcode: '', maximumStock: null });
    expect({ reorderPoint: body.reorderPoint, minimumStock: body.minimumStock }).toEqual({ reorderPoint: 15, minimumStock: 10 });
  });

  it('clearing a non-nullable number on edit is required', async () => {
    await openCard();
    fireEvent.click(tab('Fiyat ve vergi'));
    type('alisKdv', '');
    fireEvent.click(tab('Genel'));
    type('minimumStok', '');
    ctrlS();
    await waitFor(() => expect(input('minimumStok').closest('.tenant-page-input')?.querySelector('.tenant-page-input-error')?.textContent).toBe('Bu alan zorunludur.'), T);
    await settle(100);
    expect(writes()).toEqual([]);
    expect(navigations).toEqual([]);
  });

  it('kart read failure blocks save and never creates a card', async () => {
    // Aç ile gelen kart okunamazsa sayfa onu yeni kart sanmaz: kayıt hiçbir şey yazmaz.
    failures = [{ method: 'GET', url: `/api/stock/items/${S1}`, status: 500, error: 'Sunucu hatası', exact: true }];
    setup(S1);
    await waitFor(() => expect(gets(`/api/stock/items/${S1}`)).toHaveLength(1), T);
    await waitFor(() => expect(input('kod')).toBeTruthy(), T);
    type('kod', 'yeni-1');
    type('ad', 'Yeni kart');
    type('anaBirim', 'adet');
    ctrlS();
    await screen.findByText('Kayıt okunamadı; hiçbir değişiklik kaydedilmedi. Kaydı yeniden açıp deneyin.', {}, T);
    ctrlS();
    await settle(100);
    expect(writes()).toEqual([]);
    expect(navigations).toEqual([]);
  });

  it('custom field values read failure writes nothing', async () => {
    failures = [{ method: 'GET', url: `/api/stock/items/${S1}/custom-fields`, status: 500, error: 'Sunucu hatası', exact: true }];
    setup(S1);
    await waitFor(() => expect(input('ad').value).toBe('Kalem'), T);
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/custom-fields`)).toHaveLength(1), T);
    await settle(50);
    type('ad', 'Kalem (mavi)');
    ctrlS();
    await screen.findByText('Kayıt okunamadı; hiçbir değişiklik kaydedilmedi. Kaydı yeniden açıp deneyin.', {}, T);
    await settle(100);
    expect(writes()).toEqual([]);
  });

  it('without custom field right a scalar edit still saves', async () => {
    operations = catalog.operations.map((operation) => operation.name === 'stok.kart.ozelAlanKaydet' ? { ...operation, allowed: false } : operation);
    await openCard(S1, 'TenantUser');
    type('ad', 'Kalem 2');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    await settle(100);
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual([`PUT /api/stock/items/${S1}`]);
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ name: 'Kalem 2' });
  });

  it('without custom field right a custom field change is refused before any write', async () => {
    operations = catalog.operations.map((operation) => operation.name === 'stok.kart.ozelAlanKaydet' ? { ...operation, allowed: false } : operation);
    await openCard(S1, 'TenantUser');
    type('ad', 'Kalem 2');
    fireEvent.click(tab('Özel alanlar'));
    fireEvent.change(renk(), { target: { value: 'Kırmızı' } });
    fireEvent.click(command('save'));
    await screen.findByText('Stok kartı özel alanlarını kaydet için yetkiniz yok; bu değişiklik kaydedilemez. Hiçbir değişiklik kaydedilmedi.', {}, T);
    await settle(100);
    expect(writes()).toEqual([]);
  });

  it('refresh with the card open keeps updating the same card', async () => {
    await openCard();
    const before = gets(`/api/stock/items/${S1}`).length;
    fireEvent.click(command('refresh'));
    await waitFor(() => expect(gets(`/api/stock/items/${S1}`).length).toBeGreaterThan(before), T);
    await settle(400);
    expect(input('ad').value).toBe('Kalem');
    type('ad', 'Kalem (yenilendi)');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual([`PUT /api/stock/items/${S1}`, `PUT /api/stock/items/${S1}/custom-fields`]);
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ id: S1, name: 'Kalem (yenilendi)', rowVersion: 'rv-KLM' });
  });

  it('yeni on an opened card starts a fresh card that does not carry the old values', async () => {
    await openCard();
    fireEvent.keyDown(document.body, { key: 'F2' });
    // Yeni, aynı ekranı parametresiz açar: sayfa yeni kartla baştan kurulur.
    await waitFor(() => expect(navigations.map((request) => [request.page, request.params])).toEqual([[KEY, {}]]), T);
    await waitFor(() => expect(title()).toBe('Yeni stok kartı'), T);
    await waitFor(() => expect(input('kod').value).toBe(''), T);
    fireEvent.click(tab('Özel alanlar'));
    expect(renk().value).toBe('');
    fireEvent.change(renk(), { target: { value: 'Yeşil' } });
    fireEvent.click(tab('Genel'));
    type('kod', 'yeni-2');
    type('ad', 'Yeni kart');
    type('anaBirim', 'adet');
    await settle(450);
    fireEvent.click(tab('Özel alanlar'));
    expect(renk().value).toBe('Yeşil');
    expect(input('kod').value).toBe('YENI-2');
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/stock/items' });
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ code: 'YENI-2', name: 'Yeni kart', customFields: { RENK: 'Yeşil' } });
    expect(writes()[0].body).not.toContain('Mavi');
  });

  it('yeni on a dirty card asks before clearing', async () => {
    await openNew();
    type('ad', 'Kirli');
    fireEvent.keyDown(document.body, { key: 'F2' });
    const confirm = await screen.findByRole('alertdialog', {}, T);
    expect(confirm.textContent).toContain('Kaydedilmemiş değişiklikler kaybolacak');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));
    await settle(50);
    expect(input('ad').value).toBe('Kirli');
    fireEvent.keyDown(document.body, { key: 'F2' });
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, T)).getByRole('button', { name: 'Devam' }));
    await waitFor(() => expect(input('ad').value).toBe(''), T);
    expect(writes()).toEqual([]);
  });

  it('opening another card starts fresh instead of carrying typed values', async () => {
    await openCard();
    type('ad', 'Kalem (yazıldı)');
    // Liste aynı sekmede başka bir kartı açar (Aç → id değişir).
    act(() => setPageParams(KEY, { id: S2 }));
    await waitFor(() => expect(input('ad').value).toBe('Defter'), T);
    await waitFor(() => expect(title()).toBe('Stok kartı DFT'), T);
    fireEvent.click(tab('Özel alanlar'));
    await waitFor(() => expect(renk().value).toBe('Sarı'), T);
    expect(writes()).toEqual([]);
  });

  it('retry after a partial create says field changes need reopening', async () => {
    failures = [{ method: 'POST', url: `/api/stock/items/${NEW}/units`, status: 400, error: 'Birim kodu geçersiz', exact: true }];
    await openNew();
    type('kod', 'yeni-3');
    type('ad', 'Yeni kart');
    type('anaBirim', 'adet');
    fireEvent.click(tab('Birimler'));
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    fireEvent.change(screen.getAllByLabelText(/^Birim \(satır/)[0], { target: { value: 'pk' } });
    fireEvent.change(screen.getAllByLabelText(/^Ana birim katsayısı \(satır/)[0], { target: { value: '6' } });
    ctrlS();
    await screen.findByText(/Önceki 1 işlem kaydedildi/, {}, T);
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual(['POST /api/stock/items', `POST /api/stock/items/${NEW}/units`]);
    calls = [];
    fireEvent.click(tab('Genel'));
    type('ad', 'Yeni kart 2');
    ctrlS();
    await screen.findByText(/Kart oluşturuldu; alan değişiklikleri için kartı yeniden açın\.$/, {}, T);
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual([`POST /api/stock/items/${NEW}/units`]);
    // Kısmi kayıtta liste açılmaz: kullanıcı uyarıyı görür.
    expect(navigations).toEqual([]);
  });
});
