import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogDataSource } from "../catalogClient";
import type { ErpOperation } from "../erpOperations";
import { newListTemplateDefinition } from "../pageTemplates";
import {
  actionMissingColumn, actionUsable, actionUsableAt, addListAction, chooseDataSource, dataSourceUsable, missingCatalogCodes, placedActions,
  OPERATIONS_FAILED, OPERATIONS_LOADING, removeListAction, removePlacedAction, rowOpenChoice, searchState, setColumns, setPageSize, setRowDoubleClick, setSearch, SOURCE_NEEDS_INPUT,
  withOperationParameters, type ModelDefinition,
} from "./listPanelModel";

const col = (code: string, label: string, key = false) => ({ code, label, type: "text", key });
const cariler: CatalogDataSource = {
  code: "cariler", label: "Cari hesaplar", source: "sql", erpOperation: null, parameters: [], opens: "@customer-create",
  columns: [col("id", "Kimlik", true), col("kod", "Cari kodu"), col("unvan", "Unvan"), col("sehir", "Şehir"), col("bakiye", "Bakiye"),
    col("vergi", "Vergi no"), col("tel", "Telefon"), col("eposta", "E-posta")],
};
const aranan: CatalogDataSource = { ...cariler, code: "aranan", parameters: [{ name: "q", type: "text" }] };
const tarihli: CatalogDataSource = { ...cariler, code: "tarihli", parameters: [{ name: "q", type: "text" }, { name: "tarih", type: "date" }] };
const ekstre: CatalogAction = {
  code: "ekstre", label: "Ekstre al", kind: "update", target: "row", source: "sql", erpOperation: null,
  parameters: [{ name: "id", type: "guid" }], confirmText: "“Ekstre” hazırlansın mı?",
};
const sil: CatalogAction = { ...ekstre, code: "topluSil", label: "Seçilenleri sil", kind: "delete", target: "bulk", confirmText: null };

const fresh = () => newListTemplateDefinition() as unknown as ModelDefinition;
const bound = () => chooseDataSource(fresh(), "liste", cariler);
const list = (def: ModelDefinition) => def.components.find((component) => component.id === "liste")!;

describe("dataSourceUsable", () => {
  it("rejects sources with non-q parameters", () => {
    expect(dataSourceUsable(tarihli, true)).toEqual({ usable: false, reason: SOURCE_NEEDS_INPUT });
    expect(dataSourceUsable(aranan, false)).toEqual({ usable: true });
    expect(dataSourceUsable(cariler, false)).toEqual({ usable: true });
  });
  it("SQL source for non-admin", () => {
    expect(dataSourceUsable({ ...cariler, source: "sql" }, false)).toEqual({ usable: true });
  });
  it("reads operation-backed parameters from the ERP operation", () => {
    const operation = { name: "cari.listele", sourceOperation: null, parameters: [
      { name: "q", in: "query", type: "text", required: false }, { name: "page", in: "query", type: "int", required: false },
      { name: "depo", in: "route", type: "guid", required: true }] } as unknown as ErpOperation;
    const ds = withOperationParameters({ ...cariler, source: "erpOperation" as const, erpOperation: "cari.listele" }, operation, false);
    expect(ds.parameters).toEqual([{ name: "q", type: "text" }, { name: "depo", type: "guid" }]);
    expect(dataSourceUsable(ds, true).usable).toBe(false);
  });
});

