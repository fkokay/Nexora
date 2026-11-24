/*
 * İrsaliye satır fiyatı ve bedelsiz satır (taslak 20). Satış irsaliyesi, mal kabul ve satınalma irsaliyesi satırları birim
 * fiyat, iskonto %, KDV % ve "Bedelsiz" işaretini taşır. Bedelsiz satırın fiyat alanları boştur; tutarı faturada girilir.
 * Boş hücre, 0 ve null ayrı şeylerdir: boş birim fiyat "fiyatsız" demektir (0 değil), 0 yalnızca kullanıcı yazdığında gider.
 */

/** Pricing state of a delivery header (server `pricingState`). */
export type DeliveryPricingState = "Priced" | "PartlyFree" | "Free" | "Unpriced" | "PartlyUnpriced";

/** Pricing fields of a saved delivery line (server line view). */
export type DeliveryLinePricing = {
  unitPrice?: number | null;
  discountPercent?: number | null;
  vatPercent?: number | null;
  isFreeOfCharge?: boolean | null;
  orderUnitPrice?: number | null;
  lineNetAmount?: number | null;
  lineVatAmount?: number | null;
  lineTotal?: number | null;
};

/** Pricing totals of a saved delivery header (server header view). */
export type DeliveryHeaderPricing = {
  currencyCode?: string | null;
  pricedNetTotal?: number | null;
  pricedVatTotal?: number | null;
  pricedGrandTotal?: number | null;
  freeLineCount?: number | null;
  unpricedLineCount?: number | null;
  pricingState?: DeliveryPricingState | null;
};

/** Editable price cells of a delivery line (form text, so empty stays empty). */
export type PriceDraft = {
  isFreeOfCharge: boolean;
  unitPrice: string;
  discountPercent: string;
  vatPercent: string;
};

export const emptyPriceDraft = (): PriceDraft => ({ isFreeOfCharge: false, unitPrice: "", discountPercent: "", vatPercent: "" });

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

/** Draft of a saved line or of a suggestion (order line, stock card list price). */
export function priceDraftFrom(source: DeliveryLinePricing | null | undefined): PriceDraft {
  if (!source) return emptyPriceDraft();
  if (source.isFreeOfCharge) return { ...emptyPriceDraft(), isFreeOfCharge: true };
  return {
    isFreeOfCharge: false,
    unitPrice: text(source.unitPrice),
    discountPercent: text(source.discountPercent),
    vatPercent: text(source.vatPercent),
  };
}

