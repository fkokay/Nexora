import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Clock3,
  Hourglass,
  MapPin,
  PackageX,
  Plus,
  Settings2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { api } from "../../erpApi";
import type { ErpDashboardSummary } from "../../dashboard/types";
import type { FinancialAccount, MaturityReport } from "../../erp-types";
import type { ExchangeRate } from "../../exchange-rates/types";
import {
  getSavedWeatherLocation,
  subscribeToWeatherLocation,
} from "../../weather-location";
import "../../inventory-stock-widgets.css";

type Weather = { temperature: number; code: number; max: number; min: number };
type WidgetId = "weather" | "rates" | "orders" | "overdueCustomers" | "cashBank" | "stockCritical" | "stockouts" | "stockWarehouses" | "stockMovers" | "stockStagnant" | "stockExpiries" | "stockRecent" | "salesInvoices" | "salesOrders" | "stockValue" | "purchaseOrders" | "productionOpen" | "productionPlanned" | "productionOverdue" | "productionCompleted" | "salesPurchaseTrend" | "stockDistribution" | "recentSalesOrders" | "topStockItems";
type OverdueCustomer = { name: string; currencyCode: string; amount: number; count: number; days: number };
type StockWidgetRow = { id: string; code: string; name: string; unitCode: string; quantity: number; reservedQuantity: number; value: number; minimumStock: number; movementQuantity30Days: number; lastMovementAt: string | null; createdAt: string };
type StockWidgetSummary = {
  baseCurrencyCode: string;
  totals: { stockItemCount: number; belowMinimumCount: number; zeroStockCount: number; reservedItemCount: number; stockValueBase: number; noRecentMovementCount: number };
  warehouses: Array<{ id: string; code: string; name: string; stockItemCount: number; quantity: number; stockValueBase: number }>;
  lowStockItems: StockWidgetRow[];
  zeroStockItems: StockWidgetRow[];
  reservedItems: StockWidgetRow[];
  topMovingItems: StockWidgetRow[];
  slowMovingItems: StockWidgetRow[];
  recentlyAddedItems: StockWidgetRow[];
  expiringLots: Array<{ stockItemCode: string; stockItemName: string; warehouseName: string; trackingCode: string; expiryDate: string; quantityOnHand: number; unitCode: string }>;
};

const standardWidgetCatalog: { id: WidgetId; title: string; description: string }[] = [
  { id: "weather", title: "Hava Durumu", description: "Ana sayfada seçilen konumun hava bilgisi" },
  { id: "rates", title: "Döviz Kurları", description: "USD, EUR ve GBP güncel kurları" },
  { id: "orders", title: "Son Hareketler", description: "Açık satış siparişleri" },
  { id: "overdueCustomers", title: "Vadesi Geçen Cariler", description: "Tahsil edilmemiş, vadesi geçmiş satış faturaları" },
  { id: "cashBank", title: "Kasa & Banka", description: "Aktif hesap bakiyeleri" },
];
const stockWidgetCatalog: { id: WidgetId; title: string; description: string }[] = [
  { id: "stockCritical", title: "Kritik stoklar", description: "Minimum seviyenin altındaki stok kartları" },
  { id: "stockouts", title: "Stoksuz ve rezerve", description: "Stoksuz kartlar ve açık rezervler" },
  { id: "stockWarehouses", title: "Depo dağılımı", description: "Depo bazında stok değeri ve dolu kartlar" },
  { id: "stockMovers", title: "En çok hareket görenler", description: "Son 30 gündeki stok hareketleri" },
  { id: "stockStagnant", title: "Hareketsiz stoklar", description: "90 gündür hareket görmeyen stoklar" },
  { id: "stockExpiries", title: "Yaklaşan SKT’ler", description: "30 gün içinde son kullanma tarihi dolacak lotlar" },
  { id: "stockRecent", title: "Yeni stok kartları", description: "Son eklenen stok kartları" },
];
const defaultWidgets: WidgetId[] = ["weather", "rates", "orders", "overdueCustomers"];
const defaultStockWidgets: WidgetId[] = ["stockCritical", "stockouts", "stockWarehouses", "stockMovers", "stockStagnant", "stockExpiries", "stockRecent"];
const sharedDashboardWidgetIds: WidgetId[] = ["salesInvoices", "salesOrders", "stockValue", "purchaseOrders", "productionOpen", "productionPlanned", "productionOverdue", "productionCompleted", "salesPurchaseTrend", "stockDistribution", "recentSalesOrders", "topStockItems"];
function widgetOwnerKey() {
  const tenant = localStorage.getItem("aierp.tenant") || "default";
  const token = localStorage.getItem("aierp.accessToken") || localStorage.getItem("aierp.token") || "";
  let user = localStorage.getItem("aierp.user") || "user";
  try {
    const payload = token.split(".")[1];
    if (payload) user = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).sub || user;
  } catch { /* Fall back to the active account name for older tokens. */ }
  return { tenant: encodeURIComponent(tenant), user: encodeURIComponent(user) };
}

