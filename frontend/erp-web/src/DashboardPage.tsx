import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  ClipboardList,
  ArrowDown,
  ArrowUp,
  GripVertical,
  Factory,
  FileText,
  Package,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import type { ErpDashboardSummary, TrendMonth } from "./dashboard/types";
import DashboardHeader from "./dashboard/components/DashboardHeader";
import DashboardKpiGrid, {
  DashboardMetricCard,
} from "./dashboard/components/DashboardKpiGrid";
import DashboardTrendPanel from "./dashboard/components/DashboardTrendPanel";
import DashboardStockDistribution from "./dashboard/components/DashboardStockDistribution";
import DashboardRecentOrders from "./dashboard/components/DashboardRecentOrders";
import DashboardHighStockTable from "./dashboard/components/DashboardHighStockTable";
import DashboardRightRail from "./dashboard/components/DashboardRightRail";
import { CustomerReferenceSidebar } from "./customers/components/CustomerReferenceSidebar";
import "./dashboard-personalization.css";

const dashboardWidgetCatalog = [
  { id: "salesInvoices", label: "Satış faturaları", description: "Dönem satış faturalarının toplamı" },
  { id: "salesOrders", label: "Açık satış siparişleri", description: "Sevk ve faturalama bekleyen siparişler" },
  { id: "stockValue", label: "Stok değeri", description: "Stok kartı ve depo değer özeti" },
  { id: "purchaseOrders", label: "Açık satın alma", description: "İşlemdeki satın alma siparişleri" },
  { id: "productionOpen", label: "Devam eden üretim", description: "Açık üretim emirleri" },
  { id: "productionPlanned", label: "Planlanan üretim", description: "Üretime alınmayı bekleyen emirler" },
  { id: "productionOverdue", label: "Geciken üretim", description: "Plan tarihi geçmiş açık emirler" },
  { id: "productionCompleted", label: "Tamamlanan üretim", description: "Bu ay tamamlanan üretim emirleri" },
  { id: "salesPurchaseTrend", label: "Satış ve satın alma trendi", description: "Son altı aylık hareket" },
  { id: "stockDistribution", label: "Stok değer dağılımı", description: "Öne çıkan stok kartlarının payı" },
  { id: "recentSalesOrders", label: "Son satış siparişleri", description: "Açık sipariş listesi" },
  { id: "topStockItems", label: "En yüksek stok değerleri", description: "Değeri en yüksek stok kartları" },
  { id: "weather", label: "Hava durumu", description: "Kayıtlı konumun güncel hava bilgisi" },
  { id: "rates", label: "Döviz kurları", description: "USD, EUR ve GBP güncel kurları" },
  { id: "orders", label: "Son hareketler", description: "Açık satış siparişleri" },
  { id: "overdueCustomers", label: "Vadesi geçen cariler", description: "Vadesi geçmiş tahsilatlar" },
  { id: "cashBank", label: "Kasa ve banka", description: "Aktif hesap bakiyeleri" },
] as const;
type DashboardWidgetId = (typeof dashboardWidgetCatalog)[number]["id"];
type DashboardWidgetSize = "small" | "medium" | "large";
const defaultDashboardWidgets = dashboardWidgetCatalog.map((widget) => widget.id);

function dashboardWidgetPreferenceKey() {
  const tenant = localStorage.getItem("aierp.tenant") || "default";
  const token = localStorage.getItem("aierp.accessToken") || localStorage.getItem("aierp.token") || "";
  let user = (localStorage.getItem("aierp.user") || "user").trim().toLocaleLowerCase("tr-TR");
  try {
    const payload = token.split(".")[1];
    if (payload) user = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).sub || user;
  } catch { /* Keep the active account key for older tokens. */ }
  return `nexora.dashboard-layout:${encodeURIComponent(tenant)}:${encodeURIComponent(user)}`;
}

