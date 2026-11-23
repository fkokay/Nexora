import { describe, expect, it } from "vitest";
import { countedGridState, EMPTY_GRID_ENGINE, filledGridState, fillCells, gridEngineReducer, isSkippedRow, lookupFillCells, parseGridEngine, withFormulaColumns } from "./gridFill";
import { emptyGridState, gridScope, parseGridColumns, validateGrid, type GridState } from "./gridState";

const raw = parseGridColumns([
  "stockItemId|Stok|lookup:stoklar:id:code:name|required",
  "unitCode|Birim|text|required",
  "quantity|Miktar|number|min:0",
  "unitPrice|Fiyat|number",
  "vatRate|KDV %|number",
  "lineNet|Net|number",
  "lineVat|KDV|number",
  "receivedOn|Tarih|date",
  "urgent|Acil|checkbox",
]);
const props = {
  fillQuery: "kalanlar",
  fillColumns: { quantity: "remainingQuantity", unitCode: "unit.code", bilinmeyen: "x" },
  skipWhenZero: "quantity",
  lookupFills: { stockItemId: { unitCode: "unitCode", unitPrice: "purchasePrice", vatRate: "vatRate", yok: "x" }, unitCode: { quantity: "x" } },
  formulas: { lineNet: "quantity * unitPrice", lineVat: "lineNet * vatRate / 100", unitCode: "1" },
};
const engine = parseGridEngine(props, raw, "list");
const columns = withFormulaColumns(raw, engine);
const opts = { mode: "list" as const, maxRows: 50 };

describe("parseGridEngine", () => {
  it("yalnız list kipinde okunur; tabloda olmayan hedefler, seçim olmayan anahtarlar ve geçersiz formüller atlanır", () => {
    expect(parseGridEngine(props, raw, "stage")).toBe(EMPTY_GRID_ENGINE);
    expect(parseGridEngine(props, raw, "matrix")).toBe(EMPTY_GRID_ENGINE);
    expect(engine.fillQuery).toBe("kalanlar");
    expect(engine.fillColumns).toEqual({ quantity: "remainingQuantity", unitCode: "unit.code" });
    expect(engine.skipWhenZero).toBe("quantity");
    expect(engine.lookupFills).toEqual({ stockItemId: { unitCode: "unitCode", unitPrice: "purchasePrice", vatRate: "vatRate" } });
    // lineVat formül sütununa (lineNet) başvurur: geçerli, ondan sonra hesaplanır; unitCode sayı sütunu değil.
    expect(engine.formulas.map((formula) => formula.code)).toEqual(["lineNet", "lineVat"]);
    // Döngü ve kendine başvuru atlanır; bağımlılık sırası yazım sırasından bağımsızdır.
    expect(parseGridEngine({ formulas: { lineVat: "lineNet + 1", lineNet: "lineVat + 1", unitPrice: "unitPrice * 2" } }, raw, "list").formulas).toEqual([]);
    expect(parseGridEngine({ formulas: { lineVat: "lineNet * 2", lineNet: "quantity" } }, raw, "list").formulas.map((formula) => formula.code)).toEqual(["lineNet", "lineVat"]);
    expect(parseGridEngine({ skipWhenZero: "unitCode" }, raw, "list").skipWhenZero).toBe("");
  });

  it("formül sütunu salt okunur olur", () => {
    expect(columns.find((column) => column.code === "lineNet")!.rules.readOnly).toBe(true);
    expect(columns.find((column) => column.code === "quantity")!.rules.readOnly).toBe(false);
  });
});

