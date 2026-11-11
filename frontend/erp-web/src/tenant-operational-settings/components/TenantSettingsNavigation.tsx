import type { LucideIcon } from "lucide-react";
import { Building2, ShieldCheck } from "lucide-react";

export type SettingId = "profile" | "stock" | "currency" | "audit" | "documents";
export type SettingNavItem = {
  id: SettingId;
  title: string;
  description: string;
  value: string;
  icon: LucideIcon;
};

type Props = {
  items: SettingNavItem[];
  active: SettingId;
  onSelect: (id: SettingId) => void;
};

export function TenantSettingsNavigation({ items, active, onSelect }: Props) {
  return (
    <nav className="tenant-settings-nav" aria-label="Firma ayar kategorileri">
      <div className="tenant-settings-sidebar-title">
        <span aria-hidden="true"><Building2 size={21} /></span>
        <span><b>Firma ayarları</b><small>Firma yapılandırması</small></span>
      </div>
      <p className="eyebrow">YAPILANDIRMA</p>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.id}
            className={active === item.id ? "active" : ""}
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="tenant-settings-nav-icon">
              <Icon size={16} />
            </span>
            <span className="tenant-settings-nav-copy">
              <b>{item.title}</b>
              <small>{item.description}</small>
            </span>
            <em>{item.value}</em>
          </button>
        );
      })}
      <div className="tenant-settings-nav-note">
        <ShieldCheck size={15} />
        <span>Ayarlar yalnız bu firmaya uygulanır.</span>
      </div>
    </nav>
  );
}
