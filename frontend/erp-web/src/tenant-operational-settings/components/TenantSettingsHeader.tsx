import { Building2 } from 'lucide-react'

type Props = {
  tenant: { name: string }
  loading: boolean
  busy: boolean
  onNavigate?: (page: string) => void
  onRefresh: () => void
}

export function TenantSettingsHeader({ tenant, loading, busy, onNavigate, onRefresh }: Props) {
  return <div className="page-heading tenant-settings-commandbar screen-page-header">
    <div className="tenant-settings-title-mark" aria-hidden="true"><Building2 size={21}/></div>
    <div><p className="eyebrow">FİRMA YÖNETİMİ <span>·</span> YAPILANDIRMA</p><h1>Firma ayarları</h1><p className="muted">Ticari kimlik ve operasyon kurallarını yönetin.</p></div>
    <div className="tenant-settings-title-context"><span className="tenant-settings-context-icon"><Building2 size={15}/></span><span><small>Aktif firma</small><b>{tenant.name}</b></span></div>
    <div className="company-settings-actions"><button className="secondary" onClick={()=>onNavigate?.('license-settings')}>Lisans ve kota</button><button className="secondary" onClick={onRefresh} disabled={loading||busy}><span aria-hidden>↻</span> Yenile</button></div>
  </div>
}
