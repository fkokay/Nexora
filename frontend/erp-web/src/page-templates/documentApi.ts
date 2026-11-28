// Belge kalıbının sunucu uçları (belge kuralları PR 2): model, belge, örnek belge, alan değişince dolanlar, hesap, kayıt ve geçişler.
// Belge modeline özgü her şey (uç kökü, kayıt anahtarı, başlık alanları, gövdeler) `DocumentBinding` kayıtlarındadır.
import { api } from "../erpApi";

export type DocumentField = { code: string; label: string; type: string; required: boolean; optionsOperation: string | null; readOnly: boolean };
export type DocumentLineColumn = {
  code: string; label: string; type: string; required: boolean; calculated: boolean; optionsOperation: string | null; visibleFrom: string | null;
};
export type DocumentState = { code: string; label: string; terminal: boolean };
export type DocumentTransition = { code: string; label: string; from: string[]; to: string; operation: string; requiresReason: boolean };
export type DocumentModel = {
  code: string; label: string; fields: DocumentField[]; lineColumns: DocumentLineColumn[]; states: DocumentState[];
  transitions: DocumentTransition[]; fills: Record<string, string[]>;
};

export type OrderLine = {
  lineNumber: number; stockItemId: string; stockCode: string; stockName: string; unitCode: string; quantity: number; unitPrice: number;
  discountPercent: number; vatPercent: number; lineSubtotal: number; discountAmount: number; taxAmount: number; lineTotal: number;
  deliveredQuantity: number; enteredCurrencyCode?: string | null; enteredUnitPrice?: number | null; enteredUnitCode?: string | null;
  isVatIncluded?: boolean; exchangeRateToOrderCurrency?: number;
};
export type CustomFieldValue = { code: string; label: string; dataType: string; maxLength: number; isRequired: boolean; value: string };
export type OrderView = {
  id: string; code: string; customerId: string; customerName: string; orderDate: string; currencyCode: string; status: string;
  subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; lines: OrderLine[];
  customFields?: CustomFieldValue[] | null; requestedDeliveryDate?: string | null; salespersonEmployeeId?: string | null;
};
export type VatRow = { rate: number; taxableAmount: number; amount: number };
export type DocumentAmounts = { currencyCode: string; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; vat: VatRow[] };
export type ActivityRow = { transition: string; step: string; source: string; outcome: string; message: string | null; createdAt: string };
/** Onay bekleyen siparişin kararı: şu anki adımın karar verecek kişileri ve bu kullanıcının karar verip veremeyeceği. */
export type DocumentApproval = { instanceId: string; step: string; approvers: string[]; canDecide: boolean };
export type SalesOrderDocument = {
  order: OrderView; amounts: DocumentAmounts; allowedTransitions: string[]; activity: ActivityRow[]; activityStartedLate: boolean;
  approval?: DocumentApproval | null;
};

/** Sunucunun belge yanıtı: kayıt `order` ya da `quote` anahtarında gelir (modele göre); {@link normalizeDocument} ortak biçime çevirir. */
export type RawDocument = {
  amounts: DocumentAmounts; allowedTransitions: string[]; activity: ActivityRow[]; activityStartedLate: boolean; approval?: DocumentApproval | null;
} & Record<string, unknown>;

/** Belgenin modelden bağımsız satırı (sipariş ya da teklif satırı). */
export type DocLine = {
  lineNumber: number; stockItemId: string; stockCode: string; stockName: string; unitCode: string; quantity: number; unitPrice: number;
  discountPercent: number; vatPercent: number; lineSubtotal: number; discountAmount: number; taxAmount: number; lineTotal: number;
  deliveredQuantity?: number; enteredCurrencyCode?: string | null; enteredUnitPrice?: number | null; enteredUnitCode?: string | null;
  isVatIncluded?: boolean; exchangeRate?: number; salesRequestLineNumber?: number | null; description?: string; expenseAccountId?: string | null; vatRate?: number | null;
};
/** Belgenin modelden bağımsız kaydı. `values`: tarih ve metin başlık alanları (modelin alan koduyla). */
export type DocView = {
  id: string; code: string; customerId: string | null; customerName: string; currencyCode: string; status: string;
  salespersonEmployeeId: string | null; values: Record<string, string>; prospectCustomerName: string | null;
  customFields: CustomFieldValue[]; lines: DocLine[]; rowVersion?: string;
};
export type BelgeDocument = {
  doc: DocView; amounts: DocumentAmounts; allowedTransitions: string[]; activity: ActivityRow[]; activityStartedLate: boolean; approval: DocumentApproval | null;
};

