import { ArrowLeftRight, LogOut, ShieldCheck } from "lucide-react";

type Props = {
  tenantName?: string;
  onLogout: () => void;
  onSwitchTenant?: () => void;
};

/** Studio rolü olmayan kişinin gördüğü ekran. Roller okunamazsa kabuk bunun yerine kısıtlı menüyle açılır. */
export function NoStudioAccess({ tenantName, onLogout, onSwitchTenant }: Props) {
  return (
    <div className="st-auth">
      <main className="st-auth-card st-no-access" aria-labelledby="studio-no-access-title">
        <div className="st-auth-main">
          <div className="st-auth-copy">
            <span className="st-empty-icon" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <h1 id="studio-no-access-title">Studio'ya erişim yok</h1>
            <p>Studio'ya erişiminiz yok. Firma yöneticinizden Danışman ya da Yazılımcı rolü isteyin.</p>
            {tenantName && <p className="st-auth-sub">{tenantName}</p>}
          </div>
          {onSwitchTenant && (
            <button className="ns-btn" type="button" onClick={onSwitchTenant}>
              <ArrowLeftRight size={15} aria-hidden="true" />
              Başka firma seç
            </button>
          )}
          <button className="ns-btn ns-btn-ghost st-auth-switch" type="button" onClick={onLogout}>
            <LogOut size={15} aria-hidden="true" />
            Farklı hesapla giriş yap
          </button>
        </div>
      </main>
    </div>
  );
}
