import { lazy, Suspense, useEffect, useState, type RefObject } from "react";
import {
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Eye,
  EyeOff,
  Factory,
  Home,
  Landmark,
  Package,
  ShoppingCart,
  UserRoundPlus,
  AlertTriangle,
  X,
} from "lucide-react";
import { api } from "./erpApi";
import { WorkspaceSearchDialog } from "./WorkspaceSearchDialog";
import { WorkspaceTopbar } from "./WorkspaceTopbar";
import { StandaloneStudioHeader } from "./StandaloneStudioHeader";
import { WorkspacePageRouter } from "./WorkspacePageRouter";
import { CustomerReferenceSidebar } from "./customers/components/CustomerReferenceSidebar";
import {
  WorkspaceTabs,
  KeepAliveViews,
  type GlobalSearchResult,
  type Locale,
} from "./WorkspaceComponents";
import type { ModuleMenuSelection } from "./ModuleMarketplacePage";
import type { Dashboard, Tenant, Theme } from "./erp-types";
type ApiRequest = typeof import("./erpApi").api;

const workbenchRailItems = [
  { id: "dashboard", page: "launcher", label: ["Ana Sayfa", "Home"], icon: Home },
  { id: "customers", page: "customers", label: ["Cari", "Customers"], icon: Building2 },
  { id: "customer-create", page: "customer-create", label: ["Cari Ekle", "New Customer"], icon: UserRoundPlus },
  { id: "inventory", page: "inventory-stock", label: ["Stok", "Stock"], icon: Package },
  { id: "sales", page: "sales-invoices", label: ["Satış", "Sales"], icon: ShoppingCart },
  { id: "purchasing", page: "sales-purchase-invoices", label: ["Satın Alma", "Purchasing"], icon: Boxes },
  { id: "finance", page: "finance-accounts", label: ["Finans", "Finance"], icon: Landmark },
  { id: "warehouse", page: "inventory-warehouses", label: ["Depo", "Warehousing"], icon: Package },
  { id: "manufacturing", page: "manufacturing-orders", label: ["Üretim", "Production"], icon: Factory },
  { id: "reports", page: "reports", label: ["Raporlar", "Reports"], icon: BarChart3 },
  { id: "modules", page: "modules", label: ["Tanımlar", "Modules"], icon: Boxes },
];

const standardListPages = new Set([
  "customers", "customer-ledger", "crm-opportunities", "fixed-assets", "human-resources",
  "manufacturing-cost-variance", "manufacturing-recipes", "manufacturing-work-centers",
  "manufacturing-orders", "manufacturing-mrp", "inventory-tracking", "inventory-stock-movements",
  "inventory-cost", "inventory-locations", "inventory-stock", "inventory-warehouses", "inventory-transfers",
  "commercial-contracts", "sales-distribution", "sales-promotions", "sales-purchase-delivery-notes",
  "sales-quotes", "sales-requests", "sales-purchase-quotes", "sales-orders", "sales-invoices",
  "sales-deliveries", "sales-purchasing", "sales-purchase-invoices", "sales-purchase-receipts",
  "sales-purchase-invoice-drafts", "finance-instruments", "finance-budget", "finance-cash-budget",
  "finance-accounts", "finance-banks", "finance-statements", "finance-cash-flow", "finance-fx",
  "finance-ledger", "finance-ledger-chart", "finance-ledger-mappings", "finance-journal-vouchers",
  "finance-trial-balance", "finance-balance-sheet", "finance-journal-ledger", "finance-transfer-sources", "finance-exposure",
  "finance-maturities", "finance-credit-facilities", "location-definitions", "address-definitions",
  "projects", "foreign-trade", "workflows", "custom-forms", "custom-lists", "custom-menus",
  "business-rules", "screen-views", "access", "audit", "reports", "integrations",
]);

