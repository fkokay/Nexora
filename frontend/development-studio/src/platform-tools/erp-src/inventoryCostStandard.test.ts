import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import standardJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-cost.json?raw";

// Stok Değerleme standardı (src/Hosts/AIERP.Api/SystemPages/Standards/inventory-cost.json, taslak 18): xl pencere, kayıt özeti,
// pencere içinde sekmeler ve bölüm çocukları tasarımcıda tanınmalı ve uzlaştırmadan özellik kaybetmeden geçmelidir.
const standard = JSON.parse(standardJson);
type Component = { id: string; type: string; props: Record<string, unknown>; children?: Component[] };
const { reconcileDefinition, managedKeys, contentFields, palette } = designerInternals;
const components = standard.definition.components as Component[];
const flatten = (list: Component[]): Component[] => list.flatMap((component) => [component, ...flatten(component.children ?? [])]);
const reconcile = (queryEditable: boolean) => reconcileDefinition(
  { schemaVersion: 2, queries: standard.definition.queries, components: structuredClone(components) } as never, { catalog: { status: "loading" }, queryEditable });

describe("Stok Değerleme standardı tasarımcıda", () => {
  it("bütün türler ve özellikler (bölüm çocukları dahil) tasarımcıda tanınır", () => {
    const all = flatten(components);
    expect(all.some((component) => component.type === "recordHeader")).toBe(true);
    expect(all.some((component) => component.type === "tabs")).toBe(true);
    for (const component of all) {
      expect(contentFields, component.type).toHaveProperty(component.type);
      expect(palette.some((item) => item.type === component.type), component.type).toBe(true);
      // Kalıplı standartta 'slot' kalıp yerleşimidir (kalıp panelleri yönetir), ham alan değildir.
      for (const key of Object.keys(component.props)) expect(managedKeys.has(key) || (!!standard.definition.template && key === "slot"), `${component.id}.${key}`).toBe(true);
    }
  });
  for (const queryEditable of [false, true]) it(`uzlaştırma özellik ve çocuk silmez (sorgu düzenleme: ${queryEditable})`, () => {
    const reconciled = reconcile(queryEditable);
    const after = new Map(flatten(reconciled.components as Component[]).map((component) => [component.id, component]));
    for (const component of flatten(components)) {
      const next = after.get(component.id);
      expect(next, component.id).toBeDefined();
      for (const [key, value] of Object.entries(component.props)) expect(next!.props[key], `${component.id}.${key}`).toEqual(value);
    }
    expect(reconciled.queries).toEqual(standard.definition.queries);
  });
});
