// Belge kalıbının sunucu uçları (belge kuralları PR 2): model, belge, örnek belge, alan değişince dolanlar, hesap, kayıt ve geçişler.
// Belge modeline özgü her şey (uç kökü, kayıt anahtarı, başlık alanları, gövdeler) `DocumentBinding` kayıtlarındadır.
import { api } from "../erpApi";

export type DocumentField = {
  code: string; label: string; type: string; required: boolean; optionsOperation: string | null; readOnly: boolean;
  /** `select` alanının sabit seçenekleri. */
  options?: { value: string; label: string }[] | null;
};
export type DocumentLineColumn = {
  code: string; label: string; type: string; required: boolean; calculated: boolean; optionsOperation: string | null; visibleFrom: string | null;
};
export type DocumentState = { code: string; label: string; terminal: boolean };
export type DocumentTransition = { code: string; label: string; from: string[]; to: string; operation: string; requiresReason: boolean };
/** "Belgeden belge": sonraki belgeyi bu belgeden yaratıp açan eylem (durum geçişi değildir). `target`: yaratılan belgenin modeli. */
export type DocumentCreation = { code: string; label: string; from: string[]; operation: string; target: string };
export type DocumentModel = {
  code: string; label: string; fields: DocumentField[]; lineColumns: DocumentLineColumn[]; states: DocumentState[];
  transitions: DocumentTransition[]; fills: Record<string, string[]>; creations?: DocumentCreation[] | null;
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
  allowedCreations?: string[] | null;
} & Record<string, unknown>;

/** Belgenin modelden bağımsız satırı (sipariş ya da teklif satırı). */
export type DocLine = {
  lineNumber: number; stockItemId: string; stockCode: string; stockName: string; unitCode: string; quantity: number; unitPrice: number;
  discountPercent: number | null; vatPercent: number | null; lineSubtotal: number; discountAmount: number; taxAmount: number; lineTotal: number;
  deliveredQuantity?: number; enteredCurrencyCode?: string | null; enteredUnitPrice?: number | null; enteredUnitCode?: string | null;
  isVatIncluded?: boolean; exchangeRate?: number; salesRequestLineNumber?: number | null;
  /** İrsaliye satırı: fiyat isteğe bağlıdır (bedelsiz ya da fiyatsız satır); izleme ve raf bilgisi Belge'de görünmez, kayıtta geri gönderilir. */
  isFreeOfCharge?: boolean; trackingCode?: string | null; expiryDate?: string | null; storageLocationId?: string | null;
};
/** Belgenin modelden bağımsız kaydı. `values`: tarih ve metin başlık alanları (modelin alan koduyla). */
export type DocView = {
  id: string; code: string; customerId: string | null; customerName: string; currencyCode: string; status: string;
  salespersonEmployeeId: string | null; values: Record<string, string>; prospectCustomerName: string | null;
  customFields: CustomFieldValue[]; lines: DocLine[];
};
export type BelgeDocument = {
  doc: DocView; amounts: DocumentAmounts; allowedTransitions: string[]; activity: ActivityRow[]; activityStartedLate: boolean; approval: DocumentApproval | null;
  /** Bu belgeden şimdi yaratılabilen sonraki belgeler (modelin `creations` kodları). */
  allowedCreations: string[];
};

export type PreviewLine = { rowKey: string | null; lineSubtotal: number; discountAmount: number; taxAmount: number; lineTotal: number };
export type PreviewTax = { code: string; name: string; rate: number; treatment: string; taxableAmount: number; amount: number };
export type OrderPreview = {
  currencyCode: string; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; lines: PreviewLine[]; taxes: PreviewTax[];
};
export type PreviewLineRequest = {
  rowKey: string; stockItemId: string; quantity: number; unitPrice: number; discountPercent: number; vatPercent: number;
  unitCode?: string; currencyCode?: string; isVatIncluded?: boolean;
  /** İrsaliye satırı: bedelsiz işareti ve geri gönderilen izleme / raf bilgisi. */
  isFreeOfCharge?: boolean; trackingCode?: string; expiryDate?: string; storageLocationId?: string;
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
  /** Kayıt isteğinin tekrar deneme anahtarı (yalnız tek yazmayla kesilen belgeler kullanır). */
  requestId: string;
};

