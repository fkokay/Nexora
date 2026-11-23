import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { designerInternals } from "../CustomPagesPage";
import { EditableGridFields } from "./EditableGridFields";
import { MAX_GRID_COLUMNS, gridColumnText, gridTotalCodes, parseGridColumn, parseGridColumns } from "./gridColumns";
import { calcColumnProblem } from "./gridRowSources";
import { GRID_ENGINE_PROPS, renamedEngineProps } from "./gridEngine";
import { MAX_QUERIES, type PageQuery } from "./QueriesPanel";
import { RunOnFields } from "./RunOnFields";
import { clampDebounce, runOnMode, runOnPatch, runOnProblem, runOnSummary } from "./queryRunOn";

// Satış belge kartlarının (Aşama B) gerektirdiği genel motor parçaları: listeli tablonun motoru (Satınalma Faz 2 ile ortak:
// fillQuery / fillColumns — "seçimSütunu@label" dahil — / skipWhenZero / lookupFills), önizleme sorgusu (runOn dizisi,
// runDebounceMs), hesaplanan sütun (calc:<sorgu>:<alan>) ve sınırlar (16 sütun, 40 sorgu).
type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
const queries = [
  { id: "kalemler", name: "kalemler", kind: "read", runOn: "load", parameters: [] },
  { id: "onizleme", name: "onizleme", kind: "read", runOn: ["satirlar", "musteri"], runDebounceMs: 300, parameters: [] },
  { id: "stoklar", name: "stoklar", kind: "read", runOn: "load", parameters: [] },
  { id: "kaydet", name: "kaydet", kind: "insert", runOn: "manual", parameters: [] },
];
const reconcile = (components: Component[], list = queries) => designerInternals.reconcileDefinition(
  { schemaVersion: 2, queries: structuredClone(list), components } as never, { catalog: { status: "loading" }, queryEditable: true }) as unknown as { queries: unknown[]; components: Component[] };
const gridColumns = ["stockItemId|Stok|lookup:stoklar:id:code:name|required", "unitCode|Birim|text", "quantity|Miktar|number|min:0", "unitPrice|Fiyat|number",
  "vatPercent|KDV %|number", "isGift|Hediye|checkbox", "lineTotal|Tutar|calc:onizleme:lineTotal"];
const gridProps = {
  gridMode: "list", gridColumns, maxRows: 200, fillQuery: "kalemler", fillColumns: { "stockItemId@label": "stockName", quantity: "remainingQuantity" },
  skipWhenZero: "quantity", lookupFills: { stockItemId: { unitCode: "unitCode", unitPrice: "salesListPrice", vatPercent: "salesVatPercent" } },
};
const grid = (props: Record<string, unknown> = gridProps): Component => ({ id: "g", type: "editableGrid", name: "satirlar", props: structuredClone(props) });
const musteri: Component = { id: "m", type: "input", name: "musteri", props: { inputType: "text" } };

describe("hesaplanan sütun (calc)", () => {
  it("calc:<sorgu>:<alan> okunur, aynı metne yazılır ve kural almaz", () => {
    const parsed = parseGridColumn("lineTotal|Tutar|calc:onizleme:lineTotal");
    expect(parsed.ok && parsed.column).toEqual({ code: "lineTotal", label: "Tutar", inputType: "calc",
      rules: { required: false, unique: false, upperCase: false, readOnly: false }, calc: { query: "onizleme", field: "lineTotal" } });
    if (parsed.ok) expect(gridColumnText(parsed.column)).toBe("lineTotal|Tutar|calc:onizleme:lineTotal");
    for (const text of ["a|A|calc", "a|A|calc:q", "a|A|calc:q:f:g", "a|A|calc:q q:f", "a|A|calc:q:1f", "a|A|calc:q:f|readOnly", "a|A|calc:q:f|"])
      expect(parseGridColumn(text).ok, text).toBe(false);
  });
  it("alt toplama girmez; sorgusu sayfadaki bir okuma sorgusu olmalı", () => {
    expect(gridTotalCodes({ gridColumns, totals: ["quantity", "lineTotal"] })).toEqual(["quantity"]);
    expect(calcColumnProblem({ gridColumns }, new Set(["onizleme"]))).toBeNull();
    expect(calcColumnProblem({ gridColumns }, new Set(["kalemler"]))).toContain("'lineTotal' hesaplanan sütununun sorgusu");
  });
  it("en fazla 16 sütun okunur", () => {
    expect(MAX_GRID_COLUMNS).toBe(16);
    expect(parseGridColumns(Array.from({ length: 20 }, (_, index) => `c${index}|C${index}|text`))).toHaveLength(16);
    expect(MAX_QUERIES).toBe(40);
  });
});

