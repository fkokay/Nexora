import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { newRecordTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { chooseRecordSource, removeField, fieldKey } from "./recordModel";
import { RecordFieldList } from "./RecordFieldList";

const col = (code: string, label: string, extra: Partial<CatalogColumn> = {}): CatalogColumn =>
  ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null, ...extra });
const cari: CatalogDataSource = {
  code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
  columns: [col("kod", "Cari kodu", { key: true }), col("unvan", "Unvan"), col("vade", "Vade gün", { type: "int" }), col("adres", "Adres", { longText: true })],
};
const catalog: ActiveCatalog = { version: "1", dataSources: [cari], actions: [] };
const built = chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog);
const render = (def: ModelDefinition, active: ActiveCatalog | null = catalog) => renderToString(
  <RecordFieldList def={def} catalog={active} onDragStartColumn={() => {}} onDragStartBlock={() => {}}/>);
const itemOf = (html: string, label: string) => {
  const at = html.indexOf(label);
  return html.slice(html.lastIndexOf("<li", at), html.indexOf("</li>", at));
};

describe("RecordFieldList", () => {
  it("field list marks used columns and missing catalog columns", () => {
    const vade = built.components.find((component) => component.type === "input" && fieldKey(built, component.id) === "vade")!.id;
    const def = removeField(built, vade);
    const html = render(def);
    expect(html).toContain("Alanlar");
    expect(html).toContain("Yazılımcının hazırladığı · <b>Cari kartı</b> veri kaynağı. Kullanılan alanlar işaretli.");
    expect(itemOf(html, "Unvan")).toContain("is-used");
    expect(itemOf(html, "Unvan")).toContain("✓");
    expect(itemOf(html, "Vade gün")).not.toContain("is-used");
    expect(itemOf(html, "Vade gün")).toContain("draggable=\"true\"");
    expect(itemOf(html, "Adres")).toContain("Uzun metin");
    // Katalogdan kalkan kolona bağlı alan "Katalogda yok" taşır.
    const shrunk: ActiveCatalog = { ...catalog, dataSources: [{ ...cari, columns: cari.columns.filter((column) => column.code !== "unvan") }] };
    const missing = render(def, shrunk);
    expect(itemOf(missing, "Unvan")).toContain("Katalogda yok");
    expect(missing.match(/Katalogda yok/g)).toHaveLength(1);
  });
  it("offers lines and note blocks and the developer request link", () => {
    const html = render(built);
    const order = ["Ekle", "Satır tablosu", "Açıklama metni", "Aradığın alan yok mu?", "Yazılımcıdan iste →"].map((text) => html.indexOf(text));
    order.forEach((at) => expect(at).toBeGreaterThan(html.indexOf("Unvan")));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("href=\"#my-requests\"");
  });
  it("asks to choose a record first", () => {
    expect(render(newRecordTemplateDefinition() as unknown as ModelDefinition)).toContain("Önce hangi kaydın gösterileceğini seçin.");
  });
});
