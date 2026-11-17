import type { StockItem } from "../erp-types";
import type { RecordFormSectionState } from "../record-form/RecordForm";

/** Field values of the stock card form, in the string shape the inputs hold. */
export type StockCardValues = {
  code: string;
  name: string;
  barcode: string;
  unitCode: string;
  category: string;
  minimumStock: string;
  maximumStock: string;
  reorderPoint: string;
  safetyStock: string;
  procurementLeadTimeDays: string;
  manufacturingLeadTimeDays: string;
  trackingMode: StockItem["trackingMode"];
  purchaseListPrice: string;
  salesListPrice: string;
  priceCurrencyCode: string;
  purchaseVatPercent: string;
  salesVatPercent: string;
  exciseTaxPercent: string;
  communicationTaxPercent: string;
  withholdingTaxPercent: string;
  stampTaxPercent: string;
  purchaseDiscountPercent: string;
  salesDiscountPercent: string;
  netWeight: string;
  grossWeight: string;
  length: string;
  width: string;
  height: string;
  purchaseAccountCode: string;
  salesAccountCode: string;
  costAccountCode: string;
  productImageUrl: string;
  marketplaceProductId: string;
};
export type StockCardField = keyof StockCardValues;

/** A new card's values ("Temizle", "Kaydet ve Yeni" and the create form start from these). */
export const STOCK_CARD_DEFAULTS: StockCardValues = {
  code: "",
  name: "",
  barcode: "",
  unitCode: "EA",
  category: "",
  minimumStock: "0",
  maximumStock: "",
  reorderPoint: "",
  safetyStock: "0",
  procurementLeadTimeDays: "0",
  manufacturingLeadTimeDays: "0",
  trackingMode: "None",
  purchaseListPrice: "",
  salesListPrice: "",
  priceCurrencyCode: "TRY",
  purchaseVatPercent: "20",
  salesVatPercent: "20",
  exciseTaxPercent: "0",
  communicationTaxPercent: "0",
  withholdingTaxPercent: "0",
  stampTaxPercent: "0",
  purchaseDiscountPercent: "0",
  salesDiscountPercent: "0",
  netWeight: "",
  grossWeight: "",
  length: "",
  width: "",
  height: "",
  purchaseAccountCode: "",
  salesAccountCode: "",
  costAccountCode: "",
  productImageUrl: "",
  marketplaceProductId: "",
};

const text = (value: number | null | undefined) => (value == null ? "" : String(value));

/** The form values of a saved card, exactly as the edit form loads them (also the "changed fields" baseline). */
export function stockCardValuesOf(item: StockItem): StockCardValues {
  return {
    code: item.code,
    name: item.name,
    barcode: item.barcode || "",
    unitCode: item.unitCode,
    category: item.category || "",
    minimumStock: String(item.minimumStock),
    maximumStock: text(item.maximumStock),
    reorderPoint: text(item.reorderPoint),
    safetyStock: String(item.safetyStock ?? 0),
    procurementLeadTimeDays: String(item.procurementLeadTimeDays || 0),
    manufacturingLeadTimeDays: String(item.manufacturingLeadTimeDays || 0),
    trackingMode: item.trackingMode || "None",
    purchaseListPrice: text(item.purchaseListPrice),
    salesListPrice: text(item.salesListPrice),
    priceCurrencyCode: item.priceCurrencyCode || "TRY",
    purchaseVatPercent: String(item.purchaseVatPercent ?? 20),
    salesVatPercent: String(item.salesVatPercent ?? 20),
    exciseTaxPercent: String(item.exciseTaxPercent ?? 0),
    communicationTaxPercent: String(item.communicationTaxPercent ?? 0),
    withholdingTaxPercent: String(item.withholdingTaxPercent ?? 0),
    stampTaxPercent: String(item.stampTaxPercent ?? 0),
    purchaseDiscountPercent: String(item.purchaseDiscountPercent ?? 0),
    salesDiscountPercent: String(item.salesDiscountPercent ?? 0),
    netWeight: text(item.netWeight),
    grossWeight: text(item.grossWeight),
    length: text(item.length),
    width: text(item.width),
    height: text(item.height),
    purchaseAccountCode: item.purchaseAccountCode || "",
    salesAccountCode: item.salesAccountCode || "",
    costAccountCode: item.costAccountCode || "",
    productImageUrl: item.productImageUrl || "",
    marketplaceProductId: item.marketplaceProductId || "",
  };
}