describe("kaynaktan doldurma, sıfır satırı atlama ve seçimle doldurma (ortak motor)", () => {
  it("tasarımcı özellikleri tanır; geçerli değerler uzlaştırmada değişmez", () => {
    for (const key of GRID_ENGINE_PROPS) expect(designerInternals.managedKeys.has(key), key).toBe(true);
    const reconciled = reconcile([grid(), musteri]);
    expect(reconciled.components[0].props).toEqual(gridProps);
    expect(reconciled.queries).toEqual(queries);
  });
  it("listeli olmayan kipte ve okuma olmayan doldurma sorgusunda ayarlar kalkar", () => {
    for (const gridMode of ["stage", "matrix"]) {
      const props = reconcile([grid({ ...gridProps, gridMode })]).components[0].props;
      expect(Object.keys(props).filter((key) => (GRID_ENGINE_PROPS as readonly string[]).includes(key)), gridMode).toEqual([]);
    }
    const noQuery = reconcile([grid({ ...gridProps, fillQuery: "kaydet" })]).components[0].props;
    expect(noQuery).not.toHaveProperty("fillQuery");
    expect(noQuery).not.toHaveProperty("fillColumns");
    expect(noQuery.lookupFills).toEqual(gridProps.lookupFills);
  });
  it("sorgu silinince doldurma sorgusu ve eşlemi birlikte kalkar", () => {
    const reconciled = reconcile([grid(), musteri], queries.filter((query) => query.id !== "kalemler"));
    expect(reconciled.components[0].props).not.toHaveProperty("fillQuery");
    expect(reconciled.components[0].props).not.toHaveProperty("fillColumns");
    expect(reconciled.components[0].props.lookupFills).toEqual(gridProps.lookupFills);
  });
  it("sütun yeniden adlanınca ayarlar ve @label eşlemi taşınır; seçimden çıkınca @label ve doldurma anahtarı kalkar", () => {
    expect(renamedEngineProps(gridProps, "quantity", "miktar", true, false)).toEqual({
      fillColumns: { "stockItemId@label": "stockName", miktar: "remainingQuantity" }, skipWhenZero: "miktar" });
    expect(renamedEngineProps(gridProps, "stockItemId", "stok", false, true)).toEqual({
      fillColumns: { "stok@label": "stockName", quantity: "remainingQuantity" },
      lookupFills: { stok: { unitCode: "unitCode", unitPrice: "salesListPrice", vatPercent: "salesVatPercent" } } });
    expect(renamedEngineProps(gridProps, "stockItemId", "stockItemId", false, false)).toEqual({
      fillColumns: { quantity: "remainingQuantity" }, lookupFills: undefined });
    expect(renamedEngineProps(gridProps, "unitCode", null).lookupFills).toEqual({ stockItemId: { unitPrice: "salesListPrice", vatPercent: "salesVatPercent" } });
    expect(renamedEngineProps(gridProps, "nothing", null)).toEqual({});
  });
  it("müfettiş: doldurma, görünen metin, atlama, seçimle doldurma ve hesaplanan sütun alanları çizilir; hesaplanan sütun hedef olmaz", () => {
    const html = renderToString(<EditableGridFields name="satirlar" props={gridProps} readQueries={queries.filter((query) => query.kind === "read")} sourceColumns={[]}
      listParameter={null} suggestions={[]} onPatch={() => {}} columnsOf={() => []}/>);
    for (const text of ["Sorgudan doldur", "Stok görünen metni", "Sıfırsa gönderme", "Stok seçilince doldur", "Önizleme sorgusu", "Sonuç alanı", "Hesaplanan (önizlemeden)"])
      expect(html, text).toContain(text);
    expect(html).not.toContain("lineTotal doldurma sütunu");
    expect(html).toContain("quantity doldurma sütunu");
    const stage = renderToString(<EditableGridFields name="satirlar" props={{ ...gridProps, gridMode: "stage" }} readQueries={[]} sourceColumns={[]}
      listParameter={null} suggestions={[]} onPatch={() => {}}/>);
    expect(stage).not.toContain("Sorgudan doldur");
    expect(stage).not.toContain("Sıfırsa gönderme");
  });
  it("liste parametresinin rowKey alanı sütun olarak sunulmaz; hesaplanan sütun eksik alan uyarısı vermez", () => {
    const listParameter = { query: "onizleme", spec: { name: "lines", in: "body" as const, type: "list", required: true, items: [
      { code: "stockItemId", label: "Stok", dataType: "guid", required: true }, { code: "rowKey", label: "Satır anahtarı", dataType: "text", required: false }] } };
    const html = renderToString(<EditableGridFields name="satirlar" props={{ gridMode: "list", gridColumns: ["stockItemId|Stok|text", "lineTotal|Tutar|calc:onizleme:lineTotal"] }}
      readQueries={queries} sourceColumns={[]} listParameter={listParameter} suggestions={[]} onPatch={() => {}}/>);
    expect(html).not.toContain("Satır anahtarı (rowKey)");
    expect(html).not.toContain("'lineTotal' sütunu");
  });
});

