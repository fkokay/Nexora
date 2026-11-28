import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import { conditionProblem } from "./page-designer/conditions";
import { parseGridColumn } from "./page-designer/gridColumns";
import { calcColumnProblem } from "./page-designer/gridRowSources";
import { RUN_ON_TYPES, runOnProblem } from "./page-designer/queryRunOn";

// Satış belge kartı standartları (Aşama B: src/Hosts/AIERP.Api/SystemPages/Standards/sales-*-create.json): tasarımcıda tanınmayan
// tür/özellik olmadan açılmalı, uzlaştırmadan sorgu ya da özellik kaybetmeden geçmeli; yeni motor özellikleri (kaynaktan
// doldurma, seçimle doldurma, önizleme sorgusu, hesaplanan sütun) tasarımcının denetimine takılmamalıdır.
type Component = { id: string; type: string; name?: string; props: Record<string, unknown>; children?: Component[] };
type Query = { id: string; name: string; kind: string; runOn?: unknown; runDebounceMs?: unknown };
type Standard = { definition: { queries: Query[]; components: Component[] } };
const { reconcileDefinition, managedKeys, contentFields, palette } = designerInternals;
// Kartlar API tarafında aşama aşama eklenir (P6); glob mevcut olanları okur, kart anahtarları aşağıda sabittir.
const files = import.meta.glob<string>("../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-*-create.json", { eager: true, query: "?raw", import: "default" });
const CARD_KEYS = ["sales-quote-create", "sales-delivery-create", "sales-invoice-create"];
// Satınalma kartları (sales-purchase-*-create) aynı desene uyar; purchasingStandards.test.ts denetler.
const standards: [string, Standard][] = Object.entries(files).map(([path, json]): [string, Standard] => [path.slice(path.lastIndexOf("/") + 1, -".json".length), JSON.parse(json) as Standard])
  .filter(([key]) => !key.startsWith("sales-purchase-"));
const flatten = (list: Component[]): Component[] => list.flatMap((component) => [component, ...flatten(component.children ?? [])]);
const CONDITION_PROPS = ["visibleWhen", "disabledWhen", "requiredWhen", "activeWhen", "sequenceWhen", "defaultWhen", "countWhen"];

it("yalnız bilinen satış kartları okunur ve fatura kartı vardır", () => {
  expect(standards.map(([key]) => key).every((key) => CARD_KEYS.includes(key))).toBe(true);
  expect(standards.map(([key]) => key)).toContain("sales-invoice-create");
});

for (const [key, standard] of standards) describe(`${key} standardı tasarımcıda`, () => {
  const { queries, components } = standard.definition;
  const all = flatten(components);
  const reconcile = (queryEditable: boolean) => reconcileDefinition(
    { schemaVersion: 2, queries, components: structuredClone(components) } as never, { catalog: { status: "loading" }, queryEditable }) as unknown as Standard["definition"];
  it("bütün türler ve özellikler tasarımcıda tanınır (ham metin alanı yok)", () => {
    for (const component of all) {
      expect(contentFields, component.type).toHaveProperty(component.type);
      expect(palette.some((item) => item.type === component.type), component.type).toBe(true);
      for (const prop of Object.keys(component.props)) expect(managedKeys.has(prop), `${component.id}.${prop}`).toBe(true);
    }
  });
  for (const queryEditable of [false, true]) it(`uzlaştırma özellik silmez ve değiştirmez (sorgu düzenleme: ${queryEditable})`, () => {
    const reconciled = reconcile(queryEditable);
    const after = new Map(flatten(reconciled.components).map((component) => [component.id, component]));
    for (const component of all) {
      const next = after.get(component.id);
      expect(next, component.id).toBeDefined();
      for (const [prop, value] of Object.entries(component.props)) expect(next!.props[prop], `${component.id}.${prop}`).toEqual(value);
      const added = Object.keys(next!.props).filter((prop) => !(prop in component.props));
      expect(added, component.id).toEqual(component.type === "formCard" && added.length > 0 ? ["columns"] : []);
    }
    expect(reconciled.queries).toEqual(queries);
  });
  it("koşullar yalnız sayfadaki adlara ve ayrılmış köklere başvurur", () => {
    const names = [...queries.map((query) => query.name), ...all.map((component) => component.name).filter((name): name is string => !!name)];
    for (const component of all) for (const prop of CONDITION_PROPS)
      expect(conditionProblem(prop, component.props[prop], names), `${component.id}.${prop}`).toBeNull();
  });
  it("tablo sütunları geçerli; önizleme sorguları ve hesaplanan sütunlar tasarımcı kurallarına uyar", () => {
    const readIds = new Set(queries.filter((query) => query.kind === "read").map((query) => query.id));
    const runOnNames = all.filter((component) => RUN_ON_TYPES.has(component.type) && !!component.name).map((component) => component.name!);
    for (const query of queries) expect(runOnProblem(query, runOnNames), query.name).toBeNull();
    for (const component of all.filter((item) => item.type === "editableGrid")) {
      const columns = Array.isArray(component.props.gridColumns) ? component.props.gridColumns as string[] : [];
      expect(columns.length, component.id).toBeLessThanOrEqual(16);
      for (const column of columns) expect(parseGridColumn(column).ok, `${component.id}: ${column}`).toBe(true);
      expect(calcColumnProblem(component.props, readIds), component.id).toBeNull();
    }
  });
});
