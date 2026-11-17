import { DocumentStatusFlow, type DocumentFlowStep } from "../document-page/DocumentStatusFlow";
import { purchaseInvoiceStatus } from "../document-page/documentStatus";
import type { StatusTagTone } from "../list-page/StatusTag";
import type { SalesFormTotals } from "../sales/salesDocumentForm";
import { PurchaseOrderFlow } from "./purchaseOrderList";
import "./purchase-create-forms.css";

/*
 * Satınalma oluşturma ekranlarının ortak parçaları (taslak 02, belge düzenlenirken; Satış oluşturma ekranlarıyla aynı
 * başlık ve toplamlar): durum akışları ve sipariş toplamları. Yalnızca bugünkü durumlar çizilir; tutarlar ekranın
 * kendi hesabıdır.
 */

const step = (key: string, label: string): DocumentFlowStep => ({ key, label });

/**
 * Yeni satınalma siparişi: siparişin durum akışı (Onay bekliyor → Açık → Kısmen alındı → Tam alındı; İptal akış dışı).
 * Kayıt, onay akışına göre siparişi Onay bekliyor ya da Açık durumunda oluşturur; kaydetmeden önce geçerli adım yoktur.
 */
export function PurchaseCreateOrderFlow() {
  return <PurchaseOrderFlow />;
}

/** Mal kabul faturası: kayıt faturayı İşlendi durumunda oluşturur; kaydetmeden önce geçerli adım yoktur. */
export function PurchaseCreateInvoiceFlow() {
  return <DocumentStatusFlow steps={[step("Posted", purchaseInvoiceStatus("Posted").label)]} terminal={step("Voided", purchaseInvoiceStatus("Voided").label)} />;
}

/** Bağımsız fatura taslağı: Taslak → Muhasebeleştirildi. Oluşturma ve düzenleme taslağı kaydeder: geçerli adım Taslak. */
export function SupplierInvoiceDraftFlow() {
  return <DocumentStatusFlow steps={[step("Draft", "Taslak"), step("Posted", "Muhasebeleştirildi")]} current="Draft" />;
}

/** Durum etiketi: Taslak (muhasebeleştirilmeyi bekliyor) uyarı, Muhasebeleştirildi tamam. */
export function supplierInvoiceDraftTag(status: string): { tone: StatusTagTone; label: string } {
  return status === "Posted" ? { tone: "ok", label: "Muhasebeleştirildi" } : { tone: "warn", label: "Taslak" };
}

export type PurchaseCreateOrderLine = { quantity: string; unitPrice: string; discountPercent: string; vatPercent: string };

/**
 * Sipariş satırlarından oluşturma toplamları (bugünkü hesap: miktar × fiyat, iskonto yüzdesi, net üzerinden KDV),
 * KDV oranına göre matrah ve KDV dökümüyle (`salesFormTotalRows` bunları çizer).
 */
export function purchaseCreateOrderTotals(lines: PurchaseCreateOrderLine[]): SalesFormTotals {
  const totals: SalesFormTotals = { subtotal: 0, discount: 0, vat: 0, total: 0, taxableByRate: {}, vatByRate: {} };
  for (const line of lines) {
    const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
    const discount = gross * ((Number(line.discountPercent) || 0) / 100);
    const net = gross - discount;
    const rate = Number(line.vatPercent) || 0;
    const vat = net * (rate / 100);
    totals.subtotal += gross;
    totals.discount += discount;
    totals.vat += vat;
    totals.total += net + vat;
    totals.taxableByRate[rate] = (totals.taxableByRate[rate] || 0) + net;
    totals.vatByRate[rate] = (totals.vatByRate[rate] || 0) + vat;
  }
  return totals;
}
