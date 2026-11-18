import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ColumnsEditor } from "./ColumnsEditor";
import { GRID_TOOLS, GridToolsField, gridToolPatch } from "./GridSettingsFields";
import { parseColumnFormats } from "./cellFormat";
import {
  columnValueLabels, conditionTerms, joinConditionTerms, orphanEntries, pairValue, parseWidthWhen, renameTone, setPair, setTone, setValueLabel,
  splitConditionTerms, toneOf, valueRowsFor, widthWhenText, withoutEntry,
} from "./gridColumnSettings";

// Gerçek tanım: src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json (Stok listesi ve son hareketler ızgaraları).
const stockList = {
  columns: ["balance.code", "balance.name", "stockItem.category", "balance.quantityOnHand", "balance.reservedQuantity", "balance.availableQuantity", "balance.minimumStock", "balance.valuationAmountBase", "balance.unvaluedQuantity", "status"],
  columnLabels: ["balance.code=Stok kodu", "balance.name=Stok adı", "stockItem.category=Kategori", "balance.quantityOnHand=Depo bakiyesi", "balance.reservedQuantity=Rezerve", "balance.availableQuantity=Kullanılabilir", "balance.minimumStock=Minimum", "balance.valuationAmountBase=Stok değeri", "balance.unvaluedQuantity=Maliyetsiz miktar", "status=Durum"],
  columnUnits: ["balance.quantityOnHand=balance.unitCode", "balance.reservedQuantity=balance.unitCode", "balance.availableQuantity=balance.unitCode", "balance.unvaluedQuantity=balance.unitCode", "balance.valuationAmountBase=balance.baseCurrencyCode"],
  columnFormats: ["balance.code=code", "balance.quantityOnHand=number", "balance.reservedQuantity=number", "balance.availableQuantity=number", "balance.minimumStock=number", "balance.unvaluedQuantity=number", "balance.valuationAmountBase=money", "status=status"],
  toneMap: ["Minimum altı=danger", "Maliyetsiz=warning", "Yeterli=success", "Pasif=info"],
  valueLabels: ["stockItem.trackingMode:None=Yok", "stockItem.trackingMode:Lot=Lot", "stockItem.trackingMode:Serial=Seri"],
  widthWhen: "8=detayPaneli.value == true && liste.seciliSatir.stockItem.id != null",
};
const movements = {
  columns: ["description", "entryDate", "warehouseCode", "direction", "quantity"],
  columnFormats: ["entryDate=date", "quantity=number"],
  toneMap: ["Giriş=success", "Çıkış=danger"],
  valueLabels: ["direction:Receipt=Giriş", "direction:Issue=Çıkış"],
};
const queryColumns = [...stockList.columns, "balance.unitCode", "balance.baseCurrencyCode", "stockItem.trackingMode"].map((code) => ({ code, label: code }));

