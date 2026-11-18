import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeFrame } from './CodeFrame';
import { BEFORE_SAVE_TIMEOUT_MESSAGE, createPageEvents, type PageEvents } from './pageEvents';
import type { BridgeHost } from './codeBridge';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function makeHost(overrides: Partial<BridgeHost> = {}): BridgeHost {
  return {
    get: vi.fn(() => 'A1'), setInput: vi.fn(), runQuery: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    callOperation: vi.fn(async () => ({ sonuc: null })), subscribe: vi.fn(), setHeight: vi.fn(), ...overrides,
  };
}

function mount(options: { host?: BridgeHost; events?: PageEvents; hidden?: boolean } = {}) {
  const host = options.host ?? makeHost();
  const events = options.events ?? createPageEvents();
  const view = render(<CodeFrame id="c1" css="" javascript="" hidden={options.hidden ?? false} title="Kod" host={host} events={events} style={{ gridColumn: 'span 6' }} />);
  const iframe = view.container.querySelector('iframe')!;
  const frameWindow = iframe.contentWindow!;
  const posted = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
  const send = (data: unknown, source: unknown = frameWindow) => {
    const event = new MessageEvent('message', { data });
    Object.defineProperty(event, 'source', { value: source });
    act(() => { window.dispatchEvent(event); });
  };
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  return { ...view, host, events, iframe, frameWindow, posted, send, flush };
}