describe("sorgudan doldurma", () => {
  const rows = [
    { id: "L1", stockItemId: "S1", "unit.code": "ADET", remainingQuantity: 4, unitPrice: 12.5, vatRate: 20, receivedOn: "2026-11-20T00:00:00", urgent: true, lineNet: 999 },
    { id: "L2", stockItemId: "S2", unit: { code: "KG" }, remainingQuantity: 0, unitPrice: null, quantity: 7 },
  ];

  it("eşlenen ve aynı kodlu sütunlar kopyalanır; tarih, onay kutusu, iç içe yol ve null değer dönüştürülür; formül hesaplanır", () => {
    expect(fillCells(columns, engine, rows[0])).toEqual({ stockItemId: "S1", unitCode: "ADET", quantity: "4", unitPrice: "12.5", vatRate: "20", receivedOn: "2026-11-20", urgent: true });
    const state = filledGridState(columns, engine, "K1", rows);
    expect(state.fillKey).toBe("K1");
    expect(state.rows.map((draft) => draft.key)).toEqual(["dolu-1", "dolu-2"]);
    expect(state.rows[0].cells.lineNet).toBe("50");
    expect(state.rows[0].cells.lineVat).toBe("10");
    expect(state.rows[1].cells).toEqual({ stockItemId: "S2", unitCode: "KG", quantity: "0", lineNet: "0", lineVat: "0" });
    expect(filledGridState(columns, engine, "K2", []).rows).toEqual([]);
  });

  it("doldurulan satırlar düzenlenir, eklenir ve silinir; reset doldurma anahtarını atar", () => {
    let state: GridState = filledGridState(columns, engine, "K1", rows);
    state = gridEngineReducer(state, { type: "edit", key: "dolu-1", code: "quantity", value: "2" }, opts, engine);
    expect(state.rows[0].cells.lineNet).toBe("25");
    expect(state.fillKey).toBe("K1");
    state = gridEngineReducer(state, { type: "add" }, opts, engine);
    expect(state.rows).toHaveLength(3);
    expect(state.rows[2]).toEqual({ key: "yeni-1", cells: { lineNet: "0", lineVat: "0" } });
    state = gridEngineReducer(state, { type: "remove", key: "dolu-2" }, opts, engine);
    expect(state.rows.map((draft) => draft.key)).toEqual(["dolu-1", "yeni-1"]);
    const reset = gridEngineReducer(state, { type: "reset", sourceKey: null }, opts, engine);
    expect(reset.rows).toEqual([]);
    expect("fillKey" in reset).toBe(false);
  });

  it("değişmeyen eylem aynı durumu döndürür", () => {
    const state = filledGridState(columns, engine, "K1", rows);
    expect(gridEngineReducer(state, { type: "undoRemove", key: "x" }, opts, engine)).toBe(state);
  });

  it("skipWhenZero: boş ya da 0 satır satirlar, satirSayisi, doğrulama ve minRows dışında kalır", () => {
    let state = filledGridState(columns, engine, "K1", rows);
    state = gridEngineReducer(state, { type: "add" }, opts, engine);
    expect(state.rows.map((draft) => isSkippedRow(engine, draft))).toEqual([false, true, true]);
    const counted = countedGridState(engine, state);
    const view = gridScope("list", columns, counted, [], "id");
    expect(view.satirSayisi).toBe(1);
    expect(view.satirlar).toEqual([{ stockItemId: "S1", unitCode: "ADET", quantity: 4, unitPrice: 12.5, vatRate: 20, lineNet: 50, lineVat: 10, receivedOn: "2026-11-20", urgent: true }]);
    // Atlanan yeni satırın zorunlu Stok/Birim hücreleri doğrulanmaz; minRows yalnız sayılan satırlara bakar.
    expect(validateGrid("list", columns, counted, [], "id", 50, undefined, 1)).toEqual({});
    expect(validateGrid("list", columns, counted, [], "id", 50, undefined, 2)).toEqual({ "": { "": "En az 2 kalem girin." } });
    expect(Object.keys(validateGrid("list", columns, state, [], "id"))).toContain("yeni-1");
    // Atlanacak satır yoksa aynı durum döner; skipWhenZero yoksa hiçbir satır atlanmaz.
    const kept = countedGridState(engine, counted);
    expect(kept).toBe(counted);
    expect(countedGridState({ ...engine, skipWhenZero: "" }, state)).toBe(state);
  });
});

