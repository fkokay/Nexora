import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition } from "../pageTemplates";
import { FreePanel, freeSelectionOf, type FreeSelection } from "./FreePanel";
import { FreeTablePanel } from "./FreeTablePanel";
import { addItem, addPageAction, addTab, FREE_BLOCK_NOT_EMPTY, FREE_LAST_BLOCK, PAGE_ACTION_ROW } from "./freeModel";
import { chooseTableSource } from "./freeTableModel";
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
});
