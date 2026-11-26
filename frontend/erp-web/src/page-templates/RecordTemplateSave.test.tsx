import { cleanup, fireEvent, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { api } from '../erpApi';
import {
  CLOSE_PAGE_EVENT, forgetOpener, OPEN_PAGE_EVENT, openWorkspacePage, pageParamsOf, setPageParams, type WorkspaceOpenRequest,
} from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { recordComponents, recordDefinition, recordQueries, recordRow } from './recordTemplateFixture';

// Kayıt kartında Kaydet ve Sil sonrası: yeniden yükleme, yazılan anahtarla yeniden açma, açan sekmeye dönüş, temizleme, kapatma.

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });

vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const TAB = 'custom-page:p';
const LIST = 'custom-page:liste';
const G1 = '11111111-1111-1111-1111-111111111111';
const T = { timeout: 5000 };

type Call = { endpoint: string; method: string; body: string };
let calls: Call[];
let definition: unknown;
/** Kayıt sorgusu yalnız bu anahtarlardan biriyle satır döner (yeni kayıtta parametre boş: satır yok). */
let knownKeys: Set<string>;
let opens: WorkspaceOpenRequest[];
/** Sayfa hakları (`/published` yanıtı). */
let rights: Record<string, boolean>;
let closes: string[];
const onOpen = (event: Event) => { opens.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };
const onClose = (event: Event) => { closes.push((event as CustomEvent<{ page: string }>).detail.page); };

const operation = (name: string, kind: 'read' | 'write', pageKind: string, method: string, route: string,
  parameters: { name: string; in: string; type: string; required?: boolean }[]) => ({
  name, label: name, module: 'Stok', kind, pageKind, method, route, parameters: parameters.map((parameter) => ({ required: false, ...parameter })),
  result: { shape: 'record', rowsPath: null, columns: [{ code: 'id', label: 'Kimlik', dataType: 'guid' }, { code: 'name', label: 'Ad', dataType: 'text' }], flatten: [], metaPaths: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true, routeVariants: [], bodyMap: null,
});
const operations = [
  operation('stok.kart.getir', 'read', 'read', 'GET', '/api/stock/items/{id}', [{ name: 'id', in: 'route', type: 'guid', required: true }]),
  operation('stok.kart.olustur', 'write', 'insert', 'POST', '/api/stock/items', [{ name: 'name', in: 'body', type: 'text' }]),
  operation('stok.kart.guncelle', 'write', 'update', 'PUT', '/api/stock/items/{id}', [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'name', in: 'body', type: 'text' }]),
];

beforeEach(() => {
  localStorage.clear();
  calls = []; opens = []; closes = [];
  knownKeys = new Set(['C-1001']);
  rights = { view: true, insert: true, update: true, delete: true };
  definition = recordDefinition();
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (endpoint: string, _token?: string, init?: RequestInit) => {
    if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Cari kartı', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights } as never;
    if (endpoint === '/api/custom-pages/erp-operations') return { operations } as never;
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ endpoint, method: init?.method ?? 'GET', body });
    if (endpoint.includes('/queries/kayit/run')) {
      const key = [...knownKeys].find((candidate) => body.includes(`"${candidate}"`));
      return { columns: [], rows: key ? [{ ...recordRow, Code: key }] : [], rowCount: key ? 1 : 0, truncated: false } as never;
    }
    if (endpoint.includes('/queries/hareket/run')) return { columns: [{ code: 'Belge', label: 'Belge' }], rows: [], rowCount: 0, truncated: false } as never;
    if (endpoint.includes('/queries/')) return { affectedRows: 1 } as never;
    if (endpoint === '/api/stock/items' && init?.method === 'POST') return { id: G1 } as never;
    return { id: G1, name: 'Var olan' } as never;
  });
  window.addEventListener(OPEN_PAGE_EVENT, onOpen);
  window.addEventListener(CLOSE_PAGE_EVENT, onClose);
});
afterEach(() => {
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onOpen);
  window.removeEventListener(CLOSE_PAGE_EVENT, onClose);
  for (const page of [TAB, LIST]) { setPageParams(page, {}); forgetOpener(page); }
});

