import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import { conditionProblem } from "./page-designer/conditions";
import { OPEN_PARAM_NAME } from "./page-designer/WizardFields";
import quotesJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-quotes.json?raw";
import ordersJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-orders.json?raw";
import deliveriesJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-deliveries.json?raw";
import invoicesJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-invoices.json?raw";

// Satış standartları (src/Hosts/AIERP.Api/SystemPages/Standards/sales-*.json: teklif, sipariş, irsaliye, fatura): tasarımcıda tanınmayan tür/özellik
// olmadan açılmalı, uzlaştırmadan özellik kaybetmeden geçmeli ve koşulları tasarımcının denetimine takılmamalıdır.
type Component = { id: string; type: string; name?: string; props: Record<string, unknown>; children?: Component[] };
type Standard = { definition: { template?: { name: string }; queries: { id: string; name: string }[]; components: Component[] } };
const { reconcileDefinition, managedKeys, contentFields, palette } = designerInternals;
const standards: [string, Standard][] = [["sales-quotes", JSON.parse(quotesJson)], ["sales-orders", JSON.parse(ordersJson)], ["sales-deliveries", JSON.parse(deliveriesJson)], ["sales-invoices", JSON.parse(invoicesJson)]];
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
      // Kalıplı standartta 'slot' kalıp yerleşimidir (kalıp panelleri yönetir), ham alan değildir.
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
      // countWhen satır kökünü (<sorgu>.satir) kullanır; kök yine sorgu adıdır.
      expect(conditionProblem(prop, text, names), `${component.id}.${prop}`).toBeNull();
    }
  });
});

// Satışın yeni motor özellikleri: liste "Sayfa parametresiyle aç" (openParam) ve "Eski ekranda aç" (legacyScreen).
describe("satış standartlarının yeni özellikleri", () => {
  const all = standards.flatMap(([key, standard]) => flatten(standard.definition.components).map((component) => [key, component] as const));
  it("openParam yalnız satır açılınca düğmesi olan adlı listede, geçerli parametre adıyla", () => {
    const tables = all.filter(([, component]) => "openParam" in component.props);
    expect(tables.map(([key, component]) => `${key}.${component.id}=${component.props.openParam}`).sort())
      .toEqual(["sales-invoices.liste=invoiceId", "sales-orders.liste=orderId", "sales-quotes.liste=quoteId"]);
    for (const [key, component] of tables) {
      expect(component.type, `${key}.${component.id}`).toBe("dataTable");
      expect(component.name, `${key}.${component.id}`).toBeTruthy();
      expect(OPEN_PARAM_NAME.test(String(component.props.openParam)), `${key}.${component.id}`).toBe(true);
      expect(typeof component.props.rowOpenAction === "string" && component.props.rowOpenAction !== "", `${key}.${component.id}`).toBe(true);
    }
  });
  it("legacyScreen yalnız ERP ekranı düğmesinde", () => {
    const buttons = all.filter(([, component]) => "legacyScreen" in component.props);
    expect(buttons.length).toBeGreaterThan(0);
    for (const [key, component] of buttons) {
      expect(component.type, `${key}.${component.id}`).toBe("button");
      expect(component.props.actionType, `${key}.${component.id}`).toBe("erpPage");
      expect(component.props.legacyScreen, `${key}.${component.id}`).toBe(true);
    }
  });
});
