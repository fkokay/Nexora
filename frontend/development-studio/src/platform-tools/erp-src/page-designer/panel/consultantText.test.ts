import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition, newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import { chooseRecordSource } from "./recordModel";
import { fieldTokens, fromConsultantText, toConsultantText, type FieldToken } from "./consultantText";
import { chooseDataSource, type ModelDefinition } from "./listPanelModel";

const col = (code: string, label: string, key = false) => ({ code, label, type: "text", key, longText: false, required: false, maxLength: null });
const cariler: CatalogDataSource = {
  code: "cariler", label: "Cari hesaplar", source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: [col("id", "Kimlik", true), col("kod", "Cari kodu"), col("unvan", "Unvan")],
};
const catalog: ActiveCatalog = { version: "1", dataSources: [cariler], actions: [] };
const def = chooseDataSource(newListTemplateDefinition() as unknown as ModelDefinition, "liste", cariler);
const tokens: FieldToken[] = [{ label: "Cari kodu", binding: "liste.seciliSatir.kod" }, { label: "Unvan", binding: "liste.seciliSatir.unvan" }];

describe("fieldTokens", () => {
  it("fieldTokens lists list source columns with labels", () => {
    expect(fieldTokens(def, catalog)).toEqual([
      { label: "Kimlik", binding: "liste.seciliSatir.id" },
      { label: "Cari kodu", binding: "liste.seciliSatir.kod" },
      { label: "Unvan", binding: "liste.seciliSatir.unvan" },
    ]);
    expect(fieldTokens(def, null)).toEqual([]);
    expect(fieldTokens({ ...def, components: [] }, catalog)).toEqual([]);
  });
});

describe("consultant text", () => {
  it("round trip keeps known binding", () => {
    const stored = "Cari: {{liste.seciliSatir.kod}} - {{liste.seciliSatir.unvan}}";
    const shown = toConsultantText(stored, tokens);
    expect(shown).toEqual({ text: "Cari: {Cari kodu} - {Unvan}", unknown: false });
    expect(fromConsultantText(shown.text, tokens, stored)).toBe(stored);
    expect(fromConsultantText("Kod {Cari kodu}", tokens, "")).toBe("Kod {{liste.seciliSatir.kod}}");
  });
  it("unknown curly text stays literal", () => {
    expect(toConsultantText("Fiyat {indirimli}", tokens)).toEqual({ text: "Fiyat {indirimli}", unknown: false });
    expect(fromConsultantText("Fiyat {indirimli} {Unvan}", tokens, "")).toBe("Fiyat {indirimli} {{liste.seciliSatir.unvan}}");
  });
  it("unknown stored binding shows question mark and survives unchanged save", () => {
    const stored = "A {{baska.rows[0].x}} B";
    const shown = toConsultantText(stored, tokens);
    expect(shown).toEqual({ text: "A {?} B", unknown: true });
    expect(fromConsultantText(shown.text, tokens, stored)).toBe(stored);
  });
  it("edited text restores nth question mark to nth unknown binding", () => {
    const stored = "{{a.x}} ve {{liste.seciliSatir.kod}} ve {{b.y}}";
    expect(toConsultantText(stored, tokens).text).toBe("{?} ve {Cari kodu} ve {?}");
    expect(fromConsultantText("Yeni {?} / {Unvan} / {?}", tokens, stored)).toBe("Yeni {{a.x}} / {{liste.seciliSatir.unvan}} / {{b.y}}");
  });
  it("removed question mark drops its binding; extra question mark stays literal", () => {
    const stored = "{{a.x}} {{b.y}}";
    expect(fromConsultantText("sadece {?}", tokens, stored)).toBe("sadece {{a.x}}");
    expect(fromConsultantText("{?} {?} {?}", tokens, "{{a.x}}")).toBe("{{a.x}} {?} {?}");
  });
});

describe("fieldTokens on record and free pages (5c Karar 9)", () => {
  const kart: CatalogDataSource = { ...cariler, code: "cariKart", parameters: [{ name: "kod", type: "text" }],
    columns: [col("id", "Kimlik"), col("kod", "Cari kodu", true), col("unvan", "Unvan")] };
  const recordCatalog: ActiveCatalog = { version: "1", dataSources: [kart], actions: [] };
  const record = chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, kart, recordCatalog);

  it("fieldTokens on record page binds to kayit.rows[0]", () => {
    expect(fieldTokens(record, recordCatalog)).toEqual([
      { label: "Kimlik", binding: "kayit.rows[0].id" },
      { label: "Cari kodu", binding: "kayit.rows[0].kod" },
      { label: "Unvan", binding: "kayit.rows[0].unvan" },
    ]);
    const stored = "Cari {{kayit.rows[0].kod}}";
    const shown = toConsultantText(stored, fieldTokens(record, recordCatalog));
    expect(shown).toEqual({ text: "Cari {Cari kodu}", unknown: false });
    expect(fromConsultantText(shown.text, fieldTokens(record, recordCatalog), stored)).toBe(stored);
  });
  it("is empty on a record page without a source, without a catalog and on free pages", () => {
    expect(fieldTokens(newRecordTemplateDefinition() as unknown as ModelDefinition, recordCatalog)).toEqual([]);
    expect(fieldTokens(record, null)).toEqual([]);
    expect(fieldTokens(newFreeTemplateDefinition() as unknown as ModelDefinition, recordCatalog)).toEqual([]);
  });
});