const ran = (query: string) => calls.filter((call) => call.endpoint.includes(`/queries/${query}/run`));
const barButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.page-shell-bar button')].find((button) => button.textContent === label)!;
const ready = () => waitFor(() => expect(barButton('Kaydet')).toBeTruthy(), T);
const status = () => document.querySelector('.record-template-page .tenant-page-action-status')?.textContent;
/** Liste sekmesi kartı açtı (sayfa eylemi `replace`): kart sekmesinin açanı listedir. */
const openedFromList = (params: Record<string, string> = {}) => {
  openWorkspacePage({ page: TAB, params, replace: true, from: LIST });
  opens = [];
};
const withKey = (patch: Record<string, unknown>) => recordComponents.map((component) => component.id === 'kod'
  ? { ...component, props: { ...component.props, ...patch } } : component);

describe('kayıt kartında kaydetme sonrası', () => {
  it('new record with typed key reopens as existing and second save updates', async () => {
    knownKeys.add('C-2002');
    openedFromList();
    render(<TenantCustomPage code="p" token="t" />);
    await ready();
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText('Cari kodu'), { target: { value: 'C-2002' } });
    fireEvent.click(barButton('Kaydet'));
    await waitFor(() => expect(pageParamsOf(TAB)).toEqual({ kod: 'C-2002' }), T);
    expect(ran('ekle')).toHaveLength(1);
    expect(ran('guncelle')).toHaveLength(0);
    // Kart aynı sekmede var olan kayıt olarak açılır: kayıt sorgusu yeni anahtarla satır döner, Sil görünür.
    expect(await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T)).toBeTruthy();
    expect(ran('kayit').at(-1)!.body).toContain('C-2002');
    expect(await screen.findByText('Kaydedildi.', undefined, T)).toBeTruthy();
    expect(opens).toEqual([]);
    expect(closes).toEqual([]);
    await waitFor(() => expect(barButton('Sil')).toBeTruthy(), T);
    fireEvent.click(barButton('Kaydet'));
    await waitFor(() => expect(ran('guncelle')).toHaveLength(1), T);
    expect(ran('ekle')).toHaveLength(1);
    // Var olan kaydın Kaydet'i yalnız yeniden yükler: kart açık kalır.
    expect(pageParamsOf(TAB)).toEqual({ kod: 'C-2002' });
    expect(closes).toEqual([]);
  });

  it('new record with system key returns to opener after save', async () => {
    definition = recordDefinition(withKey({ readOnly: true, placeholder: '(otomatik)' }));
    setPageParams(LIST, { q: 'akdeniz' });
    openedFromList();
    render(<TenantCustomPage code="p" token="t" />);
    await ready();
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni cari' } });
    fireEvent.click(barButton('Kaydet'));
    await waitFor(() => expect(closes).toEqual([TAB]), T);
    expect(ran('ekle')).toHaveLength(1);
    expect(opens).toEqual([expect.objectContaining({ page: LIST, params: {}, replace: false, from: TAB, refresh: true, keepParams: true, notice: 'Kaydedildi.' })]);
    // Listenin parametreleri silinmez.
    expect(pageParamsOf(LIST)).toEqual({ q: 'akdeniz' });
  });

  it('new record with system key opened directly clears the form', async () => {
    definition = recordDefinition(withKey({ readOnly: true, placeholder: '(otomatik)' }));
    render(<TenantCustomPage code="p" token="t" />);
    await ready();
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni cari' } });
    fireEvent.click(barButton('Kaydet'));
    await waitFor(() => expect(status()).toBe('Kaydedildi.'), T);
    expect((screen.getByLabelText('Unvan') as HTMLInputElement).value).toBe('');
    expect(ran('ekle')).toHaveLength(1);
    expect(opens).toEqual([]);
    expect(closes).toEqual([]);
  });

  it('delete returns to opener; without opener requests close', async () => {
    setPageParams(LIST, { q: 'akdeniz' });
    openedFromList({ kod: 'C-1001' });
    const first = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    fireEvent.click(barButton('Sil'));
    await waitFor(() => expect(closes).toEqual([TAB]), T);
    expect(ran('sil')).toHaveLength(1);
    expect(opens).toEqual([expect.objectContaining({ page: LIST, params: {}, from: TAB, refresh: true, keepParams: true, notice: 'Silindi.' })]);
    expect(pageParamsOf(LIST)).toEqual({ q: 'akdeniz' });
    first.unmount();

    forgetOpener(TAB);
    opens = []; closes = [];
    setPageParams(TAB, { kod: 'C-1001' });
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    fireEvent.click(barButton('Sil'));
    await waitFor(() => expect(closes).toEqual([TAB]), T);
    expect(opens).toEqual([]);
  });

  it('legacy sequence button still only reruns load queries', async () => {
    // Kalıpsız sayfa: aynı Kaydet dizisi düğmesi; açan sekme olsa da sıra sonu yalnız açılış sorgularını yeniler.
    definition = {
      schemaVersion: 2, queries: recordQueries, components: [
        { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Cari kodu', defaultValue: '{{kayit.rows[0].Code}}' } },
        { id: 'b_kaydet', type: 'button', props: { text: 'Kaydet', actionType: 'sequence', saveSequence: ['ekle', 'guncelle'],
          sequenceWhen: ['ekle=kayit.rows[0].Code == null', 'guncelle=kayit.rows[0].Code != null'] } },
      ],
    };
    knownKeys.add('C-2002');
    openedFromList();
    render(<TenantCustomPage code="p" token="t" />);
    const button = await screen.findByRole('button', { name: 'Kaydet' }, T);
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText('Cari kodu'), { target: { value: 'C-2002' } });
    fireEvent.click(button);
    await waitFor(() => expect(ran('kayit')).toHaveLength(2), T);
    expect(ran('ekle')).toHaveLength(1);
    expect(pageParamsOf(TAB)).toEqual({});
    expect(opens).toEqual([]);
    expect(closes).toEqual([]);
  });
});

