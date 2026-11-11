import { CalendarDays, RefreshCw, Settings2 } from "lucide-react";

type Props = {
  tenantName: string;
  dashboardName?: string;
  today: string;
  periodLabel: string;
  onRefresh: () => void;
  onManageWidgets: () => void;
};

export default function DashboardHeader({
  tenantName,
  dashboardName,
  today,
  periodLabel,
  onRefresh,
  onManageWidgets,
}: Props) {
  return (
    <>
      <div className="erp-home-heading dashboard-reference-heading">
        <div>
          <p className="eyebrow">
            ANA SAYFA · {today.toLocaleUpperCase("tr-TR")}
          </p>
          <h1>İyi günler, {dashboardName || tenantName}</h1>
          <p className="muted">
            İşletmenizin satış, satın alma, stok ve finansal durumuna genel
            bakış.
          </p>
        </div>
        <div className="erp-home-heading-actions">
          <button className="secondary" type="button" onClick={onManageWidgets}>
            <Settings2 size={15} /> Widget’ları düzenle
          </button>
          <span className="dashboard-period">
            <CalendarDays size={15} />
            {periodLabel}
          </span>
          <button className="secondary" type="button" onClick={onRefresh}>
            <RefreshCw size={15} /> Yenile
          </button>
        </div>
      </div>
    </>
  );
}
