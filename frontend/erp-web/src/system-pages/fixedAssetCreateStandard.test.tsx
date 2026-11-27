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
import catalog from './fixedAssetCreateOperations.fixture.json';

// "Yeni edinim" standart tanımı (fixed-asset-create.json): duranVarlik.kiymet.olustur gövdesi, varsayılanlar, bağlı alış
// faturası seçimi ve isteğe bağlı VUK profili (anahtar açıkken alanlar requiredWhen ile zorunlu).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'fixed-asset-create';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as
  { title: string; version: number; stage: string; definition: Definition };

const NEW = 'aaaaaaaa-0000-0000-0000-0000000000aa';
const INV = 'bbbbbbbb-0000-0000-0000-000000000001';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/fixed-assets/purchase-invoices') {
      return [{ id: INV, code: 'AF-2026-0007', supplierId: 'cccccccc-0000-0000-0000-000000000001', invoiceDate: '2026-11-02', grandTotal: 144000,
        journalEntryId: null, label: 'AF-2026-0007 · 02.11.2026 · 144.000,00' }];
    }
    if (path === '/api/fixed-assets/vuk-useful-life-catalog') {
      return { entries: [{ code: '10.1', description: 'Binalar (betonarme)', usefulLifeYears: 50, normalRatePercent: 2, communiqueNumber: 339 }] };
    }
  } else if (method === 'POST' && path === '/api/fixed-assets') {
    return { id: NEW, assetCode: 'DV-CNC-03', name: 'CNC', status: 'Active' };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup() {
  setPageParams(KEY, {});
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        screenKey: KEY, source: 'standard', standardVersion: 1, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
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
// Kayıt kartı kalıbı: komutlar kabuğun "İşlemler" çubuğundadır.
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler' });
const goTo = async (name: string) => { fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) })); await new Promise((done) => setTimeout(done, 0)); };
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`);
const ready = (id: string) => waitFor(() => expect(command(id)?.getAttribute('aria-disabled')).not.toBe('true'), T);
const posts = () => calls.filter((call) => call.method === 'POST' && call.url === '/api/fixed-assets');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
/** Boş (null / undefined) alanları atar: motor boş değeri göndermeyebilir ya da null yazabilir. */
const filled = (body: Record<string, unknown>) => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null && value !== undefined && value !== ''));
/** Arama kutulu seçici (lookup / searchable select): yazılır ve listelenen seçenek tıklanır. */
const pick = async (id: string, search: string, option: RegExp) => {
  fireEvent.focus(input(id));
  fireEvent.change(input(id), { target: { value: search } });
  fireEvent.click(await screen.findByRole('option', { name: option }, T));
};
const openNew = async () => {
  setup();
  await waitFor(() => expect(input('kod')).toBeTruthy(), T);
  await ready('save');
};
// Kıymet sekmesinde kod ve ad, Maliyet ve muhasebe sekmesinde maliyet; sekmeler arası geçişte girilen değerler korunur.
const fillRequired = async () => {
  type('kod', 'dv-cnc-03');
  type('ad', 'CNC tezgâhı');
  await goTo('Maliyet ve muhasebe');
  await waitFor(() => expect(input('maliyet')).toBeTruthy(), T);
  type('maliyet', '120000');
};

beforeEach(() => {
  calls = []; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  setPageParams(KEY, {});
});

describe('Yeni edinim standart tanımı', { timeout: 30000 }, () => {
  it('is a version 2 preview (Kayıt kartı); uses only catalog operations and the create body has no supplierAccountId', () => {
    expect(standard.version).toBe(2);
    expect(standard.stage).toBe('preview');
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    const create = catalog.operations.find((operation) => operation.name === 'duranVarlik.kiymet.olustur')!;
    expect(create.parameters.some((parameter) => parameter.name === 'supplierAccountId')).toBe(false);
  });

  it('defaults: today for both dates, 60 months, residual 0; the VUK section stays hidden', async () => {
    await openNew();
    expect(document.body.textContent).toContain('Yeni edinim');
    expect(input('edinimTarihi').value).toBe(today());
    expect(input('kullanimaGiris').value).toBe(today());
    expect(input('omur').value).toBe('60');
    await goTo('Maliyet ve muhasebe');
    await waitFor(() => expect(input('kalinti')).toBeTruthy(), T);
    expect(input('kalinti').value).toBe('0');
    expect(document.body.textContent).toContain('Kalıntı değer');
    await goTo('VUK vergi profili');
    await waitFor(() => expect(input('vukAcik')).toBeTruthy(), T);
    expect(input('vukKodu')).toBeNull();
    expect(document.body.textContent).not.toContain('VUK profilini mali müşavirinizle doğruladığınızı onaylayın.');
  });

  it('saves the exact create body (upper-case code, linked invoice) and returns to the list with refresh', async () => {
    await openNew();
    type('kategori', 'Makine');
    await fillRequired();
    type('referans', 'SÖZ-42');
    await waitFor(() => expect(calls.some((call) => call.url === '/api/fixed-assets/purchase-invoices')).toBe(true), T);
    await pick('fatura', 'AF-2026', /AF-2026-0007/);
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    expect(filled(JSON.parse(posts()[0].body!))).toEqual({
      assetCode: 'DV-CNC-03', name: 'CNC tezgâhı', category: 'Makine', acquisitionDate: today(), inServiceDate: today(), acquisitionCostBase: 120000,
      residualValueBase: 0, usefulLifeMonths: 60, sourceReference: 'SÖZ-42', purchaseInvoiceId: INV,
    });
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'fixed-assets', replace: true, refresh: true });
  });

  it('VUK on: fields become required, Kaydet is blocked until the confirmation; the body carries the profile', async () => {
    await openNew();
    await fillRequired();
    await goTo('VUK vergi profili');
    fireEvent.click(input('vukAcik'));
    await waitFor(() => expect(input('vukKodu')).toBeTruthy(), T);
    expect(document.body.textContent).toContain('VUK profilini mali müşavirinizle doğruladığınızı onaylayın.');
    // Onay işaretlenmeden Kaydet çalışmaz (çubukta gizli ya da pasif; Ctrl+S de kaydetmez).
    const save = command('save');
    expect(save === null || save.getAttribute('aria-disabled') === 'true').toBe(true);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await new Promise((done) => setTimeout(done, 100));
    expect(posts()).toEqual([]);
    fireEvent.click(input('vukOnay'));
    await waitFor(() => expect(document.body.textContent).not.toContain('VUK profilini mali müşavirinizle doğruladığınızı onaylayın.'), T);
    await ready('save');
    // Onaylı ama VUK alanları boş: requiredWhen ile zorunlu, kayıt gönderilmez.
    fireEvent.click(command('save')!);
    await new Promise((done) => setTimeout(done, 100));
    expect(posts()).toEqual([]);
    await pick('vukKodu', '10', /10\.1/);
    type('vukAciklama', 'Binalar (betonarme)');
    type('vukTabloYili', '2026');
    type('vukTebligNo', '339');
    type('vukOmur', '600');
    type('vukOran', '2');
    type('vukBaslangic', '2026-12-01');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    expect(filled(JSON.parse(posts()[0].body!))).toMatchObject({
      assetCode: 'DV-CNC-03', vukUsefulLifeCode: '10.1', vukUsefulLifeDescription: 'Binalar (betonarme)', vukUsefulLifeTableYear: 2026,
      vukUsefulLifeCommuniqueNumber: 339, vukUsefulLifeMonths: 600, vukNormalDepreciationRatePercent: 2, vukTaxDepreciationStartDate: '2026-12-01',
    });
  });

  it('VUK off after typing: the profile fields are cleared and not sent', async () => {
    await openNew();
    await fillRequired();
    await goTo('VUK vergi profili');
    fireEvent.click(input('vukAcik'));
    await waitFor(() => expect(input('vukAciklama')).toBeTruthy(), T);
    type('vukAciklama', 'Taşıtlar');
    fireEvent.click(input('vukAcik'));
    await waitFor(() => expect(input('vukAciklama')).toBeNull(), T);
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = filled(JSON.parse(posts()[0].body!));
    expect(Object.keys(body).filter((key) => key.startsWith('vuk'))).toEqual([]);
  });

  it('commands are Kaydet and Yeni only (no Kaydet ve yeni); Yeni opens an empty acquisition page', async () => {
    await openNew();
    expect(command('save-and-new')).toBeNull();
    await ready('new');
    fireEvent.click(command('new')!);
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'fixed-asset-create' });
    expect(posts()).toEqual([]);
  });
});
