import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import { conditionProblem } from "./page-designer/conditions";
import { COLUMN_FORMATS, parseColumnFormats } from "./page-designer/cellFormat";
import { HEADER_FIELD_FORMATS } from "./page-designer/wizardParts";
import { parameterTypeLabel } from "./page-designer/QueriesPanel";
import ordersJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/manufacturing-orders.json?raw";
import orderCreateJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/manufacturing-order-create.json?raw";
import recipesJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/manufacturing-recipes.json?raw";
import costVarianceJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/manufacturing-cost-variance.json?raw";

// Üretim standartları (src/Hosts/AIERP.Api/SystemPages/Standards/manufacturing-*.json: emirler, emir planlama, reçeteler,
// maliyet analizi): tasarımcıda tanınmayan tür/özellik/değer olmadan açılmalı, uzlaştırmadan özellik kaybetmeden geçmeli
// ve koşulları tasarımcının denetimine takılmamalıdır.
type Component = { id: string; type: string; name?: string; props: Record<string, unknown>; children?: Component[] };
type Query = { id: string; name: string; parameters?: { name: string; type: string }[] };
type Standard = { definition: { queries: Query[]; components: Component[]; template?: unknown } };
const { reconcileDefinition, managedKeys, contentFields, palette, inputTypeOptions } = designerInternals;
const standards: [string, Standard][] = [
  ["manufacturing-orders", JSON.parse(ordersJson)], ["manufacturing-order-create", JSON.parse(orderCreateJson)],
  ["manufacturing-recipes", JSON.parse(recipesJson)], ["manufacturing-cost-variance", JSON.parse(costVarianceJson)],
];
describe('üretim kalıp yerleşimleri', () => {
  it('emir listesi, emir kartı ve reçete listesi tasarım düzenlerini korur', () => {
    const byKey = new Map(standards);
    expect(byKey.get('manufacturing-orders')?.definition.template).toEqual({ name: 'list' });
    expect(byKey.get('manufacturing-order-create')?.definition.template).toEqual({ name: 'record' });
    expect(byKey.get('manufacturing-recipes')?.definition.template).toEqual({ name: 'list' });
    const order = byKey.get('manufacturing-orders')!.definition.components;
    expect(order.find((component) => component.id === 'liste')?.props.columns).toHaveLength(7);
    expect(order.find((component) => component.id === 'operasyonTablosu')?.props.rowActions).toEqual(['opBaslatDugmesi', 'opTamamlaDugmesi']);
    const create = byKey.get('manufacturing-order-create')!.definition.components;
    expect(create.find((component) => component.id === 'siparisKarti')?.props.visibleWhen).toBe("uretimTuru.value == 'SalesOrder'");
    expect(create.find((component) => component.id === 'icerikTablosu')?.props.slot).toBe('below');
  });
});
const flatten = (list: Component[]): Component[] => list.flatMap((component) => [component, ...flatten(component.children ?? [])]);
const CONDITION_PROPS = ["visibleWhen", "disabledWhen", "requiredWhen", "activeWhen", "sequenceWhen", "defaultWhen", "countWhen"];
// Sorgu parametre türü tasarımcının listesinde olmalı (etiketi bilinmeyen tür ham adıyla döner).
const knownParameterType = (type: string) => parameterTypeLabel(type) !== type;
const metricFormats = (contentFields.metric.find((field) => field.key === "format")?.options ?? []).map(([value]) => value);
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const formatOf = (entry: string) => entry.slice(entry.lastIndexOf("=") + 1).trim();

