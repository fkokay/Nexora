import ScreenViewEditor from "./built-in-screen-views/components/ScreenViewEditor";
import ScreenViewHistory from "./built-in-screen-views/components/ScreenViewHistory";
import ScreenViewPreview from "./built-in-screen-views/components/ScreenViewPreview";
import { groupLayoutFields } from "./built-in-screen-views/components/preview-samples";
import type {
  Catalog,
  CustomerPageSettings,
  EditorState,
  LayoutField,
  Revision,
  View,
} from "./built-in-screen-views/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "./authApi";
import { Eye, Grid3X3, LayoutTemplate, ListFilter, Save, ShieldCheck, Type, X } from "lucide-react";
import "./built-in-screen-views.css";

async function api<T>(
  token: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(path, token, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      title?: string;
    } | null;
    throw new Error(
      body?.error || body?.title || `İstek başarısız (${response.status}).`,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

const defaultCustomerPageSettings: CustomerPageSettings = {
  title: "Cari Hesaplar",
  description: "Müşteri ve tedarikçi kartlarını firma bazında yönetin.",
  searchLabel: "Cari ara",
  searchPlaceholder: "Cari kodu, unvanı veya vergi no ile ara",
  typeFilterLabel: "Cari türü",
  statusFilterLabel: "Durum",
  applyLabel: "Filtrele",
  showTypeFilter: true,
  showStatusFilter: true,
};

export default function BuiltInScreenViewsPage({
  token,
  role,
  locale = "tr",
  initialScreenKey = "customers",
  showPageSelector = true,
  onBack,
}: {
  token: string;
  role: string;
  locale?: "tr" | "en";
  initialScreenKey?: string;
  showPageSelector?: boolean;
  onBack?: () => void;
}) {
  const en = locale === "en";
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [screenKey, setScreenKey] = useState(initialScreenKey);
  const [state, setState] = useState<EditorState | null>(null);
  const [fields, setFields] = useState<LayoutField[]>([]);
  const [name, setName] = useState("");
  const [history, setHistory] = useState<Revision[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gridDialogOpen, setGridDialogOpen] = useState(false);
  const [pageSettings, setPageSettings] = useState<CustomerPageSettings>(defaultCustomerPageSettings);
  const [selectedPageWidget, setSelectedPageWidget] = useState("title");
  const loadSequence = useRef(0);
  useEffect(() => {
    setScreenKey(initialScreenKey);
    setHistory([]);
  }, [initialScreenKey]);
  const admin = role === "TenantAdmin";
  const selectedCatalog = catalogs.find((catalog) => catalog.key === screenKey);
  const screenLabel =
    en && screenKey === "manufacturing-mrp-lines"
      ? "MRP plan results"
      : en && screenKey === "sales-order-lines"
        ? "Sales order lines"
        : en && screenKey === "sales-invoice-details"
          ? "Sales invoice detail summary"
          : en && screenKey === "customer-sales-invoices"
            ? "Customer sales invoices"
            : en && screenKey === "inventory-trace-balances"
              ? "Lot and serial balances"
              : en && screenKey === "inventory-warehouse-locations"
                ? "Warehouse shelves and bins"
                : en && screenKey === "inventory-warehouse-reconciliation"
                  ? "Location reconciliation"
                  : en && screenKey === "hr-employees"
                    ? "Employees"
                    : en && screenKey === "hr-leave-requests"
                      ? "Leave requests"
                      : en && screenKey === "hr-attendance"
                        ? "Attendance records"
                        : en && screenKey === "hr-workplace-assignments"
                          ? "Workplace assignments"
                          : en && screenKey === "hr-workplace-calendars"
                            ? "Workplace calendars"
                            : en &&
                                screenKey === "hr-employee-calendar-overrides"
                              ? "Employee calendar overrides"
                              : en && screenKey === "customer-details"
                                ? "Customer detail card"
                                : en && screenKey === "customers"
                                  ? "Customer list"
                                  : en &&
                                      screenKey === "inventory-stock-movements"
                                    ? "Stock movement history"
                                    : en && screenKey === "inventory-stock"
                                      ? "Stock cards"
                                      : en && screenKey === "sales-orders"
                                        ? "Sales orders"
                                        : en && screenKey === "sales-quotes"
                                          ? "Sales quotes"
                                          : en &&
                                              screenKey === "sales-promotions"
                                            ? "Campaigns"
                                            : en &&
                                                screenKey ===
                                                  "sales-campaign-performance"
                                              ? "Campaign performance"
                                              : en &&
                                                  screenKey ===
                                                    "sales-deliveries"
                                                ? "Sales deliveries"
                                                : en &&
                                                    screenKey ===
                                                      "sales-invoices"
                                                  ? "Sales invoices"
                                                  : en &&
                                                      screenKey ===
                                                        "purchase-invoices"
                                                    ? "Purchase invoices"
                                                    : en &&
                                                        screenKey ===
                                                          "standalone-invoice-drafts"
                                                      ? "Standalone purchase invoice drafts"
                                                      : en &&
                                                          screenKey ===
                                                            "purchase-orders"
                                                        ? "Purchase orders"
                                                        : en &&
                                                            screenKey ===
                                                              "purchase-receipts"
                                                          ? "Purchase receipts"
                                                          : en &&
                                                              screenKey ===
                                                                "purchase-delivery-notes"
                                                            ? "Supplier delivery notes"
                                                            : en &&
                                                                screenKey ===
                                                                  "purchase-delivery-order-lines"
                                                              ? "Delivery note entry · order lines"
                                                              : en &&
                                                                  screenKey ===
                                                                    "purchase-order-delivery-notes"
                                                                ? "Supplier delivery notes for order"
                                                                : en &&
                                                                    screenKey ===
                                                                      "purchase-delivery-note-lines"
                                                                  ? "Supplier delivery note lines"
                                                                  : en &&
                                                                      screenKey ===
                                                                        "manufacturing-orders"
                                                                    ? "Manufacturing orders"
                                                                    : en &&
                                                                        screenKey ===
                                                                          "fixed-assets"
                                                                      ? "Fixed assets"
                                                                      : en &&
                                                                          screenKey ===
                                                                            "fixed-asset-depreciation"
                                                                        ? "Depreciation schedule"
                                                                        : en &&
                                                                            screenKey ===
                                                                              "fixed-asset-assignments"
                                                                          ? "Custody history"
                                                                          : en &&
                                                                              screenKey ===
                                                                                "crm-opportunities"
                                                                            ? "CRM opportunities"
                                                                            : en &&
                                                                                screenKey ===
                                                                                  "payment-instruments"
                                                                              ? "Payment instruments"
                                                                              : en &&
                                                                                  screenKey ===
                                                                                    "commercial-contracts"
                                                                                ? "Commercial contracts"
                                                                                : en &&
                                                                                    screenKey ===
                                                                                      "operational-project-tasks"
                                                                                  ? "Project tasks"
                                                                                  : en &&
                                                                                      screenKey ===
                                                                                        "operational-project-time-entries"
                                                                                    ? "Project time entries"
                                                                                    : en &&
                                                                                        screenKey ===
                                                                                          "operational-projects"
                                                                                      ? "Projects"
                                                                                      : en &&
                                                                                          screenKey ===
                                                                                            "direct-cash-budgets"
                                                                                        ? "Direct cash budgets"
                                                                                        : en &&
                                                                                            screenKey ===
                                                                                              "finance-budget-scenarios"
                                                                                          ? "Budget plan and actuals"
                                                                                          : en &&
                                                                                              screenKey ===
                                                                                                "finance-credit-schedules"
                                                                                            ? "Credit repayment schedules"
                                                                                            : en &&
                                                                                                screenKey ===
                                                                                                  "finance-credit-movements"
                                                                                              ? "Credit facility movements"
                                                                                              : en &&
                                                                                                  screenKey ===
                                                                                                    "finance-accounts"
                                                                                                ? "Cash and bank accounts"
                                                                                                : en &&
                                                                                                    screenKey ===
                                                                                                      "finance-account-transactions"
                                                                                                  ? "Cash and bank account transactions"
                                                                                                  : en &&
                                                                                                      screenKey ===
                                                                                                        "finance-journals"
                                                                                                    ? "General ledger journal"
                                                                                                    : en &&
                                                                                                        screenKey ===
                                                                                                          "finance-ledger-accounts"
                                                                                                      ? "Chart of accounts"
                                                                                                      : en &&
                                                                                                          screenKey ===
                                                                                                            "finance-ledger-mappings"
                                                                                                        ? "Chart of accounts mappings"
                                                                                                        : en &&
                                                                                                            screenKey ===
                                                                                                              "finance-transfer-sources"
                                                                                                          ? "General ledger transfer sources"
                                                                                                          : en &&
                                                                                                              screenKey ===
                                                                                                                "finance-statement-unmatched-book"
                                                                                                            ? "Unmatched book movements"
                                                                                                            : en &&
                                                                                                                screenKey ===
                                                                                                                  "finance-maturity-aging"
                                                                                                              ? "Maturity aging summary"
                                                                                                              : en &&
                                                                                                                  screenKey ===
                                                                                                                    "finance-fx-exposure"
                                                                                                                ? "FX exposure report"
                                                                                                                : en &&
                                                                                                                    screenKey ===
                                                                                                                      "finance-fx-revaluations"
                                                                                                                  ? "FX revaluation vouchers"
                                                                                                                  : en &&
                                                                                                                      screenKey ===
                                                                                                                        "finance-fx-revaluation-lines"
                                                                                                                    ? "FX revaluation voucher lines"
                                                                                                                    : en &&
                                                                                                                        screenKey ===
                                                                                                                          "finance-cash-flow-report"
                                                                                                                      ? "Cash flow actuals report"
                                                                                                                      : en &&
                                                                                                                          screenKey ===
                                                                                                                            "finance-income-statement"
                                                                                                                        ? "Income statement report"
                                                                                                                        : en &&
                                                                                                                            screenKey ===
                                                                                                                              "finance-balance-sheet"
                                                                                                                          ? "Balance sheet"
                                                                                                                          : en &&
                                                                                                                              screenKey ===
                                                                                                                                "finance-trial-balance"
                                                                                                                            ? "Trial balance"
                                                                                                                            : en &&
                                                                                                                                screenKey ===
                                                                                                                                  "purchase-invoice-receipt-selection"
                                                                                                                              ? "Purchase invoice receipt selection"
                                                                                                                              : en &&
                                                                                                                                  screenKey ===
                                                                                                                                    "finance-statements"
                                                                                                                                ? "Bank statements"
                                                                                                                                : en &&
                                                                                                                                    screenKey ===
                                                                                                                                      "finance-statement-lines"
                                                                                                                                  ? "Bank statement lines"
                                                                                                                                  : en &&
                                                                                                                                      screenKey ===
                                                                                                                                        "finance-maturities"
                                                                                                                                    ? "Invoice maturities"
                                                                                                                                    : en &&
                                                                                                                                        screenKey ===
                                                                                                                                          "finance-cash-flow-forecast"
                                                                                                                                      ? "Cash flow forecast"
                                                                                                                                      : selectedCatalog?.label ||
                                                                                                                                        (en
                                                                                                                                          ? "ERP screen"
                                                                                                                                          : "ERP ekranı");
  const displayScreenLabel = screenKey === "customers" ? pageSettings.title : screenLabel;

  const load = useCallback(
    async (key = screenKey) => {
      const sequence = ++loadSequence.current;
      setBusy(true);
      setError("");
      try {
        const [catalog, editor] = await Promise.all([
          api<Catalog[]>(token, "/api/screen-views/catalog"),
          api<EditorState>(
            token,
            `/api/screen-views/${encodeURIComponent(key)}/draft`,
          ),
        ]);
        if (sequence !== loadSequence.current) return;
        setCatalogs(catalog);
        setState(editor);
        const current = editor.draft || editor.active;
        setPageSettings(current.pageSettings || defaultCustomerPageSettings);
        setFields(
          current.fields.map((field, position) => ({ ...field, position })),
        );
        setName(editor.draft?.name || editor.active.name);
      } catch (e) {
        if (sequence === loadSequence.current) setError((e as Error).message);
      } finally {
        if (sequence === loadSequence.current) setBusy(false);
      }
    },
    [screenKey, token],
  );

  useEffect(() => {
    void load();
    return () => {
      loadSequence.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!admin) return;
    let active = true;
    void api<Revision[]>(
      token,
      `/api/screen-views/${encodeURIComponent(screenKey)}/history`,
    )
      .then((revisions) => {
        if (active) setHistory(revisions);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [admin, screenKey, state?.draft?.revision, state?.active.revision, token]);
  useEffect(() => {
    if (!gridDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setGridDialogOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [gridDialogOpen]);

  const visibleFields = useMemo(
    () =>
      fields
        .filter((field) => field.visible)
        .sort((a, b) => a.position - b.position),
    [fields],
  );
  const previewGroups = useMemo(
    () => groupLayoutFields(visibleFields, en),
    [visibleFields, en],
  );
  function updateField(key: string, update: Partial<LayoutField>) {
    setFields((current) =>
      current.map((field) =>
        field.key === key ? { ...field, ...update } : field,
      ),
    );
  }
  function move(index: number, delta: -1 | 1) {
    const next = [...fields].sort((a, b) => a.position - b.position);
    const target = index + delta;
    if (
      target < 0 ||
      target >= next.length ||
      next[index].fixed ||
      next[target].fixed
    )
      return;
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next.map((field, position) => ({ ...field, position })));
  }
  function reorder(source: string, target: string) {
    const next = [...fields].sort((a, b) => a.position - b.position);
    const from = next.findIndex((field) => field.key === source),
      to = next.findIndex((field) => field.key === target);
    if (from < 0 || to < 0 || next[from].fixed || next[to].fixed) return;
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    setFields(next.map((field, position) => ({ ...field, position })));
  }

  async function createDraft(useStandard = false): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        token,
        `/api/screen-views/${encodeURIComponent(screenKey)}/draft`,
        {
          method: "POST",
          body: JSON.stringify({
            name: state?.active.screenLabel || screenLabel,
            useStandard,
          }),
        },
      );
      await load();
      setNotice(
        en
          ? useStandard ? "A new draft was created from the built-in standard layout. Review and publish it to apply." : "Draft created from the published layout."
          : useStandard ? "Yerleşik standart düzenden yeni bir taslak oluşturuldu. Uygulamak için gözden geçirip yayımlayın." : "Yayımlanan düzenden taslak oluşturuldu.",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function restoreStandardDraft() {
    if (!state) return;
    if (!state.draft) {
      await createDraft(true);
      return;
    }
    if (!window.confirm("Mevcut taslak standart alan ve sayfa ayarlarıyla değiştirilsin mi? Bu işlem yayımlanan sayfayı değiştirmez.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const standardFields = state.catalog.fields.map((field, position) => ({
        ...field,
        visible: field.defaultVisible,
        position,
      }));
      await api<View>(token, `/api/screen-views/${state.draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          expectedRevision: state.draft.revision,
          name: state.catalog.label,
          fields: standardFields,
          ...(screenKey === "customers" ? { pageSettings: defaultCustomerPageSettings } : {}),
        }),
      });
      await load();
      setNotice("Standart düzen taslağa yüklendi. ERP’de etkinleştirmek için yayımlayın.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    if (!state?.draft?.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<View>(
        token,
        `/api/screen-views/${state.draft.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            expectedRevision: state.draft.revision,
            name,
            fields: [...fields].sort((a, b) => a.position - b.position),
            ...(screenKey === "customers" ? { pageSettings } : {}),
          }),
        },
      );
      await load();
      setPageSettings(saved.pageSettings || pageSettings);
      setNotice(`${en ? "Draft saved" : "Taslak kaydedildi"} · v${saved.revision}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publishDraft() {
    if (!state?.draft?.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<View>(token, `/api/screen-views/${state.draft.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: state.draft.revision }),
      });
      await load();
      setNotice(
        en
          ? "Layout published to this company."
          : "Düzen bu firma için yayımlandı.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restoreDraft(revision: Revision) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        token,
        `/api/screen-views/${encodeURIComponent(screenKey)}/draft-from-revision/${revision.id}`,
        { method: "POST" },
      );
      await load();
      setNotice(
        en
          ? "A new draft was created from history. Review and publish it."
          : "Geçmiş sürümden yeni taslak oluşturuldu. İnceleyip yayımlayın.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="screen-view-page">
      <header className="screen-view-hero screen-page-header">
        <span className="screen-view-hero-icon">
          <LayoutTemplate size={22} />
        </span>
        <div>
          <p className="eyebrow">
            {en
              ? "DEVELOPMENT STUDIO · SCREEN LAYOUTS"
              : "GELİŞTİRME STUDIO · EKRAN DÜZENLERİ"}
          </p>
          <h1>{en ? "Screen layouts" : "Ekran düzenleri"}</h1>
          <p>
            {en
              ? "Change the visible columns and their order on existing ERP screens. This does not create a filtered list or report."
              : "Mevcut ERP ekranlarında görünen sütunları, sıralarını ve destekleniyorsa genişliklerini düzenleyin. Filtreli liste veya rapor oluşturmaz."}
          </p>
        </div>
        <span className="screen-view-scope">
          <ShieldCheck size={15} />
          {en ? "Company scoped" : "Firma kapsamlı"}
        </span>
      </header>
      {error && (
        <div className="alert inline-alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="notice">
          {notice}
          <button type="button" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <div className="screen-view-toolbar">
        {showPageSelector ? (
        <label>
          {en ? "Page" : "Sayfa"}
          <select
            value={screenKey}
            disabled={busy}
            onChange={(event) => {
              setScreenKey(event.target.value);
              setHistory([]);
            }}
          >
            {(catalogs.length
              ? catalogs
              : [
                  {
                    key: "customers",
                    label: en ? "Customer list" : "Cari listesi",
                    fields: [],
                  },
                ]
            ).map((catalog) => (
              <option key={catalog.key} value={catalog.key}>
                {en && catalog.key === "manufacturing-mrp-lines"
                  ? "MRP plan results"
                  : en && catalog.key === "customer-sales-invoices"
                    ? "Customer sales invoices"
                    : en && catalog.key === "hr-employees"
                      ? "Employees"
                      : en && catalog.key === "hr-leave-requests"
                        ? "Leave requests"
                        : en && catalog.key === "hr-attendance"
                          ? "Attendance records"
                          : en && catalog.key === "hr-workplace-assignments"
                            ? "Workplace assignments"
                            : en && catalog.key === "hr-workplace-calendars"
                              ? "Workplace calendars"
                              : en &&
                                  catalog.key ===
                                    "hr-employee-calendar-overrides"
                                ? "Employee calendar overrides"
                                : en && catalog.key === "audit-events"
                                  ? "Audit log"
                                  : en && catalog.key === "customers"
                                    ? "Customer list"
                                    : en &&
                                        catalog.key ===
                                          "inventory-stock-movements"
                                      ? "Stock movement history"
                                      : en && catalog.key === "inventory-stock"
                                        ? "Stock cards"
                                        : en &&
                                            catalog.key ===
                                              "inventory-warehouse-locations"
                                          ? "Warehouse shelves and bins"
                                          : en &&
                                              catalog.key ===
                                                "inventory-warehouse-reconciliation"
                                            ? "Location reconciliation"
                                            : en &&
                                                catalog.key === "sales-orders"
                                              ? "Sales orders"
                                              : en &&
                                                  catalog.key === "sales-quotes"
                                                ? "Sales quotes"
                                                : en &&
                                                    catalog.key ===
                                                      "sales-promotions"
                                                  ? "Campaigns"
                                                  : en &&
                                                      catalog.key ===
                                                        "sales-campaign-performance"
                                                    ? "Campaign performance"
                                                    : en &&
                                                        catalog.key ===
                                                          "sales-deliveries"
                                                      ? "Sales deliveries"
                                                      : en &&
                                                          catalog.key ===
                                                            "sales-invoices"
                                                        ? "Sales invoices"
                                                        : en &&
                                                            catalog.key ===
                                                              "purchase-invoices"
                                                          ? "Purchase invoices"
                                                          : en &&
                                                              catalog.key ===
                                                                "standalone-invoice-drafts"
                                                            ? "Standalone purchase invoice drafts"
                                                            : en &&
                                                                catalog.key ===
                                                                  "purchase-orders"
                                                              ? "Purchase orders"
                                                              : en &&
                                                                  catalog.key ===
                                                                    "purchase-receipts"
                                                                ? "Purchase receipts"
                                                                : en &&
                                                                    catalog.key ===
                                                                      "purchase-delivery-notes"
                                                                  ? "Supplier delivery notes"
                                                                  : en &&
                                                                      catalog.key ===
                                                                        "purchase-delivery-order-lines"
                                                                    ? "Delivery note entry · order lines"
                                                                    : en &&
                                                                        catalog.key ===
                                                                          "purchase-order-delivery-notes"
                                                                      ? "Supplier delivery notes for order"
                                                                      : en &&
                                                                          catalog.key ===
                                                                            "purchase-delivery-note-lines"
                                                                        ? "Supplier delivery note lines"
                                                                        : en &&
                                                                            catalog.key ===
                                                                              "manufacturing-orders"
                                                                          ? "Manufacturing orders"
                                                                          : en &&
                                                                              catalog.key ===
                                                                                "fixed-assets"
                                                                            ? "Fixed assets"
                                                                            : en &&
                                                                                catalog.key ===
                                                                                  "fixed-asset-depreciation"
                                                                              ? "Depreciation schedule"
                                                                              : en &&
                                                                                  catalog.key ===
                                                                                    "fixed-asset-assignments"
                                                                                ? "Custody history"
                                                                                : en &&
                                                                                    catalog.key ===
                                                                                      "crm-opportunities"
                                                                                  ? "CRM opportunities"
                                                                                  : en &&
                                                                                      catalog.key ===
                                                                                        "payment-instruments"
                                                                                    ? "Payment instruments"
                                                                                    : en &&
                                                                                        catalog.key ===
                                                                                          "commercial-contracts"
                                                                                      ? "Commercial contracts"
                                                                                      : en &&
                                                                                          catalog.key ===
                                                                                            "operational-project-tasks"
                                                                                        ? "Project tasks"
                                                                                        : en &&
                                                                                            catalog.key ===
                                                                                              "operational-project-time-entries"
                                                                                          ? "Project time entries"
                                                                                          : en &&
                                                                                              catalog.key ===
                                                                                                "operational-projects"
                                                                                            ? "Projects"
                                                                                            : en &&
                                                                                                catalog.key ===
                                                                                                  "direct-cash-budgets"
                                                                                              ? "Direct cash budgets"
                                                                                              : en &&
                                                                                                  catalog.key ===
                                                                                                    "finance-accounts"
                                                                                                ? "Cash and bank accounts"
                                                                                                : en &&
                                                                                                    catalog.key ===
                                                                                                      "finance-account-transactions"
                                                                                                  ? "Cash and bank account transactions"
                                                                                                  : en &&
                                                                                                      catalog.key ===
                                                                                                        "finance-journals"
                                                                                                    ? "General ledger journal"
                                                                                                    : en &&
                                                                                                        catalog.key ===
                                                                                                          "finance-ledger-accounts"
                                                                                                      ? "Chart of accounts"
                                                                                                      : en &&
                                                                                                          catalog.key ===
                                                                                                            "finance-ledger-mappings"
                                                                                                        ? "Chart of accounts mappings"
                                                                                                        : en &&
                                                                                                            catalog.key ===
                                                                                                              "finance-credit-schedules"
                                                                                                          ? "Credit repayment schedules"
                                                                                                          : en &&
                                                                                                              catalog.key ===
                                                                                                                "finance-credit-movements"
                                                                                                            ? "Credit facility movements"
                                                                                                            : en &&
                                                                                                                catalog.key ===
                                                                                                                  "finance-transfer-sources"
                                                                                                              ? "General ledger transfer sources"
                                                                                                              : en &&
                                                                                                                  catalog.key ===
                                                                                                                    "finance-statement-unmatched-book"
                                                                                                                ? "Unmatched book movements"
                                                                                                                : en &&
                                                                                                                    catalog.key ===
                                                                                                                      "finance-maturity-aging"
                                                                                                                  ? "Maturity aging summary"
                                                                                                                  : en &&
                                                                                                                      catalog.key ===
                                                                                                                        "finance-fx-exposure"
                                                                                                                    ? "FX exposure report"
                                                                                                                    : en &&
                                                                                                                        catalog.key ===
                                                                                                                          "finance-cash-flow-report"
                                                                                                                      ? "Cash flow actuals report"
                                                                                                                      : en &&
                                                                                                                          catalog.key ===
                                                                                                                            "finance-income-statement"
                                                                                                                        ? "Income statement report"
                                                                                                                        : en &&
                                                                                                                            catalog.key ===
                                                                                                                              "finance-fx-revaluations"
                                                                                                                          ? "FX revaluation vouchers"
                                                                                                                          : en &&
                                                                                                                              catalog.key ===
                                                                                                                                "finance-fx-revaluation-lines"
                                                                                                                            ? "FX revaluation voucher lines"
                                                                                                                            : en &&
                                                                                                                                catalog.key ===
                                                                                                                                  "finance-balance-sheet"
                                                                                                                              ? "Balance sheet"
                                                                                                                              : en &&
                                                                                                                                  catalog.key ===
                                                                                                                                    "finance-trial-balance"
                                                                                                                                ? "Trial balance"
                                                                                                                                : en &&
                                                                                                                                    catalog.key ===
                                                                                                                                      "purchase-invoice-receipt-selection"
                                                                                                                                  ? "Purchase invoice receipt selection"
                                                                                                                                  : en &&
                                                                                                                                      catalog.key ===
                                                                                                                                        "finance-statements"
                                                                                                                                    ? "Bank statements"
                                                                                                                                    : en &&
                                                                                                                                        catalog.key ===
                                                                                                                                          "finance-statement-lines"
                                                                                                                                      ? "Bank statement lines"
                                                                                                                                      : en &&
                                                                                                                                          catalog.key ===
                                                                                                                                            "finance-maturities"
                                                                                                                                        ? "Invoice maturities"
                                                                                                                                        : en &&
                                                                                                                                            catalog.key ===
                                                                                                                                              "finance-cash-flow-forecast"
                                                                                                                                          ? "Cash flow forecast"
                                                                                                                                          : catalog.label}
              </option>
            ))}
          </select>
        </label>
        ) : (
          <div className="screen-view-current-page">
            {onBack && <button type="button" onClick={onBack}><LayoutTemplate size={14} /> Sayfa listesi</button>}
            <strong>{screenLabel}</strong>
          </div>
        )}
        <div className="screen-view-version">
          <span className={state?.active.isPublished ? "published" : "default"}>
            <i />
            {state?.active.isPublished
              ? en
                ? "Published"
                : "Yayımlanmış"
              : en
                ? "Default layout"
                : "Varsayılan düzen"}
          </span>
          {state?.active.isPublished && <small>v{state.active.revision}</small>}
        </div>
        <button type="button" className="secondary small-button" disabled={busy || !state} onClick={() => void restoreStandardDraft()}>{en ? "Return to standard" : "Standarta dön"}</button>
        {screenKey !== "customers" && <button
          type="button"
          className="primary screen-view-grid-open"
          disabled={busy}
          onClick={async () => {
            if (!state?.draft && !(await createDraft())) return;
            setGridDialogOpen(true);
          }}
        >
          <Grid3X3 size={15} />{en ? "Adjust grid" : "Grid ayarla"}
        </button>}
        <button
          className="secondary small-button"
          disabled={busy}
          onClick={() => void load()}
        >
          {en ? "Refresh" : "Yenile"}
        </button>
      </div>
      {screenKey === "customers" && (
        <div className="screen-view-page-builder">
          <aside className="screen-view-widget-palette" aria-label="Sayfa widget’ları">
            <div className="screen-view-widget-palette-heading"><span>WIDGETLER</span><h2>Sayfa bileşenleri</h2><p>Düzenlemek için bir widget seçin.</p></div>
            {[
              { id: "title", label: "Sayfa başlığı", detail: "Başlık ve açıklama", icon: Type },
              { id: "filters", label: "Filtreleme", detail: "Arama ve filtre alanları", icon: ListFilter },
              { id: "grid", label: "Grid", detail: `${visibleFields.length} görünür sütun`, icon: Grid3X3 },
            ].map((widget) => {
              const Icon = widget.icon;
              return <button key={widget.id} type="button" className={selectedPageWidget === widget.id ? "active" : ""} onClick={() => { setSelectedPageWidget(widget.id); document.getElementById(`customer-widget-${widget.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}><span className="screen-view-widget-icon"><Icon size={16}/></span><span><b>{widget.label}</b><small>{widget.detail}</small></span><i>Sayfada</i></button>;
            })}
            <span className={state?.draft ? "screen-view-draft" : "screen-view-readonly"}>{state?.draft ? "Taslak düzenleniyor" : "Düzenlemek için taslak oluşturun"}</span>
          </aside>
          <div className="screen-view-widget-canvas" aria-label="Sayfa widget düzeni">
            <div className="screen-view-widget-canvas-heading"><div><span>CANVAS</span><b>{pageSettings.title}</b></div><button type="button" onClick={() => document.querySelector(".screen-view-live-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}><Eye size={13}/>Önizlemeye git</button></div>
            <section id="customer-widget-title" className={`screen-view-page-widget ${selectedPageWidget === "title" ? "selected" : ""}`} onClick={() => setSelectedPageWidget("title")}>
              <header><span className="screen-view-widget-icon"><Type size={16}/></span><div><b>Sayfa başlığı widget’ı</b><small>Sayfa adı ve açıklama</small></div><span>BAŞLIK</span></header>
              <div className="screen-view-page-fields title-fields">
                <label>Başlık<input value={pageSettings.title} disabled={!state?.draft || busy} maxLength={120} onChange={(event) => setPageSettings((current) => ({ ...current, title: event.target.value }))} /></label>
                <label>Açıklama<input value={pageSettings.description} disabled={!state?.draft || busy} maxLength={300} onChange={(event) => setPageSettings((current) => ({ ...current, description: event.target.value }))} /></label>
              </div>
            </section>
            <section id="customer-widget-filters" className={`screen-view-page-widget ${selectedPageWidget === "filters" ? "selected" : ""}`} onClick={() => setSelectedPageWidget("filters")}>
              <header><span className="screen-view-widget-icon"><ListFilter size={16}/></span><div><b>Filtreleme widget’ı</b><small>Arama, filtre başlıkları ve görünürlük</small></div><span>FİLTRE</span></header>
              <div className="screen-view-page-fields filter-fields">
                <label>Arama etiketi<input value={pageSettings.searchLabel} disabled={!state?.draft || busy} maxLength={60} onChange={(event) => setPageSettings((current) => ({ ...current, searchLabel: event.target.value }))} /></label>
                <label>Arama ipucu<input value={pageSettings.searchPlaceholder} disabled={!state?.draft || busy} maxLength={120} onChange={(event) => setPageSettings((current) => ({ ...current, searchPlaceholder: event.target.value }))} /></label>
                <label>Tür filtresi etiketi<input value={pageSettings.typeFilterLabel} disabled={!state?.draft || busy} maxLength={60} onChange={(event) => setPageSettings((current) => ({ ...current, typeFilterLabel: event.target.value }))} /></label>
                <label>Durum filtresi etiketi<input value={pageSettings.statusFilterLabel} disabled={!state?.draft || busy} maxLength={60} onChange={(event) => setPageSettings((current) => ({ ...current, statusFilterLabel: event.target.value }))} /></label>
                <label>Filtre düğmesi<input value={pageSettings.applyLabel} disabled={!state?.draft || busy} maxLength={40} onChange={(event) => setPageSettings((current) => ({ ...current, applyLabel: event.target.value }))} /></label>
                <label className="screen-view-setting-toggle"><input type="checkbox" checked={pageSettings.showTypeFilter} disabled={!state?.draft || busy} onChange={(event) => setPageSettings((current) => ({ ...current, showTypeFilter: event.target.checked }))} />Tür filtresini göster</label>
                <label className="screen-view-setting-toggle"><input type="checkbox" checked={pageSettings.showStatusFilter} disabled={!state?.draft || busy} onChange={(event) => setPageSettings((current) => ({ ...current, showStatusFilter: event.target.checked }))} />Durum filtresini göster</label>
              </div>
            </section>
            <section id="customer-widget-grid" className={`screen-view-page-widget screen-view-grid-widget ${selectedPageWidget === "grid" ? "selected" : ""}`} onClick={() => setSelectedPageWidget("grid")}>
              <header><span className="screen-view-widget-icon"><Grid3X3 size={16}/></span><div><b>Grid widget’ı</b><small>Izgara alanları ve sütun düzeni</small></div><span>GRID</span></header>
              <div className="screen-view-grid-widget-body"><div><b>{visibleFields.length} görünür sütun</b><small>Alan seçimi, sıra ve sütun genişliklerini düzenleyin.</small></div><button type="button" className="primary" disabled={busy} onClick={async (event) => { event.stopPropagation(); if (!state?.draft && !(await createDraft())) return; setGridDialogOpen(true); }}><Grid3X3 size={15}/>Grid ayarla</button></div>
            </section>
            <div className="screen-view-widget-save">{state?.draft ? <button type="button" className="secondary" disabled={busy} onClick={() => void saveDraft()}><Save size={14}/>{en ? "Save draft" : "Taslağı kaydet"}</button> : <button type="button" className="primary" disabled={busy} onClick={() => void createDraft()}>{en ? "Create draft" : "Taslak oluştur"}</button>}</div>
          </div>
          {state && <div className="screen-view-live-preview"><ScreenViewPreview en={en} screenKey={screenKey} screenLabel={displayScreenLabel} visibleFields={visibleFields} previewGroups={previewGroups} pageSettings={pageSettings} /></div>}
        </div>
      )}
      {screenKey !== "customers" && state && <ScreenViewPreview en={en} screenKey={screenKey} screenLabel={displayScreenLabel} visibleFields={visibleFields} previewGroups={previewGroups} />}
      {state && gridDialogOpen && (
        <div className="screen-view-grid-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGridDialogOpen(false); }}>
          <section className="screen-view-grid-dialog" role="dialog" aria-modal="true" aria-labelledby="screen-view-grid-dialog-title">
            <header><div><span>GRID TASARIMI</span><h2 id="screen-view-grid-dialog-title">{displayScreenLabel} · Grid ayarla</h2><p>Alanları gösterin, sıralayın ve sütun genişliklerini düzenleyin.</p></div><button type="button" aria-label="Kapat" onClick={() => setGridDialogOpen(false)}><X size={18}/></button></header>
            <div className="screen-view-workspace">
          <ScreenViewEditor
            en={en}
            busy={busy}
            admin={admin}
            state={state}
            fields={fields}
            name={name}
            visibleCount={visibleFields.length}
            screenKey={screenKey}
            onNameChange={setName}
            onCreateDraft={() => void createDraft()}
            onCreateStandardDraft={() => void createDraft(true)}
            onSaveDraft={() => void saveDraft()}
            onPublishDraft={() => void publishDraft()}
            onUpdateField={updateField}
            onMove={move}
            onReorder={reorder}
          />
          <ScreenViewPreview en={en} screenKey={screenKey} screenLabel={displayScreenLabel} visibleFields={visibleFields} previewGroups={previewGroups} />
          {admin && (
            <ScreenViewHistory
              en={en}
              busy={busy}
              state={state}
              history={history}
              onRefresh={() => void load()}
              onRestore={(revision) => void restoreDraft(revision)}
            />
          )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