describe("seçimle doldurma (lookupFills)", () => {
  const option = { id: "S9", code: "KLM", unitCode: "KUTU", purchasePrice: 3.25, vatRate: null };

  it("seçenek satırının değerleri aynı satırın hücrelerine yazılır; boş değer hücreyi boşaltır", () => {
    expect(lookupFillCells(columns, engine, "stockItemId", option)).toEqual({ unitCode: "KUTU", unitPrice: "3.25", vatRate: "" });
    expect(lookupFillCells(columns, engine, "stockItemId", null)).toEqual({});
    expect(lookupFillCells(columns, engine, "unitCode", option)).toEqual({});
  });

  it("pick eylemi seçimi ve doldurmayı tek adımda yazar, hedeflerin seçim etiketlerini atar ve formülü yeniden hesaplar", () => {
    let state: GridState = gridEngineReducer(emptyGridState(), { type: "add" }, opts, engine);
    state = gridEngineReducer(state, { type: "edit", key: "yeni-1", code: "quantity", value: "4" }, opts, engine);
    state = { ...state, rows: [{ ...state.rows[0], labels: { unitCode: "Eski birim" } }] };
    state = gridEngineReducer(state, { type: "pick", key: "yeni-1", code: "stockItemId", value: "S9", label: "KLM", fills: lookupFillCells(columns, engine, "stockItemId", option) }, opts, engine);
    expect(state.rows[0]).toEqual({ key: "yeni-1", labels: { stockItemId: "KLM" },
      cells: { quantity: "4", stockItemId: "S9", unitCode: "KUTU", unitPrice: "3.25", vatRate: "", lineNet: "13", lineVat: "0" } });
  });
});

describe("formül zinciri ve rowNumberColumn", () => {
  const chain = parseGridColumns(["lineNumber|Sıra|number|readOnly", "quantity|Miktar|number", "unitPrice|Fiyat|number", "vatRate|KDV %|number",
    "net|Net|number", "vat|KDV|number", "total|Toplam|number"]);
  const chainEngine = parseGridEngine({ rowNumberColumn: "lineNumber", skipWhenZero: "quantity",
    formulas: { total: "net + vat", vat: "net * vatRate / 100", net: "quantity * unitPrice" } }, chain, "list");
  const chainColumns = withFormulaColumns(chain, chainEngine);

  it("ara sonuçlar yuvarlanıp sonraki formüle girer; toplam yuvarlanmış parçaların toplamıdır", () => {
    let state = gridEngineReducer(emptyGridState(), { type: "add" }, opts, chainEngine);
    state = gridEngineReducer(state, { type: "edit", key: "yeni-1", code: "quantity", value: "1" }, opts, chainEngine);
    state = gridEngineReducer(state, { type: "edit", key: "yeni-1", code: "unitPrice", value: "0.125" }, opts, chainEngine);
    state = gridEngineReducer(state, { type: "edit", key: "yeni-1", code: "vatRate", value: "20" }, opts, chainEngine);
    // net = 0.125 → 0.13; vat = 0.13 * 0.2 = 0.026 → 0.03; total = 0.16 (yuvarlanmamış zincirde 0.125 + 0.025 = 0.15 olurdu).
    expect(state.rows[0].cells).toMatchObject({ net: "0.13", vat: "0.03", total: "0.16" });
  });

  it("sıra numarası gönderilen satırlara görüntü sırasıyla 1..n verilir; atlanan satır numarasızdır ve sütun salt okunurdur", () => {
    expect(chainColumns[0].rules.readOnly).toBe(true);
    let state = emptyGridState();
    for (let i = 0; i < 3; i++) state = gridEngineReducer(state, { type: "add" }, opts, chainEngine);
    state = gridEngineReducer(state, { type: "edit", key: "yeni-1", code: "quantity", value: "1" }, opts, chainEngine);
    state = gridEngineReducer(state, { type: "edit", key: "yeni-3", code: "quantity", value: "2" }, opts, chainEngine);
    expect(state.rows.map((draft) => draft.cells.lineNumber)).toEqual(["1", undefined, "2"]);
    const wire = gridScope("list", chainColumns, countedGridState(chainEngine, state), [], "id").satirlar as Record<string, unknown>[];
    expect(wire.map((row) => row.lineNumber)).toEqual([1, 2]);
    state = gridEngineReducer(state, { type: "remove", key: "yeni-1" }, opts, chainEngine);
    expect(state.rows.map((draft) => draft.cells.lineNumber)).toEqual([undefined, "1"]);
    // Doldurma sorgusunun değeri sıra numarasını ezmez.
    const filled = filledGridState(chainColumns, chainEngine, "K", [{ lineNumber: 7, quantity: 1 }, { lineNumber: 9, quantity: 2 }]);
    expect(filled.rows.map((draft) => draft.cells.lineNumber)).toEqual(["1", "2"]);
  });
});