export type PreviewLine = { rowKey: string | null; lineSubtotal: number; discountAmount: number; taxAmount: number; lineTotal: number };
export type PreviewTax = { code: string; name: string; rate: number; treatment: string; taxableAmount: number; amount: number };
export type OrderPreview = {
  currencyCode: string; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; lines: PreviewLine[]; taxes: PreviewTax[];
};
export type PreviewLineRequest = {
  rowKey: string; stockItemId?: string; description?: string; expenseAccountId?: string; quantity: number; unitPrice: number; discountPercent: number; vatPercent: number;
  unitCode?: string; currencyCode?: string; isVatIncluded?: boolean;
  /** Dövizli satırın kayıtlı kuru: kayıt ve hesap bugünkü kuru yeniden aramasın diye geri gönderilir. */
  exchangeRateToQuoteCurrency?: number;
  /** Satış talebinden gelen teklif satırının talep satırı numarası (hücre olarak çizilmez; kayıtta geri gönderilir). */
  salesRequestLineNumber?: number;
};
export type WriteLine = Omit<PreviewLineRequest, "rowKey">;
export type CustomFieldDefinition = { code: string; label: string; dataType: string; maxLength: number; isRequired: boolean; isActive?: boolean };
export type LookupRow = { id: string; code?: string; name?: string; fullName?: string; currencyCode?: string };

/** Başlıktan bağın gövdelerine giden değerler. */
export type HeaderValues = {
  code: string; customerId: string; salespersonEmployeeId: string; currencyCode: string; values: Record<string, string>; prospectCustomerName: string;
};

/**
 * Belge modelinin ERP tarafındaki bağı: uçlar, kayıt anahtarı, başlık alanları ve gövdeler. Yeni bir belge modeli buraya bir kayıt ekler
 * (docs/runbooks/yeni-belge-modeli.md); DocumentTemplate modele özgü hiçbir şey bilmez.
 */
export type DocumentBinding = {
  code: string; noun: string; newTitle: string;
  /** Sunucu yanıtındaki kayıt anahtarı. */
  entity: "order" | "quote" | "purchaseOrder" | "invoice";
  /** Belgenin uç kökü: `{base}/{id}/document`, `{base}/preview`, `{base}/custom-fields`, kayıt `POST/PUT {base}`. */
  base: string;
  documentRoute?: (id: string) => string;
  calculateRoute?: string;
  customFieldRoute?: string | null;
  invoiceDraft?: boolean;
  transitionRoutes: Record<string, string>;
  maxLines: number;
  /** Başlıkta düzenlenen tarih ve metin alanlarının kodları. */
  dateFields: string[]; textFields: string[];
  newValues: () => Record<string, string>;
  valuesOf: (entity: Record<string, unknown>) => Record<string, string>;
  /** Hesap ucunun gövdesi; müşteri (ya da teklif alıcısı) yoksa null. */
  previewBody: (h: HeaderValues, lines: PreviewLineRequest[]) => Record<string, unknown> | null;
  writeBody: (h: HeaderValues, lines: WriteLine[], customFields: Record<string, string | null>, existing?: Record<string, unknown>) => Record<string, unknown>;
};

