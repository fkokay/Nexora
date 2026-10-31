import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import type { Draft, Direction, Kind } from '../paymentInstrumentTypes'

type Props = { draft: Draft; busy: boolean; onDraftChange: (draft: Draft) => void; onSubmit: (event: FormEvent) => void }

export function PaymentInstrumentCreateForm({ draft, busy, onDraftChange, onSubmit }: Props) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onDraftChange({ ...draft, [key]: value })
  return <section className="panel payment-instrument-create">
    <div className="panel-heading"><div><h3><Plus size={17}/> Portföye kayıt ekle</h3><p>Firma kapsamındaki çek veya senedi alınan/verilen yönüyle kaydedin.</p></div></div>
    <form onSubmit={onSubmit}>
      <div className="payment-instrument-form-grid">
        <label>Tür<select value={draft.type} onChange={event => set('type', event.target.value as Kind)}><option value="Check">Çek</option><option value="PromissoryNote">Senet</option></select></label>
        <label>Yön<select value={draft.direction} onChange={event => set('direction', event.target.value as Direction)}><option value="Receivable">Alacak · alınan</option><option value="Payable">Borç · verilen</option></select></label>
        <label>Çek/senet numarası<input required maxLength={80} value={draft.instrumentNumber} onChange={event => set('instrumentNumber', event.target.value)}/></label>
        <label>Cari unvanı<input required maxLength={160} value={draft.counterpartyName} onChange={event => set('counterpartyName', event.target.value)}/></label>
        <label>Banka<input required maxLength={120} value={draft.bankName} onChange={event => set('bankName', event.target.value)}/></label>
        <label>Tutar<input required type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => set('amount', event.target.value)}/></label>
        <label>Para birimi<input required minLength={3} maxLength={3} value={draft.currencyCode} onChange={event => set('currencyCode', event.target.value.toUpperCase())}/></label>
        <label>Düzenleme tarihi<input required type="date" value={draft.issueDate} onChange={event => set('issueDate', event.target.value)}/></label>
        <label>Vade tarihi<input required type="date" value={draft.dueDate} onChange={event => set('dueDate', event.target.value)}/></label>
        <label>Portföye giriş tarihi<input required type="date" value={draft.portfolioDate} onChange={event => set('portfolioDate', event.target.value)}/></label>
        <label className="payment-instrument-wide">Açıklama<textarea maxLength={500} rows={2} value={draft.notes} onChange={event => set('notes', event.target.value)}/></label>
      </div>
      <div className="payment-instrument-form-actions"><span>Kaydetmek finans hesabı bakiyesini değiştirmez; tahsil/ödeme ayrıca işlenir.</span><button className="primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Portföye ekle'}</button></div>
    </form>
  </section>
}
