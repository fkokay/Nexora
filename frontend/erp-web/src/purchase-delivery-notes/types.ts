export type OrderSummary = { id: string; code: string; supplierName: string; orderDate: string; status: string; lineCount: number }
export type OrderLine = { lineNumber: number; stockCode: string; stockName: string; unitCode: string; quantity: number }
export type ReceiptLine = { orderLineNumber: number; quantity: number }
export type Receipt = { id: string; code: string; receiptDate: string; status: string; lines: ReceiptLine[] }
export type OrderDetail = OrderSummary & { lines: OrderLine[]; receipts: Receipt[] }
export type NoteLine = { orderLineNumber: number; unitCode: string; quantity: number }
export type Note = { id: string; documentNumber: string; documentDate: string; purchaseOrderId: string; purchaseOrderCode: string; supplierName: string; purchaseReceiptId: string | null; purchaseReceiptCode: string | null; lineCount: number; lines?: NoteLine[] }
export type NotePage = { items: Note[]; page: number; pageSize: number; totalCount: number }
export type ScreenField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null }

export const deliveryNotePageSize = 25

export const purchaseNoteDefaultFields: ScreenField[] = [
  { key: 'documentNumber', label: 'Tedarikçi irsaliye no', visible: true, position: 0 },
  { key: 'documentDate', label: 'Belge tarihi', visible: true, position: 1 },
  { key: 'purchaseOrderCode', label: 'Satın alma siparişi', visible: true, position: 2 },
  { key: 'supplierName', label: 'Tedarikçi', visible: true, position: 3 },
  { key: 'lineCount', label: 'Satır', visible: true, position: 4 },
  { key: 'purchaseReceiptCode', label: 'Mal kabul', visible: true, position: 5 },
  { key: 'actions', label: 'İşlemler', visible: true, position: 6, fixed: true },
]

export const detailGridDefaults: Record<string, ScreenField[]> = {
  'purchase-delivery-order-lines': [
    { key: 'lineNumber', label: 'Sipariş satırı', visible: true, position: 0 },
    { key: 'product', label: 'Ürün', visible: true, position: 1 },
    { key: 'orderedQuantity', label: 'Sipariş miktarı', visible: true, position: 2 },
    { key: 'deliveryQuantity', label: 'İrsaliye miktarı · sipariş birimi', visible: true, position: 3, fixed: true },
  ],
  'purchase-order-delivery-notes': [
    { key: 'documentNumber', label: 'Tedarikçi belge no', visible: true, position: 0 },
    { key: 'documentDate', label: 'Tarih', visible: true, position: 1 },
    { key: 'lineCount', label: 'Satır', visible: true, position: 2 },
    { key: 'purchaseReceiptCode', label: 'Mal kabul', visible: true, position: 3 },
    { key: 'actions', label: 'Bağlantı işlemi', visible: true, position: 4, fixed: true },
  ],
  'purchase-delivery-note-lines': [
    { key: 'orderLineNumber', label: 'Sipariş satırı', visible: true, position: 0 },
    { key: 'quantity', label: 'Miktar · temel birim', visible: true, position: 1 },
  ],
}
