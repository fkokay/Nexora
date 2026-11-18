import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const G1 = '11111111-1111-1111-1111-111111111111';
const G2 = '22222222-2222-2222-2222-222222222222';
const G3 = '44444444-4444-4444-4444-444444444444';
const U1 = '33333333-3333-3333-3333-333333333333';

type Param = { name: string; in: string; type: string; required?: boolean; items?: unknown };
const cols = (...codes: string[]) => codes.map((code) => ({ code, label: code, dataType: 'text' }));
const op = (name: string, label: string, kind: 'read' | 'write', pageKind: string, method: string, route: string, parameters: Param[],
  extra: Record<string, unknown> = {}) => ({
  name, label, module: 'Stok', kind, pageKind, method, route,
  parameters: parameters.map((parameter) => ({ required: false, items: null, ...parameter })),
  result: { shape: kind === 'read' && extra.record !== true ? 'list' : 'record', rowsPath: null, columns: cols('id', 'name'), flatten: [], metaPaths: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true, routeVariants: [], bodyMap: null, ...extra,
});
const operations = [
  op('stok.kart.olustur', 'Stok kartı oluştur', 'write', 'insert', 'POST', '/api/stock/items', [
    { name: 'name', in: 'body', type: 'text' }, { name: 'code', in: 'body', type: 'text' }, { name: 'customFields', in: 'body', type: 'map' },
    { name: 'variants', in: 'body', type: 'list', items: [{ code: 'code', label: 'Kod', dataType: 'text', required: true }, { code: 'name', label: 'Ad', dataType: 'text', required: true },
      { code: 'barcode', label: 'Barkod', dataType: 'text', required: false }, { code: 'attributes', label: 'Özellikler', dataType: 'map', required: true }] }]),
  op('stok.kart.liste', 'Stok kartları', 'read', 'read', 'GET', '/api/stock/items', []),
  op('stok.kart.getir', 'Stok kartı', 'read', 'read', 'GET', '/api/stock/items/{id}', [{ name: 'id', in: 'route', type: 'guid', required: true }], { record: true }),
  op('stok.kart.guncelle', 'Stok kartı güncelle', 'write', 'update', 'PUT', '/api/stock/items/{id}',
    [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'name', in: 'body', type: 'text' }], { sourceOperation: 'stok.kart.getir' }),
  op('stok.birim.liste', 'Birimler', 'read', 'read', 'GET', '/api/stock/items/{itemId}/units', [{ name: 'itemId', in: 'route', type: 'guid', required: true }]),
  op('stok.birim.ekle', 'Stok kartına birim ekle', 'write', 'insert', 'POST', '/api/stock/items/{itemId}/units',
    [{ name: 'itemId', in: 'route', type: 'guid', required: true }, { name: 'unitCode', in: 'body', type: 'text' }, { name: 'factorToBase', in: 'body', type: 'decimal' }]),
  op('stok.birim.sil', 'Stok kartından birim sil', 'write', 'delete', 'DELETE', '/api/stock/items/{itemId}/units/{unitId}',
    [{ name: 'itemId', in: 'route', type: 'guid', required: true }, { name: 'unitId', in: 'route', type: 'guid', required: true }]),
  op('stok.hareket.ekle', 'Stok hareketi ekle', 'write', 'insert', 'POST', '/api/stock/movements', [{ name: 'quantity', in: 'body', type: 'decimal' },
    { name: 'tracking', in: 'body', type: 'list', items: [{ code: 'trackingCode', label: 'Lot', dataType: 'text', required: true },
      { code: 'quantity', label: 'Miktar', dataType: 'decimal', required: true }, { code: 'expiryDate', label: 'SKT', dataType: 'date', required: false }] }]),
  op('stok.ozelAlan.tanimlar', 'Özel alan tanımları', 'read', 'read', 'GET', '/api/stock/custom-fields', []),
  op('stok.ozelAlan.degerler', 'Özel alan değerleri', 'read', 'read', 'GET', '/api/stock/items/{id}/custom-fields', [{ name: 'id', in: 'route', type: 'guid', required: true }]),
  op('stok.kart.ozelAlanKaydet', 'Özel alanları kaydet', 'write', 'update', 'PUT', '/api/stock/items/{id}/custom-fields',
    [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'values', in: 'body', type: 'map' }],
    { bodyMap: { property: 'values', sourceOperation: 'stok.ozelAlan.degerler', keyColumn: 'code', valueColumn: 'value' } }),
];

