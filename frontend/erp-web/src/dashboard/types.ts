export type ErpDashboardMonthTotal = { year: number; month: number; amount: number }
export type ErpDashboardCurrencyTotal = { currencyCode: string; amount: number; count: number }
export type ErpDashboardRecentOrder = { id: string; code: string; orderDate: string; customerName: string; grandTotal: number; currencyCode: string }
export type ErpDashboardStockItem = { id: string; code: string; name: string; amountBase: number }
export type ErpDashboardSummary = {
  baseCurrencyCode: string
  canReadSalesInvoices: boolean
  salesInvoiceTotals: ErpDashboardCurrencyTotal[]
  monthlySalesInvoices: ErpDashboardMonthTotal[]
  canReadSalesOrders: boolean
  openSalesOrderCount: number | null
  recentOpenSalesOrders: ErpDashboardRecentOrder[]
  canReadPurchaseInvoices: boolean
  monthlyPurchaseInvoices: ErpDashboardMonthTotal[]
  canReadPurchaseOrders: boolean
  openPurchaseOrderCount: number | null
  openPurchaseOrderTotals: ErpDashboardCurrencyTotal[]
  canReadInventory: boolean
  inventoryValueBase: number | null
  activeStockItemCount: number | null
  activeWarehouseCount: number | null
  topStockItems: ErpDashboardStockItem[]
}
export type TrendMonth = { key: string; label: string; fullLabel: string; sales: number; purchase: number }
