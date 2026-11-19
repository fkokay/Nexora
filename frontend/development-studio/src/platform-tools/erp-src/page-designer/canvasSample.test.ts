import { describe, expect, it } from "vitest";
import { conditionHolds, evaluateCondition, parseCondition } from "./conditions";
import { sampleText } from "./pageBindings";

// Stok Kartları detay kartının örnek kapsamı (inventory-stock.json: liste.seciliSatir = listenin ilk örnek satırı).
const scope = {
  liste: { seciliSatir: { balance: { name: "Vida M6", code: "STK-001", quantityOnHand: "12" }, status: "Yeterli", stockItem: { id: "a1", trackingMode: "Lot", isActive: true } } },
  detayPaneli: { value: true },
  depoSecimi: { value: null },
};

describe("tuval koşul değerlendirmesi", () => {
  it("Lot/Seri etiketlerinden yalnız örnek satıra uyanı tutar", () => {
    expect(conditionHolds("liste.seciliSatir.stockItem.trackingMode == 'Lot'", scope, true)).toBe(true);
    expect(conditionHolds("liste.seciliSatir.stockItem.trackingMode == 'Serial'", scope, true)).toBe(false);
  });

  it("erp-web ile aynı: && / ||, !=, null, in ve sayısal metin", () => {
    expect(conditionHolds("detayPaneli.value == true && liste.seciliSatir.stockItem.id != null", scope, false)).toBe(true);
    expect(conditionHolds("depoSecimi.value == null", scope, false)).toBe(true);
    expect(conditionHolds("liste.seciliSatir.status in ['Pasif', 'Yeterli']", scope, false)).toBe(true);
    expect(conditionHolds("liste.seciliSatir.balance.quantityOnHand == 12", scope, false)).toBe(true);
    expect(conditionHolds("!liste.seciliSatir.stockItem.isActive || yok.alan", scope, true)).toBe(false);
  });

  it("çözülemeyen yol null sayılır; boş ya da hatalı koşul geri dönüş değerini verir", () => {
    const parsed = parseCondition("yok.alan == null");
    expect(parsed.ok && evaluateCondition(parsed.node, scope)).toBe(true);
    expect(conditionHolds("", scope, true)).toBe(true);
    expect(conditionHolds("liste.seciliSatir ==", scope, true)).toBe(true);
    expect(conditionHolds(undefined, scope, false)).toBe(false);
  });
});

describe("tuval metni (sampleText)", () => {
  it("bağlamayı örnek değerle çözer", () => {
    expect(sampleText("{{liste.seciliSatir.balance.name}}", scope)).toBe("Vida M6");
    expect(sampleText("Kod: {{liste.seciliSatir.balance.code}}", scope)).toBe("Kod: STK-001");
  });

  it("çözülemezse ham metni korur; bağlamasız metin değişmez", () => {
    expect(sampleText("{{liste.seciliSatir.yok}}", scope)).toBe("{{liste.seciliSatir.yok}}");
    expect(sampleText("{{liste.seciliSatir.balance.name}}", {})).toBe("{{liste.seciliSatir.balance.name}}");
    expect(sampleText("Aç", scope)).toBe("Aç");
  });
});
