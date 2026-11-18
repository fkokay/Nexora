import type { StatusTagTone } from "../list-page/StatusTag";

/** Turkish labels of journal entry / transfer source types (JournalEntry.SourceType). */
export const journalSourceTypeLabels: Record<string, string> = {
  SalesInvoice: "Satış faturası",
  PurchaseInvoice: "Alış faturası",
  SalesDelivery: "Satış irsaliyesi",
  PurchaseReceipt: "Mal kabul",
  SalesReturn: "Satış iadesi",
  SupplierReturn: "Tedarikçi iadesi",
  CustomerCollection: "Tahsilat",
  SupplierPayment: "Tedarikçi ödemesi",
  PaymentInstrumentEvent: "Çek/senet",
  FxRevaluation: "Kur değerleme",
  InventoryCostAdjustment: "Stok maliyet düzeltmesi",
  StandaloneInvoiceDraft: "Bağımsız alış faturası",
  Manual: "Manuel fiş",
  ManualReversal: "Ters kayıt",
  // Assigned by the fiscal-year close, fixed asset, credit facility and payroll endpoints.
  FiscalYearClose: "Dönem kapanışı",
  FiscalYearOpening: "Dönem açılışı",
  FixedAssetAcquisition: "Sabit kıymet edinimi",
  FixedAssetDepreciation: "Amortisman",
  FixedAssetDisposal: "Sabit kıymet çıkışı",
  CreditFacilityInterestAccrual: "Kredi faiz tahakkuku",
  CreditFacilityMovementReversal: "Kredi hareketi ters kaydı",
  PayrollCalculation: "Bordro",
};

/** Label of a source type; unknown values are shown as they are. */
export const journalSourceTypeLabel = (sourceType: string) =>
  journalSourceTypeLabels[sourceType] ?? sourceType;

/** Tag tone of a source type (mockup 09): manual entries blue, reversals orange, sourced entries grey. */
export const journalSourceTone = (sourceType: string): StatusTagTone =>
  sourceType === "Manual" ? "info" : sourceType === "ManualReversal" ? "warn" : "off";
