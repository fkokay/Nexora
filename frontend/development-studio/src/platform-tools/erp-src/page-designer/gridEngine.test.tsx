import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { designerInternals, designerPersistence } from "../CustomPagesPage";
import { EditableGridFields } from "./EditableGridFields";
import { GRID_ENGINE_PROPS, formulaCodes, formulaProblem, lockRuleProblem, lookupFillsOf, renamedEngineProps, stringMap } from "./gridEngine";
import { formulaOrder, parseFormula } from "./gridFormula";
import vectorsJson from "../../../../../erp-web/src/custom-page/gridFormula.vectors.json?raw";

// Listeli düzenlenebilir tablonun motor ekleri (fillQuery, fillColumns, skipWhenZero, lookupFills, formulas): tasarımcıda tanınır,
// uzlaştırmadan kayıpsız geçer, sütun yeniden adlanınca / silinince izlenir ve formül ayrıştırıcısı erp-web ile aynı vektörleri geçer.

const vectors = JSON.parse(vectorsJson) as { columns: string[]; valid: { text: string; refs: string[] }[]; invalid: string[]; graphs: { refs: Record<string, string[]>; order: string[]; cyclic: string[] }[] };
const { reconcileDefinition, managedKeys } = designerInternals;

const gridProps = {
  title: "Kalemler", gridMode: "list", minRows: 1, totals: ["lineNet", "lineVat"],
  gridColumns: ["lineNumber|Satır|number|readOnly", "stockItemId|Stok|lookup:qs:id:code:name|required", "quantity|Miktar|number|min:0",
    "unitPrice|Fiyat|number", "lineNet|Net|number", "lineVat|KDV|number", "note|Not|text"],
  fillQuery: "qk", fillColumns: { quantity: "remainingQuantity" }, skipWhenZero: "quantity", rowNumberColumn: "lineNumber",
  lookupFills: { stockItemId: { unitPrice: "purchasePrice", note: "unit.code" } },
  formulas: { lineNet: "quantity * unitPrice", lineVat: "quantity * unitPrice * 20 / 100" },
  lockColumnsWhen: ["unitPrice,lineVat=satir.lineNumber > 1"],
};
const queries = [
  { id: "qk", name: "kalanlar", kind: "read", runOn: "load", parameters: [] },
  { id: "qs", name: "stoklar", kind: "read", runOn: "load", parameters: [] },
  { id: "qy", name: "kaydet", kind: "insert", runOn: "manual", parameters: [{ name: "lines", binding: "{{g.satirlar}}", type: "list" }] },
];
/** renderToString kesme işaretini &#x27; olarak yazar. */
const unescape = (html: string) => html.replace(/&#x27;/g, "'");
type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
const reconcile = (props: Record<string, unknown>, queryList: unknown[] = queries) => {
  const definition = reconcileDefinition({ schemaVersion: 2, queries: queryList, components: [{ id: "g", type: "editableGrid", name: "g", props: structuredClone(props) }] } as never,
    { catalog: { status: "loading" }, queryEditable: false });
  return (definition.components as Component[])[0].props;
};

describe("ızgara motor ekleri tasarımcıda", () => {
  it("bütün özellikler yönetilir (ham metin alanı yok)", () => {
    for (const key of GRID_ENGINE_PROPS) expect(managedKeys.has(key), key).toBe(true);
    for (const key of Object.keys(gridProps)) expect(managedKeys.has(key), key).toBe(true);
  });

  it("uzlaştırma listeli tablonun nesne değerli özelliklerini değiştirmeden korur (gidiş-dönüş)", () => {
    const after = reconcile(gridProps);
    expect(after).toEqual(gridProps);
    expect(JSON.parse(JSON.stringify(after))).toEqual(gridProps);
  });

  it("yükle → uzlaştır → kaydet gidiş-dönüşü beş özelliği ve nesne değerlerini bayt bayt korur", () => {
    const stored = JSON.stringify({ schemaVersion: 2, queries, components: [{ id: "g", type: "editableGrid", name: "g", props: gridProps }] });
    const loaded = designerPersistence.normalizeDefinition(JSON.parse(stored));
    const reconciled = reconcileDefinition(loaded, { catalog: { status: "loading" }, queryEditable: false });
    const wire = designerPersistence.wireDefinition(reconciled, { status: "loading" });
    const saved = JSON.parse(JSON.stringify(wire)) as { components: Component[] };
    expect(saved.components[0].props).toEqual(gridProps);
    for (const key of GRID_ENGINE_PROPS) expect(JSON.stringify(saved.components[0].props[key]), key).toBe(JSON.stringify((gridProps as Record<string, unknown>)[key]));
  });

  it("stage / matrix kipinde motor ekleri ve okuma sorgusu olmayan doldurma sorgusu düşer", () => {
    const stage = reconcile({ ...gridProps, gridMode: "stage", sourceQuery: "qk" });
    for (const key of GRID_ENGINE_PROPS) expect(stage, key).not.toHaveProperty(key);
    const matrix = reconcile({ gridMode: "matrix", matrixCode: "{{a.value}}", matrixName: "{{b.value}}", formulas: { x: "1" }, skipWhenZero: "x" });
    expect(matrix).not.toHaveProperty("formulas");
    expect(matrix).not.toHaveProperty("skipWhenZero");
    const write = reconcile({ ...gridProps, fillQuery: "qy" });
    expect(write).not.toHaveProperty("fillQuery");
    expect(write).not.toHaveProperty("fillColumns");
    expect(write.formulas).toEqual(gridProps.formulas);
  });

  it("müfettiş listeli kipte doldurma, seçimle doldurma ve formül alanlarını gösterir; formül sütunu için öğe uyarısı yoktur", () => {
    const html = unescape(renderToString(<EditableGridFields name="g" props={gridProps} readQueries={[{ id: "qk", name: "kalanlar" }, { id: "qs", name: "stoklar" }]}
      sourceColumns={[]} suggestions={[]} onPatch={() => undefined}
      columnsOf={(id) => (id === "qk" ? ["lineNumber", "stockItemId", "remainingQuantity", "unitPrice"] : ["id", "code", "name", "purchasePrice", "unit.code"]).map((code) => ({ code }))}
      listParameter={{ query: "qy", spec: { name: "lines", in: "body", type: "list", required: false,
        items: ["lineNumber", "stockItemId", "quantity", "unitPrice", "lineNet", "note"].map((code) => ({ code, label: code, dataType: "decimal", required: false })) } }}/>));
    expect(html).toContain("Sorgudan doldur");
    expect(html).toContain('aria-label="quantity doldurma sütunu"');
    expect(html).toContain("Sıfırsa gönderme");
    expect(html).toContain("Stok seçilince doldur");
    expect(html).toContain('aria-label="stockItemId → unitPrice seçenek sütunu"');
    expect(html).toContain('value="quantity * unitPrice"');
    expect(html).not.toContain("'lineVat' sütunu");
    expect(html).toContain("Satır koşuluyla kilitle");
    expect(html).toContain('value="unitPrice,lineVat=satir.lineNumber &gt; 1"');
    expect(html).toContain('aria-label="Yeni kilit kuralı"');
    // Salt okunur gösterim sütunu (stockName) liste öğesi olmadan uyarı vermez; salt okunur olmayan (extra) verir.
    const display = unescape(renderToString(<EditableGridFields name="g" props={{ ...gridProps, gridColumns: [...gridProps.gridColumns, "stockName|Stok adı|text|readOnly", "extra|Ek|text"] }}
      readQueries={[]} sourceColumns={[]} suggestions={[]} onPatch={() => undefined}
      listParameter={{ query: "qy", spec: { name: "lines", in: "body", type: "list", required: false,
        items: ["lineNumber", "stockItemId", "quantity", "unitPrice", "lineNet", "note"].map((code) => ({ code, label: code, dataType: "decimal", required: false })) } }}/>));
    expect(display).not.toContain("'stockName' sütunu");
    expect(display).toContain("'extra' sütunu");
    const stage = renderToString(<EditableGridFields name="g" props={{ ...gridProps, gridMode: "stage" }} readQueries={[]} sourceColumns={[]} suggestions={[]}
      onPatch={() => undefined} listParameter={null}/>);
    expect(stage).not.toContain("Sorgudan doldur");
  });
});

describe("renamedEngineProps", () => {
  it("sütun yeniden adlanınca eşlemler, skipWhenZero ve formül metinleri izler", () => {
    expect(renamedEngineProps(gridProps, "quantity", "qty", true, false)).toEqual({
      fillColumns: { qty: "remainingQuantity" }, skipWhenZero: "qty",
      formulas: { lineNet: "qty * unitPrice", lineVat: "qty * unitPrice * 20 / 100" },
    });
    expect(renamedEngineProps(gridProps, "stockItemId", "stok", false, true)).toEqual({ lookupFills: { stok: { unitPrice: "purchasePrice", note: "unit.code" } } });
    expect(renamedEngineProps(gridProps, "note", "aciklama", false, false)).toEqual({ lookupFills: { stockItemId: { unitPrice: "purchasePrice", aciklama: "unit.code" } } });
  });

  it("sütun silinince ya da türü değişince girdiler kalkar; başvurulan formül metni korunur", () => {
    expect(renamedEngineProps(gridProps, "lineNet", null)).toEqual({ formulas: { lineVat: "quantity * unitPrice * 20 / 100" } });
    expect(renamedEngineProps(gridProps, "quantity", "quantity", false, false)).toEqual({
      fillColumns: { quantity: "remainingQuantity" }, skipWhenZero: undefined, formulas: gridProps.formulas,
    });
    expect(renamedEngineProps(gridProps, "stockItemId", null)).toEqual({ lookupFills: undefined });
    expect(renamedEngineProps(gridProps, "unitPrice", null).lookupFills).toEqual({ stockItemId: { note: "unit.code" } });
    expect(renamedEngineProps({ gridColumns: [] }, "x", null)).toEqual({});
    expect(renamedEngineProps({ rowNumberColumn: "lineNumber" }, "lineNumber", "sira", true, false)).toEqual({ rowNumberColumn: "sira" });
    expect(renamedEngineProps({ rowNumberColumn: "lineNumber" }, "lineNumber", null)).toEqual({ rowNumberColumn: undefined });
  });
});

describe("lockColumnsWhen", () => {
  const lockProps = { gridColumns: ["quantity|Miktar|number", "isFreeOfCharge|Bedelsiz|checkbox", "unitPrice|Fiyat|number", "vatPercent|KDV|number",
    "lineTotal|Tutar|calc:q:lineTotal", "attributes.renk|Renk|text"], skipWhenZero: "quantity",
    lockColumnsWhen: ["unitPrice,vatPercent=satir.isFreeOfCharge == true", "attributes.renk=satir.isFreeOfCharge == true && satir.unitPrice == 'satir.isFreeOfCharge'"] };

  it("sütun yeniden adlanınca kural sütunları ve koşuldaki satir yolu izler (tırnaklı metin değişmez); silinince sütun kalkar", () => {
    expect(renamedEngineProps(lockProps, "isFreeOfCharge", "bedelsiz", false, false)).toEqual({ lockColumnsWhen: [
      "unitPrice,vatPercent=satir.bedelsiz == true", "attributes.renk=satir.bedelsiz == true && satir.unitPrice == 'satir.isFreeOfCharge'"] });
    expect(renamedEngineProps(lockProps, "unitPrice", "fiyat")).toEqual({ lockColumnsWhen: [
      "fiyat,vatPercent=satir.isFreeOfCharge == true", "attributes.renk=satir.isFreeOfCharge == true && satir.fiyat == 'satir.isFreeOfCharge'"] });
    expect(renamedEngineProps(lockProps, "attributes.renk", null)).toEqual({ lockColumnsWhen: ["unitPrice,vatPercent=satir.isFreeOfCharge == true"] });
    expect(renamedEngineProps({ lockColumnsWhen: ["unitPrice=satir.x == 1"] }, "unitPrice", null)).toEqual({ lockColumnsWhen: undefined });
    // Silinen sütuna başvuran koşul korunur (sorun müfettişte görünür).
    expect(renamedEngineProps(lockProps, "isFreeOfCharge", null)).toEqual({});
    expect(renamedEngineProps(lockProps, "quantity", "miktar", true, false).lockColumnsWhen).toBeUndefined();
  });

  it("kural sorunları sunucu kurallarını izler", () => {
    for (const text of lockProps.lockColumnsWhen) expect(lockRuleProblem(lockProps, text), text).toBeNull();
    expect(lockRuleProblem(lockProps, "unitPrice")).toContain("biçiminde");
    expect(lockRuleProblem(lockProps, "unitPrice,unitPrice=satir.isFreeOfCharge == true")).toContain("farklı sütun");
    expect(lockRuleProblem(lockProps, "fiyat=satir.isFreeOfCharge == true")).toContain("ızgarada yok: fiyat");
    expect(lockRuleProblem(lockProps, "lineTotal=satir.isFreeOfCharge == true")).toContain("hesaplanan (calc) sütunu kilitleyemez");
    expect(lockRuleProblem(lockProps, "quantity=satir.isFreeOfCharge == true")).toContain("'skipWhenZero' sütununu kilitleyemez");
    expect(lockRuleProblem(lockProps, "unitPrice=satir.isFreeOfCharge ==")).toContain("koşulu geçersiz");
    expect(lockRuleProblem(lockProps, "unitPrice=siparis.value == null")).toContain("başvurabilir: siparis");
    expect(lockRuleProblem(lockProps, "unitPrice=satir.bedelsiz == true")).toContain("olmayan bir sütuna başvuruyor: bedelsiz");
    expect(lockRuleProblem(lockProps, "unitPrice,isFreeOfCharge=satir.isFreeOfCharge == true")).toContain("kilitlediği sütuna başvuramaz");
  });
});

describe("yardımcılar", () => {
  it("eşlemleri güvenle okur ve formül sorununu bildirir", () => {
    expect(stringMap({ a: "1", b: 2, __proto__: "x" })).toEqual({ a: "1" });
    expect(stringMap(["a=1"])).toEqual({});
    expect(lookupFillsOf({ s: { a: "b", c: 1 } })).toEqual({ s: { a: "b" } });
    expect([...formulaCodes(gridProps)]).toEqual(["lineNet", "lineVat"]);
    expect(formulaProblem(gridProps, "lineNet", "quantity * unitPrice")).toBeNull();
    // Başka formüle başvuru geçerli; kendine başvuru ve döngü değil.
    expect(formulaProblem(gridProps, "lineVat", "lineNet * 0.2")).toBeNull();
    expect(formulaProblem(gridProps, "lineNet", "lineNet + 1")).toContain("'lineNet'");
    expect(formulaProblem({ ...gridProps, formulas: { ...gridProps.formulas, lineVat: "lineNet * 0.2" } }, "lineNet", "lineVat * 5")).toContain("döngü");
    expect(formulaProblem({ ...gridProps, rowNumberColumn: "lineNumber" }, "lineNet", "lineNumber * 2")).toContain("'lineNumber'");
  });

  it("Studio formül ayrıştırıcısı erp-web vektörlerini geçer", () => {
    const columns = new Set(vectors.columns);
    for (const vector of vectors.valid) {
      const parsed = parseFormula(vector.text, columns);
      expect(parsed.ok && parsed.refs, vector.text).toEqual(vector.refs);
    }
    for (const text of vectors.invalid) expect(parseFormula(text, columns).ok, text).toBe(false);
    for (const graph of vectors.graphs) expect(formulaOrder(graph.refs), JSON.stringify(graph.refs)).toEqual({ order: graph.order, cyclic: graph.cyclic });
  });
});