/**
 * Belge modelinin ERP tarafındaki bağı: uçlar, kayıt anahtarı, başlık alanları ve gövdeler. Yeni bir belge modeli buraya bir kayıt ekler
 * (docs/runbooks/yeni-belge-modeli.md); DocumentTemplate modele özgü hiçbir şey bilmez.
 */
export type DocumentBinding = {
  code: string; noun: string; newTitle: string;
  /** Yeni belgede kaydetme düğmesinin adı (varsayılan "Kaydet") ve kayıttan sonraki ileti: tek yazmayla kesilen belgelerde (fatura) kayıt taslak değil belgenin kendisidir. */
  saveLabel?: string; savedMessage?: string;
  /** Kaydın yazıldığı uç kökü (varsayılan `base`): irsaliye belgesi `/api/sales/deliveries` okur, `/api/sales/standalone-deliveries` yazar. */
  writeBase?: string;
  /** Geçişin uç kökü (varsayılan `base`). */
  transitionBases?: Record<string, string>;
  /** false ise belgenin özel alanı yoktur (`{base}/custom-fields` okunmaz). */
  customFields?: boolean;
  /** Satırda fiyat isteğe bağlıdır (bedelsiz ya da fiyatsız satır gönderilir). */
  unpricedLines?: boolean;
  /** Sunucu yanıtındaki kayıt anahtarı. */
  entity: "order" | "quote" | "invoice" | "delivery";
  /** Belgenin uç kökü: `{base}/{id}/document`, `{base}/preview`, `{base}/custom-fields`, kayıt `POST/PUT {base}`. */
  base: string;
  transitionRoutes: Record<string, string>;
  /** "Belgeden belge" eylemlerinin uçları: `{base}/{id}/{route}` (POST); yanıt yaratılan belgenin kaydıdır (`id`). */
  creationRoutes: Record<string, string>;
  /** Belgeyi gösteren sistem sayfasının anahtarı (belgeden belge yeni belgeyi bu sayfada açar). */
  pageKey: string;
  maxLines: number;
  /** Başlıkta düzenlenen tarih ve metin alanlarının kodları. */
  dateFields: string[]; textFields: string[];
  newValues: () => Record<string, string>;
  valuesOf: (entity: Record<string, unknown>) => Record<string, string>;
  /** Hesap ucunun gövdesi; müşteri (ya da teklif alıcısı) yoksa null. */
  previewBody: (h: HeaderValues, lines: PreviewLineRequest[]) => Record<string, unknown> | null;
  writeBody: (h: HeaderValues, lines: WriteLine[], customFields: Record<string, string | null>) => Record<string, unknown>;
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const str = (value: unknown) => (typeof value === "string" ? value : "");

const ORDER_BINDING: DocumentBinding = {
  code: "satis.siparis", noun: "sipariş", newTitle: "Yeni sipariş", entity: "order", base: "/api/sales/orders",
  transitionRoutes: { onayla: "approve", onayiGeriAl: "unapprove", iptal: "cancel" }, creationRoutes: {}, pageKey: "sales-order-document", maxLines: 200,
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
  transitionRoutes: { ilet: "send", kabulEt: "accept", reddet: "reject" }, creationRoutes: { siparisOlustur: "convert-to-order" },
  pageKey: "sales-quote-document", maxLines: 100,
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

const INVOICE_BINDING: DocumentBinding = {
  code: "satis.fatura", noun: "fatura", newTitle: "Yeni fatura", entity: "invoice", base: "/api/sales/invoices",
  saveLabel: "Faturayı kes", savedMessage: "Fatura kesildi.",
  transitionRoutes: { iptal: "void" }, maxLines: 200,
  dateFields: ["invoiceDate"], textFields: ["eDocumentScenario", "eDocumentTypeCode", "eDocumentRecipientAlias", "notes", "invoiceType", "accountingProfileCode", "warehouseId"],
  newValues: () => ({ invoiceDate: today(), warehouseId: "", warehouseIdLabel: "", invoiceType: "Wholesale", accountingProfileCode: "", accountingProfileCodeLabel: "",
    eDocumentScenario: "", eDocumentTypeCode: "", eDocumentRecipientAlias: "", notes: "" }),
  valuesOf: (e) => ({ invoiceDate: str(e.invoiceDate) || today(), warehouseId: str(e.warehouseId), warehouseIdLabel: str(e.warehouseName),
    invoiceType: str(e.invoiceType) || "Wholesale", accountingProfileCode: str(e.accountingProfileCode), accountingProfileCodeLabel: str(e.accountingProfileCode),
    eDocumentScenario: str(e.eDocumentScenario), eDocumentTypeCode: str(e.eDocumentTypeCode), eDocumentRecipientAlias: str(e.eDocumentRecipientAlias), notes: str(e.notes) }),
  previewBody: (h, lines) => h.customerId
    ? { customerId: h.customerId, invoiceDate: h.values.invoiceDate, warehouseId: h.values.warehouseId || undefined,
      accountingProfileCode: h.values.accountingProfileCode || undefined, invoiceType: h.values.invoiceType || "Wholesale", lines } : null,
  // Fatura kesilince değişmez; kayıt tek yazmadır (fatura + irsaliye). e-Arşiv ayrıntıları Belge'de yoktur, gönderilmez.
  writeBody: (h, lines, customFields) => {
    const eDocument = { scenario: h.values.eDocumentScenario || null, typeCode: h.values.eDocumentTypeCode || null, recipientAlias: h.values.eDocumentRecipientAlias || null };
    return {
      requestId: h.requestId, customerId: h.customerId, warehouseId: h.values.warehouseId, invoiceDate: h.values.invoiceDate,
      invoiceType: h.values.invoiceType || "Wholesale", accountingProfileCode: h.values.accountingProfileCode || null,
      eDocument: Object.values(eDocument).some(Boolean) ? eDocument : null, notes: h.values.notes || null, customFields, lines };
  },
};

const DELIVERY_BINDING: DocumentBinding = {
  code: "satis.irsaliye", noun: "irsaliye", newTitle: "Yeni irsaliye", entity: "delivery", base: "/api/sales/deliveries", writeBase: "/api/sales/standalone-deliveries",
  transitionRoutes: { sevket: "post", iptal: "void" }, transitionBases: { sevket: "/api/sales/standalone-deliveries" },
  customFields: false, unpricedLines: true, maxLines: 200,
  dateFields: ["deliveryDate"], textFields: ["code"],
  newValues: () => ({ code: `IRS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${new Date().toISOString().slice(11, 16).replace(":", "")}`, deliveryDate: today(),
    warehouseId: "", warehouseIdLabel: "" }),
  valuesOf: (e) => ({ code: str(e.code), deliveryDate: str(e.deliveryDate) || today(), warehouseId: str(e.warehouseId), warehouseIdLabel: str(e.warehouseName) }),
  // İrsaliyenin hesap ucu yoktur: tutarlar kaydedilmiş fiyatlardan gelir, düzenlerken kayıttan sonra yenilenir.
  previewBody: () => null,
  writeBody: (h, lines) => ({ requestId: h.requestId, code: h.values.code, customerId: h.customerId, warehouseId: h.values.warehouseId, deliveryDate: h.values.deliveryDate, lines }),
};

/** Bağı olan belge modelleri; bilinmeyen kod için null döner (çağıran hata gösterir, sipariş bağına düşmez). */
export const DOCUMENT_BINDINGS: Record<string, DocumentBinding> = { [ORDER_BINDING.code]: ORDER_BINDING, [QUOTE_BINDING.code]: QUOTE_BINDING, [INVOICE_BINDING.code]: INVOICE_BINDING, [DELIVERY_BINDING.code]: DELIVERY_BINDING };
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
      id: str(entity.id), code: str(entity.code), customerId: (entity.customerId as string | null | undefined) || null, customerName: str(entity.customerName),
      currencyCode: str(entity.currencyCode), status: str(entity.status), salespersonEmployeeId: (entity.salespersonEmployeeId as string | null | undefined) ?? null,
      values: binding.valuesOf(entity), prospectCustomerName: (entity.prospectCustomerName as string | null | undefined) ?? null,
      customFields: (entity.customFields as CustomFieldValue[] | null | undefined) ?? [], lines,
    },
    amounts: raw.amounts, allowedTransitions: raw.allowedTransitions, activity: raw.activity, activityStartedLate: raw.activityStartedLate,
    approval: raw.approval ?? null, allowedCreations: raw.allowedCreations ?? [],
  };
}

