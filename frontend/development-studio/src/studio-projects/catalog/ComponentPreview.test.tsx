// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComponentPreview, PREVIEW_NO_DATA, previewBridgeHost } from "./ComponentPreview";
import { MAX_FRAME_HEIGHT, PREVIEW_FRAME_CSP, handleBridgeRequest } from "./previewBridge";
import { button, click, render } from "./testUtils";

const settings = [
  { name: "baslik", label: "Başlık", type: "text", default: "Satışlar" },
  { name: "etiket", label: "Etiket göster", type: "bool", default: true },
  { name: "adet", label: "Adet", type: "number" },
];
const fetchSpy = vi.fn();

beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal("fetch", fetchSpy); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("ComponentPreview", () => {
  it("ComponentPreview answers get with default settings and refuses runQuery", async () => {
    // Saf yanıtlar: ayarlar varsayılanlardan, başka her şey boş; sayfa verisi istekleri reddedilir.
    const heights: number[] = [];
    const host = previewBridgeHost({ baslik: "Satışlar", adet: null }, px => heights.push(px));
    expect(await handleBridgeRequest({ nx: 1, id: 1, type: "get", path: "ayarlar.baslik" }, host)).toEqual({ ok: true, result: "Satışlar" });
    expect(await handleBridgeRequest({ nx: 1, id: 2, type: "get", path: "ayarlar.adet" }, host)).toEqual({ ok: true, result: null });
    expect(await handleBridgeRequest({ nx: 1, id: 3, type: "get", path: "ayarlar.yok" }, host)).toEqual({ ok: true, result: null });
    expect(await handleBridgeRequest({ nx: 1, id: 4, type: "get", path: "kayit.Kod" }, host)).toEqual({ ok: true, result: null });
    expect(await handleBridgeRequest({ nx: 1, id: 5, type: "get", path: "ayarlar.constructor" }, host)).toEqual({ ok: true, result: null });
    expect(await handleBridgeRequest({ nx: 1, id: 6, type: "runQuery", name: "bolgeSatislari" }, host)).toEqual({ ok: false, error: PREVIEW_NO_DATA });
    expect(await handleBridgeRequest({ nx: 1, id: 7, type: "callOperation", name: "x", values: {} }, host)).toEqual({ ok: false, error: PREVIEW_NO_DATA });
    expect(PREVIEW_NO_DATA).toBe("Önizlemede sayfa verisi yok.");
    await handleBridgeRequest({ nx: 1, id: 8, type: "setHeight", px: 5000 }, host);
    expect(heights).toEqual([MAX_FRAME_HEIGHT]);

    // Çizilen çerçeve: yalnız allow-scripts, CSP'li belge; çerçeveden gelen istekler aynı yanıtları alır.
    const view = await render(<ComponentPreview css=".kutu{}" javascript="ciz()" height={300} settings={settings} />);
    expect(view.querySelector("iframe")).toBeNull();
    expect(view.textContent).toContain("Başlık");
    expect(view.textContent).toContain("Satışlar");
    expect(view.textContent).toContain("Evet");
    // Not metni gerçek davranışı söyler: istekler boş yanıt değil, "Önizlemede sayfa verisi yok." yanıtı alır.
    expect(view.textContent).toContain(`runQuery ve callOperation "${PREVIEW_NO_DATA}" yanıtını alır.`);
    expect(view.textContent).not.toContain("boş yanıt");
    await click(button(view, "Çalıştır"));
    const frame = view.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.style.height).toBe("300px");
    const doc = frame.getAttribute("srcdoc")!;
    expect(doc).toContain(`content="${PREVIEW_FRAME_CSP}"`);
    expect(PREVIEW_FRAME_CSP).toContain("connect-src 'none'");
    expect(doc).toContain(".kutu{}");
    expect(doc).toContain("ciz()");
    const key = /key="([0-9a-f]{32})"/.exec(doc)![1];
    const win = frame.contentWindow!;
    const replies: unknown[] = [];
    win.postMessage = ((message: unknown) => { replies.push(message); }) as typeof win.postMessage;
    const send = async (data: object, source: Window | null = win) => {
      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", { data: { nx: 1, k: key, ...data }, source }));
        await new Promise(r => setTimeout(r, 0));
      });
    };
    await send({ id: 1, type: "get", path: "ayarlar.baslik" });
    await send({ id: 2, type: "runQuery", name: "bolgeSatislari" });
    await send({ id: 3, type: "get", path: "ayarlar.baslik" }, window);
    await send({ id: 4, type: "get", path: "ayarlar.baslik", k: "0".repeat(32) });
    await send({ id: 5, type: "setHeight", px: 640 });
    expect(replies).toEqual([
      { nx: 1, replyTo: 1, ok: true, result: "Satışlar", k: key },
      { nx: 1, replyTo: 2, ok: false, error: "Önizlemede sayfa verisi yok.", k: key },
      { nx: 1, replyTo: 5, ok: true, result: true, k: key },
    ]);
    expect(frame.style.height).toBe("640px");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
