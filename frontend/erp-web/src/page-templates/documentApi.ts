// Belge kalıbının sunucu uçları (belge kuralları PR 2): model, belge, örnek belge, alan değişince dolanlar, hesap, kayıt ve geçişler.
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

export type PreviewLine = { rowKey: string | null; lineSubtotal: number; discountAmount: number; taxAmount: number; lineTotal: number };
export type PreviewTax = { code: string; name: string; rate: number; treatment: string; taxableAmount: number; amount: number };
export type OrderPreview = {
  currencyCode: string; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; lines: PreviewLine[]; taxes: PreviewTax[];
};
export type PreviewLineRequest = {
  rowKey: string; stockItemId: string; quantity: number; unitPrice: number; discountPercent: number; vatPercent: number;
  unitCode?: string; currencyCode?: string; isVatIncluded?: boolean;
  /** Dövizli satırın kayıtlı kuru: kayıt ve hesap bugünkü kuru yeniden aramasın diye geri gönderilir. */
  exchangeRateToQuoteCurrency?: number;
};
export type OrderWrite = {
  code: string; customerId: string; orderDate: string; requestedDeliveryDate: string | null; currencyCode: string;
  salespersonEmployeeId: string | null; customFields: Record<string, string | null>;
  lines: Omit<PreviewLineRequest, "rowKey">[];
};
export type CustomFieldDefinition = { code: string; label: string; dataType: string; maxLength: number; isRequired: boolean; isActive?: boolean };
export type LookupRow = { id: string; code?: string; name?: string; fullName?: string; currencyCode?: string };

const ORDERS = "/api/sales/orders";

/** Seçim alanlarının liste uçları (modelin `optionsOperation` kodları). */
export const OPTION_ROUTES: Record<string, string> = {
  "cari.listele": "/api/customers",
  "stok.kart.listele": "/api/stock/items",
  "ik.personel.listele": "/api/hr/employees",
};

export const loadDocumentModel = (code: string, token?: string) => api<DocumentModel>(`/api/document-models/${encodeURIComponent(code)}`, token);
export const loadSalesOrderDocument = (id: string, token?: string) => api<SalesOrderDocument>(`${ORDERS}/${encodeURIComponent(id)}/document`, token);
export const loadSampleDocument = (code: string, state: string, token?: string) =>
  api<SalesOrderDocument>(`/api/document-models/${encodeURIComponent(code)}/sample?state=${encodeURIComponent(state)}`, token);
export const loadCustomFieldDefinitions = (token?: string) => api<CustomFieldDefinition[]>(`${ORDERS}/custom-fields`, token);

export const fillLine = (code: string, field: string, value: string, token?: string) =>
  api<{ values: Record<string, unknown> }>(`/api/document-models/${encodeURIComponent(code)}/fill`, token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value }) });

export const previewOrder = (body: { customerId: string; orderDate: string; currencyCode?: string; lines: PreviewLineRequest[] }, token: string | undefined,
  signal: AbortSignal) =>
  api<OrderPreview>(`${ORDERS}/preview`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

export const saveOrder = (id: string | null, body: OrderWrite, token?: string) =>
  api<{ id: string }>(id ? `${ORDERS}/${encodeURIComponent(id)}` : ORDERS, token,
    { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const TRANSITION_ROUTES: Record<string, string> = { onayla: "approve", onayiGeriAl: "unapprove", iptal: "cancel" };

export const runTransition = (id: string, code: string, reason: string | null, token?: string) =>
  api<unknown>(`${ORDERS}/${encodeURIComponent(id)}/${TRANSITION_ROUTES[code] ?? code}`, token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), reason }) });

export async function searchOptions(operation: string, text: string, token?: string): Promise<LookupRow[]> {
  const route = OPTION_ROUTES[operation];
  if (!route) return [];
  const result = await api<{ items?: LookupRow[] } | LookupRow[]>(`${route}?q=${encodeURIComponent(text)}&pageSize=20`, token);
  return Array.isArray(result) ? result : result.items ?? [];
}

export const lookupLabel = (row: LookupRow) => [row.code, row.name ?? row.fullName].filter(Boolean).join(" · ");
