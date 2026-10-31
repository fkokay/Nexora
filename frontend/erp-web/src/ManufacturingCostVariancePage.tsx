import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { authenticatedFetch } from './authApi'
import './manufacturing-cost-variance.css'
import { ManufacturingCostVarianceError } from './manufacturing-cost-variance/components/ManufacturingCostVarianceError'
import { ManufacturingCostVarianceFilters } from './manufacturing-cost-variance/components/ManufacturingCostVarianceFilters'
import { ManufacturingCostVarianceHeader } from './manufacturing-cost-variance/components/ManufacturingCostVarianceHeader'
import { ManufacturingCostVarianceLimitations } from './manufacturing-cost-variance/components/ManufacturingCostVarianceLimitations'
import { ManufacturingCostVarianceResults } from './manufacturing-cost-variance/components/ManufacturingCostVarianceResults'
import { ManufacturingCostVarianceSummary } from './manufacturing-cost-variance/components/ManufacturingCostVarianceSummary'
import type { CostReport } from './manufacturing-cost-variance/components/types'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const monthAgo = () => {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
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
    <ManufacturingCostVarianceHeader loading={loading} onRefresh={() => void load(page)} />
    <ManufacturingCostVarianceFilters from={from} to={to} maxTo={maxTo} loading={loading} onFromChange={setFrom} onToChange={setTo} onSubmit={submit} />
    <ManufacturingCostVarianceError error={error} onDismiss={() => setError('')} />
    {report && <>
      <ManufacturingCostVarianceSummary report={report} currency={code} />
      <ManufacturingCostVarianceResults report={report} currency={code} pageCount={pageCount} loading={loading} onPageChange={nextPage => void load(nextPage)} />
      <ManufacturingCostVarianceLimitations text={report.limitations} />
    </>}
  </div>
}
