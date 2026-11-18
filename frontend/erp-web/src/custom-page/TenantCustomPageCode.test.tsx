import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TenantCustomPage from '../TenantCustomPage';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

afterEach(() => { cleanup(); api.mockReset(); vi.restoreAllMocks(); });

const readOp = {
  name: 'stok.kart.liste', label: 'Stok kartları', module: 'Stok', kind: 'read', pageKind: 'read', method: 'GET', route: '/api/stock/items',
  parameters: [], result: { shape: 'list', rowsPath: null, columns: [] }, sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true,
};
const writeOp = { ...readOp, name: 'stok.kart.ekle', kind: 'write', pageKind: 'insert', method: 'POST' };
const deniedOp = { ...readOp, name: 'stok.kart.gizli', allowed: false };

const definition = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  components: [
    { id: 'in1', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad' } },
    { id: 'tbl', type: 'dataTable', name: 'liste', props: { query: 'ql', title: 'Liste' } },
    { id: 'b1', type: 'button', props: { text: 'Kaydet', actionType: 'query', queryId: 'qw' } },
    { id: 'code1', type: 'code', props: { javascript: '1', hidden: true } },
  ],
  queries: [
    { id: 'ql', name: 'kayitlar', kind: 'read', runOn: 'load', parameters: [] },
    { id: 'qw', name: 'kaydet', kind: 'insert', runOn: 'manual', parameters: [{ name: 'ad', binding: '{{ad.value}}', type: 'text' }] },
  ],
  ...extra,
});

async function open(options: { rights?: Record<string, boolean>; previewId?: string } = {}) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: { body?: string }) => {
    if (endpoint.endsWith('/published') || endpoint.endsWith('/preview')) {
      return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: options.rights ?? { view: true, insert: true }, definitionJson: JSON.stringify(definition()) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [readOp, writeOp, deniedOp] };
    if (endpoint === '/api/stock/items') return init?.body ? { id: 'yeni' } : [{ code: 'S1' }];
    if (endpoint.includes('/queries/ql/')) return { columns: [{ code: 'code', label: 'Kod' }], rows: [{ code: 'A1' }, { code: 'B2' }], rowCount: 2 };
    if (endpoint.includes('/queries/qw/')) return { affectedRows: 1 };
    throw new Error(`beklenmeyen ${endpoint}`);
  });
  const view = render(<TenantCustomPage code="p" token="t" previewId={options.previewId} />);
  await screen.findByText('A1');
  const iframe = view.container.querySelector('iframe')!;
  const frameWindow = iframe.contentWindow!;
  const posted = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
  const send = (data: unknown, source: unknown = frameWindow) => {
    const event = new MessageEvent('message', { data });
    Object.defineProperty(event, 'source', { value: source });
    act(() => { window.dispatchEvent(event); });
  };
  const reply = async (id: number) => {
    let found: Record<string, unknown> | undefined;
    await waitFor(() => {
      found = posted.mock.calls.map(([message]) => message as Record<string, unknown>).find((message) => message.replyTo === id);
      expect(found).toBeDefined();
    });
    return found!;
  };
  return { ...view, iframe, frameWindow, posted, send, reply };
}

