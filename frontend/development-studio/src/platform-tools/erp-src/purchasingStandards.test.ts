import { describe, expect, it } from "vitest";
import { designerInternals, designerPersistence } from "./CustomPagesPage";
import { conditionProblem } from "./page-designer/conditions";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { NavigationFields, NAVIGATION_PROPS } from "./page-designer/NavigationFields";
import salesRequestsJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-requests.json?raw";
import salesPurchaseQuotesJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchase-quotes.json?raw";
import salesPurchasingJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchasing.json?raw";
import salesPurchaseDeliveryNotesJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchase-delivery-notes.json?raw";
import salesPurchaseReceiptsJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchase-receipts.json?raw";
import salesPurchaseInvoiceEntryJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchase-invoice-entry.json?raw";
import salesPurchaseInvoicesJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchase-invoices.json?raw";
import salesPurchaseReturnsJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchase-returns.json?raw";
import salesPurchaseOrderCreateJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchase-order-create.json?raw";
import salesPurchaseInvoiceDraftsJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-purchase-invoice-drafts.json?raw";

// Satınalma standartları (src/Hosts/AIERP.Api/SystemPages/Standards/sales-*.json, Faz 1 + Faz 2): tasarımcıda tanınmayan tür/özellik
// olmadan açılmalı, uzlaştırmadan özellik kaybetmeden geçmeli ve koşulları tasarımcının denetimine takılmamalıdır.
type Component = { id: string; type: string; name?: string; props: Record<string, unknown>; children?: Component[] };
type Standard = { definition: { queries: { id: string; name: string }[]; components: Component[] } };
const { reconcileDefinition, managedKeys, contentFields, palette } = designerInternals;
const standards: [string, Standard][] = [["sales-requests", JSON.parse(salesRequestsJson)], ["sales-purchase-quotes", JSON.parse(salesPurchaseQuotesJson)], ["sales-purchasing", JSON.parse(salesPurchasingJson)], ["sales-purchase-delivery-notes", JSON.parse(salesPurchaseDeliveryNotesJson)], ["sales-purchase-receipts", JSON.parse(salesPurchaseReceiptsJson)], ["sales-purchase-invoice-entry", JSON.parse(salesPurchaseInvoiceEntryJson)], ["sales-purchase-invoices", JSON.parse(salesPurchaseInvoicesJson)], ["sales-purchase-returns", JSON.parse(salesPurchaseReturnsJson)], ["sales-purchase-order-create", JSON.parse(salesPurchaseOrderCreateJson)], ["sales-purchase-invoice-drafts", JSON.parse(salesPurchaseInvoiceDraftsJson)]];
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
  it("yükle → uzlaştır → kaydet gidiş-dönüşü bütün özellikleri ve sorguları korur", () => {
    const stored = JSON.stringify({ schemaVersion: 2, queries, components });
    const loaded = designerPersistence.normalizeDefinition(JSON.parse(stored));
    const reconciled = reconcileDefinition(loaded, { catalog: { status: "loading" }, queryEditable: false });
    const saved = JSON.parse(JSON.stringify(designerPersistence.wireDefinition(reconciled, { status: "loading" }))) as Standard["definition"];
    const after = new Map(flatten(saved.components).map((component) => [component.id, component]));
    expect(after.size).toBe(all.length);
    for (const component of all) {
      const next = after.get(component.id);
      expect(next, component.id).toBeDefined();
      expect(next!.type, component.id).toBe(component.type);
      for (const [prop, value] of Object.entries(component.props)) expect(JSON.stringify(next!.props[prop]), `${component.id}.${prop}`).toBe(JSON.stringify(value));
    }
    expect(saved.queries).toEqual(queries);
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


describe("satınalma standartlarında eski ekran gezinmesi", () => {
  it("erpPage 'legacyScreen' bayrağı Gezinme alanlarında tanınır ve en az bir standartta kullanılır", () => {
    expect(NAVIGATION_PROPS.erpPage).toContain("legacyScreen");
    const legacy = standards.flatMap(([, standard]) => flatten(standard.definition.components)).filter((component) => component.props.legacyScreen === true);
    expect(legacy.length).toBeGreaterThan(0);
    for (const component of legacy) expect(component.props.actionType, component.id).toBe("erpPage");
  });
  it("'Eski ekranda aç' onay kutusu yalnız ERP ekranı eyleminde ve bayrağın değerini gösterir", () => {
    const render = (actionType: string, props: Record<string, unknown>) => renderToString(createElement(NavigationFields,
      { actionType, props, screens: [], pages: [], suggestions: [], onPatch: () => undefined }));
    const checked = /<input type="checkbox"(?=[^>]*checked)[^>]*\/?>Eski ekranda aç/;
    expect(render("erpPage", { pageKey: "sales-purchasing", legacyScreen: true })).toMatch(checked);
    expect(render("erpPage", { pageKey: "sales-purchasing" })).toContain("Eski ekranda aç");
    expect(render("erpPage", { pageKey: "sales-purchasing" })).not.toMatch(checked);
    expect(render("page", { pageCode: "x" })).not.toContain("Eski ekranda aç");
  });
});
