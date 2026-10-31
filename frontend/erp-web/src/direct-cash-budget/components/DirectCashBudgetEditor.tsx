import type { FormEvent } from 'react'
import { categories, type LineInput, type PlanView } from '../types'

type Props = {
  selected: PlanView | null
  name: string
  year: number
  currency: string
  lines: LineInput[]
  busy: boolean
  onSubmit: (event: FormEvent) => void
  onNameChange: (value: string) => void
  onYearChange: (value: number) => void
  onCurrencyChange: (value: string) => void
  onAddLine: () => void
  onUpdateLine: (index: number, patch: Partial<LineInput>) => void
  onRemoveLine: (index: number) => void
  onCancel: () => void
}

export default function DirectCashBudgetEditor({ selected, name, year, currency, lines, busy, onSubmit, onNameChange, onYearChange, onCurrencyChange, onAddLine, onUpdateLine, onRemoveLine, onCancel }: Props) {
  return <section className="panel direct-cash-budget-editor" aria-labelledby="direct-cash-budget-editor-title">
    <div className="panel-heading"><div><h2 id="direct-cash-budget-editor-title">{selected ? 'Taslağı düzenle' : 'Yeni taslak'}</h2><p>Tahsilat ve ödemeleri planlayın; kaydetmek gerçek işlem başlatmaz.</p></div></div>
    <form className="collection-form" onSubmit={onSubmit}>
      <div className="form-two"><label>Plan adı<input value={name} onChange={event => onNameChange(event.target.value)} maxLength={120} required disabled={busy}/></label><label>Mali yıl<input type="number" min="2000" max="2100" value={year} onChange={event => onYearChange(Number(event.target.value))} required disabled={busy}/></label></div>
      <div className="form-two"><label>Para birimi (ISO 4217)<input value={currency} onChange={event => onCurrencyChange(event.target.value.toUpperCase())} minLength={3} maxLength={3} pattern="[A-Z]{3}" required disabled={busy}/></label><div className="boundary-note"><span>Plan yalnız aynı para birimindeki tahmin satırlarıyla toplanır; kur dönüşümü yapılmaz.</span></div></div>
      <div className="direct-cash-budget-line-heading"><div><h3>Aylık nakit satırları</h3><p>En çok 1.200 satır; ayın ilk günü kullanılır.</p></div><button className="secondary small-button" type="button" onClick={onAddLine} disabled={busy || lines.length >= 1200}>+ Satır ekle</button></div>
      {lines.map((line, index) => <fieldset className="direct-cash-budget-line" key={index}><legend>Satır {index + 1}</legend>
        <label>Ay<input type="month" value={line.periodStart.slice(0, 7)} onChange={event => onUpdateLine(index, { periodStart: `${event.target.value}-01` })} required disabled={busy}/></label>
        <label>Tür<select value={line.direction} onChange={event => onUpdateLine(index, { direction: event.target.value as LineInput['direction'] })} disabled={busy}><option value="Inflow">Tahsilat</option><option value="Outflow">Ödeme</option></select></label>
        <label>Kategori<select value={line.category} onChange={event => onUpdateLine(index, { category: event.target.value })} disabled={busy}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Açıklama<input value={line.description} onChange={event => onUpdateLine(index, { description: event.target.value })} maxLength={240} required disabled={busy}/></label>
        <label>Tutar<input type="number" min="0" max="9999999999999999" step="0.01" value={line.amount} onChange={event => onUpdateLine(index, { amount: Number(event.target.value) })} required disabled={busy}/></label>
        <button type="button" className="row-action danger" onClick={() => onRemoveLine(index)} disabled={busy || lines.length <= 1}>Sil</button>
      </fieldset>)}
      <div className="budget-form-foot"><span>Sürüm {selected?.revision ?? 1} · Onaylama farklı bir TenantAdmin tarafından yapılmalıdır.</span><div><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Vazgeç</button><button type="submit" className="primary" disabled={busy || !name.trim() || !/^[A-Z]{3}$/.test(currency) || lines.length === 0}>{busy ? 'Kaydediliyor…' : selected ? 'Taslağı kaydet' : 'Taslak oluştur'}</button></div></div>
    </form>
  </section>
}
