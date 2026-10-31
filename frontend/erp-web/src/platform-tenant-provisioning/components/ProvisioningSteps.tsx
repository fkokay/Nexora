import type { ProvisioningStatus } from '../types'

export default function ProvisioningSteps({ job }: { job: ProvisioningStatus | null }) {
  return <div className="platform-provisioning-overview" aria-label="Firma hazırlama adımları">
    <div className="is-current"><i>1</i><span><b>Firma tanımı</b><small>Kimlik ve ilk yönetici</small></span></div>
    <div className={job ? 'is-current' : ''}><i>2</i><span><b>Veritabanı hazırlığı</b><small>Firmaya özel SQL alanı</small></span></div>
    <div className={job?.status === 'Completed' ? 'is-complete' : ''}><i>3</i><span><b>Kullanıma açılış</b><small>{job?.status === 'Completed' ? 'Firma hazır' : 'Hazırlık tamamlanınca'}</small></span></div>
  </div>
}
