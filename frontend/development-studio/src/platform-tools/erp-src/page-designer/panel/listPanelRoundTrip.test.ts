import { describe, expect, it } from "vitest";
import type { CatalogAction, CatalogDataSource } from "../catalogClient";
import { filterBarProblem } from "../filterBarSettings";
import { newListTemplateDefinition } from "../pageTemplates";
import { definitionNeedsAdmin } from "../queryPageLock";
import { addListAction, chooseDataSource, setPageSize, setRowDoubleClick, type ModelDefinition } from "./listPanelModel";

const col = (code: string, label: string, key = false) => ({ code, label, type: "text", key, longText: false, required: false, maxLength: null });
const aranan: CatalogDataSource = {
  code: "cariler", label: "Cari hesaplar", source: "sql", erpOperation: null, parameters: [{ name: "q", type: "text" }], opens: "@customer-create",
  columns: [col("id", "Kimlik", true), col("kod", "Cari kodu"), col("unvan", "Unvan")],
};
const ekstre: CatalogAction = { code: "ekstre", label: "Ekstre al", kind: "update", target: "row", source: "sql", erpOperation: null, parameters: [{ name: "id", type: "guid" }], confirmText: "Emin misiniz?" };
const sil: CatalogAction = { ...ekstre, code: "topluSil", label: "Sil", kind: "delete", target: "bulk", confirmText: null };

const built = () => {
  let def = chooseDataSource(newListTemplateDefinition() as unknown as ModelDefinition, "liste", aranan);
  def = addListAction(def, "liste", ekstre, "row");
  def = addListAction(def, "liste", sil, "above");
  def = setRowDoubleClick(def, "liste", "card", aranan);
  return setPageSize(def, "liste", 50);
};

// Tasarımcı modülü büyük: soğuk dinamik içe aktarma yüklü makinede 5 sn sınırını aşabilir.
describe("List panel output through the designer", { timeout: 30_000 }, () => {
  it("survives reconcile for admins and non-admins and wires catalog keys only", async () => {
    const { designerInternals, designerPersistence } = await import("../../CustomPagesPage");
    const def = built();
    type Def = Parameters<typeof designerInternals.reconcileDefinition>[0];
    for (const queryEditable of [false, true]) {
      const reconciled = designerInternals.reconcileDefinition(def as unknown as Def, { catalog: { status: "ready", operations: [] }, previous: def as unknown as Def, queryEditable });
      expect(reconciled).toEqual(def);
    }
    const wired = designerPersistence.wireDefinition(def as unknown as Def, { status: "ready", operations: [] });
    expect(wired.queries.map((query) => Object.keys(query).sort())).toEqual([
      ["dataSource", "id", "kind", "name", "parameters", "runOn"], ["action", "id", "kind", "name", "parameters", "runOn"], ["action", "id", "kind", "name", "parameters", "runOn"]]);
    const bar = def.components.find((component) => component.type === "filterBar")!;
    expect(filterBarProblem(bar.props, "Süzgeç", true)).toBeNull();
    expect(def.components.every((component) => typeof component.props.slot === "string")).toBe(true);
    // Karar 1: katalog başvurulu sayfa yönetici olmayanı kilitlemez.
    expect(definitionNeedsAdmin(JSON.stringify(wired), () => undefined)).toBe(false);
  });
});
