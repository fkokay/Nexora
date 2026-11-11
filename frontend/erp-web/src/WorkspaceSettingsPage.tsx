import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  Database,
  FileText,
  Hash,
  Info,
  Link2,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { Locale } from "./WorkspaceComponents";
import "./workspace-settings.css";
import {
  SettingsSidebar,
  type SettingsNavigationItem,
} from "./workspace-settings/components/SettingsSidebar";
import { SettingsPageHeader } from "./workspace-settings/components/SettingsPageHeader";
import { SettingsTabs } from "./workspace-settings/components/SettingsTabs";
import { SettingsContent } from "./workspace-settings/components/SettingsContent";
import { CompanyInformationSettings } from "./workspace-settings/components/CompanyInformationSettings";
import { AccessControlPage } from "./AccessControlPage";
import CustomListsPage from "./CustomListsPage";
import IntegrationQueuePage from "./IntegrationQueuePage";
import { DocumentNumberTemplatesPanel } from "./DocumentNumberTemplatesPanel";
import { SettingsCard } from "./workspace-settings/components/SettingsCard";
import { SettingsRow } from "./workspace-settings/components/SettingsRow";
import { SettingsSwitch } from "./workspace-settings/components/SettingsSwitch";
import "./tenant-operational-settings.css";
type ApiRequest = typeof import("./erpApi").api;
import {
  defaultPreferences,
  type Preferences,
  type SettingsTab,
} from "./workspace-settings/types";

const prefsKey = () =>
  `aierp.workspace-preferences.${encodeURIComponent((localStorage.getItem("aierp.user") || "user").trim().toLocaleLowerCase("tr-TR"))}`;
