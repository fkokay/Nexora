import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { designerInternals } from "../CustomPagesPage";
import { EditableGridFields } from "./EditableGridFields";
import { MAX_GRID_COLUMNS, gridColumnText, gridTotalCodes, parseGridColumn, parseGridColumns } from "./gridColumns";
import { cleanRowSources, calcColumnProblem, lookupFillEntries, parseLookupFillEntry, parseRowsMapEntry, renamedRowSources } from "./gridRowSources";
import { MAX_QUERIES, type PageQuery } from "./QueriesPanel";
import { RunOnFields } from "./RunOnFields";
import { clampDebounce, runOnMode, runOnPatch, runOnProblem, runOnSummary } from "./queryRunOn";

// Satış belge kartlarının (Aşama B) gerektirdiği genel motor parçaları: kaynaktan başlangıç satırları (initialRowsQuery /
// initialRowsMap), boş satırı atlama (skipRowsWhenEmpty), seçimin doldurması (lookupFill), önizleme sorgusu (runOn dizisi,
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
  gridMode: "list", gridColumns, maxRows: 200, initialRowsQuery: "kalemler", initialRowsMap: ["stockItemId=stockItemId", "quantity=remainingQuantity", "unitCode=unitCode"],
  skipRowsWhenEmpty: "quantity", lookupFill: ["stockItemId:unitCode=unitCode", "stockItemId:unitPrice=salesListPrice", "stockItemId:vatPercent=salesVatPercent"],
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

