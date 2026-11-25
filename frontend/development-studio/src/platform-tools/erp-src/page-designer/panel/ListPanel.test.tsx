import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveCatalog } from "../catalogClient";
import { newListTemplateDefinition } from "../pageTemplates";
import { LIST_ACTIONS_NOTE, LIST_EXPORT_NOTE, LIST_MISSING_IN_CATALOG, ListPanel } from "./ListPanel";
import { addListAction, CARD_UNAVAILABLE, chooseDataSource, rowOpenParamName, setListProps, setRowDoubleClick, SOURCE_NEEDS_INPUT, type ModelDefinition } from "./listPanelModel";

const catalog: ActiveCatalog = {
  version: "1",
  dataSources: [
    { code: "cariler", label: "Cari hesaplar", source: "sql", erpOperation: null, parameters: [], opens: null,
      columns: [{ code: "id", label: "Kimlik", type: "guid", key: true }, { code: "unvan", label: "Unvan", type: "text", key: false }] },
    { code: "tarihli", label: "Son 30 gün işlem görenler", source: "sql", erpOperation: null, parameters: [{ name: "tarih", type: "date" }], opens: null, columns: [] },
  ],
  actions: [{ code: "ekstre", label: "Ekstre al", kind: "update", target: "row", source: "sql", erpOperation: null, parameters: [{ name: "id", type: "guid" }], confirmText: null }],
};
const bound = chooseDataSource(newListTemplateDefinition() as unknown as ModelDefinition, "liste", catalog.dataSources[0]);
const render = (definition: ModelDefinition, active: ActiveCatalog | null = catalog) => renderToString(
  <ListPanel definition={definition} listId="liste" catalog={active} catalogStatus="ready" operationOf={() => undefined}
    isTenantAdmin={false} recordCount={312} onChange={() => {}}/>);

describe("ListPanel", () => {
  it("shows the reason when Kartı aç is unavailable", () => {
    expect(render(bound)).toContain(CARD_UNAVAILABLE);
  });
  it("renders sections in mockup order without tabs", () => {
    const html = render(bound);
    const order = ["Ne listelensin?", "Cari hesaplar", "Yazılımcının hazırladığı veri kaynağı · 312 kayıt", "Kolonlar", "Arama kutusu", "Sayfa başına",
      "Satıra çift tıklayınca", "Kullanıcı araçları", "Kolon filtreleri", "Kolon seçici", "Pivot", "Dışa aktar", LIST_EXPORT_NOTE,
      "Küçük ekranlarda", "Eylemler", "Listenin üstünde", "Her satırın sonunda", LIST_ACTIONS_NOTE,
      "Görünüm", "Satır yüksekliği", "Çizgili satırlar", "Liste boşken yazılacak", "Ne zaman görünsün?",
      "Aradığın alan ya da liste yok mu?", "Yazılımcıdan iste →"];
    const at = order.map((text) => html.indexOf(text));
    order.forEach((text, index) => expect(at[index], text).toBeGreaterThanOrEqual(0));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const size of ["10", "25", "50", "100"]) expect(html).toContain(`>${size}</button>`);
    expect(html).not.toContain("tablist");
    expect(html).not.toContain("role=\"dialog\"");
    expect(html).not.toContain("<details open");
    expect(html).toContain("href=\"#my-requests\"");
    // Sayfanın tek listesi gizlenemez: liste panelinde "Mobilde gizle" anahtarı yok.
    expect(html).not.toContain("Mobilde bu ızgarayı gizle");
  });
  it("shows unusable sources dimmed with their reason", () => {
    const html = render(bound);
    expect(html).toContain("is-dim");
    expect(html).toContain(SOURCE_NEEDS_INPUT);
  });
  it("marks codes removed from the catalog", () => {
    const withAction = addListAction(bound, "liste", catalog.actions[0], "row");
    const html = render(withAction, { version: "2", dataSources: [catalog.dataSources[1]], actions: [] });
    expect(html).toContain(LIST_MISSING_IN_CATALOG);
    expect(html).toContain("cariler");
    // I4: yerleştirilmiş ama katalogdan kalkmış eylem kaldırılabilir çip olarak görünür.
    expect(html).toContain(`ekstre · ${LIST_MISSING_IN_CATALOG}`);
    expect(html).toContain("cpanel-chip on is-missing");
  });
  it("offers two row heights, an empty preview and a labelled title input (M2, M6)", () => {
    const html = render(bound);
    expect(html).toContain(">Sıkı</button>");
    expect(html).toContain(">Rahat</button>");
    expect(html).not.toContain(">Normal</button>");
    expect(html.indexOf("Liste boşken yazılacak")).toBeLessThan(html.indexOf("Boş halini önizle"));
    expect(html).toContain('aria-label="Liste başlığı"');
  });
  it("eski kayıttaki hideOnMobile değeri yalnız eski ayarlarda görünür", () => {
    const html = render(setListProps(bound, "liste", { hideOnMobile: true }));
    expect(html).toContain("Eski ayarlar (salt okunur)");
    expect(html).toContain("<dt>hideOnMobile</dt>");
  });
  it("Kartı aç seçiliyken açılan sayfanın kaydı aldığı parametre adını gösterir", () => {
    const opener = { code: "cari-liste", label: "Cari kartlar", source: "sql" as const, erpOperation: null, parameters: [], opens: "cari-kart",
      columns: [{ code: "Kod", label: "Kod", type: "text", key: true }, { code: "Unvan", label: "Unvan", type: "text", key: false }] };
    const withOpener: ActiveCatalog = { ...catalog, dataSources: [opener, ...catalog.dataSources] };
    const chosen = chooseDataSource(newListTemplateDefinition() as unknown as ModelDefinition, "liste", opener);
    expect(render(chosen, withOpener)).not.toContain("bilgisiyle alır");
    const card = setRowDoubleClick(chosen, "liste", "card", opener);
    // Büyük harfli anahtar kolon (Kod) açılan sayfada küçük harfle (kod) okunur.
    expect(rowOpenParamName(card, "liste", opener)).toBe("kod");
    expect(render(card, withOpener)).toContain("Açılan sayfa bu kaydı <code>kod</code> bilgisiyle alır.");
    expect(render(setRowDoubleClick(card, "liste", "none", opener), withOpener)).not.toContain("bilgisiyle alır");
  });
  it("explains a missing active catalog", () => {
    expect(render(bound, null)).toContain("Etkin katalog sürümü yok");
  });
});
