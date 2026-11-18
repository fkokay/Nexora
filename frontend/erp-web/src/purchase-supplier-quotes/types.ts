export type Quote = {
  id: string
  /** Talepsiz (doğrudan girilen) teklifte null. */
  purchaseRequestId: string | null
  requestCode: string | null
  code: string
  supplierId: string
  supplierName: string
  quoteDate: string
  validUntil: string | null
  currencyCode: string
  status: string
  grandTotal: number
  lineCount: number
  createdAt: string
}

export type QuoteLine = {
  requestLineNumber: number
  stockCode: string
  stockName: string
  unitCode: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type QuoteDetail = {
  id: string
  code: string
  requestCode: string | null
  supplierName: string
  quoteDate: string
  validUntil: string | null
  currencyCode: string
  status: string
  grandTotal: number
  notes: string | null
  lines: QuoteLine[]
}

export type QuotePage = {
  items: Quote[]
  page: number
  pageSize: number
  totalCount: number
}

export type ScreenField = {
  key: string
  label: string
  visible: boolean
  position: number
  fixed?: boolean
  width?: number | null
  pinned?: "left" | "right" | null
}
