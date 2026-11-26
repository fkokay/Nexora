import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { TemplateInspector } from "./TemplateInspector";

const definition = newListTemplateDefinition() as unknown as ModelDefinition;
const list = { definition, catalog: null, catalogStatus: "ready" as const, operationOf: () => undefined, isTenantAdmin: false, onChange: () => {} };
const render = (component: ModelDefinition["components"][number]) => renderToString(
  <TemplateInspector component={component} legacy={<i>BUGUNKU</i>} list={list} onPlace={() => {}}/>);

describe("TemplateInspector", () => {
  it("opens the List panel for the list table", () => {
    const html = render(definition.components[0]);
    expect(html).toContain("Ne listelensin?");
    expect(html).not.toContain("BUGUNKU");
  });
  it("wraps today's settings in the component panel with a place choice for extra areas", () => {
    const html = render({ id: "not", type: "text", name: "not", props: { slot: "below", text: "x" } });
    expect(html).toContain("BUGUNKU");
    expect(html.indexOf("Bileşen adı")).toBeLessThan(html.indexOf("Yeri"));
    expect(html).toContain("Listenin üstü");
    expect(html).toContain("Listenin altı");
    expect(html).not.toContain("tablist");
  });
  it("shows a fixed place for slotted components", () => {
    expect(render({ id: "g", type: "metric", props: { slot: "indicators" } })).toContain("Yeri: Göstergeler");
  });
  it("opens the record panel for record pages and keeps extra areas on today's path", () => {
    const def = newRecordTemplateDefinition() as unknown as ModelDefinition;
    const record = { def, catalog: null, onChange: () => {}, onSelect: () => {} };
    const page = renderToString(<TemplateInspector component={null} legacy={<i>BUGUNKU</i>} list={null} record={record} onPlace={() => {}}/>);
    expect(page).toContain("Hangi kayıt gösterilsin?");
    const summary = renderToString(<TemplateInspector component={def.components[0]} legacy={<i>BUGUNKU</i>} list={null} record={record} onPlace={() => {}}/>);
    expect(summary).toContain("Hangi kayıt gösterilsin?");
    expect(summary).not.toContain("BUGUNKU");
    const extra = renderToString(<TemplateInspector component={{ id: "ek", type: "text", props: { slot: "above", text: "x" } }} legacy={<i>BUGUNKU</i>}
      list={null} record={{ ...record, def: { ...def, components: [...def.components, { id: "ek", type: "text", props: { slot: "above", text: "x" } }] } }} onPlace={() => {}}/>);
    expect(extra).toContain("BUGUNKU");
    expect(extra).toContain("Kartın üstü");
  });
});
