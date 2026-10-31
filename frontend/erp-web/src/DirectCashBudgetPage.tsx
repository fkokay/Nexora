import { useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { isApproved, type Forecast, type LineInput, type PlanScreenField, type PlanSummary, type PlanView } from './direct-cash-budget/types'
import DirectCashBudgetMetrics from './direct-cash-budget/components/DirectCashBudgetMetrics'
import DirectCashBudgetForecast from './direct-cash-budget/components/DirectCashBudgetForecast'
import DirectCashBudgetPlanList from './direct-cash-budget/components/DirectCashBudgetPlanList'
import DirectCashBudgetEditor from './direct-cash-budget/components/DirectCashBudgetEditor'
import DirectCashBudgetDetail from './direct-cash-budget/components/DirectCashBudgetDetail'
import './direct-cash-budget.css'

const today = new Date()
const currentYear = today.getFullYear()
const currentMonth = String(today.getMonth() + 1).padStart(2, '0')
const initialLine = (year: number): LineInput => ({ periodStart: `${year}-${currentMonth}-01`, direction: 'Inflow', category: 'Sales', description: '', amount: 0 })

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  if (!response.ok) {
    let message = response.status === 403
      ? 'Erişim reddedildi (403). Firma üyeliği, rol veya finans erişim politikası isteğe izin vermedi. Yönetici işlemleri için TenantAdmin rolünü doğrulayın.'
      : `İstek başarısız (${response.status}) · ${new URL(url, window.location.origin).pathname}`
    try { const body = await response.json(); message = body.error || message } catch { /* response may be empty */ }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}
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
      const [plansResult, forecastResult] = await Promise.allSettled([
        request<PlanSummary[]>('/api/finance/cash-budgets/', token),
        request<Forecast>(`/api/finance/cash-flow/forecast?${new URLSearchParams({ from: `${currentYear}-${currentMonth}-01`, months: '12' })}`, token),
      ])
      const failures: string[] = []
      if (plansResult.status === 'fulfilled') {
        const nextPlans = plansResult.value
        setPlans(nextPlans)
        if (selected) {
          const current = nextPlans.find(plan => plan.id === selected.id)
          if (current) {
            try { setSelected(await request<PlanView>(`/api/finance/cash-budgets/${current.id}`, token)) }
            catch (cause) { failures.push(`Seçili plan yüklenemedi: ${cause instanceof Error ? cause.message : 'Bilinmeyen hata'}`) }
          } else setSelected(null)
        }
      } else failures.push(`Bütçe planları yüklenemedi: ${plansResult.reason instanceof Error ? plansResult.reason.message : 'Bilinmeyen hata'}`)
      if (forecastResult.status === 'fulfilled') setForecast(forecastResult.value)
      else failures.push(`Nakit tahmini yüklenemedi: ${forecastResult.reason instanceof Error ? forecastResult.reason.message : 'Bilinmeyen hata'}`)
      if (failures.length) setError(failures.join(' · '))
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
    <header className="page-heading direct-cash-budget-hero">
      <div><p className="eyebrow">FİNANS YÖNETİMİ · NAKİT PLANLAMA</p><h1>Doğrudan nakit bütçesi</h1><p className="muted">Tahmini tahsilat ve ödemeleri aylara göre planlayın. Onaylı planlar nakit tahmininde görünür; gerçek kasa, banka ve muhasebe kayıtları oluşturulmaz.</p></div>
      <div className="heading-actions"><button type="button" className="secondary" onClick={() => void load()} disabled={loading || busy}>{loading ? 'Yenileniyor…' : 'Yenile'}</button>{admin && <button type="button" className="primary" onClick={newDraft} disabled={busy}>Yeni nakit bütçesi</button>}</div>
    </header>
    <DirectCashBudgetMetrics
      planCount={plans.length}
      approvedCount={plans.filter(plan => isApproved(plan.status)).length}
      draftCount={plans.filter(plan => !isApproved(plan.status)).length}
      forecastRowCount={forecastRows.length}
    />
    {error && <div className="alert inline-alert" role="alert"><span>{error}</span><button type="button" className="row-action" onClick={() => void load()} disabled={loading}>Yeniden dene</button></div>}
    {notice && <div className="notice inline-notice" role="status">{notice}</div>}
    <DirectCashBudgetForecast rows={forecastRows} loading={loading} />
    <div className={`direct-cash-budget-layout ${editing && admin ? 'has-editor' : ''}`}>
      <DirectCashBudgetPlanList
        plans={plans}
        fields={planScreenFields}
        loading={loading}
        busy={busy}
        admin={admin}
        selectedId={selected?.id}
        editing={editing}
        onOpen={plan => void open(plan)}
      />
      {editing && admin && <DirectCashBudgetEditor
        selected={selected}
        name={name}
        year={year}
        currency={currency}
        lines={lines}
        busy={busy}
        onSubmit={save}
        onNameChange={setName}
        onYearChange={nextYear => {
          setYear(nextYear)
          setLines(existing => existing.map(line => ({ ...line, periodStart: `${nextYear}-${line.periodStart.slice(5)}` })))
        }}
        onCurrencyChange={setCurrency}
        onAddLine={() => setLines(current => [...current, initialLine(year)])}
        onUpdateLine={updateLine}
        onRemoveLine={index => setLines(current => current.filter((_, i) => i !== index))}
        onCancel={() => { setEditing(false); setError('') }}
      />}
    </div>
    {selected && !editing && <DirectCashBudgetDetail
      selected={selected}
      draft={draft}
      admin={admin}
      busy={busy}
      onEdit={edit}
      onApprove={() => void approve()}
    />}
  </div>
}
