import { Building2, CalendarClock, CircleDollarSign, PackageCheck } from 'lucide-react'

type Props = {
  tenant: { name: string; slug: string }
  allowNegativeStock: boolean
  baseCurrencyCode: string | null
  retentionDays: number | null
  loading: boolean
}

export function TenantSettingsOverview({ tenant, allowNegativeStock, baseCurrencyCode, retentionDays, loading }: Props) {
  return <div className="tenant-settings-overview" aria-label="Firma ayarları özeti">
    <div><span className="tenant-settings-stat-icon"><Building2 size={15}/></span><span>Firma kodu</span><b>{tenant.slug}</b><small>{tenant.name}</small></div>
    <div><span className="tenant-settings-stat-icon"><PackageCheck size={15}/></span><span>Stok kontrolü</span><b>{allowNegativeStock?'Negatif bakiye açık':'Negatif bakiye engelli'}</b><small>Firma politikası</small></div>
    <div><span className="tenant-settings-stat-icon"><CircleDollarSign size={15}/></span><span>Baz para birimi</span><b>{baseCurrencyCode??(loading?'Yükleniyor…':'—')}</b><small>Finans kayıtları</small></div>
    <div><span className="tenant-settings-stat-icon"><CalendarClock size={15}/></span><span>Denetim saklama</span><b>{retentionDays===null?(loading?'Yükleniyor…':'—'):`${retentionDays} gün`}</b><small>Firma kayıtları</small></div>
  </div>
}
