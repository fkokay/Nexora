import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveCatalog } from "../catalogClient";
import { newListTemplateDefinition } from "../pageTemplates";
import { ButtonsPanel } from "./ButtonsPanel";
import { BUTTONS_WHERE_NOTE, toggleButtonAction } from "./buttonsPanelModel";
import { addListAction, chooseDataSource, removeListAction, type ModelDefinition } from "./listPanelModel";

const catalog: ActiveCatalog = {
  version: "1",
  dataSources: [{ code: "cariler", label: "Cari hesaplar", source: "sql", erpOperation: null, parameters: [], opens: null,
    columns: [{ code: "id", label: "Kimlik", type: "guid", key: true }, { code: "unvan", label: "Unvan", type: "text", key: false }] }],
  actions: [
    { code: "ekstre", label: "Ekstre al", kind: "update", target: "row", source: "sql", erpOperation: null, parameters: [{ name: "id", type: "guid" }], confirmText: null },
    { code: "sil", label: "Sil", kind: "delete", target: "row", source: "sql", erpOperation: null, parameters: [{ name: "id", type: "guid" }], confirmText: "Silinsin mi?" },
    { code: "eksik", label: "Eksik kolonlu", kind: "update", target: "row", source: "sql", erpOperation: null, parameters: [{ name: "yok", type: "text" }], confirmText: null },
  ],
};
const bound = chooseDataSource(newListTemplateDefinition() as unknown as ModelDefinition, "liste", catalog.dataSources[0]);
const columns = ["id", "unvan"];
const withEkstre = addListAction(bound, "liste", catalog.actions[0], "above");
const withSil = addListAction(withEkstre, "liste", catalog.actions[1], "above");
const buttons = (d: ModelDefinition) => d.components.filter((c) => c.type === "button");

describe("ButtonsPanel", () => {
  it("adds and removes via list actions with same rules", () => {
    const [ekstre, , eksik] = catalog.actions;
    expect(toggleButtonAction(bound, "liste", ekstre, columns, "above")).toEqual(addListAction(bound, "liste", ekstre, "above"));
    expect(toggleButtonAction(bound, "liste", ekstre, columns, "row")).toEqual(addListAction(bound, "liste", ekstre, "row"));
    expect(toggleButtonAction(withEkstre, "liste", ekstre, columns, "above")).toEqual(removeListAction(withEkstre, "liste", "ekstre", "above"));
    expect(toggleButtonAction(bound, "liste", eksik, columns, "above")).toEqual(addListAction(bound, "liste", eksik, "above"));
  });
  it("renders in mockup order with reasons, dev note and primary only for actions", () => {
    const html = renderToString(<ButtonsPanel definition={withSil} component={buttons(withSil)[0]} listId="liste" catalog={catalog} onChange={() => {}}/>);
    const at = ["Hangi eylemler?", "Ekstre al", "Yazılımcının hazırladığı", "onay sorusu ve yetki ondan gelir", "Ana buton", "Nerede?", BUTTONS_WHERE_NOTE].map((t) => html.indexOf(t));
    at.forEach((n, i) => expect(n, String(i)).toBeGreaterThanOrEqual(0));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain("Bu eylemin yok bilgisi listede yok.");
    expect(html).not.toContain(`<option value="${buttons(withSil)[1].id}"`);
    for (const word of ["{{", "queryId", "dataTable"]) expect(html).not.toContain(word);
  });
  it("hides Ana buton for rowActions", () => {
    const row = addListAction(bound, "liste", catalog.actions[0], "row");
    const html = renderToString(<ButtonsPanel definition={row} component={buttons(row)[0]} listId="liste" catalog={catalog} onChange={() => {}}/>);
    expect(html).not.toContain("Ana buton");
    expect(html).toContain("Nerede?");
  });
});