function widgetStorageKey(page: string) {
  const { tenant, user } = widgetOwnerKey();
  return page === "inventory-stock"
    ? `nexora.workspace-widgets:${tenant}:${user}:inventory-stock`
    : `nexora.dashboard-layout:${tenant}:${user}`;
}

function readWidgets(key: string, page: string): WidgetId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "null");
    if (!Array.isArray(value)) {
      if (page === "inventory-stock") return defaultStockWidgets;
      const { tenant, user } = widgetOwnerKey();
      const legacyKey = `nexora.workspace-widgets:${tenant}:${user}:${page}`;
      const legacy: unknown = JSON.parse(localStorage.getItem(legacyKey) || "null");
      const migrated = Array.isArray(legacy) ? legacy.filter((id): id is WidgetId => standardWidgetCatalog.some((item) => item.id === id)) : [];
      return [...new Set([...sharedDashboardWidgetIds, ...defaultWidgets, ...migrated])];
    }
    if (page !== "inventory-stock") {
      const validSharedIds = new Set<string>([...sharedDashboardWidgetIds, ...standardWidgetCatalog.map((item) => item.id)]);
      return [...new Set(value.filter((id): id is WidgetId => typeof id === "string" && validSharedIds.has(id)))];
    }
    const pageCatalog = page === "inventory-stock" ? stockWidgetCatalog : standardWidgetCatalog;
    const valid = value.filter((id): id is WidgetId => pageCatalog.some((item) => item.id === id));
    if (page === "inventory-stock" && value.length > 0 && valid.length === 0) return defaultStockWidgets;
    return [...new Set(valid)];
  } catch { return page === "inventory-stock" ? defaultStockWidgets : defaultWidgets; }
}

function weatherLabel(code: number) {
  if (code === 0) return "Açık";
  if (code <= 2) return "Parçalı bulutlu";
  if (code === 3) return "Kapalı";
  if ([45, 48].includes(code)) return "Sisli";
  if (code >= 51 && code <= 67) return "Yağışlı";
  if (code >= 71 && code <= 86) return "Karlı";
  if (code >= 95) return "Gök gürültülü";
  return "Güncel hava";
}

function money(amount: number, currencyCode: string) {
  try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${new Intl.NumberFormat("tr-TR").format(amount)} ${currencyCode}`; }
}

function stockQuantity(amount: number, unitCode: string) {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(amount)} ${unitCode}`;
}

function focusStockWidgetFilter(detail: { query?: string; belowMinimumOnly?: boolean }) {
  window.dispatchEvent(new CustomEvent("inventory-stock-widget-filter", { detail }));
}