for (const [key, standard] of standards) describe(`${key} standardı tasarımcıda`, () => {
  const { queries, components } = standard.definition;
  const all = flatten(components);
  const reconcile = (queryEditable: boolean) => reconcileDefinition(
    { schemaVersion: 2, queries, components: structuredClone(components) } as never, { catalog: { status: "loading" }, queryEditable }) as unknown as Standard["definition"];
  it("bütün türler ve özellikler tasarımcıda tanınır (ham metin alanı yok)", () => {
    for (const component of all) {
      expect(contentFields, component.type).toHaveProperty(component.type);
      expect(palette.some((item) => item.type === component.type), component.type).toBe(true);
      // Kalıplı standartta 'slot' kalıp yerleşimidir (kalıp panelleri yönetir), ham alan değildir.
      for (const prop of Object.keys(component.props)) expect(managedKeys.has(prop) || (!!standard.definition.template && prop === "slot"), `${component.id}.${prop}`).toBe(true);
    }
  });
  it("giriş türleri, biçimler ve parametre türleri tasarımcının seçeneklerindedir", () => {
    for (const component of all) {
      const props = component.props;
      if (component.type === "input") expect(inputTypeOptions.map((option) => option.value), `${component.id}.inputType`).toContain(String(props.inputType ?? "text"));
      if (component.type === "metric" && props.format !== undefined) expect(metricFormats, `${component.id}.format`).toContain(props.format);
      const columnFormats = strings(props.columnFormats);
      expect(Object.keys(parseColumnFormats(columnFormats)).length, `${component.id}.columnFormats`).toBe(columnFormats.length);
      for (const entry of columnFormats) expect(COLUMN_FORMATS as readonly string[], `${component.id}.columnFormats`).toContain(formatOf(entry));
      for (const entry of strings(props.fieldFormats)) expect(HEADER_FIELD_FORMATS as readonly string[], `${component.id}.fieldFormats`).toContain(formatOf(entry));
    }
    for (const query of queries) for (const parameter of query.parameters ?? []) expect(knownParameterType(parameter.type), `${query.name}.@${parameter.name}: ${parameter.type}`).toBe(true);
  });
  for (const queryEditable of [false, true]) it(`uzlaştırma özellik silmez ve değiştirmez (sorgu düzenleme: ${queryEditable})`, () => {
    const reconciled = reconcile(queryEditable);
    const after = new Map(flatten(reconciled.components).map((component) => [component.id, component]));
    for (const component of all) {
      const next = after.get(component.id);
      expect(next, component.id).toBeDefined();
      for (const [prop, value] of Object.entries(component.props)) expect(next!.props[prop], `${component.id}.${prop}`).toEqual(value);
      // Eklenen tek özellik tasarımcı varsayılanıdır: sütun sayısı yazılmamış form kartına columns: 2 (tek satır dizilimde etkisiz).
      const added = Object.keys(next!.props).filter((prop) => !(prop in component.props));
      expect(added, component.id).toEqual(component.type === "formCard" && added.length > 0 ? ["columns"] : []);
    }
    expect(reconciled.queries).toEqual(queries);
  });
  it("koşullar yalnız sayfadaki adlara ve ayrılmış köklere başvurur", () => {
    const names = [...queries.map((query) => query.name), ...all.map((component) => component.name).filter((name): name is string => !!name)];
    for (const component of all) for (const prop of CONDITION_PROPS) {
      const text = component.props[prop];
      expect(conditionProblem(prop, text, names), `${component.id}.${prop}`).toBeNull();
    }
  });
});

describe("reçete listesi Belge gezinmesi", () => {
  it("Yeni ve Aç reçete Belgesine gider; Aç seçili kimliği id olarak taşır", () => {
    const recipe = standards.find(([key]) => key === "manufacturing-recipes")![1].definition.components;
    const open = recipe.find((component) => component.id === "acDugmesi")!.props;
    const create = recipe.find((component) => component.id === "yeniDugmesi")!.props;
    expect(create).toMatchObject({ actionType: "erpPage", pageKey: "manufacturing-recipe-document" });
    expect(create).not.toHaveProperty("legacyScreen");
    expect(open).toMatchObject({ actionType: "erpPage", pageKey: "manufacturing-recipe-document", params: ["id={{liste.seciliSatir.id}}"] });
    expect(open).not.toHaveProperty("legacyScreen");
  });
});