/** Number of a typed cell, null when the cell is blank or not a number. */
export function parseCell(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** decimal.Round(x, 2, MidpointRounding.AwayFromZero), tolerant of binary float noise. */
export function round2(value: number): number {
  const scaled = Number((Math.abs(value) * 100).toFixed(6));
  return (Math.sign(value) * Math.round(scaled)) / 100;
}

export type LineAmounts = { net: number; vat: number; total: number };

/** qty × price less the discount, its VAT and the VAT-inclusive total; null when the line is free or has no price. */
export function lineAmounts(
  quantity: number,
  price: Pick<PriceDraft, "isFreeOfCharge" | "unitPrice" | "discountPercent" | "vatPercent">,
): LineAmounts | null {
  if (price.isFreeOfCharge) return null;
  const unitPrice = parseCell(price.unitPrice);
  if (unitPrice === null || !Number.isFinite(quantity)) return null;
  const discount = parseCell(price.discountPercent) ?? 0;
  const rate = parseCell(price.vatPercent) ?? 0;
  // Same rounding as the server (DeliveryLinePricing.Amounts): gross, then the discount, each to 2 decimals.
  const gross = round2(quantity * unitPrice);
  const net = round2(gross - round2((gross * discount) / 100));
  const vat = round2((net * rate) / 100);
  return { net, vat, total: round2(net + vat) };
}

export type PricingTotals = { net: number; vat: number; total: number; freeCount: number; unpricedCount: number };

/** Totals of the priced lines plus the free / unpriced counts (unsaved forms; saved documents use the server header). */
export function pricingTotals(lines: { quantity: number; price: PriceDraft }[]): PricingTotals {
  return lines.reduce<PricingTotals>(
    (totals, line) => {
      if (line.price.isFreeOfCharge) return { ...totals, freeCount: totals.freeCount + 1 };
      const amounts = lineAmounts(line.quantity, line.price);
      if (!amounts) return { ...totals, unpricedCount: totals.unpricedCount + 1 };
      return {
        ...totals,
        net: round2(totals.net + amounts.net),
        vat: round2(totals.vat + amounts.vat),
        total: round2(totals.total + amounts.total),
      };
    },
    { net: 0, vat: 0, total: 0, freeCount: 0, unpricedCount: 0 },
  );
}

/** Header totals of a saved delivery as the totals cards read them. */
export function headerTotals(header: DeliveryHeaderPricing): PricingTotals {
  return {
    net: header.pricedNetTotal ?? 0,
    vat: header.pricedVatTotal ?? 0,
    total: header.pricedGrandTotal ?? 0,
    freeCount: header.freeLineCount ?? 0,
    unpricedCount: header.unpricedLineCount ?? 0,
  };
}

/** The saved document carries the new pricing fields (servers before this change do not). */
export const hasHeaderPricing = (header: DeliveryHeaderPricing | null | undefined) =>
  !!header && (header.pricingState !== undefined && header.pricingState !== null);

/**
 * Price keys of a delivery line write. A free line sends only `isFreeOfCharge: true` (the three price keys are left out);
 * a priced line always sends each key, a blank cell as an explicit null ("fiyatsız", not 0).
 */
export function priceWriteFields(price: PriceDraft):
  | { isFreeOfCharge: true }
  | { isFreeOfCharge: false; unitPrice: number | null; discountPercent: number | null; vatPercent: number | null } {
  if (price.isFreeOfCharge) return { isFreeOfCharge: true };
  return {
    isFreeOfCharge: false,
    unitPrice: parseCell(price.unitPrice),
    discountPercent: parseCell(price.discountPercent),
    vatPercent: parseCell(price.vatPercent),
  };
}

/** Marks a line free (cells cleared and locked) or unmarks it (the suggestion is offered again). */
export function setFree(price: PriceDraft, free: boolean, suggestion?: PriceDraft): PriceDraft {
  if (free) return { ...emptyPriceDraft(), isFreeOfCharge: true };
  return suggestion ? { ...suggestion, isFreeOfCharge: false } : { ...price, isFreeOfCharge: false };
}

export const allFree = (prices: PriceDraft[]) => prices.length > 0 && prices.every((price) => price.isFreeOfCharge);

/** "Tümünü bedelsiz yap": every line free, or, when all already are, every line back to its suggestion. */
export function toggleAllFree(prices: PriceDraft[], suggestion: (index: number) => PriceDraft | undefined): PriceDraft[] {
  const makeFree = !allFree(prices);
  return prices.map((price, index) => setFree(price, makeFree, suggestion(index)));
}

/** A price converted from one unit to another of the same stock item (factorToBase of each unit). */
export function convertUnitPrice(price: number, fromFactorToBase: number, toFactorToBase: number): number {
  if (!(fromFactorToBase > 0) || !(toFactorToBase > 0) || fromFactorToBase === toFactorToBase) return price;
  return Number(((price * toFactorToBase) / fromFactorToBase).toFixed(4));
}

const moneyFormat = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatPrice = (value: number) => moneyFormat.format(Number.isFinite(value) ? value : 0);
export const formatMoneyWithCurrency = (value: number, currency?: string | null) =>
  `${formatPrice(value)}${currency ? ` ${currency}` : ""}`;

/** "siparişte 1.000,00" / "siparişte 90,00 · değiştirildi" under the price cell; null without an order price. */
export function orderPriceHint(
  orderUnitPrice: number | null | undefined,
  price: PriceDraft,
): { text: string; changed: boolean } | null {
  if (orderUnitPrice === null || orderUnitPrice === undefined || price.isFreeOfCharge) return null;
  const current = parseCell(price.unitPrice);
  const changed = current === null || Math.abs(current - orderUnitPrice) > 0.00005;
  return { text: `siparişte ${formatPrice(orderUnitPrice)}${changed ? " · değiştirildi" : ""}`, changed };
}

export type PricingTag = { label: string; tone: "free" | "warn" | "off" };

/** List / header tag of a pricing state (labels as in the system-page standards); none for a fully priced document. */
export function pricingStateTag(state: DeliveryPricingState | null | undefined): PricingTag | null {
  switch (state) {
    case "Free":
      return { label: "Bedelsiz", tone: "free" };
    case "PartlyFree":
      return { label: "Kısmen bedelsiz", tone: "warn" };
    case "Unpriced":
      return { label: "Fiyatsız", tone: "off" };
    case "PartlyUnpriced":
      return { label: "Kısmen fiyatsız", tone: "off" };
    default:
      return null;
  }
}

/* ---- Invoice from a delivery: free / unpriced lines need an amount ---- */

/** A line of an invoice-from-delivery form. `needsAmount`: free or unpriced on the delivery, so the user must type a price. */
export type InvoicePriceLine = {
  unitPrice: string;
  discountPercent: string;
  vatPercent: string;
  needsAmount: boolean;
  isFreeOfCharge: boolean;
  /** Where the prefilled price came from ("irsaliyeden", "siparişten"); "none" when the user has to enter it. */
  source: "delivery" | "order" | "none";
};

/**
 * Prefill of an invoice line: the delivery line price, else the order line price (old order-based rows), else empty.
 * Free and unpriced lines start with an empty price (never 0); their discount / VAT come from the delivery line, else the
 * order line, else `defaultVat` (e.g. the stock card's VAT); a cell left blank is not sent, so the server's fallback applies.
 */
export function invoicePriceLine(
  line: DeliveryLinePricing,
  orderFallback?: { unitPrice?: number | null; discountPercent?: number | null; vatPercent?: number | null } | null,
  defaultVat: number | null = 20,
): InvoicePriceLine {
  if (!line.isFreeOfCharge && line.unitPrice !== null && line.unitPrice !== undefined)
    return {
      unitPrice: String(line.unitPrice),
      discountPercent: text(line.discountPercent ?? 0),
      vatPercent: text(line.vatPercent ?? defaultVat),
      needsAmount: false,
      isFreeOfCharge: false,
      source: "delivery",
    };
  if (!line.isFreeOfCharge && orderFallback && orderFallback.unitPrice !== null && orderFallback.unitPrice !== undefined)
    return {
      unitPrice: String(orderFallback.unitPrice),
      discountPercent: text(orderFallback.discountPercent ?? 0),
      vatPercent: text(orderFallback.vatPercent ?? defaultVat),
      needsAmount: false,
      isFreeOfCharge: false,
      source: "order",
    };
  return {
    unitPrice: "",
    discountPercent: text(line.discountPercent ?? orderFallback?.discountPercent ?? null),
    vatPercent: text(line.vatPercent ?? orderFallback?.vatPercent ?? defaultVat),
    needsAmount: true,
    isFreeOfCharge: !!line.isFreeOfCharge,
    source: "none",
  };
}

/** Lines that still need an amount (free / unpriced with a blank price cell). */
export const missingInvoiceAmounts = (lines: InvoicePriceLine[]) =>
  lines.filter((line) => line.needsAmount && parseCell(line.unitPrice) === null).length;

/** The invoice request's price keys of a line; a typed 0 stays 0, a blank discount / VAT cell is left out (server fallback). */
export function invoicePriceFields(line: InvoicePriceLine): { unitPrice: number; discountPercent?: number; vatPercent?: number } {
  const discountPercent = parseCell(line.discountPercent);
  const vatPercent = parseCell(line.vatPercent);
  return {
    unitPrice: parseCell(line.unitPrice) ?? 0,
    ...(discountPercent === null ? {} : { discountPercent }),
    ...(vatPercent === null ? {} : { vatPercent }),
  };
}

/** The invoice line differs from what the delivery gives, so the request must carry it as an override. */
export function invoiceLineOverridden(line: InvoicePriceLine, delivery: DeliveryLinePricing): boolean {
  if (line.needsAmount || line.source !== "delivery") return true;
  const same = (cell: string, value: number | null | undefined) => (parseCell(cell) ?? 0) === (value ?? 0);
  return (
    !same(line.unitPrice, delivery.unitPrice) ||
    !same(line.discountPercent, delivery.discountPercent) ||
    !same(line.vatPercent, delivery.vatPercent)
  );
}

/** "N satırın tutarı eksik" header tag of an invoice form; null when all lines have an amount. */
export const missingAmountsLabel = (count: number) => (count > 0 ? `${count} satırın tutarı eksik` : null);

/** The stock card list price suggestion of a free / unpriced line (same currency only). */
export function listPriceSuggestion(
  stock: { salesListPrice?: number | null; purchaseListPrice?: number | null; priceCurrencyCode?: string } | undefined,
  side: "sales" | "purchase",
  documentCurrency: string | null | undefined,
): number | null {
  if (!stock) return null;
  const price = side === "sales" ? stock.salesListPrice : stock.purchaseListPrice;
  if (price === null || price === undefined) return null;
  if (documentCurrency && stock.priceCurrencyCode && stock.priceCurrencyCode !== documentCurrency) return null;
  return price;
}
