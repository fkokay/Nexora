import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogDataSource } from "../catalogClient";
import { NEW_FREE_BLOCK_ID, newFreeTemplateDefinition, newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import { addBlock, addItem, addPageAction, addTab, FREE_BLOCK_FULL, MAX_BLOCK_MEMBERS, moveItem, moveItemToBlock, setBlockTitle } from "./freeModel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { freeItemPlace, TemplateInspector, usesTemplateInspector } from "./TemplateInspector";

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
  it("opens the record panel for record pages and keeps extra areas on today's path", () => {
    const def = newRecordTemplateDefinition() as unknown as ModelDefinition;
    const record = { def, catalog: null, onChange: () => {}, onSelect: () => {} };
    const page = renderToString(<TemplateInspector component={null} legacy={<i>BUGUNKU</i>} list={null} record={record} tokens={[]} onPlace={() => {}}/>);
    expect(page).toContain("Hangi kayıt gösterilsin?");
    const summary = renderToString(<TemplateInspector component={def.components[0]} legacy={<i>BUGUNKU</i>} list={null} record={record} tokens={[]} onPlace={() => {}}/>);
    expect(summary).toContain("Hangi kayıt gösterilsin?");
    expect(summary).not.toContain("BUGUNKU");
    const extra = renderToString(<TemplateInspector component={{ id: "ek", type: "text", props: { slot: "above", text: "x" } }} legacy={<i>BUGUNKU</i>}
      list={null} record={{ ...record, def: { ...def, components: [...def.components, { id: "ek", type: "text", props: { slot: "above", text: "x" } }] } }} tokens={[]} onPlace={() => {}}/>);
    expect(extra).toContain("BUGUNKU");
    expect(extra).toContain("Kartın üstü");
  });
});

describe("TemplateInspector on record extra areas (5c Karar 9)", () => {
  const base = () => newRecordTemplateDefinition() as unknown as ModelDefinition;
  const recordDef = (component: ModelComponent) => ({ ...base(), components: [...base().components, component] }) as ModelDefinition;
  const recordTokens = [{ label: "Cari kodu", binding: "kayit.rows[0].kod" }];
  const renderRecord = (component: ModelComponent) => {
    const def = recordDef(component);
    return renderToString(<TemplateInspector component={component} legacy={<i>BUGUNKU</i>} list={{ ...list, definition: def }}
      record={{ def, catalog: null, onChange: () => {}, onSelect: () => {} }} tokens={recordTokens} onPlace={() => {}}/>);
  };

  it("record above text opens TextPanel with record tokens", () => {
    const html = renderRecord({ id: "ek", type: "heading", name: "ek", props: { slot: "above", text: "Cari {{kayit.rows[0].kod}}" } });
    expect(html).not.toContain("BUGUNKU");
    expect(html).toContain("Paragraf");
    expect(html).toContain("Cari {Cari kodu}");
    expect(html).toContain("Kartın üstü");
    expect(html).toContain("Kartın altı");
    expect(html).not.toContain("Listenin üstü");
    expect(html.indexOf("Bileşen adı")).toBeLessThan(html.indexOf("Yeri"));
  });
  it("record extra areas open info box, image and indicator panels", () => {
    expect(renderRecord({ id: "b", type: "alert", props: { slot: "below", variant: "info", title: "Bilgi", text: "" } })).toContain("Kullanıcı kapatabilsin");
    expect(renderRecord({ id: "r", type: "image", props: { slot: "below", value: "" } })).toContain("Görsel nereden?");
    const metric = renderRecord({ id: "g", type: "metric", props: { slot: "above", title: "Gösterge" } });
    expect(metric).not.toContain("BUGUNKU");
    expect(metric).toContain("Kartın üstü");
    expect(metric).not.toContain("Listenin üstü");
    expect(metric).not.toContain("Göstergeler</button>");
  });
  it("record parts still open RecordPanel", () => {
    const def = base();
    const html = renderToString(<TemplateInspector component={def.components[0]} legacy={<i>BUGUNKU</i>} list={{ ...list, definition: def }}
      record={{ def, catalog: null, onChange: () => {}, onSelect: () => {} }} tokens={[]} onPlace={() => {}}/>);
    expect(html).toContain("Hangi kayıt gösterilsin?");
    expect(html).not.toContain("BUGUNKU");
  });
  it("record buttons in extra areas keep today's panel", () => {
    expect(renderRecord({ id: "d", type: "button", props: { slot: "below", text: "x" } })).toContain("BUGUNKU");
  });
});