describe("başlangıç satırları, boş satır atlama ve seçim doldurması", () => {
  it("öğe biçimleri ilk ':' ve ilk '=' ile bölünür", () => {
    expect(parseRowsMapEntry("quantity=remainingQuantity")).toEqual({ cell: "quantity", field: "remainingQuantity" });
    expect(parseRowsMapEntry("x=balance.qty")).toEqual({ cell: "x", field: "balance.qty" });
    for (const bad of ["=x", "x=", "x=1a", 7]) expect(parseRowsMapEntry(bad), String(bad)).toBeNull();
    expect(parseLookupFillEntry("stockItemId:unitPrice=salesListPrice")).toEqual({ lookup: "stockItemId", target: "unitPrice", field: "salesListPrice" });
    for (const bad of ["a:a=x", ":b=x", "a:=x", "a:b=", "a=b:c", "ab"]) expect(parseLookupFillEntry(bad), bad).toBeNull();
  });
  it("tasarımcı özellikleri tanır; geçerli değerler uzlaştırmada değişmez", () => {
    for (const key of ["initialRowsQuery", "initialRowsMap", "skipRowsWhenEmpty", "lookupFill"]) expect(designerInternals.managedKeys.has(key), key).toBe(true);
    const reconciled = reconcile([grid(), musteri]);
    expect(reconciled.components[0].props).toEqual(gridProps);
    expect(reconciled.queries).toEqual(queries);
  });
  it("uymayan ayarlar kalkar: kip, okuma olmayan sorgu, hesaplanan / onay kutusu hedefleri, yinelenen öğeler", () => {
    const read = new Set(["kalemler", "onizleme", "stoklar"]);
    const stage = cleanRowSources({ ...gridProps, gridMode: "stage" }, read)!;
    expect(Object.keys(stage)).not.toContain("initialRowsQuery");
    expect(Object.keys(stage)).not.toContain("skipRowsWhenEmpty");
    expect(stage.lookupFill).toEqual(gridProps.lookupFill);
    const matrix = cleanRowSources({ ...gridProps, gridMode: "matrix" }, read)!;
    expect(Object.keys(matrix).filter((key) => ["initialRowsQuery", "initialRowsMap", "skipRowsWhenEmpty", "lookupFill"].includes(key))).toEqual([]);
    const noQuery = cleanRowSources({ ...gridProps, initialRowsQuery: "kaydet" }, read)!;
    expect(noQuery).not.toHaveProperty("initialRowsQuery");
    expect(noQuery).not.toHaveProperty("initialRowsMap");
    const bad = cleanRowSources({ ...gridProps, initialRowsMap: ["lineTotal=lineTotal", "quantity=a", "quantity=b", "yok=x"], skipRowsWhenEmpty: "isGift",
      lookupFill: ["unitCode:unitPrice=x", "stockItemId:lineTotal=x", "stockItemId:unitCode=a", "stockItemId:unitCode=b"] }, read)!;
    expect(bad.initialRowsMap).toEqual(["quantity=a"]);
    expect(bad).not.toHaveProperty("skipRowsWhenEmpty");
    expect(bad.lookupFill).toEqual(["stockItemId:unitCode=a"]);
    expect(cleanRowSources(gridProps, read)).toBeNull();
  });
  it("initialRowsMap seçim sütununun @label eşlemini korur, seçim olmayan sütunda düşürür", () => {
    const labeled = cleanRowSources({ ...gridProps, initialRowsMap: ["stockItemId@label=stockName", "quantity@label=x"] }, new Set(["kalemler", "onizleme", "stoklar"]))!;
    expect(labeled.initialRowsMap).toEqual(["stockItemId@label=stockName"]);
  });
  it("sorgu silinince başlangıç sorgusu ve eşlemi birlikte kalkar", () => {
    const reconciled = reconcile([grid(), musteri], queries.filter((query) => query.id !== "kalemler"));
    expect(reconciled.components[0].props).not.toHaveProperty("initialRowsQuery");
    expect(reconciled.components[0].props).not.toHaveProperty("initialRowsMap");
    expect(reconciled.components[0].props.lookupFill).toEqual(gridProps.lookupFill);
  });
  it("sütun yeniden adlanınca üç ayar taşınır; silinince ya da seçimden çıkınca kalkar", () => {
    expect(renamedRowSources(gridProps, "quantity", "miktar", false)).toEqual({ initialRowsMap: ["stockItemId=stockItemId", "miktar=remainingQuantity", "unitCode=unitCode"], skipRowsWhenEmpty: "miktar" });
    expect(renamedRowSources(gridProps, "unitCode", null, false)).toEqual({ initialRowsMap: ["stockItemId=stockItemId", "quantity=remainingQuantity"],
      lookupFill: ["stockItemId:unitPrice=salesListPrice", "stockItemId:vatPercent=salesVatPercent"] });
    expect(renamedRowSources(gridProps, "stockItemId", "stok", true).lookupFill).toEqual(["stok:unitCode=unitCode", "stok:unitPrice=salesListPrice", "stok:vatPercent=salesVatPercent"]);
    expect(renamedRowSources(gridProps, "stockItemId", "stockItemId", false).lookupFill).toBeUndefined();
    expect(renamedRowSources(gridProps, "nothing", null, false)).toEqual({});
    expect(lookupFillEntries(["a:b=c", "bozuk"])).toEqual([{ lookup: "a", target: "b", field: "c" }]);
  });
  it("müfettiş: başlangıç satırları, atlama, doldurma ve hesaplanan sütun alanları çizilir", () => {
    const html = renderToString(<EditableGridFields name="satirlar" props={gridProps} readQueries={queries.filter((query) => query.kind === "read")} sourceColumns={[]}
      listParameter={null} suggestions={[]} onPatch={() => {}} columnsOf={() => []}/>);
    for (const text of ["Başlangıç satırları", "Boş satırı atla", "Seçilince doldur", "Önizleme sorgusu", "Sonuç alanı", "Hesaplanan (önizlemeden)"]) expect(html, text).toContain(text);
    expect(html).toContain("remainingQuantity");
    expect(html).toContain("salesListPrice");
    const stage = renderToString(<EditableGridFields name="satirlar" props={{ ...gridProps, gridMode: "stage" }} readQueries={[]} sourceColumns={[]}
      listParameter={null} suggestions={[]} onPatch={() => {}}/>);
    expect(stage).not.toContain("Başlangıç satırları");
    expect(stage).not.toContain("Boş satırı atla");
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
