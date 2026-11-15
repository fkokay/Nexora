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
};

/** Label of a source type; unknown values are shown as they are. */
export const journalSourceTypeLabel = (sourceType: string) =>
  journalSourceTypeLabels[sourceType] ?? sourceType;
