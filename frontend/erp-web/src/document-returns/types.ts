/** Satış ve alış iadelerinin ortak görünümü; taraf farkı `returnSides` içinde çözülür. */
export type ReturnSide = "sales" | "purchase";

export type ReturnListItem = {
  id: string;
  code: string;
  invoiceId: string;
  invoiceCode: string;
  partyName: string;
  warehouseName: string;
  returnDate: string;
  status: "Posted" | "Voided";
  currencyCode: string;
  grandTotal: number;
  lineCount: number;
};

export type ReturnLine = {
  orderLineNumber: number;
  stockCode: string;
  stockName: string;
  unitCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  enteredQuantity?: number | null;
  enteredUnitCode?: string | null;
};

export type ReturnDetail = ReturnListItem & {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  lines: ReturnLine[];
};

type ApiRow = {
  id: string; code: string; invoiceCode: string; warehouseName: string; returnDate: string; status: "Posted" | "Voided";
  currencyCode: string; grandTotal: number; lineCount?: number; lines?: ReturnLine[];
  salesInvoiceId?: string; purchaseInvoiceId?: string; customerName?: string; supplierName?: string;
  subtotal?: number; discountTotal?: number; taxTotal?: number;
};

export type ReturnSideConfig = {
  basePath: string;
  /** Liste sayfası başlığı; menü adıyla aynıdır. */
  title: string;
  /** Belge türünün tekil adı. */
  singular: string;
  description: string;
  partyLabel: string;
  warehouseLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  effectNote: string;
  voidConfirm: (code: string) => string;
  voidedNotice: string;
  /** İadenin oluşturulduğu fatura listesi. */
  invoicePage: "sales-invoices" | "sales-purchase-invoices";
  gridId: string;
};

export const returnSides: Record<ReturnSide, ReturnSideConfig> = {
  sales: {
    basePath: "/api/sales/returns",
    title: "Satış İadeleri",
    singular: "Satış iadesi",
    description: "Müşterilerden geri alınan ürünler. İade stok girişi yapar ve müşteri cari hesabına alacak yazar.",
    partyLabel: "Müşteri",
    warehouseLabel: "İadenin alındığı depo",
    searchPlaceholder: "İade no, fatura veya müşteri ara",
    emptyMessage: "Henüz satış iadesi yok. İade, kesilmiş bir satış faturasının detayından oluşturulur.",
    effectNote: "İade seçilen depoya stok girişi yapar ve müşteri cari hesabına alacak yazar.",
    voidConfirm: (code) => `${code} iadesi iptal edilsin mi? Stok ve cari hareketleri ters kaydedilecek.`,
    voidedNotice: "Satış iadesi iptal edildi; stok ve cari kayıtları ters hareketle korundu.",
    invoicePage: "sales-invoices",
    gridId: "sales-returns-list",
  },
  purchase: {
    basePath: "/api/purchasing/returns",
    title: "Satınalma İadeleri",
    singular: "Alış iadesi",
    description: "Tedarikçilere geri gönderilen ürünler. İade stoktan düşülür ve tedarikçi borcunu azaltır.",
    partyLabel: "Tedarikçi",
    warehouseLabel: "İadenin çıktığı depo",
    searchPlaceholder: "İade no, fatura veya tedarikçi ara",
    emptyMessage: "Henüz alış iadesi yok. İade, kayıtlı bir alış faturasının detayından oluşturulur.",
    effectNote: "İade stoktan düşülür ve tedarikçi borcunu azaltır.",
    voidConfirm: (code) => `${code} alış iadesi iptal edilsin mi? Stok ve cari hareketleri ters kaydedilecek.`,
    voidedNotice: "Alış iadesi iptal edildi; stok ve cari kayıtları ters hareketle korundu.",
    invoicePage: "sales-purchase-invoices",
    gridId: "purchase-returns-list",
  },
};

export function toReturnListItem(row: ApiRow): ReturnListItem {
  return {
    id: row.id,
    code: row.code,
    invoiceId: row.salesInvoiceId ?? row.purchaseInvoiceId ?? "",
    invoiceCode: row.invoiceCode,
    partyName: row.customerName ?? row.supplierName ?? "",
    warehouseName: row.warehouseName,
    returnDate: row.returnDate,
    status: row.status,
    currencyCode: row.currencyCode,
    grandTotal: row.grandTotal,
    lineCount: row.lineCount ?? row.lines?.length ?? 0,
  };
}

export function toReturnDetail(row: ApiRow): ReturnDetail {
  return {
    ...toReturnListItem(row),
    subtotal: row.subtotal ?? 0,
    discountTotal: row.discountTotal ?? 0,
    taxTotal: row.taxTotal ?? 0,
    lines: row.lines ?? [],
  };
}

export const formatReturnDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
export const formatReturnAmount = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatReturnQuantity = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