function readPreferences(): Preferences {
  try {
    return {
      ...defaultPreferences,
      ...JSON.parse(localStorage.getItem(prefsKey()) || "{}"),
    };
  } catch {
    return defaultPreferences;
  }
}
type Props = {
  token: string;
  tenant: { id: string; name: string; slug: string; role: string };
  requestApi: ApiRequest;
  platformStatus: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: "light" | "dark") => void;
  onNavigate: (page: string) => void;
};
export function WorkspaceSettingsPage({
  token,
  tenant,
  requestApi,
  platformStatus,
  locale,
  onLocaleChange,
  onThemeChange,
  onNavigate,
}: Props) {
  const [values, setValues] = useState<Preferences>(readPreferences);
  const [tab, setTab] = useState<SettingsTab>("application");
  const [category, setCategory] = useState("general");
  const [saved, setSaved] = useState(false);
  const english = locale === "en";
  const tabs: Array<{ id: SettingsTab; label: string; en: string }> = [
    {
      id: "application",
      label: "Uygulama Ayarları",
      en: "Application settings",
    },
    { id: "appearance", label: "Görünüm ve Tema", en: "Appearance & theme" },
    { id: "regional", label: "Bölgesel Ayarlar", en: "Regional settings" },
    { id: "security", label: "Güvenlik", en: "Security" },
    { id: "notifications", label: "E-Posta (SMTP)", en: "Email (SMTP)" },
    { id: "storage", label: "Dosya ve Depolama", en: "Files & storage" },
  ];
  useEffect(() => {
    setSaved(false);
  }, [values, tab]);
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  function save() {
    localStorage.setItem(prefsKey(), JSON.stringify(values));
    onLocaleChange(values.locale);
    onThemeChange(values.theme);
    window.dispatchEvent(new Event("nexora:preferences-saved"));
    setSaved(true);
  }
  function reset() {
    if (category === "notifications") {
      setValues((current) => ({
        ...current,
        systemNotifications: defaultPreferences.systemNotifications,
        operationNotifications: defaultPreferences.operationNotifications,
        releaseNotes: defaultPreferences.releaseNotes,
      }));
      setSaved(false);
      return;
    }
    setValues(defaultPreferences);
    localStorage.removeItem(prefsKey());
    onLocaleChange(defaultPreferences.locale);
    onThemeChange(defaultPreferences.theme);
    window.dispatchEvent(new Event("nexora:preferences-saved"));
  }
  const settingNav: SettingsNavigationItem[] = [
    {
      id: "general",
      label: "Genel Ayarlar",
      en: "General settings",
      icon: Settings,
    },
    {
      id: "company-settings",
      label: "Şirket Bilgileri",
      en: "Company information",
      icon: Building2,
    },
    {
      id: "access-members",
      label: "Kullanıcılar ve Yetkiler",
      en: "Users & permissions",
      icon: Users,
    },
    {
      id: "access-roles",
      label: "Rol ve Yetki Grupları",
      en: "Roles & permission groups",
      icon: ShieldCheck,
    },
    {
      id: "custom-lists",
      label: "Parametreler",
      en: "Parameters",
      icon: SlidersHorizontal,
    },
    { id: "series", label: "Numara Serileri", en: "Number series", icon: Hash },
    {
      id: "e-transactions",
      label: "E-İşlemler",
      en: "E-transactions",
      icon: FileText,
    },
    {
      id: "integrations",
      label: "Entegrasyonlar",
      en: "Integrations",
      icon: Link2,
    },
    {
      id: "notifications",
      label: "Bildirim Ayarları",
      en: "Notification settings",
      icon: Bell,
    },
    { id: "storage", label: "Yedekleme", en: "Backup", icon: Database },
    {
      id: "system",
      label: "Sistem Bilgileri",
      en: "System information",
      icon: Info,
    },
  ];
  const title =
    settingNav.find((item) => item.id === category)?.[
      english ? "en" : "label"
    ] || "Genel Ayarlar";
  return (
    <div className="workspace-settings">
      <SettingsSidebar
        items={settingNav}
        category={category}
        english={english}
        onSelect={(item) => {
          setCategory(item.id);
          if (item.id === "notifications") setTab("notifications");
          if (item.id === "storage") setTab("storage");
        }}
      />
      <main className="settings-main">
        <SettingsPageHeader
          title={title}
          description={
            <>
              {category === "general"
                ? english
                  ? "Configure application preferences for"
                  : "Uygulama tercihlerini yapılandırın ·"
                : english
                  ? "Manage settings for"
                  : "Ayarları yönetin ·"}{" "}
              {tenant.name}
            </>
          }
          english={english}
          saved={saved}
          onReset={reset}
          onSave={save}
          showActions={category === "general" || category === "notifications"}
        />
        {category === "general" ? (
          <>
            <SettingsTabs
              tabs={tabs}
              activeTab={tab}
              english={english}
              onSelect={(value) => setTab(value as SettingsTab)}
            />
            <SettingsContent
              tab={tab}
              values={values}
              english={english}
              onUpdate={update}
              onNavigate={onNavigate}
            />
          </>
        ) : category === "company-settings" ? (
          <CompanyInformationSettings token={token} tenant={tenant} english={english} />
        ) : category === "access-members" || category === "access-roles" ? (
          <div className="settings-embedded-screen settings-access-screen"><AccessControlPage token={token} section={category === "access-members" ? "members" : "policies"} /></div>
        ) : category === "custom-lists" ? (
          <div className="settings-embedded-screen"><CustomListsPage token={token} role={tenant.role} /></div>
        ) : category === "series" ? (
          <DocumentNumberTemplatesPanel token={token} isAdmin={tenant.role === "TenantAdmin"} />
        ) : category === "e-transactions" || category === "integrations" ? (
          <div className="settings-embedded-screen"><IntegrationQueuePage token={token} requestApi={requestApi} /></div>
        ) : category === "notifications" ? (
          <div className="settings-card-grid">
            <SettingsCard icon={<Bell size={20} />} title={english ? "Notification preferences" : "Bildirim Tercihleri"}>
              <SettingsRow label={english ? "Show system notifications" : "Sistem bildirimlerini göster"}>
                <SettingsSwitch checked={values.systemNotifications} label={english ? "Show system notifications" : "Sistem bildirimlerini göster"} onChange={() => update("systemNotifications", !values.systemNotifications)} />
              </SettingsRow>
              <SettingsRow label={english ? "Notify about operation results" : "İşlem sonuçlarını bildir"}>
                <SettingsSwitch checked={values.operationNotifications} label={english ? "Notify about operation results" : "İşlem sonuçlarını bildir"} onChange={() => update("operationNotifications", !values.operationNotifications)} />
              </SettingsRow>
              <SettingsRow label={english ? "Show release announcements" : "Güncelleme duyurularını göster"}>
                <SettingsSwitch checked={values.releaseNotes} label={english ? "Show release announcements" : "Güncelleme duyurularını göster"} onChange={() => update("releaseNotes", !values.releaseNotes)} />
              </SettingsRow>
              <p className="settings-hint">{english ? "Save to apply these preferences." : "Bu tercihleri uygulamak için kaydedin."}</p>
            </SettingsCard>
          </div>
        ) : category === "storage" ? (
          <SettingsContent tab="storage" values={values} english={english} onUpdate={update} onNavigate={onNavigate} />
        ) : (
          <div className="settings-card-grid">
            <SettingsCard icon={<Info size={20} />} title={english ? "System information" : "Sistem Bilgileri"}>
              <SettingsRow label={english ? "Application" : "Uygulama"}>Nexora ERP</SettingsRow>
              <SettingsRow label={english ? "Company" : "Firma"}>{tenant.name}</SettingsRow>
              <SettingsRow label={english ? "Company code" : "Firma kodu"}>{tenant.slug}</SettingsRow>
              <SettingsRow label={english ? "Account role" : "Hesap rolü"}>{tenant.role}</SettingsRow>
              <SettingsRow label={english ? "Platform status" : "Platform durumu"}>{platformStatus}</SettingsRow>
            </SettingsCard>
          </div>
        )}
        <footer className="settings-page-footer">
          <span>
            <Building2 size={15} />
            {tenant.name}
          </span>
          <span>
            {english
              ? "Changes are applied after saving"
              : category === "general"
                ? "Değişiklikler kaydedildiğinde uygulanır"
                : "Ayarlar bu firmaya özel uygulanır"}
          </span>
        </footer>
      </main>
    </div>
  );
}