describe("chooseDataSource", () => {
  it("writes read query bound to catalog code and first six columns", () => {
    const def = bound();
    expect(def.queries).toEqual([{ id: "kaynak", name: "kaynak", kind: "read", dataSource: "cariler", parameters: [], runOn: "load" }]);
    const table = list(def);
    expect(table.name).toBe("liste");
    expect(table.props.query).toBe("kaynak");
    expect(table.props.slot).toBe("list");
    expect(table.props.columns).toEqual(["id", "kod", "unvan", "sehir", "bakiye", "vergi"]);
    expect(table.props.columnLabels).toContain("kod=Cari kodu");
    // I1: yalnız seçili kolonların etiketi yazılır.
    expect(table.props.columnLabels).not.toContain("eposta=E-posta");
    // Aynı listede ikinci seçim sorguyu günceller, yenisini eklemez.
    expect(chooseDataSource(def, "liste", aranan).queries.map((query) => query.id)).toEqual(["kaynak"]);
  });
  it("adds filterBar with searchParam q when source has q", () => {
    const def = chooseDataSource(fresh(), "liste", aranan);
    const bar = def.components.find((component) => component.type === "filterBar")!;
    expect(bar).toMatchObject({ id: "suzgec", name: "suzgec", props: { slot: "filters", table: "liste", search: true, searchParam: "q" } });
    expect(def.queries[0].parameters).toEqual([{ name: "q", type: "text", binding: "{{suzgec.q}}" }]);
    expect(searchState(def, "liste")).toEqual({ on: true, server: true });
    expect(setSearch(def, "liste", false)).toBe(def);
    // q'suz kaynağa geçince süzgeç alanı kalkar, arama tablonun kendi aramasıdır.
    const plain = chooseDataSource(def, "liste", cariler);
    expect(plain.components.some((component) => component.type === "filterBar")).toBe(false);
    expect(list(setSearch(plain, "liste", false)).props.showGridSearch).toBe(false);
  });
  it("cuts catalog labels to the server's kod=Etiket rule", () => {
    const def = chooseDataSource(fresh(), "liste", { ...cariler, columns: [col("a", "x=y".padEnd(90, "z"))] });
    const label = String((list(def).props.columnLabels as string[])[0]);
    expect(label.startsWith("a=xy")).toBe(true);
    expect(label.length).toBe(2 + 60);
  });
});

describe("actions", () => {
  it("actionUsable rejects action whose parameter has no matching column", () => {
    expect(actionUsable({ ...ekstre, parameters: [{ name: "cariId", type: "guid" }] }, ["id", "kod"]))
      .toEqual({ usable: false, reason: actionMissingColumn("cariId") });
    expect(actionUsable(ekstre, ["id"])).toEqual({ usable: true });
    expect(actionUsable({ ...sil, kind: "update" }, ["id"]).usable).toBe(false);
    expect(actionUsableAt({ ...ekstre, target: "page" }, ["id"], "row").usable).toBe(false);
  });
  it("addListAction row binds parameters to seciliSatir and appends to rowActions", () => {
    const def = addListAction(bound(), "liste", ekstre, "row");
    expect(def.queries[1]).toEqual({ id: "ekstre", name: "ekstre", kind: "update", action: "ekstre", runOn: "manual",
      parameters: [{ name: "id", type: "guid", binding: "{{liste.seciliSatir.id}}" }] });
    const button = def.components.find((component) => component.type === "button")!;
    expect(button.props).toMatchObject({ slot: "rowActions", text: "Ekstre al", actionType: "query", queryId: "ekstre", refreshQueries: ["kaynak"] });
    expect(list(def).props.rowActions).toEqual([button.id]);
    expect(placedActions(def, "liste")).toEqual({ above: [], row: ["ekstre"] });
    const removed = removeListAction(def, "liste", "ekstre", "row");
    expect(removed.queries.map((query) => query.id)).toEqual(["kaynak"]);
    expect(list(removed).props.rowActions).toBeUndefined();
  });
  it("addListAction copies confirm text", () => {
    const def = addListAction(bound(), "liste", ekstre, "above");
    const button = def.components.find((component) => component.type === "button")!;
    expect(button.props).toMatchObject({ slot: "actions", confirmEnabled: true, confirmText: "“Ekstre” hazırlansın mı?" });
    expect(list(def).props.rowActions).toBeUndefined();
  });
  it("bulk delete uses bulkDeleteQuery instead of a button", () => {
    const def = addListAction(bound(), "liste", sil, "above");
    expect(def.components.some((component) => component.type === "button")).toBe(false);
    expect(list(def).props.bulkDeleteQuery).toBe("topluSil");
    expect(def.queries[1]).toMatchObject({ kind: "delete", runOn: "manual", parameters: [{ binding: "{{liste.seciliSatir.id}}" }] });
    expect(placedActions(def, "liste").above).toEqual(["topluSil"]);
    expect(list(removeListAction(def, "liste", "topluSil", "above")).props.bulkDeleteQuery).toBeUndefined();
  });
});

