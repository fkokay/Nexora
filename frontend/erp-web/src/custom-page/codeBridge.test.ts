import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_VERSION, bridgeScript, createRateLimiter, handleBridgeRequest, isolatedCodeDocument, parseBridgeRequest, type BridgeHost } from './codeBridge';

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none';";

function host(overrides: Partial<BridgeHost> = {}): BridgeHost {
  return {
    get: vi.fn(() => null), setInput: vi.fn(), runQuery: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    callOperation: vi.fn(async () => ({ sonuc: null })), subscribe: vi.fn(), setHeight: vi.fn(), ...overrides,
  };
}

describe('parseBridgeRequest', () => {
  it('geçerli get isteğini kabul eder', () => {
    expect(parseBridgeRequest({ nx: 1, id: 1, type: 'get', path: 'a.b' })).toEqual({ nx: 1, id: 1, type: 'get', path: 'a.b' });
  });

  it('bizim olmayan iletiyi yok sayar', () => {
    expect(parseBridgeRequest({ nx: 2 })).toBeNull();
    expect(parseBridgeRequest(null)).toBeNull();
    expect(parseBridgeRequest('nx')).toBeNull();
  });

  it('bilinmeyen türü kimlikle reddeder', () => {
    expect(parseBridgeRequest({ nx: 1, id: 2, type: 'rm' })).toEqual({ error: 'Bilinmeyen istek: rm', id: 2 });
  });

  it('64 KiB üstü isteği reddeder', () => {
    expect(parseBridgeRequest({ nx: 1, type: 'get', path: 'x'.repeat(70000) })).toEqual({ error: 'İstek çok büyük.' });
    expect(parseBridgeRequest({ nx: 1, id: 4, type: 'get', path: 'x'.repeat(70000) })).toEqual({ error: 'İstek çok büyük.', id: 4 });
  });

  it('JSON\'a çevrilemeyen veriyi (döngü) atmadan reddeder', () => {
    const cyclic: Record<string, unknown> = { nx: 1, id: 5, type: 'callOperation', name: 'a' };
    cyclic.values = cyclic;
    expect(parseBridgeRequest(cyclic)).toEqual({ error: 'Geçersiz istek.', id: 5 });
  });

  it('setHeight için sayı olmayan değeri reddeder', () => {
    expect(parseBridgeRequest({ nx: 1, id: 3, type: 'setHeight', px: '10' })).toEqual({ error: 'Geçersiz istek: setHeight', id: 3 });
    expect(parseBridgeRequest({ nx: 1, id: 3, type: 'setHeight', px: Number.NaN })).toEqual({ error: 'Geçersiz istek: setHeight', id: 3 });
  });

  it('dize olmayan adları ve geçersiz değerleri reddeder', () => {
    expect(parseBridgeRequest({ nx: 1, id: 6, type: 'runQuery', name: 7 })).toEqual({ error: 'Geçersiz istek: runQuery', id: 6 });
    expect(parseBridgeRequest({ nx: 1, id: 7, type: 'setInput', name: 'a', value: { x: 1 } })).toEqual({ error: 'Geçersiz istek: setInput', id: 7 });
    expect(parseBridgeRequest({ nx: 1, id: 8, type: 'callOperation', name: 'a', values: [] })).toEqual({ error: 'Geçersiz istek: callOperation', id: 8 });
    expect(parseBridgeRequest({ nx: 1, id: 9, type: 'on', event: 'click' })).toEqual({ error: 'Geçersiz istek: on', id: 9 });
    expect(parseBridgeRequest({ nx: 1, type: 'get', path: 'a' })).toEqual({ error: 'Geçersiz istek.' });
  });

  it('tüm türleri kabul eder', () => {
    expect(parseBridgeRequest({ nx: 1, id: 1, type: 'setInput', name: 'a', value: null })).toMatchObject({ type: 'setInput', value: null });
    expect(parseBridgeRequest({ nx: 1, id: 1, type: 'runQuery', name: 'q' })).toMatchObject({ type: 'runQuery', name: 'q' });
    expect(parseBridgeRequest({ nx: 1, id: 1, type: 'callOperation', name: 'x.y', values: { a: 1 } })).toMatchObject({ type: 'callOperation', values: { a: 1 } });
    expect(parseBridgeRequest({ nx: 1, id: 1, type: 'on', event: 'beforeSave' })).toMatchObject({ type: 'on', event: 'beforeSave' });
    expect(parseBridgeRequest({ nx: 1, id: 1, type: 'setHeight', px: 40 })).toMatchObject({ type: 'setHeight', px: 40 });
  });
});

