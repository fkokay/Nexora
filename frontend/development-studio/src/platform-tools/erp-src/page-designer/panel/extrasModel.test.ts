import { describe, expect, it } from "vitest";
import {
  addGridColumn, addWindowCustomFields, addWindowGrid, bindToSave, customFieldsOf, gridColumnsOf, parseGridColumn, saveBinding, setGridColumns, setWindowGridProps,
} from "./extrasModel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { addCustomFields } from "./recordModel";
import { recordSelectionOf } from "./templateGuards";

const c = (id: string, type: string, props: ModelComponent["props"] = {}): ModelComponent => ({ id, type, name: id, props });
const listDef = (): ModelDefinition => ({
  schemaVersion: 2, template: { name: "list" },
  queries: [
    { id: "ekle", name: "ekle", kind: "insert", operation: "stok.hareket.ekle", runOn: "manual", parameters: [{ name: "tracking", binding: "{{x.satirlar}}", type: "list" }, { name: "values", binding: "{{y.degerler}}", type: "map" }] },
    { id: "ozelTanimlar", name: "ozelTanimlar", kind: "read", operation: "cari.ozelAlanTanimlari", runOn: "load", parameters: [] },
  ],
  components: [c("liste", "dataTable", { slot: "list", query: "ozelTanimlar" }), c("pencere", "dialog", { slot: "dialogs", contains: ["m"], saveQuery: "ekle" }), c("m", "text", { slot: "dialog", text: "x" })],
});
const recordDef = (): ModelDefinition => ({
  schemaVersion: 2, template: { name: "record" }, queries: [],
  components: [c("kart", "recordHeader", { slot: "summary" }), c("sekmeler", "tabs", { slot: "tabs", tabs: ["Genel=b1"] }), c("b1", "formCard", { slot: "section", inputs: [] })],
});

describe("extrasModel", () => {
  it("adds one window block and one window grid in the dialog slot, owned by the window", () => {
    const withBlock = addWindowCustomFields(listDef(), "pencere");
    expect(withBlock.blockId).toBe("ozelAlanlar");
    expect(withBlock.def.components.find((item) => item.id === "pencere")!.props.contains).toEqual(["m", "ozelAlanlar"]);
    expect(customFieldsOf(withBlock.def, "pencere")?.props.slot).toBe("dialog");
    expect(addWindowCustomFields(withBlock.def, "pencere").blockId).toBe("");
    const withGrid = addWindowGrid(withBlock.def, "pencere");
    expect(withGrid.def.components.find((item) => item.id === withGrid.gridId)!.props).toMatchObject({ gridMode: "list", maxRows: 200, slot: "dialog" });
    expect(addWindowGrid(withGrid.def, "pencere").gridId).toBe("");
  });

  it("adds the record block into exactly one tab and selects it as customFields", () => {
    const added = addCustomFields(recordDef(), 0);
    expect(added.blockId).toBe("ozelAlanlar");
    expect(added.def.components.find((item) => item.id === "sekmeler")!.props.tabs).toEqual(["Genel=b1,ozelAlanlar"]);
    expect(recordSelectionOf(added.def, added.blockId)).toEqual({ kind: "customFields", id: "ozelAlanlar" });
    expect(addCustomFields(added.def, 0).blockId).toBe("");
  });

  it("binds the save step: finds the map / list parameter and rewrites its binding", () => {
    const { def } = addWindowCustomFields(listDef(), "pencere");
    expect(saveBinding(def, "pencere", "ozelAlanlar", "degerler").bound).toBe(false);
    const bound = bindToSave(def, "pencere", "ozelAlanlar", "degerler");
    expect(saveBinding(bound, "pencere", "ozelAlanlar", "degerler").bound).toBe(true);
    const grid = addWindowGrid(def, "pencere");
    const boundGrid = bindToSave(grid.def, "pencere", grid.gridId, "satirlar");
    expect(boundGrid.queries[0].parameters.find((parameter) => parameter.type === "list")!.binding).toBe("{{satirlar.satirlar}}");
  });

  it("adds a missing step to the window's save sequence", () => {
    const base = listDef();
    base.queries.push({ id: "ozelKaydet", name: "ozelKaydet", kind: "update", operation: "cari.ozelAlanKaydet", runOn: "manual", parameters: [{ name: "values", binding: "{{eski.degerler}}", type: "map" }] });
    base.queries[0] = { ...base.queries[0], parameters: [base.queries[0].parameters[0]] };
    const { def } = addWindowCustomFields(base, "pencere");
    const bound = bindToSave(def, "pencere", "ozelAlanlar", "degerler");
    const dialog = bound.components.find((item) => item.id === "pencere")!;
    expect(dialog.props.saveSequence).toEqual(["ekle", "ozelKaydet"]);
    expect(dialog.props.saveQuery).toBeUndefined();
  });

  it("grid settings: columns round-trip, limits and minRows <= maxRows", () => {
    const { def, gridId } = addWindowGrid(listDef(), "pencere");
    expect(parseGridColumn("a|Kod|text|required,unique,maxLength:80")).toEqual({ code: "a", label: "Kod", type: "text", required: true, unique: true, maxLength: 80 });
    expect(parseGridColumn("a|Kod|lookup:q:v:l")).toBeNull();
    const more = addGridColumn(def, gridId);
    expect(gridColumnsOf(more.components.find((item) => item.id === gridId)!).map((column) => column.code)).toEqual(["kod", "sutun2"]);
    expect(setGridColumns(def, gridId, [])).toBe(def);
    const limited = setWindowGridProps(setWindowGridProps(def, gridId, { minRows: 5 }), gridId, { maxRows: 999 });
    const props = limited.components.find((item) => item.id === gridId)!.props;
    expect(props.maxRows).toBe(200);
    const clamped = setWindowGridProps(setWindowGridProps(def, gridId, { minRows: 50 }), gridId, { maxRows: 10 });
    expect(clamped.components.find((item) => item.id === gridId)!.props).toMatchObject({ maxRows: 10, minRows: 10 });
  });
});
