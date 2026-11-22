import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordHeaderPreview, StepsPreview } from "./CanvasPreviews";
import { AssignmentsFields, BulkDeleteField, RowOpenActionField, StepsFields, bindsSelectedRow } from "./WizardFields";
import { ownableCandidates, rowActionIds } from "./layoutRefs";
import { refPlacementProblem } from "./refOwners";
import {
  activeStepIndex, assignmentsProblem, formatAssignment, freeHeaderLabel, headerFieldsPatch, renameHeaderField, parseAssignments, parseHeaderFields, parseSteps, prunedAssignments,
  recordHeaderProblem, stepsPatch, stepsProblem,
} from "./wizardParts";

describe("Adımlar", () => {
  const props = { steps: ["Stok seç", "Hareketler"], activeWhen: ["stokSecimi.value == null", "stokSecimi.value != null"] };
  it("etkin adım koşulu tutan son adımdır; hiçbiri tutmuyorsa 0", () => {
    expect(activeStepIndex(props.activeWhen, (condition) => condition.includes("!="))).toBe(1);
    expect(activeStepIndex(props.activeWhen, () => true)).toBe(1);
    expect(activeStepIndex(props.activeWhen, () => false)).toBe(0);
    expect(activeStepIndex(undefined, () => true)).toBe(0);
  });
  it("satırlar kayıt biçimine kayıpsız döner", () => {
    expect(stepsPatch(parseSteps(props))).toEqual(props);
    expect(parseSteps({ steps: ["A", "B"] })).toEqual([{ label: "A", when: "" }, { label: "B", when: "" }]);
  });
  it("kayıt sorunları: adım sayısı, etiket, koşul sayısı ve kökler", () => {
    expect(stepsProblem(props, "Adımlar", ["stokSecimi"])).toBeNull();
    expect(stepsProblem({ steps: ["Tek"], activeWhen: ["x == 1"] }, "Adımlar", ["x"])).toMatch(/2–6 adım/);
    expect(stepsProblem({ steps: ["A", "B"], activeWhen: ["x == 1"] }, "Adımlar", ["x"])).toMatch(/etkinlik koşulu/);
    expect(stepsProblem({ steps: ["A", "B"], activeWhen: ["x == 1", ""] }, "Adımlar", ["x"])).toMatch(/etkinlik koşulu/);
    expect(stepsProblem({ steps: ["A", "x".repeat(41)], activeWhen: ["x == 1", "x == 2"] }, "Adımlar", ["x"])).toMatch(/1–40/);
    expect(stepsProblem(props, "Adımlar", [])).toMatch(/olmayan bir ada/);
  });
  it("tuvalde ol/aria-current ile çizilir; öncekiler ✓", () => {
    const html = renderToString(<StepsPreview labels={props.steps} active={1} style={{}}/>);
    expect(html).toContain(`aria-label="Adımlar"`);
    expect(html).toMatch(/is-done.*✓/);
    expect(html).toMatch(/is-active" aria-current="step"/);
  });
  it("müfettiş satırları ve koşul uyarısı", () => {
    const html = renderToString(<StepsFields props={{ steps: ["A", "B"], activeWhen: ["", "secim.value != null"] }} pageNames={["secim"]} onPatch={() => {}}/>);
    expect(html).toContain("Koşul yazın.");
    expect(html).toContain("Adım ekle");
  });
});

describe("Alana değer ata", () => {
  it("ilk = işaretinden böler; boş şablon korunur", () => {
    const rows = parseAssignments(["stokSecimi={{stoklar.seciliSatir.balance.stockItemId}}", "stokSecimi=", "a=b=c", "bozuk"]);
    expect(rows).toEqual([
      { inputId: "stokSecimi", template: "{{stoklar.seciliSatir.balance.stockItemId}}" }, { inputId: "stokSecimi", template: "" }, { inputId: "a", template: "b=c" },
    ]);
    expect(rows.map(formatAssignment)).toEqual(["stokSecimi={{stoklar.seciliSatir.balance.stockItemId}}", "stokSecimi=", "a=b=c"]);
  });
  it("kayıt sorunları ve silinen girişin ataması", () => {
    const inputs = new Set(["stokSecimi"]);
    expect(assignmentsProblem(["stokSecimi="], inputs)).toBeNull();
    expect(assignmentsProblem([], inputs)).toMatch(/1–8/);
    expect(assignmentsProblem(Array.from({ length: 9 }, () => "stokSecimi="), inputs)).toMatch(/1–8/);
    expect(assignmentsProblem(["yok=1"], inputs)).toMatch(/sayfada yok: yok/);
    expect(assignmentsProblem(["=1"], inputs)).toMatch(/biçiminde/);
    expect(assignmentsProblem([`stokSecimi=${"x".repeat(501)}`], inputs)).toMatch(/500/);
    expect(prunedAssignments(["stokSecimi=", "yok=1"], inputs)).toEqual(["stokSecimi="]);
    expect(prunedAssignments(["stokSecimi="], inputs)).toBeNull();
  });
  it("müfettiş: giriş seçimi ve değer satırı", () => {
    const html = renderToString(<AssignmentsFields value={["stokSecimi="]} inputs={[{ id: "stokSecimi", label: "Seçili stok (gizli)" }]} suggestions={[]} onChange={() => {}}/>);
    expect(html).toContain("Seçili stok (gizli)");
    expect(html).toContain("Atama ekle");
  });
});

describe("Kayıt özeti", () => {
  const props = {
    fields: ["Mevcut={{stokOzeti.rows[0].balance.quantityOnHand}}", "Stok değeri={{stokOzeti.rows[0].balance.valuationAmountBase}}"],
    fieldFormats: ["Mevcut=number", "Stok değeri=money"],
    fieldUnits: ["Mevcut={{stokOzeti.rows[0].balance.unitCode}}", "Stok değeri={{stokOzeti.rows[0].balance.baseCurrencyCode}}"],
  };
  it("alanlar, biçimler ve birimler etiketle birleşir ve kayıpsız döner", () => {
    const rows = parseHeaderFields(props);
    expect(rows[0]).toEqual({ label: "Mevcut", template: "{{stokOzeti.rows[0].balance.quantityOnHand}}", format: "number", unit: "{{stokOzeti.rows[0].balance.unitCode}}" });
    expect(headerFieldsPatch(rows)).toEqual(props);
    // Etiket değişince biçim ve birim de yeni etikete taşınır; boş listeler yazılmaz.
    expect(headerFieldsPatch([{ ...rows[0], label: "Miktar" }])).toEqual({
      fields: ["Miktar={{stokOzeti.rows[0].balance.quantityOnHand}}"], fieldFormats: ["Miktar=number"], fieldUnits: ["Miktar={{stokOzeti.rows[0].balance.unitCode}}"],
    });
    expect(headerFieldsPatch([])).toEqual({ fields: undefined, fieldFormats: undefined, fieldUnits: undefined });
  });
  it("etiket değişikliği başka alanla çakışamaz; yeni alan boş etiket alır", () => {
    const rows = parseHeaderFields(props);
    // "Stok değeri" yazılırken ara değer "Stok" olabilir; tekil olduğu için kabul edilir, çakışan etiket reddedilir.
    expect(renameHeaderField(rows, 0, "Stok değeri")).toBeNull();
    expect(renameHeaderField(rows, 0, "  ")).toBeNull();
    expect(renameHeaderField(rows, 0, "a=b")).toBeNull();
    const renamed = renameHeaderField(rows, 1, " Değer ")!;
    expect(headerFieldsPatch(renamed).fieldFormats).toEqual(["Mevcut=number", "Değer=money"]);
    expect(freeHeaderLabel([{ label: "Alan 2", template: "", format: "", unit: "" }])).toBe("Alan 3");
    expect(freeHeaderLabel([{ label: "Alan 1", template: "", format: "", unit: "" }, { label: "Alan 3", template: "", format: "", unit: "" }])).toBe("Alan 4");
    expect(freeHeaderLabel([{ label: "X", template: "", format: "", unit: "" }])).toBe("Alan 2");
  });
  it("kayıt sorunları", () => {
    expect(recordHeaderProblem({ ...props, buttons: ["stokDegistir"] }, "Özet")).toBeNull();
    expect(recordHeaderProblem({ fields: Array.from({ length: 7 }, (_, index) => `A${index}=x`) }, "Özet")).toMatch(/en çok 6/);
    expect(recordHeaderProblem({ fields: ["A=1", "A=2"] }, "Özet")).toMatch(/tekil/);
    expect(recordHeaderProblem({ buttons: ["a", "b", "c", "d"] }, "Özet")).toMatch(/en çok 3/);
  });
  it("tuval önizlemesi: simge, başlık, alanlar ve boş değer", () => {
    const html = renderToString(<RecordHeaderPreview icon="box" title="TEST" subtitle="TEST · ana birim EA"
      fields={[{ label: "Mevcut", text: "1.100 EA" }, { label: "Stok değeri", text: "" }]} buttons={[]} style={{}}/>);
    expect(html).toContain("pd-record-header-icon");
    expect(html).toContain("1.100 EA");
    expect(html).toContain("—");
  });
});

describe("Sahiplik", () => {
  const components = [
    { id: "liste", type: "dataTable", props: { query: "q", rowOpenAction: "ac" } },
    { id: "ozet", type: "recordHeader", props: { buttons: ["degistir"] } },
    { id: "ac", type: "button", props: { actionType: "setInput" } },
    { id: "degistir", type: "button", props: { actionType: "setInput" } },
    { id: "serbest", type: "button", props: { actionType: "setInput" } },
    { id: "pencere", type: "dialog", props: { contains: [] } },
  ];
  it("satır açma ve özet düğmeleri sekme / pencere adayı olmaz ve pencereye alınamaz", () => {
    expect(ownableCandidates(components, { id: "pencere", type: "dialog" }).map((component) => component.id)).toEqual(["liste", "ozet", "serbest"]);
    expect(refPlacementProblem(components, "pencere", { id: "ac", type: "button" })).toMatch(/satır açma düğmesi/);
    expect(refPlacementProblem(components, "pencere", { id: "degistir", type: "button" })).toMatch(/kayıt özetinin düğmesi/);
    expect(refPlacementProblem(components, "pencere", { id: "serbest", type: "button" })).toBeNull();
  });
  it("satır açılınca düğmesi listeye aittir: tuvalde üst düzeyde çizilmez", () => {
    expect([...rowActionIds(components)]).toEqual(["ac"]);
    expect([...rowActionIds([{ id: "t", type: "dataTable", props: { rowActions: ["r"], rowOpenAction: "" } }])]).toEqual(["r"]);
  });
});

describe("Satır açılınca", () => {
  const table = { id: "stoklar", type: "dataTable", name: "stoklar", props: { query: "q", rowOpenAction: "git" } as Record<string, unknown> };
  const components = [table, { id: "git", type: "button", props: { text: "Git", actionType: "setInput" } }, { id: "akis", type: "button", props: { text: "Akış", actionType: "workflow" } }];
  it("yalnız uygun eylemli düğmeler listelenir; uygunsuz seçim uyarılır", () => {
    const html = renderToString(<RowOpenActionField table={table} components={components} labelOf={(component) => String(component.props.text)} onPatch={() => {}}/>);
    expect(html).toContain(">Git<");
    expect(html).not.toContain("Akış");
    const bad = renderToString(<RowOpenActionField table={{ ...table, props: { ...table.props, rowOpenAction: "akis" } }} components={components}
      labelOf={(component) => String(component.props.text)} onPatch={() => {}}/>);
    expect(bad).toContain("uygun değil");
    // Başka listenin satır işlemi olan düğme soluk (seçilemez) gösterilir.
    const owned = renderToString(<RowOpenActionField table={{ ...table, props: { query: "q" } }} labelOf={(component) => String(component.props.text ?? component.name)} onPatch={() => {}}
      components={[...components, { id: "diger", type: "dataTable", name: "diger", props: { rowActions: ["git"] } }]}/>);
    expect(owned).toMatch(/value="git" disabled="">Git(<!-- -->)* — diger · satır işlemi/);
  });
});

describe("Toplu silme", () => {
  const table = { id: "liste", type: "dataTable", name: "liste", props: { query: "q", bulkDeleteQuery: "sil" } as Record<string, unknown> };
  const rowBound = { id: "sil", name: "kartSil", kind: "delete", runOn: "manual", parameters: [{ name: "id", binding: "{{liste.seciliSatir.id}}" }] };
  const loose = { id: "sil", name: "kartSil", kind: "delete", runOn: "manual", parameters: [{ name: "id", binding: "{{kart.rows[0].id}}" }] };
  const update = { id: "guncelle", name: "kartGuncelle", kind: "update", runOn: "manual", parameters: [] };
  it("yalnız silme sorgularını listeler; seçili satıra bağlı olmayan sorgu uyarılır", () => {
    const html = renderToString(<BulkDeleteField table={table} queries={[rowBound, update]} onPatch={() => {}}/>);
    expect(html).toContain(">kartSil<");
    expect(html).not.toContain("kartGuncelle");
    expect(html).not.toContain("seçili satırına");
    const warned = renderToString(<BulkDeleteField table={table} queries={[loose]} onPatch={() => {}}/>);
    expect(warned).toContain("seçili satırına");
    const unnamed = renderToString(<BulkDeleteField table={{ ...table, name: undefined }} queries={[rowBound]} onPatch={() => {}}/>);
    expect(unnamed).toContain("listeye bir Ad verin");
    expect(bindsSelectedRow(rowBound, "liste")).toBe(true);
    expect(bindsSelectedRow(rowBound, "diger")).toBe(false);
    expect(bindsSelectedRow(loose, "liste")).toBe(false);
  });
});
