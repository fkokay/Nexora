import type { CostReport } from './types'

const amount = (value: number | null | undefined, currency: string) => {
  if (value == null) return '—'
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(value) }
  catch { return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value)} ${currency}` }
}

const statusName: Record<string, string> = { Planned: 'Planlandı', Released: 'Serbest bırakıldı', Completed: 'Tamamlandı', Cancelled: 'İptal edildi' }

type Props = {
  report: CostReport
  currency: string
  pageCount: number
  loading: boolean
  onPageChange: (page: number) => void
}

export function ManufacturingCostVarianceResults({ report, currency, pageCount, loading, onPageChange }: Props) {
  return <section className="panel manufacturing-cost-table-panel">
    <div className="manufacturing-cost-table-title"><div><h2>Maliyet farkı</h2><p>{report.from} – {report.to} · {report.periodBasis === 'plannedDate' ? 'plan tarihine göre' : report.periodBasis} · Baz para: {currency}</p></div><span>{report.totalCount.toLocaleString('tr-TR')} kayıt</span></div>
    <div className="manufacturing-cost-table-wrap"><table><thead><tr><th>Üretim emri</th><th>Plan tarihi</th><th>Durum</th><th>Miktar</th><th>Planlanan malzeme</th><th>Fiilî malzeme</th><th>Planlanan dönüşüm</th><th>Fiilî dönüşüm</th><th>Dönüşüm farkı</th><th>Fiilî toplam</th><th>Toplam fark</th></tr></thead>
      <tbody>{report.orders.map(order => <tr key={`${order.orderCode}-${order.plannedDate}`}>
        <td><b>{order.orderCode}</b><small>{order.operationCount} operasyon</small></td><td>{order.plannedDate}</td><td><span className={`manufacturing-cost-status status-${order.status.toLowerCase()}`}>{statusName[order.status] || order.status}</span></td><td>{order.plannedQuantity.toLocaleString('tr-TR')}</td>
        <td>{amount(order.plannedMaterialBase, currency)}</td><td>{amount(order.actualMaterialBase, currency)}</td><td>{amount(order.plannedConversionBase, currency)}</td><td>{amount(order.actualConversionBase, currency)}</td><td>{amount(order.conversionVarianceBase, currency)}</td><td>{amount(order.actualTotalCostBase, currency)}</td><td>{amount(order.totalVarianceBase, currency)}</td>
      </tr>)}{report.orders.length === 0 && <tr><td colSpan={11} className="manufacturing-cost-empty">Bu tarih aralığında üretim emri bulunamadı.</td></tr>}</tbody>
    </table></div>
    <footer className="manufacturing-cost-pagination"><small>Sayfa {report.page} / {pageCount}</small><div><button className="secondary" type="button" disabled={loading || report.page <= 1} onClick={() => onPageChange(report.page - 1)}>Önceki</button><button className="secondary" type="button" disabled={loading || report.page >= pageCount} onClick={() => onPageChange(report.page + 1)}>Sonraki</button></div></footer>
  </section>
}
