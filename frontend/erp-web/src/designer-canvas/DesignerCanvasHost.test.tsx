import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useContext, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasAnchorContext } from './anchorContext';
import DesignerCanvasHost from './DesignerCanvasHost';

const mounts = vi.hoisted(() => ({ count: 0, error: false, queryError: false }));

vi.mock('../TenantCustomPage', () => ({
  default: function FakePage() {
    const anchored = useContext(CanvasAnchorContext);
    useEffect(() => { mounts.count += 1; }, []);
    if (mounts.error) return <div className="tenant-custom-page-state tenant-custom-page-error">Sayfa yok</div>;
    if (mounts.queryError) return <><template data-cp-anchor="x" /><div style={{ height: '50px' }}><div className="tenant-custom-page-error tenant-page-query-error">Sorgu hatası</div></div></>;
    return anchored ? <><template data-cp-anchor="x" /><div style={{ height: '50px' }} /></> : <div />;
  },
}));

const STUDIO = 'https://studio.test';
let posted: { message: any; target: string }[];
let frames: FrameRequestCallback[];

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
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
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

  it('blok sorgu hatası layout göndermeyi durdurmaz', async () => {
    mounts.queryError = true;
    renderHost();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    flushFrames();
    expect(lastOfType('error')).toBeUndefined();
    expect(lastOfType('layout')?.message.blocks[0].id).toBe('x');
  });
});
