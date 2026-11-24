import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { designerInternals } from "../CustomPagesPage";
import { GridPreview } from "./CanvasPreviews";
import { DetailToggleField } from "./GridSettingsFields";
import { ownableCandidates, tableDetailToggleIds } from "./layoutRefs";

// Listenin araç çubuğundaki "Detay paneli" düğmesi (`dataTable.detailToggleInput`, taslak 21): onay kutusu girişini açıp
// kapatır; giriş listeye aittir (üst düzeyde çizilmez, sekmeye / pencereye / form kartına alınmaz).
type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
const { reconcileDefinition, managedKeys } = designerInternals;
const reconcile = (components: Component[]) => (reconcileDefinition(
  { schemaVersion: 2, queries: [{ id: "q", name: "q", kind: "read", sql: "select 1", parameters: [], runOn: "load" }], components } as never,
  { catalog: { status: "loading" }, queryEditable: true }) as unknown as { components: Component[] }).components;
const byId = (components: Component[], id: string) => components.find((component) => component.id === id)!;
const checkbox = (id: string): Component => ({ id, type: "input", name: id, props: { inputType: "checkbox", label: "Detay paneli" } });
const table = (props: Record<string, unknown>, id = "liste"): Component => ({ id, type: "dataTable", name: id, props: { title: "Liste", query: "q", ...props } });

describe("Detay paneli düğmesi (detailToggleInput)", () => {
  it("tasarımcı özelliği tanır", () => {
    expect(managedKeys.has("detailToggleInput")).toBe(true);
  });

  it("uzlaştırma geçerli bağı korur; olmayan, onay kutusu olmayan, form kartındaki ve ikinci listedeki girişi kaldırır", () => {
    const kept = reconcile([checkbox("detay"), table({ detailToggleInput: "detay" })]);
    expect(byId(kept, "liste").props.detailToggleInput).toBe("detay");
    expect(byId(reconcile([table({ detailToggleInput: "yok" })]), "liste").props).not.toHaveProperty("detailToggleInput");
    const text = { id: "ara", type: "input", name: "ara", props: { inputType: "text" } };
    expect(byId(reconcile([text, table({ detailToggleInput: "ara" })]), "liste").props).not.toHaveProperty("detailToggleInput");
    const card = { id: "kart", type: "formCard", name: "kart", props: { layout: "inline", inputs: ["detay"] } };
    expect(byId(reconcile([checkbox("detay"), card, table({ detailToggleInput: "detay" })]), "liste").props).not.toHaveProperty("detailToggleInput");
    const twice = reconcile([checkbox("detay"), table({ detailToggleInput: "detay" }), table({ detailToggleInput: "detay" }, "ikinci")]);
    expect(byId(twice, "liste").props.detailToggleInput).toBe("detay");
    expect(byId(twice, "ikinci").props).not.toHaveProperty("detailToggleInput");
    // Dar panel görünümlerinde (bars/list) araç çubuğu yoktur: bağ kalkar.
    expect(byId(reconcile([checkbox("detay"), table({ variant: "list", detailToggleInput: "detay" })]), "liste").props).not.toHaveProperty("detailToggleInput");
  });

  it("listenin aldığı giriş sekmeye ve pencereye alınmaz", () => {
    const tabs = { id: "sekmeler", type: "tabs", name: "sekmeler", props: { tabs: ["Genel=detay"] } };
    const dialog = { id: "pencere", type: "dialog", name: "pencere", props: { title: "Pencere", contains: ["detay"] } };
    const result = reconcile([checkbox("detay"), table({ detailToggleInput: "detay" }), tabs, dialog]);
    expect(byId(result, "sekmeler").props.tabs).toEqual(["Genel="]);
    expect(byId(result, "pencere").props.contains).toEqual([]);
    expect(byId(result, "liste").props.detailToggleInput).toBe("detay");
  });

  it("layoutRefs: bağlı giriş listeye aittir, sahiplenme adayı olmaz", () => {
    const components = [checkbox("detay"), checkbox("serbest"), table({ detailToggleInput: " detay " }), table({ variant: "bars", detailToggleInput: "serbest" }, "dar"),
      { id: "sekmeler", type: "tabs", props: { tabs: [] } }];
    expect([...tableDetailToggleIds(components)]).toEqual(["detay"]);
    const candidates = ownableCandidates(components, { id: "sekmeler", type: "tabs" }).map((component) => component.id);
    expect(candidates).not.toContain("detay");
    expect(candidates).toContain("serbest");
  });

  it("müfettiş alanı onay kutularını listeler; başka yere bağlı olanı seçtirmez", () => {
    const html = renderToString(<DetailToggleField value="detay" onChange={() => {}}
      inputs={[{ id: "detay", label: "Detay paneli" }, { id: "gecikmis", label: "Gecikmiş", takenBy: "Süzgeçler" }]} />);
    expect(html).toContain("Detay paneli düğmesi");
    expect(html).toMatch(/<option value="gecikmis" disabled="">Gecikmiş(<!-- -->)? \(Süzgeçler\)<\/option>/);
    expect(html).toMatch(/<option value="detay" selected="">Detay paneli<\/option>/);
    expect(renderToString(<DetailToggleField value="" inputs={[]} onChange={() => {}} />)).toContain("Önce sayfaya bir onay kutusu girişi ekleyin");
  });

  it("tuval önizlemesi düğmeyi Sütunlar'ın yanında çizer", () => {
    const preview = (label?: string) => renderToString(<GridPreview advanced title="Liste" subtitle="" columns={[{ code: "ad", label: "Ad" }]}
      rows={[{ ad: "A" }]} truncated={false} props={{}} emptyText="" style={{}} detailToggleLabel={label} />);
    const html = preview("Detay paneli");
    expect(html).toContain("pd-adv-toggle");
    expect(html.indexOf("Sütunlar")).toBeLessThan(html.indexOf("Detay paneli"));
    expect(html.indexOf("Detay paneli")).toBeLessThan(html.indexOf("kayıt"));
    expect(preview()).not.toContain("pd-adv-toggle");
  });
});
