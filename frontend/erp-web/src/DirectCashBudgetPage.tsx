import { useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import './direct-cash-budget.css'

type PlanSummary = {
  id: string
  name: string
  fiscalYear: number
  currencyCode: string
  status: string | number
  createdAt: string
  createdByUserId: string
  approvedByUserId: string | null
  approvedAt: string | null
  revision: number
  lineCount: number
}
type PlanScreenField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean }
type BudgetLine = { id?: string; periodStart: string; direction: 'Inflow' | 'Outflow'; category: string; description: string; amount: number }
type PlanView = Omit<PlanSummary, 'lineCount'> & { lines: BudgetLine[] }
type ForecastMonth = { periodStart: string; directCashBudgetInflows: number; directCashBudgetOutflows: number; netChange: number }
type Forecast = { currencies: { currencyCode: string; months: ForecastMonth[] }[] }
type LineInput = Omit<BudgetLine, 'amount'> & { amount: number }

const categories = [
  ['Sales', 'Satış tahsilatları'], ['Collections', 'Diğer tahsilatlar'], ['Payroll', 'Bordro'],
  ['Suppliers', 'Tedarikçiler'], ['Taxes', 'Vergi ve harçlar'], ['Investment', 'Yatırım'],
  ['Financing', 'Finansman'], ['Operating', 'İşletme giderleri'], ['Other', 'Diğer'],
] as const
const today = new Date()
const currentYear = today.getFullYear()
const currentMonth = String(today.getMonth() + 1).padStart(2, '0')
const initialLine = (year: number): LineInput => ({ periodStart: `${year}-${currentMonth}-01`, direction: 'Inflow', category: 'Sales', description: '', amount: 0 })

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  if (!response.ok) {
    let message = `İstek başarısız (${response.status})`
    try { const body = await response.json(); message = body.error || message } catch { /* response may be empty */ }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}
