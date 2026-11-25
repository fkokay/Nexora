import { describe, expect, it } from "vitest";
import { canvasFrameUrl, parseCanvasMessage, reloadMessage } from "./erpCanvasProtocol";

const base = { nx: "nexora-canvas", v: 1 };

describe("ERP tuval protokolü", () => {
  it("tuval adresini üretir", () => {
    expect(canvasFrameUrl("https://erp.test", { previewId: "p1" })).toBe("https://erp.test/?designerCanvas=1&embeddedStudio=1&preview=p1");
    expect(canvasFrameUrl("https://erp.test/", { previewId: "p1", systemScreenKey: "customers" })).toBe(
      "https://erp.test/?designerCanvas=1&embeddedStudio=1&preview=p1&page=customers",
    );
  });

  it("reload mesajı üretir", () => {
    expect(reloadMessage(3)).toEqual({ ...base, type: "reload", revision: 3 });
  });

  it("geçerli ready, layout ve error mesajlarını kabul eder", () => {
    expect(parseCanvasMessage({ ...base, type: "ready", revision: 1 })).toEqual({ ...base, type: "ready", revision: 1 });
    const layout = { ...base, type: "layout", revision: 1, height: 500, blocks: [{ id: "a-1", x: 0, y: 0, width: 10, height: 10 }] };
    expect(parseCanvasMessage(layout)).toEqual(layout);
    expect(parseCanvasMessage({ ...base, type: "error", revision: 2, message: "boom" })).toEqual({ ...base, type: "error", revision: 2, message: "boom" });
  });

  it("geçersiz mesajları reddeder", () => {
    const bad = { id: "bad id!", x: 0, y: 0, width: 1, height: 1 };
    expect(parseCanvasMessage({ ...base, type: "layout", revision: 1, height: 5, blocks: [bad] })).toBeNull();
    expect(parseCanvasMessage({ ...base, type: "layout", revision: 1, height: -1, blocks: [] })).toBeNull();
    expect(parseCanvasMessage({ ...base, type: "reload", revision: 1 })).toBeNull();
    expect(parseCanvasMessage(null)).toBeNull();
    expect(parseCanvasMessage({ nx: "other", v: 1, type: "ready", revision: 1 })).toBeNull();
  });
});