const PURCHASE_ORDER_BINDING: DocumentBinding = {
  code: "satinalma.siparis", noun: "sipariş", newTitle: "Yeni satınalma siparişi", entity: "purchaseOrder",
  base: "/api/purchasing/orders", documentRoute: (id) => `/api/purchasing/orders/${encodeURIComponent(id)}/document`,
  calculateRoute: "/api/document-models/satinalma.siparis/calculate", customFieldRoute: "/api/purchasing/orders/custom-fields", maxLines: 200,
  transitionRoutes: {}, dateFields: ["orderDate", "expectedReceiptDate"], textFields: ["notes"],
  newValues: () => ({ orderDate: today(), expectedReceiptDate: "", targetWarehouseId: "", targetWarehouseIdLabel: "", notes: "" }),
  valuesOf: (e) => ({ orderDate: str(e.orderDate) || today(), expectedReceiptDate: str(e.expectedReceiptDate),
    targetWarehouseId: str(e.targetWarehouseId), targetWarehouseIdLabel: str(e.targetWarehouseName), notes: str(e.notes) }),
  previewBody: (h, lines) => ({ currencyCode: h.currencyCode || "TRY", lines }),
  writeBody: (h, lines) => ({ code: h.code, supplierId: h.customerId, orderDate: h.values.orderDate, expectedReceiptDate: h.values.expectedReceiptDate || null,
    currencyCode: h.currencyCode || "TRY", targetWarehouseId: h.values.targetWarehouseId || null, notes: h.values.notes || null, lines }),
};

