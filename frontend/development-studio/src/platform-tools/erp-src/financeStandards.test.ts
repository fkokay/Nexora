import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import { conditionProblem } from "./page-designer/conditions";
import standard0 from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/finance-accounts.json?raw";
import standard1 from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/finance-banks.json?raw";
import standard2 from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/finance-account-create.json?raw";
import standard3 from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/finance-trial-balance.json?raw";
import standard4 from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/finance-ledger-chart.json?raw";
import standard5 from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/finance-journal-ledger.json?raw";

// Finans / Genel Muhasebe standartları (src/Hosts/AIERP.Api/SystemPages/Standards/finance-*.json): tasarımcıda tanınmayan tür/özellik
// olmadan açılmalı, uzlaştırmadan özellik kaybetmeden geçmeli ve koşulları tasarımcının denetimine takılmamalıdır.
type Component = { id: string; type: string; name?: string; props: Record<string, unknown>; children?: Component[] };
type Standard = { definition: { template?: { name: string }; queries: { id: string; name: string; parameters?: { name: string; binding: string }[] }[]; components: Component[] } };
const { reconcileDefinition, managedKeys, contentFields, palette } = designerInternals;
const standards: [string, Standard][] = ([
  ["finance-accounts", standard0], ["finance-banks", standard1], ["finance-account-create", standard2], ["finance-trial-balance", standard3],
  ["finance-ledger-chart", standard4], ["finance-journal-ledger", standard5],
] as [string, string][]).map(([key, json]) => [key, JSON.parse(json) as Standard]);
const flatten = (list: Component[]): Component[] => list.flatMap((component) => [component, ...flatten(component.children ?? [])]);
const CONDITION_PROPS = ["visibleWhen", "disabledWhen", "requiredWhen", "activeWhen", "sequenceWhen", "defaultWhen", "countWhen"];

describe("wave 1 finance List standards", () => {
  for (const key of ["finance-accounts", "finance-banks", "finance-journal-ledger", "finance-trial-balance"]) {
    it(`${key} uses the List template without the removed step/filter controls`, () => {
      const standard = standards.find(([name]) => name === key)![1];
      expect(standard.definition.template?.name).toBe("list");
      const ids = new Set(flatten(standard.definition.components).map((component) => component.id));
      expect(ids.has("adimlar")).toBe(false);
      expect(ids.has("hesapSecimi")).toBe(false);
      if (key === "finance-journal-ledger") expect(ids.has("tersKayitGostergesi")).toBe(false);
      if (key === "finance-trial-balance") { expect(ids.has("buAy")).toBe(false); expect(ids.has("buYil")).toBe(false); }
      if (key === "finance-accounts" || key === "finance-banks") {
        expect(standard.definition.queries.find((query) => query.id === "ekstre")?.parameters?.find((parameter) => parameter.name === "id")?.binding).toBe("{{liste.seciliSatir.id}}");
      }
    });
  }
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
      for (const prop of Object.keys(component.props)) expect(managedKeys.has(prop) || (!!standard.definition.template && prop === "slot"), `${component.id}.${prop}`).toBe(true);
    }
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
