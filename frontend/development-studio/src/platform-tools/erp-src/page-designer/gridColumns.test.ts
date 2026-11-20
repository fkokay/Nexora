import { describe, expect, it } from "vitest";
import vectors from "../../../../../erp-web/src/custom-page/gridColumns.vectors.json";
import { columnEntries, gridColumnText, parseGridColumn, renamedColumnEntries } from "./gridColumns";

// Studio kopyası erp-web gridState.ts ve sunucudaki GridColumnSpec.cs ile aynı vektörleri kabul / reddeder.
describe("gridColumns (ortak vektörler)", () => {
  for (const vector of vectors.valid) it(`geçerli: ${vector.text}`, () => {
    const parsed = parseGridColumn(vector.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.column.code).toBe(vector.code);
    expect(parsed.column.inputType).toBe(vector.inputType);
    expect(gridColumnText(parsed.column)).toBe(vector.text);
  });
  for (const text of vectors.invalid) it(`geçersiz: ${text}`, () => expect(parseGridColumn(text).ok).toBe(false));
});

describe("seçim (lookup) sütunu", () => {
  it("lookup:<sorgu>:<değer>:<etiket>[:<açıklama>] okunur ve aynı metne yazılır", () => {
    for (const text of ["stockItemId|Stok kartı|lookup:stoklar:id:code:name|required,unique", "unitCode|Birim|lookup:birimler:unitCode:unitCode",
      "loc|Konum|lookup:q-1:balance.id:balance.code|readOnly"]) {
      const parsed = parseGridColumn(text);
      expect(parsed.ok, text).toBe(true);
      if (parsed.ok) expect(gridColumnText(parsed.column)).toBe(text);
    }
    const parsed = parseGridColumn("stockItemId|Stok kartı|lookup:stoklar:id:code:name|required,unique");
    expect(parsed.ok && parsed.column).toEqual({ code: "stockItemId", label: "Stok kartı", inputType: "lookup",
      rules: { required: true, unique: true, upperCase: false, readOnly: false }, lookup: { query: "stoklar", valueColumn: "id", labelColumn: "code", descriptionColumn: "name" } });
  });

  it("bozuk seçim türleri ve başka türlerin kuralları reddedilir (erp-web ile aynı vektörler)", () => {
    for (const text of ["a|A|lookup", "a|A|lookup:", "a|A|lookup:q", "a|A|lookup:q:id", "a|A|lookup:q:id:code:name:x", "a|A|lookup:q x:id:code",
      "a|A|lookup:q:id:", "a|A|lookup:q:1d:code", "a|A|lookup:q:id:code|upperCase", "a|A|lookup:q:id:code|maxLength:4", "a|A|lookup:q:id:code|min:1"]) {
      expect(parseGridColumn(text).ok, text).toBe(false);
    }
  });

  it("sütun ayarları ilk '=' işaretinden ayrılır; yeniden adlanınca taşınır, silinince kalkar", () => {
    expect(columnEntries(["unitCode==Ana birim", "stockItemId=satir.isActive == true && satir.id != a.value", "bad", "=x", 7]))
      .toEqual([{ code: "unitCode", rest: "=Ana birim" }, { code: "stockItemId", rest: "satir.isActive == true && satir.id != a.value" }]);
    const props = { columnOptionsWhen: ["a=satir.x == 1", "b=satir.y == 2"], columnStaticOptions: ["a==Boş"] };
    expect(renamedColumnEntries(props, "a", "c")).toEqual({ columnOptionsWhen: ["c=satir.x == 1", "b=satir.y == 2"], columnStaticOptions: ["c==Boş"] });
    expect(renamedColumnEntries(props, "a", null)).toEqual({ columnOptionsWhen: ["b=satir.y == 2"], columnStaticOptions: undefined });
    expect(renamedColumnEntries(props, "z", null)).toEqual({});
  });
});