describe('handleBridgeRequest', () => {
  it('get değerini klonlayarak döner', async () => {
    const value = { a: [1, 2], when: undefined as unknown };
    const h = host({ get: vi.fn(() => value) });
    const reply = await handleBridgeRequest({ nx: 1, id: 1, type: 'get', path: 'a' }, h);
    expect(reply).toEqual({ ok: true, result: { a: [1, 2] } });
    expect((reply as { result: unknown }).result).not.toBe(value);
    expect(h.get).toHaveBeenCalledWith('a');
  });

  it('tanımsız sonucu null yapar', async () => {
    expect(await handleBridgeRequest({ nx: 1, id: 1, type: 'get', path: 'a' }, host({ get: () => undefined }))).toEqual({ ok: true, result: null });
  });

  it('setHeight değerini 0–2000 aralığına sıkıştırır', async () => {
    const h = host();
    expect(await handleBridgeRequest({ nx: 1, id: 1, type: 'setHeight', px: 5000 }, h)).toEqual({ ok: true, result: true });
    expect(h.setHeight).toHaveBeenCalledWith(2000);
    await handleBridgeRequest({ nx: 1, id: 1, type: 'setHeight', px: -5 }, h);
    expect(h.setHeight).toHaveBeenLastCalledWith(0);
  });

  it('host hatasını hata yanıtına çevirir', async () => {
    const h = host({ runQuery: vi.fn(async () => { throw new Error('x'); }) });
    expect(await handleBridgeRequest({ nx: 1, id: 1, type: 'runQuery', name: 'q' }, h)).toEqual({ ok: false, error: 'x' });
    const sync = host({ get: () => { throw new Error('x'); } });
    expect(await handleBridgeRequest({ nx: 1, id: 1, type: 'get', path: 'a' }, sync)).toEqual({ ok: false, error: 'x' });
  });

  it('setInput, callOperation ve on host\'a iletilir', async () => {
    const h = host({ callOperation: vi.fn(async () => ({ sonuc: { id: 1 } })) });
    expect(await handleBridgeRequest({ nx: 1, id: 1, type: 'setInput', name: 'ad', value: 'x' }, h)).toEqual({ ok: true, result: true });
    expect(h.setInput).toHaveBeenCalledWith('ad', 'x');
    expect(await handleBridgeRequest({ nx: 1, id: 1, type: 'callOperation', name: 'a.b', values: { q: 1 } }, h)).toEqual({ ok: true, result: { sonuc: { id: 1 } } });
    expect(h.callOperation).toHaveBeenCalledWith('a.b', { q: 1 });
    expect(await handleBridgeRequest({ nx: 1, id: 1, type: 'on', event: 'select' }, h)).toEqual({ ok: true, result: true });
    expect(h.subscribe).toHaveBeenCalledWith('select');
  });
});

