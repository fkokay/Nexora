// @vitest-environment jsdom
import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition } from "../pageTemplates";
import { FreePanel, freeSelectionOf, type FreePanelProps, type FreeSelection } from "./FreePanel";
import { FreeTablePanel } from "./FreeTablePanel";
import {
  addItem, addPageAction, addPageButton, addTab, FREE_BLOCK_NOT_EMPTY, FREE_PAGE_CODE_INVALID, FREE_LAST_BLOCK, freeTabs, MAX_PAGE_ACTIONS, PAGE_ACTION_ROW, pageButtons, renameTab,
} from "./freeModel";
import { chooseTableSource, setTablePageSize } from "./freeTableModel";
import type { ModelDefinition } from "./listPanelModel";

const column = (code: string, label: string) => ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null });
const siparisler: CatalogDataSource = { code: "siparisler", label: "Son siparişler", source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: [column("no", "Sipariş no"), column("cari", "Cari"), column("tutar", "Tutar")] };
const ekstre: CatalogDataSource = { code: "ekstre", label: "Cari ekstresi", source: "sql", erpOperation: null, parameters: [{ name: "cari", type: "guid" }], opens: null, columns: [] };
const action = (code: string, label: string, extra: Partial<CatalogAction> = {}): CatalogAction =>
  ({ code, label, kind: "update", target: "page", source: "sql", erpOperation: null, parameters: [], confirmText: null, ...extra });
const actions = [action("yenile", "Raporu yenile"), action("aktar", "Excel'e aktar"), action("onayla", "Siparişi onayla", { target: "row" })];
const catalog: ActiveCatalog = { version: "1", dataSources: [siparisler, ekstre], actions };

const fresh = () => newFreeTemplateDefinition() as unknown as ModelDefinition;
const ok = <T extends object>(result: T | { reason: string }): T => {
  if ("reason" in result) throw new Error(result.reason);
  return result;
};
const renderPanel = (def: ModelDefinition, selection: FreeSelection, active: ActiveCatalog | null = catalog) => renderToString(
  <FreePanel def={def} selection={selection} catalog={active} name="Satış panosu" onRename={() => {}} onChange={() => {}} onSelect={() => {}}/>);
const renderTable = (def: ModelDefinition, id: string, active: ActiveCatalog | null = catalog) => renderToString(
  <FreeTablePanel def={def} id={id} catalog={active} onChange={() => {}}/>);
/** Görünen metin (etiketler atılır, öznitelikler sayılmaz). */
const visible = (html: string) => html.replace(/<[^>]*>/g, " ");
function inOrder(html: string, parts: string[]) {
  const at = parts.map((part) => html.indexOf(part));
  parts.forEach((part, index) => expect(at[index], part).toBeGreaterThanOrEqual(0));
  const listed = (pairs: [number, string][]) => pairs.map(([value, part]) => `${value} ${part}`).join("\n");
  const pairs = parts.map((part, index): [number, string] => [at[index], part]);
  expect(listed(pairs)).toBe(listed([...pairs].sort((a, b) => a[0] - b[0])));
}

