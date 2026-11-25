import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LIST_SOURCE_HINT, NEW_LIST_ID, PAGE_TEMPLATE_CHOICES, listSourceProblem, newListTemplateDefinition, templateLabel, templateLevel } from "./pageTemplates";
import { chooseDataSource, type ModelDefinition } from "./panel/listPanelModel";
import NewPageDialog from "./NewPageDialog";
import { designerPersistence } from "../CustomPagesPage";

describe("sayfa kalıpları", () => {
  it("Yeni sayfa > Liste (createFromDialog): kaynak seçilene kadar kaydedilmez, ipucu gösterilir; kaynak seçilince kaydedilebilir", () => {
    // createFromDialog Liste yolu bu tanımı kurar ve listeyi (NEW_LIST_ID) seçer.
    const fresh = newListTemplateDefinition();
    expect(fresh.components).toEqual([expect.objectContaining({ id: NEW_LIST_ID, type: "dataTable" })]);
    expect(listSourceProblem(fresh)).toBe(LIST_SOURCE_HINT);
    expect(LIST_SOURCE_HINT).toBe("Önce ne listeleneceğini seçin.");
    const source = { code: "cariler", label: "Cari hesaplar", source: "sql" as const, erpOperation: null, parameters: [], opens: null,
      columns: [{ code: "id", label: "Kimlik", type: "guid", key: true }, { code: "unvan", label: "Unvan", type: "text", key: false }] };
    const chosen = chooseDataSource(fresh as unknown as ModelDefinition, NEW_LIST_ID, source);
    expect(listSourceProblem(chosen)).toBeNull();
    // Bağlı sorgu silinmişse ya da okuma sorgusu değilse yine kaydedilmez (sunucunun kuralı).
    expect(listSourceProblem({ ...chosen, queries: [] })).toBe(LIST_SOURCE_HINT);
    expect(listSourceProblem({ ...chosen, queries: chosen.queries.map((query) => ({ ...query, kind: "delete" })) })).toBe(LIST_SOURCE_HINT);
    // Kalıpsız sayfada kural yok.
    expect(listSourceProblem({ components: [{ type: "dataTable", props: {} }], queries: [] })).toBeNull();
  });

  it("newListTemplateDefinition shape", () => {
    expect(newListTemplateDefinition()).toEqual({ schemaVersion: 2, template: { name: "list" }, queries: [], components: [{ id: "liste", type: "dataTable", props: { slot: "list" } }] });
    expect(PAGE_TEMPLATE_CHOICES.map((c) => c.id)).toEqual(["list", "free"]);
  });

  it("templateLevel 2 with below component", () => {
    const list = newListTemplateDefinition();
    expect(templateLevel(list)).toBe(1);
    expect(templateLabel(list)).toBe("Liste");
    expect(templateLevel({ ...list, components: [...list.components, { id: "x", type: "text", props: { slot: "below" } }] })).toBe(2);
    expect(templateLevel({ components: [] })).toBeNull();
    expect(templateLabel({ components: [] })).toBe("Kalıpsız");
  });

  it("normalizeDefinition keeps template", () => {
    expect(designerPersistence.normalizeDefinition(newListTemplateDefinition()).template).toEqual({ name: "list" });
    expect(designerPersistence.normalizeDefinition({ components: [] })).not.toHaveProperty("template");
    expect(designerPersistence.normalizeDefinition({ template: { name: "bilinmeyen" }, components: [] })).not.toHaveProperty("template");
  });

  it("wireDefinition sends template", () => {
    const wired = designerPersistence.wireDefinition(designerPersistence.normalizeDefinition(newListTemplateDefinition()), { operations: [] } as never);
    expect(wired.template).toEqual({ name: "list" });
  });

  it("new page dialog offers Liste first", () => {
    const html = renderToString(createElement(NewPageDialog, { mode: "create", templates: [{ id: "blank", label: "Boş sayfa", description: "" }], takenCodes: [], onCancel: () => {}, onConfirm: () => {} }));
    expect(html.indexOf("Liste")).toBeGreaterThan(-1);
    expect(html.indexOf("Liste")).toBeLessThan(html.indexOf("Serbest"));
    expect(html).not.toContain("Boş sayfa");
  });
});