describe('CodeFrame', () => {
  it('ignores messages from other sources', async () => {
    const { host, send, flush, posted } = mount();
    send({ nx: 1, id: 1, type: 'get', path: 'a' }, window);
    send({ nx: 1, id: 2, type: 'get', path: 'a' }, null);
    send({ nx: 1, id: 3, type: 'get', path: 'a' }, {});
    await flush();
    expect(host.get).not.toHaveBeenCalled();
    expect(posted).not.toHaveBeenCalled();
  });

  it('answers get from own frame', async () => {
    const { host, send, flush, posted } = mount();
    send({ nx: 1, id: 1, type: 'get', path: 'liste.seciliSatir.code' });
    await flush();
    expect(host.get).toHaveBeenCalledWith('liste.seciliSatir.code');
    expect(posted).toHaveBeenCalledWith({ nx: 1, replyTo: 1, ok: true, result: 'A1' }, '*');
  });

  it('bozuk istekleri hata yanıtıyla reddeder, host çağrılmaz', async () => {
    const { host, send, flush, posted } = mount();
    send({ nx: 1, id: 4, type: 'rm' });
    send({ nx: 1, id: 5, type: 'get', path: 'x'.repeat(70000) });
    send({ nx: 1, id: 6, type: 'runQuery', name: 3 });
    send({ nx: 2, id: 7, type: 'get', path: 'a' });
    await flush();
    expect(host.get).not.toHaveBeenCalled();
    expect(host.runQuery).not.toHaveBeenCalled();
    expect(posted).toHaveBeenCalledWith({ nx: 1, replyTo: 4, ok: false, error: 'Bilinmeyen istek: rm' }, '*');
    expect(posted).toHaveBeenCalledWith({ nx: 1, replyTo: 5, ok: false, error: 'İstek çok büyük.' }, '*');
    expect(posted).toHaveBeenCalledWith({ nx: 1, replyTo: 6, ok: false, error: 'Geçersiz istek: runQuery' }, '*');
    expect(posted).toHaveBeenCalledTimes(3);
  });

  it('aynı anda 4 çağrıdan fazlasını reddeder', async () => {
    const host = makeHost({ runQuery: vi.fn(() => new Promise<unknown>(() => undefined)) });
    const { send, flush, posted } = mount({ host });
    for (let id = 1; id <= 5; id += 1) send({ nx: 1, id, type: 'runQuery', name: 'q' });
    await flush();
    expect(host.runQuery).toHaveBeenCalledTimes(4);
    expect(posted).toHaveBeenCalledWith({ nx: 1, replyTo: 5, ok: false, error: 'Çok fazla istek; biraz bekleyin.' }, '*');
  });

  it('beforeSave: çerçevenin iptal yanıtını döner', async () => {
    const { send, flush, posted, events } = mount();
    send({ nx: 1, id: 1, type: 'on', event: 'beforeSave' });
    await flush();
    let verdict: unknown;
    const pending = events.beforeSave('kaydet').then((value) => { verdict = value; });
    const ask = posted.mock.calls.map(([message]) => message as { ask?: number }).find((message) => typeof message.ask === 'number')!;
    expect(ask).toMatchObject({ nx: 1, event: 'beforeSave', payload: { query: 'kaydet' } });
    send({ nx: 1, answer: ask.ask, cancel: true, message: 'Kod: iptal' }, {});
    await flush();
    expect(verdict).toBeUndefined();
    send({ nx: 1, answer: ask.ask, cancel: true, message: 'Kod: iptal' });
    await pending;
    expect(verdict).toEqual({ cancel: true, message: 'Kod: iptal' });
  });

  it('beforeSave timeout cancels', async () => {
    vi.useFakeTimers();
    const { send, flush, events } = mount();
    send({ nx: 1, id: 1, type: 'on', event: 'beforeSave' });
    await flush();
    let verdict: unknown;
    void events.beforeSave('kaydet').then((value) => { verdict = value; });
    await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
    expect(verdict).toBeUndefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(verdict).toEqual({ cancel: true, message: BEFORE_SAVE_TIMEOUT_MESSAGE });
    expect(BEFORE_SAVE_TIMEOUT_MESSAGE).toBe('Kod bileşeni yanıt vermedi; işlem iptal edildi.');
  });

  it('beforeSave: abone yoksa beklemeden null', async () => {
    mount();
    const events = createPageEvents();
    await expect(events.beforeSave('q')).resolves.toBeNull();
  });

  it('olaylar yalnız abone çerçevelere gider; load sonradan abone olana da iletilir', async () => {
    const { send, flush, posted, events } = mount();
    act(() => events.emit('select', { table: 't', row: { a: 1 } }));
    expect(posted).not.toHaveBeenCalled();
    send({ nx: 1, id: 1, type: 'on', event: 'select' });
    await flush();
    act(() => events.emit('select', { table: 't', row: { a: 1 } }));
    expect(posted).toHaveBeenCalledWith({ nx: 1, event: 'select', payload: { table: 't', row: { a: 1 } } }, '*');
    act(() => events.emit('load', {}));
    send({ nx: 1, id: 2, type: 'on', event: 'load' });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(posted).toHaveBeenCalledWith({ nx: 1, event: 'load', payload: {} }, '*');
  });

  it('hidden frame renders but is not displayed', () => {
    const { iframe } = mount({ hidden: true });
    expect(iframe).toBeTruthy();
    expect(iframe.style.display).toBe('none');
    expect(iframe.style.gridColumn).toBe('');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('srcdoc')).toContain('window.nexora');
  });

  it('görünür çerçeve setHeight ile yüksekliğini alır', async () => {
    const { send, flush, iframe } = mount();
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    send({ nx: 1, id: 1, type: 'setHeight', px: 5000 });
    await flush();
    expect(iframe.style.height).toBe('2000px');
    expect(iframe.style.gridColumn).toBe('span 6');
  });

  it('çerçeve yönlenirse (ikinci load) köprü kalıcı olarak kapanır', async () => {
    let resolve!: (value: unknown) => void;
    const host = makeHost({ runQuery: vi.fn(() => new Promise<unknown>((done) => { resolve = done; })) });
    const view = mount({ host });
    const load = () => act(() => { view.iframe.dispatchEvent(new Event('load')); });
    load();
    view.send({ nx: 1, id: 1, type: 'get', path: 'a' });
    view.send({ nx: 1, id: 2, type: 'on', event: 'beforeSave' });
    view.send({ nx: 1, id: 3, type: 'on', event: 'select' });
    view.send({ nx: 1, id: 4, type: 'runQuery', name: 'q' });
    await view.flush();
    expect(view.posted).toHaveBeenCalledWith({ nx: 1, replyTo: 1, ok: true, result: 'A1' }, '*');
    let verdict: unknown = 'bekliyor';
    const pending = view.events.beforeSave('q').then((value) => { verdict = value; });
    view.posted.mockClear();
    vi.mocked(host.get).mockClear();

    load();
    await pending;
    expect(verdict).toBeNull();
    view.send({ nx: 1, id: 5, type: 'get', path: 'a' });
    resolve({ rows: [], rowCount: 0 });
    await view.flush();
    act(() => view.events.emit('select', { table: 't', row: null }));
    await expect(view.events.beforeSave('q')).resolves.toBeNull();
    expect(host.get).not.toHaveBeenCalled();
    expect(view.posted).not.toHaveBeenCalled();

    // Aynı kodla yeniden çizim çerçeveyi diriltmez; yeni kod taze bir iframe ile köprüyü yeniden kurar.
    view.rerender(<CodeFrame id="c1" css="" javascript="" hidden={false} title="Kod" host={host} events={view.events} />);
    expect(view.container.querySelector('iframe')).toBe(view.iframe);
    view.send({ nx: 1, id: 6, type: 'get', path: 'a' });
    await view.flush();
    expect(host.get).not.toHaveBeenCalled();
    view.rerender(<CodeFrame id="c1" css="" javascript="yeni()" hidden={false} title="Kod" host={host} events={view.events} />);
    const fresh = view.container.querySelector('iframe')!;
    expect(fresh).not.toBe(view.iframe);
    const freshPosted = vi.spyOn(fresh.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    view.send({ nx: 1, id: 7, type: 'get', path: 'a' }, fresh.contentWindow);
    await view.flush();
    expect(freshPosted).toHaveBeenCalledWith({ nx: 1, replyTo: 7, ok: true, result: 'A1' }, '*');
  });

  it('unmount drops pending replies', async () => {
    let resolve!: (value: unknown) => void;
    const host = makeHost({ runQuery: vi.fn(() => new Promise<unknown>((done) => { resolve = done; })) });
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const view = mount({ host });
    const listener = added.mock.calls.find(([type]) => type === 'message')?.[1];
    view.send({ nx: 1, id: 1, type: 'runQuery', name: 'q' });
    view.send({ nx: 1, id: 2, type: 'on', event: 'beforeSave' });
    await view.flush();
    view.posted.mockClear();
    let verdict: unknown = 'bekliyor';
    const pending = view.events.beforeSave('q').then((value) => { verdict = value; });
    view.posted.mockClear();
    view.unmount();
    await pending;
    expect(verdict).toBeNull();
    resolve({ rows: [], rowCount: 0 });
    await view.flush();
    expect(view.posted).not.toHaveBeenCalled();
    expect(listener).toBeDefined();
    expect(removed).toHaveBeenCalledWith('message', listener);
    act(() => view.events.emit('select', { table: 't', row: null }));
    expect(view.posted).not.toHaveBeenCalled();
  });
});
