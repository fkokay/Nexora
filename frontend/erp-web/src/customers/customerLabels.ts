import type { CustomerItem } from "../erp-types";
import type { StatusTagTone } from "../list-page/StatusTag";

/**
 * One name per account type, used by the list cell, the filter chip, the detail panel and the export
 * ("Both" was "Diğer" on the chip and "Müşteri & Tedarikçi" elsewhere).
 */
export const customerTypeLabels: Record<CustomerItem["type"], string> = {
  Customer: "Müşteri",
  Supplier: "Tedarikçi",
  Both: "Müşteri & Tedarikçi",
  Dealer: "Bayi",
  Employee: "Personel",
};

export function customerTypeLabel(type: string): string {
  return customerTypeLabels[type as CustomerItem["type"]] ?? type;
}

/** Tag tone of an account type (mockup 08: Müşteri blue, Tedarikçi orange, Personel grey). */
export function customerTypeTone(type: string): StatusTagTone {
  return type === "Supplier" ? "warn" : type === "Employee" ? "off" : "info";
}

/** Types that can open sales documents (the panel's former "Cari ile işlemler"). */
export const SALES_PARTY_TYPES: ReadonlyArray<string> = ["Customer", "Both", "Dealer"];

export const money2 = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
