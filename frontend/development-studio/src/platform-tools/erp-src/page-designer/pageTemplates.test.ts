import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RECORD_SOURCE_HINT, LIST_SOURCE_HINT, newBelgeTemplateDefinition, newFreeTemplateDefinition, newPageDefinitionFor, readPageTemplate, newRecordTemplateDefinition, recordSourceProblem, suggestRecordPageCode, NEW_LIST_ID, PAGE_TEMPLATE_CHOICES, listSourceProblem, newListTemplateDefinition, BELGE_DOCUMENTS, templateCatalogText, templateLabel, templateLevel } from "./pageTemplates";
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
      columns: [{ code: "id", label: "Kimlik", type: "guid", key: true, longText: false, required: false, maxLength: null }, { code: "unvan", label: "Unvan", type: "text", key: false, longText: false, required: false, maxLength: null }] };
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
    expect(PAGE_TEMPLATE_CHOICES.map((c) => c.id)).toEqual(["list", "record", "belge", "free"]);
  });

  it("templateLevel of free is 3; label is Serbest; choices are the four templates", () => {
    const free = newFreeTemplateDefinition();
    expect(readPageTemplate({ name: "free" })).toEqual({ name: "free" });
    expect(templateLevel(free)).toBe(3);
    expect(templateLevel({ ...free, components: [...free.components, { id: "x", type: "text", props: { slot: "below" } }] })).toBe(3);
    expect(templateLabel(free)).toBe("Serbest");
    expect(PAGE_TEMPLATE_CHOICES.find((c) => c.id === "free")).toEqual({ id: "free", label: "Serbest", description: "Kalıba uymayan sayfalar: panolar, özet ekranları. Sekmeler ve bölümler sizin." });
    // 5b-2: yeni sayfa yalnız dört kalıpla açılır; "Eski tasarımcı (kalıpsız)" seçimi yok.
    expect(PAGE_TEMPLATE_CHOICES.map((c) => c.id)).toEqual(["list", "record", "belge", "free"]);
    expect(designerPersistence.normalizeDefinition(free).template).toEqual({ name: "free" });
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

  it("new page dialog offers Kayıt kartı second", () => {
    const html = renderToString(createElement(NewPageDialog, { mode: "create", templates: [], takenCodes: [], onCancel: () => {}, onConfirm: () => {} }));
    expect(html.indexOf("Liste")).toBeLessThan(html.indexOf("Kayıt kartı"));
    expect(html.indexOf("Kayıt kartı")).toBeLessThan(html.indexOf("Serbest"));
    expect(html).toContain("Tek bir kaydı görmek ve düzenlemek için.");
  });

  it("newRecordTemplateDefinition shape", () => {
    expect(newRecordTemplateDefinition()).toEqual({ schemaVersion: 2, template: { name: "record" }, queries: [], components: [
      { id: "ozet", type: "recordHeader", props: { slot: "summary" } }, { id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: [] } }] });
  });

  it("recordSourceProblem until a source is chosen", () => {
    const fresh = newRecordTemplateDefinition();
    expect(recordSourceProblem(fresh)).toBe(RECORD_SOURCE_HINT);
    expect(RECORD_SOURCE_HINT).toBe("Önce hangi kaydın gösterileceğini seçin.");
    const withTabs = { ...fresh, components: [fresh.components[0], { id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: [{ id: "genel", label: "Genel" }] } }] };
    expect(recordSourceProblem(withTabs)).toBeNull();
    expect(recordSourceProblem(newListTemplateDefinition())).toBeNull();
    expect(recordSourceProblem({ components: [] })).toBeNull();
    expect(listSourceProblem(fresh)).toBeNull();
  });

  it("templateLabel Kayıt kartı", () => {
    const record = newRecordTemplateDefinition();
    expect(templateLabel(record)).toBe("Kayıt kartı");
    expect(templateLevel(record)).toBe(1);
    expect(templateCatalogText("record", 2)).toBe("Kayıt kartı · 2. basamak");
    expect(templateCatalogText("record", null)).toBe("Kayıt kartı · 1. basamak");
  });

  it("suggestRecordPageCode skips codes that already have pages", () => {
    const column = { code: "id", label: "No", type: "int", key: true, longText: false, required: false, maxLength: null };
    const source = (code: string, opens: string | null) => ({ code, label: code, source: "sql" as const, erpOperation: null, parameters: [], columns: [column], opens });
    const catalog = { version: "1", actions: [], dataSources: [source("a", null), source("b", "cari-karti"), source("c", "stok-karti")] };
    expect(suggestRecordPageCode(catalog, [])).toBe("cari-karti");
    expect(suggestRecordPageCode(catalog, ["cari-karti"])).toBe("stok-karti");
    expect(suggestRecordPageCode(catalog, ["cari-karti", "stok-karti"])).toBeNull();
  });

  it("new page choice builds one of the four templates", () => {
    expect(newPageDefinitionFor("free")).toEqual(newFreeTemplateDefinition());
    expect(newPageDefinitionFor("list")).toEqual(newListTemplateDefinition());
    expect(newPageDefinitionFor("record")).toEqual(newRecordTemplateDefinition());
    expect(newPageDefinitionFor("belge")).toEqual(newBelgeTemplateDefinition());
  });

  it("template mode still offers component presets (legacy page)", () => {
    const html = renderToString(createElement(NewPageDialog, { mode: "template", templates: [{ id: "blank", label: "Boş sayfa", description: "" }], takenCodes: [], onCancel: () => {}, onConfirm: () => {} }));
    expect(html).toContain("Boş sayfa");
    expect(html).not.toContain("Eski tasarımcı (kalıpsız)");
  });
});

describe("belge modelleri", () => {
  it("satış ve depo belgeleri seçilebilir; yeni transfer sayfası transfer alanlarıyla başlar", () => {
    expect(BELGE_DOCUMENTS.map((d) => d.code)).toEqual(["satis.siparis", "satis.teklif", "stok.transfer"]);
    const quote = newBelgeTemplateDefinition("satis.teklif");
    expect(quote.template).toEqual({ name: "belge", document: "satis.teklif" });
    const parts = quote.components as { type: string; props: { fields?: string[]; columns?: string[] } }[];
    expect(parts.find((c) => c.type === "documentFields")!.props.fields).toEqual(["code", "customerId", "quoteDate", "validUntil"]);
    expect(parts.find((c) => c.type === "documentLines")!.props.columns).not.toContain("deliveredQuantity");
    const transfer = newBelgeTemplateDefinition("stok.transfer");
    const transferParts = transfer.components as { type: string; props: { fields?: string[]; columns?: string[] } }[];
    expect(transferParts.find((c) => c.type === "documentFields")!.props.fields).toEqual(["code", "transferDate", "fromWarehouseId", "toWarehouseId"]);
    expect(transferParts.find((c) => c.type === "documentLines")!.props.columns).toEqual(["stockItemId", "quantity", "unitCode"]);
    expect((newBelgeTemplateDefinition().components as { props: { fields?: string[] } }[])[0].props.fields).toContain("orderDate");
  });
});