function readDashboardWidgets(): DashboardWidgetId[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(dashboardWidgetPreferenceKey()) || "null");
    if (!Array.isArray(saved)) return defaultDashboardWidgets;
    const valid = saved.filter((id): id is DashboardWidgetId => dashboardWidgetCatalog.some((widget) => widget.id === id));
    const tenant = localStorage.getItem("aierp.tenant") || "default";
    const token = localStorage.getItem("aierp.accessToken") || localStorage.getItem("aierp.token") || "";
    let user = (localStorage.getItem("aierp.user") || "user").trim().toLocaleLowerCase("tr-TR");
    try {
      const payload = token.split(".")[1];
      if (payload) user = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).sub || user;
    } catch { /* Keep the active account key for legacy sidebar preferences. */ }
    const legacyKey = `nexora.workspace-widgets:${encodeURIComponent(tenant)}:${encodeURIComponent(user)}:dashboard`;
    const legacy: unknown = JSON.parse(localStorage.getItem(legacyKey) || "null");
    const referenceDefaults = ["weather", "rates", "orders", "overdueCustomers"] as const;
    const legacyReference = Array.isArray(legacy)
      ? legacy.filter((id): id is DashboardWidgetId => referenceDefaults.includes(id as typeof referenceDefaults[number]) || id === "cashBank")
      : [...referenceDefaults];
    return [...new Set([...valid, ...legacyReference])];
  } catch { return defaultDashboardWidgets; }
}

function readDashboardWidgetSizes(): Partial<Record<DashboardWidgetId, DashboardWidgetSize>> {
  try {
    const key = `${dashboardWidgetPreferenceKey()}:sizes`;
    const value: unknown = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const sizes: Partial<Record<DashboardWidgetId, DashboardWidgetSize>> = {};
    for (const [id, size] of Object.entries(value)) {
      if (dashboardWidgetCatalog.some((widget) => widget.id === id)
        && (size === "small" || size === "medium" || size === "large"))
        sizes[id as DashboardWidgetId] = size;
    }
    return sizes;
  } catch { return {}; }
}

