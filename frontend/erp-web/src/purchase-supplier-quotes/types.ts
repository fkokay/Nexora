export type Quote = {
  id: string
  purchaseRequestId: string
  requestCode: string
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
  requestCode: string
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