const q = (id: string, name: string, kind: string, operation: string, parameters: [string, string, string][] = [], runOn = 'manual') =>
  ({ id, name, kind, runOn, operation, parameters: parameters.map(([pname, binding, type]) => ({ name: pname, binding, type })) });
const adInput = (defaultValue = '') => ({ id: 'in-ad', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad', defaultValue } });
const kodInput = { id: 'in-kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod' } };
const miktarInput = { id: 'in-miktar', type: 'input', name: 'miktar', props: { inputType: 'number', label: 'Miktar' } };
const listeTable = { id: 't', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Kartlar', columns: ['name'] } };
const liste = q('ql', 'liste', 'read', 'stok.kart.liste', [], 'load');
const kart = q('qk', 'kart', 'read', 'stok.kart.getir', [['id', '{{liste.seciliSatir.id}}', 'guid']], 'load');
const birimListe = q('qbl', 'birimListe', 'read', 'stok.birim.liste', [['itemId', '{{liste.seciliSatir.id}}', 'guid']], 'load');
const unitColumns = ['unitCode|Birim|text|required,upperCase', 'factorToBase|Katsayı|number|required'];
const birimGrid = { id: 'g-birim', type: 'editableGrid', name: 'birimler', props: { title: 'Birimler', gridMode: 'stage', sourceQuery: 'qbl', gridColumns: unitColumns } };
const olustur = q('qo', 'olustur', 'insert', 'stok.kart.olustur', [['name', '{{ad.value}}', 'text']]);
const birimEkleYeni = q('qbe', 'birimEkle', 'insert', 'stok.birim.ekle', [['itemId', '{{olustur.sonuc.id}}', 'guid'],
  ['unitCode', '{{birimler.eklenenSatir.unitCode}}', 'text'], ['factorToBase', '{{birimler.eklenenSatir.factorToBase}}', 'decimal']]);
const birimEkle = q('qbe', 'birimEkle', 'insert', 'stok.birim.ekle', [['itemId', '{{liste.seciliSatir.id}}', 'guid'],
  ['unitCode', '{{birimler.eklenenSatir.unitCode}}', 'text'], ['factorToBase', '{{birimler.eklenenSatir.factorToBase}}', 'decimal']]);
const birimSil = q('qbs', 'birimSil', 'delete', 'stok.birim.sil', [['itemId', '{{liste.seciliSatir.id}}', 'guid'], ['unitId', '{{birimler.silinenSatir.id}}', 'guid']]);
const guncelle = q('qg', 'guncelle', 'update', 'stok.kart.guncelle', [['id', '{{liste.seciliSatir.id}}', 'guid'], ['name', '{{ad.value}}', 'text']]);

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let failUnit: string | null = null;
let rowVersion = 0;
let serverFieldErrors: Record<string, string[]> | null = null;
let definitions: Record<string, unknown>[] = [];
const STORED_VALUES = [{ code: 'RENK', value: 'Mavi' }, { code: 'BEDEN', value: 'M' }];
let storedValues: Record<string, unknown>[] = STORED_VALUES;

function setup(components: unknown[], queries: unknown[]) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint.endsWith('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url: endpoint, method, body });
    if (endpoint === '/api/stock/items' && method === 'GET') return [{ id: G2, name: 'Var olan' }, { id: G3, name: 'Diğer' }];
    if (endpoint === `/api/stock/items/${G2}` && method === 'GET') { rowVersion += 1; return { id: G2, name: 'Var olan', rowVersion: `v${rowVersion}` }; }
    if (endpoint === `/api/stock/items/${G3}` && method === 'GET') return { id: G3, name: 'Diğer', rowVersion: 'w1' };
    if (endpoint === `/api/stock/items/${G2}/units` && method === 'GET') return [{ id: U1, unitCode: 'KUTU', factorToBase: 12 }];
    if (endpoint.endsWith('/units') && method === 'GET') return [];
    if (endpoint === '/api/stock/custom-fields') return definitions;
    if (endpoint === `/api/stock/items/${G2}/custom-fields` && method === 'GET') return storedValues;
    if (endpoint === '/api/stock/items' && method === 'POST') {
      if (serverFieldErrors) throw Object.assign(new Error('Doğrulama hatası'), { status: 400, serverError: 'Doğrulama hatası', fieldErrors: serverFieldErrors });
      return { id: G1 };
    }
    if (endpoint.endsWith('/units') && method === 'POST') {
      if (failUnit && body?.includes(failUnit)) { failUnit = null; throw Object.assign(new Error('Birim kodu geçersiz'), { status: 400, serverError: 'Birim kodu geçersiz' }); }
      return { id: 'u-new' };
    }
    return { id: 'x1' };
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'));
const writes = () => calls.filter((call) => call.method !== 'GET');
const pageStatus = () => document.querySelector('.tenant-custom-page-content > .tenant-page-action-status')?.textContent;
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const addRow = (grid = 'Satır ekle') => fireEvent.click(screen.getByRole('button', { name: grid }));
const cardRow = (index: number) => document.querySelectorAll<HTMLElement>('.tenant-page-data-grid tbody tr')[index];
const selectCard = async (index = 0) => {
  await screen.findByText('Var olan');
  fireEvent.click(cardRow(index));
  await waitFor(() => expect(calls.some((call) => call.method === 'GET' && call.url === `/api/stock/items/${index === 0 ? G2 : G3}`)).toBe(true));
  await settle();
};

beforeEach(() => { calls = []; failUnit = null; rowVersion = 0; serverFieldErrors = null; definitions = []; storedValues = STORED_VALUES; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Düzenlenebilir tablo', () => {
  it('staged units are posted and deleted by sequence then committed', async () => {
    setup([listeTable, birimGrid, { id: 'bar', type: 'actionBar', props: { saveSequence: ['qbe', 'qbs'] } }], [liste, kart, birimListe, birimEkle, birimSil]);
    await selectCard();
    await screen.findByText('KUTU');
    addRow();
    type('Birim (satır 2)', 'pk');
    type('Katsayı (satır 2)', '6');
    fireEvent.click(screen.getAllByRole('button', { name: 'Satırı sil' })[0]);
    expect(screen.getByText('Silinecek')).toBeTruthy();
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (2 işlem)'));
    expect(writes()).toEqual([
      { url: `/api/stock/items/${G2}/units`, method: 'POST', body: '{"unitCode":"PK","factorToBase":6}' },
      { url: `/api/stock/items/${G2}/units/${U1}`, method: 'DELETE', body: undefined },
    ]);
    await waitFor(() => expect(screen.queryByText('Silinecek')).toBeNull());
    expect(document.querySelector('.tenant-page-grid .tenant-page-tag')).toBeNull();
    expect(screen.queryByLabelText('Birim (satır 2)')).toBeNull();
  });

  it('retry after partial failure sends only remaining rows', async () => {
    failUnit = 'KOLI';
    setup([adInput(), birimGrid, { id: 'bar', type: 'actionBar', props: { saveSequence: ['qo', 'qbe'], sequenceWhen: ['qo=olustur.sonuc.id == null'] } }],
      [birimListe, olustur, birimEkleYeni]);
    await ready('save');
    type('Ad', 'Kalem');
    addRow(); addRow();
    type('Birim (satır 1)', 'KUTU'); type('Katsayı (satır 1)', '12');
    type('Birim (satır 2)', 'KOLI'); type('Katsayı (satır 2)', '48');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('Stok kartına birim ekle (satır 2/2) başarısız: Birim kodu geçersiz. Önceki 2 işlem kaydedildi; kalan adımlar çalıştırılmadı.'));
    expect((screen.getByLabelText('Birim (satır 1)') as HTMLInputElement).value).toBe('KOLI');
    expect(screen.queryByLabelText('Birim (satır 2)')).toBeNull();
    calls = [];
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (1 işlem)'));
    expect(writes()).toEqual([{ url: `/api/stock/items/${G1}/units`, method: 'POST', body: '{"unitCode":"KOLI","factorToBase":48}' }]);
  });

  it('edit-mode retry after partial failure keeps selection and remaining rows', async () => {
    failUnit = 'KOLI';
    setup([adInput('{{kart.rows[0].name}}'), listeTable, birimGrid, { id: 'bar', type: 'actionBar', props: { saveSequence: ['qg', 'qbe'] } }],
      [liste, kart, birimListe, guncelle, birimEkle]);
    await selectCard();
    await screen.findByText('KUTU');
    expect((screen.getByLabelText('Ad') as HTMLInputElement).value).toBe('Var olan');
    type('Ad', 'Yeni ad');
    addRow(); addRow();
    type('Birim (satır 2)', 'PK'); type('Katsayı (satır 2)', '6');
    type('Birim (satır 3)', 'KOLI'); type('Katsayı (satır 3)', '48');
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('Stok kartına birim ekle (satır 2/2) başarısız: Birim kodu geçersiz. Önceki 2 işlem kaydedildi; kalan adımlar çalıştırılmadı.'));
    await waitFor(() => expect(calls.filter((call) => call.method === 'GET' && call.url === `/api/stock/items/${G2}`)).toHaveLength(2));
    await settle();
    expect(cardRow(0).getAttribute('aria-current')).toBe('true');
    expect((screen.getByLabelText('Ad') as HTMLInputElement).value).toBe('Yeni ad');
    expect((screen.getByLabelText('Birim (satır 2)') as HTMLInputElement).value).toBe('KOLI');
    expect(screen.queryByLabelText('Birim (satır 3)')).toBeNull();
    calls = [];
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (2 işlem)'));
    expect(writes()).toEqual([
      { url: `/api/stock/items/${G2}`, method: 'PUT', body: `{"id":"${G2}","name":"Yeni ad","rowVersion":"v2"}` },
      { url: `/api/stock/items/${G2}/units`, method: 'POST', body: '{"unitCode":"KOLI","factorToBase":48}' },
    ]);
  });

  it('second create after a successful create posts a new card', async () => {
    setup([adInput(), birimGrid, { id: 'bar', type: 'actionBar', props: { saveSequence: ['qo', 'qbe'], sequenceWhen: ['qo=olustur.sonuc.id == null'] } }],
      [birimListe, olustur, birimEkleYeni]);
    await ready('save');
    type('Ad', 'Kalem');
    addRow();
    type('Birim (satır 1)', 'KUTU'); type('Katsayı (satır 1)', '12');
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('İşlem tamamlandı. (2 işlem)'));
    calls = [];
    type('Ad', 'Silgi');
    addRow();
    type('Birim (satır 1)', 'PK'); type('Katsayı (satır 1)', '6');
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0]).toEqual({ url: '/api/stock/items', method: 'POST', body: '{"name":"Silgi"}' });
  });

  it('variants matrix sent in olustur body', async () => {
    const withVariants = q('qo', 'olustur', 'insert', 'stok.kart.olustur', [['name', '{{ad.value}}', 'text'], ['code', '{{kod.value}}', 'text'], ['variants', '{{varyantlar.satirlar}}', 'list']]);
    setup([adInput(), kodInput, { id: 'g-v', type: 'editableGrid', name: 'varyantlar', props: { title: 'Varyantlar', gridMode: 'matrix', matrixCode: '{{kod.value}}', matrixName: '{{ad.value}}' } },
      { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [withVariants]);
    await ready('save');
    type('Ad', 'Tişört');
    type('Kod', 'TS');
    addRow();
    type('Özellik adı (satır 1)', 'Renk');
    type('Değerler (satır 1)', 'Kırmızı, Mavi');
    expect(screen.getByText('2 varyant oluşturulacak')).toBeTruthy();
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(writes()[0].body!)).toEqual({ name: 'Tişört', code: 'TS', variants: [
      { code: 'TS-KIRMIZI', name: 'Tişört · Renk: Kırmızı', barcode: null, attributes: { Renk: 'Kırmızı' } },
      { code: 'TS-MAVI', name: 'Tişört · Renk: Mavi', barcode: null, attributes: { Renk: 'Mavi' } },
    ] });
    // Başarılı kayıttan sonra varyant satırları sıfırlanır.
    await waitFor(() => expect(screen.queryByLabelText('Özellik adı (satır 1)')).toBeNull());
  });

  it('tracking list sent in hareket.ekle body', async () => {
    const hareket = q('qh', 'hareketEkle', 'insert', 'stok.hareket.ekle', [['quantity', '{{miktar.value}}', 'decimal'], ['tracking', '{{izleme.satirlar}}', 'list']]);
    setup([miktarInput,
      { id: 'g-iz', type: 'editableGrid', name: 'izleme', props: { title: 'Lot/seri', gridMode: 'list', gridColumns: ['trackingCode|Lot|text|required', 'quantity|Lot miktarı|number|required', 'expiryDate|Son kullanma|date'] } },
      { id: 'ac', type: 'button', props: { text: 'Hareketler', actionType: 'openDialog', dialogId: 'd1' } },
      { id: 'd1', type: 'dialog', props: { title: 'Hareket ekle', contains: ['in-miktar', 'g-iz'], saveQuery: 'qh' } }], [hareket]);
    fireEvent.click(await screen.findByRole('button', { name: 'Hareketler' }));
    const dialog = await screen.findByRole('dialog');
    type('Miktar', '5');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Satır ekle' }));
    type('Lot (satır 1)', 'L1');
    type('Lot miktarı (satır 1)', '5');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ url: '/api/stock/movements', method: 'POST', body: '{"quantity":5,"tracking":[{"trackingCode":"L1","quantity":5}]}' });
  });

  it('grid validation blocks sequence and jumps to tab', async () => {
    setup([adInput(), birimGrid,
      { id: 'tb', type: 'tabs', props: { tabs: ['Genel=in-ad', 'Birimler=g-birim'] } },
      { id: 'bar', type: 'actionBar', props: { saveSequence: ['qo', 'qbe'] } }], [birimListe, olustur, birimEkleYeni]);
    await ready('save');
    type('Ad', 'Kalem');
    fireEvent.click(screen.getByRole('tab', { name: /Birimler/ }));
    addRow();
    type('Birim (satır 1)', 'KUTU');
    fireEvent.click(screen.getByRole('tab', { name: /Genel/ }));
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('Formda düzeltilmesi gereken alanlar var.'));
    expect(writes()).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Birimler/ }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.getByLabelText('Katsayı (satır 1)').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Bu alan zorunludur.')).toBeTruthy();
  });

  it('source change resets staged rows', async () => {
    setup([listeTable, birimGrid], [liste, kart, birimListe]);
    await selectCard();
    await screen.findByText('KUTU');
    addRow();
    type('Birim (satır 2)', 'PK');
    fireEvent.click(cardRow(1));
    await waitFor(() => expect(calls.some((call) => call.url === `/api/stock/items/${G3}/units`)).toBe(true));
    await waitFor(() => expect(screen.queryByText('KUTU')).toBeNull());
    await waitFor(() => expect(screen.queryByLabelText('Birim (satır 1)')).toBeNull());
    expect(screen.queryByLabelText('Birim (satır 2)')).toBeNull();
    expect(document.querySelector('.tenant-page-grid .tenant-page-tag')).toBeNull();
  });
});

