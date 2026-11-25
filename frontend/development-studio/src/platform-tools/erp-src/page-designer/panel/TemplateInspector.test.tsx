import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newListTemplateDefinition } from "../pageTemplates";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { TemplateInspector, usesTemplateInspector } from "./TemplateInspector";

const definition = newListTemplateDefinition() as unknown as ModelDefinition;
const list = { definition, catalog: null, catalogStatus: "ready" as const, operationOf: () => undefined, isTenantAdmin: false, onChange: () => {} };
const render = (component: ModelComponent, def: ModelDefinition = definition) => renderToString(
  <TemplateInspector component={component} legacy={<i>BUGUNKU</i>} list={{ ...list, definition: def }} tokens={[]} onPlace={() => {}}/>);
const withComponent = (component: ModelComponent) => ({ ...definition, components: [...definition.components, component] }) as ModelDefinition;
const renderIn = (component: ModelComponent) => render(component, withComponent(component));

describe("TemplateInspector", () => {
  it("opens the List panel for the list table", () => {
    const html = render(definition.components[0]);
    expect(html).toContain("Ne listelensin?");
    expect(html).not.toContain("BUGUNKU");
  });

  it("TemplateInspector picks panel by consultant kind", () => {
    const text = renderIn({ id: "m", type: "heading", name: "m", props: { slot: "below", text: "Başlık" } });
    expect(text).not.toContain("BUGUNKU");
    expect(text).toContain("Paragraf");
    // Ek alanda "Yeri" Ad bölümünün altında, panelin ilk bölümünün üstündedir.
    expect(text.indexOf("Bileşen adı")).toBeLessThan(text.indexOf("Yeri"));
    expect(text.indexOf("Yeri")).toBeLessThan(text.indexOf("Paragraf"));
    expect(text).toContain("Listenin üstü");
    expect(text).toContain("Listenin altı");

    for (const type of ["text", "label", "section"]) expect(renderIn({ id: "t", type, props: { slot: "above", text: "x" } })).toContain("Küçük etiket");

    const info = renderIn({ id: "b", type: "alert", props: { slot: "above", variant: "info", title: "Bilgi", text: "" } });
    expect(info).not.toContain("BUGUNKU");
    expect(info).toContain("Kullanıcı kapatabilsin");
    expect(info.indexOf("Bileşen adı")).toBeLessThan(info.indexOf("Yeri"));
    expect(renderIn({ id: "l", type: "list", props: { slot: "below", items: ["a"] } })).toContain("Kullanıcı kapatabilsin");
    expect(renderIn({ id: "c", type: "card", props: { slot: "below", title: "x" } })).toContain("Kullanıcı kapatabilsin");

    const metric = renderIn({ id: "g", type: "metric", props: { slot: "indicators", title: "Gösterge" } });
    expect(metric).not.toContain("BUGUNKU");
    expect(metric).toContain("İlerleme");
    expect(metric.match(/aria-label="Yeri"/g)).toHaveLength(1);
    const progress = renderIn({ id: "p", type: "progress", props: { slot: "below", value: "10" } });
    expect(progress).toContain("İlerleme göstergeler sırasına konamaz");
    expect(progress.match(/aria-label="Yeri"/g)).toHaveLength(1);

    const image = renderIn({ id: "r", type: "image", props: { slot: "below", title: "", value: "", height: 160 } });
    expect(image).not.toContain("BUGUNKU");
    expect(image).toContain("Görsel nereden?");
    expect(image.indexOf("Bileşen adı")).toBeLessThan(image.indexOf("Yeri"));

    for (const slot of ["actions", "rowActions"]) {
      const buttons = renderIn({ id: "d", type: "button", props: { slot, text: "Ekstre" } });
      expect(buttons, slot).not.toContain("BUGUNKU");
      expect(buttons, slot).toContain("Hangi eylemler?");
    }
  });

  it("keeps the component name read-only in every consultant panel", () => {
    const cases: ModelComponent[] = [
      { id: "m", type: "heading", name: "metin", props: { slot: "below", text: "x" } },
      { id: "b", type: "alert", name: "bilgi", props: { slot: "above", variant: "info", title: "Bilgi", text: "" } },
      { id: "g", type: "metric", name: "gosterge", props: { slot: "indicators", title: "Gösterge" } },
      { id: "r", type: "image", name: "resim", props: { slot: "below", title: "", value: "", height: 160 } },
    ];
    for (const component of cases) {
      const html = renderIn(component);
      expect(html, component.id).not.toContain("BUGUNKU");
      expect(html, component.id).toMatch(/<input aria-label="Bileşen adı"[^>]*readOnly=""/);
    }
  });

  it("puts the indicator place choice under the name", () => {
    const html = renderIn({ id: "g", type: "metric", props: { slot: "indicators", title: "Gösterge" } });
    expect(html.indexOf("Bileşen adı")).toBeLessThan(html.indexOf("Yeri"));
    expect(html.indexOf("Yeri")).toBeLessThan(html.indexOf("Ne gösterilsin?"));
  });

  it("keeps today's settings for components the new panels do not open", () => {
    const legacyCases: ModelComponent[] = [
      { id: "d", type: "button", props: { slot: "below", text: "x" } },
      { id: "k", type: "card", props: { slot: "below", variant: "panel", title: "x" } },
      { id: "k2", type: "card", props: { slot: "below", title: "x" }, children: [{ id: "i", type: "text", props: { text: "y" } }] },
      { id: "v", type: "divider", props: { slot: "below" } },
    ];
    for (const component of legacyCases) {
      const html = renderIn(component);
      expect(html, component.id).toContain("BUGUNKU");
      expect(html, component.id).not.toContain("tablist");
    }
    const divider = renderIn(legacyCases[3]);
    expect(divider.indexOf("Bileşen adı")).toBeLessThan(divider.indexOf("Yeri"));
    expect(divider).toContain("Listenin altı");
    expect(render({ id: "s", type: "filterBar", props: { slot: "filters" } })).toContain("Yeri: Süzgeç alanı");
  });

  it("pageTitle heading falls back to legacy panel", () => {
    const html = renderIn({ id: "h", type: "heading", props: { slot: "above", text: "Cariler", pageTitle: true } });
    expect(html).toContain("BUGUNKU");
    expect(html).not.toContain("Paragraf");
  });

  it("buttons without a template list fall back to legacy panel", () => {
    const button: ModelComponent = { id: "d", type: "button", props: { slot: "actions", text: "x" } };
    const html = render(button, { ...definition, components: [button] } as ModelDefinition);
    expect(html).toContain("BUGUNKU");
  });

  it("legacy page shows old inspector", () => {
    const legacy: ModelDefinition = { schemaVersion: 2, queries: [], components: [
      { id: "m", type: "heading", props: { text: "Başlık" } },
      { id: "k", type: "card", props: {}, children: [{ id: "i", type: "text", props: { text: "y" } }] },
    ] };
    for (const id of ["m", "k", "i"]) expect(usesTemplateInspector(legacy, id), id).toBe(false);
    const templated = withComponent({ id: "m", type: "heading", props: { slot: "below", text: "x" } });
    expect(usesTemplateInspector(templated, "m")).toBe(true);
    expect(usesTemplateInspector(templated, definition.components[0].id)).toBe(true);
    expect(usesTemplateInspector(templated, "yok")).toBe(false);
  });
});