const PROFILE_OPERATION = "satinalma.faturaGirisi.mevzuatProfilleri";

/** Seçim alanlarının liste uçları (modelin `optionsOperation` kodları). */
export const OPTION_ROUTES: Record<string, string> = {
  "cari.listele": "/api/customers",
  "stok.kart.listele": "/api/stock/items",
  "ik.personel.listele": "/api/hr/employees",
  "depo.listele": "/api/warehouses",
  "satinalma.faturaGirisi.mevzuatProfilleri": "/api/finance/general-ledger/rule-profiles",
};

export const loadDocumentModel = (code: string, token?: string) => api<DocumentModel>(`/api/document-models/${encodeURIComponent(code)}`, token);
export const loadDocument = async (binding: DocumentBinding, id: string, token?: string) =>
  normalizeDocument(binding, await api<RawDocument>(`${binding.base}/${encodeURIComponent(id)}/document`, token));
export const loadSampleDocument = async (binding: DocumentBinding, state: string, token?: string) =>
  normalizeDocument(binding, await api<RawDocument>(`/api/document-models/${encodeURIComponent(binding.code)}/sample?state=${encodeURIComponent(state)}`, token));
export const loadCustomFieldDefinitions = (binding: DocumentBinding, token?: string) =>
  binding.customFields === false ? Promise.resolve([] as CustomFieldDefinition[]) : api<CustomFieldDefinition[]>(`${binding.base}/custom-fields`, token);