describe('yeni kayıt kipinde Kaydet engellenmez', () => {
  const sqlCard = (type: string, param: string) => {
    const queries = recordQueries.map((query) => query.id === 'kayit'
      ? { ...query, parameters: [{ name: 'k', binding: `{{sayfa.parametre.${param}}}`, type }] } : query);
    return { schemaVersion: 2, template: { name: 'record' }, queries, components: withKey({ readOnly: true, placeholder: '(otomatik)' }) };
  };
  const savesNew = async () => {
    render(<TenantCustomPage code="p" token="t" />);
    await ready();
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni cari' } });
    fireEvent.click(barButton('Kaydet'));
    await waitFor(() => expect(status()).toBe('Kaydedildi.'), T);
  };

  it('new record save is not blocked for sql source with guid key', async () => {
    definition = sqlCard('guid', 'id');
    await savesNew();
    expect(ran('ekle')).toHaveLength(1);
    expect(ran('guncelle')).toHaveLength(0);
  });

  it('new record save is not blocked for sql source with text key', async () => {
    definition = sqlCard('text', 'kod');
    await savesNew();
    expect(ran('ekle')).toHaveLength(1);
    expect(ran('guncelle')).toHaveLength(0);
  });

  it('new record save is not blocked for sql source with int key', async () => {
    definition = sqlCard('int', 'no');
    await savesNew();
    expect(ran('ekle')).toHaveLength(1);
    expect(ran('guncelle')).toHaveLength(0);
  });

  it('new record save is not blocked for erp operation source', async () => {
    // Kayıt okuması zorunlu `id`'si eksik ERP işlemidir: hiç çalışmaz, Kaydet oluşturur.
    definition = {
      schemaVersion: 2, template: { name: 'record' },
      queries: [
        { id: 'kayit', name: 'kayit', kind: 'read', runOn: 'load', operation: 'stok.kart.getir', parameters: [{ name: 'id', binding: '{{sayfa.parametre.id}}', type: 'guid' }] },
        { id: 'ekle', name: 'ekle', kind: 'insert', runOn: 'manual', operation: 'stok.kart.olustur', parameters: [{ name: 'name', binding: '{{ad.value}}', type: 'text' }] },
        { id: 'guncelle', name: 'guncelle', kind: 'update', runOn: 'manual', operation: 'stok.kart.guncelle',
          parameters: [{ name: 'id', binding: '{{kayit.rows[0].id}}', type: 'guid' }, { name: 'name', binding: '{{ad.value}}', type: 'text' }] },
      ],
      components: [
        { id: 'b_kaydet', type: 'button', props: { slot: 'actions', text: 'Kaydet', actionType: 'sequence', saveSequence: ['ekle', 'guncelle'],
          sequenceWhen: ['ekle=kayit.rows[0].id == null', 'guncelle=kayit.rows[0].id != null'] } },
        { id: 'h', type: 'recordHeader', props: { slot: 'summary', title: '{{kayit.rows[0].name}}' } },
        { id: 't', type: 'tabs', props: { slot: 'tabs', tabs: ['Genel=s1'] } },
        { id: 's1', type: 'formCard', props: { slot: 'section', title: 'Kimlik', inputs: ['kimlik', 'ad'], recordKey: '{{kayit.rows[0].id}}' } },
        { id: 'kimlik', type: 'input', name: 'kimlik', props: { slot: 'field', inputType: 'text', label: 'Kimlik', readOnly: true, placeholder: '(otomatik)', defaultValue: '{{kayit.rows[0].id}}' } },
        { id: 'ad', type: 'input', name: 'ad', props: { slot: 'field', inputType: 'text', label: 'Unvan', defaultValue: '{{kayit.rows[0].name}}' } },
      ],
    };
    render(<TenantCustomPage code="p" token="t" />);
    await ready();
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni kart' } });
    fireEvent.click(barButton('Kaydet'));
    await waitFor(() => expect(status()).toBe('Kaydedildi.'), T);
    expect(calls.filter((call) => call.method === 'POST' && call.endpoint === '/api/stock/items')).toEqual([
      expect.objectContaining({ body: '{"name":"Yeni kart"}' }),
    ]);
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([]);
    expect(calls.filter((call) => call.endpoint.startsWith('/api/stock/items/'))).toEqual([]);
  });
});

