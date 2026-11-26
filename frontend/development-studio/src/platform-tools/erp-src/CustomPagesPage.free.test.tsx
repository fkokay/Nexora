// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CANVAS_PROTOCOL, CANVAS_VERSION } from "./page-designer/erpCanvasProtocol";
import { LIST_SOURCE_HINT } from "./page-designer/pageTemplates";
import { freeTabs } from "./page-designer/panel/freeModel";
import type { ModelDefinition } from "./page-designer/panel/listPanelModel";

// Serbest gövde ERP tuvalinde (5c son inceleme): seçili bölümün sekmesi gösterilir, kaynaksız Liste'de ipucu çıkar,
// seçimsiz "Bölümler" tuvalde görünen sekmeye ekler.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom'da yok; seçilen bileşen katmanlar ağacında görünür kılınır.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const ORIGIN = "http://erp.test";
const start: ModelDefinition = {
  schemaVersion: 2, template: { name: "free" }, queries: [],
  components: [
    { id: "t", type: "tabs", props: { slot: "tabs", tabs: ["Genel=bolum", "Diğer=b2"] } },
    { id: "bolum", type: "section", props: { slot: "block", title: "Bölüm 1", columns: 2, members: [] } },
    { id: "b2", type: "section", props: { slot: "block", title: "Bölüm 2", columns: 2, members: ["m1"] } },
    { id: "m1", type: "text", props: { slot: "item", text: "Merhaba" } },
  ],
} as unknown as ModelDefinition;

const page = { id: "p1", code: "pano", name: "Pano", description: null, revision: 1, isPublished: false, updatedAt: "2026-11-26T00:00:00Z" };
const saved: ModelDefinition[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
vi.mock("./authApi", () => ({
  authenticatedFetch: async (url: string, _token: string, init?: RequestInit) => {
    if (url === "/api/custom-pages") return json([page]);
    if (url === "/api/custom-pages/p1" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { definition: ModelDefinition };
      saved.push(body.definition);
      return json({ ...page, revision: 1 + saved.length, definitionJson: JSON.stringify(body.definition) });
    }
    if (url === "/api/custom-pages/p1") return json({ ...page, definitionJson: JSON.stringify(start) });
    if (url === "/api/custom-pages/catalog") return json({ version: "1", dataSources: [], actions: [] });
    if (url === "/api/low-code/capabilities") return json({ customPages: { canRead: true, canCreate: true, canUpdate: true, canPublish: true, canDelete: true } });
    return json([], 404);
  },
}));
vi.mock("@monaco-editor/react", () => ({ default: () => null }));

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => { mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); }); mounted = []; saved.length = 0; vi.restoreAllMocks(); });
const flush = async () => { for (let index = 0; index < 20; index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const key = async (init: KeyboardEventInit) => { await act(async () => { document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init })); }); };

async function open() {
  const { default: CustomPagesPage } = await import("./CustomPagesPage");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => root.render(<CustomPagesPage token="t" role="TenantAdmin" initialPageId="p1" platformOrigin={ORIGIN}
    tenant={{ id: "11111111-1111-1111-1111-111111111111", name: "A", slug: "a", role: "TenantAdmin" }}/>));
  await flush();
  const frame = host.querySelector<HTMLIFrameElement>("iframe.pd-erp-canvas-frame");
  expect(frame).not.toBeNull();
  return { host, frame: frame! };
}
const button = (host: HTMLElement, selector: string, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>(selector)].find((item) => item.textContent?.trim() === text);
const showTabs = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([message]) => message as { type?: string; tabsId?: string; index?: number })
  .filter((message) => message.type === "showTab").map((message) => [message.tabsId, message.index]);
/** ERP'nin tuval düzeni iletisi: yalnız verilen bloklar görünür. */
const layout = async (frame: HTMLIFrameElement, ids: string[]) => {
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { origin: ORIGIN, source: frame.contentWindow, data: { nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: "ready", revision: 0 } }));
    window.dispatchEvent(new MessageEvent("message", { origin: ORIGIN, source: frame.contentWindow, data: {
      nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: "layout", revision: 1, height: 400,
      blocks: ids.map((id, index) => ({ id, x: 0, y: index * 100, width: 600, height: 90 })) } }));
  });
};

describe("CustomPagesPage on a free page with the ERP canvas", { timeout: 30_000 }, () => {
  it("adding a tab shows the new tab on the canvas", async () => {
    const { host, frame } = await open();
    const spy = vi.spyOn(frame.contentWindow!, "postMessage");
    const addTab = button(host, "button", "＋ Sekme ekle");
    expect(addTab).toBeTruthy();
    await act(async () => addTab!.click());
    await flush();
    expect(showTabs(spy)).toContainEqual(["t", 2]);
  });

  it("a Liste without a source pauses autosave and says why above the canvas", async () => {
    const { host } = await open();
    await act(async () => button(host, ".pd-palette-item", "Liste")!.click());
    await flush();
    expect([...host.querySelectorAll(".pd-erp-canvas-hint")].map((hint) => hint.textContent)).toContain(LIST_SOURCE_HINT);
    expect(saved).toHaveLength(0);
  });

  it("Bölümler with nothing selected adds the block to the tab shown on the canvas", async () => {
    const { host, frame } = await open();
    await layout(frame, ["t", "t#tab0", "t#tab1", "b2", "m1"]);
    await act(async () => button(host, ".pd-palette-item", "Bölümler")!.click());
    await key({ key: "s", ctrlKey: true });
    await flush();
    const def = saved.at(-1)!;
    expect(def).toBeTruthy();
    const tabs = freeTabs(def)!;
    expect(tabs[0].blockIds).toEqual(["bolum"]);
    expect(tabs[1].blockIds).toHaveLength(2);
    expect(tabs[1].blockIds[0]).toBe("b2");
  });
});