describe('TenantCustomPage kod köprüsü', () => {
  it('gizli kod bileşeni ızgarada yer kaplamaz, çerçeve yine de vardır', async () => {
    const { iframe } = await open();
    expect(iframe.style.display).toBe('none');
    expect(iframe.style.gridColumn).toBe('');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('get kapsamdan çözer; belirteç hiçbir yanıtta yoktur', async () => {
    const { send, reply, posted } = await open();
    send({ nx: 1, id: 1, type: 'get', path: 'kayitlar.rowCount' });
    expect(await reply(1)).toEqual({ nx: 1, replyTo: 1, ok: true, result: 2 });
    send({ nx: 1, id: 2, type: 'get', path: 'kullanici' });
    await reply(2);
    expect(JSON.stringify(posted.mock.calls)).not.toContain('"t"');
    send({ nx: 1, id: 3, type: 'get', path: 'kayitlar.rows[1].code' });
    expect(await reply(3)).toEqual({ nx: 1, replyTo: 3, ok: true, result: 'B2' });
    send({ nx: 1, id: 4, type: 'get', path: 'liste.seciliSatir.code' });
    expect(await reply(4)).toEqual({ nx: 1, replyTo: 4, ok: true, result: null });
    fireEvent.click(screen.getByText('B2'));
    send({ nx: 1, id: 5, type: 'get', path: 'liste.seciliSatir.code' });
    expect(await reply(5)).toEqual({ nx: 1, replyTo: 5, ok: true, result: 'B2' });
    send({ nx: 1, id: 6, type: 'get', path: 'kayitlar.constructor' });
    expect(await reply(6)).toEqual({ nx: 1, replyTo: 6, ok: true, result: null });
  });

  it('setInput girişi günceller; bilinmeyen giriş hata döner', async () => {
    const { send, reply } = await open();
    send({ nx: 1, id: 1, type: 'setInput', name: 'ad', value: 'Vida' });
    expect(await reply(1)).toMatchObject({ ok: true });
    await waitFor(() => expect((screen.getByLabelText('Ad') as HTMLInputElement).value).toBe('Vida'));
    send({ nx: 1, id: 2, type: 'setInput', name: 'yok', value: 'x' });
    expect(await reply(2)).toEqual({ nx: 1, replyTo: 2, ok: false, error: 'Giriş bulunamadı: yok' });
  });

  it('runQuery okuma sorgusunu çalıştırır ve sonucunu döner', async () => {
    const { send, reply } = await open();
    send({ nx: 1, id: 1, type: 'runQuery', name: 'kayitlar' });
    expect(await reply(1)).toEqual({ nx: 1, replyTo: 1, ok: true, result: { rows: [{ code: 'A1' }, { code: 'B2' }], rowCount: 2 } });
  });

  it('runQuery yazma sorgusunu hak yoksa reddeder', async () => {
    const { send, reply } = await open({ rights: { view: true } });
    send({ nx: 1, id: 1, type: 'runQuery', name: 'kaydet' });
    expect(await reply(1)).toEqual({ nx: 1, replyTo: 1, ok: false, error: 'Bu işlem için yetkiniz yok.' });
    expect(api.mock.calls.some(([endpoint]) => String(endpoint).includes('/queries/qw/'))).toBe(false);
  });

  it('runQuery yazma sorgusunu yazar ve affectedRows döner', async () => {
    const { send, reply } = await open();
    send({ nx: 1, id: 1, type: 'runQuery', name: 'kaydet' });
    expect(await reply(1)).toEqual({ nx: 1, replyTo: 1, ok: true, result: { affectedRows: 1, sonuc: null } });
  });

  it('callOperation: katalog istek üzerine gelir; izinsiz işlem ve önizlemede yazma reddedilir', async () => {
    const { send, reply } = await open();
    expect(api).not.toHaveBeenCalledWith('/api/custom-pages/erp-operations', 't');
    send({ nx: 1, id: 1, type: 'callOperation', name: 'stok.kart.liste', values: {} });
    expect(await reply(1)).toEqual({ nx: 1, replyTo: 1, ok: true, result: { rows: [{ code: 'S1' }], rowCount: 1 } });
    send({ nx: 1, id: 2, type: 'callOperation', name: 'stok.kart.gizli', values: {} });
    expect(await reply(2)).toEqual({ nx: 1, replyTo: 2, ok: false, error: 'Bu işlem için yetkiniz yok.' });
    send({ nx: 1, id: 3, type: 'callOperation', name: 'yok.yok.yok', values: {} });
    expect(await reply(3)).toEqual({ nx: 1, replyTo: 3, ok: false, error: 'ERP işlemi bulunamadı: yok.yok.yok' });
    send({ nx: 1, id: 4, type: 'callOperation', name: 'stok.kart.ekle', values: { name: 'X' } });
    expect(await reply(4)).toEqual({ nx: 1, replyTo: 4, ok: true, result: { sonuc: { id: 'yeni' } } });
  });

  it('callOperation önizlemede yazma işlemini reddeder', async () => {
    const { send, reply } = await open({ previewId: 'd1' });
    send({ nx: 1, id: 1, type: 'callOperation', name: 'stok.kart.ekle', values: { name: 'X' } });
    expect(await reply(1)).toEqual({ nx: 1, replyTo: 1, ok: false, error: 'Önizlemede ERP yazma işlemi çalıştırılmaz.' });
    expect(api.mock.calls.some(([endpoint, , init]) => endpoint === '/api/stock/items' && (init as { method?: string } | undefined)?.method === 'POST')).toBe(false);
  });

  it('tablo seçimi select olayını abone çerçeveye iletir', async () => {
    const { send, reply, posted } = await open();
    send({ nx: 1, id: 1, type: 'on', event: 'select' });
    await reply(1);
    fireEvent.click(screen.getByText('B2'));
    await waitFor(() => expect(posted).toHaveBeenCalledWith({ nx: 1, event: 'select', payload: { table: 'liste', row: { code: 'B2' } } }, '*'));
  });

  it('beforeSave iptali yazmayı engeller ve mesajı gösterir; afterSave başarılı yazmadan sonra gelir', async () => {
    const { send, reply, posted } = await open();
    send({ nx: 1, id: 1, type: 'on', event: 'beforeSave' });
    send({ nx: 1, id: 2, type: 'on', event: 'afterSave' });
    await reply(2);
    const asks = () => posted.mock.calls.map(([message]) => message as { ask?: number }).filter((message) => typeof message.ask === 'number');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(asks()).toHaveLength(1));
    send({ nx: 1, answer: asks()[0].ask, cancel: true, message: 'Kod: iptal' });
    expect(await screen.findByText('Kod: iptal')).toBeTruthy();
    expect(api.mock.calls.some(([endpoint]) => String(endpoint).includes('/queries/qw/'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(asks()).toHaveLength(2));
    send({ nx: 1, answer: asks()[1].ask, cancel: false });
    await waitFor(() => expect(posted).toHaveBeenCalledWith({ nx: 1, event: 'afterSave', payload: { query: 'kaydet', sonuc: null } }, '*'));
    expect(api.mock.calls.some(([endpoint]) => String(endpoint).includes('/queries/qw/'))).toBe(true);
  });

  it('başka pencereden gelen sahte istek yok sayılır', async () => {
    const { send, posted } = await open();
    send({ nx: 1, id: 1, type: 'runQuery', name: 'kaydet' }, window);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(posted).not.toHaveBeenCalled();
    expect(api.mock.calls.some(([endpoint]) => String(endpoint).includes('/queries/qw/'))).toBe(false);
  });
});
