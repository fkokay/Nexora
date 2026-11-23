import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import { conditionProblem } from "./page-designer/conditions";
import { COLUMN_FORMATS, parseColumnFormats } from "./page-designer/cellFormat";
import { HEADER_FIELD_FORMATS } from "./page-designer/wizardParts";
import { parameterTypeLabel } from "./page-designer/QueriesPanel";
import { OPEN_PARAM_NAME } from "./page-designer/WizardFields";
import foreignTradeJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/foreign-trade.json?raw";
import foreignTradeCaseJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/foreign-trade-case.json?raw";

// Dış Ticaret standartları (src/Hosts/AIERP.Api/SystemPages/Standards/foreign-trade*.json: dosya listesi, dosya kartı): tasarımcıda tanınmayan tür/özellik/değer
// olmadan açılmalı, uzlaştırmadan özellik kaybetmeden geçmeli ve koşulları tasarımcının denetimine takılmamalıdır.
type Component = { id: string; type: string; name?: string; props: Record<string, unknown>; children?: Component[] };
type Query = { id: string; name: string; parameters?: { name: string; type: string }[] };
type Standard = { definition: { queries: Query[]; components: Component[] } };
const { reconcileDefinition, managedKeys, contentFields, palette, inputTypeOptions } = designerInternals;
const standards: [string, Standard][] = [["foreign-trade", JSON.parse(foreignTradeJson)], ["foreign-trade-case", JSON.parse(foreignTradeCaseJson)]];
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
      for (const prop of Object.keys(component.props)) expect(managedKeys.has(prop), `${component.id}.${prop}`).toBe(true);
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

// Testin boşuna geçmemesi için: aşama diyalogları, tarih girişi/parametresi ve listenin openParam'ı standartlarda gerçekten kullanılır.
describe("Dış Ticaret standartlarının kullandığı özellikler", () => {
  const all = standards.flatMap(([key, standard]) => flatten(standard.definition.components).map((component) => [key, component] as const));
  const parameters = standards.flatMap(([, standard]) => standard.definition.queries.flatMap((query) => query.parameters ?? []));
  it("listede diyalog, aşama adımları ve id openParam'ı; kartta tarih girişi vardır", () => {
    expect(all.some(([key, component]) => key === "foreign-trade" && component.type === "dialog")).toBe(true);
    expect(all.some(([key, component]) => key === "foreign-trade" && component.type === "steps")).toBe(true);
    expect(all.some(([key, component]) => key === "foreign-trade-case" && component.type === "input" && component.props.inputType === "date")).toBe(true);
    expect(parameters.some((parameter) => parameter.type === "date")).toBe(true);
    const tables = all.filter(([, component]) => "openParam" in component.props);
    expect(tables.map(([key, component]) => `${key}.${component.id}=${component.props.openParam}`)).toEqual(["foreign-trade.liste=id"]);
    for (const [key, component] of tables) {
      expect(component.type, `${key}.${component.id}`).toBe("dataTable");
      expect(component.name, `${key}.${component.id}`).toBeTruthy();
      expect(OPEN_PARAM_NAME.test(String(component.props.openParam)), `${key}.${component.id}`).toBe(true);
      expect(typeof component.props.rowOpenAction === "string" && component.props.rowOpenAction !== "", `${key}.${component.id}`).toBe(true);
    }
  });
});
