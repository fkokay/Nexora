import { Building2 } from "lucide-react";

type Props = {
  tenant: { name: string };
  loading: boolean;
  busy: boolean;
  onNavigate?: (page: string) => void;
  onRefresh: () => void;
};

export function TenantSettingsHeader({
  tenant,
  loading,
  busy,
  onNavigate,
  onRefresh,
}: Props) {
  return (
    <header className="settings-heading tenant-settings-commandbar screen-page-header">
      <div>
        <span className="settings-heading-icon" aria-hidden="true">
          <Building2 size={22} />
        </span>
        <span>
          <h1>Firma Ayarları</h1>
          <p>Ticari kimlik ve operasyon kurallarını yönetin · {tenant.name}</p>
        </span>
      </div>
      <div>
        <button
          className="secondary"
          onClick={() => onNavigate?.("license-settings")}
        >
          Lisans ve kota
        </button>
        <button
          className="secondary"
          onClick={onRefresh}
          disabled={loading || busy}
        >
          <span aria-hidden>↻</span> Yenile
        </button>
      </div>
    </header>
  );
}
