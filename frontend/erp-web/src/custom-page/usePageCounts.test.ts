import { describe, expect, it } from "vitest";
import { interpolate } from "./pageBindings";
import { collectTexts, COUNTS_ROOT, referencedCountCodes } from "./usePageCounts";

describe("sayı değişkenleri", () => {
  it("metinlerde geçen kaynak kodlarını tekil ve sıralı toplar", () => {
    const texts = collectTexts([
      { title: "Toplam {{ sayilar.customers }} cari", value: "{{sayilar.stockItems}}" },
      { items: ["{{sayilar.customers}}", "{{kullanici.ad}}"] },
      [{ name: "p", binding: "{{sayilar.salesInvoices}}", type: "int" }],
    ]);
    expect(referencedCountCodes(texts)).toEqual(["customers", "salesInvoices", "stockItems"]);
  });

  it("geçersiz yolları ve başka kökleri yok sayar", () => {
    expect(referencedCountCodes(["{{sayilar}}", "{{sayilar.}}", "{{sayilarX.a}}", "{{a.sayilar.b}}"])).toEqual([]);
  });

  it("kapsamda çözülür; bilinmeyen kaynak boş kalır", () => {
    const scope = { [COUNTS_ROOT]: { customers: 6 } };
    expect(interpolate("Toplam {{sayilar.customers}} cari", scope)).toBe("Toplam 6 cari");
    expect(interpolate("{{sayilar.stockItems}}", scope)).toBe("");
  });
});