describe("setRowDoubleClick", () => {
  it("card creates page button with key column param and sets rowOpenAction", () => {
    const def = setRowDoubleClick(bound(), "liste", "card", cariler);
    const button = def.components.find((component) => component.type === "button")!;
    expect(button.props).toEqual({ slot: "rowActions", text: "Aç", actionType: "page", pageCode: "@customer-create", params: ["id={{liste.seciliSatir.id}}"] });
    expect(list(def).props.rowOpenAction).toBe(button.id);
    expect(list(def).props.rowActions).toBeUndefined();
    expect(rowOpenChoice(def, "liste")).toBe("card");
  });
  it("card unavailable without opens or key", () => {
    const def = bound();
    expect(setRowDoubleClick(def, "liste", "card", { ...cariler, opens: null })).toBe(def);
    expect(setRowDoubleClick(def, "liste", "card", { ...cariler, columns: cariler.columns.map((column) => ({ ...column, key: false })) })).toBe(def);
    // Anahtar kolon adı sayfa parametresi adı olamıyorsa (sunucu: ^[a-z][a-zA-Z0-9]{0,31}$) kart açılamaz.
    expect(setRowDoubleClick(def, "liste", "card", { ...cariler, columns: [col("Cari_Id", "Kimlik", true)] })).toBe(def);
    // Toplu silme seçili satıra bağlanmalıdır.
    expect(actionUsable({ ...sil, parameters: [] }, ["id"]).usable).toBe(false);
  });
  it("panel adds contextPanel in detail slot", () => {
    const def = setRowDoubleClick(setRowDoubleClick(bound(), "liste", "card", cariler), "liste", "panel", cariler);
    const panel = def.components.find((component) => component.type === "contextPanel")!;
    expect(panel.props).toMatchObject({ slot: "detail", table: "liste", title: "Cari hesaplar" });
    expect((panel.props.fields as string[])[1]).toBe("kod=Cari kodu");
    expect(def.components.some((component) => component.type === "button")).toBe(false);
    expect(list(def).props.rowOpenAction).toBeUndefined();
    expect(rowOpenChoice(def, "liste")).toBe("panel");
    const none = setRowDoubleClick(def, "liste", "none", cariler);
    expect(none.components.map((component) => component.id)).toEqual(["liste"]);
  });
});

describe("columns and page size", () => {
  it("setColumns keeps order and overrides labels", () => {
    const def = setColumns(bound(), "liste", ["unvan", "kod"], { unvan: "Ünvan" });
    expect(list(def).props.columns).toEqual(["unvan", "kod"]);
    expect(list(def).props.columnLabels).toContain("unvan=Ünvan");
    expect(list(def).props.columnLabels).toContain("kod=Cari kodu");
  });
  it("setPageSize writes only non-default sizes", () => {
    expect(list(setPageSize(bound(), "liste", 50)).props.pageSize).toBe(50);
    expect(list(setPageSize(setPageSize(bound(), "liste", 50), "liste", 25)).props.pageSize).toBeUndefined();
  });
});

describe("missingCatalogCodes", () => {
  it("lists removed codes", () => {
    const def = addListAction(addListAction(bound(), "liste", ekstre, "row"), "liste", sil, "above");
    const catalog: ActiveCatalog = { version: "2", dataSources: [aranan], actions: [ekstre] };
    expect(missingCatalogCodes(def, catalog)).toEqual(["cariler", "topluSil"]);
    expect(missingCatalogCodes(def, { version: "3", dataSources: [cariler], actions: [ekstre, sil] })).toEqual([]);
  });
});

