import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useContext, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasAnchorContext } from './anchorContext';
import DesignerCanvasHost from './DesignerCanvasHost';

const mounts = vi.hoisted(() => ({
  count: 0, error: false, queryError: false, loading: false, tabs: false, setLoading: (_: boolean) => {},
  params: [] as Record<string, string>[],
}));
const apiMock = vi.hoisted(() => vi.fn());

vi.mock('../erpApi', () => ({ api: apiMock }));

vi.mock('../TenantCustomPage', async () => {
  const { PageTabs } = await import('../custom-page/PageTabs');
  const { pageParamsOf } = await import('../pageNavigation');
  return { default: function FakePage({ previewId }: { previewId: string }) {
    const anchored = useContext(CanvasAnchorContext);
    const [loading, setLoading] = useState(mounts.loading);
    mounts.setLoading = setLoading;
    // TenantCustomPage önizlemede parametreleri `custom-page-preview:<id>` sekme anahtarından okur.
    useEffect(() => { mounts.count += 1; mounts.params.push({ ...pageParamsOf(`custom-page-preview:${previewId}`) }); }, []);
    if (mounts.tabs) return <PageTabs id="sekmeler" tabs={[{ label: 'Genel', ids: [] }, { label: 'Satırlar', ids: [] }]} defaultTab={0}
      renderOwned={() => null} errorCounts={[0, 0]} jumpTo={null} style={{}} />;
    if (loading) return <div className="tenant-custom-page-state" role="status">Sayfa yükleniyor…</div>;
    if (mounts.error) return <div className="tenant-custom-page-state tenant-custom-page-error">Sayfa yok</div>;
    if (mounts.queryError) return <><template data-cp-anchor="x" /><div style={{ height: '50px' }}><div className="tenant-custom-page-error tenant-page-query-error">Sorgu hatası</div></div></>;
    return anchored ? <><template data-cp-anchor="x" /><div style={{ height: '50px' }} /></> : <div />;
  } };
});

const STUDIO = 'https://studio.test';
let posted: { message: any; target: string }[];
let frames: FrameRequestCallback[];
let resizeCallbacks: (() => void)[];
/** `GET /preview` yanıtı ve örnek kayıt ucunun yanıtı. */
let preview: () => Promise<unknown>;
let sample: () => Promise<unknown>;
const recordPreview = (param = 'kartId', source = 'cariKart') => ({ definitionJson: JSON.stringify({
  schemaVersion: 2, template: { name: 'record' },
  queries: [{ id: 'kayit', name: 'kayit', kind: 'read', dataSource: source, parameters: [{ name: 'kod', binding: `{{sayfa.parametre.${param}}}` }] }],
  components: [{ id: 'b1', type: 'formCard', props: { slot: 'section', recordKey: '{{kayit.rows[0].kod}}', inputs: [] } }],
}) });
const sampleCalls = () => apiMock.mock.calls.filter(([url]) => String(url).endsWith('/sample-params')).length;
const reload = (revision: number) => act(() => {
  window.dispatchEvent(new MessageEvent('message', {
    origin: STUDIO, source: window.parent, data: { nx: 'nexora-canvas', v: 1, type: 'reload', revision },
  }));
});

function flushFrames() {
  const pending = frames;
  frames = [];
  act(() => pending.forEach((cb) => cb(0)));
}

function renderHost() {
  return render(<DesignerCanvasHost token="t" params={{ previewId: 'p1' }} studioOrigin={STUDIO} />);
}

beforeEach(() => {
  mounts.count = 0;
  mounts.error = false;
  mounts.queryError = false;
  mounts.loading = false;
  mounts.tabs = false;
  mounts.params = [];
  apiMock.mockReset();
  preview = async () => ({ definitionJson: JSON.stringify({ schemaVersion: 2, components: [] }) });
  sample = async () => ({ params: {} });
  apiMock.mockImplementation((url: string) => (url.endsWith('/sample-params') ? sample() : preview()));
  resizeCallbacks = [];
  posted = [];
  frames = [];
  vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown, target: string) => {
    posted.push({ message, target });
  }) as never);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  // jsdom yerleşim hesaplamaz; 50px'lik blok için kutu döndür.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const h = this.style.height ? 50 : 0;
    return { left: 0, top: 0, width: h ? 100 : 0, height: h, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeCallbacks.push(callback); }
    observe() {} disconnect() {} unobserve() {}
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const lastOfType = (type: string) => [...posted].reverse().find((p) => p.message.type === type);

