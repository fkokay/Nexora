import { Building2, CalendarDays, RefreshCw } from 'lucide-react'

type Props = { tenantName: string; dashboardName?: string; today: string; periodLabel: string; onRefresh: () => void }

export default function DashboardHeader({ tenantName, dashboardName, today, periodLabel, onRefresh }: Props) {
  return <>
    <div className="dashboard-breadcrumb"><Building2 size={14}/><span>Ana Sayfa</span></div>
    <div className="erp-home-heading dashboard-reference-heading">
      <div><p className="eyebrow">ANA SAYFA · {today.toLocaleUpperCase('tr-TR')}</p><h1>İyi günler, {dashboardName || tenantName}</h1><p className="muted">İşletmenizin satış, satın alma, stok ve finansal durumuna genel bakış.</p></div>
      <div className="erp-home-heading-actions"><span className="dashboard-period"><CalendarDays size={15}/>{periodLabel}</span><button className="secondary" type="button" onClick={onRefresh}><RefreshCw size={15}/> Yenile</button></div>
    </div>
  </>
}