describe("önizleme sorgusu (runOn dizisi, runDebounceMs)", () => {
  it("kip, özet ve kip değişimi", () => {
    expect(runOnMode("load")).toBe("load");
    expect(runOnMode("manual")).toBe("manual");
    expect(runOnMode(["a"])).toBe("components");
    expect(runOnSummary(["satirlar", "musteri"])).toBe("Değişince: satirlar, musteri");
    expect(runOnPatch("components", ["satirlar"], "load")).toEqual({ runOn: ["satirlar"] });
    expect(runOnPatch("components", ["satirlar"], ["musteri"])).toEqual({ runOn: ["musteri"] });
    expect(runOnPatch("load", [], ["musteri"])).toEqual({ runOn: "load", runDebounceMs: undefined });
    expect(clampDebounce(50)).toBe(150);
    expect(clampDebounce(5000)).toBe(3000);
    expect(clampDebounce(undefined)).toBeUndefined();
  });
  it("sorunlar sunucu kuralıyla aynı", () => {
    const names = ["satirlar", "musteri"];
    expect(runOnProblem({ name: "o", kind: "read", runOn: ["satirlar"], runDebounceMs: 400 }, names)).toBeNull();
    expect(runOnProblem({ name: "o", kind: "read", runOn: "load" }, names)).toBeNull();
    expect(runOnProblem({ name: "o", kind: "insert", runOn: ["satirlar"] }, names)).toContain("yalnız okuma");
    expect(runOnProblem({ name: "o", kind: "read", runOn: [] }, names)).toContain("1–10 farklı");
    expect(runOnProblem({ name: "o", kind: "read", runOn: ["satirlar", "satirlar"] }, names)).toContain("1–10 farklı");
    expect(runOnProblem({ name: "o", kind: "read", runOn: ["yok"] }, names)).toBe("'o' sorgusu: runOn dizisindeki 'yok' sayfadaki bir giriş ya da düzenlenebilir tablo adı olmalıdır.");
    expect(runOnProblem({ name: "o", kind: "read", runOn: ["satirlar"], runDebounceMs: 100 }, names)).toContain("150–3000");
    expect(runOnProblem({ name: "o", kind: "read", runOn: "load", runDebounceMs: 400 }, names)).toContain("yalnız bileşen listeli");
  });
  it("uzlaştırma dizi runOn ve gecikmeyi korur", () => {
    expect(reconcile([grid(), musteri]).queries).toEqual(queries);
  });
  it("Çalışma alanı: kip seçici ve bileşen listesi", () => {
    const query: Pick<PageQuery, "name" | "runOn" | "runDebounceMs"> = { name: "onizleme", runOn: ["satirlar", "eski"], runDebounceMs: 300 };
    const components = [{ type: "editableGrid", name: "satirlar" }, { type: "input", name: "musteri" }, { type: "dataTable", name: "liste" }];
    const mode = renderToString(<RunOnFields part="mode" query={query} components={components} onUpdate={() => {}}/>);
    expect(mode).toContain("Açılışta + bileşen değişince (önizleme)");
    const names = renderToString(<RunOnFields part="names" query={query} components={components} onUpdate={() => {}}/>);
    expect(names).toContain("satirlar");
    expect(names).toContain("musteri");
    expect(names).not.toContain(">liste<");
    expect(names).toContain("Sayfada bu adla giriş ya da tablo yok: eski");
    expect(names).toContain('value="300"');
    expect(renderToString(<RunOnFields part="names" query={{ name: "q", runOn: "load" }} components={components} onUpdate={() => {}}/>)).toBe("");
  });
});