describe('createRateLimiter', () => {
  it('aynı anda en çok 4 çağrı', () => {
    const limiter = createRateLimiter(() => 0);
    for (let i = 0; i < 4; i += 1) expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    limiter.release();
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('dakikada en çok 120 çağrı', () => {
    let now = 1000;
    const limiter = createRateLimiter(() => now);
    for (let i = 0; i < 120; i += 1) { expect(limiter.tryAcquire()).toBe(true); limiter.release(); }
    expect(limiter.tryAcquire()).toBe(false);
    now += 59_999;
    expect(limiter.tryAcquire()).toBe(false);
    now += 1;
    expect(limiter.tryAcquire()).toBe(true);
  });
});

describe('isolatedCodeDocument', () => {
  it('mevcut CSP\'yi aynen içerir', () => {
    expect(isolatedCodeDocument('', '')).toContain(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
  });

  it('köprü betiği kullanıcı kodundan önce ve ayrı bir betikte gelir', () => {
    const doc = isolatedCodeDocument('', 'console.log("KULLANICI")');
    const bridge = doc.indexOf('window.nexora');
    const user = doc.indexOf('KULLANICI');
    expect(bridge).toBeGreaterThan(-1);
    expect(bridge).toBeLessThan(user);
    expect(doc.slice(bridge, user)).toContain('</script><script>');
    expect(bridgeScript).not.toMatch(/<\/script/i);
  });

  it('kullanıcı kodundaki </script ve </style kaçışlanır', () => {
    const doc = isolatedCodeDocument('a</style>b', 'x="</script><b>"');
    expect(doc).not.toContain('x="</script>');
    expect(doc).toContain('x="<\\/script><b>"');
    expect(doc).toContain('a<\\/style>b');
  });

  it('sürüm 1', () => {
    expect(BRIDGE_VERSION).toBe(1);
    expect(bridgeScript).toContain('version:1');
  });
});

describe('bridgeScript', () => {
  type Listener = (event: { source: unknown; data: unknown }) => void;
  function boot() {
    const posted: unknown[] = [];
    const parent = { postMessage: (message: unknown) => posted.push(message) };
    let listener: Listener | undefined;
    const win: Record<string, unknown> = { parent, addEventListener: (_type: string, fn: Listener) => { listener = fn; } };
    new Function('window', 'parent', bridgeScript)(win, parent);
    const deliver = (data: unknown, source: unknown = parent) => listener?.({ source, data });
    return { nexora: win.nexora as Record<string, (...args: unknown[]) => unknown>, posted, deliver, parent };
  }

  it('istek gönderir, yanıtı çözer, başka kaynağı yok sayar', async () => {
    const { nexora, posted, deliver } = boot();
    const result = nexora.get('liste.seciliSatir.code') as Promise<unknown>;
    expect(posted[0]).toEqual({ nx: 1, id: 1, type: 'get', path: 'liste.seciliSatir.code' });
    deliver({ nx: 1, replyTo: 1, ok: true, result: 'SAHTE' }, {});
    deliver({ nx: 1, replyTo: 1, ok: true, result: 'A1' });
    await expect(result).resolves.toBe('A1');
    const failing = nexora.runQuery('q') as Promise<unknown>;
    deliver({ nx: 1, replyTo: 2, ok: false, error: 'olmadı' });
    await expect(failing).rejects.toThrow('olmadı');
  });

  it('beforeSave: ilk iptal eden işleyicinin mesajıyla yanıtlar', async () => {
    const { nexora, posted, deliver } = boot();
    nexora.on('beforeSave', () => true);
    nexora.on('beforeSave', async () => ({ cancel: true, message: 'Kod: iptal' }));
    nexora.on('beforeSave', () => false);
    expect(posted).toEqual([{ nx: 1, id: 1, type: 'on', event: 'beforeSave' }]);
    deliver({ nx: 1, event: 'beforeSave', payload: { query: 'kaydet' }, ask: 9 });
    await vi.waitFor(() => expect(posted).toContainEqual({ nx: 1, answer: 9, cancel: true, message: 'Kod: iptal' }));
  });

  it('beforeSave: iptal yoksa cancel:false; olaylar işleyicilere gider', async () => {
    const { nexora, posted, deliver } = boot();
    const select = vi.fn();
    nexora.on('select', select);
    nexora.on('beforeSave', () => undefined);
    deliver({ nx: 1, event: 'select', payload: { table: 't', row: { a: 1 } } });
    expect(select).toHaveBeenCalledWith({ table: 't', row: { a: 1 } });
    deliver({ nx: 1, event: 'beforeSave', payload: { query: 'q' }, ask: 3 });
    await vi.waitFor(() => expect(posted).toContainEqual({ nx: 1, answer: 3, cancel: false }));
  });
});