/** Fields whose value differs from the baseline, in form order. */
export function changedStockCardFields(current: StockCardValues, baseline: StockCardValues): StockCardField[] {
  return (Object.keys(baseline) as StockCardField[]).filter((key) => current[key] !== baseline[key]);
}

/** Custom field codes whose value differs from the baseline (missing = empty). */
export function changedCustomFields(current: Record<string, string>, baseline: Record<string, string>): string[] {
  const codes = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  return [...codes].filter((code) => (current[code] ?? "") !== (baseline[code] ?? ""));
}

/** Fields of each form section (the Kimlik card above the sections belongs to the first one). */
export const STOCK_CARD_SECTION_FIELDS = {
  basic: [
    "code", "name", "barcode", "unitCode", "category",
    "minimumStock", "maximumStock", "reorderPoint", "safetyStock",
    "procurementLeadTimeDays", "manufacturingLeadTimeDays", "trackingMode",
  ],
  pricing: [
    "purchaseListPrice", "salesListPrice", "priceCurrencyCode",
    "purchaseVatPercent", "salesVatPercent", "exciseTaxPercent", "communicationTaxPercent",
    "withholdingTaxPercent", "stampTaxPercent", "purchaseDiscountPercent", "salesDiscountPercent",
  ],
  logistics: [
    "netWeight", "grossWeight", "length", "width", "height",
    "purchaseAccountCode", "salesAccountCode", "costAccountCode", "productImageUrl", "marketplaceProductId",
  ],
} satisfies Record<string, StockCardField[]>;

const REQUIRED: StockCardField[] = ["code", "name", "unitCode", "priceCurrencyCode"];
const PERCENT: StockCardField[] = [
  "purchaseVatPercent", "salesVatPercent", "exciseTaxPercent", "communicationTaxPercent",
  "withholdingTaxPercent", "stampTaxPercent", "purchaseDiscountPercent", "salesDiscountPercent",
];
const NUMBER: StockCardField[] = [
  "minimumStock", "maximumStock", "reorderPoint", "safetyStock", "procurementLeadTimeDays", "manufacturingLeadTimeDays",
  "purchaseListPrice", "salesListPrice", "netWeight", "grossWeight", "length", "width", "height", ...PERCENT,
];
const DAYS: StockCardField[] = ["procurementLeadTimeDays", "manufacturingLeadTimeDays"];

const filled = (value: string) => value.trim() !== "";

/** The input's own constraints (required, min / max, currency length): what the browser would reject. */
export function stockCardFieldInvalid(key: StockCardField, value: string): boolean {
  if (REQUIRED.includes(key) && !filled(value)) return true;
  if (key === "priceCurrencyCode") return value.trim().length !== 3;
  if (!NUMBER.includes(key) || !filled(value)) return false;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return true;
  if (PERCENT.includes(key)) return number > 100;
  if (DAYS.includes(key)) return number > 3650 || !Number.isInteger(number);
  return false;
}

/**
 * Section state: "error" when a field is required but empty or invalid, "done" when every required field is filled
 * and at least one field holds a value, else "empty". `extraFilled` counts other content (custom values, rows).
 */
export function stockCardSectionState(
  values: StockCardValues,
  fields: StockCardField[],
  { invalid = false, extraFilled = 0 }: { invalid?: boolean; extraFilled?: number } = {},
): RecordFormSectionState {
  if (invalid || fields.some((key) => stockCardFieldInvalid(key, values[key]))) return "error";
  return fields.some((key) => filled(values[key])) || extraFilled > 0 ? "done" : "empty";
}

/** "Kart doluluğu": filled fields over all fields of the Genel, Fiyat, Lojistik sections and the custom fields. */
export function stockCardCompletion(values: StockCardValues, customValues: string[]): number {
  const fields = [
    ...STOCK_CARD_SECTION_FIELDS.basic,
    ...STOCK_CARD_SECTION_FIELDS.pricing,
    ...STOCK_CARD_SECTION_FIELDS.logistics,
  ];
  const total = fields.length + customValues.length;
  const done = fields.filter((key) => filled(values[key])).length + customValues.filter(filled).length;
  return total ? Math.round((done / total) * 100) : 0;
}

export const TRACKING_LABELS: Record<StockItem["trackingMode"], string> = {
  None: "Kapalı",
  Lot: "Lot",
  Serial: "Seri numarası",
};

/** Meta line summary of a saved card: "Kategori · Birim · Lot takipli" (only the parts that exist). */
export function stockCardSummary(item: StockItem): string {
  return [
    item.category,
    item.unitCode,
    item.trackingMode === "Lot" ? "Lot takipli" : item.trackingMode === "Serial" ? "Seri no takipli" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
