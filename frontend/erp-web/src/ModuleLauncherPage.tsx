import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Clock3,
  CloudSun,
  FileText,
  Landmark,
  LocateFixed,
  MapPin,
  Moon,
  Package,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  Users,
  UsersRound,
} from "lucide-react";
import type { GlobalSearchResult, Locale } from "./WorkspaceComponents";
import type { FinancialAccount, Tenant } from "./erp-types";
import type { ErpDashboardSummary } from "./dashboard/types";
import type { ExchangeRate } from "./exchange-rates/types";
import { WorkspaceSearchDialog } from "./WorkspaceSearchDialog";
import { LauncherAssistantWidget } from "./LauncherAssistantWidget";
import { LauncherBackgroundPicker } from "./LauncherBackgroundPicker";
import { launcherBackgroundProps, loadLauncherBackground, saveLauncherBackground, type LauncherBackground } from "./launcher-background";
import {
  getSavedWeatherLocation,
  loadSavedWeatherLocation,
  saveWeatherLocation,
  type WeatherLocation,
} from "./weather-location";

export type ModuleLauncherProps = {
  tenant: Tenant;
  token: string;
  tenants: Tenant[];
  canDefineCompany: boolean;
  actionError: string;
  onSelectTenant: (tenant: Tenant) => void | Promise<void>;
  onDefineCompany: () => void;
  userInitial: string;
  locale: Locale;
  query: string;
  results: GlobalSearchResult[];
  allItems: GlobalSearchResult[];
  quickLinks: GlobalSearchResult[];
  activeIndex: number;
  inputRef: RefObject<HTMLInputElement | null>;
  theme: "light" | "dark";
  onLocaleChange: (locale: Locale) => void;
  onThemeToggle: () => void;
  onQueryChange: (query: string) => void;
  onMoveActiveIndex: (delta: number) => void;
  onOpenResult: (result: GlobalSearchResult) => void;
  onShowModules: () => void;
  editMode: boolean;
  quickMenuPageIds: string[];
  onToggleEditMode: () => void;
  onToggleQuickLink: (page: string) => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
  loadSummary: () => Promise<ErpDashboardSummary>;
  loadExchangeRates: () => Promise<ExchangeRate[]>;
  loadFinancialAccounts: () => Promise<FinancialAccount[]>;
};

type WeatherSnapshot = {
  temperature: number;
  weatherCode: number;
  maxTemperature: number;
  minTemperature: number;
};

type WeatherLocationResult = WeatherLocation & {
  id?: number;
  country?: string;
  admin1?: string;
};

type OpenMeteoResponse = {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
};

type GeocodingResponse = {
  results?: WeatherLocationResult[];
};

type DashboardWidgetId = "weather" | "cash" | "agenda" | "quickActions" | "hero" | "metrics" | "rates" | "activity" | "notifications" | "assistant";
type DashboardGridPosition = { column: number; row: number };
const DASHBOARD_WIDGET_IDS: DashboardWidgetId[] = ["weather", "cash", "agenda", "quickActions", "hero", "metrics", "rates", "activity", "notifications", "assistant"];
const DEFAULT_DASHBOARD_SIZES: Record<DashboardWidgetId, number> = { weather: 3, cash: 3, agenda: 3, quickActions: 3, hero: 6, metrics: 6, rates: 3, activity: 3, notifications: 3, assistant: 6 };
const DEFAULT_DASHBOARD_HEIGHTS: Record<DashboardWidgetId, number> = { weather: 7, cash: 7, agenda: 6, quickActions: 8, hero: 22, metrics: 5, rates: 7, activity: 8, notifications: 6, assistant: 9 };
const DEFAULT_DASHBOARD_POSITIONS: Record<DashboardWidgetId, DashboardGridPosition> = {
  weather: { column: 1, row: 4 }, cash: { column: 1, row: 12 }, agenda: { column: 1, row: 20 },
  quickActions: { column: 1, row: 27 }, hero: { column: 4, row: 4 }, metrics: { column: 4, row: 28 },
  rates: { column: 10, row: 4 }, activity: { column: 10, row: 12 }, notifications: { column: 10, row: 21 }, assistant: { column: 4, row: 34 },
};
const PREVIOUS_DEFAULT_DASHBOARD_POSITIONS: Record<DashboardWidgetId, DashboardGridPosition> = {
  weather: { column: 1, row: 4 }, cash: { column: 1, row: 10 }, agenda: { column: 1, row: 15 },
  quickActions: { column: 1, row: 20 }, hero: { column: 4, row: 4 }, metrics: { column: 4, row: 23 },
  rates: { column: 10, row: 4 }, activity: { column: 10, row: 10 }, notifications: { column: 10, row: 16 }, assistant: { column: 4, row: 29 },
};
const DASHBOARD_LAYOUT_STORAGE_KEY = "nexora.launcher-layout";

function getDashboardPreferenceUser() {
  const token = window.localStorage.getItem("aierp.accessToken") || window.localStorage.getItem("aierp.token") || "";
  let user = (window.localStorage.getItem("aierp.user") || "user").trim().toLocaleLowerCase("tr-TR");
  try {
    const payload = token.split(".")[1];
    if (payload) user = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).sub || user;
  } catch { /* Keep the signed-in account name when decoding older tokens is not possible. */ }
  return user;
}

function canMigrateLegacyDashboardPreferences() {
  const user = getDashboardPreferenceUser();
  const ownerKey = `${DASHBOARD_LAYOUT_STORAGE_KEY}:legacy-owner`;
  const owner = window.localStorage.getItem(ownerKey);
  if (!owner) {
    try { window.localStorage.setItem(ownerKey, user); } catch { /* Legacy settings remain available for this session. */ }
    return true;
  }
  return owner === user;
}

function getDashboardPreferenceKey(tenantId?: string) {
  const user = getDashboardPreferenceUser();
  const tenant = tenantId || window.localStorage.getItem("aierp.tenant") || "default";
  return `${DASHBOARD_LAYOUT_STORAGE_KEY}:${encodeURIComponent(tenant)}:${encodeURIComponent(user)}`;
}

function getSavedDashboardLayout(preferenceKey = getDashboardPreferenceKey()) {
  const fallback = { order: DASHBOARD_WIDGET_IDS, sizes: DEFAULT_DASHBOARD_SIZES, heights: DEFAULT_DASHBOARD_HEIGHTS, positions: null as Record<DashboardWidgetId, DashboardGridPosition> | null };
  try {
    const saved = window.localStorage.getItem(preferenceKey);
    const legacy = !saved && canMigrateLegacyDashboardPreferences() ? window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) : null;
    const value = JSON.parse(saved || legacy || "null");
    if (!value || typeof value !== "object") return fallback;
    const order = Array.isArray(value.order) ? value.order.filter((id: unknown): id is DashboardWidgetId => DASHBOARD_WIDGET_IDS.includes(id as DashboardWidgetId)) : [];
    const sizes = { ...DEFAULT_DASHBOARD_SIZES };
    const heights = { ...DEFAULT_DASHBOARD_HEIGHTS };
    if (value.sizes && typeof value.sizes === "object") {
      for (const id of DASHBOARD_WIDGET_IDS) {
        const size = value.sizes[id];
        if (Number.isInteger(size) && size >= 2 && size <= 12) sizes[id] = size;
      }
    }
    if (value.heights && typeof value.heights === "object") {
      for (const id of DASHBOARD_WIDGET_IDS) {
        const height = value.heights[id];
        if (Number.isInteger(height) && height >= 3 && height <= 30) heights[id] = height;
      }
    }
    const positions: Partial<Record<DashboardWidgetId, DashboardGridPosition>> = {};
    if (value.positions && typeof value.positions === "object") {
      for (const id of DASHBOARD_WIDGET_IDS) {
        const position = value.positions[id];
        if (Number.isInteger(position?.column) && position.column >= 1 && position.column <= 12 && Number.isInteger(position?.row) && position.row >= 1 && position.row <= 200) positions[id] = { column: position.column, row: position.row };
      }
    }
    const hasPositions = DASHBOARD_WIDGET_IDS.every((id) => positions[id]);
    const isPreviousDefault = hasPositions && DASHBOARD_WIDGET_IDS.every((id) => positions[id]!.column === PREVIOUS_DEFAULT_DASHBOARD_POSITIONS[id].column && positions[id]!.row === PREVIOUS_DEFAULT_DASHBOARD_POSITIONS[id].row);
    if (isPreviousDefault) {
      return { order: [...DASHBOARD_WIDGET_IDS], sizes: DEFAULT_DASHBOARD_SIZES, heights: DEFAULT_DASHBOARD_HEIGHTS, positions: { ...DEFAULT_DASHBOARD_POSITIONS } };
    }
    return { order: [...order, ...DASHBOARD_WIDGET_IDS.filter((id) => !order.includes(id))], sizes, heights, positions: hasPositions ? positions as Record<DashboardWidgetId, DashboardGridPosition> : null };
  } catch {
    return fallback;
  }
}