function WorkspaceRail({
  page,
  locale,
  token,
  onNavigate,
}: {
  page: string;
  locale: Locale;
  token: string;
  onNavigate: (page: string, label?: string) => void;
}) {
  const defaultOrder = workbenchRailItems.map((item) => item.id);
  const [order, setOrder] = useState(defaultOrder);
  const [hidden, setHidden] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftOrder, setDraftOrder] = useState(defaultOrder);
  const [draftHidden, setDraftHidden] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  useEffect(() => {
    let active = true;
    void api<{ revision: number; orderedPageIds: string[]; hiddenPageIds: string[] }>(
      "/api/user-preferences/workspace-rail", token,
    ).then((saved) => {
      if (!active) return;
      const known = new Set(defaultOrder);
      setOrder([...saved.orderedPageIds.filter((id) => known.has(id)), ...defaultOrder.filter((id) => !saved.orderedPageIds.includes(id))]);
      setHidden(saved.hiddenPageIds.filter((id) => known.has(id)));
      setRevision(saved.revision);
    }).catch(() => {
      // Keep the default rail available if preferences cannot be fetched.
    });
    return () => { active = false; };
  }, [token]);
  const activePage = (itemPage: string) => {
    if (itemPage === "customers")
      return (
        (page.startsWith("customer") && page !== "customer-create") ||
        page.startsWith("crm")
      );
    if (itemPage === "inventory-stock") return page.startsWith("inventory-");
    if (itemPage === "sales-invoices") return page.startsWith("sales-") && !page.includes("purchase");
    if (itemPage === "sales-purchase-invoices") return page.includes("purchase");
    if (itemPage === "finance-accounts") return page.startsWith("finance-");
    if (itemPage === "manufacturing-orders") return page.startsWith("manufacturing-");
    return page === itemPage;
  };
  const orderedItems = order.map((id) => workbenchRailItems.find((item) => item.id === id)).filter((item): item is typeof workbenchRailItems[number] => Boolean(item));
  const visibleItems = orderedItems.filter((item) => !hidden.includes(item.id));
  const startEditing = () => {
    setDraftOrder(order);
    setDraftHidden(hidden);
    setPreferenceError("");
    setEditing(true);
  };
  const moveDraftItem = (index: number, delta: number) => {
    const destination = index + delta;
    if (destination < 0 || destination >= draftOrder.length) return;
    setDraftOrder((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };
  const savePreferences = async () => {
    setSaving(true);
    setPreferenceError("");
    try {
      const result = await api<{ revision: number }>("/api/user-preferences/workspace-rail", token, {
        method: "PUT",
        body: JSON.stringify({ expectedRevision: revision, orderedPageIds: draftOrder, hiddenPageIds: draftHidden }),
      });
      setOrder(draftOrder);
      setHidden(draftHidden);
      setRevision(result.revision);
      setEditing(false);
    } catch (error) {
      setPreferenceError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <aside className="workspace-rail">
      <nav aria-label={locale === "en" ? "Main navigation" : "Ana menü"}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const label = item.label[locale === "en" ? 1 : 0];
          return (
            <button
              type="button"
              key={item.id}
              className={`workspace-rail-item${activePage(item.page) ? " active" : ""}`}
              aria-current={activePage(item.page) ? "page" : undefined}
              title={item.id === "customer-create" ? (locale === "en" ? "Create customer card" : "Cari Kart Oluştur") : label}
              onClick={() =>
                onNavigate(
                  item.page,
                  item.id === "customers"
                    ? locale === "en"
                      ? "Customer Accounts"
                      : "Cari Hesaplar"
                    : label,
                )
              }
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <button type="button" className="workspace-rail-edit" onClick={startEditing}>
        <Boxes size={15} /><span>{locale === "en" ? "Edit menu" : "Menüyü düzenle"}</span>
      </button>
      {editing && (
        <div className="workspace-rail-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
          <section className="workspace-rail-editor" role="dialog" aria-modal="true" aria-labelledby="workspace-rail-editor-title">
            <header>
              <div><small>{locale === "en" ? "PERSONAL MENU" : "KİŞİSEL MENÜ"}</small><h2 id="workspace-rail-editor-title">{locale === "en" ? "Arrange menu" : "Menüyü düzenle"}</h2></div>
              <button type="button" aria-label={locale === "en" ? "Close" : "Kapat"} onClick={() => setEditing(false)}><X size={18} /></button>
            </header>
            <p>{locale === "en" ? "Choose which shortcuts to show and adjust their order. These settings are saved to your account." : "Görünecek kısayolları seçip sıralarını değiştirin. Tercihleriniz hesabınıza özel kaydedilir."}</p>
            <ol>
              {draftOrder.map((id, index) => {
                const item = workbenchRailItems.find((entry) => entry.id === id)!;
                const label = item.label[locale === "en" ? 1 : 0];
                const isHidden = draftHidden.includes(id);
                return <li key={id} className={isHidden ? "is-hidden" : ""}>
                  <span className="workspace-rail-editor-item"><item.icon size={17} /><b>{label}</b></span>
                  <div className="workspace-rail-editor-actions">
                    <button type="button" aria-label={locale === "en" ? `Move ${label} up` : `${label} öğesini yukarı taşı`} disabled={index === 0} onClick={() => moveDraftItem(index, -1)}><ChevronUp size={16} /></button>
                    <button type="button" aria-label={locale === "en" ? `Move ${label} down` : `${label} öğesini aşağı taşı`} disabled={index === draftOrder.length - 1} onClick={() => moveDraftItem(index, 1)}><ChevronDown size={16} /></button>
                    <button type="button" aria-label={isHidden ? (locale === "en" ? `Show ${label}` : `${label} göster`) : (locale === "en" ? `Hide ${label}` : `${label} gizle`)} aria-pressed={!isHidden} onClick={() => setDraftHidden((current) => isHidden ? current.filter((value) => value !== id) : [...current, id])}>{isHidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </li>;
              })}
            </ol>
            {preferenceError && <div className="workspace-rail-editor-error" role="alert">{preferenceError}</div>}
            <footer><button type="button" className="secondary" disabled={saving} onClick={() => setEditing(false)}>{locale === "en" ? "Cancel" : "Vazgeç"}</button><button type="button" className="primary" disabled={saving || draftHidden.length === draftOrder.length} onClick={() => void savePreferences()}>{saving ? (locale === "en" ? "Saving…" : "Kaydediliyor…") : (locale === "en" ? "Save menu" : "Menüyü kaydet")}</button></footer>
          </section>
        </div>
      )}
    </aside>
  );
}

const DeveloperModePanel = lazy(() =>
  import("./DeveloperModePanel").then((module) => ({
    default: module.DeveloperModePanel,
  })),
);
const TenantModuleNavigation = lazy(() =>
  import("./ModuleMarketplacePage").then((module) => ({
    default: module.TenantModuleNavigation,
  })),
);

type Tab = { id: string; label: string };
type Props = {
  page: string;
  token: string;
  tenant: Tenant;
  tenants: Tenant[];
  locale: Locale;
  theme: Theme;
  standaloneStudio: boolean;
  developerModeOpen: boolean;
  moduleTabs: Tab[];
  dirtyTabs: Set<string>;
  error: string;
  notice: string;
  dashboard: Dashboard | null;
  platformStatus: string;
  selectedModuleMenu: ModuleMenuSelection | null;
  pendingCustomerInvoiceId: string | null;
  pendingPurchaseSupplier: { id: string; name: string } | null;
  initialCustomerSearch: string;
  globalSearchOpen: boolean;
  globalSearchQuery: string;
  globalSearchResults: GlobalSearchResult[];
  globalSearchPages: GlobalSearchResult[];
  globalQuickLinks: GlobalSearchResult[];
  globalSearchActiveIndex: number;
  globalSearchInputRef: RefObject<HTMLInputElement | null>;
  globalQuickMenuEditMode: boolean;
  globalQuickMenuPageIds: string[];
  onOpenSearch: () => void;
  onThemeChange: (theme: Theme) => void;
  onLocaleChange: (locale: Locale) => void;
  onSelectTenant: (tenant: Tenant) => void | Promise<void>;
  onSignOut: () => void;
  onOpenCompanySettings: () => void;
  onOpenDeveloperMode: () => void;
  onCloseDeveloperMode: () => void;
  onOpenLicenseSettings: () => void;
  onOpenStudioSource: () => void;
  onNavigate: (page: string, label?: string) => void;
  onCloseTab: (tabId: string) => void;
  pendingCloseTab: string | null;
  onConfirmCloseTab: () => void;
  onCancelCloseTab: () => void;
  onMoveTab: (draggedId: string, targetId: string) => void;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onMarkDirty: (page: string) => void;
  onSearchItems: (items: GlobalSearchResult[]) => void;
  onSelectModule: (item: ModuleMenuSelection) => void;
  onInitialInvoiceOpened: () => void;
  onInitialSupplierOpened: () => void;
  onOpenSalesInvoice: (id: string) => void;
  onOpenPurchaseInvoices: (supplier: { id: string; name: string }) => void;
  onOpenStudio: () => void;
  onDevelopModuleStarter: (template: {
    code: string;
    moduleCode: string;
    name: string;
  }) => void;
  onQueryChange: (value: string) => void;
  onMoveActiveIndex: (delta: number) => void;
  onOpenSearchResult: (result: GlobalSearchResult) => void;
  onCloseSearch: () => void;
  onToggleEditMode: () => void;
  onToggleQuickLink: (page: string) => void;
  onShowMarketplace: () => void;
  requestApi: ApiRequest;
};

export function WorkspaceShellPage(props: Props) {
  const {
    page,
    token,
    tenant,
    tenants,
    locale,
    theme,
    standaloneStudio,
    developerModeOpen,
    moduleTabs,
    dirtyTabs,
    error,
    notice,
    dashboard,
    platformStatus,
    selectedModuleMenu,
    pendingCustomerInvoiceId,
    pendingPurchaseSupplier,
    initialCustomerSearch,
    globalSearchOpen,
    globalSearchQuery,
    globalSearchResults,
    globalSearchPages,
    globalQuickLinks,
    globalSearchActiveIndex,
    globalSearchInputRef,
    globalQuickMenuEditMode,
    globalQuickMenuPageIds,
    onOpenSearch,
    onThemeChange,
    onLocaleChange,
    onSelectTenant,
    onSignOut,
    onOpenCompanySettings,
    onOpenDeveloperMode,
    onCloseDeveloperMode,
    onOpenLicenseSettings,
    onOpenStudioSource,
    onNavigate,
    onCloseTab,
    pendingCloseTab,
    onConfirmCloseTab,
    onCancelCloseTab,
    onMoveTab,
    onDismissError,
    onDismissNotice,
    onMarkDirty,
    onSearchItems,
    onSelectModule,
    onInitialInvoiceOpened,
    onInitialSupplierOpened,
    onOpenSalesInvoice,
    onOpenPurchaseInvoices,
    onOpenStudio,
    onDevelopModuleStarter,
    onQueryChange,
    onMoveActiveIndex,
    onOpenSearchResult,
    onCloseSearch,
    onToggleEditMode,
    onToggleQuickLink,
    onShowMarketplace,
    requestApi,
  } = props;
  const [subrouteTitle, setSubrouteTitle] = useState<{ page: string; title: string } | null>(null);
  useEffect(() => {
    const onSubrouteTitle = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: string; title?: string }>).detail;
      if (!detail?.page) return;
      setSubrouteTitle(detail.title ? { page: detail.page, title: detail.title } : null);
    };
    window.addEventListener("workspace-subroute-title", onSubrouteTitle);
    return () => window.removeEventListener("workspace-subroute-title", onSubrouteTitle);
  }, []);
  const [rightWidgetsOpen, setRightWidgetsOpen] = useState(() => {
    try {
      return window.localStorage.getItem("nexora.workspace-right-widgets") !== "closed";
    } catch {
      return true;
    }
  });
  const showRightWidgets = !standaloneStudio && page !== "dashboard" && rightWidgetsOpen;
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "nexora.workspace-right-widgets",
        rightWidgetsOpen ? "open" : "closed",
      );
    } catch {
      // Keep the control functional when browser storage is unavailable.
    }
  }, [rightWidgetsOpen]);
  useEffect(() => {
    if (!pendingCloseTab) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelCloseTab();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pendingCloseTab, onCancelCloseTab]);
  const activeTabLabel =
    moduleTabs.find((tab) => tab.id === page)?.label ||
    page.replace(/[-_]/g, " ");
  const currentSubrouteTitle = subrouteTitle?.page === page ? subrouteTitle.title : null;

  return (
    <div className={`app-shell${standaloneStudio ? " standalone-studio" : ""}`}>
      <div className="workspace-search-index" aria-hidden="true">
        <Suspense fallback={null}>
          <TenantModuleNavigation
            token={token}
            page={page}
            onSearchItems={onSearchItems}
            onSelect={onSelectModule}
          />
        </Suspense>
      </div>
      {!standaloneStudio && (
        <WorkspaceRail page={page} locale={locale} token={token} onNavigate={onNavigate} />
      )}
      <main className="main-area">
        <WorkspaceTopbar
          locale={locale}
          token={token}
          tenant={tenant}
          tenants={tenants}
          theme={theme}
          standaloneStudio={standaloneStudio}
          rightWidgetsOpen={rightWidgetsOpen}
          onToggleRightWidgets={() => setRightWidgetsOpen((open) => !open)}
          developerModeOpen={developerModeOpen}
          onOpenSearch={onOpenSearch}
          onThemeChange={onThemeChange}
          onLocaleChange={onLocaleChange}
          onOpenDeveloperMode={onOpenDeveloperMode}
          onSelectTenant={onSelectTenant}
          onOpenCompanySettings={onOpenCompanySettings}
          onNavigate={onNavigate}
          onSignOut={onSignOut}
        />
        {developerModeOpen && (
          <Suspense fallback={null}>
            <DeveloperModePanel
              page={page}
              locale={locale}
              token={token}
              onClose={onCloseDeveloperMode}
              onNavigate={onNavigate}
              onLicense={onOpenLicenseSettings}
              onOpenSource={onOpenStudioSource}
            />
          </Suspense>
        )}
        {standaloneStudio && (
          <StandaloneStudioHeader
            tenant={tenant}
            locale={locale}
            onReturn={() => window.location.assign("/")}
            onSignOut={onSignOut}
          />
        )}
        <WorkspaceTabs
          tabs={moduleTabs}
          activeId={page}
          locale={locale}
          dirtyTabs={dirtyTabs}
          onSelect={onNavigate}
          onClose={onCloseTab}
          onMove={onMoveTab}
        />
        <section
          className={`content workspace-content${standardListPages.has(page) ? " standard-list-screen" : ""}${showRightWidgets ? " with-reference-widgets" : ""}${!rightWidgetsOpen ? " widgets-collapsed" : ""}`}
          onChangeCapture={(event) => {
            const target = event.target as HTMLElement;
            if (
              target.closest("form") &&
              !target.closest(
                ".customer-search, .customer-toolbar, .global-search-dialog",
              )
            )
              onMarkDirty(page);
          }}
        >
          <div className="workspace-page-main">
          {!standaloneStudio && (
            <nav
              className="workspace-breadcrumb"
              aria-label={locale === "en" ? "Breadcrumb" : "Sayfa yolu"}
            >
              <button type="button" onClick={() => onNavigate("dashboard")}>
                <Home size={14} aria-hidden="true" />
                <span>{locale === "en" ? "Home" : "Ana Sayfa"}</span>
              </button>
              {page !== "dashboard" && (
                <>
                  <ChevronRight size={13} aria-hidden="true" />
                  {currentSubrouteTitle ? <>
                    <span>{activeTabLabel}</span>
                    <ChevronRight size={13} aria-hidden="true" />
                    <span aria-current="page">{currentSubrouteTitle}</span>
                  </> : <span aria-current="page">{activeTabLabel}</span>}
                </>
              )}
            </nav>
          )}
          {error && (
            <div className="alert inline-alert">
              {error}
              <button onClick={onDismissError}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice">
              {notice}
              <button onClick={onDismissNotice}>
                <X size={15} />
              </button>
            </div>
          )}
          <KeepAliveViews
            activeKey={page}
            openKeys={moduleTabs.map((tab) => tab.id)}
          >
            <Suspense
              fallback={
                <div className="panel page-loading" role="status">
                  Sayfa yükleniyor…
                </div>
              }
            >
              <WorkspacePageRouter
                page={page}
                token={token}
                tenant={tenant}
                locale={locale}
                dashboard={dashboard}
                platformStatus={platformStatus}
                selectedModuleMenu={selectedModuleMenu}
                pendingCustomerInvoiceId={pendingCustomerInvoiceId}
                onInitialInvoiceOpened={onInitialInvoiceOpened}
                pendingPurchaseSupplier={pendingPurchaseSupplier}
                onInitialSupplierOpened={onInitialSupplierOpened}
                initialCustomerSearch={initialCustomerSearch}
                onOpenSalesInvoice={onOpenSalesInvoice}
                onOpenPurchaseInvoices={onOpenPurchaseInvoices}
                onNavigate={onNavigate}
                onLocaleChange={onLocaleChange}
                onThemeChange={onThemeChange}
                requestApi={requestApi}
                onOpenStudio={onOpenStudio}
                onDevelopModuleStarter={onDevelopModuleStarter}
              />
            </Suspense>
          </KeepAliveViews>
          <WorkspaceSearchDialog
            open={globalSearchOpen}
            locale={locale}
            query={globalSearchQuery}
            results={globalSearchResults}
            allItems={globalSearchPages}
            quickLinks={globalQuickLinks}
            activeIndex={globalSearchActiveIndex}
            inputRef={globalSearchInputRef}
            editMode={globalQuickMenuEditMode}
            quickMenuPageIds={globalQuickMenuPageIds}
            onQueryChange={onQueryChange}
            onMoveActiveIndex={onMoveActiveIndex}
            onOpenResult={onOpenSearchResult}
            onClose={onCloseSearch}
            onToggleEditMode={onToggleEditMode}
            onToggleQuickLink={onToggleQuickLink}
            onShowMarketplace={onShowMarketplace}
          />
          {pendingCloseTab && (
            <div
              className="workspace-confirm-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCancelCloseTab();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") onCancelCloseTab();
              }}
            >
              <section
                className="workspace-confirm-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="workspace-close-title"
                aria-describedby="workspace-close-description"
              >
                <span className="workspace-confirm-icon"><AlertTriangle size={21} /></span>
                <div className="workspace-confirm-copy">
                  <h2 id="workspace-close-title">{locale === "en" ? "Close this screen?" : "Bu ekran kapatılsın mı?"}</h2>
                  <p id="workspace-close-description">
                    {locale === "en"
                      ? "There may be unsaved changes in this screen."
                      : "Bu ekranda kaydedilmemiş değişiklikler olabilir."}
                  </p>
                  <small>{moduleTabs.find((tab) => tab.id === pendingCloseTab)?.label}</small>
                </div>
                <div className="workspace-confirm-actions">
                  <button type="button" className="secondary" onClick={onCancelCloseTab}>{locale === "en" ? "Keep editing" : "Düzenlemeye devam et"}</button>
                  <button type="button" className="danger" onClick={onConfirmCloseTab}>{locale === "en" ? "Close screen" : "Ekranı kapat"}</button>
                </div>
              </section>
            </div>
          )}
          </div>
          {showRightWidgets && <CustomerReferenceSidebar token={token} page={page} />}
        </section>
      </main>
    </div>
  );
}
