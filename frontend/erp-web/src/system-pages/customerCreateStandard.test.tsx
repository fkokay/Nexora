import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './customerCreateOperations.fixture.json';

// "Cari kart" standart tanımı (customer-create.json): yeni ve düzenleme tek tanım. `{{sayfa.parametre.customerId}}` boşsa yeni
// kart (cari.olustur), doluysa o kart düzenlenir (cari.getir + cari.guncelle). Birincil adres noktalı gövde parametreleriyle
// kartla aynı istekte gider.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'customer-create';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const C1 = '22222222-0000-0000-0000-000000000001';
const NEW = '22222222-0000-0000-0000-0000000000aa';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const card = (extra: Record<string, unknown> = {}) => ({
  id: C1, code: 'C-1001', name: 'FATİH KOKAY', type: 'Both', taxNumber: '1234567890', isActive: true, createdAt: '2026-01-01T00:00:00Z', rowVersion: 'rv-1',
  groupId: null, groupName: null, currencyCode: 'TRY', riskLimit: 250000, paymentTermDays: 30, identityNumber: null, taxOffice: 'Konya VD',
  parentCompanyId: null, parentCompanyName: null, subsidiaryCount: 0, customFields: {}, isEInvoiceRegistered: false, eInvoiceRecipientAlias: null,
  phone: null, email: null, website: null, contactName: null, contactPhone: null, contactEmail: null, priceListCode: null,
  receivableAccountCode: null, payableAccountCode: null, bankName: null, bankBranchCode: null, iban: null,
  defaultAddressId: 'a1', defaultAddressLabel: 'Merkez', defaultAddressLine: 'Feritpaşa Mah.', defaultAddressCity: 'Konya', defaultAddressDistrict: 'Selçuklu',
  defaultAddressPostalCode: '42000', defaultAddressCountryCode: 'TR', defaultAddressLatitude: null, defaultAddressLongitude: null, ...extra,
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
let failures: { method: string; url: string; status: number; error: string; fieldErrors?: Record<string, string[]> }[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/customer-groups') return [{ id: 'g1', code: 'BAY', name: 'Bayiler', isActive: true }];
    if (path === '/api/customers/company-options') return [];
    if (path === '/api/customers/custom-fields') return [];
    if (path === `/api/customers/${C1}`) return card();
    if (path === `/api/customers/${C1}/custom-fields`) return [];
    if (path === `/api/customers/${C1}/addresses`) {
      return [{ id: 'a1', kind: 'General', label: 'Merkez', addressLine: 'Feritpaşa Mah.', city: 'Konya', district: 'Selçuklu', postalCode: '42000', countryCode: 'TR', isDefault: true, isActive: true, latitude: null, longitude: null }];
    }
  } else {
    if (path === '/api/customers' && method === 'POST') return { ...card(), id: NEW };
    if (path === `/api/customers/${C1}` && method === 'PUT') return card();
    if (path === `/api/customers/${C1}/custom-fields` && method === 'PUT') return [];
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(customerId?: string) {
  setPageParams(KEY, customerId ? { customerId } : {});
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        screenKey: KEY, source: 'standard', standardVersion: 1, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    const failure = failures.find((rule) => rule.method === method && endpoint.split('?')[0] === rule.url);
    if (failure) {
      failures = failures.filter((rule) => rule !== failure);
      throw Object.assign(new Error(failure.error), { status: failure.status, serverError: failure.error, fieldErrors: failure.fieldErrors });
    }
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt('TenantAdmin')} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const posts = () => writes().filter((call) => call.method === 'POST' && call.url === '/api/customers');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const settle = (ms = 50) => new Promise((done) => setTimeout(done, ms));
const title = () => document.querySelector('.tenant-custom-page-header h1, .list-v2-title h1')?.textContent;
const tab = (name: string) => screen.queryByRole('tab', { name: new RegExp(`^${name}`) });
const menuItem = async (name: RegExp) => {
  fireEvent.click(command('more'));
  return screen.findByRole('menuitem', { name });
};
const openNew = async () => {
  setup();
  await waitFor(() => expect(input('kod')).toBeTruthy(), T);
  await ready('save');
};
const openCard = async () => {
  setup(C1);
  await waitFor(() => expect(input('unvan').value).toBe('FATİH KOKAY'), T);
  await ready('save');
};
const fillNew = (code: string, name: string) => {
  type('kod', code);
  type('unvan', name);
  type('doviz', 'try');
  // Vade zorunludur (sunucu varsayılanı 0'a bırakılmaz).
  type('vadeGunu', '30');
};

beforeEach(() => {
  calls = []; navigations = []; failures = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  setPageParams(KEY, {});
});

describe('Cari kart standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('new card: title, no card read, and the address list only after saving', async () => {
    await openNew();
    expect(title()).toBe('Yeni cari kart');
    expect(calls.filter((call) => call.url.startsWith(`/api/customers/${C1}`))).toEqual([]);
    fireEvent.click(tab('Adresler')!);
    expect(await screen.findByText(/Adresler cari kart kaydedildikten sonra eklenir/, {}, T)).toBeTruthy();
  });

  it('new card with a primary address posts one request with the nested address and returns to the list', async () => {
    await openNew();
    fillNew('c-2001', 'Yeni Cari');
    type('il', 'Konya');
    type('adresSatiri', 'Feritpaşa Mah.');
    type('adresEtiketi', 'Merkez');
    fireEvent.click(command('save'));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = JSON.parse(posts()[0].body!);
    expect(body).toMatchObject({ code: 'C-2001', name: 'Yeni Cari', type: 'Customer', currencyCode: 'TRY', paymentTermDays: 30, isActive: true });
    // Boş ülke (Türkiye varsayılanı) ve boş alt alanlar yazılmaz; sabit tür ve varsayılanlık yalnız adres giderken eklenir.
    expect(body.address).toEqual({ city: 'Konya', addressLine: 'Feritpaşa Mah.', label: 'Merkez', kind: 'General', isDefault: true });
    expect(Object.keys(body).filter((key) => key.includes('.'))).toEqual([]);
    expect(writes().filter((call) => call.method === 'PUT')).toEqual([]);
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toEqual({ page: 'customers', params: {}, replace: true, from: KEY, refresh: true });
  });

  it('new card without an address sends no address object', async () => {
    await openNew();
    fillNew('c-2002', 'Adressiz');
    fireEvent.click(command('save'));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = JSON.parse(posts()[0].body!);
    expect(body.address).toBeUndefined();
    expect(body).not.toHaveProperty('address.kind');
  });

  it('server field errors land under the matching inputs, dotted address names included', async () => {
    failures = [{ method: 'POST', url: '/api/customers', status: 400, error: 'Doğrulama hatası',
      fieldErrors: { 'address.addressLine': ['Adres satırı zorunludur ve en fazla 400 karakter olabilir.'], taxNumber: ['Vergi numarası geçersiz.'] } }];
    await openNew();
    fillNew('c-2003', 'Hatalı');
    type('il', 'Konya');
    type('adresEtiketi', 'Merkez');
    type('adresSatiri', 'x');
    fireEvent.click(command('save'));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const addressError = await screen.findByText('Adres satırı zorunludur ve en fazla 400 karakter olabilir.', {}, T);
    expect(addressError.closest('.tenant-page-input')).toBe(input('adresSatiri').closest('.tenant-page-input'));
    expect(input('adresSatiri').closest('.tenant-page-input')?.classList.contains('is-invalid')).toBe(true);
    fireEvent.click(tab('Vergi ve E-Fatura')!);
    const taxError = await screen.findByText('Vergi numarası geçersiz.', {}, T);
    expect(taxError.closest('.tenant-page-input')).toBe(input('vergiNo').closest('.tenant-page-input'));
    expect(navigations).toEqual([]);
  });

  it('Kaydet ve yeni (new card only) creates twice and stays on an empty card', async () => {
    await openNew();
    fillNew('c-3001', 'Birinci');
    fireEvent.click(await menuItem(/Kaydet ve yeni/));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    await waitFor(() => expect(input('kod').value).toBe(''), T);
    expect(input('unvan').value).toBe('');
    expect(navigations.filter((request) => request.page === 'customers')).toEqual([]);
    fillNew('c-3002', 'İkinci');
    fireEvent.keyDown(window, { key: 'F2', ctrlKey: true });
    await waitFor(() => expect(posts()).toHaveLength(2), T);
    expect(JSON.parse(posts()[1].body!)).toMatchObject({ code: 'C-3002', name: 'İkinci' });
  });

  it('edit: loads the card, PUTs it with rowVersion and the primary address, then saves custom fields', async () => {
    await openCard();
    await waitFor(() => expect(title()).toBe('FATİH KOKAY'), T);
    expect(input('il').value).toBe('Konya');
    type('unvan', 'FATİH KOKAY LTD.');
    type('ilce', 'Meram');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes().length).toBeGreaterThanOrEqual(1), T);
    await settle(150);
    const put = writes().find((call) => call.method === 'PUT' && call.url === `/api/customers/${C1}`)!;
    const body = JSON.parse(put.body!);
    expect(body).toMatchObject({ id: C1, code: 'C-1001', name: 'FATİH KOKAY LTD.', rowVersion: 'rv-1', currencyCode: 'TRY' });
    expect(body.address).toEqual({ countryCode: 'TR', city: 'Konya', district: 'Meram', postalCode: '42000', addressLine: 'Feritpaşa Mah.', label: 'Merkez', kind: 'General', isDefault: true });
    expect(Object.keys(body).filter((key) => key.includes('.'))).toEqual([]);
    expect(posts()).toEqual([]);
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual([`PUT /api/customers/${C1}`, `PUT /api/customers/${C1}/custom-fields`]);
  });

  it('edit: no Kaydet ve yeni, and the Adresler tab lists the addresses', async () => {
    await openCard();
    fireEvent.click(command('more'));
    await settle();
    expect(screen.queryByRole('menuitem', { name: /Kaydet ve yeni/ })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(tab('Adresler')!);
    expect(await screen.findByText('Feritpaşa Mah.', { selector: '.tenant-page-data-grid td' }, T)).toBeTruthy();
  });
});
