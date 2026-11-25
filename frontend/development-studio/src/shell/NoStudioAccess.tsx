import { ArrowLeftRight, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

type Props = {
  /** `denied`: kişinin bu firmada Studio rolü yok; `error`: roller okunamadı. */
  variant?: "denied" | "error";
  tenantName?: string;
  onLogout: () => void;
  onSwitchTenant?: () => void;
};

/** Studio rolü olmayan (ya da rolleri okunamayan) kişinin gördüğü ekran. */
export function NoStudioAccess({ variant = "denied", tenantName, onLogout, onSwitchTenant }: Props) {
  return (
    <div className="st-auth">
      <main className="st-auth-card st-no-access" aria-labelledby="studio-no-access-title">
        <div className="st-auth-main">
          <div className="st-auth-copy">
            <span className="st-empty-icon" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <h1 id="studio-no-access-title">
              {variant === "error" ? "Studio yetkileri okunamadı" : "Studio'ya erişim yok"}
            </h1>
            <p>
              {variant === "error"
                ? "Studio rolleriniz şu anda alınamadı. Sayfayı yenileyip yeniden deneyin."
                : "Studio'ya erişiminiz yok. Firma yöneticinizden Danışman ya da Yazılımcı rolü isteyin."}
            </p>
            {tenantName && <p className="st-auth-sub">{tenantName}</p>}
          </div>
          {variant === "error" && (
            <button className="ns-btn ns-btn-primary" type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={15} aria-hidden="true" />
              Yeniden dene
            </button>
          )}
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
