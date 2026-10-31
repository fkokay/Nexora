import type { FormEvent } from 'react'

type Props = {
  from: string
  to: string
  maxTo?: string
  loading: boolean
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ManufacturingCostVarianceFilters({ from, to, maxTo, loading, onFromChange, onToChange, onSubmit }: Props) {
  return <form className="panel manufacturing-cost-filters" onSubmit={onSubmit}>
    <label>Plan tarihi başlangıcı<input type="date" value={from} max={to} onChange={event => onFromChange(event.target.value)} required/></label>
    <label>Plan tarihi bitişi<input type="date" value={to} min={from} max={maxTo} onChange={event => onToChange(event.target.value)} required/></label>
    <button className="primary" disabled={loading}>{loading ? 'Rapor hazırlanıyor…' : 'Raporu getir'}</button>
  </form>
}