describe('Özel alanlar bloğu', () => {
  const tanimlar = q('qtd', 'tanimlar', 'read', 'stok.ozelAlan.tanimlar', [], 'load');
  const degerler = q('qdv', 'degerler', 'read', 'stok.ozelAlan.degerler', [['id', '{{liste.seciliSatir.id}}', 'guid']], 'load');
  const block = (extra: Record<string, unknown> = {}) => ({ id: 'cf', type: 'customFieldsBlock', name: 'ozel', props: { title: 'Özel alanlar', definitionsQuery: 'qtd', ...extra } });
  const olusturCf = q('qo', 'olustur', 'insert', 'stok.kart.olustur', [['name', '{{ad.value}}', 'text'], ['customFields', '{{ozel.degerler}}', 'map']]);

  it('customFields sent on create', async () => {
    definitions = [{ code: 'RENK', label: 'Renk', dataType: 'Text', isRequired: false }];
    setup([adInput(), block(), { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [tanimlar, olusturCf]);
    await screen.findByLabelText('Renk');
    type('Ad', 'Kalem');
    type('Renk', 'Mavi');
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ url: '/api/stock/items', method: 'POST', body: '{"name":"Kalem","customFields":{"RENK":"Mavi"}}' });
  });

  it('required custom field blocks save', async () => {
    definitions = [{ code: 'RENK', label: 'Renk', dataType: 'Text', isRequired: true }];
    setup([adInput(), block(), { id: 'tb', type: 'tabs', props: { tabs: ['Genel=in-ad', 'Özel=cf'] } }, { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [tanimlar, olusturCf]);
    await ready('save');
    type('Ad', 'Kalem');
    await waitFor(() => expect(calls.some((call) => call.url === '/api/stock/custom-fields')).toBe(true));
    await settle();
    fireEvent.click(command('save'));
    await waitFor(() => expect(pageStatus()).toBe('Formda düzeltilmesi gereken alanlar var.'));
    expect(writes()).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Özel/ }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.getByText('Bu alan zorunludur.')).toBeTruthy();
  });

  it('custom field server error shown under field', async () => {
    definitions = [{ code: 'RENK', label: 'Renk', dataType: 'Text', isRequired: false }];
    serverFieldErrors = { 'customFields.RENK': ['Renk geçersiz.'] };
    setup([adInput(), block(), { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [tanimlar, olusturCf]);
    await screen.findByLabelText('Renk');
    type('Renk', 'xx');
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(screen.getByText('Renk geçersiz.')).toBeTruthy());
    expect(screen.getByText('Renk geçersiz.').closest('.tenant-page-input')?.querySelector('input')?.id).toBe('page-cf-ozel-RENK');
  });

  it('map parameter merges over body map source end to end', async () => {
    definitions = [{ code: 'RENK', label: 'Renk', dataType: 'Text', isRequired: false }];
    const kaydet = q('qcs', 'ozelKaydet', 'update', 'stok.kart.ozelAlanKaydet', [['id', '{{liste.seciliSatir.id}}', 'guid'], ['values', '{{ozel.degerler}}', 'map']]);
    setup([listeTable, block({ valuesQuery: 'qdv' }), { id: 'bar', type: 'actionBar', props: { saveQuery: 'qcs' } }], [liste, tanimlar, degerler, kaydet]);
    await screen.findByText('Var olan');
    fireEvent.click(cardRow(0));
    await waitFor(() => expect((screen.getByLabelText('Renk') as HTMLInputElement).value).toBe('Mavi'));
    await settle();
    type('Renk', 'Kırmızı');
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ url: `/api/stock/items/${G2}/custom-fields`, method: 'PUT', body: '{"values":{"RENK":"Kırmızı","BEDEN":"M"}}' });
  });

  const kaydetCf = q('qcs', 'ozelKaydet', 'update', 'stok.kart.ozelAlanKaydet', [['id', '{{liste.seciliSatir.id}}', 'guid'], ['values', '{{ozel.degerler}}', 'map']]);
  const editAndSave = async (blockProps: Record<string, unknown>) => {
    setup([listeTable, block(blockProps), { id: 'bar', type: 'actionBar', props: { saveQuery: 'qcs' } }], [liste, tanimlar, degerler, kaydetCf]);
    await screen.findByText('Var olan');
    fireEvent.click(cardRow(0));
    await waitFor(() => expect(calls.some((call) => call.url === `/api/stock/items/${G2}/custom-fields`)).toBe(true));
    await screen.findByLabelText('Renk');
    await settle();
    type('Renk', 'Kırmızı');
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    return JSON.parse(writes()[0].body!) as { values: Record<string, string> };
  };

  it('edit sends only typed codes: untouched codes keep stored values', async () => {
    definitions = [{ code: 'RENK', label: 'Renk', dataType: 'Text' }, { code: 'BEDEN', label: 'Beden', dataType: 'Text' }, { code: 'EK', label: 'Ek', dataType: 'Text' }];
    expect((await editAndSave({ valuesQuery: 'qdv' })).values).toEqual({ RENK: 'Kırmızı', BEDEN: 'M' });
  });

  it('edit without valuesQuery never sends "" for untouched codes', async () => {
    definitions = [{ code: 'RENK', label: 'Renk', dataType: 'Text' }, { code: 'BEDEN', label: 'Beden', dataType: 'Text' }];
    expect((await editAndSave({})).values).toEqual({ RENK: 'Kırmızı', BEDEN: 'M' });
  });

  it('required Boolean field defaults to "false" on edit', async () => {
    definitions = [{ code: 'RENK', label: 'Renk', dataType: 'Text' }, { code: 'IHRAC', label: 'İhraç', dataType: 'Boolean', isRequired: true }];
    expect((await editAndSave({ valuesQuery: 'qdv' })).values).toEqual({ RENK: 'Kırmızı', BEDEN: 'M', IHRAC: 'false' });
  });

  it('edit without valuesQuery keeps a stored Boolean "true" when untouched', async () => {
    definitions = [{ code: 'RENK', label: 'Renk', dataType: 'Text' }, { code: 'IHRAC', label: 'İhraç', dataType: 'Boolean', isRequired: true }];
    storedValues = [...STORED_VALUES, { code: 'IHRAC', value: 'true' }];
    expect((await editAndSave({})).values).toEqual({ RENK: 'Kırmızı', BEDEN: 'M', IHRAC: 'true' });
  });

  it('required Boolean field defaults to "false" on create', async () => {
    definitions = [{ code: 'IHRAC', label: 'İhraç', dataType: 'Boolean', isRequired: true }];
    setup([adInput(), block(), { id: 'bar', type: 'actionBar', props: { saveQuery: 'qo' } }], [tanimlar, olusturCf]);
    await screen.findByLabelText('İhraç');
    type('Ad', 'Kalem');
    await ready('save');
    fireEvent.click(command('save'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toBe('{"name":"Kalem","customFields":{"IHRAC":"false"}}');
  });
});
