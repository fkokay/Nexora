import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import { conditionProblem } from "./page-designer/conditions";
import customersJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/customers.json?raw";
import customerCreateJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/customer-create.json?raw";
import customerLedgerJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/customer-ledger.json?raw";

// Cari Hesaplar standartları (src/Hosts/AIERP.Api/SystemPages/Standards/customer*.json): tasarımcıda tanınmayan tür/özellik
// olmadan açılmalı, uzlaştırmadan özellik kaybetmeden geçmeli ve koşulları tasarımcının denetimine takılmamalıdır.
type Component = { id: string; type: string; name?: string; props: Record<string, unknown>; children?: Component[] };
type Standard = { definition: { queries: { id: string; name: string }[]; components: Component[] } };
const { reconcileDefinition, managedKeys, contentFields, palette } = designerInternals;
const standards: [string, Standard][] = [["customers", JSON.parse(customersJson)], ["customer-create", JSON.parse(customerCreateJson)], ["customer-ledger", JSON.parse(customerLedgerJson)]];
const flatten = (list: Component[]): Component[] => list.flatMap((component) => [component, ...flatten(component.children ?? [])]);
const CONDITION_PROPS = ["visibleWhen", "disabledWhen", "requiredWhen", "activeWhen", "sequenceWhen", "defaultWhen", "countWhen"];

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
      // countWhen satır kökünü (<sorgu>.satir) kullanır; kök yine sorgu adıdır.
      expect(conditionProblem(prop, text, names), `${component.id}.${prop}`).toBeNull();
    }
  });
});

describe("Toplu silme (bulkDeleteQuery) tasarımcıda", () => {
  const standard = JSON.parse(customersJson) as Standard;
  const listeOf = (definition: Standard["definition"]) => definition.components.find((component) => component.id === "liste")!;
  const reconcileWith = (queries: Standard["definition"]["queries"]) => reconcileDefinition(
    { schemaVersion: 2, queries, components: structuredClone(standard.definition.components) } as never, { catalog: { status: "loading" }, queryEditable: true }) as unknown as Standard["definition"];
  it("Cari Hesaplar listesi silme sorgusuna bağlıdır ve uzlaştırmada korunur", () => {
    expect(listeOf(standard.definition).props.bulkDeleteQuery).toBe("kartSil");
    expect(listeOf(reconcileWith(standard.definition.queries)).props.bulkDeleteQuery).toBe("kartSil");
  });
  it("sorgu silinince ya da silme türünden çıkınca bağ kalkar", () => {
    const removed = reconcileWith(standard.definition.queries.filter((query) => query.id !== "kartSil"));
    expect(listeOf(removed).props).not.toHaveProperty("bulkDeleteQuery");
    const asUpdate = reconcileWith(standard.definition.queries.map((query) => query.id === "kartSil" ? { ...query, kind: "update" } : query));
    expect(listeOf(asUpdate).props).not.toHaveProperty("bulkDeleteQuery");
  });
});
