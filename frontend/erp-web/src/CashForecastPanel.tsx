import AdvancedDataGrid from './AdvancedDataGrid'
import ScreenViewGroupHeader from './ScreenViewGroupHeader'
import { useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import './CashForecastPanel.css'

type Month = {
  periodStart: string
  openingBalance: number
  receivables: number
  payables: number
  instrumentReceivables: number
  instrumentPayables: number
  creditFacilityPayments: number
  postedMovements: number
  postedMovementCount: number
  directCashBudgetInflows: number
  directCashBudgetOutflows: number
  overdueReceivables: number
  overduePayables: number
  overdueInstrumentReceivables: number
  overdueInstrumentPayables: number
  overdueCreditFacilityPayments: number
  netChange: number
  closingBalance: number
  baseCurrencyClosingBalance: number | null
  appliedExchangeRate: number | null
  appliedExchangeRateDate: string | null
}

type CurrencyForecast = { currencyCode: string; months: Month[] }
type Forecast = {
  from: string
  months: number
  through: string
  baseCurrencyCode: string
  assumptions: string
  currencies: CurrencyForecast[]
}
type ForecastScreenField = { key: keyof Month | 'overdueTotal'; label: string; visible: boolean; position: number; section?: string | null }
const defaultForecastScreenFields: ForecastScreenField[] = [
  { key: 'periodStart', label: 'Dönem', visible: true, position: 0 },
  { key: 'openingBalance', label: 'Açılış', visible: true, position: 1 },
  { key: 'receivables', label: 'Alacak faturaları', visible: true, position: 2 },
  { key: 'payables', label: 'Borç faturaları', visible: true, position: 3 },
  { key: 'instrumentReceivables', label: 'Çek/senet tahsilat', visible: true, position: 4 },
  { key: 'instrumentPayables', label: 'Çek/senet ödeme', visible: true, position: 5 },
  { key: 'creditFacilityPayments', label: 'Kredi taksidi', visible: true, position: 6 },
  { key: 'directCashBudgetInflows', label: 'Planlı tahsilat', visible: true, position: 7 },
  { key: 'directCashBudgetOutflows', label: 'Planlı ödeme', visible: true, position: 8 },
  { key: 'postedMovements', label: 'İleri tarihli kayıt', visible: true, position: 9 },
  { key: 'netChange', label: 'Net değişim', visible: true, position: 10 },
  { key: 'closingBalance', label: 'Kapanış tahmini', visible: true, position: 11 },
  { key: 'overdueTotal', label: 'Vadesi geçmiş toplam', visible: true, position: 12 },
]
const allowedForecastFieldKeys = new Set<ForecastScreenField['key']>(defaultForecastScreenFields.map(field => field.key))

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
  }
}

