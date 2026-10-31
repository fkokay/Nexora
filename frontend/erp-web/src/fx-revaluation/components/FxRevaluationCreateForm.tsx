import type { FxRevaluationCreateFormProps } from './types'

export default function FxRevaluationCreateForm({ date, today, busy, onDateChange, onCreate }: FxRevaluationCreateFormProps) {
  return <div className="collection-form finance-compact-form"><div className="form-two"><label>Dönem sonu tarihi<input type="date" value={date} max={today} onChange={event=>onDateChange(event.target.value)} required/></label><div className="modal-foot"><span>Eksik kur varsa fiş oluşturulmaz. Aynı tarihte tekrar fiş kesilemez.</span><button className="primary" disabled={busy||!date} onClick={onCreate}>{busy?'Hesaplanıyor…':'Değerleme fişi oluştur'}</button></div></div></div>
}