describe("serbest gövde paneli", () => {
  it("freeSelectionOf maps page, block and item", () => {
    const item = ok(addItem(fresh(), "text", { blockId: "bolum" }));
    const def = addPageAction(item.def, actions[0]);
    const button = def.components.find((component) => component.type === "button")!;
    expect(freeSelectionOf(def, null)).toEqual({ kind: "page" });
    expect(freeSelectionOf(def, "kayip")).toEqual({ kind: "page" });
    expect(freeSelectionOf(def, "bolum")).toEqual({ kind: "block", id: "bolum" });
    expect(freeSelectionOf(def, item.itemId)).toBeNull();
    expect(freeSelectionOf(def, button.id)).toBeNull();
    const tabbed = ok(addTab(def)).def;
    const tabs = tabbed.components.find((component) => component.type === "tabs")!;
    expect(freeSelectionOf(tabbed, tabs.id)).toBeNull();
  });

  it("page panel lists tabs and usable page actions only", () => {
    const untabbed = renderPanel(fresh(), { kind: "page" });
    inOrder(untabbed, ["Satış panosu", "Serbest gövde · 3. basamak", "Sekmeler", "Bu sayfada sekme yok", "Sekme ekle", "Eylemler",
      "Raporu yenile", "Excel&#x27;e aktar", "Siparişi onayla", `${PAGE_ACTION_ROW}</small>`, "Eylemleri yazılımcı hazırlar", "İlk eylem ana düğmedir."]);
    expect(untabbed).not.toContain("Görünüm");

    const def = addPageAction(ok(addTab(fresh(), "Ayrıntı")).def, actions[0]);
    const html = renderPanel(def, { kind: "page" });
    expect(html).toContain('value="Genel"');
    expect(html).toContain('value="Ayrıntı"');
    expect(html).not.toContain("Bu sayfada sekme yok");
    expect(html.match(/>Sil<\/button>/g)).toHaveLength(2);
    // Eklenen eylem açık, satır eylemi soluk ve seçilemez.
    expect(html).toMatch(/class="cpanel-chip on"[^>]*>Raporu yenile/);
    expect(html).toMatch(/class="cpanel-chip is-dim"[^>]*disabled=""[^>]*>Siparişi onayla/);
  });

  it("page panel shows an action removed from the catalog as removable", () => {
    const def = addPageAction(fresh(), action("arsiv", "Arşivle"));
    const html = renderPanel(def, { kind: "page" });
    expect(html).toContain("Arşivle · Katalogda yok");
    expect(html).not.toContain("arsiv");
  });

  it("block panel delete is disabled with reason when block has members", () => {
    const only = renderPanel(fresh(), { kind: "block", id: "bolum" });
    inOrder(only, ["Bölüm", "Başlık", 'value="Bölüm 1"', "Kolon sayısı", ">1</button>", ">2</button>", ">3</button>", "Dar ekranda kolonlar",
      "Sıra", "Yukarı", "Aşağı", "Bölümü sil", FREE_LAST_BLOCK, "Görünüm", "Ne zaman görünsün?", "Mobilde gizle"]);
    expect(only).not.toContain(">Sekme<");
    expect(only).toMatch(/disabled=""[^>]*>Bölümü sil/);

    const item = ok(addItem(fresh(), "text", { blockId: "bolum" }));
    const full = renderPanel(item.def, { kind: "block", id: "bolum" });
    expect(full).toContain(FREE_BLOCK_NOT_EMPTY);
    expect(full).toMatch(/disabled=""[^>]*>Bölümü sil/);

    const tabbed = ok(addTab(fresh()));
    const second = renderPanel(tabbed.def, { kind: "block", id: tabbed.blockId });
    inOrder(second, ["Kolon sayısı", ">Sekme<", "Genel", "Yeni sekme", "Sıra (sekme içinde)", "Bölümü sil"]);
    expect(second).not.toContain(FREE_LAST_BLOCK);
    expect(second).not.toContain(FREE_BLOCK_NOT_EMPTY);
    expect(second).not.toMatch(/disabled=""[^>]*>Bölümü sil/);
  });

  it("table panel marks missing source as Katalogda yok", () => {
    const item = ok(addItem(fresh(), "table", { blockId: "bolum" }));
    const bound = chooseTableSource(item.def, item.itemId, siparisler);
    const html = renderTable(bound, item.itemId);
    inOrder(html, ["Ne listelensin?", "Son siparişler</label>", "Cari ekstresi", "Bu kaynak ek bilgi istiyor; burada kullanılamaz.", "Yazılımcının hazırladığı veri kaynağı",
      "Kolonlar", "Sipariş no", "Sıra, işaretleme sırasıdır", "Sayfa başına", ">10</button>", ">25</button>", ">50</button>",
      "Bu liste salt okunurdur", "Görünüm", "Liste boşken yazılacak", "Ne zaman görünsün?", "Mobilde gizle"]);
    expect(html).not.toContain(">100</button>");
    expect(html).not.toContain("Satıra çift tıklayınca");
    expect(html).not.toContain("Her satırın sonunda");

    const gone = renderTable(bound, item.itemId, { version: "2", dataSources: [ekstre], actions: [] });
    expect(gone).toContain("Silinmiş kaynak");
    expect(gone).toContain("Katalogda yok");
    expect(visible(gone)).not.toContain("siparisler");
  });

  it("panels have no tabs and no technical words", () => {
    const item = ok(addItem(fresh(), "table", { blockId: "bolum" }));
    let def = chooseTableSource(item.def, item.itemId, siparisler);
    def = addPageAction(def, actions[0]);
    const tabbed = ok(addTab(def));
    def = tabbed.def;
    const pages = [renderPanel(def, { kind: "page" }), renderPanel(def, { kind: "block", id: "bolum" }), renderPanel(def, { kind: "block", id: tabbed.blockId }),
      renderTable(def, item.itemId)];
    for (const html of pages) {
      expect(html).not.toContain("tablist");
      expect(html).not.toContain('role="dialog"');
      expect(html).not.toContain("<details open");
      const text = visible(html);
      for (const word of ["members", "slot", "{{", "dataTable", "section", "query", "rows[0]", "bolum", "sekmeler", "Eski ayarlar"]) expect(text, word).not.toContain(word);
    }
  });

  it("tab rows keep their key while the tab is renamed (focus stays in the input)", () => {
    // PagePanel kancasız: öğe ağacı doğrudan çağrılarak açılır, sekme satırlarının anahtarları okunur.
    const rowKeys = (def: ModelDefinition) => {
      const page = FreePanel({ def, selection: { kind: "page" }, catalog, onChange: () => {}, onSelect: () => {} }) as ReactElement<FreePanelProps>;
      const tree = (page.type as (props: FreePanelProps) => ReactNode)(page.props);
      const keys: (string | null)[] = [];
      const walk = (node: ReactNode) => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!isValidElement(node)) return;
        const children = (node.props as { children?: ReactNode }).children;
        const asArray = Array.isArray(children) ? children : [children];
        if (asArray.some((child) => isValidElement(child) && (child.props as { label?: string }).label === "Sekme adı")) keys.push(node.key);
        walk(children);
      };
      walk(tree);
      return keys;
    };
    const def = ok(addTab(fresh(), "Ayrıntı")).def;
    const before = rowKeys(def);
    expect(before).toHaveLength(2);
    expect(rowKeys(renameTab(def, 1, "Ayrıntılar"))).toEqual(before);
  });

  it("table panel offers 100 per page when the saved list uses it", () => {
    const item = ok(addItem(fresh(), "table", { blockId: "bolum" }));
    const bound = chooseTableSource(item.def, item.itemId, siparisler);
    const hundred = { ...bound, components: bound.components.map((c) => c.id === item.itemId ? { ...c, props: { ...c.props, pageSize: 100 } } : c) };
    expect(renderTable(hundred, item.itemId)).toMatch(/class="on" aria-pressed="true"[^>]*>100<\/button>/);
    expect(renderTable(bound, item.itemId)).not.toContain(">100</button>");
    expect(setTablePageSize(bound, item.itemId, 100).components.find((c) => c.id === item.itemId)!.props.pageSize).toBe(100);
  });

  it("page panel shows screen-opening buttons and the form to add one, without technical words", () => {
    const def = addPageButton(addPageAction(fresh(), actions[0]), "satis-raporu", "Satış raporu");
    const html = renderPanel(def, { kind: "page" });
    inOrder(html, ["Eylemler", "Raporu yenile", "Satış raporu", "Açılacak ekranın kodu", "Düğme metni", "＋ Ekran açan düğme",
      "Eylemleri yazılımcı hazırlar", "İlk eylem ana düğmedir."]);
    const text = visible(html);
    for (const word of ["pageCode", "actionType", "page", "slot", "ekranDugmesi"]) expect(text, word).not.toContain(word);
    // Katalog yokken de ekran açan düğme eklenebilir.
    expect(renderPanel(fresh(), { kind: "page" }, null)).toContain("Açılacak ekranın kodu");
  });

  it("tab rows have left and right buttons; the ends are disabled", () => {
    const def = ok(addTab(ok(addTab(fresh(), "Satış")).def, "Stok")).def;
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<FreePanel def={def} selection={{ kind: "page" }} catalog={catalog} onChange={() => {}} onSelect={() => {}}/>));
    const ups = [...host.querySelectorAll<HTMLButtonElement>('button[title="Sekmeyi sola taşı"]')];
    const downs = [...host.querySelectorAll<HTMLButtonElement>('button[title="Sekmeyi sağa taşı"]')];
    expect(ups.map((b) => b.disabled)).toEqual([true, false, false]);
    expect(downs.map((b) => b.disabled)).toEqual([false, false, true]);
    expect(ups.map((b) => b.textContent)).toEqual(["←", "←", "←"]);
    expect(downs.map((b) => b.textContent)).toEqual(["→", "→", "→"]);
    act(() => root.unmount());
  });
});

