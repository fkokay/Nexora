// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErpCanvasFrame from "./ErpCanvasFrame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];
function render(ui: ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(ui));
  return { container: host, rerender: (next: ReactElement) => act(() => root.render(next)) };
}
const cleanup = () => {
  mounted.forEach(({ root, host }) => {
    act(() => root.unmount());
    host.remove();
  });
  mounted = [];
};
const fireEvent = {
  load: (el: Element) => act(() => void el.dispatchEvent(new Event("load"))),
  click: (el: Element, init: MouseEventInit) =>
    act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }))),
};

const ORIGIN = "https://erp.test";
const tenant = { id: "1", name: "Firma", slug: "firma", role: "owner" };
const FALLBACK = "ERP önizlemesine bağlanılamadı, yerleşik önizleme gösteriliyor.";

function setup(over: Record<string, unknown> = {}) {
  const props = {
    platformOrigin: ORIGIN,
    token: "t",
    tenant,
    target: { previewId: "p1" },
    revision: 0,
    device: "desktop" as const,
    topLevelIds: ["a"],
    selectedId: null,
    interactive: false,
    onSelect: vi.fn(),
    onBlocks: vi.fn(),
    onUnavailable: vi.fn(),
    ...over,
  };
  const utils = render(<ErpCanvasFrame {...props} />);
  const iframe = utils.container.querySelector("iframe") as HTMLIFrameElement;
  const post = vi.fn();
  Object.defineProperty(iframe, "contentWindow", { value: { postMessage: post }, configurable: true });
  const send = (data: unknown, origin = ORIGIN, source: unknown = iframe.contentWindow) =>
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data, origin, source: source as Window }));
    });
  const layout = (revision: number, height: number, origin = ORIGIN) =>
    send(
      { nx: "nexora-canvas", v: 1, type: "layout", revision, height, blocks: [{ id: "a", x: 0, y: 0, width: 300, height: 80 }] },
      origin,
    );
  return { ...utils, props, iframe, post, send, layout };
}

describe("ErpCanvasFrame", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("yüklenince oturum mesajı gönderir", () => {
    const { iframe, post } = setup();
    fireEvent.load(iframe);
    expect(post).toHaveBeenCalledWith({ type: "NEXORA_STUDIO_AUTH", token: "t", tenant }, ORIGIN);
  });

  it("layout yüksekliği ve seçim", () => {
    const { iframe, layout, container, props } = setup();
    layout(1, 640);
    expect(iframe.style.height).toBe("640px");
    const overlay = container.querySelector(".pd-erp-canvas-overlay") as HTMLElement;
    fireEvent.click(overlay, { clientX: 20, clientY: 20 });
    expect(props.onSelect).toHaveBeenCalledWith("a");
    expect(props.onBlocks).toHaveBeenCalled();
  });

  it("eski revision ezmez", () => {
    const { iframe, layout } = setup();
    layout(2, 500);
    layout(1, 300);
    expect(iframe.style.height).toBe("500px");
  });

  it("iframe yeniden yüklenip ready gelince revision sayacı sıfırlanır", () => {
    const { iframe, layout, send } = setup();
    layout(3, 500);
    send({ nx: "nexora-canvas", v: 1, type: "ready", revision: 0 });
    layout(0, 420);
    expect(iframe.style.height).toBe("420px");
  });

  it("hedef değişince eski bloklar temizlenir", () => {
    const { layout, container, rerender, props } = setup({ selectedId: "a" });
    layout(1, 640);
    expect(container.querySelector(".pd-erp-canvas-selected")).not.toBeNull();
    rerender(<ErpCanvasFrame {...props} target={{ previewId: "p2" }} />);
    expect(container.querySelector(".pd-erp-canvas-selected")).toBeNull();
  });

  it("yabancı origin yok sayılır", () => {
    const { iframe, layout } = setup();
    layout(1, 640, "https://evil.test");
    expect(iframe.style.height).not.toBe("640px");
  });

  it("yabancı kaynak pencere yok sayılır", () => {
    const { iframe, send } = setup();
    send({ nx: "nexora-canvas", v: 1, type: "layout", revision: 1, height: 640, blocks: [] }, ORIGIN, window);
    expect(iframe.style.height).not.toBe("640px");
  });

  it("zaman aşımında yedek", () => {
    vi.useFakeTimers();
    const { props } = setup();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(props.onUnavailable).toHaveBeenCalledWith(FALLBACK);
  });

  it("ready gelirse zaman aşımı çalışmaz, tekrar eden ready sorun olmaz", () => {
    vi.useFakeTimers();
    const { props, send } = setup();
    const ready = { nx: "nexora-canvas", v: 1, type: "ready", revision: 0 };
    send(ready);
    send(ready);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(props.onUnavailable).not.toHaveBeenCalled();
  });

  it("error mesajı onUnavailable çağırır", () => {
    const { props, send } = setup();
    send({ nx: "nexora-canvas", v: 1, type: "error", revision: 0, message: "yüklenemedi" });
    expect(props.onUnavailable).toHaveBeenCalledWith("yüklenemedi");
  });

  it("revision değişince reload", () => {
    const { rerender, props, post } = setup();
    rerender(<ErpCanvasFrame {...props} revision={1} />);
    expect(post).toHaveBeenCalledWith({ nx: "nexora-canvas", v: 1, type: "reload", revision: 1 }, ORIGIN);
  });

  it("etkileşim modunda katman tıklamayı geçirir", () => {
    const { container } = setup({ interactive: true });
    const overlay = container.querySelector(".pd-erp-canvas-overlay") as HTMLElement;
    expect(overlay.style.pointerEvents).toBe("none");
  });

  it("seçili blok çerçevelenir", () => {
    const { layout, container } = setup({ selectedId: "a" });
    layout(1, 640);
    expect(container.querySelector(".pd-erp-canvas-selected")).not.toBeNull();
  });
});