const money = (value: number, currency: string) => {
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value) }
  catch { return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency}` }
}
const isApproved = (status: PlanSummary['status']) => status === 'Approved' || status === 2
const formatMonth = (value: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
const defaultPlanScreenFields: PlanScreenField[] = [
  { key: 'name', label: 'Plan adı', visible: true, position: 0 },
  { key: 'fiscalYear', label: 'Mali yıl', visible: true, position: 1 },
  { key: 'currencyCode', label: 'Döviz', visible: true, position: 2 },
  { key: 'status', label: 'Durum', visible: true, position: 3 },
  { key: 'lineCount', label: 'Satır', visible: true, position: 4 },
  { key: 'revision', label: 'Sürüm', visible: true, position: 5 },
  { key: 'actions', label: 'Aç', visible: true, position: 6, fixed: true }
]
const planScreenKeys = new Set(defaultPlanScreenFields.map(field => field.key))

export default function DirectCashBudgetPage({ token, role }: { token: string; role: string }) {
  const admin = role === 'TenantAdmin'
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [selected, setSelected] = useState<PlanView | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [name, setName] = useState('')
  const [year, setYear] = useState(currentYear)
  const [currency, setCurrency] = useState('TRY')
  const [lines, setLines] = useState<LineInput[]>([initialLine(currentYear)])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [planScreenFields, setPlanScreenFields] = useState(defaultPlanScreenFields)

  useEffect(() => {
    let current = true
    void request<{ fields?: PlanScreenField[] }>('/api/screen-views/direct-cash-budgets/active', token)
      .then(view => {
        if (!current || !Array.isArray(view.fields)) return
        const allowed = view.fields.filter(field => planScreenKeys.has(field.key))
        const configured = defaultPlanScreenFields.map(fallback => {
          const field = allowed.find(candidate => candidate.key === fallback.key)
          return fallback.key === 'actions'
            ? { ...fallback, ...(field ?? {}), visible: true, fixed: true }
            : { ...fallback, ...(field ?? {}) }
        }).sort((left, right) => left.position - right.position)
        setPlanScreenFields(configured)
      })
      .catch(() => { if (current) setPlanScreenFields(defaultPlanScreenFields) })
    return () => { current = false }
  }, [token])

  async function load() {
    setLoading(true); setError('')
    try {
      const nextPlans = await request<PlanSummary[]>('/api/finance/cash-budgets/', token)
      setPlans(nextPlans)
      const nextForecast = await request<Forecast>(`/api/finance/cash-flow/forecast?${new URLSearchParams({ from: `${currentYear}-${currentMonth}-01`, months: '12' })}`, token)
      setForecast(nextForecast)
      if (selected) {
        const current = nextPlans.find(plan => plan.id === selected.id)
        if (current) setSelected(await request<PlanView>(`/api/finance/cash-budgets/${current.id}`, token))
        else setSelected(null)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nakit bütçeleri yüklenemedi.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  function newDraft() {
    setSelected(null); setName(''); setYear(currentYear); setCurrency('TRY'); setLines([initialLine(currentYear)])
    setEditing(true); setError(''); setNotice('')
  }
  async function open(plan: PlanSummary) {
    setBusy(true); setError(''); setNotice('')
    try { setSelected(await request<PlanView>(`/api/finance/cash-budgets/${plan.id}`, token)); setEditing(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Bütçe açılamadı.') }
    finally { setBusy(false) }
  }
  function edit(plan: PlanView) {
    setSelected(plan); setName(plan.name); setYear(plan.fiscalYear); setCurrency(plan.currencyCode)
    setLines(plan.lines.map(({ periodStart, direction, category, description, amount }) => ({ periodStart, direction, category, description, amount })))
    setEditing(true); setError(''); setNotice('')
  }
  function updateLine(index: number, patch: Partial<LineInput>) {
    setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line))
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!admin || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const body = { name, fiscalYear: year, currencyCode: currency.trim().toUpperCase(), revision: selected?.revision ?? 0,
        lines: lines.map(line => ({ ...line, amount: Number(line.amount) })) }
      const saved = await request<PlanView>(selected ? `/api/finance/cash-budgets/${selected.id}` : '/api/finance/cash-budgets/', token,
        { method: selected ? 'PUT' : 'POST', body: JSON.stringify(body) })
      setSelected(saved); setEditing(false); setNotice('Nakit bütçe taslağı kaydedildi. Nakit hareketi veya muhasebe kaydı oluşturulmadı.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Taslak kaydedilemedi.') }
    finally { setBusy(false) }
  }
  async function approve() {
    if (!selected || !admin || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const approved = await request<PlanView>(`/api/finance/cash-budgets/${selected.id}/approve`, token,
        { method: 'POST', body: JSON.stringify({ revision: selected.revision }) })
      setSelected(approved); setEditing(false); setNotice('Nakit bütçesi tahminde kullanılmak üzere onaylandı. Muhasebe veya kasa hareketi oluşturulmadı.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bütçe onaylanamadı.') }
    finally { setBusy(false) }
  }

  const forecastRows = forecast?.currencies.flatMap(currencyRow => currencyRow.months.map(month => ({ ...month, currencyCode: currencyRow.currencyCode }))) ?? []
  const draft = selected?.status === 'Draft'
  return <div className="finance-page direct-cash-budget-page">
    <header className="page-heading">
      <div><p className="eyebrow">FİNANS YÖNETİMİ · NAKİT PLANLAMA</p><h1>Doğrudan nakit bütçesi</h1><p className="muted">Tahmini tahsilat ve ödemeleri aylara göre planlayın. Onaylı planlar nakit tahmininde görünür; gerçek kasa, banka ve muhasebe kayıtları oluşturulmaz.</p></div>
      <div className="heading-actions"><button type="button" className="secondary" onClick={() => void load()} disabled={loading || busy}>{loading ? 'Yenileniyor…' : 'Yenile'}</button>{admin && <button type="button" className="primary" onClick={newDraft} disabled={busy}>Yeni nakit bütçesi</button>}</div>
    </header>
    {error && <div className="alert inline-alert" role="alert"><span>{error}</span><button type="button" className="row-action" onClick={() => void load()} disabled={loading}>Yeniden dene</button></div>}
    {notice && <div className="notice inline-notice" role="status">{notice}</div>}
    <section className="panel direct-cash-budget-forecast" aria-labelledby="direct-cash-forecast-title">
      <div className="panel-heading"><div><h2 id="direct-cash-forecast-title">Onaylı planların nakit tahminine etkisi</h2><p>Önümüzdeki 12 ay · tahsilat ve ödeme satırları para birimi bazında ayrıdır.</p></div></div>
      <div className="ledger-list"><table className="customer-table"><thead><tr><th>Dönem</th><th>Döviz</th><th>Planlanan tahsilat</th><th>Planlanan ödeme</th><th>Net nakit değişimi</th></tr></thead><tbody>
        {forecastRows.map(row => <tr key={`${row.currencyCode}-${row.periodStart}`}><td>{formatMonth(row.periodStart)}</td><td>{row.currencyCode}</td><td>{money(row.directCashBudgetInflows, row.currencyCode)}</td><td>{money(row.directCashBudgetOutflows, row.currencyCode)}</td><td><b>{money(row.directCashBudgetInflows - row.directCashBudgetOutflows, row.currencyCode)}</b></td></tr>)}
        {!loading && forecastRows.length === 0 && <tr><td colSpan={5} className="table-empty">Seçilen tahmin döneminde onaylı nakit bütçesi yok.</td></tr>}
      </tbody></table></div>
      <div className="boundary-note"><span>Tahmin satırları yalnızca planlama bilgisidir. Onay, tahsilat/ödeme veya yevmiye kaydı başlatmaz.</span></div>
    </section>
    <div className="direct-cash-budget-layout">
      <section className="panel direct-cash-budget-list" aria-labelledby="direct-cash-budget-list-title">
        <div className="panel-heading"><div><h2 id="direct-cash-budget-list-title">Bütçe planları</h2><p>{loading ? 'Planlar yükleniyor…' : `${plans.length} kayıt · firma kapsamlı`}</p></div></div>
        {loading ? <div className="budget-state" role="status">Nakit bütçeleri yükleniyor…</div> : plans.length === 0 ? <div className="budget-state budget-empty"><strong>Henüz plan yok</strong><span>{admin ? 'Bir taslak oluşturarak başlayın.' : 'Firma yöneticisi bir nakit bütçesi oluşturduğunda burada görünür.'}</span></div> : <div className="budget-plan-list" aria-label="Nakit bütçesi planları">
          {plans.map(plan => <article key={plan.id} className={`budget-plan-item direct-cash-budget-plan-card ${selected?.id === plan.id && !editing ? 'active' : ''}`}>
            <div className="direct-cash-budget-plan-fields">
              {planScreenFields.filter(field => field.visible && field.key !== 'actions').map(field => <span className={`direct-cash-budget-plan-field direct-cash-budget-field-${field.key}`} key={field.key}>
                <small>{field.label}</small>
                {field.key === 'status'
                  ? <span className={`quote-status ${isApproved(plan.status) ? 'accepted' : 'pending'}`}>{isApproved(plan.status) ? 'Onaylı' : 'Taslak'}</span>
                  : <strong>{field.key === 'name' ? plan.name : field.key === 'fiscalYear' ? plan.fiscalYear : field.key === 'currencyCode' ? plan.currencyCode : field.key === 'lineCount' ? `${plan.lineCount} satır` : `Sürüm ${plan.revision}`}</strong>}
              </span>)}
            </div>
            <button type="button" className="secondary small-button direct-cash-budget-open" onClick={() => void open(plan)} disabled={busy} aria-label={`${planScreenFields.find(field => field.key === 'actions')?.label ?? 'Aç'}: ${plan.name}`}>{planScreenFields.find(field => field.key === 'actions')?.label ?? 'Aç'}</button>
          </article>)}
        </div>}
      </section>
      {editing && admin && <section className="panel direct-cash-budget-editor" aria-labelledby="direct-cash-budget-editor-title">
        <div className="panel-heading"><div><h2 id="direct-cash-budget-editor-title">{selected ? 'Taslağı düzenle' : 'Yeni taslak'}</h2><p>Tahsilat ve ödemeleri planlayın; kaydetmek gerçek işlem başlatmaz.</p></div></div>
        <form className="collection-form" onSubmit={save}>
          <div className="form-two"><label>Plan adı<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required disabled={busy}/></label><label>Mali yıl<input type="number" min="2000" max="2100" value={year} onChange={event => { const nextYear = Number(event.target.value); setYear(nextYear); setLines(existing => existing.map(line => ({ ...line, periodStart: `${nextYear}-${line.periodStart.slice(5)}` }))) }} required disabled={busy}/></label></div>
          <div className="form-two"><label>Para birimi (ISO 4217)<input value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} pattern="[A-Z]{3}" required disabled={busy}/></label><div className="boundary-note"><span>Plan yalnız aynı para birimindeki tahmin satırlarıyla toplanır; kur dönüşümü yapılmaz.</span></div></div>
          <div className="direct-cash-budget-line-heading"><div><h3>Aylık nakit satırları</h3><p>En çok 1.200 satır; ayın ilk günü kullanılır.</p></div><button className="secondary small-button" type="button" onClick={() => setLines(current => [...current, initialLine(year)])} disabled={busy || lines.length >= 1200}>+ Satır ekle</button></div>
          {lines.map((line, index) => <fieldset className="direct-cash-budget-line" key={index}><legend>Satır {index + 1}</legend>
            <label>Ay<input type="month" value={line.periodStart.slice(0, 7)} onChange={event => updateLine(index, { periodStart: `${event.target.value}-01` })} required disabled={busy}/></label>
            <label>Tür<select value={line.direction} onChange={event => updateLine(index, { direction: event.target.value as LineInput['direction'] })} disabled={busy}><option value="Inflow">Tahsilat</option><option value="Outflow">Ödeme</option></select></label>
            <label>Kategori<select value={line.category} onChange={event => updateLine(index, { category: event.target.value })} disabled={busy}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Açıklama<input value={line.description} onChange={event => updateLine(index, { description: event.target.value })} maxLength={240} required disabled={busy}/></label>
            <label>Tutar<input type="number" min="0" max="9999999999999999" step="0.01" value={line.amount} onChange={event => updateLine(index, { amount: Number(event.target.value) })} required disabled={busy}/></label>
            <button type="button" className="row-action danger" onClick={() => setLines(current => current.filter((_, i) => i !== index))} disabled={busy || lines.length <= 1}>Sil</button>
          </fieldset>)}
          <div className="budget-form-foot"><span>Sürüm {selected?.revision ?? 1} · Onaylama farklı bir TenantAdmin tarafından yapılmalıdır.</span><div><button type="button" className="secondary" onClick={() => { setEditing(false); setError('') }} disabled={busy}>Vazgeç</button><button type="submit" className="primary" disabled={busy || !name.trim() || !/^[A-Z]{3}$/.test(currency) || lines.length === 0}>{busy ? 'Kaydediliyor…' : selected ? 'Taslağı kaydet' : 'Taslak oluştur'}</button></div></div>
        </form>
      </section>}
    </div>
    {selected && !editing && <section className="panel direct-cash-budget-detail" aria-labelledby="direct-cash-budget-detail-title">
      <div className="panel-heading"><div><p className="eyebrow">{selected.fiscalYear} · {selected.currencyCode} · Sürüm {selected.revision}</p><h2 id="direct-cash-budget-detail-title">{selected.name}</h2><p>{draft ? 'Taslak · tahminlere dahil edilmez' : `Onaylayan: ${selected.approvedByUserId ?? '—'}`}</p></div><div className="heading-actions">{draft && admin && <><span className="direct-cash-budget-approval-hint">Onay için farklı bir TenantAdmin gerekir.</span><button type="button" className="secondary" onClick={() => edit(selected)} disabled={busy}>Düzenle</button><button type="button" className="primary" onClick={() => void approve()} disabled={busy || selected.lines.length === 0}>{busy ? 'Onaylanıyor…' : 'Onayla'}</button></>}</div></div>
      <div className="ledger-list"><table className="customer-table"><thead><tr><th>Dönem</th><th>Tür</th><th>Kategori</th><th>Açıklama</th><th>Tutar</th></tr></thead><tbody>{selected.lines.map(line => <tr key={line.id}><td>{formatMonth(line.periodStart)}</td><td>{line.direction === 'Inflow' ? 'Tahsilat' : 'Ödeme'}</td><td>{categories.find(([value]) => value === line.category)?.[1] ?? line.category}</td><td>{line.description}</td><td><b>{money(line.amount, selected.currencyCode)}</b></td></tr>)}</tbody></table></div>
      {admin && draft && <div className="boundary-note"><span>Onaylayan kullanıcı, taslağı oluşturan TenantAdmin’den farklı olmalıdır. Sunucu bunu doğrular. Bu onay yalnızca tahmin planını etkinleştirir; finansal kayıt oluşturmaz.</span></div>}
    </section>}
  </div>
}
