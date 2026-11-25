import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newListTemplateDefinition } from "../pageTemplates";
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
});