describe('kayıt kartında Kaydet hakları çalışacak adımlardan', () => {
  const kaydet = () => [...document.querySelectorAll<HTMLButtonElement>('.page-shell-bar button')].find((button) => button.textContent === 'Kaydet');

  it('update-only user saves an existing record', async () => {
    rights = { view: true, update: true, delete: true };
    setPageParams(TAB, { kod: 'C-1001' });
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    await waitFor(() => expect(kaydet()).toBeTruthy(), T);
    expect(kaydet()!.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni ünvan' } });
    fireEvent.click(kaydet()!);
    await waitFor(() => expect(ran('guncelle')).toHaveLength(1), T);
    expect(ran('ekle')).toHaveLength(0);
  });

  it('update-only user sees no Kaydet in new record mode', async () => {
    rights = { view: true, update: true, delete: true };
    render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    await waitFor(() => expect(document.querySelector('.page-shell-bar')).toBeTruthy(), T);
    expect(kaydet()).toBeUndefined();
  });

  it('insert-only user saves a new record and sees no Kaydet on an existing one', async () => {
    rights = { view: true, insert: true };
    definition = recordDefinition(withKey({ readOnly: true, placeholder: '(otomatik)' }));
    const first = render(<TenantCustomPage code="p" token="t" />);
    await ready();
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni cari' } });
    fireEvent.click(barButton('Kaydet'));
    await waitFor(() => expect(status()).toBe('Kaydedildi.'), T);
    expect(ran('ekle')).toHaveLength(1);
    first.unmount();

    setPageParams(TAB, { kod: 'C-1001' });
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    await waitFor(() => expect(kaydet()).toBeUndefined(), T);
  });

  it('legacy sequence button still needs every step right', async () => {
    rights = { view: true, update: true };
    definition = {
      schemaVersion: 2, queries: recordQueries, components: [
        { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Cari kodu', defaultValue: '{{kayit.rows[0].Code}}' } },
        { id: 'b_kaydet', type: 'button', props: { text: 'Kaydet', actionType: 'sequence', saveSequence: ['ekle', 'guncelle'],
          sequenceWhen: ['ekle=kayit.rows[0].Code == null', 'guncelle=kayit.rows[0].Code != null'] } },
      ],
    };
    setPageParams(TAB, { kod: 'C-1001' });
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByLabelText('Cari kodu', undefined, T);
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
  });
});

describe('yeni kayıt kipinde eklemesiz Kaydet', () => {
  const updateOnly = () => recordDefinition(recordComponents.map((component) => component.id === 'b_kaydet'
    ? { ...component, props: { ...component.props, saveSequence: ['guncelle'], sequenceWhen: ['guncelle=kayit.rows[0].Code != null'] } } : component));

  it('new record save is disabled when the card has no insert', async () => {
    definition = updateOnly();
    render(<TenantCustomPage code="p" token="t" />);
    await ready();
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    const button = barButton('Kaydet');
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Bu kartta yeni kayıt eklenemez.');
    fireEvent.click(button);
    expect(ran('guncelle')).toHaveLength(0);
  });

  it('existing record with update-only Kaydet stays enabled', async () => {
    definition = updateOnly();
    setPageParams(TAB, { kod: 'C-1001' });
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    await waitFor(() => expect(barButton('Kaydet').disabled).toBe(false), T);
    expect(barButton('Kaydet').title).toBe('');
  });
});
