import { describe, expect, it } from "vitest";
import {
  convertUnitPrice,
  emptyPriceDraft,
  invoiceLineOverridden,
  invoicePriceFields,
  invoicePriceLine,
  lineAmounts,
  listPriceSuggestion,
  missingInvoiceAmounts,
  orderPriceHint,
  priceDraftFrom,
  priceWriteFields,
  pricingStateTag,
  pricingTotals,
  setFree,
  toggleAllFree,
} from "./deliveryPricing";

const priced = (unitPrice: string, discountPercent = "0", vatPercent = "20") => ({ isFreeOfCharge: false, unitPrice, discountPercent, vatPercent });

describe("delivery line pricing (taslak 20)", () => {
  it("computes qty × price × (1 − disc) and VAT like the draft's rows", () => {
    expect(lineAmounts(10, priced("1000", "5"))).toEqual({ net: 9500, vat: 1900, total: 11400 });
    expect(lineAmounts(4, priced("85"))).toEqual({ net: 340, vat: 68, total: 408 });
    expect(lineAmounts(2, { ...emptyPriceDraft(), isFreeOfCharge: true })).toBeNull();
    expect(lineAmounts(2, priced(""))).toBeNull();
  });

  it("totals only the priced lines and counts free / unpriced ones", () => {
    const totals = pricingTotals([
      { quantity: 10, price: priced("1000", "5") },
      { quantity: 4, price: priced("85") },
      { quantity: 2, price: setFree(emptyPriceDraft(), true) },
      { quantity: 1, price: priced("") },
    ]);
    expect(totals).toEqual({ net: 9840, vat: 1968, total: 11808, freeCount: 1, unpricedCount: 1 });
  });

  it("a free line writes only the flag; a blank price is an explicit null, a typed 0 stays 0", () => {
    expect(priceWriteFields(setFree(priced("5"), true))).toEqual({ isFreeOfCharge: true });
    expect(priceWriteFields(priced("", "", ""))).toEqual({ isFreeOfCharge: false, unitPrice: null, discountPercent: null, vatPercent: null });
    expect(priceWriteFields(priced("0", "0", "0"))).toEqual({ isFreeOfCharge: false, unitPrice: 0, discountPercent: 0, vatPercent: 0 });
  });

  it("free clears the cells; unmarking re-suggests; Tümünü bedelsiz yap toggles every line", () => {
    const suggestion = priceDraftFrom({ unitPrice: 90, discountPercent: 0, vatPercent: 20 });
    const free = setFree(priced("85"), true);
    expect(free).toEqual({ isFreeOfCharge: true, unitPrice: "", discountPercent: "", vatPercent: "" });
    expect(setFree(free, false, suggestion)).toEqual(priced("90", "0", "20"));
    const all = toggleAllFree([priced("1"), free], () => suggestion);
    expect(all.every((price) => price.isFreeOfCharge)).toBe(true);
    expect(toggleAllFree(all, () => suggestion)).toEqual([suggestion, suggestion]);
  });

  it("shows the order price hint and marks a change", () => {
    expect(orderPriceHint(1000, priced("1000"))).toEqual({ text: "siparişte 1.000,00", changed: false });
    expect(orderPriceHint(90, priced("85"))).toEqual({ text: "siparişte 90,00 · değiştirildi", changed: true });
    expect(orderPriceHint(null, priced("85"))).toBeNull();
    expect(orderPriceHint(90, setFree(priced("85"), true))).toBeNull();
  });

  it("converts a unit price between units by factorToBase", () => {
    expect(convertUnitPrice(10, 1, 12)).toBe(120);
    expect(convertUnitPrice(120, 12, 1)).toBe(10);
  });

  it("maps pricing states to tags", () => {
    expect(pricingStateTag("Free")).toEqual({ label: "Bedelsiz", tone: "free" });
    expect(pricingStateTag("PartlyFree")).toEqual({ label: "Kısmen bedelsiz", tone: "warn" });
    expect(pricingStateTag("Unpriced")?.label).toBe("Fiyatsız");
    expect(pricingStateTag("PartlyUnpriced")?.label).toBe("Kısmen fiyatsız");
    expect(pricingStateTag("Priced")).toBeNull();
  });

  it("invoice lines prefill from the delivery, else the order; free / unpriced lines start empty", () => {
    const delivered = { unitPrice: 85, discountPercent: 0, vatPercent: 20 };
    expect(invoicePriceLine(delivered)).toMatchObject({ unitPrice: "85", needsAmount: false, source: "delivery" });
    expect(invoicePriceLine({ unitPrice: null }, { unitPrice: 90, discountPercent: 5, vatPercent: 10 })).toMatchObject({ unitPrice: "90", discountPercent: "5", source: "order" });
    const free = invoicePriceLine({ isFreeOfCharge: true, unitPrice: null }, { unitPrice: 90, discountPercent: 0, vatPercent: 10 });
    expect(free).toMatchObject({ unitPrice: "", discountPercent: "0", vatPercent: "10", needsAmount: true, isFreeOfCharge: true, source: "none" });
    // Without an order line or a default the VAT cell stays blank and is not sent.
    const bare = invoicePriceLine({ isFreeOfCharge: true, unitPrice: null }, null, null);
    expect(bare).toMatchObject({ discountPercent: "", vatPercent: "" });
    expect(invoicePriceFields({ ...bare, unitPrice: "5" })).toEqual({ unitPrice: 5 });
    expect(missingInvoiceAmounts([free])).toBe(1);
    expect(missingInvoiceAmounts([{ ...free, unitPrice: "0" }])).toBe(0);
    expect(invoicePriceFields({ ...free, unitPrice: "0" }).unitPrice).toBe(0);
    expect(invoiceLineOverridden(invoicePriceLine(delivered), delivered)).toBe(false);
    expect(invoiceLineOverridden({ ...invoicePriceLine(delivered), unitPrice: "80" }, delivered)).toBe(true);
  });

  it("suggests the stock card list price only in the document currency", () => {
    expect(listPriceSuggestion({ salesListPrice: 40, priceCurrencyCode: "TRY" }, "sales", "TRY")).toBe(40);
    expect(listPriceSuggestion({ salesListPrice: 40, priceCurrencyCode: "USD" }, "sales", "TRY")).toBeNull();
    expect(listPriceSuggestion({ purchaseListPrice: 12 }, "purchase", "EUR")).toBe(12);
    expect(listPriceSuggestion(undefined, "sales", "TRY")).toBeNull();
  });
});