export function CustomerReferenceSidebar({ token, page, embedded = false, selectedWidgetIds, widgetSizes }: { token: string; page: string; embedded?: boolean; selectedWidgetIds?: string[]; widgetSizes?: Record<string, "small" | "medium" | "large"> }) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherLocation, setWeatherLocation] = useState(getSavedWeatherLocation);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [orders, setOrders] = useState<ErpDashboardSummary["recentOpenSalesOrders"]>([]);
  const [maturity, setMaturity] = useState<MaturityReport | null>(null);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [stockSummary, setStockSummary] = useState<StockWidgetSummary | null>(null);
  const [stockWidgetsLoading, setStockWidgetsLoading] = useState(false);
  const preferenceKey = widgetStorageKey(page);
  const [widgets, setWidgets] = useState<WidgetId[]>(() => readWidgets(preferenceKey, page));
  const [loadedPreferenceKey, setLoadedPreferenceKey] = useState(preferenceKey);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (loadedPreferenceKey === preferenceKey) return;
    setWidgets(readWidgets(preferenceKey, page));
    setLoadedPreferenceKey(preferenceKey);
  }, [loadedPreferenceKey, preferenceKey]);

  useEffect(
    () => subscribeToWeatherLocation(setWeatherLocation),
    [],
  );

  useEffect(() => {
    if (selectedWidgetIds) return;
    if (loadedPreferenceKey !== preferenceKey) return;
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(widgets));
      if (page !== "inventory-stock") window.dispatchEvent(new Event("nexora:shared-dashboard-widgets-changed"));
    } catch { /* optional preference */ }
  }, [loadedPreferenceKey, page, preferenceKey, selectedWidgetIds, widgets]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({
      latitude: String(weatherLocation.latitude),
      longitude: String(weatherLocation.longitude),
      current: "temperature_2m,weather_code",
      daily: "temperature_2m_max,temperature_2m_min",
      timezone: weatherLocation.timezone || "auto",
      forecast_days: "1",
    });
    setWeather(null);
    void fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        const temperature = data.current?.temperature_2m;
        const code = data.current?.weather_code;
        const max = data.daily?.temperature_2m_max?.[0];
        const min = data.daily?.temperature_2m_min?.[0];
        if (active && [temperature, code, max, min].every((value) => typeof value === "number")) setWeather({ temperature, code, max, min });
      }).catch(() => { if (!controller.signal.aborted) setWeather(null); });
    void Promise.all([
      api<ExchangeRate[]>("/api/finance/exchange-rates", token).catch(() => []),
      api<ErpDashboardSummary>("/api/dashboard/erp-summary", token).catch(() => null),
      api<MaturityReport>("/api/finance/maturities", token).catch(() => null),
      api<FinancialAccount[]>("/api/finance/accounts", token).catch(() => []),
    ]).then(([rateRows, summary, maturityReport, accountRows]) => {
      if (!active) return;
      setRates(rateRows);
      setOrders(summary?.recentOpenSalesOrders ?? []);
      setMaturity(maturityReport);
      setAccounts(accountRows.filter((account) => account.isActive));
    });
    return () => { active = false; controller.abort(); };
  }, [token, weatherLocation]);

  useEffect(() => {
    if (page !== "inventory-stock") return;
    let active = true;
    setStockWidgetsLoading(true);
    void api<StockWidgetSummary>("/api/inventory-stock-widgets/summary", token).catch(() => null).then((summary) => {
      if (!active) return;
      setStockSummary(summary);
    }).finally(() => { if (active) setStockWidgetsLoading(false); });
    return () => { active = false; };
  }, [page, token]);

  const latestRate = (code: string) => rates
    .filter((rate) => rate.currencyCode === code)
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate) || b.revision - a.revision)[0];
  const overdueCustomers = useMemo(() => {
    const grouped = new Map<string, OverdueCustomer>();
    for (const invoice of maturity?.items ?? []) {
      if (invoice.direction !== "Receivable" || invoice.daysOverdue <= 0 || invoice.outstandingAmount <= 0) continue;
      const key = `${invoice.counterpartyName}\u0000${invoice.currencyCode}`;
      const current = grouped.get(key) ?? { name: invoice.counterpartyName, currencyCode: invoice.currencyCode, amount: 0, count: 0, days: 0 };
      current.amount += invoice.outstandingAmount;
      current.count += 1;
      current.days = Math.max(current.days, invoice.daysOverdue);
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => b.days - a.days || b.amount - a.amount).slice(0, 4);
  }, [maturity]);
  const availableWidgetCatalog = page === "inventory-stock" ? stockWidgetCatalog : standardWidgetCatalog;
  const visibleWidgets = selectedWidgetIds ?? widgets;
  const visibleCatalogIds = new Set(availableWidgetCatalog.map((item) => item.id));
  const displayedWidgets = visibleWidgets.filter((id): id is WidgetId => visibleCatalogIds.has(id as WidgetId));
  const stockSummaryUnavailable = !stockWidgetsLoading && !stockSummary;

  const addWidget = (id: WidgetId) => {
    setWidgets((current) => current.includes(id) ? current : [...current, id]);
  };
  const removeWidget = (id: WidgetId) => setWidgets((current) => current.filter((item) => item !== id));
  const moveWidget = (id: WidgetId, offset: -1 | 1) => setWidgets((current) => {
    const index = current.indexOf(id);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case "weather": return <section className="customer-aside-panel customer-weather-panel" key={id}>
        <header><span><CloudSun size={19} /> Hava Durumu</span><MapPin size={16} /></header>
        <p>{weatherLocation.name}</p>
        <div className="customer-weather-reading"><CloudSun size={35} /><strong>{weather ? `${Math.round(weather.temperature)}°` : "—°"}</strong><span>{weather ? weatherLabel(weather.code) : "Hava verisi alınamadı"}<small>{weather ? `↑ ${Math.round(weather.max)}° · ↓ ${Math.round(weather.min)}°` : "Güncel veri bekleniyor"}</small></span></div>
      </section>;
      case "rates": return <section className="customer-aside-panel" key={id}>
        <header><span><ArrowLeftRight size={18} /> Döviz Kurları</span><small>Güncel kayıt</small></header>
        {(["USD", "EUR", "GBP"] as const).map((code) => {
          const rate = latestRate(code);
          return <div className="customer-rate-row" key={code}><span>{code === "USD" ? "🇺🇸" : code === "EUR" ? "🇪🇺" : "🇬🇧"}</span><b>{code} / TRY</b><strong>{rate ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4 }).format(rate.rate) : "—"}</strong></div>;
        })}
      </section>;
      case "orders": return <section className="customer-aside-panel customer-aside-orders" key={id}>
        <header><span><Clock3 size={18} /> Son Hareketler</span><small>Açık siparişler</small></header>
        {orders.length ? orders.slice(0, 4).map((order) => <div className="customer-order-row" key={order.id}><b>{order.code}</b><span>{order.customerName}</span><strong>{money(order.grandTotal, order.currencyCode)}</strong></div>) : <p className="customer-aside-empty">Gösterilecek açık satış siparişi yok.</p>}
      </section>;
      case "overdueCustomers": return <section className="customer-aside-panel customer-overdue-panel" key={id}>
        <header><span><AlertTriangle size={18} /> Vadesi Geçen Cariler</span><small>{overdueCustomers.length ? `${overdueCustomers.length} cari` : "Alacaklar"}</small></header>
        {overdueCustomers.length ? overdueCustomers.map((customer) => <div className="customer-overdue-row" key={`${customer.name}-${customer.currencyCode}`}><span><b>{customer.name}</b><small>{customer.count} açık fatura · en uzun {customer.days} gün</small></span><strong>{money(customer.amount, customer.currencyCode)}</strong></div>) : <p className="customer-aside-empty">Vadesi geçmiş açık cari faturası yok.</p>}
      </section>;
      case "cashBank": return <section className="customer-aside-panel customer-cash-bank-panel" key={id}>
        <header><span><Wallet size={18} /> Kasa &amp; Banka</span><small>{accounts.length} aktif hesap</small></header>
        {accounts.length ? accounts.slice(0, 4).map((account) => <div className="customer-cash-row" key={account.id}><span><b>{account.name}</b><small>{account.type === "Bank" ? "Banka" : "Kasa"} · {account.code}</small></span><strong>{money(account.balance, account.currencyCode)}</strong></div>) : <p className="customer-aside-empty">Gösterilecek aktif kasa veya banka hesabı yok.</p>}
      </section>;
      case "stockCritical": return <section className="customer-aside-panel inventory-widget-panel" key={id}>
        <header><span><AlertTriangle size={18} /> Kritik stoklar</span><small>{stockSummary ? `${stockSummary.totals.belowMinimumCount} kart` : "Stok özeti"}</small></header>
        {stockWidgetsLoading ? <p className="customer-aside-empty">Stok özeti yükleniyor…</p> : stockSummaryUnavailable ? <p className="customer-aside-empty">Stok özeti alınamadı.</p> : <>
          <div className="inventory-widget-stat"><b>{stockSummary!.totals.belowMinimumCount.toLocaleString("tr-TR")}</b><span>minimum seviyenin altında</span></div>
          {stockSummary!.lowStockItems.slice(0, 4).map((item) => <button type="button" className="inventory-widget-row" key={item.id} onClick={() => focusStockWidgetFilter({ query: item.code })}><span><b>{item.code}</b><small>{item.name}</small></span><strong>{stockQuantity(item.quantity, item.unitCode)}</strong></button>)}
          <button type="button" className="inventory-widget-link" onClick={() => focusStockWidgetFilter({ belowMinimumOnly: true })}>Kritik stokları listede göster</button>
        </>}
      </section>;
      case "stockouts": return <section className="customer-aside-panel inventory-widget-panel" key={id}>
        <header><span><PackageX size={18} /> Stoksuz ve rezerve</span><small>Genel durum</small></header>
        {stockWidgetsLoading ? <p className="customer-aside-empty">Stok özeti yükleniyor…</p> : stockSummaryUnavailable ? <p className="customer-aside-empty">Stok özeti alınamadı.</p> : <>
          <div className="inventory-widget-pair"><div><b>{stockSummary!.totals.zeroStockCount.toLocaleString("tr-TR")}</b><small>Stoksuz kart</small></div><div><b>{stockSummary!.totals.reservedItemCount.toLocaleString("tr-TR")}</b><small>Rezerve kart</small></div></div>
          {stockSummary!.reservedItems.slice(0, 3).map((item) => <button type="button" className="inventory-widget-row" key={item.id} onClick={() => focusStockWidgetFilter({ query: item.code })}><span><b>{item.code}</b><small>{item.name}</small></span><strong>{stockQuantity(item.reservedQuantity, item.unitCode)}</strong></button>)}
        </>}
      </section>;
      case "stockWarehouses": return <section className="customer-aside-panel inventory-widget-panel" key={id}>
        <header><span><Boxes size={18} /> Depo dağılımı</span><small>{stockSummary?.baseCurrencyCode || "Stok değeri"}</small></header>
        {stockWidgetsLoading ? <p className="customer-aside-empty">Depo değerleri yükleniyor…</p> : stockSummaryUnavailable ? <p className="customer-aside-empty">Depo özeti alınamadı.</p> : <>
          {stockSummary!.warehouses.slice(0, 5).map((warehouse) => <div className="inventory-widget-warehouse" key={warehouse.id}><div><b>{warehouse.name}</b><strong>{money(warehouse.stockValueBase, stockSummary!.baseCurrencyCode)}</strong></div><small>{warehouse.stockItemCount.toLocaleString("tr-TR")} stok kartı</small><i><span style={{ width: `${Math.max(0, Math.min(100, stockSummary!.totals.stockValueBase > 0 ? warehouse.stockValueBase / stockSummary!.totals.stockValueBase * 100 : 0))}%` }} /></i></div>)}
          <div className="inventory-widget-total"><span>Toplam stok değeri</span><b>{money(stockSummary!.totals.stockValueBase, stockSummary!.baseCurrencyCode)}</b></div>
        </>}
      </section>;
      case "stockMovers": return <section className="customer-aside-panel inventory-widget-panel" key={id}>
        <header><span><TrendingUp size={18} /> En çok hareket görenler</span><small>Son 30 gün</small></header>
        {stockWidgetsLoading ? <p className="customer-aside-empty">Hareketler yükleniyor…</p> : stockSummaryUnavailable ? <p className="customer-aside-empty">Hareket özeti alınamadı.</p> : stockSummary!.topMovingItems.length ? stockSummary!.topMovingItems.map((item) => <button type="button" className="inventory-widget-row" key={item.id} onClick={() => focusStockWidgetFilter({ query: item.code })}><span><b>{item.code}</b><small>{item.name}</small></span><strong>{stockQuantity(item.movementQuantity30Days, item.unitCode)}</strong></button>) : <p className="customer-aside-empty">Son 30 günde stok hareketi yok.</p>}
      </section>;
      case "stockStagnant": return <section className="customer-aside-panel inventory-widget-panel" key={id}>
        <header><span><Hourglass size={18} /> Hareketsiz stoklar</span><small>90 gündür hareket yok</small></header>
        {stockWidgetsLoading ? <p className="customer-aside-empty">Stok özeti yükleniyor…</p> : stockSummaryUnavailable ? <p className="customer-aside-empty">Stok özeti alınamadı.</p> : <>
          <div className="inventory-widget-stat"><b>{stockSummary!.totals.noRecentMovementCount.toLocaleString("tr-TR")}</b><span>elde stoğu olan kart</span></div>
          {stockSummary!.slowMovingItems.slice(0, 4).map((item) => <button type="button" className="inventory-widget-row" key={item.id} onClick={() => focusStockWidgetFilter({ query: item.code })}><span><b>{item.code}</b><small>{item.name}</small></span><strong>{stockQuantity(item.quantity, item.unitCode)}</strong></button>)}
        </>}
      </section>;
      case "stockExpiries": return <section className="customer-aside-panel inventory-widget-panel" key={id}>
        <header><span><Clock3 size={18} /> Yaklaşan SKT’ler</span><small>30 gün</small></header>
        {stockWidgetsLoading ? <p className="customer-aside-empty">SKT bilgileri yükleniyor…</p> : stockSummaryUnavailable ? <p className="customer-aside-empty">SKT bilgileri alınamadı.</p> : stockSummary!.expiringLots.length ? stockSummary!.expiringLots.map((lot) => <button type="button" className="inventory-widget-row" key={`${lot.stockItemCode}-${lot.trackingCode}-${lot.warehouseName}`} onClick={() => focusStockWidgetFilter({ query: lot.stockItemCode })}><span><b>{lot.stockItemCode} · {lot.trackingCode}</b><small>{lot.stockItemName} · {lot.warehouseName}</small></span><strong>{new Date(`${lot.expiryDate}T00:00:00`).toLocaleDateString("tr-TR")}</strong></button>) : <p className="customer-aside-empty">30 gün içinde son kullanma tarihi dolacak lot yok.</p>}
      </section>;
      case "stockRecent": return <section className="customer-aside-panel inventory-widget-panel" key={id}>
        <header><span><Clock3 size={18} /> Yeni stok kartları</span><small>Son eklenenler</small></header>
        {stockWidgetsLoading ? <p className="customer-aside-empty">Stok kartları yükleniyor…</p> : stockSummaryUnavailable ? <p className="customer-aside-empty">Stok kartları alınamadı.</p> : stockSummary!.recentlyAddedItems.length ? stockSummary!.recentlyAddedItems.map((item) => <button type="button" className="inventory-widget-row" key={item.id} onClick={() => focusStockWidgetFilter({ query: item.code })}><span><b>{item.code}</b><small>{item.name}</small></span><strong>{new Date(item.createdAt).toLocaleDateString("tr-TR")}</strong></button>) : <p className="customer-aside-empty">Henüz stok kartı eklenmemiş.</p>}
      </section>;
    }
  };

  if (embedded) return <div className="dashboard-overview-widgets">
    {displayedWidgets.map((id) => {
      const size = widgetSizes?.[id] ?? "small";
      const span = size === "large" ? 3 : size === "medium" ? 2 : 1;
      return <div className="customer-widget-item" key={id} style={{ order: visibleWidgets.indexOf(id), gridColumn: `span ${span}` }}>{renderWidget(id)}</div>;
    })}
  </div>;

  return <aside className="customer-reference-aside">
    <header className="customer-widgets-header">
      <span><Settings2 size={17} /> Widgetler</span>
      <div>
        <button type="button" aria-label="Widget kütüphanesini aç" title="Widget ekle" aria-expanded={libraryOpen} onClick={() => setLibraryOpen((open) => !open)}><Plus size={16} /></button>
        <button type="button" aria-label={editing ? "Düzenlemeyi bitir" : "Widgetleri düzenle"} title={editing ? "Düzenlemeyi bitir" : "Düzenle"} aria-pressed={editing} onClick={() => setEditing((value) => !value)}><Settings2 size={16} /></button>
      </div>
    </header>
    {libraryOpen && <section className="customer-widget-library">
      <header><b>Widget kütüphanesi</b><button type="button" aria-label="Kütüphaneyi kapat" onClick={() => setLibraryOpen(false)}><X size={15} /></button></header>
      {availableWidgetCatalog.map((item) => {
        const added = widgets.includes(item.id);
        return <div className="customer-widget-library-row" key={item.id}><span><b>{item.title}</b><small>{item.description}</small></span><button type="button" disabled={added} onClick={() => addWidget(item.id)}>{added ? "Eklendi" : "Ekle"}</button></div>;
      })}
    </section>}
    {displayedWidgets.map((id, index) => <div className="customer-widget-item" key={id}>
      {renderWidget(id)}
      {editing && <div className="customer-widget-edit-actions">
        <button type="button" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => moveWidget(id, -1)}><ChevronUp size={14} /></button>
        <button type="button" aria-label="Aşağı taşı" disabled={index === widgets.length - 1} onClick={() => moveWidget(id, 1)}><ChevronDown size={14} /></button>
        <button type="button" aria-label="Widgeti kaldır" onClick={() => removeWidget(id)}><X size={14} /></button>
      </div>}
    </div>)}
    {!widgets.length && <p className="customer-widget-empty">Widget kütüphanesinden görünmesini istediğiniz kartları ekleyin.</p>}
  </aside>;
}
