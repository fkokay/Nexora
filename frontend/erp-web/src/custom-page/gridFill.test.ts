import { describe, expect, it } from "vitest";
import { countedGridState, EMPTY_GRID_ENGINE, filledGridState, fillCells, fillLabelsOf, gridEngineReducer, isSkippedRow, lookupFillCells, parseGridEngine, withFormulaColumns } from "./gridFill";
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
      cells: { quantity: "4", stockItemId: "S9", unitCode: "KUTU", unitPrice: "3.25", vatRate: "", lineNet: "13", lineVat: "0" },
      filled: { unitCode: "KUTU", unitPrice: "3.25", vatRate: "" } });
  });

  it("taslakla çağrılınca kullanıcının yazdığı değeri ezmez; boş ya da önceki doldurmanın değerini yeniler", () => {
    const draft = { key: "yeni-1", cells: { unitCode: "ADET", unitPrice: "9", vatRate: "18" }, filled: { unitCode: "ADET", vatRate: "18" } };
    // unitPrice elle yazıldı (doldurulan değer değil): kalır; unitCode ve vatRate önceki doldurmadan: yenilenir (boş değer boşaltır).
    expect(lookupFillCells(columns, engine, "stockItemId", option, draft)).toEqual({ unitCode: "KUTU", vatRate: "" });
    expect(lookupFillCells(columns, engine, "stockItemId", option, { key: "yeni-2", cells: {} })).toEqual({ unitCode: "KUTU", unitPrice: "3.25", vatRate: "" });
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

// Satış belge kartlarının (Aşama B) ihtiyaçları — eski gridInitialRows / gridLookupFill testlerinden: hesaplanan (calc) sütunlar,
// seçim hücresinin görünen metni ("kod@label"), iç içe kaynak alanları ve yazılan değerin korunması.
describe("belge kartı: hesaplanan sütun, görünen metin ve yazılan değer", () => {
  const card = parseGridColumns([
    "stockItemId|Stok|lookup:stoklar:id:code:name|required", "warehouseId|Depo|lookup:depolar:id:name", "quantity|Miktar|number|required",
    "unitCode|Birim|text", "unitPrice|Birim fiyat|number", "vatPercent|KDV %|number", "deliveryDate|Teslim|date", "free|Bedelsiz|checkbox",
    "lineTotal|Tutar|calc:onizleme:lineTotal",
  ]);
  const cardEngine = parseGridEngine({
    fillQuery: "kalemler",
    fillColumns: { quantity: "remainingQuantity", "stockItemId@label": "stockName", "quantity@label": "x", lineTotal: "lineTotal", nope: "x", deliveryDate: "line.date" },
    lookupFills: { stockItemId: { unitCode: "baseUnitCode", unitPrice: "listPrice", vatPercent: "vatRate", deliveryDate: "meta.due", lineTotal: "total",
      warehouseId: "defaultWarehouseId", stockItemId: "id", nope: "x" }, unitCode: { unitPrice: "x" } },
  }, card, "list");

  it("eşlemler: hesaplanan sütun, bilinmeyen kod ve seçim olmayan @label atlanır", () => {
    expect(cardEngine.fillColumns).toEqual({ quantity: "remainingQuantity", deliveryDate: "line.date" });
    expect(cardEngine.fillLabels).toEqual({ stockItemId: "stockName" });
    expect(cardEngine.lookupFills).toEqual({ stockItemId: { unitCode: "baseUnitCode", unitPrice: "listPrice", vatPercent: "vatRate", deliveryDate: "meta.due",
      warehouseId: "defaultWarehouseId" } });
  });

  it("kaynak satırlar hücre metnine çevrilir; hesaplanan sütun doldurulmaz, seçim hücresi görünen metnini alır", () => {
    const rows = [
      { stockItemId: "s1", stockName: "Koli", remainingQuantity: 10.5, unitCode: "ADET", line: { date: "2026-11-04T00:00:00" }, free: true, lineTotal: 99 },
      { stockItemId: "s2", remainingQuantity: 0, unitCode: null },
    ];
    const state = filledGridState(card, cardEngine, "k1", rows);
    expect(state.rows.map((draft) => ({ key: draft.key, cells: draft.cells, labels: draft.labels }))).toEqual([
      { key: "dolu-1", cells: { stockItemId: "s1", quantity: "10.5", unitCode: "ADET", deliveryDate: "2026-11-04", free: true }, labels: { stockItemId: "Koli" } },
      { key: "dolu-2", cells: { stockItemId: "s2", quantity: "0" }, labels: undefined },
    ]);
    expect(fillLabelsOf(cardEngine, { stockName: "" }, { stockItemId: "s1" })).toEqual({});
    expect(fillCells(card, cardEngine, { lineTotal: 5, deep: { a: { b: 1 } } })).toEqual({});
    expect(fillCells(card, parseGridEngine({ fillQuery: "q", fillColumns: { unitCode: "deep.a.b" } }, card, "list"), { deep: { a: { b: "X" } } })).toEqual({ unitCode: "X" });
    // Doldurulan (dokunulmamış) tablo değişmiş sayılmaz: kapsamda `satirlar` gönderilecek değerlerdir.
    expect(gridScope("list", card, state, [], "id").satirlar[0]).toEqual({ stockItemId: "s1", quantity: 10.5, unitCode: "ADET", deliveryDate: "2026-11-04", free: true });
  });

  it("seçimle doldurma boş hedefleri doldurur, yazılan değeri ezmez, önceki doldurmanınkini yeniler", () => {
    const stock = { id: "s1", baseUnitCode: "ADET", vatRate: 20, listPrice: 14, meta: { due: "2026-12-01T00:00:00" }, defaultWarehouseId: "w1" };
    expect(lookupFillCells(card, cardEngine, "stockItemId", stock, { key: "yeni-1", cells: { stockItemId: "s1" } }))
      .toEqual({ unitCode: "ADET", unitPrice: "14", vatPercent: "20", deliveryDate: "2026-12-01", warehouseId: "w1" });
    const typed = { key: "yeni-1", cells: { unitCode: "KOLI", unitPrice: "14", vatPercent: "10", deliveryDate: "2026-12-01", warehouseId: "w1" },
      filled: { unitPrice: "14", vatPercent: "20", deliveryDate: "2026-12-01", warehouseId: "w1" } };
    expect(lookupFillCells(card, cardEngine, "stockItemId", { ...stock, listPrice: 30, vatRate: 1 }, typed))
      .toEqual({ unitPrice: "30", deliveryDate: "2026-12-01", warehouseId: "w1" });
    expect(lookupFillCells(card, cardEngine, "warehouseId", stock, typed)).toEqual({});
    expect(lookupFillCells(card, cardEngine, "stockItemId", null, typed)).toEqual({});
  });

  it("kaynaktan doldurulan satırda seçim yenilenince doldurulan hücreler güncellenir, kullanıcının değiştirdiği kalır", () => {
    const opts = { mode: "list" as const, maxRows: 50 };
    let state: GridState = filledGridState(card, cardEngine, "k1", [{ stockItemId: "s1", remainingQuantity: 2, unitPrice: 10, vatPercent: 20 }]);
    state = gridEngineReducer(state, { type: "edit", key: "dolu-1", code: "vatPercent", value: "8" }, opts, cardEngine);
    const option = { id: "s2", baseUnitCode: "KOLI", listPrice: 30, vatRate: 1 };
    state = gridEngineReducer(state, { type: "pick", key: "dolu-1", code: "stockItemId", value: "s2", label: "S2",
      fills: lookupFillCells(card, cardEngine, "stockItemId", option, state.rows[0]) }, opts, cardEngine);
    expect(state.rows[0].cells).toMatchObject({ stockItemId: "s2", unitCode: "KOLI", unitPrice: "30", vatPercent: "8", quantity: "2" });
  });
});
