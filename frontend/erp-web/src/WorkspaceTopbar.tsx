import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Building2,
  ChevronDown,
  Code2,
  ExternalLink,
  Grid2X2,
  KeyRound,
  Link2,
  LogOut,
  Moon,
  PanelRightOpen,
  PanelRightClose,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
} from "lucide-react";
import type { Locale } from "./WorkspaceComponents";
import type { Tenant, Theme } from "./erp-types";
import { api } from "./erpApi";
import "./notification-alerts.css";
import "./password-change.css";

type SecurityAlert = {
  id: string;
  facilityCode: string;
  type: string;
  code: string;
  amount: number;
  currencyCode: string;
  expiryDate: string;
  alert: "Expired" | "Expiring";
};
type SecurityAlertSummary = {
  expiredCount: number;
  expiringCount: number;
  items: SecurityAlert[];
};

type Props = {
  locale: Locale;
  token: string;
  tenant: Tenant;
  tenants: Tenant[];
  theme: Theme;
  standaloneStudio: boolean;
  rightWidgetsOpen: boolean;
  onToggleRightWidgets: () => void;
  developerModeOpen: boolean;
  onOpenSearch: () => void;
  onThemeChange: (theme: Theme) => void;
  onLocaleChange: (locale: Locale) => void;
  onOpenDeveloperMode: () => void;
  onSelectTenant: (tenant: Tenant) => void | Promise<void>;
  onOpenCompanySettings: () => void;
  onNavigate: (page: string) => void;
  onSignOut: () => void;
};

