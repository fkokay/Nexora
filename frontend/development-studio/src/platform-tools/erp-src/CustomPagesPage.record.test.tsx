// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "./page-designer/catalogClient";
import { newRecordTemplateDefinition } from "./page-designer/pageTemplates";
import type { ModelDefinition } from "./page-designer/panel/listPanelModel";
import { chooseRecordSource, fieldKey, removeField } from "./page-designer/panel/recordModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const col = (code: string, label: string, extra: Partial<CatalogColumn> = {}): CatalogColumn =>
  ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null, ...extra });
const cari: CatalogDataSource = {
  code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
  columns: [col("kod", "Cari kodu", { key: true }), col("unvan", "Unvan"), col("vade", "Vade", { type: "int" })],
};
const ekle: CatalogAction = { code: "cariEkle", label: "Cari ekle", kind: "insert", target: "page", source: "sql", erpOperation: null,
  parameters: [{ name: "kod", type: "text" }, { name: "unvan", type: "text" }], confirmText: null };
const catalog: ActiveCatalog = { version: "1", dataSources: [cari], actions: [ekle] };
const built = chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog);
const fieldOf = (def: ModelDefinition, column: string) => def.components.find((component) => component.type === "input" && fieldKey(def, component.id) === column);
// Vade karttan çıkarılmış başlar: sol listeden tıklanınca eklenir ve seçilir.
const start = removeField(built, fieldOf(built, "vade")!.id);

const page = { id: "p1", code: "cari-kart", name: "Cari kartı", description: null, revision: 1, isPublished: false, updatedAt: "2026-11-25T00:00:00Z" };
const saved: unknown[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
vi.mock("./authApi", () => ({
  authenticatedFetch: async (url: string, _token: string, init?: RequestInit) => {
    if (url === "/api/custom-pages") return json([page]);
    if (url === "/api/custom-pages/p1" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { definition: unknown };
      saved.push(body.definition);
      return json({ ...page, revision: 2, definitionJson: JSON.stringify(body.definition) });
    }
    if (url === "/api/custom-pages/p1") return json({ ...page, definitionJson: JSON.stringify(start) });
    if (url === "/api/custom-pages/catalog") return json({ version: "1", dataSources: catalog.dataSources, actions: catalog.actions.map((action) => ({ ...action, confirm: null })) });
    if (url === "/api/low-code/capabilities") return json({ customPages: { canRead: true, canCreate: true, canUpdate: true, canPublish: true, canDelete: true } });
    return json([], 404);
  },
}));
vi.mock("@monaco-editor/react", () => ({ default: () => null }));

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => { mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); }); mounted = []; saved.length = 0; });
const flush = async () => { for (let index = 0; index < 20; index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const key = async (init: KeyboardEventInit) => { await act(async () => { document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init })); }); };
const count = (host: HTMLElement) => Number(/(\d+) bileşen/.exec(host.querySelector(".pd-canvas-meta")?.textContent ?? "")?.[1]);

async function open() {
  const { default: CustomPagesPage } = await import("./CustomPagesPage");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => root.render(<CustomPagesPage token="t" role="TenantAdmin" initialPageId="p1"/>));
  await flush();
  return host;
}
const addVade = async (host: HTMLElement) => {
  const vade = [...host.querySelectorAll<HTMLButtonElement>(".rfl-add")].find((button) => button.textContent === "Vade")!;
  await act(async () => vade.click());
};
const saveNow = async () => { await key({ key: "s", ctrlKey: true }); await flush(); return saved.at(-1) as ModelDefinition; };

describe("CustomPagesPage on a record card", () => {
  it("Ctrl+D on a record part does nothing and Delete removes a field through the record model", async () => {
    const host = await open();
    expect(host.querySelector(".rfl")).not.toBeNull();
    await addVade(host);
    const before = count(host);
    await key({ key: "d", ctrlKey: true });
    expect(count(host)).toBe(before);
    await key({ key: "Delete" });
    expect(count(host)).toBe(before - 1);
    const def = await saveNow();
    expect(fieldOf(def, "vade")).toBeUndefined();
    // Bölümde artık olmayan alanın kimliği kalmaz.
    const ids = new Set(def.components.map((component) => component.id));
    for (const section of def.components.filter((component) => component.props.slot === "section"))
      for (const id of section.props.inputs as string[]) expect(ids.has(id), id).toBe(true);
  }, 30_000);
});
