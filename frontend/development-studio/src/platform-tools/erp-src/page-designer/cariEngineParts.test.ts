import { describe, expect, it } from "vitest";
import { designerInternals } from "../CustomPagesPage";
import { conditionProblem } from "./conditions";
import { barCommandProblem } from "./barCommands";
import { BarCommandRows } from "./BarCommandRows";
import { buildReadRequest, type ErpOperation } from "./erpOperations";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { NAVIGATION_PROPS } from "./NavigationFields";
import { pageDateScope } from "./pageBindings";
import { nameProblem } from "./QueriesPanel";

// Cari sistem sayfalarının gerektirdiği genel motor parçaları: tarih kökü, ERP ekranı parametreleri ve "ad.alan" gövde parametreleri.
describe("tarih kökü", () => {
  it("ay başı, yıl başı ve son 3 ayın başı yerel tarihle hesaplanır", () => {
    expect(pageDateScope(new Date(2026, 10, 21))).toEqual({ ayBasi: "2026-11-01", yilBasi: "2026-01-01", ucAyOnce: "2026-09-01" });
    // Yıl dönümünde iki ay önceki ay geçen yıldadır.
    expect(pageDateScope(new Date(2027, 1, 3))).toEqual({ ayBasi: "2027-02-01", yilBasi: "2027-01-01", ucAyOnce: "2026-12-01" });
    expect(pageDateScope(new Date(2027, 0, 31)).ucAyOnce).toBe("2026-11-01");
  });
  it("koşul kökü olarak tanınır ve ayrılmış addır", () => {
    expect(conditionProblem("visibleWhen", "bitis.value < tarih.ayBasi", ["bitis"])).toBeNull();
    expect(nameProblem("tarih", [])).toMatch(/ayrılmış/);
  });
});

describe("ERP ekranı parametreleri", () => {
  type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
  const reconcile = (components: Component[]) => (designerInternals.reconcileDefinition(
    { schemaVersion: 2, queries: [], components } as never, { catalog: { status: "loading" }, queryEditable: false }) as { components: Component[] }).components;
  it("params hem ERP ekranı hem sayfa düğmesinde kalır, diğer türlerde kalkar", () => {
    expect(NAVIGATION_PROPS.erpPage).toContain("params");
    expect(designerInternals.managedKeys.has("params")).toBe(true);
    const erpProps = { text: "Faturalar", actionType: "erpPage", pageKey: "sales-invoices", params: ["customerId={{liste.seciliSatir.id}}"] };
    expect(reconcile([{ id: "faturalar", type: "button", props: { ...erpProps } }])[0].props).toEqual(erpProps);
    const pageProps = { text: "Hareketler", actionType: "page", pageCode: "@customer-ledger", params: ["customerId={{liste.seciliSatir.id}}"] };
    expect(reconcile([{ id: "hareketler", type: "button", props: { ...pageProps } }])[0].props).toEqual(pageProps);
    const linked = reconcile([{ id: "git", type: "button", props: { text: "Git", actionType: "link", href: "https://example.com/", params: ["a=b"], pageKey: "x" } }])[0].props;
    expect(linked.params).toBeUndefined();
    expect(linked.pageKey).toBeUndefined();
  });
});

describe("ad.alan gövde parametreleri", () => {
  const operation: ErpOperation = {
    name: "ornek.ara", label: "Örnek", module: "Cari", kind: "read", pageKind: "read", method: "POST", route: "/api/ornek/ara",
    parameters: [
      { name: "q", in: "body", type: "text", required: false },
      { name: "address.city", in: "body", type: "text", required: false },
      { name: "address.district", in: "body", type: "text", required: false },
    ],
    result: { shape: "list", rowsPath: null, columns: [] }, sourceOperation: null, fixedBody: null, since: "1", deprecated: false, allowed: true,
  };
  it("önizleme isteğinde iç nesneye yazılır", () => {
    const request = buildReadRequest(operation, { q: "a", "address.city": "İzmir", "address.district": "Bornova" });
    expect(JSON.parse(request.body!)).toEqual({ q: "a", address: { city: "İzmir", district: "Bornova" } });
    expect(JSON.parse(buildReadRequest(operation, { q: "a" }).body!)).toEqual({ q: "a" });
  });
});

describe("Kaydet ve yeni", () => {
  it("kayıt yolu ve Yeni komutu olmadan kaydedilmez (sunucu kuralı)", () => {
    expect(barCommandProblem({ saveAndNew: true, newAction: "page", newPageCode: "@x" })).toMatch(/kayıt sorgusu/);
    expect(barCommandProblem({ saveAndNew: true, saveQuery: "q" })).toMatch(/Yeni komutu/);
    expect(barCommandProblem({ saveAndNew: true, saveSequence: ["a"], newAction: "page", newPageCode: "@x" })).toBeNull();
    expect(designerInternals.managedKeys.has("saveAndNew")).toBe(true);
  });
  it("komut listesinde koşullu, gözsüz satır olarak görünür", () => {
    const html = renderToString(createElement(BarCommandRows, { props: { saveAndNew: true, commandWhen: ["saveNew=a == 1"] }, summaries: { saveNew: "İşlemler menüsünde" },
      renderDetail: () => null, paths: [], pageNames: ["a"], onPatch: () => {} }));
    expect(html).toContain("Kaydet ve yeni");
    expect(html).toContain("Ctrl+F2");
    // Dokuz çubuk komutunun gözü vardır; Kaydet ve yeni ile Kaydettikten sonra gözsüzdür.
    expect(html.match(/pd-cmd-eye is-none/g)?.length).toBe(2);
  });
});