describe("purity", () => {
  it("functions never mutate input", () => {
    const def = addListAction(bound(), "liste", ekstre, "row");
    const before = JSON.stringify(def);
    chooseDataSource(def, "liste", aranan);
    setColumns(def, "liste", ["kod"], { kod: "Kod" });
    addListAction(def, "liste", sil, "above");
    addListAction(def, "liste", ekstre, "above");
    removeListAction(def, "liste", "ekstre", "row");
    setRowDoubleClick(def, "liste", "card", cariler);
    setRowDoubleClick(def, "liste", "panel", cariler);
    setPageSize(def, "liste", 100);
    setSearch(def, "liste", false);
    withOperationParameters(cariler, undefined, false);
    expect(JSON.stringify(def)).toBe(before);
  });
});

describe("review fixes", () => {
  const wide: CatalogDataSource = { ...cariler, code: "genis", columns: Array.from({ length: 30 }, (_, index) => col(`k${index}`, `Kolon ${index}`, index === 0)) };
  it("I1 writes labels only for chosen columns, at most 20", () => {
    const def = chooseDataSource(fresh(), "liste", wide);
    expect((list(def).props.columnLabels as string[]).length).toBe(6);
    const many = setColumns(def, "liste", wide.columns.map((column) => column.code), Object.fromEntries(wide.columns.map((column) => [column.code, column.label])));
    expect((list(many).props.columns as string[]).length).toBe(20);
    expect((list(many).props.columnLabels as string[]).length).toBe(20);
  });
  it("I3 operation-backed items are unusable until the operation is known", () => {
    const erp = { ...cariler, source: "erpOperation" as const, erpOperation: "cari.listele" };
    expect(dataSourceUsable(withOperationParameters(erp, undefined, false, "loading"), true)).toEqual({ usable: false, reason: OPERATIONS_LOADING });
    expect(dataSourceUsable(withOperationParameters(erp, undefined, false, "failed"), true)).toEqual({ usable: false, reason: OPERATIONS_FAILED });
    const action = withOperationParameters({ ...ekstre, source: "erpOperation" as const, erpOperation: "cari.guncelle" }, undefined, true, "loading");
    expect(actionUsable(action, ["id"])).toEqual({ usable: false, reason: OPERATIONS_LOADING });
    expect(dataSourceUsable(withOperationParameters(cariler, undefined, false, "loading"), true).usable).toBe(true);
  });
  it("I4 removes placed actions whose code left the catalog", () => {
    const def = addListAction(addListAction(bound(), "liste", ekstre, "row"), "liste", sil, "above");
    const cleared = removePlacedAction(removePlacedAction(def, "liste", "ekstre"), "liste", "topluSil");
    expect(cleared.queries.map((query) => query.id)).toEqual(["kaynak"]);
    expect(list(cleared).props.bulkDeleteQuery).toBeUndefined();
    expect(list(cleared).props.rowActions).toBeUndefined();
    expect(cleared.components.some((component) => component.type === "button")).toBe(false);
  });
  it("I5 rebinds open button, detail fields and actions when the source changes", () => {
    const stok: CatalogDataSource = { code: "stoklar", label: "Stoklar", source: "sql", erpOperation: null, parameters: [], opens: "@stock-card",
      columns: [col("stokId", "Stok", true), col("ad", "Ad")] };
    const card = setRowDoubleClick(addListAction(bound(), "liste", ekstre, "row"), "liste", "card", cariler);
    const switched = chooseDataSource(card, "liste", stok);
    const open = switched.components.find((component) => component.id === list(switched).props.rowOpenAction)!;
    expect(open.props).toMatchObject({ pageCode: "@stock-card", params: ["stokId={{liste.seciliSatir.stokId}}"] });
    expect(switched.components.filter((component) => component.type === "button")).toHaveLength(1);
    expect(switched.queries.some((query) => query.action === "ekstre")).toBe(false);
    expect(list(switched).props.rowActions).toBeUndefined();
    expect(chooseDataSource(card, "liste", { ...stok, opens: null }).components.some((component) => component.type === "button")).toBe(false);
    const panel = chooseDataSource(setRowDoubleClick(bound(), "liste", "panel", cariler), "liste", stok);
    expect(panel.components.filter((component) => component.type === "contextPanel").map((component) => component.props.fields)).toEqual([["stokId=Stok", "ad=Ad"]]);
  });
});
