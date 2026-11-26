import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { addNote, chooseRecordSource, fieldKey, fieldRemovalBlocked, removeBlock, removeField, sectionRemovalBlocked } from "./recordModel";
import { ensureTemplateSlots, recordRemoval, templateDuplicateBlocked } from "./templateGuards";

const page = (components: ModelDefinition["components"], template = true): ModelDefinition => {
  const base = newListTemplateDefinition() as unknown as ModelDefinition;
  return template ? { ...base, components } : { schemaVersion: 2, queries: [], components };
};
const list = { id: "liste", type: "dataTable", name: "liste", props: { slot: "list", query: "kaynak", rowActions: ["satirDugmesi"], rowOpenAction: "ac" } };

describe("template guards (I2, M4)", () => {
  it("gives legacy-created top-level components a valid slot and strips width", () => {
    const def = page([list,
      { id: "satirDugmesi", type: "button", props: { label: "Satır işlemi", actionType: "page" } },
      { id: "yeni", type: "button", props: { label: "Yeni", width: 4 } },
      { id: "kart", type: "card", props: { slot: "indicators", widthWhen: "6=x" }, children: [{ id: "ic", type: "text", props: { width: 6 } }] }]);
    const fixed = ensureTemplateSlots(def);
    const by = (id: string) => fixed.components.find((component) => component.id === id)!;
    expect(by("satirDugmesi").props.slot).toBe("rowActions");
    expect(by("yeni").props).toEqual({ label: "Yeni", slot: "below" });
    expect(by("kart").props).toEqual({ slot: "below" });
    expect((by("kart").children as ModelDefinition["components"])[0].props).toEqual({});
    expect(def.components[1].props.slot).toBeUndefined();
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });
  it("leaves pages without a template unchanged", () => {
    const def = page([{ id: "b", type: "button", props: { width: 4 } }], false);
    expect(ensureTemplateSlots(def)).toBe(def);
  });
  it("blocks duplicating the list, the detail panel and the open button", () => {
    const def = page([list, { id: "ac", type: "button", props: { slot: "rowActions" } }, { id: "detay", type: "contextPanel", props: { slot: "detail" } },
      { id: "not", type: "text", props: { slot: "below" } }]);
    expect(["liste", "ac", "detay", "not"].map((id) => templateDuplicateBlocked(def, id))).toEqual([true, true, true, false]);
  });

  it("ensureTemplateSlots uses record slots", () => {
    const base = newRecordTemplateDefinition() as unknown as ModelDefinition;
    const def: ModelDefinition = { ...base, components: [...base.components,
      { id: "bolum", type: "formCard", props: { slot: "section" } }, { id: "not", type: "text", props: { slot: "note" } },
      { id: "satir", type: "dataTable", props: { slot: "lines" } }, { id: "alan", type: "input", props: { slot: "field" } },
      { id: "yanlis", type: "text", props: { slot: "lines" } }, { id: "yanlis2", type: "button", props: { slot: "section" } },
      { id: "liste", type: "dataTable", props: { slot: "list" } }, { id: "yeni", type: "button", props: { width: 4 } }] };
    const fixed = ensureTemplateSlots(def);
    const slot = (id: string) => fixed.components.find((c) => c.id === id)!.props.slot;
    expect(["ozet", "sekmeler", "bolum", "not", "satir", "alan"].map(slot)).toEqual(["summary", "tabs", "section", "note", "lines", "field"]);
    expect(slot("liste")).toBe("below");
    expect(slot("yanlis")).toBe("below");
    expect(slot("yanlis2")).toBe("below");
    expect(slot("yeni")).toBe("below");
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });
});

describe("record card guards for the designer's generic delete and duplicate", () => {
  const col = (code: string, label: string, extra: Partial<CatalogColumn> = {}): CatalogColumn =>
    ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null, ...extra });
  const cari: CatalogDataSource = { code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
    columns: [col("kod", "Cari kodu", { key: true }), col("unvan", "Unvan"), col("vade", "Vade", { type: "int" })] };
  const ekle: CatalogAction = { code: "cariEkle", label: "Cari ekle", kind: "insert", target: "page", source: "sql", erpOperation: null,
    parameters: [{ name: "kod", type: "text" }, { name: "unvan", type: "text" }], confirmText: null };
  const catalog: ActiveCatalog = { version: "1", dataSources: [cari], actions: [ekle] };
  const base = addNote(chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog), 0, 1, "Not");
  const def = { ...base, components: [...base.components, { id: "ek", type: "text", props: { slot: "below", text: "x" } }] };
  const field = (column: string) => def.components.find((component) => component.type === "input" && fieldKey(def, component.id) === column)!.id;
  const of = (slot: string) => def.components.find((component) => component.props.slot === slot)!.id;

  it("Delete on a bound field is refused with the reason", () => {
    const result = recordRemoval(def, field("unvan"));
    expect(result).toEqual({ kind: "blocked", reason: fieldRemovalBlocked(def, field("unvan")) });
    expect((result as { reason: string }).reason).toContain("Kaydet");
  });
  it("Delete on a section bound to Kaydet is refused with section wording", () => {
    const result = recordRemoval(def, "genel");
    expect(result).toEqual({ kind: "blocked", reason: sectionRemovalBlocked(def, "genel") });
    expect((result as { reason: string }).reason).toMatch(/^Bu bölümdeki ".+" alanı Kaydet için gerekli/);
  });
  it("Delete on a free field and on a note uses the record model", () => {
    expect(recordRemoval(def, field("vade"))).toEqual({ kind: "removed", def: removeField(def, field("vade")) });
    expect(recordRemoval(def, of("note"))).toEqual({ kind: "removed", def: removeBlock(def, of("note")) });
  });
  it("Delete on a section removes its fields, or is refused while a field is bound", () => {
    // Kaydet düğmesi ve eylem sorguları kalkınca hiçbir alan eyleme bağlı değildir.
    const unbound = { ...def, components: def.components.filter((component) => component.props.slot !== "actions"), queries: def.queries.filter((query) => query.kind === "read") };
    const result = recordRemoval(unbound, "genel");
    expect(result.kind).toBe("removed");
    const after = (result as { def: ModelDefinition }).def;
    expect(after.components.some((component) => component.type === "input" && component.props.slot === "field")).toBe(false);
    expect(after.components.some((component) => component.id === "genel")).toBe(false);
    expect(recordRemoval(def, "genel").kind).toBe("blocked");
  });
  it("summary, tabs and action buttons are never deleted; extra areas use the generic path", () => {
    expect(recordRemoval(def, of("summary"))).toEqual({ kind: "none" });
    expect(recordRemoval(def, of("tabs"))).toEqual({ kind: "none" });
    expect(recordRemoval(def, of("actions"))).toEqual({ kind: "none" });
    expect(recordRemoval(def, "ek")).toEqual({ kind: "generic" });
    expect(recordRemoval(page([list]), "liste")).toEqual({ kind: "generic" });
  });
  it("Ctrl+D on a record part does nothing; extra areas can still be copied", () => {
    for (const id of [field("vade"), "genel", of("note"), of("summary"), of("tabs"), of("actions")]) expect(templateDuplicateBlocked(def, id), id).toBe(true);
    expect(templateDuplicateBlocked(def, "ek")).toBe(false);
  });
});
