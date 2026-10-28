import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { authenticatedFetch } from './authApi'
import './manufacturing-cost-variance.css'

type CostOrder = {
  orderCode: string
  plannedDate: string
  status: string
  plannedQuantity: number
  operationCount: number
  currencyCode: string
  plannedLaborBase: number
  actualLaborBase: number | null
  plannedOverheadBase: number
  actualOverheadBase: number | null
  plannedEnergyBase: number | null
  actualEnergyBase: number | null
  plannedMaterialBase: number | null
  actualMaterialBase: number | null
  plannedConversionBase: number
  actualConversionBase: number | null
  conversionVarianceBase: number | null
  actualTotalCostBase: number | null
  totalVarianceBase: number | null
}
type CostReport = {
  from: string
  to: string
  periodBasis: string
  baseCurrencyCode: string
  page: number
  pageSize: number
  totalCount: number
  orders: CostOrder[]
  pageTotals: {
    orderCount: number
    plannedLaborBase: number
    actualLaborBase: number | null
    plannedOverheadBase: number
    actualOverheadBase: number | null
    plannedEnergyBase: number
    plannedMaterialBase: number
    actualEnergyBase: number | null
    actualConversionBase: number | null
    actualMaterialBase: number | null
  }
  limitations: string
}

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const monthAgo = () => {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const amount = (value: number | null | undefined, currency: string) => {
  if (value == null) return '—'
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(value) }
  catch { return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value)} ${currency}` }
}
const statusName: Record<string, string> = { Planned: 'Planlandı', Released: 'Serbest bırakıldı', Completed: 'Tamamlandı', Cancelled: 'İptal edildi' }

export default function ManufacturingCostVariancePage({ token }: { token: string }) {
  const [from, setFrom] = useState(monthAgo)
  const [to, setTo] = useState(today)
  const [page, setPage] = useState(1)
  const [report, setReport] = useState<CostReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)

  const load = useCallback(async (nextPage: number) => {
    const current = ++generation.current
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ from, to, page: String(nextPage), pageSize: '50' })
      const response = await authenticatedFetch(`/api/reports/manufacturing-cost-variance?${query}`, token)
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; title?: string } | null
        throw new Error(body?.error || body?.title || `İstek başarısız (${response.status})`)
      }
      const data = await response.json() as CostReport
      if (current !== generation.current) return
      setReport(data)
      setPage(data.page)
    } catch (cause) {
      if (current === generation.current) setError((cause as Error).message)
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [from, to, token])

  useEffect(() => { void load(1) }, [load])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setPage(1)
    void load(1)
  }
  const pageCount = Math.max(1, Math.ceil((report?.totalCount ?? 0) / (report?.pageSize ?? 50)))
  const code = report?.baseCurrencyCode || 'TRY'
  const maxTo = from ? new Date(new Date(`${from}T00:00:00Z`).getTime() + 365 * 86400000).toISOString().slice(0, 10) : undefined

  return <div className="manufacturing-cost-page">
    <header className="page-heading manufacturing-cost-heading">
      <div><p className="eyebrow">ÜRETİM YÖNETİMİ · MALİYET MUHASEBESİ</p><h1>Üretim maliyet analizi</h1><p className="muted">Üretim emirlerinin planlanan ve kaydedilmiş fiilî maliyetlerini karşılaştırın.</p></div>
      <button className="secondary" type="button" onClick={() => void load(page)} disabled={loading}><RefreshCw size={15}/> Yenile</button>
    </header>
    <form className="panel manufacturing-cost-filters" onSubmit={submit}>
      <label>Plan tarihi başlangıcı<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} required/></label>
      <label>Plan tarihi bitişi<input type="date" value={to} min={from} max={maxTo} onChange={event => setTo(event.target.value)} required/></label>
      <button className="primary" disabled={loading}>{loading ? 'Rapor hazırlanıyor…' : 'Raporu getir'}</button>
    </form>
    {error && <div className="alert inline-alert" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    {report && <>
      <section className="manufacturing-cost-summary" aria-label="Üretim maliyet özeti">
        <article><span>Üretim emri</span><b>{report.totalCount.toLocaleString('tr-TR')}</b><small>Seçili plan tarihi aralığı</small></article>
        <article><span>Planlanan malzeme</span><b>{amount(report.pageTotals.plannedMaterialBase, code)}</b><small>Bu sayfa · fire dahil emir anlık görüntüsü</small></article>
        <article><span>Planlanan dönüşüm</span><b>{amount(report.pageTotals.plannedLaborBase + report.pageTotals.plannedOverheadBase + report.pageTotals.plannedEnergyBase, code)}</b><small>Bu sayfa · işçilik, genel gider ve enerji</small></article>
        <article><span>Fiilî malzeme</span><b>{amount(report.pageTotals.actualMaterialBase, code)}</b><small>Bu sayfa · emre bağlı bileşen hareketleri</small></article>
      </section>
      <section className="panel manufacturing-cost-table-panel">
        <div className="manufacturing-cost-table-title"><div><h2>Maliyet farkı</h2><p>{report.from} – {report.to} · {report.periodBasis === 'plannedDate' ? 'plan tarihine göre' : report.periodBasis} · Baz para: {code}</p></div><span>{report.totalCount.toLocaleString('tr-TR')} kayıt</span></div>
        <div className="manufacturing-cost-table-wrap"><table><thead><tr><th>Üretim emri</th><th>Plan tarihi</th><th>Durum</th><th>Miktar</th><th>Planlanan malzeme</th><th>Fiilî malzeme</th><th>Planlanan dönüşüm</th><th>Fiilî dönüşüm</th><th>Dönüşüm farkı</th><th>Fiilî toplam</th><th>Toplam fark</th></tr></thead>
          <tbody>{report.orders.map(order => <tr key={`${order.orderCode}-${order.plannedDate}`}>
            <td><b>{order.orderCode}</b><small>{order.operationCount} operasyon</small></td><td>{order.plannedDate}</td><td><span className={`manufacturing-cost-status status-${order.status.toLowerCase()}`}>{statusName[order.status] || order.status}</span></td><td>{order.plannedQuantity.toLocaleString('tr-TR')}</td>
            <td>{amount(order.plannedMaterialBase, code)}</td><td>{amount(order.actualMaterialBase, code)}</td><td>{amount(order.plannedConversionBase, code)}</td><td>{amount(order.actualConversionBase, code)}</td><td>{amount(order.conversionVarianceBase, code)}</td><td>{amount(order.actualTotalCostBase, code)}</td><td>{amount(order.totalVarianceBase, code)}</td>
          </tr>)}{report.orders.length === 0 && <tr><td colSpan={11} className="manufacturing-cost-empty">Bu tarih aralığında üretim emri bulunamadı.</td></tr>}</tbody>
        </table></div>
        <footer className="manufacturing-cost-pagination"><small>Sayfa {report.page} / {pageCount}</small><div><button className="secondary" type="button" disabled={loading || report.page <= 1} onClick={() => void load(report.page - 1)}>Önceki</button><button className="secondary" type="button" disabled={loading || report.page >= pageCount} onClick={() => void load(report.page + 1)}>Sonraki</button></div></footer>
      </section>
      <aside className="manufacturing-cost-limitations"><b>Rapor kapsamı</b><p>{report.limitations}</p></aside>
    </>}
  </div>
}
