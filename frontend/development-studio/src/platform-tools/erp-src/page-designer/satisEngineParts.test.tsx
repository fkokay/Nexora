import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { designerInternals } from "../CustomPagesPage";
import { NAVIGATION_PROPS, NavigationFields } from "./NavigationFields";
import { OPEN_PARAM_NAME, RowOpenActionField } from "./WizardFields";

// Satış sistem sayfalarının gerektirdiği genel motor parçaları: listenin "Sayfa parametresiyle aç" alanı (dataTable openParam)
// ve ERP ekranı düğmesinin "Eski ekranda aç" seçeneği (legacyScreen).
type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
const reconcile = (components: Component[]) => (designerInternals.reconcileDefinition(
  { schemaVersion: 2, queries: [{ id: "q", name: "siparisler", kind: "read" }], components } as never,
  { catalog: { status: "loading" }, queryEditable: false }) as { components: Component[] }).components;
const byId = (components: Component[]) => new Map(components.map((component) => [component.id, component]));

describe("ERP ekranı: eski ekranda aç", () => {
  it("legacyScreen yalnız ERP ekranı düğmesinde kalır", () => {
    expect(NAVIGATION_PROPS.erpPage).toContain("legacyScreen");
    expect(designerInternals.managedKeys.has("legacyScreen")).toBe(true);
    const erpProps = { text: "İrsaliye oluştur", actionType: "erpPage", pageKey: "sales-orders", params: ["orderId={{siparis.rows[0].id}}"], legacyScreen: true };
    expect(reconcile([{ id: "irsaliye", type: "button", props: { ...erpProps } }])[0].props).toEqual(erpProps);
    const page = reconcile([{ id: "sayfa", type: "button", props: { text: "Aç", actionType: "page", pageCode: "@sales-orders", legacyScreen: true } }])[0].props;
    expect(page.legacyScreen).toBeUndefined();
    expect(page.pageCode).toBe("@sales-orders");
  });
  it("onay kutusu ERP ekranı alanlarında gösterilir", () => {
    const html = renderToString(<NavigationFields actionType="erpPage" props={{ pageKey: "sales-orders", legacyScreen: true }} screens={[]} pages={[]} suggestions={[]} onPatch={() => {}}/>);
    expect(html).toContain("Eski ekranda aç");
    expect(html).toMatch(/checked=""[^>]*\/?>Eski ekranda aç/);
    expect(renderToString(<NavigationFields actionType="page" props={{ pageCode: "@x" }} screens={[]} pages={[]} suggestions={[]} onPatch={() => {}}/>)).not.toContain("Eski ekranda aç");
  });
});

describe("Liste: sayfa parametresiyle aç", () => {
  const table: Component = { id: "liste", type: "dataTable", name: "liste", props: { query: "q", rowOpenAction: "ac", openParam: "orderId" } };
  const opener: Component = { id: "ac", type: "button", props: { text: "Aç", actionType: "setInput" } };
  it("satır açılınca düğmesiyle kalır; düğme yoksa ya da geçersizse kalkar", () => {
    expect(designerInternals.managedKeys.has("openParam")).toBe(true);
    expect(byId(reconcile([structuredClone(table), structuredClone(opener)])).get("liste")!.props.openParam).toBe("orderId");
    const noOpener = byId(reconcile([{ ...table, props: { query: "q", openParam: "orderId" } }, structuredClone(opener)])).get("liste")!;
    expect(noOpener.props.openParam).toBeUndefined();
    // Düğme silinince satır açma kalkar; parametre de onunla kalkar.
    const orphan = byId(reconcile([structuredClone(table)])).get("liste")!;
    expect(orphan.props.rowOpenAction).toBeUndefined();
    expect(orphan.props.openParam).toBeUndefined();
  });
  it("ad kuralı sunucuyla aynıdır", () => {
    for (const name of ["orderId", "quoteId", "a", "x".repeat(32)]) expect(OPEN_PARAM_NAME.test(name), name).toBe(true);
    for (const name of ["OrderId", "1id", "", "x".repeat(33), "{{a}}"]) expect(OPEN_PARAM_NAME.test(name), name).toBe(false);
  });
  it("alan satır açılınca bölümünde gösterilir; düğmesizken uyarır", () => {
    const html = renderToString(<RowOpenActionField table={table} components={[table, opener]} labelOf={(component) => String(component.props.text)} onPatch={() => {}}/>);
    expect(html).toContain("Sayfa parametresiyle aç");
    expect(html).toContain('value="orderId"');
    expect(html).not.toContain("önce “Satır açılınca” düğmesi seçin");
    const lonely = renderToString(<RowOpenActionField table={{ ...table, props: { query: "q", openParam: "orderId" } }} components={[opener]} labelOf={(component) => String(component.props.text)} onPatch={() => {}}/>);
    expect(lonely).toContain("önce “Satır açılınca” düğmesi seçin");
  });
});
