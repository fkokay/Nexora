import { Building2, ShieldCheck } from 'lucide-react'

export default function ProvisioningHeader() {
  return <div className="platform-provisioning-heading platform-provisioning-commandbar">
    <div>
      <p className="eyebrow">PLATFORM YÖNETİMİ</p>
      <h1>Yeni firma</h1>
      <p className="muted">Firma kaydı sıraya alınır. Veritabanı hazır olduğunda firma kullanıma açılır.</p>
    </div>
    <div className="platform-provisioning-command-actions"><span className="platform-provisioning-mark"><Building2 size={20}/></span><span className="platform-provisioning-security"><ShieldCheck size={15}/> Platform erişimi</span></div>
  </div>
}
