import type { FormEvent } from 'react'

type Props = {
  editing: boolean
  code: string
  name: string
  percent: string
  from: string
  through: string
  busy: boolean
  onCodeChange: (value: string) => void
  onNameChange: (value: string) => void
  onPercentChange: (value: string) => void
  onFromChange: (value: string) => void
  onThroughChange: (value: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}

export default function CampaignDialog({ editing, code, name, percent, from, through, busy, onCodeChange, onNameChange, onPercentChange, onFromChange, onThroughChange, onClose, onSubmit }: Props) {
  return <div className="sales-promotion-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="panel sales-campaign-create" role="dialog" aria-modal="true" aria-labelledby="sales-campaign-create-title"><div className="panel-heading"><div><b id="sales-campaign-create-title">{editing ? 'Kampanyayı düzenle' : 'Kampanya oluştur'}</b><small>Yönetim işlemleri firma yöneticisi yetkisi gerektirir.</small></div><button type="button" className="secondary" onClick={onClose}>Kapat</button></div><form onSubmit={onSubmit} className="form-two">
    <label>Kampanya kodu<input value={code} onChange={event => onCodeChange(event.target.value.toUpperCase())} required maxLength={40} /></label><label>Kampanya adı<input value={name} onChange={event => onNameChange(event.target.value)} required maxLength={120} /></label>
    <label>İndirim yüzdesi<input type="number" min="0.01" max="100" step="0.01" value={percent} onChange={event => onPercentChange(event.target.value)} required /></label><label>Başlangıç tarihi<input type="date" value={from} onChange={event => onFromChange(event.target.value)} required /></label><label>Bitiş tarihi<input type="date" value={through} onChange={event => onThroughChange(event.target.value)} required /></label>
    <div className="modal-foot"><span>İndirim tutarları sunucuda hesaplanır.</span><button className="primary" disabled={busy}>{busy ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Kampanya oluştur'}</button></div>
  </form></section></div>
}