export const fillLine = (code: string, field: string, value: string, token?: string) =>
  api<{ values: Record<string, unknown> }>(`/api/document-models/${encodeURIComponent(code)}/fill`, token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value }) });

export const previewDocument = (binding: DocumentBinding, body: Record<string, unknown>, token: string | undefined, signal: AbortSignal) =>
  api<OrderPreview>(`${binding.base}/preview`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

export const saveDocument = (binding: DocumentBinding, id: string | null, body: Record<string, unknown>, token?: string) =>
  api<{ id: string }>(id ? `${binding.writeBase ?? binding.base}/${encodeURIComponent(id)}` : binding.writeBase ?? binding.base, token,
    { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const runTransition = (binding: DocumentBinding, id: string, code: string, reason: string | null, token?: string) =>
  api<unknown>(`${binding.transitionBases?.[code] ?? binding.base}/${encodeURIComponent(id)}/${binding.transitionRoutes[code] ?? code}`, token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), reason }) });

/** Belgeden belge: modelin eylemini çağırır (var olan ERP işlemi); yaratılan belgenin kimliğini döner. */
export const runCreation = (binding: DocumentBinding, id: string, code: string, token?: string) =>
  api<{ id: string }>(`${binding.base}/${encodeURIComponent(id)}/${binding.creationRoutes[code] ?? code}`, token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID() }) });

export async function searchOptions(operation: string, text: string, token?: string): Promise<LookupRow[]> {
  const route = OPTION_ROUTES[operation];
  if (!route) return [];
  const result = await api<{ items?: LookupRow[] } | LookupRow[]>(`${route}?q=${encodeURIComponent(text)}&pageSize=20`, token);
  const rows = Array.isArray(result) ? result : result.items ?? [];
  // Vergi profili kodla seçilir (sunucu profili `accountingProfileCode` ile arar) ve liste süzülmeden gelir.
  if (operation === PROFILE_OPERATION) {
    const needle = text.trim().toLocaleLowerCase("tr-TR");
    return (rows as unknown as { profileCode: string; name: string }[]).filter((r) => !needle || `${r.profileCode} ${r.name}`.toLocaleLowerCase("tr-TR").includes(needle))
      .map((r) => ({ id: r.profileCode, code: r.profileCode, name: r.name }));
  }
  return rows;
}

export const lookupLabel = (row: LookupRow) => [row.code, row.name ?? row.fullName].filter(Boolean).join(" · ");