const PURCHASE_INVOICE_BINDING: DocumentBinding = {
  code: "satinalma.fatura", noun: "fatura taslağı", newTitle: "Yeni satınalma faturası", entity: "invoice", invoiceDraft: true,
  base: "/api/purchasing/standalone-invoices", documentRoute: (id) => `/api/purchasing/standalone-invoices/${encodeURIComponent(id)}/document`,
  calculateRoute: "/api/document-models/satinalma.fatura/calculate", customFieldRoute: null, maxLines: 200,
  transitionRoutes: { muhasebelestir: "post" }, dateFields: ["invoiceDate", "dueDate"], textFields: ["invoiceNumber", "notes"],
  newValues: () => ({ invoiceNumber: "", invoiceDate: today(), dueDate: "", notes: "" }),
  valuesOf: (e) => ({ invoiceNumber: str(e.invoiceNumber) || str(e.code), invoiceDate: str(e.invoiceDate) || today(), dueDate: str(e.dueDate),
    notes: str(e.notes), receiptCode: str(e.receiptCode) }),
  previewBody: (h, lines) => ({ currencyCode: h.currencyCode || "TRY", lines }),
  writeBody: (h, lines, _custom, existing) => ({ ...(existing ? { expectedRowVersion: existing.rowVersion } : { requestId: crypto.randomUUID() }),
    supplierId: h.customerId, invoiceNumber: h.values.invoiceNumber || h.code, invoiceDate: h.values.invoiceDate, dueDate: h.values.dueDate || null,
    currencyCode: h.currencyCode || "TRY", notes: h.values.notes || null,
    lines: lines.map((line, i) => ({ lineNumber: i + 1, description: line.description, quantity: line.quantity, unitCode: line.unitCode || null,
      unitPrice: line.unitPrice, subtotal: line.quantity * line.unitPrice, discountAmount: 0, taxAmount: line.quantity * line.unitPrice * line.vatPercent / 100,
      total: line.quantity * line.unitPrice * (1 + line.vatPercent / 100), expenseAccountId: line.expenseAccountId || null,
      vatRate: line.vatPercent, standalonePurchaseReceiptLineId: null })) }),
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const str = (value: unknown) => (typeof value === "string" ? value : "");

const ORDER_BINDING: DocumentBinding = {
  code: "satis.siparis", noun: "sipariş", newTitle: "Yeni sipariş", entity: "order", base: "/api/sales/orders",
  transitionRoutes: { onayla: "approve", onayiGeriAl: "unapprove", iptal: "cancel" }, maxLines: 200,
  dateFields: ["orderDate", "requestedDeliveryDate"], textFields: [],
  newValues: () => ({ orderDate: today(), requestedDeliveryDate: "" }),
  valuesOf: (e) => ({ orderDate: str(e.orderDate) || today(), requestedDeliveryDate: str(e.requestedDeliveryDate) }),
  previewBody: (h, lines) => h.customerId
    ? { customerId: h.customerId, orderDate: h.values.orderDate, currencyCode: h.currencyCode || undefined, lines } : null,
  writeBody: (h, lines, customFields) => ({
    code: h.code, customerId: h.customerId, orderDate: h.values.orderDate, requestedDeliveryDate: h.values.requestedDeliveryDate || null,
    currencyCode: h.currencyCode, salespersonEmployeeId: h.salespersonEmployeeId || null, customFields, lines }),
};

const QUOTE_BINDING: DocumentBinding = {
  code: "satis.teklif", noun: "teklif", newTitle: "Yeni teklif", entity: "quote", base: "/api/sales/quotes",
  transitionRoutes: { ilet: "send", kabulEt: "accept", reddet: "reject" }, maxLines: 100,
  dateFields: ["quoteDate", "validUntil"], textFields: ["deliveryTerms", "notes"],
  newValues: () => ({ quoteDate: today(), validUntil: inDays(30), deliveryTerms: "", notes: "" }),
  valuesOf: (e) => ({ quoteDate: str(e.quoteDate) || today(), validUntil: str(e.validUntil) || inDays(30), deliveryTerms: str(e.deliveryTerms), notes: str(e.notes) }),
  // Teklif hesabı döviz ister (siparişteki gibi müşteriden türetmez) ve kayıtsız alıcıyla da çalışır.
  previewBody: (h, lines) => h.customerId || h.prospectCustomerName
    ? { customerId: h.customerId || undefined, prospectCustomerName: h.customerId ? undefined : h.prospectCustomerName,
      quoteDate: h.values.quoteDate, validUntil: h.values.validUntil, currencyCode: h.currencyCode || "TRY", lines } : null,
  // Kayıt notları, teslimat koşullarını ve kayıtsız alıcıyı da yazar: Belge göstermese de geri gönderir, yoksa PUT bunları siler.
  writeBody: (h, lines, customFields) => ({
    code: h.code, customerId: h.customerId || null, prospectCustomerName: h.customerId ? null : h.prospectCustomerName || null,
    quoteDate: h.values.quoteDate, validUntil: h.values.validUntil, currencyCode: h.currencyCode || "TRY",
    notes: h.values.notes || null, deliveryTerms: h.values.deliveryTerms || null,
    salespersonEmployeeId: h.salespersonEmployeeId || null, customFields, lines }),
};

/** Bağı olan belge modelleri; bilinmeyen kod için null döner (çağıran hata gösterir, sipariş bağına düşmez). */
export const DOCUMENT_BINDINGS: Record<string, DocumentBinding> = { [ORDER_BINDING.code]: ORDER_BINDING, [QUOTE_BINDING.code]: QUOTE_BINDING,
  [PURCHASE_ORDER_BINDING.code]: PURCHASE_ORDER_BINDING, [PURCHASE_INVOICE_BINDING.code]: PURCHASE_INVOICE_BINDING };
export const bindingOf = (code: string): DocumentBinding | null => DOCUMENT_BINDINGS[code] ?? null;

type RawLine = Record<string, unknown> & { lineNumber: number };

/** Sunucunun belge yanıtını ortak biçime çevirir (sipariş: `order`, teklif: `quote`). */
export function normalizeDocument(binding: DocumentBinding, raw: RawDocument): BelgeDocument {
  const entity = raw[binding.entity] as Record<string, unknown>;
  const lines = ((entity.lines ?? []) as RawLine[]).map((line): DocLine => ({
    ...(line as unknown as DocLine),
    exchangeRate: (line.exchangeRateToOrderCurrency ?? line.exchangeRateToQuoteCurrency) as number | undefined,
    salesRequestLineNumber: (line.salesRequestLineNumber as number | null | undefined) ?? null,
  }));
  return {
    doc: {
      id: str(entity.id), code: str(entity.code), customerId: (entity.customerId as string | null | undefined) || (entity.supplierId as string | null | undefined) || null, customerName: str(entity.customerName) || str(entity.supplierName),
      currencyCode: str(entity.currencyCode), status: str(entity.status), salespersonEmployeeId: (entity.salespersonEmployeeId as string | null | undefined) ?? null,
      values: binding.valuesOf(entity), prospectCustomerName: (entity.prospectCustomerName as string | null | undefined) ?? null,
      customFields: (entity.customFields as CustomFieldValue[] | null | undefined) ?? [], lines,
      rowVersion: str(entity.rowVersion) || undefined,
    },
    amounts: raw.amounts, allowedTransitions: raw.allowedTransitions, activity: raw.activity, activityStartedLate: raw.activityStartedLate,
    approval: raw.approval ?? null,
  };
}

/** Seçim alanlarının liste uçları (modelin `optionsOperation` kodları). */
export const OPTION_ROUTES: Record<string, string> = {
  "cari.listele": "/api/customers",
  "stok.kart.listele": "/api/stock/items",
  "ik.personel.listele": "/api/hr/employees",
  "satinalma.faturaTaslagi.tedarikciler": "/api/purchasing/standalone-invoices/suppliers",
  "satinalma.faturaTaslagi.giderHesaplari": "/api/finance/general-ledger/accounts?statementSection=Expense&activeOnly=true",
  "depo.listele": "/api/warehouses",
};

export const loadDocumentModel = (code: string, token?: string) => api<DocumentModel>(`/api/document-models/${encodeURIComponent(code)}`, token);
export const loadDocument = async (binding: DocumentBinding, id: string, token?: string) => {
  if (binding.invoiceDraft) {
    try { return normalizeDocument(binding, await api<RawDocument>(`/api/purchasing/standalone-invoices/${encodeURIComponent(id)}/document`, token)); }
    catch (failure) {
      if ((failure as { status?: number }).status !== 404) throw failure;
      return normalizeDocument(binding, await api<RawDocument>(`/api/purchasing/invoices/${encodeURIComponent(id)}/document`, token));
    }
  }
  return normalizeDocument(binding, await api<RawDocument>(binding.documentRoute?.(id) ?? `${binding.base}/${encodeURIComponent(id)}/document`, token));
};
export const loadSampleDocument = async (binding: DocumentBinding, state: string, token?: string) =>
  normalizeDocument(binding, await api<RawDocument>(`/api/document-models/${encodeURIComponent(binding.code)}/sample?state=${encodeURIComponent(state)}`, token));
export const loadCustomFieldDefinitions = (binding: DocumentBinding, token?: string) => binding.customFieldRoute === null ? Promise.resolve([] as CustomFieldDefinition[])
  : api<CustomFieldDefinition[]>(binding.customFieldRoute ?? `${binding.base}/custom-fields`, token);

export const fillLine = (code: string, field: string, value: string, token?: string) =>
  api<{ values: Record<string, unknown> }>(`/api/document-models/${encodeURIComponent(code)}/fill`, token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value }) });

