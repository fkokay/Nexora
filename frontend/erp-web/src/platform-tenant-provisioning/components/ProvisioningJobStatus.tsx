import { CircleAlert, RotateCw } from 'lucide-react'
import type { ProvisioningStatus } from '../types'

type Props = {
  job: ProvisioningStatus
  pollError: string
  busy: boolean
  errorText: (code: string) => string
  onRetry: () => void
}

export default function ProvisioningJobStatus({ job, pollError, busy, errorText, onRetry }: Props) {
  return <section className="panel platform-provisioning-status" aria-live="polite">
    <div className="panel-heading">
      <div><p className="eyebrow">HAZIRLAMA DURUMU</p><h3>{job.status === 'Completed' ? 'Firma hazır' : job.status === 'Failed' ? 'Hazırlık tamamlanamadı' : 'Firma hazırlanıyor'}</h3></div>
      <span className={`platform-provisioning-badge is-${job.status.toLowerCase()}`}>{job.status === 'Queued' ? 'Sırada' : job.status === 'Running' ? 'Hazırlanıyor' : job.status === 'Completed' ? 'Hazır' : 'Başarısız'}</span>
    </div>
    <div className="platform-provisioning-details">
      <div><span>Firma kimliği</span><code>{job.tenantId}</code></div>
      <div><span>Veritabanı durumu</span><b>{job.provisioningState ?? 'Kontrol ediliyor'}</b></div>
      <div><span>Deneme</span><b>{job.attemptCount}</b></div>
    </div>
    {job.errorCode && <p className="platform-provisioning-error" role="status"><CircleAlert size={16}/>{errorText(job.errorCode)}</p>}
    {pollError && <p className="platform-provisioning-note" role="status">{pollError}</p>}
    {job.status === 'Failed' && <div className="platform-provisioning-actions"><button className="secondary" onClick={onRetry} disabled={busy}><RotateCw size={15}/> Yeniden dene</button></div>}
    {job.status === 'Completed' && <p className="platform-provisioning-success">Veritabanı hazır. Firma artık kullanıcı oturumlarında seçilebilir.</p>}
  </section>
}
