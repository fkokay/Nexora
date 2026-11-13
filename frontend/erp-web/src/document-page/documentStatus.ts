import type { DocumentStatus } from "./DocumentSurface";

/**
 * Satış ve satınalma belgelerinin durum adları ve renk tonları için tek kaynak.
 * Aynı durum her ekranda aynı adla ve aynı tonla görünür; bilinmeyen bir durum ham
 * hâliyle, nötr tonda gösterilir.
 */
const unknown = (status: string): DocumentStatus => ({ label: status, tone: "neutral" });
const cancelled: DocumentStatus = { label: "İptal", tone: "neutral" };

/** Satış talebi (müşteri talebi). */
export function salesRequestStatus(status: string): DocumentStatus {
  switch (status) {
    case "Open": return { label: "Açık", tone: "warning" };
    case "Quoted": return { label: "Teklif verildi", tone: "success" };
    case "Cancelled": return cancelled;
    default: return unknown(status);
  }
}

export function salesQuoteStatus(status: string): DocumentStatus {
  switch (status) {
    case "Draft": return { label: "Taslak", tone: "neutral" };
    case "Sent": return { label: "İletildi", tone: "info" };
    case "Accepted": return { label: "Kabul edildi", tone: "success" };
    case "Rejected": return { label: "Reddedildi", tone: "danger" };
    case "Expired": return { label: "Süresi doldu", tone: "neutral" };
    default: return unknown(status);
  }
}

export function salesOrderStatus(status: string): DocumentStatus {
  switch (status) {
    case "Open": return { label: "Açık", tone: "warning" };
    case "Fulfilled": return { label: "Tamamlandı", tone: "success" };
    case "Cancelled": return cancelled;
    default: return unknown(status);
  }
}

export function salesDeliveryStatus(status: string): DocumentStatus {
  switch (status) {
    case "Draft": return { label: "Taslak", tone: "neutral" };
    case "Posted": return { label: "Sevk edildi", tone: "success" };
    case "Voided": return cancelled;
    case "Deleted": return { label: "Silindi", tone: "neutral" };
    default: return unknown(status);
  }
}

export function salesInvoiceStatus(status: string): DocumentStatus {
  switch (status) {
    case "Posted": return { label: "Kesildi", tone: "success" };
    case "Voided": return cancelled;
    default: return unknown(status);
  }
}

/** Satış ve alış iadesi. */
export function returnStatus(status: string): DocumentStatus {
  switch (status) {
    case "Posted": return { label: "İşlendi", tone: "success" };
    case "Voided": return cancelled;
    default: return unknown(status);
  }
}

export function purchaseRequestStatus(status: string): DocumentStatus {
  switch (status) {
    case "Submitted": return { label: "Onay bekliyor", tone: "warning" };
    case "Approved": return { label: "Onaylandı", tone: "info" };
    case "Rejected": return { label: "Reddedildi", tone: "danger" };
    case "Ordered": return { label: "Siparişe dönüştü", tone: "success" };
    default: return unknown(status);
  }
}

export function supplierQuoteStatus(status: string): DocumentStatus {
  switch (status) {
    case "Submitted": return { label: "Değerlendirmede", tone: "info" };
    case "Selected": return { label: "Seçildi", tone: "success" };
    case "NotSelected": return { label: "Seçilmedi", tone: "neutral" };
    default: return unknown(status);
  }
}

export function purchaseOrderStatus(status: string): DocumentStatus {
  switch (status) {
    case "Open": return { label: "Açık", tone: "warning" };
    case "PartiallyReceived": return { label: "Kısmi mal kabul", tone: "info" };
    case "Received": return { label: "Tam alındı", tone: "success" };
    case "PendingApproval": return { label: "Onay bekliyor", tone: "warning" };
    case "Rejected": return { label: "Reddedildi", tone: "danger" };
    case "Cancelled": return cancelled;
    default: return unknown(status);
  }
}

export function purchaseReceiptStatus(status: string): DocumentStatus {
  switch (status) {
    case "Draft": return { label: "Taslak", tone: "neutral" };
    case "Posted": return { label: "Kabul edildi", tone: "success" };
    case "Voided": return cancelled;
    default: return unknown(status);
  }
}

export function purchaseInvoiceStatus(status: string): DocumentStatus {
  switch (status) {
    case "Posted": return { label: "İşlendi", tone: "success" };
    case "Voided": return cancelled;
    default: return unknown(status);
  }
}