const rateNumber = (value: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 8 }).format(value)
const monthName = (periodStart: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(`${periodStart}T00:00:00`))
const dateLabel = (value: string) => {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

function AmountCell({ label, amount, currency, overdue }: { label: string; amount: number; currency: string; overdue?: number }) {
  return (
    <td data-label={label}>
      {money(amount, currency)}
      {overdue !== undefined && overdue > 0 && <small className="cash-forecast-detail">Vadesi geçmiş: {money(overdue, currency)}</small>}
    </td>
  )
}

export default function CashForecastPanel({ token }: { token: string }) {
  const [from, setFrom] = useState(today())
  const [months, setMonths] = useState(12)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [screenFields, setScreenFields] = useState<ForecastScreenField[]>(defaultForecastScreenFields)
  const visibleFields = screenFields.filter(field => field.visible && allowedForecastFieldKeys.has(field.key)).sort((a, b) => a.position - b.position)

  useEffect(() => {
    let cancelled = false
    authenticatedFetch('/api/screen-views/finance-cash-flow-forecast/active', token, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async response => {
      if (!response.ok) return null
      return response.json() as Promise<{ fields?: Array<{ key: string; label: string; visible: boolean; position: number; section?: string | null }> }>
    }).then(view => {
      if (cancelled || !view?.fields?.length) return
      const fields = view.fields.filter(field => allowedForecastFieldKeys.has(field.key as ForecastScreenField['key']))
        .map(field => ({ ...field, key: field.key as ForecastScreenField['key'] }))
        .sort((a, b) => a.position - b.position)
      if (fields.length) setScreenFields(fields)
    }).catch(() => { /* The default column layout remains usable when no published view exists. */ })
    return () => { cancelled = true }
  }, [token])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await authenticatedFetch(`/api/finance/cash-flow/forecast?${new URLSearchParams({ from, months: String(months) })}`, token, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof body?.error === 'string' ? body.error : `İstek başarısız (${response.status})`)
      }
      if (!body || !Array.isArray(body.currencies)) throw new Error('Sunucudan geçerli bir nakit tahmini alınamadı.')
      setForecast(body as Forecast)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nakit tahmini alınırken beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Initial data is refreshed when the signed-in tenant token changes. Range edits are applied with the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const hasRows = forecast?.currencies.some(currency => currency.months.length > 0) ?? false
  const displayedRangeMatchesSelection = forecast?.from === from && forecast.months === months

  return (
    <section className="panel cash-forecast-panel" aria-labelledby="cash-forecast-title">
      <div className="panel-heading cash-forecast-heading">
        <div className="cash-forecast-intro">
          <span className="cash-forecast-eyebrow">NAKİT PLANLAMA</span>
          <h2 id="cash-forecast-title">Nakit tahmini</h2>
          <p>Açık faturalar, portföy çek/senetleri ve ileri tarihli kasa/banka kayıtlarıyla aylık görünüm.</p>
        </div>
        <form className="cash-forecast-controls" onSubmit={event => { event.preventDefault(); void load() }}>
          <label>
            <span>Başlangıç tarihi</span>
            <input aria-label="Tahmin başlangıç tarihi" type="date" value={from} onChange={event => setFrom(event.target.value)} />
          </label>
          <label>
            <span>Tahmin süresi</span>
            <select aria-label="Tahmin süresi" value={months} onChange={event => setMonths(Number(event.target.value))}>
              <option value={3}>3 ay</option>
              <option value={6}>6 ay</option>
              <option value={12}>12 ay</option>
              <option value={24}>24 ay</option>
            </select>
          </label>
          <button className="secondary small-button" type="submit" disabled={loading}>
            {loading ? 'Hesaplanıyor…' : 'Tahmini yenile'}
          </button>
        </form>
      </div>

      {error && (
        <div className="alert inline-alert cash-forecast-error" role="alert">
          <span>{error}</span>
          {!loading && <button className="secondary small-button" type="button" onClick={() => void load()}>Yeniden dene</button>}
        </div>
      )}

      {forecast && (
        <div className={`cash-forecast-result-status${loading ? ' is-loading' : ''}${error ? ' has-error' : ''}${!displayedRangeMatchesSelection ? ' is-different-range' : ''}`} role="status" aria-live="polite">
          <div className="cash-forecast-result-copy">
            <strong>{loading ? 'Tahmin yenileniyor' : error ? 'Son başarılı tahmin korunuyor' : 'Gösterilen tahmin'}</strong>
            <p>Tablodaki başarılı sonuç dönemi: <b>{dateLabel(forecast.from)} – {dateLabel(forecast.through)}</b> ({forecast.months} ay).</p>
            {!displayedRangeMatchesSelection && <p>Kontrollerde seçili dönem: <b>{dateLabel(from)} · {months} ay</b>. Tablo, seçili döneme ait yeni sonuç gelene kadar yukarıda belirtilen dönemi göstermektedir.</p>}
            {loading && <p>Yenileme tamamlanana kadar önceki başarılı sonuç görüntülenmeye devam eder.</p>}
            {error && <p>Son istek başarısız oldu; tabloda gösterilen başarılı sonuç değişmedi.</p>}
          </div>
          {loading && <span className="cash-forecast-refreshing" aria-hidden="true"><span className="cash-forecast-spinner"/>Yenileniyor</span>}
        </div>
      )}

      {forecast && <div className="cash-forecast-currency-note" role="note">
        <strong>Para birimleri ayrı gösterilir.</strong>
        <span>Her tablo yalnız kendi para birimindeki tutarları içerir. Kapanış satırındaki {forecast.baseCurrencyCode} karşılığı, kayıtlı kur varsa yalnızca gösterim amaçlıdır; asıl tutar ayrı para biriminde kalır ve kur yoksa karşılık gösterilmez.</span>
      </div>}

      {loading && !forecast && (
        <div className="cash-forecast-state" role="status" aria-live="polite">
          <span className="cash-forecast-spinner" aria-hidden="true" />
          <div><strong>Tahmin hazırlanıyor</strong><p>Seçilen dönem için kayıtlar yükleniyor.</p></div>
        </div>
      )}

      {!loading && !error && forecast && !hasRows && (
        <div className="cash-forecast-state cash-forecast-empty">
          <span className="cash-forecast-empty-icon" aria-hidden="true">₺</span>
          <div><strong>Bu dönemde tahmin kalemi yok</strong><p>Başlangıç tarihini veya tahmin süresini değiştirip yeniden deneyin.</p></div>
        </div>
      )}

      {forecast?.currencies.map(currency => currency.months.length > 0 && (
        <section className="cash-forecast-currency" key={currency.currencyCode} aria-label={`${currency.currencyCode} nakit tahmini`}>
          <div className="cash-forecast-currency-heading">
            <div><h3>{currency.currencyCode}</h3><p>{currency.months.length} aylık dönem · bu para birimi ayrı hesaplanır</p></div>
            <span className="cash-forecast-currency-tag">{currency.months.length} dönem</span>
          </div>
          <div className="cash-forecast-table-wrap" role="region" aria-label={`${currency.currencyCode} tahmin tablosu`} tabIndex={0}>
            <p className="cash-forecast-scroll-hint">Geniş tabloda diğer sütunları görmek için yatay kaydırın.</p>
            <AdvancedDataGrid enableRowSelection={false} className="customer-table cash-forecast-table">
              <caption className="cash-forecast-sr-only">{currency.currencyCode} bazında aylık nakit tahmini</caption>
              <thead><ScreenViewGroupHeader fields={visibleFields}/><tr>{visibleFields.map(field => <th key={field.key} scope="col">{field.label}</th>)}</tr></thead>
              <tbody>{currency.months.map(row => {
                const overdueTotal = row.overdueReceivables + row.overduePayables + row.overdueInstrumentReceivables + row.overdueInstrumentPayables + row.overdueCreditFacilityPayments
                const cell = (field: ForecastScreenField) => {
                  const amountCells: Partial<Record<ForecastScreenField['key'], { amount: number; overdue?: number }>> = {
                    openingBalance: { amount: row.openingBalance }, receivables: { amount: row.receivables, overdue: row.overdueReceivables },
                    payables: { amount: row.payables, overdue: row.overduePayables },
                    instrumentReceivables: { amount: row.instrumentReceivables, overdue: row.overdueInstrumentReceivables },
                    instrumentPayables: { amount: row.instrumentPayables, overdue: row.overdueInstrumentPayables },
                    creditFacilityPayments: { amount: row.creditFacilityPayments, overdue: row.overdueCreditFacilityPayments },
                    directCashBudgetInflows: { amount: row.directCashBudgetInflows }, directCashBudgetOutflows: { amount: row.directCashBudgetOutflows },
                    overdueTotal: { amount: overdueTotal },
                  }
                  if (field.key === 'periodStart') return <th key={field.key} scope="row" data-label={field.label}>{monthName(row.periodStart)}</th>
                  const amountCell = amountCells[field.key]
                  if (amountCell) return <AmountCell key={field.key} label={field.label} amount={amountCell.amount} currency={currency.currencyCode} overdue={amountCell.overdue} />
                  if (field.key === 'postedMovements') return <td key={field.key} data-label={field.label}>{money(row.postedMovements, currency.currencyCode)}<small className="cash-forecast-detail">{row.postedMovementCount} kayıt</small></td>
                  if (field.key === 'netChange') return <td key={field.key} data-label={field.label} className={row.netChange < 0 ? 'cash-forecast-negative' : 'cash-forecast-positive'}>{money(row.netChange, currency.currencyCode)}</td>
                  if (field.key === 'closingBalance') return <td key={field.key} data-label={field.label} className="cash-forecast-closing"><strong>{money(row.closingBalance, currency.currencyCode)}</strong>
                    {row.baseCurrencyClosingBalance === null ? <small className="cash-forecast-detail">Baz kur bulunamadı</small> : <>
                      <small className="cash-forecast-detail">Gösterim amaçlı karşılık: {money(row.baseCurrencyClosingBalance, forecast.baseCurrencyCode)}</small>
                      {row.appliedExchangeRate !== null && currency.currencyCode !== forecast.baseCurrencyCode && <small className="cash-forecast-detail">Kur: 1 {currency.currencyCode} = {rateNumber(row.appliedExchangeRate)} {forecast.baseCurrencyCode}{row.appliedExchangeRateDate && ` · ${dateLabel(row.appliedExchangeRateDate)}`}</small>}
                    </>}
                  </td>
                  return null
                }
                return <tr key={row.periodStart}>{visibleFields.map(cell)}</tr>
              })}</tbody>
            </AdvancedDataGrid>
          </div>
        </section>
      ))}

      {forecast && <div className="boundary-note cash-forecast-assumptions"><strong>Hesaplama kapsamı</strong><span>{forecast.assumptions}</span></div>}
    </section>
  )
}