describe("serbest gövde paneli · etkileşim", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const mount = (def: ModelDefinition, onChange: (next: ModelDefinition) => void) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<FreePanel def={def} selection={{ kind: "page" }} catalog={catalog} onChange={onChange} onSelect={() => {}}/>));
    return { host, unmount: () => { act(() => root.unmount()); host.remove(); } };
  };
  const type = (input: HTMLInputElement, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const click = (element: Element) => act(() => void element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const buttonWith = (host: Element, text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
  const inputOf = (host: Element, label: string) => [...host.querySelectorAll("label")].find((l) => l.textContent?.includes(label))!.querySelector("input")!;

  it("adds a screen-opening button from the code and the text, then clears the form", () => {
    const changes: ModelDefinition[] = [];
    const view = mount(fresh(), (next) => changes.push(next));
    const add = buttonWith(view.host, "Ekran açan düğme") as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    type(inputOf(view.host, "Açılacak ekranın kodu"), "satis-raporu");
    expect(add.disabled).toBe(true);
    type(inputOf(view.host, "Düğme metni"), "Satış raporu");
    expect(add.disabled).toBe(false);
    click(add);
    expect(changes).toHaveLength(1);
    expect(pageButtons(changes[0])).toEqual([{ id: "ekranDugmesi", text: "Satış raporu", pageCode: "satis-raporu" }]);
    expect(inputOf(view.host, "Açılacak ekranın kodu").value).toBe("");
    expect(inputOf(view.host, "Düğme metni").value).toBe("");
    view.unmount();
  });

  it("an invalid screen code keeps the add button disabled and says why", () => {
    const view = mount(fresh(), () => {});
    type(inputOf(view.host, "Açılacak ekranın kodu"), "Satış raporu");
    type(inputOf(view.host, "Düğme metni"), "Rapor");
    expect((buttonWith(view.host, "Ekran açan düğme") as HTMLButtonElement).disabled).toBe(true);
    expect(view.host.textContent).toContain(FREE_PAGE_CODE_INVALID);
    view.unmount();
  });

  it("removes a screen-opening button by clicking its chip", () => {
    const def = addPageButton(fresh(), "rapor", "Rapor");
    const changes: ModelDefinition[] = [];
    const view = mount(def, (next) => changes.push(next));
    click(buttonWith(view.host, "ekran açar"));
    expect(pageButtons(changes[0])).toEqual([]);
    view.unmount();
  });

  it("the form is disabled with the reason when the action bar is full", () => {
    let def = fresh();
    for (let index = 0; index < MAX_PAGE_ACTIONS; index++) def = addPageButton(def, `ekran${index}`, `Ekran ${index}`);
    const view = mount(def, () => {});
    expect((buttonWith(view.host, "Ekran açan düğme") as HTMLButtonElement).disabled).toBe(true);
    expect(view.host.textContent).toContain("İşlem çubuğunda en fazla 8 düğme olabilir.");
    view.unmount();
  });

  it("moves a tab right", () => {
    const def = ok(addTab(fresh(), "Satış")).def;
    const changes: ModelDefinition[] = [];
    const view = mount(def, (next) => changes.push(next));
    click(view.host.querySelector('button[title="Sekmeyi sağa taşı"]')!);
    expect(freeTabs(changes[0])!.map((tab) => tab.label)).toEqual(["Satış", "Genel"]);
    view.unmount();
  });
});