export const previewDocument = async (binding: DocumentBinding, body: Record<string, unknown>, token: string | undefined, signal: AbortSignal): Promise<OrderPreview> => {
  if (!binding.calculateRoute) return api<OrderPreview>(`${binding.base}/preview`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const result = await api<DocumentAmounts>(binding.calculateRoute, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  return { ...result, lines: [], taxes: result.vat.map((row) => ({ code: "VAT", name: `KDV %${row.rate}`, rate: row.rate, treatment: "Taxable", taxableAmount: row.taxableAmount, amount: row.amount })) };
};

export const saveDocument = (binding: DocumentBinding, id: string | null, body: Record<string, unknown>, token?: string) =>
  api<{ id: string }>(id ? `${binding.base}/${encodeURIComponent(id)}` : binding.base, token,
    { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const runTransition = (binding: DocumentBinding, id: string, code: string, reason: string | null, token?: string) => {
  const route = binding.invoiceDraft && code === "iptal"
    ? `/api/purchasing/invoices/${encodeURIComponent(id)}/void`
    : `${binding.base}/${encodeURIComponent(id)}/${binding.transitionRoutes[code] ?? code}`;
  return api<unknown>(route, token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), reason }) });
};

export async function searchOptions(operation: string, text: string, token?: string): Promise<LookupRow[]> {
  const route = OPTION_ROUTES[operation];
  if (!route) return [];
  const result = await api<{ items?: LookupRow[] } | LookupRow[]>(`${route}${route.includes("?") ? "&" : "?"}q=${encodeURIComponent(text)}&page=1&pageSize=20`, token);
  return Array.isArray(result) ? result : result.items ?? [];
}

export const lookupLabel = (row: LookupRow) => [row.code, row.name ?? row.fullName].filter(Boolean).join(" · ");
