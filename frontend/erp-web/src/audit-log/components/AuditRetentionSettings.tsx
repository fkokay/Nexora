import type { FormEvent } from 'react'
import type { AuditRetentionPolicy } from '../types'

type Props = {
  retention: AuditRetentionPolicy | null
  retentionDays: string
  busy: boolean
  error: string
  notice: string
  onDaysChange: (value: string) => void
  onClearError: () => void
  onClearNotice: () => void
  onSubmit: (event: FormEvent) => void
}

export function AuditRetentionSettings({ retention, retentionDays, busy, error, notice, onDaysChange, onClearError, onClearNotice, onSubmit }: Props) {
  const minimumDays = retention?.minimumRetentionDays ?? 30
  const maximumDays = retention?.maximumRetentionDays ?? 3650
  return <section className="panel" style={{ marginBottom: 18 }}>
    <div className="panel-heading"><div><h3>Audit kayıtlarının saklanması</h3><p>Süre tenant bazındadır. Süresi dolan kayıtlar her gün 02.00 UTC’de denetlenebilir temizlik işiyle silinir.</p></div></div>
    {error && <div className="alert inline-alert">{error}<button type="button" onClick={onClearError}>×</button></div>}
    {notice && <div className="notice">{notice}<button type="button" onClick={onClearNotice}>×</button></div>}
    <form className="audit-retention-form" onSubmit={onSubmit}>
      <label className="audit-retention-field" htmlFor="audit-retention-days"><span className="audit-retention-label">Saklama süresi</span><span className="audit-retention-control">
        <input id="audit-retention-days" className="audit-retention-input" type="number" min={minimumDays} max={maximumDays} step="1" value={retentionDays} onChange={event => onDaysChange(event.target.value)} aria-describedby="audit-retention-help" required/><span aria-hidden="true">gün</span>
      </span></label>
      <div className="audit-retention-meta"><span id="audit-retention-help">{retention?.lastPurgeAt ? `Son temizlik: ${new Date(retention.lastPurgeAt).toLocaleString('tr-TR')}` : 'Henüz temizlik çalışmadı.'} · İzin verilen aralık: {minimumDays}–{maximumDays} gün</span><button type="submit" className="primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Politikayı kaydet'}</button></div>
    </form>
  </section>
}