function describeWeather(code: number, english: boolean) {
  if (code === 0) return english ? "Clear sky" : "Açık";
  if (code === 1) return english ? "Mainly clear" : "Çoğunlukla açık";
  if (code === 2) return english ? "Partly cloudy" : "Parçalı bulutlu";
  if (code === 3) return english ? "Overcast" : "Kapalı";
  if (code === 45 || code === 48) return english ? "Fog" : "Sisli";
  if ([51, 53, 55, 56, 57].includes(code)) return english ? "Drizzle" : "Çisenti";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return english ? "Rainy" : "Yağmurlu";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return english ? "Snowy" : "Karlı";
  if ([95, 96, 99].includes(code)) return english ? "Thunderstorm" : "Gök gürültülü";
  return english ? "Current conditions" : "Güncel hava durumu";
}

export function ModuleLauncher({
  tenant,
  token,
  tenants,
  canDefineCompany,
  actionError,
  onSelectTenant,
  onDefineCompany,
  userInitial,
  locale,
  query,
  results,
  allItems,
  quickLinks,
  activeIndex,
  inputRef,
  theme,
  onLocaleChange,
  onThemeToggle,
  onQueryChange,
  onMoveActiveIndex,
  onOpenResult,
  onShowModules,
  editMode,
  quickMenuPageIds,
  onToggleEditMode,
  onToggleQuickLink,
  onSignOut,
  onOpenSettings,
  loadSummary,
  loadExchangeRates,
  loadFinancialAccounts,
}: ModuleLauncherProps) {
  const [allModulesOpen, setAllModulesOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [summary, setSummary] = useState<ErpDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(true);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [financialAccountsLoading, setFinancialAccountsLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation>(getSavedWeatherLocation);

  useEffect(() => {
    // The remembered city is stored without coordinates; look them up once on open.
    const controller = new AbortController();
    void loadSavedWeatherLocation(controller.signal).then((location) => {
      if (location) setWeatherLocation(location);
    });
    return () => controller.abort();
  }, []);
  const [weatherLocationPickerOpen, setWeatherLocationPickerOpen] = useState(false);
  const [weatherLocationQuery, setWeatherLocationQuery] = useState("");
  const [weatherLocationResults, setWeatherLocationResults] = useState<WeatherLocationResult[]>([]);
  const [weatherLocationBusy, setWeatherLocationBusy] = useState(false);
  const [weatherLocationError, setWeatherLocationError] = useState("");
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() => {
    const preferenceKey = `${getDashboardPreferenceKey(tenant.id)}:widgets`;
    try {
      const savedValue = window.localStorage.getItem(preferenceKey) || (canMigrateLegacyDashboardPreferences() ? window.localStorage.getItem("nexora.launcher-widgets") : null);
      const saved = JSON.parse(savedValue || "null");
      if (Array.isArray(saved)) {
        const widgets = saved.filter((id): id is string => ["weather", "cash", "agenda", "quickActions", "hero", "rates", "activity", "notifications", "metrics", "assistant"].includes(id));
        if (!widgets.includes("hero")) widgets.push("hero");
        if (window.localStorage.getItem("nexora.launcher-assistant-migrated") !== "true") {
          if (!widgets.includes("assistant")) widgets.push("assistant");
          window.localStorage.setItem("nexora.launcher-assistant-migrated", "true");
        }
        return widgets;
      }
    } catch { /* Keep the complete dashboard when browser storage is unavailable. */ }
    return ["weather", "cash", "agenda", "quickActions", "hero", "rates", "activity", "notifications", "metrics", "assistant"];
  });
  const dashboardPreferenceKey = getDashboardPreferenceKey(tenant.id);
  const savedDashboardLayout = getSavedDashboardLayout(dashboardPreferenceKey);
  const [dashboardCustomizing, setDashboardCustomizing] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<DashboardWidgetId | null>(null);
  const [dashboardOrder, setDashboardOrder] = useState<DashboardWidgetId[]>(savedDashboardLayout.order);
  const [dashboardSizes, setDashboardSizes] = useState<Record<DashboardWidgetId, number>>(savedDashboardLayout.sizes);
  const [dashboardHeights, setDashboardHeights] = useState<Record<DashboardWidgetId, number>>(savedDashboardLayout.heights);
  const [dashboardPositions, setDashboardPositions] = useState<Record<DashboardWidgetId, DashboardGridPosition> | null>(savedDashboardLayout.positions);
  const [dashboardDropPosition, setDashboardDropPosition] = useState<DashboardGridPosition | null>(null);
  const [dashboardEditorOpen, setDashboardEditorOpen] = useState(false);
  const [launcherBackground, setLauncherBackground] = useState<LauncherBackground>(() => loadLauncherBackground(dashboardPreferenceKey));
  const [notificationFocused, setNotificationFocused] = useState(false);
  const [notificationsCollapsed, setNotificationsCollapsed] = useState(false);
  const [quickActionsCollapsed, setQuickActionsCollapsed] = useState(false);
  const notificationTimer = useRef<number | null>(null);
  const notificationsRef = useRef<HTMLElement>(null);
  const activeDashboardDrag = useRef<{ widget: DashboardWidgetId; pointerId: number; startX: number; startY: number; moved: boolean; grabColumnRatio: number; grabRowRatio: number } | null>(null);
  const companyMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const english = locale === "en";
  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);
  useEffect(() => {
    let active = true;
    void loadSummary()
      .then((value) => { if (active) setSummary(value); })
      .catch(() => { if (active) setSummary(null); })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [loadSummary]);
  useEffect(() => {
    let active = true;
    void loadExchangeRates()
      .then((rows) => { if (active) setExchangeRates(rows); })
      .catch(() => { if (active) setExchangeRates([]); })
      .finally(() => { if (active) setExchangeRatesLoading(false); });
    void loadFinancialAccounts()
      .then((rows) => { if (active) setFinancialAccounts(rows); })
      .catch(() => { if (active) setFinancialAccounts([]); })
      .finally(() => { if (active) setFinancialAccountsLoading(false); });
    return () => { active = false; };
  }, [loadExchangeRates, loadFinancialAccounts]);
  useEffect(() => {
    const controller = new AbortController();
    setWeatherLoading(true);
    const params = new URLSearchParams({
      latitude: String(weatherLocation.latitude),
      longitude: String(weatherLocation.longitude),
      current: "temperature_2m,weather_code",
      daily: "temperature_2m_max,temperature_2m_min",
      timezone: weatherLocation.timezone || "auto",
      forecast_days: "1",
    });
    void fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("weather_unavailable");
        return response.json() as Promise<OpenMeteoResponse>;
      })
      .then((value) => {
        const temperature = value.current?.temperature_2m;
        const weatherCode = value.current?.weather_code;
        const maxTemperature = value.daily?.temperature_2m_max?.[0];
        const minTemperature = value.daily?.temperature_2m_min?.[0];
        if ([temperature, weatherCode, maxTemperature, minTemperature].some((item) => typeof item !== "number"))
          throw new Error("weather_response_incomplete");
        setWeather({
          temperature: temperature!,
          weatherCode: weatherCode!,
          maxTemperature: maxTemperature!,
          minTemperature: minTemperature!,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setWeather(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setWeatherLoading(false);
      });
    return () => controller.abort();
  }, [weatherLocation]);
  // Shows a location for this session only. Browser (device) coordinates go through here and never reach storage.
  const showWeatherLocation = (location: WeatherLocation) => {
    setWeatherLocation(location);
    setWeatherLocationPickerOpen(false);
    setWeatherLocationQuery("");
    setWeatherLocationResults([]);
    setWeatherLocationError("");
  };
  // A city the user searched for is remembered across sessions.
  const selectWeatherLocation = (location: WeatherLocation) => {
    showWeatherLocation(location);
    saveWeatherLocation(location);
  };
  const toggleDashboardWidget = (widget: string) => {
    setVisibleWidgets((current) => {
      const next = current.includes(widget) ? current.filter((item) => item !== widget) : [...current, widget];
      try { window.localStorage.setItem(`${getDashboardPreferenceKey(tenant.id)}:widgets`, JSON.stringify(next)); } catch { /* Keep this session's selection. */ }
      return next;
    });
  };
  const persistDashboardLayout = (order: DashboardWidgetId[], sizes: Record<DashboardWidgetId, number>, heights: Record<DashboardWidgetId, number>, positions: Record<DashboardWidgetId, DashboardGridPosition> | null = dashboardPositions) => {
    try { window.localStorage.setItem(getDashboardPreferenceKey(tenant.id), JSON.stringify({ order, sizes, heights, positions })); } catch { /* Keep this session's layout. */ }
  };
  const getDashboardDisplayRows = () => {
    const rows: Partial<Record<DashboardWidgetId, number>> = {};
    if (!dashboardPositions) return rows;
    const compacted: { id: DashboardWidgetId; row: number; endRow: number }[] = [];
    for (const id of DASHBOARD_WIDGET_IDS
      .filter((candidate) => visibleWidgets.includes(candidate))
      .sort((a, b) => dashboardPositions[a].row - dashboardPositions[b].row || dashboardPositions[a].column - dashboardPositions[b].column)) {
      const position = dashboardPositions[id];
      const height = (id === "notifications" && notificationsCollapsed)
        || (id === "quickActions" && quickActionsCollapsed) ? 2 : dashboardHeights[id];
      const row = compacted.reduce((nextRow, previous) => {
        const previousPosition = dashboardPositions[previous.id];
        const columnsOverlap = position.column < previousPosition.column + dashboardSizes[previous.id]
          && previousPosition.column < position.column + dashboardSizes[id];
        return columnsOverlap ? Math.max(nextRow, previous.endRow) : nextRow;
      }, dashboardCustomizing ? 4 : 1);
      compacted.push({ id, row, endRow: row + height });
      rows[id] = row;
    }
    return rows;
  };
  const dashboardWidgetStyle = (widget: DashboardWidgetId) => {
    if (dashboardPositions) {
      const row = getDashboardDisplayRows()[widget] ?? (dashboardCustomizing ? 4 : 1);
      const collapsedHeight = (widget === "notifications" && notificationsCollapsed)
        || (widget === "quickActions" && quickActionsCollapsed) ? 2 : dashboardHeights[widget];
      return {
        gridColumn: `${dashboardPositions[widget].column} / span ${dashboardSizes[widget]}`,
        gridRow: `${row} / span ${collapsedHeight}`,
        order: dashboardOrder.indexOf(widget),
      };
    }
    if (dashboardCustomizing) {
      const collapsedHeight = (widget === "notifications" && notificationsCollapsed)
        || (widget === "quickActions" && quickActionsCollapsed) ? 2 : dashboardHeights[widget];
      return {
        gridColumn: `span ${dashboardSizes[widget]}`,
        gridRow: `span ${collapsedHeight}`,
        order: dashboardOrder.indexOf(widget),
      };
    }
    return undefined;
  };
  const findDashboardWidget = (target: EventTarget | null): DashboardWidgetId | null => {
    if (!(target instanceof Element)) return null;
    const id = target.closest<HTMLElement>("[data-dashboard-widget]")?.dataset.dashboardWidget;
    return id && DASHBOARD_WIDGET_IDS.includes(id as DashboardWidgetId) ? id as DashboardWidgetId : null;
  };
  useEffect(() => {
    const saved = getSavedDashboardLayout(dashboardPreferenceKey);
    setDashboardOrder(saved.order);
    setDashboardSizes(saved.sizes);
    setDashboardHeights(saved.heights);
    setDashboardPositions(saved.positions);
    try { window.localStorage.setItem(dashboardPreferenceKey, JSON.stringify(saved)); } catch { /* Retain the in-memory layout if browser storage is unavailable. */ }
  }, [dashboardPreferenceKey]);
  useEffect(() => { setLauncherBackground(loadLauncherBackground(dashboardPreferenceKey)); }, [dashboardPreferenceKey]);
  const changeLauncherBackground = (next: LauncherBackground) => {
    setLauncherBackground(next);
    return saveLauncherBackground(dashboardPreferenceKey, next);
  };
  const launcherBackgroundStyle = launcherBackgroundProps(launcherBackground);
  useEffect(() => {
    if (!dashboardCustomizing || dashboardPositions) return;
    const positions = { ...DEFAULT_DASHBOARD_POSITIONS };
    setDashboardOrder(DASHBOARD_WIDGET_IDS);
    setDashboardSizes(DEFAULT_DASHBOARD_SIZES);
    setDashboardHeights(DEFAULT_DASHBOARD_HEIGHTS);
    setDashboardPositions(positions);
    persistDashboardLayout(DASHBOARD_WIDGET_IDS, DEFAULT_DASHBOARD_SIZES, DEFAULT_DASHBOARD_HEIGHTS, positions);
  }, [dashboardCustomizing, dashboardPositions]);
  const onDashboardPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!dashboardCustomizing || !event.isPrimary || event.button !== 0) return;
    const source = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-dashboard-widget]") : null;
    const widget = findDashboardWidget(event.target);
    if (!widget || (event.target instanceof Element && event.target.closest("button, input, select, textarea, a"))) return;
    if (!dashboardPositions || !source) return;
    const bounds = source.getBoundingClientRect();
    activeDashboardDrag.current = { widget, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, grabColumnRatio: (event.clientX - bounds.left) / Math.max(1, bounds.width), grabRowRatio: (event.clientY - bounds.top) / Math.max(1, bounds.height) };
    setSelectedWidget(widget);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDashboardPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = activeDashboardDrag.current;
    if (!dashboardCustomizing || !drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7) return;
    drag.moved = true;
    event.preventDefault();
    const main = event.currentTarget;
    const style = window.getComputedStyle(main);
    const columns = style.gridTemplateColumns.split(" ").map(Number.parseFloat).filter(Number.isFinite);
    if (columns.length !== 12 || !dashboardPositions) return;
    const columnGap = Number.parseFloat(style.columnGap) || 0;
    const rowGap = Number.parseFloat(style.rowGap) || 0;
    const gridLeft = main.getBoundingClientRect().left + (Number.parseFloat(style.paddingLeft) || 0);
    const gridTop = main.getBoundingClientRect().top + (Number.parseFloat(style.paddingTop) || 0);
    const columnStep = columns[0] + columnGap;
    const rowStep = 18 + rowGap;
    const columnSpan = dashboardSizes[drag.widget];
    const rowSpan = dashboardHeights[drag.widget];
    const desiredColumn = Math.max(1, Math.min(13 - columnSpan, Math.round((event.clientX - gridLeft - drag.grabColumnRatio * (columnSpan * columnStep - columnGap)) / columnStep) + 1));
    const desiredRow = Math.max(4, Math.round((event.clientY - gridTop - drag.grabRowRatio * (rowSpan * rowStep - rowGap)) / rowStep) + 1);
    if (desiredColumn < 1 || desiredColumn + columnSpan > 13 || desiredRow > 200) {
      setDashboardDropPosition(null);
      return;
    }
    setDashboardDropPosition({ column: desiredColumn, row: desiredRow });
  };
  const finishDashboardPointerDrag = (event: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const drag = activeDashboardDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (commit && drag.moved && dashboardDropPosition && dashboardPositions) {
      const displayRows = getDashboardDisplayRows();
      const targetColumn = dashboardDropPosition.column;
      const targetSpan = dashboardSizes[drag.widget];
      const columnGroup = visibleWidgets
        .filter((id): id is DashboardWidgetId => DASHBOARD_WIDGET_IDS.includes(id as DashboardWidgetId))
        .filter((id) => {
          const position = dashboardPositions[id];
          return position.column < targetColumn + targetSpan && targetColumn < position.column + dashboardSizes[id];
        })
        .filter((id) => id !== drag.widget)
        .sort((a, b) => (displayRows[a] ?? 1) - (displayRows[b] ?? 1));
      const insertionIndex = columnGroup.findIndex((id) => (displayRows[id] ?? 1) >= dashboardDropPosition.row);
      columnGroup.splice(insertionIndex < 0 ? columnGroup.length : insertionIndex, 0, drag.widget);
      const startRow = Math.max(4, Math.min(dashboardDropPosition.row, ...columnGroup.filter((id) => id !== drag.widget).map((id) => displayRows[id] ?? dashboardDropPosition.row)));
      const next = { ...dashboardPositions };
      let row = startRow;
      for (const id of columnGroup) {
        const height = (id === "notifications" && notificationsCollapsed)
          || (id === "quickActions" && quickActionsCollapsed) ? 2 : dashboardHeights[id];
        next[id] = { column: id === drag.widget ? dashboardDropPosition.column : dashboardPositions[id].column, row };
        row += height;
      }
      setDashboardPositions(next);
      persistDashboardLayout(dashboardOrder, dashboardSizes, dashboardHeights, next);
    }
    activeDashboardDrag.current = null;
    setDashboardDropPosition(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resetDashboardLayout = () => {
    const positions = { ...DEFAULT_DASHBOARD_POSITIONS };
    setDashboardOrder(DASHBOARD_WIDGET_IDS);
    setDashboardSizes(DEFAULT_DASHBOARD_SIZES);
    setDashboardHeights(DEFAULT_DASHBOARD_HEIGHTS);
    setDashboardPositions(positions);
    setSelectedWidget(null);
    setDashboardDropPosition(null);
    persistDashboardLayout(DASHBOARD_WIDGET_IDS, DEFAULT_DASHBOARD_SIZES, DEFAULT_DASHBOARD_HEIGHTS, positions);
  };
  const resizeSelectedWidget = (delta: number) => {
    if (!selectedWidget) return;
    setDashboardSizes((current) => {
      const next = { ...current, [selectedWidget]: Math.min(12, Math.max(2, current[selectedWidget] + delta)) };
      persistDashboardLayout(dashboardOrder, next, dashboardHeights);
      return next;
    });
  };
  const resizeSelectedWidgetHeight = (delta: number) => {
    if (!selectedWidget) return;
    setDashboardHeights((current) => {
      const next = { ...current, [selectedWidget]: Math.min(30, Math.max(3, current[selectedWidget] + delta)) };
      persistDashboardLayout(dashboardOrder, dashboardSizes, next);
      return next;
    });
  };
  const focusNotifications = () => {
    if (!visibleWidgets.includes("notifications")) {
      toggleDashboardWidget("notifications");
      window.setTimeout(() => {
        const section = document.getElementById("launcher-notifications");
        if (!section) return;
        section.scrollIntoView({ behavior: "smooth", block: "center" });
        section.focus({ preventScroll: true });
        setNotificationFocused(true);
        notificationTimer.current = window.setTimeout(() => setNotificationFocused(false), 1800);
      }, 0);
      return;
    }
    if (notificationsCollapsed) setNotificationsCollapsed(false);
    const section = notificationsRef.current;
    if (!section) return;
    window.requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: "smooth", block: "center" });
      section.focus({ preventScroll: true });
      setNotificationFocused(true);
    });
    if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
    notificationTimer.current = window.setTimeout(() => setNotificationFocused(false), 1800);
  };
  const searchWeatherLocations = async () => {
    const query = weatherLocationQuery.trim();
    if (!query) {
      setWeatherLocationError(english ? "Enter a city name." : "Bir şehir adı yazın.");
      return;
    }
    setWeatherLocationBusy(true);
    setWeatherLocationError("");
    try {
      const params = new URLSearchParams({ name: query, count: "6", language: english ? "en" : "tr", format: "json" });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!response.ok) throw new Error("location_search_failed");
      const value = await response.json() as GeocodingResponse;
      const results = value.results ?? [];
      setWeatherLocationResults(results);
      if (results.length === 0) setWeatherLocationError(english ? "No matching location found." : "Eşleşen konum bulunamadı.");
    } catch {
      setWeatherLocationError(english ? "Locations could not be loaded. Try again." : "Konumlar yüklenemedi. Tekrar deneyin.");
    } finally {
      setWeatherLocationBusy(false);
    }
  };
  const useBrowserWeatherLocation = () => {
    setWeatherLocationBusy(true);
    setWeatherLocationError("");
    if (!window.isSecureContext) {
      setWeatherLocationError(english ? "Browser location requires a secure HTTPS connection. Search for your city instead." : "Tarayıcı konumu güvenli HTTPS bağlantısı gerektirir. Bunun yerine şehrinizi arayın.");
      setWeatherLocationBusy(false);
      return;
    }
    if (!navigator.geolocation) {
      setWeatherLocationError(english ? "This browser does not support location. Search for your city instead." : "Bu tarayıcı konum özelliğini desteklemiyor. Bunun yerine şehrinizi arayın.");
      setWeatherLocationBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // Device coordinates are personal data: keep them for this session only, rounded to
        // roughly 1 km, which is all a weather forecast needs. Searched cities are still saved.
        showWeatherLocation({
          name: english ? "Current location" : "Tarayıcı konumu",
          latitude: Math.round(coords.latitude * 100) / 100,
          longitude: Math.round(coords.longitude * 100) / 100,
          timezone: "auto",
        });
        setWeatherLocationBusy(false);
      },
      async (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          const permissionState = await navigator.permissions
            ?.query({ name: "geolocation" })
            .then((permission) => permission.state)
            .catch(() => "prompt" as PermissionState);
          setWeatherLocationError(permissionState === "granted"
            ? (english
              ? "Browser permission is enabled, but this page or your operating system is blocking location access. Your saved city will continue to be used."
              : "Tarayıcı izni açık; ancak bu sayfa veya işletim sistemi konum erişimini engelliyor. Kayıtlı şehriniz kullanılmaya devam edecek.")
            : (english
              ? "This site’s location permission was denied. The browser will not show the permission prompt again until you change it: open the site controls beside the address bar, choose Site settings > Location > Allow, then click Use browser location again. Also allow location access for your browser in the operating system. Your saved city will continue to be used."
              : "Bu site için konum izni reddedilmiş. Tarayıcı, izni değiştirene kadar pencereyi tekrar göstermez: adres çubuğunun yanındaki site simgesini açın, Site ayarları > Konum > İzin ver'i seçin ve Tarayıcı konumumu kullan düğmesine yeniden basın. İşletim sistemi ayarlarında da tarayıcı için konum erişimini açın. Kayıtlı şehriniz kullanılmaya devam edecek."));
        } else {
          setWeatherLocationError(error.code === error.TIMEOUT
            ? (english ? "Location lookup timed out. Try again or search for your city." : "Konum isteği zaman aşımına uğradı. Yeniden deneyin veya şehrinizi arayın.")
            : error.code === error.POSITION_UNAVAILABLE
              ? (english ? "Your device could not determine a location. Check device location services or search for your city." : "Cihazınız konumu belirleyemedi. Cihaz konum hizmetlerini kontrol edin veya şehrinizi arayın.")
              : (english ? "Your location could not be retrieved. Search for your city instead." : "Konumunuz alınamadı. Bunun yerine şehrinizi arayın."));
        }
        setWeatherLocationBusy(false);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  };
  useEffect(() => {
    if (!companyMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !companyMenuRef.current?.contains(event.target)
      )
        setCompanyMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCompanyMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [companyMenuOpen]);
  const icon = (result: GlobalSearchResult, size = 32) =>
    result.kind === "customer" ? (
      <Users size={size} />
    ) : result.page?.startsWith("sales-") ? (
      <ShoppingCart size={size} />
    ) : result.page?.startsWith("inventory-") ? (
      <Package size={size} />
    ) : result.page?.startsWith("finance-") ? (
      <Activity size={size} />
    ) : result.page === "reports" ? (
      <FileText size={size} />
    ) : (
      <Boxes size={size} />
    );
  const findPage = (page: string) =>
    allItems.find((item) => item.page === page) || quickLinks.find((item) => item.page === page);
  const openPage = (page: string) => {
    const result = findPage(page);
    if (result) onOpenResult(result);
  };
  const homeTiles = [
    { page: "sales-invoices", label: english ? "Invoices" : "Fatura", note: english ? "Create / View" : "Oluştur / Listele", icon: <FileText size={25} />, tone: "violet" },
    { page: "customers", label: english ? "Accounts" : "Cari", note: english ? "Cards / Activity" : "Kartlar / Hareketler", icon: <UsersRound size={25} />, tone: "green" },
    { page: "inventory-stock", label: english ? "Inventory" : "Stok", note: english ? "Query / Status" : "Sorgula / Durum", icon: <PackageCheck size={25} />, tone: "blue" },
    { page: "reports", label: english ? "Reports" : "Raporlar", note: english ? "Analysis / Summary" : "Analiz / Özet", icon: <BarChart3 size={25} />, tone: "orange" },
    { page: "sales-orders", label: english ? "Sales orders" : "Satış Siparişleri", note: english ? "Orders / Fulfillment" : "Sipariş / Sevkiyat", icon: <ShoppingCart size={25} />, tone: "blue" },
    { page: "finance-accounts", label: english ? "Cash & Bank" : "Kasa & Banka", note: english ? "Accounts / Balances" : "Hesaplar / Bakiyeler", icon: <Landmark size={25} />, tone: "green" },
    { page: "sales-purchase-invoices", label: english ? "Purchase invoices" : "Alış Faturaları", note: english ? "Create / View" : "Oluştur / Listele", icon: <FileText size={25} />, tone: "orange" },
    { page: "inventory-warehouses", label: english ? "Warehouses" : "Depolar", note: english ? "Locations / Stock" : "Konumlar / Stok", icon: <Building2 size={25} />, tone: "violet" },
  ].filter((item) => findPage(item.page));
  const currency = summary?.baseCurrencyCode || "TRY";
  const formatMoney = (amount: number | null | undefined) =>
    amount == null ? "—" : new Intl.NumberFormat(english ? "en-US" : "tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  const currentDate = new Date();
  const thisMonthSales = summary?.monthlySalesInvoices.find((item) => item.year === currentDate.getFullYear() && item.month === currentDate.getMonth() + 1)?.amount ?? 0;
  const salesTrend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - (5 - index), 1);
    return summary?.monthlySalesInvoices.find((item) => item.year === date.getFullYear() && item.month === date.getMonth() + 1)?.amount ?? 0;
  });
  const salesTrendMin = Math.min(...salesTrend);
  const salesTrendRange = Math.max(...salesTrend) - salesTrendMin || 1;
  const salesTrendPoints = salesTrend.map((amount, index) => `${index * 20},${32 - ((amount - salesTrendMin) / salesTrendRange) * 24}`).join(" ");
  const latestExchangeRate = (code: string) => exchangeRates
    .filter((item) => item.currencyCode === code)
    .sort((left, right) => right.rateDate.localeCompare(left.rateDate) || right.revision - left.revision)[0];
  const latestExchangeDate = exchangeRates.map((item) => item.rateDate).sort().at(-1);
  const baseCurrencyAccounts = financialAccounts.filter((item) => item.isActive && item.currencyCode === currency);
  const baseCurrencyBalance = baseCurrencyAccounts.reduce((total, item) => total + item.balance, 0);
  return (
    <div className={`module-launcher ${launcherBackgroundStyle.className}`.trim()} style={launcherBackgroundStyle.style}>
      <header className="module-launcher-topbar">
        <div className="module-launcher-brand">
          <span className="brand-mark">
            <Sparkles size={19} />
          </span>
          <b>nexora <strong>ERP</strong></b>
          <span className="module-launcher-divider" />
          <div className="module-launcher-company-wrap" ref={companyMenuRef}>
            <button
              type="button"
              className="module-launcher-company"
              aria-haspopup="menu"
              aria-expanded={companyMenuOpen}
              onClick={() => setCompanyMenuOpen((value) => !value)}
            >
              <Building2 size={16} />
              <b>{tenant.name}</b>
              <ChevronDown size={14} />
            </button>
            {companyMenuOpen && (
              <div className="module-launcher-company-menu" role="menu">
                <div className="module-launcher-company-menu-heading">
                  {english ? "Available companies" : "Tanımlı firmalar"}
                </div>
                {tenants.map((item) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={item.id}
                    className={item.id === tenant.id ? "active" : ""}
                    onClick={() => {
                      setCompanyMenuOpen(false);
                      if (item.id !== tenant.id) void onSelectTenant(item);
                    }}
                  >
                    <span className="module-launcher-company-avatar">
                      {item.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="module-launcher-company-copy">
                      <b>{item.name}</b>
                      <small>{item.role}</small>
                    </span>
                    {item.id === tenant.id && <Check size={15} />}
                  </button>
                ))}
                {tenants.length === 0 && (
                  <p>
                    {english
                      ? "No other companies are assigned to your account."
                      : "Hesabınıza atanmış başka firma yok."}
                  </p>
                )}
                {canDefineCompany && (
                  <button
                    type="button"
                    className="module-launcher-company-create"
                    role="menuitem"
                    onClick={() => {
                      setCompanyMenuOpen(false);
                      onDefineCompany();
                    }}
                  >
                    <Plus size={16} />
                    {english ? "Define company" : "Firma tanımla"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <form
          className="module-launcher-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (results[activeIndex]) onOpenResult(results[activeIndex]);
          }}
        >
          <Search size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                onMoveActiveIndex(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                onMoveActiveIndex(-1);
              } else if (event.key === "Escape" && query) {
                event.preventDefault();
                onQueryChange("");
              }
            }}
            placeholder={english ? "Search customers, stock, invoices…" : "Cari, stok, fatura ara…"}
            aria-label={english ? "Search customers, stock or invoices" : "Cari, stok veya fatura ara"}
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="module-launcher-results"
          />
          <kbd>⌘ K</kbd>
          <button type="submit" aria-label={english ? "Open selected result" : "Seçili sonucu aç"}>
            <Search size={18} />
          </button>
          {query.trim() && (
            <div className="module-launcher-suggestions">
              <div id="module-launcher-results" role="listbox" aria-label={english ? "Live search results" : "Canlı arama sonuçları"}>
                {results.map((result, index) => (
                  <button type="button" role="option" aria-selected={index === activeIndex} key={`${result.kind || "page"}-${result.page || result.label}`} onMouseEnter={() => onMoveActiveIndex(index - activeIndex)} onClick={() => onOpenResult(result)}>
                    <span className="module-launcher-result-icon">{icon(result, 17)}</span>
                    <span><b>{result.label}</b><small>{result.description}</small></span>
                    <ArrowRight size={16} />
                  </button>
                ))}
                {results.length === 0 && <p>{english ? "No matching modules or records." : "Eşleşen modül veya kayıt bulunamadı."}</p>}
              </div>
              {quickLinks.length > 0 && <section className="module-launcher-search-quick" aria-label={english ? "Quick access" : "Hızlı erişim"}><h2>{english ? "Quick access" : "Hızlı erişim"}</h2><div>{quickLinks.slice(0, 6).map((result) => <button type="button" key={result.page || result.label} onClick={() => onOpenResult(result)}><span>{icon(result, 16)}</span><b>{result.label}</b><ArrowRight size={14} /></button>)}</div></section>}
            </div>
          )}
        </form>
        <div className="module-launcher-actions">
          <button type="button" className="icon-button launcher-notification-button" title={english ? "Notifications" : "Bildirimler"} aria-label={english ? "Go to notifications" : "Bildirimlere git"} onClick={focusNotifications}>
            <Bell size={19} /><i aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" title={english ? "Settings" : "Ayarlar"} aria-label={english ? "Settings" : "Ayarlar"} onClick={onOpenSettings}><Settings size={19} /></button>
          <div
            className="locale-switch"
            role="group"
            aria-label={english ? "Language" : "Dil"}
          >
            <button
              type="button"
              aria-pressed={!english}
              onClick={() => onLocaleChange("tr")}
            >
              TR
            </button>
            <button
              type="button"
              aria-pressed={english}
              onClick={() => onLocaleChange("en")}
            >
              EN
            </button>
          </div>
          <div className="module-launcher-profile" ref={profileMenuRef}>
            <button
              className="module-launcher-profile-trigger"
              type="button"
              onClick={() => setProfileMenuOpen((value) => !value)}
              title={english ? "Profile options" : "Profil seçenekleri"}
              aria-label={english ? "Open profile options" : "Profil seçeneklerini aç"}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
            >
              <span className="top-avatar">{userInitial}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {profileMenuOpen && (
              <div className="module-launcher-profile-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onThemeToggle();
                    setProfileMenuOpen(false);
                  }}
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                  {theme === "dark"
                    ? english ? "Light appearance" : "Açık görünüm"
                    : english ? "Dark appearance" : "Koyu görünüm"}
                </button>
                <button type="button" role="menuitem" onClick={onSignOut}>
                  {english ? "Sign out" : "Oturumu kapat"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {actionError && <div className="launcher-action-error" role="alert">{actionError}</div>}
      <main
        className={dashboardCustomizing ? "module-launcher-main launcher-dashboard has-custom-layout is-customizing" : dashboardPositions ? "module-launcher-main launcher-dashboard has-custom-layout" : "module-launcher-main launcher-dashboard"}
        onClick={(event) => { if (dashboardCustomizing) { const widget = findDashboardWidget(event.target); if (widget) setSelectedWidget(widget); } }}
        onPointerDown={onDashboardPointerDown}
        onPointerMove={onDashboardPointerMove}
        onPointerUp={(event) => finishDashboardPointerDrag(event, true)}
        onPointerCancel={(event) => finishDashboardPointerDrag(event, false)}
      >
        <aside className="launcher-rail launcher-rail-left" aria-label={english ? "Workspace panels" : "Çalışma alanı panelleri"}>
          {visibleWidgets.includes("weather") && <section className="launcher-panel launcher-weather" data-dashboard-widget="weather" data-selected={selectedWidget === "weather"} style={dashboardWidgetStyle("weather")}>
            <header>
              <span><CloudSun size={20} />{english ? "Weather" : "Hava Durumu"}</span>
            </header>
            <div className="launcher-panel-body weather-body">
              <button
                type="button"
                className="weather-city"
                aria-expanded={weatherLocationPickerOpen}
                aria-controls="weather-location-picker"
                onClick={() => {
                  setWeatherLocationPickerOpen((open) => !open);
                  setWeatherLocationError("");
                  setWeatherLocationResults([]);
                }}
              >
                <MapPin size={13} />
                <span>{weatherLocation.name}</span>
                <ChevronDown size={13} />
              </button>
              {weatherLocationPickerOpen && (
                <div className="weather-location-picker" id="weather-location-picker">
                  <form
                    className="weather-location-search"
                    onSubmit={(event) => { event.preventDefault(); void searchWeatherLocations(); }}
                  >
                    <input
                      type="search"
                      value={weatherLocationQuery}
                      onChange={(event) => setWeatherLocationQuery(event.target.value)}
                      placeholder={english ? "Search for a city" : "Şehir ara"}
                      aria-label={english ? "Search for a city" : "Şehir ara"}
                    />
                    <button type="submit" disabled={weatherLocationBusy} aria-label={english ? "Search" : "Ara"}>
                      <Search size={15} />
                    </button>
                  </form>
                  <button
                    type="button"
                    className="weather-browser-location"
                    onClick={useBrowserWeatherLocation}
                    disabled={weatherLocationBusy}
                  >
                    <LocateFixed size={15} />
                    {weatherLocationBusy
                      ? (english ? "Getting location…" : "Konum alınıyor…")
                      : (english ? "Use browser location" : "Tarayıcı konumumu kullan")}
                  </button>
                  {weatherLocationResults.length > 0 && (
                    <div className="weather-location-results" role="listbox" aria-label={english ? "Matching locations" : "Eşleşen konumlar"}>
                      {weatherLocationResults.map((location, index) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          key={`${location.latitude}-${location.longitude}-${index}`}
                          onClick={() => selectWeatherLocation({
                            name: [location.name, location.admin1, location.country].filter(Boolean).join(", "),
                            latitude: location.latitude,
                            longitude: location.longitude,
                            timezone: location.timezone || "auto",
                            geocodingId: location.id,
                          })}
                        >
                          <span>{location.name}</span>
                          <small>{[location.admin1, location.country].filter(Boolean).join(", ")}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {weatherLocationError && <p className="weather-location-error" role="status">{weatherLocationError}</p>}
                </div>
              )}
              <div className="weather-reading">
                <CloudSun size={42} />
                <strong>{weatherLoading ? "…" : weather ? `${Math.round(weather.temperature)}°` : "—°"}</strong>
                <span>
                  {weatherLoading
                    ? (english ? "Loading weather…" : "Hava durumu yükleniyor…")
                    : weather
                      ? <>{describeWeather(weather.weatherCode, english)}<small>↑ {Math.round(weather.maxTemperature)}° · ↓ {Math.round(weather.minTemperature)}°</small></>
                      : (english ? "Weather data unavailable" : "Hava verisi alınamadı")}
                </span>
              </div>
            </div>
          </section>}
          {visibleWidgets.includes("cash") && <section className="launcher-panel launcher-cash" data-dashboard-widget="cash" data-selected={selectedWidget === "cash"} style={dashboardWidgetStyle("cash")}><button className="launcher-panel-link" type="button" onClick={() => openPage("finance-accounts")}><span><Landmark size={20} />{english ? "Cash & Bank" : "Kasa & Banka"}</span><ChevronRight size={18} /></button><p>{english ? "Active account balance" : "Aktif hesap bakiyesi"}</p><strong>{financialAccountsLoading ? "…" : baseCurrencyAccounts.length ? formatMoney(baseCurrencyBalance) : "—"}</strong><small>{financialAccountsLoading ? (english ? "Loading accounts…" : "Hesaplar yükleniyor…") : baseCurrencyAccounts.length ? `${baseCurrencyAccounts.length} ${english ? "accounts" : "hesap"} · ${currency}` : (english ? `No active ${currency} accounts` : `Aktif ${currency} hesabı yok`)}</small></section>}
          {visibleWidgets.includes("agenda") && <section className="launcher-panel launcher-agenda" data-dashboard-widget="agenda" data-selected={selectedWidget === "agenda"} style={dashboardWidgetStyle("agenda")}><header><span><CalendarDays size={20} />{english ? "Agenda" : "Ajanda"}</span><span className="panel-date">{english ? "Today" : "Bugün"}</span></header><div className="launcher-empty-state">{english ? "Your agenda items will appear here." : "Ajanda kayıtlarınız burada görüntülenir."}</div></section>}
          {visibleWidgets.includes("quickActions") && <section className={`launcher-panel launcher-quick-actions${quickActionsCollapsed ? " is-collapsed" : ""}`} data-dashboard-widget="quickActions" data-selected={selectedWidget === "quickActions"} style={dashboardWidgetStyle("quickActions")}><header><span><Activity size={20} />{english ? "Quick actions" : "Hızlı İşlemler"}</span><button type="button" className="launcher-quick-actions-collapse" aria-label={quickActionsCollapsed ? (english ? "Expand quick actions" : "Hızlı İşlemleri genişlet") : (english ? "Collapse quick actions" : "Hızlı İşlemleri daralt")} aria-expanded={!quickActionsCollapsed} onClick={() => setQuickActionsCollapsed((collapsed) => !collapsed)}>{quickActionsCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button></header>{!quickActionsCollapsed && <div className="launcher-action-grid">{quickLinks.slice(0, 4).map((result, index) => <button type="button" key={result.page || result.label} onClick={() => onOpenResult(result)}><span className={`quick-action-icon quick-action-${index}`}>{icon(result, 20)}</span><b>{result.label}</b></button>)}</div>}</section>}
        </aside>
        <section className="launcher-center" aria-label={english ? "ERP workspace" : "ERP çalışma alanı"}>
          {dashboardCustomizing && <div className="launcher-dashboard-edit-toolbar" role="toolbar" aria-label={english ? "Dashboard layout tools" : "Ana ekran düzenleme araçları"}>
            <span><b>{english ? "Layout editing" : "Düzenleme modu"}</b>{selectedWidget ? (english ? `${selectedWidget} · ${dashboardSizes[selectedWidget]} columns · ${dashboardHeights[selectedWidget]} rows` : `${selectedWidget} · ${dashboardSizes[selectedWidget]} sütun · ${dashboardHeights[selectedWidget]} satır`) : (english ? "Drag a card or select one to resize" : "Kartı taşıyın veya boyutlandırmak için seçin")}</span>
            <div><button type="button" onClick={() => resizeSelectedWidget(-1)} disabled={!selectedWidget || dashboardSizes[selectedWidget] <= 2} aria-label={english ? "Make selected card narrower" : "Seçili kartı daralt"}>−</button><button type="button" onClick={() => resizeSelectedWidget(1)} disabled={!selectedWidget || dashboardSizes[selectedWidget] >= 12} aria-label={english ? "Make selected card wider" : "Seçili kartı genişlet"}>＋</button><button type="button" onClick={() => resizeSelectedWidgetHeight(-1)} disabled={!selectedWidget || dashboardHeights[selectedWidget] <= 3} aria-label={english ? "Make selected card shorter" : "Seçili kartı kısalt"}>↕−</button><button type="button" onClick={() => resizeSelectedWidgetHeight(1)} disabled={!selectedWidget || dashboardHeights[selectedWidget] >= 30} aria-label={english ? "Make selected card taller" : "Seçili kartı uzat"}>↕＋</button><LauncherBackgroundPicker english={english} background={launcherBackground} onChange={changeLauncherBackground} /><button type="button" className="reset-layout" onClick={resetDashboardLayout} title={english ? "Restore default layout" : "Varsayılan düzene dön"}><RotateCcw size={13} />{english ? "Default" : "Varsayılan"}</button><button type="button" className="finish-editing" onClick={() => { setDashboardCustomizing(false); setSelectedWidget(null); }}>{english ? "Done" : "Bitti"}</button></div>
          </div>}
          {dashboardCustomizing && dashboardDropPosition && selectedWidget && <div className="launcher-dashboard-drop-preview" aria-hidden="true" style={{ gridColumn: `${dashboardDropPosition.column} / span ${dashboardSizes[selectedWidget]}`, gridRow: `${dashboardDropPosition.row} / span ${dashboardHeights[selectedWidget]}` }} />}
          {visibleWidgets.includes("hero") && <div className="launcher-center-hero" data-dashboard-widget="hero" data-selected={selectedWidget === "hero"} style={dashboardWidgetStyle("hero")}>
            <div className="launcher-dashboard-tools">
              <button type="button" className="launcher-dashboard-edit" aria-pressed={dashboardCustomizing} onClick={() => { setDashboardCustomizing((value) => !value); setSelectedWidget(null); }}>{dashboardCustomizing ? (english ? "Done" : "Bitti") : (english ? "Customize screen" : "Ekranı düzenle")}</button>
              <button type="button" className="launcher-dashboard-edit launcher-dashboard-widgets" aria-expanded={dashboardEditorOpen} aria-controls="launcher-dashboard-editor" onClick={() => setDashboardEditorOpen((open) => !open)}><Settings size={15} />{english ? "Widgets" : "Bileşenler"}</button>
              {dashboardEditorOpen && <div className="launcher-dashboard-editor" id="launcher-dashboard-editor" role="group" aria-label={english ? "Dashboard sections" : "Ana ekran bileşenleri"}>
                <strong>{english ? "Show on your dashboard" : "Ana ekranda göster"}</strong>
                {(["weather", "cash", "agenda", "quickActions", "hero", "rates", "activity", "notifications", "metrics", "assistant"] as const).map((widget) => {
                  const labels = { weather: english ? "Weather" : "Hava durumu", cash: english ? "Cash & Bank" : "Kasa & Banka", agenda: english ? "Agenda" : "Ajanda", quickActions: english ? "Quick actions" : "Hızlı işlemler", hero: english ? "Welcome and modules" : "Karşılama ve modüller", rates: english ? "Exchange rates" : "Döviz kurları", activity: english ? "Recent activity" : "Son hareketler", notifications: english ? "Notifications" : "Bildirimler", metrics: english ? "Summary cards" : "Özet kartları", assistant: english ? "AI chat" : "AI sohbet" };
                  return <label key={widget}><input type="checkbox" checked={visibleWidgets.includes(widget)} onChange={() => toggleDashboardWidget(widget)} />{labels[widget]}</label>;
                })}
              </div>}
            </div>
            <div className="launcher-center-intro"><span className="launcher-center-brand"><span><Sparkles size={20} /></span>ERP</span><p>{english ? "Welcome" : "Hoş Geldiniz"}</p><span className="launcher-center-subtitle">{english ? "Access your work quickly and manage your data from one place." : "İşlemlerinize hızlıca ulaşın, verilerinizi tek yerden yönetin."}</span></div>
            <div className="launcher-center-tiles">{homeTiles.map((item) => <button type="button" key={item.page} className={`launcher-home-tile tone-${item.tone}`} onClick={() => openPage(item.page)}><span>{item.icon}</span><b>{item.label}</b><small>{item.note}<ChevronRight size={15} /></small></button>)}</div>
            <button className="launcher-all-modules" type="button" onClick={() => { setAllModulesOpen(true); window.setTimeout(() => inputRef.current?.focus(), 0); }}>{english ? "Browse all modules" : "Tüm modülleri görüntüle"}<ArrowRight size={15} /></button>
          </div>}
          {visibleWidgets.includes("metrics") && <div className="launcher-metric-grid" data-dashboard-widget="metrics" data-selected={selectedWidget === "metrics"} style={dashboardWidgetStyle("metrics")}>
            <article className="launcher-metric"><span className="metric-mark metric-violet"><ShoppingCart size={19} /></span><span>{english ? "Monthly sales" : "Bu Ay Satış"}</span><strong>{summaryLoading ? "…" : summary?.canReadSalesInvoices ? formatMoney(thisMonthSales) : "—"}</strong>{summary?.canReadSalesInvoices && summary.monthlySalesInvoices.length > 0 && <svg className="metric-sparkline" viewBox="0 0 100 40" aria-hidden="true"><polyline points={salesTrendPoints} /></svg>}</article>
            <article className="launcher-metric"><span className="metric-mark metric-blue"><Package size={19} /></span><span>{english ? "Open orders" : "Açık Sipariş"}</span><strong>{summaryLoading ? "…" : summary?.canReadSalesOrders ? (summary.openSalesOrderCount ?? 0).toLocaleString(english ? "en-US" : "tr-TR") : "—"}</strong></article>
            <article className="launcher-metric"><span className="metric-mark metric-red"><CircleAlert size={19} /></span><span>{english ? "Active stock items" : "Aktif Stok Kartı"}</span><strong>{summaryLoading ? "…" : summary?.canReadInventory ? (summary.activeStockItemCount ?? 0).toLocaleString(english ? "en-US" : "tr-TR") : "—"}</strong></article>
            <article className="launcher-metric"><span className="metric-mark metric-orange"><PackageCheck size={19} /></span><span>{english ? "Warehouses" : "Depolar"}</span><strong>{summaryLoading ? "…" : summary?.canReadInventory ? (summary.activeWarehouseCount ?? 0).toLocaleString(english ? "en-US" : "tr-TR") : "—"}</strong></article>
          </div>}
          {visibleWidgets.includes("assistant") && <LauncherAssistantWidget token={token} selected={selectedWidget === "assistant"} style={dashboardWidgetStyle("assistant")} />}
        </section>
        <aside className="launcher-rail launcher-rail-right" aria-label={english ? "Updates and notifications" : "Güncellemeler ve bildirimler"}>
          {visibleWidgets.includes("rates") && <section className="launcher-panel launcher-rates" data-dashboard-widget="rates" data-selected={selectedWidget === "rates"} style={dashboardWidgetStyle("rates")}><header><span><ArrowLeftRight size={20} />{english ? "Exchange rates" : "Döviz Kurları"}</span><small>{exchangeRatesLoading ? (english ? "Loading…" : "Yükleniyor…") : latestExchangeDate ? new Date(`${latestExchangeDate}T00:00:00`).toLocaleDateString(english ? "en-US" : "tr-TR", { day: "2-digit", month: "short" }) : (english ? "No saved rates" : "Kur kaydı yok")}</small></header>{["USD", "EUR", "GBP"].map((code) => { const rate = latestExchangeRate(code); return <div className="rate-row" key={code}><span className="rate-dot">{code === "USD" ? "🇺🇸" : code === "EUR" ? "🇪🇺" : "🇬🇧"}</span><b>{code} / {currency}</b><strong>{exchangeRatesLoading ? "…" : rate ? new Intl.NumberFormat(english ? "en-US" : "tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate.rate) : "—"}</strong><i>{rate ? rate.rateDate : (english ? "No saved rate" : "Kur kaydı yok")}</i></div>; })}</section>}
          {visibleWidgets.includes("activity") && <section className="launcher-panel launcher-activity" data-dashboard-widget="activity" data-selected={selectedWidget === "activity"} style={dashboardWidgetStyle("activity")}><header><span><Clock3 size={20} />{english ? "Recent activity" : "Son Hareketler"}</span><button type="button" onClick={() => openPage("sales-orders")}>{english ? "All" : "Tümü"}</button></header>{summary?.canReadSalesOrders && summary.recentOpenSalesOrders.length ? summary.recentOpenSalesOrders.slice(0, 3).map((order, index) => <button className="activity-row" type="button" key={order.id} onClick={() => openPage("sales-orders")}><span className={`activity-mark activity-mark-${index}`}><ShoppingCart size={16} /></span><span className="activity-copy"><b>{english ? "Order" : "Sipariş"} (#{order.code})</b><small>{order.customerName}</small></span><span className="activity-amount"><b>{formatMoney(order.grandTotal)}</b><small>{new Date(order.orderDate).toLocaleDateString(english ? "en-US" : "tr-TR", { day: "numeric", month: "short" })}</small></span></button>) : <div className="launcher-empty-state">{summaryLoading ? (english ? "Loading activity…" : "Hareketler yükleniyor…") : summary?.canReadSalesOrders ? (english ? "No open orders to show." : "Gösterilecek açık sipariş yok.") : (english ? "Activity summary is unavailable." : "Hareket özeti kullanılamıyor.")}</div>}</section>}
          {visibleWidgets.includes("notifications") && <section ref={notificationsRef} tabIndex={-1} className={`launcher-panel launcher-notifications${notificationsCollapsed ? " is-collapsed" : ""}${notificationFocused ? " notification-focused" : ""}`} id="launcher-notifications" data-dashboard-widget="notifications" data-selected={selectedWidget === "notifications"} style={dashboardWidgetStyle("notifications")}><header><span><Bell size={20} />{english ? "Notifications" : "Bildirimler"}</span><button type="button" className="launcher-notifications-collapse" aria-label={notificationsCollapsed ? (english ? "Expand notifications" : "Bildirimleri genişlet") : (english ? "Collapse notifications" : "Bildirimleri daralt")} aria-expanded={!notificationsCollapsed} onClick={() => setNotificationsCollapsed((collapsed) => !collapsed)}>{notificationsCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button></header>{!notificationsCollapsed && <div className="launcher-empty-state">{english ? "You are all caught up." : "Yeni bildirim yok."}</div>}</section>}
        </aside>
      </main>
      <WorkspaceSearchDialog
        open={allModulesOpen}
        initialShowAll
        locale={locale}
        query={query}
        results={results}
        allItems={allItems}
        quickLinks={quickLinks}
        activeIndex={activeIndex}
        inputRef={inputRef}
        editMode={editMode}
        quickMenuPageIds={quickMenuPageIds}
        onQueryChange={onQueryChange}
        onMoveActiveIndex={onMoveActiveIndex}
        onOpenResult={onOpenResult}
        onClose={() => setAllModulesOpen(false)}
        onToggleEditMode={onToggleEditMode}
        onToggleQuickLink={onToggleQuickLink}
        onShowMarketplace={() => {
          setAllModulesOpen(false);
          onShowModules();
        }}
      />
    </div>
  );
}
