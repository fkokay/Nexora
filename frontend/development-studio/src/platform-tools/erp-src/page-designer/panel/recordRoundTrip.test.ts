import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogDataSource } from "../catalogClient";
import { newRecordTemplateDefinition, recordSourceProblem } from "../pageTemplates";
import { definitionNeedsAdmin } from "../queryPageLock";
import type { ModelDefinition } from "./listPanelModel";
import { addExtraAction, addLines, addNote, addSection, addTab, chooseRecordSource } from "./recordModel";

const col = (code: string, label: string, key = false) => ({ code, label, type: "text", key, longText: code === "notlar", required: key, maxLength: null });
const cari: CatalogDataSource = {
  code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
  columns: [col("kod", "Cari kodu", true), col("unvan", "Ünvan"), col("notlar", "Notlar")],
};
const hareket: CatalogDataSource = { ...cari, code: "cariHareket", label: "Hareketler", columns: [col("tarih", "Tarih"), col("tutar", "Tutar")] };
const ekle: CatalogAction = { code: "cariEkle", label: "Ekle", kind: "insert", target: "page", source: "sql", erpOperation: null,
  parameters: [{ name: "kod", type: "text" }, { name: "unvan", type: "text" }], confirmText: null };
const catalog: ActiveCatalog = { version: "1", dataSources: [cari, hareket], actions: [
  ekle, { ...ekle, code: "cariGuncelle", kind: "update", target: "row" }, { ...ekle, code: "cariSil", kind: "delete", target: "row", parameters: [{ name: "kod", type: "text" }] }] };

const built = () => {
  let def = chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog);
  def = addSection(def, 0).def;
  def = addTab(def).def;
  def = addLines(def, hareket, 1, 0);
  def = addNote(def, 1, 1, "Hareketler yalnız okunur.");
  return addExtraAction(def, { ...ekle, code: "pasifeAl", label: "Pasife al", kind: "update", target: "row", parameters: [{ name: "kod", type: "text" }] });
};

// Tasarımcı modülü büyük: soğuk dinamik içe aktarma yüklü makinede 5 sn sınırını aşabilir.
describe("Record card output through the designer", { timeout: 30_000 }, () => {
  it("round trip", async () => {
    const { designerInternals, designerPersistence } = await import("../../CustomPagesPage");
    const def = built();
    type Def = Parameters<typeof designerPersistence.wireDefinition>[0];
    const wired = designerPersistence.wireDefinition(def as unknown as Def, { status: "ready", operations: [] });
    const loaded = designerPersistence.normalizeDefinition(JSON.parse(JSON.stringify(wired)));
    expect(loaded).toEqual(def);
    expect(wired.queries.every((query) => query.sql === undefined && query.operation === undefined)).toBe(true);
    for (const queryEditable of [false, true]) {
      const reconciled = designerInternals.reconcileDefinition(def as unknown as Def, { catalog: { status: "ready", operations: [] }, previous: def as unknown as Def, queryEditable });
      expect(reconciled).toEqual(def);
    }
    expect(recordSourceProblem(wired)).toBeNull();
    expect(def.components.every((component) => typeof component.props.slot === "string")).toBe(true);
    // Karar 1 (alt proje 3): katalog başvurulu sayfa yönetici olmayanı kilitlemez.
    expect(definitionNeedsAdmin(JSON.stringify(wired), () => undefined)).toBe(false);
  });
});