export function DashboardPage({
  tenantName,
  dashboardName,
  platformStatus,
  onNavigate,
  loadSummary,
  token,
}: {
  tenantName: string;
  dashboardName?: string;
  platformStatus: string;
  onNavigate: (page: string) => void;
  loadSummary: () => Promise<ErpDashboardSummary>;
  token: string;
}) {
  const [summary, setSummary] = useState<ErpDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const currentWidgetKey = dashboardWidgetPreferenceKey();
  const [selectedWidgets, setSelectedWidgets] = useState<DashboardWidgetId[]>(readDashboardWidgets);
  const [widgetSizes, setWidgetSizes] = useState<Partial<Record<DashboardWidgetId, DashboardWidgetSize>>>(readDashboardWidgetSizes);
  const [loadedWidgetKey, setLoadedWidgetKey] = useState(currentWidgetKey);
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [draggingWidget, setDraggingWidget] = useState<DashboardWidgetId | null>(null);
  const [dropTargetWidget, setDropTargetWidget] = useState<DashboardWidgetId | null>(null);
  const draggingWidgetRef = useRef<DashboardWidgetId | null>(null);
  useEffect(() => {
    if (loadedWidgetKey === currentWidgetKey) return;
    setSelectedWidgets(readDashboardWidgets());
    setLoadedWidgetKey(currentWidgetKey);
  }, [currentWidgetKey, loadedWidgetKey]);
  useEffect(() => {
    if (loadedWidgetKey !== currentWidgetKey) return;
    try {
      localStorage.setItem(dashboardWidgetPreferenceKey(), JSON.stringify(selectedWidgets));
      const tenant = localStorage.getItem("aierp.tenant") || "default";
      const token = localStorage.getItem("aierp.accessToken") || localStorage.getItem("aierp.token") || "";
      let user = (localStorage.getItem("aierp.user") || "user").trim().toLocaleLowerCase("tr-TR");
      try {
        const payload = token.split(".")[1];
        if (payload) user = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).sub || user;
      } catch { /* Keep the active account key for legacy sidebar preferences. */ }
      localStorage.removeItem(`nexora.workspace-widgets:${encodeURIComponent(tenant)}:${encodeURIComponent(user)}:dashboard`);
    }
    catch { /* Personal dashboard layout is a best-effort browser preference. */ }
  }, [currentWidgetKey, loadedWidgetKey, selectedWidgets]);
  useEffect(() => {
    if (loadedWidgetKey !== currentWidgetKey) return;
    try { localStorage.setItem(`${dashboardWidgetPreferenceKey()}:sizes`, JSON.stringify(widgetSizes)); }
    catch { /* Widget sizing is a best-effort browser preference. */ }
  }, [currentWidgetKey, loadedWidgetKey, widgetSizes]);
  useEffect(() => {
    const syncSharedWidgets = () => {
      const next = readDashboardWidgets();
      setSelectedWidgets((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      setWidgetSizes((current) => {
        const nextSizes = readDashboardWidgetSizes();
        return JSON.stringify(current) === JSON.stringify(nextSizes) ? current : nextSizes;
      });
    };
    window.addEventListener("nexora:shared-dashboard-widgets-changed", syncSharedWidgets);
    return () => window.removeEventListener("nexora:shared-dashboard-widgets-changed", syncSharedWidgets);
  }, []);
  const hasWidget = (id: DashboardWidgetId) => selectedWidgets.includes(id);
  const moveWidget = (id: DashboardWidgetId, offset: -1 | 1) => setSelectedWidgets((current) => {
    const index = current.indexOf(id);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  const dropWidget = (sourceId: DashboardWidgetId | null, targetId: DashboardWidgetId) => {
    if (!sourceId || sourceId === targetId) return;
    setSelectedWidgets((current) => {
      const next = [...current];
      const from = next.indexOf(sourceId);
      if (from < 0) return current;
      next.splice(from, 1);
      const target = next.indexOf(targetId);
      next.splice(target < 0 ? next.length : target, 0, sourceId);
      return next;
    });
    setDraggingWidget(null);
    setDropTargetWidget(null);
    draggingWidgetRef.current = null;
  };
  const widgetLayoutStyle = (id: DashboardWidgetId, columns: 2 | 3 | 4) => {
    const size = widgetSizes[id] ?? "small";
    const span = size === "large" ? columns : size === "medium" ? (columns === 2 ? 2 : Math.ceil(columns / 2)) : 1;
    return { order: Math.max(0, selectedWidgets.indexOf(id)), gridColumn: `span ${span}` };
  };
  const orderedWidgetCatalog = [...dashboardWidgetCatalog].sort((a, b) => {
    const aIndex = selectedWidgets.indexOf(a.id);
    const bIndex = selectedWidgets.indexOf(b.id);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void loadSummary()
      .then((value) => {
        if (active) setSummary(value);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Ana sayfa özeti yüklenemedi.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadSummary, refreshKey]);

  const currency = summary?.baseCurrencyCode || "TRY";
  const money = (value: number, code = currency) =>
    new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  const salesTotals = summary?.salesInvoiceTotals ?? [];
  const baseSales = salesTotals.find((row) => row.currencyCode === currency);
  const foreignSales = salesTotals.filter(
    (row) => row.currencyCode !== currency && row.amount !== 0,
  );
  const monthData = useMemo<TrendMonth[]>(
    () =>
      Array.from({ length: 6 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - (5 - index));
        const sales =
          summary?.monthlySalesInvoices.find(
            (row) =>
              row.year === date.getFullYear() &&
              row.month === date.getMonth() + 1,
          )?.amount ?? 0;
        const purchase =
          summary?.monthlyPurchaseInvoices.find(
            (row) =>
              row.year === date.getFullYear() &&
              row.month === date.getMonth() + 1,
          )?.amount ?? 0;
        return {
          key: `${date.getFullYear()}-${date.getMonth() + 1}`,
          label: new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(
            date,
          ),
          fullLabel: new Intl.DateTimeFormat("tr-TR", {
            month: "long",
            year: "numeric",
          }).format(date),
          sales,
          purchase,
        };
      }),
    [summary],
  );
  const periodLabel = monthData.length
    ? `${monthData[0].label} – ${monthData[monthData.length - 1].label} ${new Date().getFullYear()}`
    : "Son 6 ay";
  const purchaseTotals = summary?.openPurchaseOrderTotals ?? [];
  const purchaseBase = purchaseTotals.find(
    (row) => row.currencyCode === currency,
  );
  const purchaseBreakdown = purchaseTotals
    .filter((row) => row.amount !== 0)
    .slice(0, 2)
    .map(
      (row) =>
        `${row.currencyCode} ${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(row.amount)}`,
    )
    .join(" · ");
  const topStock = summary?.topStockItems ?? [];
  const orderRows = summary?.recentOpenSalesOrders ?? [];
  const today = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  const platformLabel =
    platformStatus === "ready"
      ? "Çalışıyor"
      : platformStatus === "unavailable"
        ? "Erişilemiyor"
        : "Kontrol ediliyor";

  return (
    <div className="erp-home-dashboard dashboard-reference-layout">
      <DashboardHeader
        tenantName={tenantName}
        dashboardName={dashboardName}
        today={today}
        periodLabel={periodLabel}
        onRefresh={() => setRefreshKey((value) => value + 1)}
        onManageWidgets={() => setWidgetPickerOpen(true)}
      />
      {widgetPickerOpen && <div className="dashboard-widget-picker-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setWidgetPickerOpen(false); }}>
        <section className="dashboard-widget-picker" role="dialog" aria-modal="true" aria-labelledby="dashboard-widget-picker-title">
          <header><div><p className="eyebrow">KİŞİSEL ANA SAYFA</p><h2 id="dashboard-widget-picker-title">Genel bakış widget’ları</h2><p>Seçimleriniz bu kullanıcı ve firma için saklanır.</p></div><button type="button" className="secondary" onClick={() => setWidgetPickerOpen(false)} aria-label="Kapat">×</button></header>
          <div className="dashboard-widget-picker-list">{orderedWidgetCatalog.map((widget) => {
            const selectedIndex = selectedWidgets.indexOf(widget.id);
            return <div className={`dashboard-widget-picker-row${draggingWidget === widget.id ? " is-dragging" : ""}${dropTargetWidget === widget.id ? " is-drop-target" : ""}`} key={widget.id}
              onDragEnter={() => { if (draggingWidgetRef.current && draggingWidgetRef.current !== widget.id) setDropTargetWidget(widget.id); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (draggingWidgetRef.current && draggingWidgetRef.current !== widget.id) setDropTargetWidget(widget.id); }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const source = (event.dataTransfer.getData("text/plain") || draggingWidgetRef.current) as DashboardWidgetId | null; dropWidget(source, widget.id); }}>
              <label>
                <input type="checkbox" checked={selectedIndex >= 0} onChange={(event) => setSelectedWidgets((current) => event.target.checked ? [...current, widget.id] : current.filter((id) => id !== widget.id))} />
                <span><b>{widget.label}</b><small>{widget.description}</small></span>
              </label>
              <div className="dashboard-widget-picker-controls">
                <label><span>Boyut</span><select aria-label={`${widget.label} boyutu`} value={widgetSizes[widget.id] ?? "small"} onChange={(event) => setWidgetSizes((current) => ({ ...current, [widget.id]: event.target.value as DashboardWidgetSize }))}>
                  <option value="small">Küçük</option><option value="medium">Orta</option><option value="large">Büyük</option>
                </select></label>
                <div className="widget-order-buttons">
                  <span className="dashboard-widget-drag-hint" draggable={selectedIndex >= 0}
                    onDragStart={(event) => { if (selectedIndex < 0) { event.preventDefault(); return; } draggingWidgetRef.current = widget.id; setDraggingWidget(widget.id); setDropTargetWidget(null); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", widget.id); }}
                    onDragEnd={() => { draggingWidgetRef.current = null; setDraggingWidget(null); setDropTargetWidget(null); }}>
                    <GripVertical size={15} /> Sürükle
                  </span>
                  <button type="button" aria-label={`${widget.label} yukarı taşı`} disabled={selectedIndex <= 0} onClick={() => moveWidget(widget.id, -1)}><ArrowUp size={14} /></button>
                  <button type="button" aria-label={`${widget.label} aşağı taşı`} disabled={selectedIndex < 0 || selectedIndex >= selectedWidgets.length - 1} onClick={() => moveWidget(widget.id, 1)}><ArrowDown size={14} /></button>
                </div>
              </div>
            </div>;
          })}</div>
          <footer><button type="button" className="secondary" onClick={() => { setSelectedWidgets([...defaultDashboardWidgets]); setWidgetSizes({}); }}>Varsayılanı geri yükle</button><button type="button" className="primary" onClick={() => setWidgetPickerOpen(false)}>Tamam</button></footer>
        </section>
      </div>}
      {error && (
        <div className="alert inline-alert" role="alert">
          Ana sayfa özeti yüklenemedi: {error}
        </div>
      )}

      {selectedWidgets.some((id) => ["salesInvoices", "salesOrders", "stockValue", "purchaseOrders", "productionOpen", "productionPlanned", "productionOverdue", "productionCompleted"].includes(id)) && <DashboardKpiGrid>
        {hasWidget("salesInvoices") && <DashboardMetricCard
          icon={<ShoppingCart size={20} />}
          label="Satış faturaları"
          value={
            loading
              ? "…"
              : summary?.canReadSalesInvoices
                ? money(baseSales?.amount ?? 0)
                : "—"
          }
          note={
            loading
              ? "Veriler yükleniyor"
              : summary?.canReadSalesInvoices
                ? `${baseSales?.count ?? 0} ${currency} faturası${foreignSales.length ? ` · ${foreignSales.map((row) => row.currencyCode).join(", ")} diğer dövizler` : ""}`
                : "Görüntüleme yetkisi yok"
          }
          tone="gold"
          style={widgetLayoutStyle("salesInvoices", 4)}
        />}
        {hasWidget("salesOrders") && <DashboardMetricCard
          icon={<FileText size={20} />}
          label="Açık satış siparişi"
          value={
            loading
              ? "…"
              : summary?.canReadSalesOrders
                ? (summary.openSalesOrderCount ?? 0).toLocaleString("tr-TR")
                : "—"
          }
          note={
            loading
              ? "Veriler yükleniyor"
              : summary?.canReadSalesOrders
                ? "Sevk ve faturalama bekliyor"
                : "Görüntüleme yetkisi yok"
          }
          tone="blue"
          style={widgetLayoutStyle("salesOrders", 4)}
        />}
        {hasWidget("stockValue") && <DashboardMetricCard
          icon={<Package size={20} />}
          label={`Stok değeri · ${currency}`}
          value={
            loading
              ? "…"
              : summary?.canReadInventory
                ? money(summary.inventoryValueBase ?? 0)
                : "—"
          }
          note={
            loading
              ? "Veriler yükleniyor"
              : summary?.canReadInventory
                ? `${summary.activeStockItemCount ?? 0} stok kartı · ${summary.activeWarehouseCount ?? 0} ambar`
                : "Görüntüleme yetkisi yok"
          }
          tone="green"
          style={widgetLayoutStyle("stockValue", 4)}
        />}
        {hasWidget("purchaseOrders") && <DashboardMetricCard
          icon={<Wallet size={20} />}
          label="Açık satın alma"
          value={
            loading
              ? "…"
              : summary?.canReadPurchaseOrders
                ? (summary.openPurchaseOrderCount ?? 0).toLocaleString("tr-TR")
                : "—"
          }
          note={
            loading
              ? "Veriler yükleniyor"
              : summary?.canReadPurchaseOrders
                ? purchaseBase
                  ? money(purchaseBase.amount)
                  : purchaseBreakdown || "İşlemde sipariş yok"
                : "Görüntüleme yetkisi yok"
          }
          tone="red"
          style={widgetLayoutStyle("purchaseOrders", 4)}
        />}
        {hasWidget("productionOpen") && <DashboardMetricCard
          icon={<Factory size={20} />}
          label="Devam eden üretim"
          value={
            loading
              ? "…"
              : summary?.canReadManufacturing
                ? (summary.openManufacturingOrderCount ?? 0).toLocaleString(
                    "tr-TR",
                  )
                : "—"
          }
          note={
            loading
              ? "Veriler yükleniyor"
              : summary?.canReadManufacturing
                ? `${summary.plannedManufacturingOrderCount ?? 0} planlandı · ${Math.max(0, (summary.openManufacturingOrderCount ?? 0) - (summary.plannedManufacturingOrderCount ?? 0))} serbest bırakıldı`
                : "Görüntüleme yetkisi yok"
          }
          tone="blue"
          style={widgetLayoutStyle("productionOpen", 4)}
        />}
        {hasWidget("productionPlanned") && <DashboardMetricCard
          icon={<ClipboardList size={20} />}
          label="Planlanan üretim emri"
          value={
            loading
              ? "…"
              : summary?.canReadManufacturing
                ? (summary.plannedManufacturingOrderCount ?? 0).toLocaleString(
                    "tr-TR",
                  )
                : "—"
          }
          note={
            loading
              ? "Veriler yükleniyor"
              : summary?.canReadManufacturing
                ? "Serbest bırakılmayı bekliyor"
                : "Görüntüleme yetkisi yok"
          }
          tone="gold"
          style={widgetLayoutStyle("productionPlanned", 4)}
        />}
        {hasWidget("productionOverdue") && <DashboardMetricCard
          icon={<CircleAlert size={20} />}
          label="Geciken üretim emri"
          value={
            loading
              ? "…"
              : summary?.canReadManufacturing
                ? (summary.overdueManufacturingOrderCount ?? 0).toLocaleString(
                    "tr-TR",
                  )
                : "—"
          }
          note={
            loading
              ? "Veriler yükleniyor"
              : summary?.canReadManufacturing
                ? "Plan tarihi geçmiş açık emirler"
                : "Görüntüleme yetkisi yok"
          }
          tone="red"
          style={widgetLayoutStyle("productionOverdue", 4)}
        />}
        {hasWidget("productionCompleted") && <DashboardMetricCard
          icon={<CircleCheck size={20} />}
          label="Bu ay tamamlanan üretim"
          value={
            loading
              ? "…"
              : summary?.canReadManufacturing
                ? (
                    summary.completedManufacturingOrderCountThisMonth ?? 0
                  ).toLocaleString("tr-TR")
                : "—"
          }
          note={
            loading
              ? "Veriler yükleniyor"
              : summary?.canReadManufacturing
                ? "Tamamlanma tarihine göre"
                : "Görüntüleme yetkisi yok"
          }
          tone="green"
          style={widgetLayoutStyle("productionCompleted", 4)}
        />}
      </DashboardKpiGrid>}

      <CustomerReferenceSidebar token={token} page="dashboard" embedded selectedWidgetIds={selectedWidgets} widgetSizes={widgetSizes} />

      <div className="dashboard-reference-grid dashboard-personal-grid">
        {hasWidget("salesPurchaseTrend") && <DashboardTrendPanel
          months={monthData}
          currency={currency}
          loading={loading}
          canReadSales={Boolean(summary?.canReadSalesInvoices)}
          canReadPurchases={Boolean(summary?.canReadPurchaseInvoices)}
          money={money}
          onNavigate={onNavigate}
          style={widgetLayoutStyle("salesPurchaseTrend", 2)}
        />}
        {hasWidget("stockDistribution") && <DashboardStockDistribution
          items={topStock}
          totalValue={summary?.inventoryValueBase ?? null}
          activeCount={summary?.activeStockItemCount ?? null}
          loading={loading}
          canReadInventory={Boolean(summary?.canReadInventory)}
          money={money}
          onNavigate={onNavigate}
          style={widgetLayoutStyle("stockDistribution", 2)}
        />}
        {hasWidget("recentSalesOrders") && <DashboardRecentOrders
          rows={orderRows}
          loading={loading}
          canReadSalesOrders={Boolean(summary?.canReadSalesOrders)}
          money={money}
          onNavigate={onNavigate}
          style={widgetLayoutStyle("recentSalesOrders", 2)}
        />}
        {hasWidget("topStockItems") && <DashboardHighStockTable
          items={topStock}
          activeCount={summary?.activeStockItemCount ?? null}
          loading={loading}
          canReadInventory={Boolean(summary?.canReadInventory)}
          money={money}
          onNavigate={onNavigate}
          style={widgetLayoutStyle("topStockItems", 2)}
        />}
        <DashboardRightRail
          platformStatus={platformStatus}
          platformLabel={platformLabel}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}
