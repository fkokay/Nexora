export type Campaign = {
  id: string
  code: string
  name: string
  discountPercent: number
  effectiveFrom: string
  effectiveThrough: string
  isActive: boolean
  applicationCount: number
}

export type CampaignScreenField = { key: string; label: string; visible: boolean; position: number }
export type PerformanceScreenField = { key: string; label: string; visible: boolean; position: number }

export type Quote = {
  id: string
  code: string
  customerName: string
  quoteDate: string
  status: string
  grandTotal: number
  lineCount: number
}

export type Performance = {
  campaignId: string
  code: string
  name: string
  discountPercent: number
  effectiveFrom: string
  effectiveThrough: string
  isActive: boolean
  applications: number
  discountTotals: { currencyCode: string; amount: number }[]
  appliedQuotes: number
  linkedOrders: number
  linkedOrderTotals: { currencyCode: string; amount: number }[]
}

export type PerformancePage = {
  items: Performance[]
  page: number
  pageSize: number
  totalCount: number
  method: string
}