const ok = <T,>(result: { ok: true; entries: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw new Error(result.error);
  return result.entries;
};

describe("eski tanımlar aynen geri yazılır", () => {
  it("her sütunun başlığı ve birimi okunup geri yazılınca diziler bayt bayt aynı kalır", () => {
    let labels = [...stockList.columnLabels];
    let units = [...stockList.columnUnits];
    for (const code of queryColumns.map((column) => column.code)) {
      const label = pairValue(labels, code);
      if (label !== undefined) labels = ok(setPair(labels, code, label));
      const unit = pairValue(units, code);
      if (unit !== undefined) units = ok(setPair(units, code, unit, { maxValue: 128 }));
    }
    expect(labels).toEqual(stockList.columnLabels);
    expect(units).toEqual(stockList.columnUnits);
  });

  it("değer etiketleri ve renkler okunup geri yazılınca aynı kalır", () => {
    for (const props of [stockList, movements]) {
      let labels = [...props.valueLabels];
      let tones = [...props.toneMap];
      for (const code of ["stockItem.trackingMode", "direction"]) {
        for (const row of columnValueLabels(labels, code)) {
          labels = ok(setValueLabel(labels, code, row.value, row.label));
          const tone = toneOf(tones, row.label);
          if (tone) tones = ok(setTone(tones, row.label, tone));
        }
      }
      for (const entry of props.toneMap) { const [key, tone] = entry.split("="); tones = ok(setTone(tones, key, tone as "info")); }
      expect(labels).toEqual(props.valueLabels);
      expect(tones).toEqual(props.toneMap);
    }
  });

  it("sütunlar sekmesi açılırken hiçbir değişiklik yazılmaz ve kayıtlı başlıklar gösterilir", () => {
    const onPatch = vi.fn();
    const html = renderToString(<ColumnsEditor available={queryColumns} selected={stockList.columns} formats={stockList.columnFormats} totals={[]} totalsAllowed
      labels={stockList.columnLabels} units={stockList.columnUnits} valueLabels={stockList.valueLabels} toneMap={stockList.toneMap} onPatch={onPatch}/>);
    expect(onPatch).not.toHaveBeenCalled();
    expect(html).toContain("Stok kodu");
    expect(html).toContain("Depo bakiyesi");
    expect(html).not.toContain("Sorguda olmayan");
  });

  it("150 sütunda yalnız görünen satırlar çizilir", () => {
    const many = Array.from({ length: 150 }, (_, index) => ({ code: `c${index}`, label: `Sütun ${index}` }));
    const html = renderToString(<ColumnsEditor available={many} selected={[]} formats={[]} totals={[]} totalsAllowed labels={[]} units={[]} valueLabels={[]} toneMap={[]} onPatch={() => undefined}/>);
    const rendered = html.match(/aria-rowindex=/g)?.length ?? 0;
    expect(html).toContain(">c0<");
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(40);
    expect(html).not.toContain(">c149<");
  });

  it("stok listesinin daralma kuralı hazır terimlerle tanınır (onay kutusu işaretli ve satır seçili)", () => {
    const parsed = parseWidthWhen(stockList.widthWhen)!;
    expect(parsed.width).toBe(8);
    const terms = conditionTerms([{ type: "dataTable", name: "liste", props: { query: "bakiye" } }, { type: "input", name: "detayPaneli", props: { inputType: "checkbox", label: "Detay paneli" } }],
      () => ["balance.code", "balance.stockItemId", "stockItem.id"]);
    expect(splitConditionTerms(parsed.condition, terms)).toEqual(["detayPaneli.value == true", "liste.seciliSatir.stockItem.id != null"]);
    expect(splitConditionTerms("detayPaneli.value == true || x", terms)).toBeNull();
    expect(widthWhenText(parsed.width, parsed.condition)).toBe(stockList.widthWhen);
  });
});

describe("tek düzenleme yalnız kendi girdisine dokunur", () => {
  it("başlık değişikliği yalnız o girdiyi yerinde değiştirir; boş başlık girdiyi siler", () => {
    const changed = ok(setPair(stockList.columnLabels, "balance.name", "Ad"));
    expect(changed).toEqual(stockList.columnLabels.map((entry) => entry === "balance.name=Stok adı" ? "balance.name=Ad" : entry));
    const cleared = ok(setPair(stockList.columnLabels, "status", undefined));
    expect(cleared).toEqual(stockList.columnLabels.filter((entry) => entry !== "status=Durum"));
    const added = ok(setPair(stockList.columnUnits, "balance.minimumStock", "balance.unitCode", { maxValue: 128 }));
    expect(added).toEqual([...stockList.columnUnits, "balance.minimumStock=balance.unitCode"]);
  });

  it("biçimsiz ve sorguda olmayan girdiler korunur, sınırlar uygulanır", () => {
    const entries = ["bozuk", "eski.kolon=Eski", "a=A"];
    expect(ok(setPair(entries, "a", "B"))).toEqual(["bozuk", "eski.kolon=Eski", "a=B"]);
    expect(setPair(entries, "a", "x=y").ok).toBe(false);
    const full = Array.from({ length: 20 }, (_, index) => `k${index}=v`);
    expect(setPair(full, "yeni", "v").ok).toBe(false);
    expect(setPair(full, "k3", "w").ok).toBe(true);
    expect(orphanEntries({ columnLabels: entries }, ["a"]).map((item) => item.entry)).toEqual(["bozuk", "eski.kolon=Eski"]);
    expect(withoutEntry(entries, "bozuk")).toEqual(["eski.kolon=Eski", "a=A"]);
    expect(withoutEntry(["a=A"], "a=A")).toBeUndefined();
  });

  it("değer etiketi yeniden adlandırılınca yeri değişmez; renk etiketle taşınır", () => {
    const renamed = ok(setValueLabel(movements.valueLabels, "direction", "Receipt", "Giriş fişi"));
    expect(renamed).toEqual(["direction:Receipt=Giriş fişi", "direction:Issue=Çıkış"]);
    expect(renameTone(movements.toneMap, "Giriş", "Giriş fişi")).toEqual(["Giriş fişi=success", "Çıkış=danger"]);
    const revalued = ok(setValueLabel(movements.valueLabels, "direction", "In", "Giriş", "Receipt"));
    expect(revalued).toEqual(["direction:In=Giriş", "direction:Issue=Çıkış"]);
    expect(setValueLabel(movements.valueLabels, "direction", "Issue", "X", "Receipt").ok).toBe(false);
    expect(setValueLabel(movements.valueLabels, "a:b", "x", "X").ok).toBe(false);
  });

  it("renk satırları: etiketli değerler önce, etiketsiz renk eşlemeleri durum sütununda ayrıca listelenir", () => {
    const rows = valueRowsFor("status", stockList.valueLabels, stockList.toneMap, true);
    expect(rows.map((row) => row.value)).toEqual(["Minimum altı", "Maliyetsiz", "Yeterli", "Pasif"]);
    expect(rows.every((row) => row.toneOnly)).toBe(true);
    expect(valueRowsFor("direction", movements.valueLabels, movements.toneMap, true)).toEqual([
      { value: "Receipt", label: "Giriş", tone: "success" }, { value: "Issue", label: "Çıkış", tone: "danger" }]);
    expect(valueRowsFor("direction", movements.valueLabels, movements.toneMap, false).map((row) => row.tone)).toEqual([undefined, undefined]);
    expect(ok(setTone(stockList.toneMap, "maliyetsiz", "danger"))).toEqual(["Minimum altı=danger", "Maliyetsiz=danger", "Yeterli=success", "Pasif=info"]);
    expect(ok(setTone(stockList.toneMap, "Pasif", undefined))).toEqual(["Minimum altı=danger", "Maliyetsiz=warning", "Yeterli=success"]);
  });

  it("koşullu genişlik formu yalnız hazır terimlerle yazar", () => {
    const terms = conditionTerms([
      { type: "dataTable", name: "liste", props: {} }, { type: "dialog", name: "kart", props: {} }, { type: "input", props: {} },
    ], () => ["balance.code", "stockItem.id"]);
    expect(terms.map((term) => term.expression)).toEqual(["liste.seciliSatir.stockItem.id != null", "kart.acik"]);
    const text = widthWhenText(8, joinConditionTerms(terms.map((term) => term.expression)));
    expect(text).toBe("8=liste.seciliSatir.stockItem.id != null && kart.acik");
    expect(splitConditionTerms(parseWidthWhen(text)!.condition, terms)).toEqual(terms.map((term) => term.expression));
    expect(parseWidthWhen("13=kart.acik")).toBeNull();
  });

  it("biçim girdileri sütun ayarlarından etkilenmez", () => {
    expect(parseColumnFormats(stockList.columnFormats)["status"]).toBe("status");
  });
});

describe("tablo araçları", () => {
  it("kapatınca false yazılır, açınca özellik silinir", () => {
    expect(gridToolPatch("showPivot", false)).toEqual({ showPivot: false });
    expect(gridToolPatch("showPivot", true)).toEqual({ showPivot: undefined });
  });
  it("özellik yoksa açık, false ise kapalı gösterilir ve açılışta yama yazılmaz", () => {
    const onPatch = vi.fn();
    const html = renderToString(<GridToolsField props={{ showExport: false }} onPatch={onPatch}/>);
    expect(onPatch).not.toHaveBeenCalled();
    expect(html.match(/checked=""/g)?.length).toBe(GRID_TOOLS.length - 1);
  });
});