describe('DesignerCanvasHost', () => {
  it('ilk çizimde ready gönderir', () => {
    renderHost();
    expect(posted[0]).toEqual({ message: { nx: 'nexora-canvas', v: 1, type: 'ready', revision: 0 }, target: STUDIO });
  });

  it('layout mesajı blokları taşır', async () => {
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flushFrames();
    const layout = posted[posted.length - 1];
    expect(layout.message.type).toBe('layout');
    expect(layout.message.blocks[0].id).toBe('x');
    expect(layout.target).toBe(STUDIO);
  });

  it('güvenilen reload sayfayı yeniden yükler', async () => {
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: STUDIO, source: window.parent, data: { nx: 'nexora-canvas', v: 1, type: 'reload', revision: 4 },
      }));
    });
    await waitFor(() => expect(mounts.count).toBe(2));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flushFrames();
    expect(lastOfType('layout')?.message.revision).toBe(4);
  });

  it("başka origin'den reload yok sayılır", async () => {
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://evil.test', source: window.parent, data: { nx: 'nexora-canvas', v: 1, type: 'reload', revision: 4 },
      }));
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mounts.count).toBe(1);
  });

  it('sayfa yüklenemezse error gönderir', async () => {
    mounts.error = true;
    renderHost();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flushFrames();
    expect(lastOfType('error')?.message).toMatchObject({ type: 'error', revision: 0, message: 'Sayfa yok' });
  });

  it('sayfa canlı çalışma alanının ata zinciri içinde çizilir', async () => {
    const { container } = renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    const anchor = container.querySelector('template[data-cp-anchor]')!;
    const main = anchor.closest('.workspace-page-main');
    expect(main).not.toBeNull();
    expect(main!.parentElement!.matches('section.content.workspace-content')).toBe(true);
    expect(main!.parentElement!.parentElement!.matches('main.main-area')).toBe(true);
    const shell = anchor.closest('.app-shell');
    expect(shell).not.toBeNull();
    expect(shell!.classList.contains('designer-canvas-shell')).toBe(true);
    expect(shell!.classList.contains('standalone-studio')).toBe(false);
  });

  it('yükleniyor durumunda layout göndermez, yükleme bitince gönderir', async () => {
    mounts.loading = true;
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: STUDIO, source: window.parent, data: { nx: 'nexora-canvas', v: 1, type: 'reload', revision: 3 },
      }));
    });
    await waitFor(() => expect(mounts.count).toBe(2));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flushFrames();
    expect(lastOfType('layout')).toBeUndefined();
    expect(lastOfType('error')).toBeUndefined();
    act(() => mounts.setLoading(false));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flushFrames();
    expect(lastOfType('layout')?.message).toMatchObject({ type: 'layout', revision: 3, blocks: [{ id: 'x' }] });
  });

  it('blok sorgu hatası layout göndermeyi durdurmaz', async () => {
    mounts.queryError = true;
    renderHost();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flushFrames();
    expect(lastOfType('error')).toBeUndefined();
    expect(lastOfType('layout')?.message.blocks[0].id).toBe('x');
  });

  it('canvas host passes sample params to record page', async () => {
    preview = async () => recordPreview();
    sample = async () => ({ params: { kartId: 'C-001', bozuk: 5 } });
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    expect(apiMock).toHaveBeenCalledWith('/api/custom-pages/p1/preview', 't');
    expect(apiMock).toHaveBeenCalledWith('/api/custom-pages/p1/preview/sample-params', 't');
    // Sayfa ilk çizimde örnek kaydı görür; metin olmayan değerler alınmaz.
    expect(mounts.params[0]).toEqual({ kartId: 'C-001' });

    // Bulunan örnek saklanır: sonraki sürüm ucu yeniden çağırmaz (liste kaynağı yeniden çalışmaz).
    reload(2);
    await waitFor(() => expect(mounts.count).toBe(2));
    expect(sampleCalls()).toBe(1);
    expect(mounts.params[1]).toEqual({ kartId: 'C-001' });
  });

  it('an empty sample is cached per draft too', async () => {
    preview = async () => recordPreview();
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    expect(mounts.params[0]).toEqual({});
    sample = async () => ({ params: { kartId: 'C-009' } });
    reload(2);
    await waitFor(() => expect(mounts.count).toBe(2));
    expect(sampleCalls()).toBe(1);
    expect(mounts.params[1]).toEqual({});
  });

  it('a failed sample is not cached and the page opens without params', async () => {
    preview = async () => recordPreview();
    sample = async () => { throw new Error('500'); };
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    expect(mounts.params[0]).toEqual({});
    sample = async () => ({ params: { kartId: 'C-009' } });
    reload(2);
    await waitFor(() => expect(mounts.count).toBe(2));
    expect(sampleCalls()).toBe(2);
    expect(mounts.params[1]).toEqual({ kartId: 'C-009' });
  });

  it('the cached sample is dropped when the record parameter or source changes', async () => {
    preview = async () => recordPreview();
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    expect(sampleCalls()).toBe(1);
    preview = async () => recordPreview('kod');
    sample = async () => ({ params: { kod: 'C-002' } });
    reload(2);
    await waitFor(() => expect(mounts.count).toBe(2));
    expect(sampleCalls()).toBe(2);
    expect(mounts.params[1]).toEqual({ kod: 'C-002' });
    preview = async () => recordPreview('kod', 'baskaKaynak');
    reload(3);
    await waitFor(() => expect(mounts.count).toBe(3));
    expect(sampleCalls()).toBe(3);
  });

  it('a page that is not a record card never asks for a sample', async () => {
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    reload(2);
    await waitFor(() => expect(mounts.count).toBe(2));
    expect(sampleCalls()).toBe(0);
    expect(mounts.params).toEqual([{}, {}]);
  });

  it('an unreadable draft asks for the sample every time', async () => {
    preview = async () => { throw new Error('404'); };
    sample = async () => ({ params: { kartId: 'C-001' } });
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    reload(2);
    await waitFor(() => expect(mounts.count).toBe(2));
    expect(sampleCalls()).toBe(2);
    expect(mounts.params[1]).toEqual({ kartId: 'C-001' });
  });

  it('resizing the canvas sends a fresh layout', async () => {
    renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flushFrames();
    expect(lastOfType('layout')).toBeDefined();
    posted = [];
    // Studio penceresi daralınca iframe ve kök kutu küçülür: ResizeObserver yeni bir düzen yollar.
    act(() => resizeCallbacks.forEach((callback) => callback()));
    flushFrames();
    expect(lastOfType('layout')?.message.blocks[0].id).toBe('x');
  });

  it('showTab switches the active tab', async () => {
    mounts.tabs = true;
    const { getAllByRole } = renderHost();
    await waitFor(() => expect(mounts.count).toBe(1));
    const selected = () => getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected'));
    expect(selected()).toEqual(['true', 'false']);
    const send = (data: unknown, origin = STUDIO) => act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin, source: window.parent, data }));
    });

    send({ nx: 'nexora-canvas', v: 1, type: 'showTab', tabsId: 'sekmeler', index: 1 }, 'https://evil.test');
    expect(selected()).toEqual(['true', 'false']);
    send({ nx: 'nexora-canvas', v: 1, type: 'showTab', tabsId: 'sekmeler', index: 1 });
    await waitFor(() => expect(selected()).toEqual(['false', 'true']));
    // showTab sayfayı yeniden yüklemez; sekme yeniden yüklemeden sonra da korunur.
    expect(mounts.count).toBe(1);
    send({ nx: 'nexora-canvas', v: 1, type: 'reload', revision: 5 });
    await waitFor(() => expect(mounts.count).toBe(2));
    expect(selected()).toEqual(['false', 'true']);
    send({ nx: 'nexora-canvas', v: 1, type: 'showTab', tabsId: 'sekmeler', index: 0 });
    await waitFor(() => expect(selected()).toEqual(['true', 'false']));
    // "Dene" kipinde kullanıcının tıklaması sekmeyi yine değiştirir; sonraki showTab yeniden uygulanır.
    send({ nx: 'nexora-canvas', v: 1, type: 'showTab', tabsId: 'sekmeler', index: 1 });
    await waitFor(() => expect(selected()).toEqual(['false', 'true']));
    act(() => { getAllByRole('tab')[0].click(); });
    expect(selected()).toEqual(['true', 'false']);
    send({ nx: 'nexora-canvas', v: 1, type: 'showTab', tabsId: 'sekmeler', index: 1 });
    await waitFor(() => expect(selected()).toEqual(['false', 'true']));
  });
});
