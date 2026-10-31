import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { Performance, PerformancePage, PerformanceScreenField } from './types'

type Props = {
  performance: PerformancePage | null
  fields: PerformanceScreenField[]
  query: string
  from: string
  through: string
  page: number
  onQueryChange: (value: string) => void
  onFromChange: (value: string) => void
  onThroughChange: (value: string) => void
  onPageChange: (change: (page: number) => number) => void
  onRefresh: () => void
}

export default function CampaignPerformanceSection({ performance, fields, query, from, through, page, onQueryChange, onFromChange, onThroughChange, onPageChange, onRefresh }: Props) {
  const visibleFields = fields.filter(field => field.visible)
  const performanceCell = (item: Performance, key: string) => {
    switch (key) {
      case 'campaign': return <><b>{item.code}</b><br /><span className="muted">{item.name}</span></>
      case 'applications': return item.applications
      case 'appliedQuotes': return item.appliedQuotes
      case 'discountTotals': return item.discountTotals.map(total => `${total.currencyCode} ${total.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`).join(' · ') || '—'
      case 'linkedOrders': return item.linkedOrders
      case 'linkedOrderTotals': return item.linkedOrderTotals.map(total => `${total.currencyCode} ${total.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`).join(' · ') || '—'
      default: return null
    }
  }

  return <section className="panel sales-campaign-performance">
    <div className="panel-heading sales-campaign-performance-heading"><div className="sales-campaign-performance-title"><b>Kampanya performansı</b><small>Uygulanan indirimler ve bağlantılı siparişler</small></div><button className="secondary" onClick={onRefresh}>Raporu yenile</button></div>
    <div className="form-two sales-campaign-filters"><label className="sales-campaign-filter-label">Kampanya ara<input value={query} maxLength={120} onChange={event => onQueryChange(event.target.value)} placeholder="Kod veya ad" /></label><label className="sales-campaign-filter-label">Uygulama tarihi başlangıç<input type="date" value={from} onChange={event => onFromChange(event.target.value)} /></label><label className="sales-campaign-filter-label">Uygulama tarihi bitiş<input type="date" value={through} onChange={event => onThroughChange(event.target.value)} /></label></div>
    {performance && <><div className="table-scroll sales-campaign-report-table" role="region" aria-label="Kampanya performans raporu" tabIndex={0}><AdvancedDataGrid hideSearch enableRowSelection={false} externalPagination gridId="sales-campaign-performance-v2" initialColumnWidths={visibleFields.map(field => ({ campaign: 180, applications: 95, appliedQuotes: 145, discountTotals: 115, linkedOrders: 135, linkedOrderTotals: 130 }[field.key] ?? 110))} minimumColumnWidths={visibleFields.map(field => ({ campaign: 140, applications: 80, appliedQuotes: 110, discountTotals: 95, linkedOrders: 105, linkedOrderTotals: 105 }[field.key] ?? 80))}>
      <thead><ScreenViewGroupHeader fields={visibleFields} /><tr>{visibleFields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead>
      <tbody>{performance.items.map(item => <tr key={item.campaignId}>{visibleFields.map(field => <td key={field.key}>{performanceCell(item, field.key)}</td>)}</tr>)}{performance.items.length === 0 && <tr className="sales-campaign-empty"><td colSpan={Math.max(1, visibleFields.length)}>Eşleşen kampanya bulunamadı.</td></tr>}</tbody>
    </AdvancedDataGrid></div><div className="panel-heading sales-campaign-pagination"><small className="muted">{performance.method} · {performance.totalCount} kampanya</small><div><button className="secondary" disabled={page <= 1} onClick={() => onPageChange(current => Math.max(1, current - 1))}>Önceki</button><span aria-live="polite">{page}</span><button className="secondary" disabled={page * performance.pageSize >= performance.totalCount} onClick={() => onPageChange(current => current + 1)}>Sonraki</button></div></div></>}
  </section>
}