export function WorkspaceTopbar({
  locale,
  token,
  tenant,
  tenants,
  theme,
  standaloneStudio,
  rightWidgetsOpen,
  onToggleRightWidgets,
  onOpenSearch,
  onThemeChange,
  onLocaleChange,
  onOpenDeveloperMode,
  onSelectTenant,
  onOpenCompanySettings,
  onNavigate,
  onSignOut,
}: Props) {
  const english = locale === "en";
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [tenantOpen, setTenantOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState("");
  const [dismissingAlert, setDismissingAlert] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const tenantRef = useRef<HTMLDivElement>(null);
  const tenantTriggerRef = useRef<HTMLButtonElement>(null);
  const tenantMenuRef = useRef<HTMLDivElement>(null);
  const [tenantMenuPosition, setTenantMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const loadAlerts = useCallback(
    async (signal?: AbortSignal) => {
      if (standaloneStudio || !token) return;
      setAlertsLoading(true);
      try {
        const summary = await api<SecurityAlertSummary>(
          "/api/finance/credit-facilities/securities/alerts?expiryWithinDays=30",
          token,
          { signal },
        );
        if (signal?.aborted) return;
        setAlerts(summary.items ?? []);
        setAlertCount(
          (summary.expiredCount ?? 0) + (summary.expiringCount ?? 0),
        );
        setAlertsError("");
      } catch (error) {
        if (signal?.aborted) return;
        setAlertsError(
          error instanceof Error
            ? error.message
            : english
              ? "Notifications could not be loaded."
              : "Bildirimler yüklenemedi.",
        );
      } finally {
        if (!signal?.aborted) setAlertsLoading(false);
      }
    },
    [english, standaloneStudio, token],
  );

  useEffect(() => {
    if (standaloneStudio || !token) return;
    const controller = new AbortController();
    void loadAlerts(controller.signal);
    const timer = window.setInterval(() => void loadAlerts(), 5 * 60 * 1000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [loadAlerts, standaloneStudio, tenant.id, token]);

  const dismissAlert = async (alert: SecurityAlert) => {
    const key = `${alert.id}:${alert.alert}`;
    setDismissingAlert(key);
    try {
      await api<void>(
        `/api/finance/credit-facilities/securities/${alert.id}/alerts/${alert.alert}/dismiss`,
        token,
        { method: "POST" },
      );
      setAlerts((current) =>
        current.filter(
          (item) => item.id !== alert.id || item.alert !== alert.alert,
        ),
      );
      setAlertCount((count) => Math.max(0, count - 1));
    } catch (error) {
      setAlertsError(
        error instanceof Error
          ? error.message
          : english
            ? "Notification could not be dismissed."
            : "Bildirim kapatılamadı.",
      );
    } finally {
      setDismissingAlert(null);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (newPassword.length < 6) {
      setPasswordError(english ? "Use at least 6 characters for the new password." : "Yeni şifre en az 6 karakter olmalı.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(english ? "The new passwords do not match." : "Yeni şifreler eşleşmiyor.");
      return;
    }
    setPasswordBusy(true);
    try {
      await api<void>("/api/auth/change-password", token, {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice(english ? "Your password has been changed." : "Şifreniz değiştirildi.");
      setPasswordDialogOpen(false);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : (english ? "Password could not be changed." : "Şifre değiştirilemedi."));
    } finally {
      setPasswordBusy(false);
    }
  };

  useEffect(() => {
    if (!profileOpen && !tenantOpen && !notificationsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false);
      if (
        !tenantRef.current?.contains(event.target) &&
        !tenantMenuRef.current?.contains(event.target)
      )
        setTenantOpen(false);
      if (!(event.target as Element).closest(".notification-menu-wrap"))
        setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setTenantOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen, tenantOpen, notificationsOpen]);

  useLayoutEffect(() => {
    if (!tenantOpen) {
      setTenantMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      const trigger = tenantTriggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const width = Math.min(340, Math.max(0, window.innerWidth - 24));
      const left = Math.min(
        Math.max(12, bounds.left),
        Math.max(12, window.innerWidth - width - 12),
      );
      setTenantMenuPosition({ top: bounds.bottom + 8, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [tenantOpen]);

  return (
    <header className="topbar">
      <div className="crumb">
        <span className="topbar-brand">
          <span className="brand-mark small">
            <Link2 size={16} />
          </span>
          <span>
            nexora<strong>ERP</strong>
          </span>
        </span>
        <span className="topbar-divider" />
        <div className="tenant-context-wrap" ref={tenantRef}>
          <button
            ref={tenantTriggerRef}
            type="button"
            className="tenant-context"
            aria-haspopup="menu"
            aria-expanded={tenantOpen}
            aria-controls={tenantOpen ? "tenant-context-menu" : undefined}
            onClick={() => setTenantOpen((value) => !value)}
          >
            <Building2 size={17} />
            <span>{tenant.name}</span>
            <ChevronDown size={14} />
          </button>
          {tenantOpen &&
            tenantMenuPosition &&
            createPortal(
              <div
                id="tenant-context-menu"
                ref={tenantMenuRef}
                className="tenant-context-menu"
                role="menu"
                aria-label={
                  english ? "Available companies" : "Tanımlı firmalar"
                }
                style={{
                  position: "fixed",
                  top: tenantMenuPosition.top,
                  left: tenantMenuPosition.left,
                  width: tenantMenuPosition.width,
                  zIndex: 10050,
                }}
              >
                <div className="tenant-context-menu-heading">
                  {english ? "COMPANIES" : "TANIMLI FİRMALAR"}
                </div>
                {tenants.map((item) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={item.id}
                    className={item.id === tenant.id ? "active" : ""}
                    aria-current={item.id === tenant.id ? "true" : undefined}
                    onClick={() => {
                      setTenantOpen(false);
                      if (item.id !== tenant.id) void onSelectTenant(item);
                    }}
                  >
                    <span className="tenant-context-avatar">
                      {item.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <b>{item.name}</b>
                      <small>{item.role}</small>
                    </span>
                    {item.id === tenant.id && <i>✓</i>}
                  </button>
                ))}
              </div>,
              document.body,
            )}
        </div>
      </div>
      <div className="top-actions">
        <button
          type="button"
          className="global-search"
          aria-label={
            english ? "Search pages and customers" : "Ekran ve cari ara"
          }
          onClick={onOpenSearch}
        >
          <Search size={16} />
          <span>{english ? "Search" : "Hızlı ara"}</span>
          <kbd>Ctrl + K</kbd>
        </button>
        <button
          type="button"
          className="assistant-trigger"
          aria-label={english ? "Open AI assistant" : "AI asistanı aç"}
          onClick={() => onNavigate("erp-assistant")}
        >
          <Sparkles size={17} />
          <span>{english ? "AI Assistant" : "AI Asistan"}</span>
        </button>
        <div className="notification-menu-wrap notification-wrap">
          <button
            type="button"
            className="icon-button notification"
            aria-label={`${english ? "Notifications" : "Bildirimler"}${alertCount ? ` (${alertCount})` : ""}`}
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            onClick={() => {
              const open = !notificationsOpen;
              setNotificationsOpen(open);
              if (open) void loadAlerts();
            }}
          >
            <Bell size={18} />
            {alertCount > 0 && (
              <span
                className="notification-count"
                aria-label={`${alertCount} ${english ? "alerts" : "uyarı"}`}
              >
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <section
              className="notification-popover"
              role="dialog"
              aria-label={english ? "Notifications" : "Bildirimler"}
            >
              <header>
                <div>
                  <b>{english ? "Expiry alerts" : "Vade uyarıları"}</b>
                  <small>
                    {english
                      ? "Active guarantees and collateral"
                      : "Aktif teminat ve garantiler"}
                  </small>
                </div>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setNotificationsOpen(false);
                    onNavigate("finance-credit-facilities");
                  }}
                >
                  {english ? "View finance" : "Finansı aç"}
                </button>
              </header>
              {alertsError ? (
                <p className="notification-message error" role="alert">
                  {alertsError}
                </p>
              ) : alertsLoading && alerts.length === 0 ? (
                <p className="notification-message" role="status">
                  {english ? "Loading alerts…" : "Uyarılar yükleniyor…"}
                </p>
              ) : alerts.length === 0 ? (
                <p className="notification-message">
                  {english
                    ? "No active expiry alerts."
                    : "Etkin vade uyarısı yok."}
                </p>
              ) : (
                <div className="notification-list">
                  {alerts.map((alert) => {
                    const expired = alert.alert === "Expired";
                    const key = `${alert.id}:${alert.alert}`;
                    const date = new Intl.DateTimeFormat(
                      english ? "en" : "tr-TR",
                    ).format(new Date(`${alert.expiryDate}T00:00:00`));
                    const amount = new Intl.NumberFormat(
                      english ? "en" : "tr-TR",
                      { maximumFractionDigits: 2 },
                    ).format(alert.amount);
                    return (
                      <div className="notification-item" key={key}>
                        <button
                          type="button"
                          className="notification-open"
                          onClick={() => {
                            setNotificationsOpen(false);
                            onNavigate("finance-credit-facilities");
                          }}
                        >
                          <span
                            className={`notification-indicator${expired ? " expired" : ""}`}
                          >
                            <ShieldAlert size={15} />
                          </span>
                          <span className="notification-copy">
                            <b>
                              {alert.code} · {alert.facilityCode}
                            </b>
                            <small>
                              {expired
                                ? english
                                  ? `Expired ${date}`
                                  : `${date} tarihinde vadesi doldu`
                                : english
                                  ? `Expires ${date}`
                                  : `${date} tarihinde vadesi doluyor`}
                            </small>
                          </span>
                          <strong className={expired ? "expired" : ""}>
                            {amount} {alert.currencyCode}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className="notification-dismiss"
                          aria-label={
                            english
                              ? `Dismiss ${alert.code}`
                              : `${alert.code} uyarısını kapat`
                          }
                          title={english ? "Dismiss" : "Kapat"}
                          disabled={dismissingAlert === key}
                          onClick={() => void dismissAlert(alert)}
                        >
                          {dismissingAlert === key ? "…" : "×"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <footer>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen(false);
                    onNavigate("finance-credit-facilities");
                  }}
                >
                  {english
                    ? "Open loans & financing"
                    : "Krediler ve finansmanı aç"}
                  <ExternalLink size={13} />
                </button>
              </footer>
            </section>
          )}
        </div>
        <button
          type="button"
          className="icon-button topbar-settings"
          aria-label={english ? "Settings" : "Ayarlar"}
          title={english ? "Settings" : "Ayarlar"}
          onClick={() => onNavigate("settings")}
        >
          <Settings size={19} />
        </button>
        <button
          type="button"
          className="icon-button topbar-modules"
          aria-label={english ? "Module marketplace" : "Modül pazaryeri"}
          title={english ? "Module marketplace" : "Modül pazaryeri"}
          onClick={() => onNavigate("modules")}
        >
          <Grid2X2 size={19} />
        </button>
        {!standaloneStudio && (
          <button
            type="button"
            className="topbar-widgets-toggle"
            aria-label={english ? (rightWidgetsOpen ? "Hide side widgets" : "Show side widgets") : (rightWidgetsOpen ? "Yan paneli kapat" : "Yan paneli aç")}
            aria-pressed={rightWidgetsOpen}
            title={english ? (rightWidgetsOpen ? "Hide side widgets" : "Show side widgets") : (rightWidgetsOpen ? "Yan paneli kapat" : "Yan paneli aç")}
            onClick={onToggleRightWidgets}
          >
            {rightWidgetsOpen
              ? <PanelRightClose size={19} strokeWidth={2.25} aria-hidden="true" />
              : <PanelRightOpen size={19} strokeWidth={2.25} aria-hidden="true" />}
            <span>{english ? (rightWidgetsOpen ? "Hide widgets" : "Show widgets") : (rightWidgetsOpen ? "Widgetleri gizle" : "Widgetleri göster")}</span>
          </button>
        )}
        <div className="profile-menu-wrap" ref={profileRef}>
          <button
            className="top-avatar"
            type="button"
            aria-label={english ? "Open profile menu" : "Profil menüsünü aç"}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((value) => !value)}
          >
            <span className="top-avatar-initial">
            {(localStorage.getItem("aierp.user") || "A")
              .slice(0, 1)
              .toUpperCase()}
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {profileOpen && (
            <div className="profile-dropdown" role="menu">
              <div className="profile-dropdown-identity">
                <b>
                  {localStorage.getItem("aierp.user") ||
                    (english ? "User" : "Kullanıcı")}
                </b>
                <small>{tenant.role}</small>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPasswordError("");
                  setPasswordNotice("");
                  setProfileOpen(false);
                  setPasswordDialogOpen(true);
                }}
              >
                <KeyRound size={15} />
                {english ? "Change password" : "Şifre değiştir"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  onThemeChange(theme === "dark" ? "light" : "dark");
                }}
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                {theme === "dark"
                  ? english ? "Light appearance" : "Açık görünüm"
                  : english ? "Dark appearance" : "Koyu görünüm"}
              </button>
              <div className="profile-dropdown-languages" role="group" aria-label={english ? "Language" : "Dil"}>
                <button type="button" aria-pressed={!english} onClick={() => onLocaleChange("tr")}>TR</button>
                <button type="button" aria-pressed={english} onClick={() => onLocaleChange("en")}>EN</button>
              </div>
              {!standaloneStudio && tenant.role === "TenantAdmin" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    onOpenDeveloperMode();
                  }}
                >
                  <Code2 size={15} />
                  {english ? "Developer mode" : "Geliştirici modu"}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  onOpenCompanySettings();
                }}
              >
                <Settings size={15} />
                {english ? "Company settings" : "Firma ayarları"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="profile-dropdown-signout"
                onClick={() => {
                  setProfileOpen(false);
                  onSignOut();
                }}
              >
                <LogOut size={15} />
                {english ? "Sign out" : "Oturumu kapat"}
              </button>
            </div>
          )}
        </div>
      </div>
      {passwordDialogOpen && createPortal(
        <div
          className="modal-backdrop password-change-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !passwordBusy) setPasswordDialogOpen(false);
          }}
        >
          <section className="modal password-change-modal" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
            <div className="modal-head">
              <h2 id="password-change-title">{english ? "Change password" : "Şifre değiştir"}</h2>
              <button className="icon-button" type="button" aria-label={english ? "Close" : "Kapat"} disabled={passwordBusy} onClick={() => setPasswordDialogOpen(false)}>×</button>
            </div>
            <p className="modal-sub muted">{english ? "Enter your current password and choose a new one." : "Mevcut şifrenizi doğrulayın ve yeni şifrenizi belirleyin."}</p>
            <form onSubmit={(event) => void changePassword(event)}>
              <label>{english ? "Current password" : "Mevcut şifre"}
                <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </label>
              <label>{english ? "New password" : "Yeni şifre"}
                <input type="password" autoComplete="new-password" minLength={6} maxLength={256} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </label>
              <label>{english ? "Confirm new password" : "Yeni şifre (tekrar)"}
                <input type="password" autoComplete="new-password" minLength={6} maxLength={256} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
              <p className="password-change-hint">{english ? "Use at least 6 characters." : "En az 6 karakter kullanın."}</p>
              {passwordError && <p className="password-change-error" role="alert">{passwordError}</p>}
              <div className="modal-foot">
                <span />
                <div>
                  <button type="button" className="secondary" disabled={passwordBusy} onClick={() => setPasswordDialogOpen(false)}>{english ? "Cancel" : "Vazgeç"}</button>
                  <button type="submit" className="primary" disabled={passwordBusy}>{passwordBusy ? (english ? "Saving…" : "Kaydediliyor…") : (english ? "Save password" : "Şifreyi kaydet")}</button>
                </div>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}
      {passwordNotice && <div className="password-change-toast" role="status">{passwordNotice}</div>}
    </header>
  );
}
