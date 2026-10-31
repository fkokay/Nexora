import { useEffect, useMemo, useState } from 'react'
import { FileText, Package, ShoppingCart, Wallet } from 'lucide-react'
import type { ErpDashboardSummary, TrendMonth } from './dashboard/types'
import DashboardHeader from './dashboard/components/DashboardHeader'
import DashboardKpiGrid, { DashboardMetricCard } from './dashboard/components/DashboardKpiGrid'
import DashboardTrendPanel from './dashboard/components/DashboardTrendPanel'
import DashboardStockDistribution from './dashboard/components/DashboardStockDistribution'
import DashboardRecentOrders from './dashboard/components/DashboardRecentOrders'
import DashboardHighStockTable from './dashboard/components/DashboardHighStockTable'
import DashboardRightRail from './dashboard/components/DashboardRightRail'

export function DashboardPage({ tenantName, dashboardName, platformStatus, onNavigate, loadSummary }: {
  tenantName: string
  dashboardName?: string
  platformStatus: string
  onNavigate: (page: string) => void
  loadSummary: () => Promise<ErpDashboardSummary>
}) {
  const [summary, setSummary] = useState<ErpDashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void loadSummary()
      .then(value => { if (active) setSummary(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Ana sayfa özeti yüklenemedi.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadSummary, refreshKey])

  const currency = summary?.baseCurrencyCode || 'TRY'
  const money = (value: number, code = currency) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value)
  const salesTotals = summary?.salesInvoiceTotals ?? []
  const baseSales = salesTotals.find(row => row.currencyCode === currency)
  const foreignSales = salesTotals.filter(row => row.currencyCode !== currency && row.amount !== 0)
  const monthData = useMemo<TrendMonth[]>(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (5 - index))
    const sales = summary?.monthlySalesInvoices.find(row => row.year === date.getFullYear() && row.month === date.getMonth() + 1)?.amount ?? 0
    const purchase = summary?.monthlyPurchaseInvoices.find(row => row.year === date.getFullYear() && row.month === date.getMonth() + 1)?.amount ?? 0
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      label: new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(date),
      fullLabel: new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(date),
      sales,
      purchase,
    }
  }), [summary])
  const periodLabel = monthData.length ? `${monthData[0].label} – ${monthData[monthData.length - 1].label} ${new Date().getFullYear()}` : 'Son 6 ay'
  const purchaseTotals = summary?.openPurchaseOrderTotals ?? []
  const purchaseBase = purchaseTotals.find(row => row.currencyCode === currency)
  const purchaseBreakdown = purchaseTotals.filter(row => row.amount !== 0).slice(0, 2)
    .map(row => `${row.currencyCode} ${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(row.amount)}`).join(' · ')
  const topStock = summary?.topStockItems ?? []
  const orderRows = summary?.recentOpenSalesOrders ?? []
  const today = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())
  const platformLabel = platformStatus === 'ready' ? 'Çalışıyor' : platformStatus === 'unavailable' ? 'Erişilemiyor' : 'Kontrol ediliyor'

  return <div className="erp-home-dashboard dashboard-reference-layout">
    <DashboardHeader tenantName={tenantName} dashboardName={dashboardName} today={today} periodLabel={periodLabel} onRefresh={() => setRefreshKey(value => value + 1)}/>
    {error && <div className="alert inline-alert" role="alert">Ana sayfa özeti yüklenemedi: {error}</div>}

    <DashboardKpiGrid>
      <DashboardMetricCard icon={<ShoppingCart size={20}/>} label="Satış faturaları" value={loading ? '…' : summary?.canReadSalesInvoices ? money(baseSales?.amount ?? 0) : '—'} note={loading ? 'Veriler yükleniyor' : summary?.canReadSalesInvoices ? `${baseSales?.count ?? 0} ${currency} faturası${foreignSales.length ? ` · ${foreignSales.map(row => row.currencyCode).join(', ')} diğer dövizler` : ''}` : 'Görüntüleme yetkisi yok'} tone="gold"/>
      <DashboardMetricCard icon={<FileText size={20}/>} label="Açık satış siparişi" value={loading ? '…' : summary?.canReadSalesOrders ? (summary.openSalesOrderCount ?? 0).toLocaleString('tr-TR') : '—'} note={loading ? 'Veriler yükleniyor' : summary?.canReadSalesOrders ? 'Sevk ve faturalama bekliyor' : 'Görüntüleme yetkisi yok'} tone="blue"/>
      <DashboardMetricCard icon={<Package size={20}/>} label={`Stok değeri · ${currency}`} value={loading ? '…' : summary?.canReadInventory ? money(summary.inventoryValueBase ?? 0) : '—'} note={loading ? 'Veriler yükleniyor' : summary?.canReadInventory ? `${summary.activeStockItemCount ?? 0} stok kartı · ${summary.activeWarehouseCount ?? 0} ambar` : 'Görüntüleme yetkisi yok'} tone="green"/>
      <DashboardMetricCard icon={<Wallet size={20}/>} label="Açık satın alma" value={loading ? '…' : summary?.canReadPurchaseOrders ? (summary.openPurchaseOrderCount ?? 0).toLocaleString('tr-TR') : '—'} note={loading ? 'Veriler yükleniyor' : summary?.canReadPurchaseOrders ? purchaseBase ? money(purchaseBase.amount) : purchaseBreakdown || 'İşlemde sipariş yok' : 'Görüntüleme yetkisi yok'} tone="red"/>
    </DashboardKpiGrid>

    <div className="dashboard-reference-grid">
      <DashboardTrendPanel months={monthData} currency={currency} loading={loading} canReadSales={Boolean(summary?.canReadSalesInvoices)} canReadPurchases={Boolean(summary?.canReadPurchaseInvoices)} money={money} onNavigate={onNavigate}/>
      <DashboardStockDistribution items={topStock} totalValue={summary?.inventoryValueBase ?? null} activeCount={summary?.activeStockItemCount ?? null} loading={loading} canReadInventory={Boolean(summary?.canReadInventory)} money={money} onNavigate={onNavigate}/>
      <DashboardRecentOrders rows={orderRows} loading={loading} canReadSalesOrders={Boolean(summary?.canReadSalesOrders)} money={money} onNavigate={onNavigate}/>
      <DashboardHighStockTable items={topStock} activeCount={summary?.activeStockItemCount ?? null} loading={loading} canReadInventory={Boolean(summary?.canReadInventory)} money={money} onNavigate={onNavigate}/>
      <DashboardRightRail platformStatus={platformStatus} platformLabel={platformLabel} onNavigate={onNavigate}/>
    </div>
  </div>
}
