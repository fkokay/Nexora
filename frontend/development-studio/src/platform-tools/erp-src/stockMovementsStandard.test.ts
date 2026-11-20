import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import standardJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock-movements.json?raw";

// Stok Hareketleri iki adımlı standardı (src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock-movements.json): tasarımcıda
// tanınmayan tür/özellik olmadan açılmalı ve uzlaştırmadan özellik kaybetmeden geçmelidir.
const standard = JSON.parse(standardJson);
type Component = { id: string; type: string; props: Record<string, unknown> };
const { reconcileDefinition, managedKeys, contentFields, palette, MAIN_TAB_LABEL } = designerInternals;
const reconcile = (components: Component[], queryEditable = false) => reconcileDefinition(
  { schemaVersion: 2, queries: standard.definition.queries, components: structuredClone(components) } as never, { catalog: { status: "loading" }, queryEditable });
const byIdOf = (definition: { components: unknown[] }) => new Map((definition.components as Component[]).map((component) => [component.id, component]));

describe("Stok Hareketleri standardı tasarımcıda", () => {
  const components = standard.definition.components as Component[];
  it("bütün türler ve özellikler tasarımcıda tanınır (ham metin alanı yok)", () => {
    for (const component of components) {
      expect(contentFields, component.type).toHaveProperty(component.type);
      expect(palette.some((item) => item.type === component.type), component.type).toBe(true);
      for (const key of Object.keys(component.props)) expect(managedKeys.has(key), `${component.id}.${key}`).toBe(true);
    }
    expect(MAIN_TAB_LABEL.steps).toBe("Adımlar");
    expect(MAIN_TAB_LABEL.recordHeader).toBe("Kayıt özeti");
  });
  for (const queryEditable of [false, true]) it(`uzlaştırma özellik silmez ve değiştirmez (sorgu düzenleme: ${queryEditable})`, () => {
    const reconciled = reconcile(components, queryEditable);
    const after = byIdOf(reconciled);
    for (const component of components) {
      const next = after.get(component.id);
      expect(next, component.id).toBeDefined();
      for (const [key, value] of Object.entries(component.props)) expect(next!.props[key], `${component.id}.${key}`).toEqual(value);
    }
    expect(reconciled.queries).toEqual(standard.definition.queries);
  });
  it("satır işlemi, satır açılınca ve özet düğmeleri sahipli kalır; atama silinen girişte kalkar", () => {
    const byId = byIdOf(reconcile(components.filter((component) => component.id !== "stokSecimi")));
    expect(byId.get("hareketleriGor")!.props.assignments).toEqual([]);
    expect(byId.get("stoklar")!.props.rowActions).toEqual(["hareketleriGor"]);
    expect(byId.get("stoklar")!.props.rowOpenAction).toBe("hareketleriGor");
    expect(byId.get("secilenStok")!.props.buttons).toEqual(["stokDegistir"]);
  });
  it("atamalar yalnız setInput düğmesinde kalır; iş akışı düğmesi özet düğmesi olamaz; satır açma düğmesi uygun türde olmalı", () => {
    const converted = components.map((component) => component.id === "stokDegistir" ? { ...component, props: { ...component.props, actionType: "query" } }
      : component.id === "hareketleriGor" ? { ...component, props: { ...component.props, actionType: "sequence" } } : component);
    const byId = byIdOf(reconcile(converted));
    expect(byId.get("stokDegistir")!.props.assignments).toBeUndefined();
    expect(byId.get("secilenStok")!.props.buttons).toEqual(["stokDegistir"]);
    // Kayıt dizisi satır işlemi olabilir ama satır açılınca düğmesi olamaz.
    expect(byId.get("stoklar")!.props.rowActions).toEqual(["hareketleriGor"]);
    expect(byId.get("stoklar")!.props.rowOpenAction).toBeUndefined();
    const workflow = components.map((component) => component.id === "stokDegistir" ? { ...component, props: { text: "Akış", actionType: "workflow" } } : component);
    expect(byIdOf(reconcile(workflow)).get("secilenStok")!.props.buttons).toBeUndefined();
  });
});
