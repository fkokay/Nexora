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
    columns: [{ code: "id", label: "Kimlik", type: "guid", key: true, longText: false, required: false, maxLength: null }, { code: "unvan", label: "Unvan", type: "text", key: false, longText: false, required: false, maxLength: null }] }],
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
    const at = ["Hangi eylemler?", "Ekstre al", "Eylemleri yazılımcı hazırlar", "Ana buton", "Nerede?", BUTTONS_WHERE_NOTE].map((t) => html.indexOf(t));
    at.forEach((n, i) => expect(n, String(i)).toBeGreaterThanOrEqual(0));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain("Bu eylemin yok bilgisi listede yok.");
    expect(html).not.toContain(`<option value="${buttons(withSil)[1].id}"`);
    for (const word of ["{{", "queryId", "dataTable"]) expect(html).not.toContain(word);
  });
  it("renders the developer note exactly once without a doubled prefix, and the where mockup line", () => {
    const html = renderToString(<ButtonsPanel definition={withSil} component={buttons(withSil)[0]} listId="liste" catalog={catalog} onChange={() => {}}/>);
    expect(html).toContain('<div class="cpanel-dev">Eylemleri yazılımcı hazırlar · onay sorusu ve yetki ondan gelir</div>');
    expect(html).not.toContain("Yazılımcının hazırladığı ·");
    expect(html).toContain("Bu panel, sayfanın üstündeki bir düğmeye tıklayınca açılır ve o sıradaki bütün düğmeleri gösterir.");
  });
  it("hides Ana buton for rowActions", () => {
    const row = addListAction(bound, "liste", catalog.actions[0], "row");
    const html = renderToString(<ButtonsPanel definition={row} component={buttons(row)[0]} listId="liste" catalog={catalog} onChange={() => {}}/>);
    expect(html).not.toContain("Ana buton");
    expect(html).toContain("Nerede?");
  });
});

describe("ButtonsPanel final review fixes 4 and 5", () => {
  it("uses a slot-specific where note", () => {
    const row = addListAction(bound, "liste", catalog.actions[0], "row");
    const html = renderToString(<ButtonsPanel definition={row} component={buttons(row)[0]} listId="liste" catalog={catalog} onChange={() => {}}/>);
    expect(html).toContain("Bu panel, satırın sonundaki bir düğmeye tıklayınca açılır ve o sıradaki bütün düğmeleri gösterir.");
    expect(html).not.toContain("sayfanın üstündeki");
  });
  it("falls back to Adsız düğme instead of the button id", () => {
    const nameless = { ...withEkstre, components: withEkstre.components.map((c) => c.type === "button" ? { ...c, props: { ...c.props, text: " " } } : c) };
    const button = buttons(nameless)[0];
    const html = renderToString(<ButtonsPanel definition={nameless} component={button} listId="liste" catalog={catalog} onChange={() => {}}/>);
    expect(html).toContain(">Adsız düğme</option>");
    expect(html).not.toContain(`>${button.id}</option>`);
  });
});