describe("TemplateInspector on free pages (5c Task 8)", () => {
  const column = (code: string, label: string) => ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null });
  const siparisler = { code: "siparisler", label: "Son siparişler", source: "sql", erpOperation: null, parameters: [], opens: null,
    columns: [column("no", "Sipariş no"), column("tutar", "Tutar")] } as CatalogDataSource;
  const yenile = { code: "yenile", label: "Raporu yenile", kind: "update", target: "page", source: "sql", erpOperation: null, parameters: [], confirmText: null } as CatalogAction;
  const catalog: ActiveCatalog = { version: "1", dataSources: [siparisler], actions: [yenile] };
  const ok = <T extends object>(result: T | { reason: string }): T => { if ("reason" in result) throw new Error(result.reason); return result; };
  const build = () => {
    let def = newFreeTemplateDefinition() as unknown as ModelDefinition;
    const second = ok(addBlock(def, NEW_FREE_BLOCK_ID)); def = setBlockTitle(second.def, second.blockId, "Özet");
    const text = ok(addItem(def, "text", { blockId: NEW_FREE_BLOCK_ID })); def = text.def;
    const info = ok(addItem(def, "infoBox", { blockId: NEW_FREE_BLOCK_ID })); def = info.def;
    const indicator = ok(addItem(def, "indicator", { blockId: second.blockId })); def = indicator.def;
    const image = ok(addItem(def, "image", { blockId: second.blockId })); def = image.def;
    const table = ok(addItem(def, "table", { blockId: second.blockId })); def = table.def;
    def = addPageAction(def, yenile);
    return { def, ids: { block: second.blockId, text: text.itemId, info: info.itemId, indicator: indicator.itemId, image: image.itemId, table: table.itemId } };
  };
  const renderFree = (def: ModelDefinition, id: string | null) => {
    const component = id ? def.components.find((item) => item.id === id) ?? null : null;
    return renderToString(<TemplateInspector component={component} legacy={<i>BUGUNKU</i>} list={{ ...list, definition: def, catalog }}
      free={{ def, catalog, catalogStatus: "ready", name: "Satış panosu", onRename: () => {}, onChange: () => {}, onSelect: () => {} }} tokens={[]} onPlace={() => {}}/>);
  };
  const membersOf = (def: ModelDefinition, id: string) => def.components.find((item) => item.id === id)!.props.members as string[];

  it("free inspector picks panel by selection", () => {
    const { def, ids } = build();
    const page = renderFree(def, null);
    expect(page).toContain("Serbest gövde · 3. basamak");
    expect(page).toContain("Raporu yenile");
    expect(renderFree(def, ids.block)).toContain("Kolon sayısı");
    expect(renderFree(def, NEW_FREE_BLOCK_ID)).toContain("Bölümü sil");
    const button = def.components.find((item) => item.props.slot === "actions")!;
    expect(renderFree(def, button.id)).toContain("Serbest gövde · 3. basamak");
    expect(renderFree(def, ids.text)).toContain("Paragraf");
    expect(renderFree(def, ids.info)).toContain("Kullanıcı kapatabilsin");
    expect(renderFree(def, ids.image)).toContain("Görsel nereden?");
    const indicator = renderFree(def, ids.indicator);
    expect(indicator).toContain("İlerleme");
    expect(indicator).not.toContain('aria-label="Yeri"');
    expect(indicator).not.toContain("listenin");
    const table = renderFree(def, ids.table);
    expect(table).toContain("Ne listelensin?");
    expect(table).toContain("Son siparişler");
    for (const id of Object.values(ids)) expect(renderFree(def, id), id).not.toContain("BUGUNKU");
    // Öteki bileşenler bugünkü ayarlarla, ama Bölüm seçimiyle açılır.
    const other: ModelComponent = { id: "kart", type: "card", props: { slot: "item", variant: "panel", title: "x" } };
    const withOther = { ...def, components: [...def.components.map((item) => item.id === NEW_FREE_BLOCK_ID
      ? { ...item, props: { ...item.props, members: [...membersOf(def, NEW_FREE_BLOCK_ID), "kart"] } } : item), other] };
    const legacyHtml = renderFree(withOther, "kart");
    expect(legacyHtml).toContain("BUGUNKU");
    expect(legacyHtml).toContain('aria-label="Bölüm"');
  });

  it("item panel shows block choice and moves item", () => {
    const { def, ids } = build();
    const html = renderFree(def, ids.text);
    expect(html.indexOf("Bileşen adı")).toBeLessThan(html.indexOf('aria-label="Bölüm"'));
    expect(html.indexOf('aria-label="Bölüm"')).toBeLessThan(html.indexOf("Paragraf"));
    expect(html).toContain("Bölüm 1");
    expect(html).toContain("Özet");
    expect(html).toContain("Yukarı");
    expect(html).toContain("Aşağı");
    expect(html).toContain("Kaldır");
    expect(html.replace(/<[^>]*>/g, " ")).not.toContain(ids.block);

    const place = freeItemPlace(def, ids.text)!;
    expect(place.blockId).toBe(NEW_FREE_BLOCK_ID);
    expect(place.canUp).toBe(false);
    expect(place.canDown).toBe(true);
    expect(place.options.map((option) => option.label)).toEqual(["Bölüm 1", "Özet"]);
    const moved = ok(moveItemToBlock(def, ids.text, ids.block)).def;
    expect(freeItemPlace(moved, ids.text)!.blockId).toBe(ids.block);
    expect(freeItemPlace(moveItem(def, ids.text, 1), ids.text)!.canUp).toBe(true);

    // Sekme varken seçenek sekme adını da söyler.
    const tabbed = ok(addTab(def, "Ayrıntı")).def;
    expect(freeItemPlace(tabbed, ids.text)!.options[0].label).toBe("Bölüm 1 · Genel");

    // Dolu bölüm seçilemez, nedeni görünür.
    let full = def;
    while (membersOf(full, ids.block).length < MAX_BLOCK_MEMBERS) full = ok(addItem(full, "text", { blockId: ids.block })).def;
    expect(freeItemPlace(full, ids.text)!.options.find((option) => option.blockId === ids.block)!.reason).toBe(FREE_BLOCK_FULL);
    expect(renderFree(full, ids.text)).toContain(FREE_BLOCK_FULL);
  });

  it("legacy, list and record pages keep their panels", () => {
    expect(render(definition.components[0])).toContain("Ne listelensin?");
    const below = renderIn({ id: "m", type: "heading", props: { slot: "below", text: "x" } });
    expect(below).toContain("Listenin altı");
    expect(below).not.toContain('aria-label="Bölüm"');
    const def = newRecordTemplateDefinition() as unknown as ModelDefinition;
    const record = { def, catalog: null, onChange: () => {}, onSelect: () => {} };
    expect(renderToString(<TemplateInspector component={null} legacy={null} list={null} record={record} tokens={[]} onPlace={() => {}}/>)).toContain("Hangi kayıt gösterilsin?");
    expect(usesTemplateInspector({ schemaVersion: 2, queries: [], components: [{ id: "m", type: "heading", props: {} }] } as ModelDefinition, "m")).toBe(false);
  });
});
