import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { designerInternals } from "../CustomPagesPage";
import { buildReadRequest, type ErpOperation } from "./erpOperations";
import { FixedOperationValues } from "./FixedOperationValues";
import { gridTotalCodes, renamedTotals } from "./gridColumns";
import { conditionProblem } from "./conditions";

// Finans sistem sayfalarının gerektirdiği genel motor parçaları: sabit sorgu değerleri (fixedQuery) ve düzenlenebilir tablo alt toplamı (totals).
const operation = (patch: Partial<ErpOperation>): ErpOperation => ({
  name: "ornek.pasifeAl", label: "Örnek", module: "Finans", kind: "read", pageKind: "read", method: "GET", route: "/api/ornek/{id}",
  parameters: [{ name: "id", in: "route", type: "guid", required: true }, { name: "q", in: "query", type: "text", required: false }],
  result: { shape: "none", rowsPath: null, columns: [] }, sourceOperation: null, fixedBody: null, since: "1", deprecated: false, allowed: true, ...patch,
});
const id = "11111111-2222-3333-4444-555555555555";

describe("sabit sorgu değerleri (fixedQuery)", () => {
  it("önizleme isteğine eklenir; false boş sayılmaz", () => {
    expect(buildReadRequest(operation({ fixedQuery: { isActive: false } }), { id }).url).toBe(`/api/ornek/${id}?isActive=false`);
    expect(buildReadRequest(operation({ fixedQuery: { isActive: true } }), { id, q: "a" }).url).toBe(`/api/ornek/${id}?q=a&isActive=true`);
    // Eski katalogda alan hiç yoktur.
    expect(buildReadRequest(operation({}), { id }).url).toBe(`/api/ornek/${id}`);
  });
  it("sorgu ayarlarında salt okunur gösterilir (gövde ve sorgu)", () => {
    const html = renderToString(createElement(FixedOperationValues, { operation: operation({ fixedQuery: { isActive: false }, fixedBody: { openingBalance: 0 } }) }));
    expect(html).toContain("Sabit değerler");
    expect(html).toContain("isActive");
    expect(html).toContain("false");
    expect(html).toContain("openingBalance");
    expect(html).not.toContain("<input");
    expect(renderToString(createElement(FixedOperationValues, { operation: operation({}) }))).toBe("");
  });
});

describe("düzenlenebilir tablo alt toplamı (totals)", () => {
  type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
  const reconcile = (components: Component[]) => (designerInternals.reconcileDefinition(
    { schemaVersion: 2, queries: [], components } as never, { catalog: { status: "loading" }, queryEditable: false }) as { components: Component[] }).components;
  const gridColumns = ["accountId|Hesap|text|required", "debit|Borç|number|min:0", "credit|Alacak|number|min:0"];
  it("yalnız sayı sütunlarında kalır; geçerli değer değişmez", () => {
    expect(designerInternals.managedKeys.has("totals")).toBe(true);
    const props = { gridMode: "list", gridColumns, totals: ["debit", "credit"] };
    expect(reconcile([{ id: "g", type: "editableGrid", name: "satirlar", props: { ...props } }])[0].props).toEqual(props);
    expect(reconcile([{ id: "g", type: "editableGrid", name: "satirlar", props: { ...props, totals: ["accountId", "credit", "yok"] } }])[0].props.totals).toEqual(["credit"]);
    expect(reconcile([{ id: "g", type: "editableGrid", name: "satirlar", props: { ...props, totals: ["accountId"] } }])[0].props).not.toHaveProperty("totals");
    expect(gridTotalCodes({ ...props, gridMode: "matrix" })).toEqual([]);
  });
  it("sütun yeniden adlanınca taşınır, sayı olmaktan çıkınca kalkar", () => {
    const props = { totals: ["debit", "credit"] };
    expect(renamedTotals(props, "debit", "borc")).toEqual({ totals: ["borc", "credit"] });
    expect(renamedTotals(props, "debit", null)).toEqual({ totals: ["credit"] });
    expect(renamedTotals({ totals: ["debit"] }, "debit", null)).toEqual({ totals: undefined });
    expect(renamedTotals(props, "accountId", null)).toEqual({});
  });
  it("denge koşulu tablonun toplam yollarıyla yazılabilir (yol-yol karşılaştırma)", () => {
    expect(conditionProblem("visibleWhen", "satirlar.toplam.debit == satirlar.toplam.credit && satirlar.toplam.debit > 0", ["satirlar"])).toBeNull();
  });
});
