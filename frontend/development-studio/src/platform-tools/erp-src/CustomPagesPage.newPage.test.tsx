// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Kalıpsız (eski) boş sayfa: "Şablonla başla" yalnız böyle var olan bir sayfada sunulur.
const page = { id: "p1", code: "eski-sayfa", name: "Eski sayfa", description: null, revision: 1, isPublished: false, updatedAt: "2026-11-25T00:00:00Z" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
vi.mock("./authApi", () => ({
  authenticatedFetch: async (url: string) => {
    if (url === "/api/custom-pages") return json([page]);
    if (url === "/api/custom-pages/p1") return json({ ...page, definitionJson: JSON.stringify({ version: 1, components: [], queries: [] }) });
    if (url === "/api/custom-pages/catalog") return json({ version: "1", dataSources: [], actions: [], components: [] });
    if (url === "/api/low-code/capabilities") return json({ customPages: { canRead: true, canCreate: true, canUpdate: true, canPublish: true, canDelete: true } });
    return json([], 404);
  },
}));
vi.mock("@monaco-editor/react", () => ({ default: () => null }));

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => { mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); }); mounted = []; });
const flush = async () => { for (let index = 0; index < 20; index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const buttonIn = (scope: ParentNode, text: string) => [...scope.querySelectorAll("button")].find((item) => item.textContent === text);

async function mount(props: { initialCreate?: boolean; initialPageId?: string; onBack?: () => void }) {
  const { default: CustomPagesPage } = await import("./CustomPagesPage");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => root.render(<CustomPagesPage token="t" role="TenantAdmin" {...props}/>));
  await flush();
  return host;
}

describe("CustomPagesPage new page dialog", () => {
  it("cancelling a new page goes back to the page list", async () => {
    const onBack = vi.fn();
    await mount({ initialCreate: true, onBack });
    expect(dialog()?.getAttribute("aria-label")).toBe("Yeni özel sayfa");
    await act(async () => buttonIn(dialog()!, "Vazgeç")!.click());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("cancelling a new page without a page list leaves no templateless canvas", async () => {
    const host = await mount({ initialCreate: true });
    await act(async () => buttonIn(dialog()!, "Vazgeç")!.click());
    expect(dialog()).toBeNull();
    // Sunucunun reddedeceği kalıpsız tuval ve eski "Şablonla başla" sunulmaz.
    expect(host.textContent).not.toContain("Şablonla başla");
    expect(host.querySelector(".pd-canvas-empty")).toBeNull();
    expect(host.textContent).toContain("Yeni sayfa oluşturulmadı");
    // Kalıp seçimi yeniden açılabilir.
    await act(async () => buttonIn(host, "Kalıp seç")!.click());
    expect(dialog()?.getAttribute("aria-label")).toBe("Yeni özel sayfa");
  });

  it("cancelling Şablonla başla on an existing page only closes the dialog", async () => {
    const onBack = vi.fn();
    const host = await mount({ initialPageId: "p1", onBack });
    await act(async () => buttonIn(host.querySelector(".pd-canvas-empty")!, "Şablonla başla")!.click());
    expect(dialog()?.getAttribute("aria-label")).toBe("Şablonla başla");
    await act(async () => buttonIn(dialog()!, "Vazgeç")!.click());
    expect(dialog()).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
    expect(host.querySelector(".pd-canvas-empty")).not.toBeNull();
  });
});
