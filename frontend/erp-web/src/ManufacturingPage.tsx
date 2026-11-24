import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import type { ScreenColumnPin } from "./erp-types";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { authenticatedFetch } from "./authApi";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Factory,
  Info,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { DetailLinesHead } from "./document-detail/DocumentDetailLayout";
import ScreenViewGroupHeader from "./ScreenViewGroupHeader";
import SearchableRecordPicker from "./SearchableRecordPicker";
import ManufacturingPageHeader from "./manufacturing/components/ManufacturingPageHeader";
import {
  StickyFormBar,
  ToolbarMoreMenu,
} from "./manufacturing/components/ManufacturingFormMenu";
import ManufacturingRecipeList, {
  RECIPE_PAGE_SIZE,
  defaultRecipeFields,
} from "./manufacturing/components/ManufacturingRecipeList";
import type {
  ManufacturingBom as Bom,
  ManufacturingOrder as Order,
  ManufacturingOrderOperation as OrderOperation,
  ManufacturingPageKey,
} from "./manufacturing/types";
import {
  RecordFormGroup,
  RecordFormPage,
  RecordFormTabs,
  RequiredMark,
  type RecordFormTab,
} from "./record-form/RecordForm";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import { DefinitionEmptyPane, DefinitionLayout } from "./list-page/DefinitionLayout";
import { ListSummaryCards, type SummaryCard } from "./list-page/ListSummaryCards";
import { StatusTag } from "./list-page/StatusTag";
import type { GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import { useStockDetailPanelOpen } from "./inventory/components/InventoryStockDetailPanel";
import SalesDocumentGrid from "./sales/components/SalesDocumentGrid";
import {
  SalesListDetailEmpty,
  SalesListPanelToggle,
} from "./sales/components/SalesListDetailPanel";
import { SalesListFooter } from "./sales/components/SalesListFooter";
import {
  ManufacturingOrderPanel,
  type ManufacturingOrderPanelHandle,
} from "./manufacturing/components/ManufacturingOrderPanel";
import {
  amountText,
  displayDate,
  orderCanCancel,
  orderCanComplete,
  orderCanRelease,
  orderNeedsScheduling,
  orderPageFigures,
  orderStatusTag,
  type OrderStep,
} from "./manufacturing/orderList";
// Kit line table (table.dd-lines) of the lined record forms (recipe, production order).
import "./document-page/document-page.css";
import "./manufacturing.css";
import "./manufacturing-record-forms.css";
import "./manufacturing/manufacturing-list-v2.css";

export type { ManufacturingPageKey } from "./manufacturing/types";
import { confirmDialog } from "./confirmDialog";
import { problemDetail } from "./erpApi";
import { dropPageParam, pageParamsOf, usePageParams, useTabRecord } from "./pageNavigation";

type Item = {
  id: string;
  code: string;
  name: string;
  unitCode: string;
  isActive: boolean;
  trackingMode: string;
};
type Warehouse = { id: string; code: string; name: string; isActive: boolean };
type Employee = { id: string; personnelCode: string; fullName: string; status: string };
type SourceSalesOrderOption = { id: string; code: string; customerName: string; status: string; requestedDeliveryDate: string | null };
type SourceSalesOrderLine = { lineNumber: number; stockItemId: string; stockCode: string; stockName: string; remainingQuantity: number };
type SourceSalesOrderDetail = { id: string; code: string; lines: SourceSalesOrderLine[] };
type WorkCenter = {
  id: string;
  code: string;
  name: string;
  capacityMinutesPerDay: number;
  laborCostPerHourBase: number;
  overheadCostPerHourBase: number;
  workingDaysMask: number;
  isActive: boolean;
  shiftStartMinuteOfDay: number;
  shiftEndMinuteOfDay: number;
};
type AnnualCapacityRule = {
  month: number;
  day: number;
  capacityMinutes: number;
  note: string | null;
};
type ShiftRotationDay = {
  dayIndex: number;
  capacityMinutes: number;
  shiftStartMinuteOfDay: number;
  shiftEndMinuteOfDay: number;
};
type ShiftRotation = {
  effectiveFromDate: string;
  effectiveToDate: string | null;
  note: string | null;
  days: ShiftRotationDay[];
};
type WorkCenterCalendar = {
  workCenterId: string;
  workingDaysMask: number;
  shiftStartMinuteOfDay: number;
  shiftEndMinuteOfDay: number;
  capacityOverrides: {
    workDate: string;
    capacityMinutes: number;
    note: string | null;
  }[];
  annualCapacityRules: AnnualCapacityRule[];
  shiftRotations: ShiftRotation[];
};
type SetupRule = {
  fromSetupFamilyCode: string;
  toSetupFamilyCode: string;
  setupMinutes: number;
  isTransitionAllowed: boolean;
};
type MrpLine = {
  stockItemId: string;
  stockCode: string;
  stockName: string;
  unitCode: string;
  level: number;
  grossRequirement: number;
  onHand: number;
  reserved: number;
  fromOnHand: number;
  fromOpenPurchaseOrders: number;
  fromOpenManufacturingOrders: number;
  netRequirement: number;
  recommendation: string;
  issue: string | null;
  sources: string[];
  requiredByDate: string;
  recommendedOrderDate: string;
  sourceSalesOrder?: {
    salesOrderId: string;
    salesOrderLineNumber: number;
    salesOrderCode: string;
  } | null;
};
type MrpPlan = {
  planId?: string;
  warehouseId: string;
  plannedAt: string;
  includesOpenSalesOrders: boolean;
  supplyCaveat: string;
  lines: MrpLine[];
  convertedLineIndexes?: number[];
};
type MrpPlanHistory = {
  id: string;
  warehouseId: string;
  planDate: string;
  includesOpenSalesOrders: boolean;
  createdAt: string;
  createdByUserId: string;
};
type PurchaseRequestField = {
  code: string;
  label: string;
  isRequired: boolean;
  dataType: number;
  maxLength: number;
};
type ScreenViewField = {
  key: string;
  label: string;
  visible: boolean;
  position: number;
  fixed?: boolean;
  section?: string | null;
  width?: number | null;
  pinned?: ScreenColumnPin | null;
};
type Page<T> = { items: T[]; pageSize: number; totalCount: number };
const defaultWorkCenterFields: ScreenViewField[] = [
  { key: "code", label: "Kod", visible: true, position: 0 },
  { key: "name", label: "İş merkezi", visible: true, position: 1 },
  { key: "capacityMinutesPerDay", label: "Günlük kapasite", visible: true, position: 2 },
  { key: "laborCostPerHourBase", label: "İşçilik / saat", visible: true, position: 3 },
  { key: "overheadCostPerHourBase", label: "Genel gider / saat", visible: true, position: 4 },
  { key: "status", label: "Durum", visible: true, position: 5 },
  { key: "shift", label: "Vardiya", visible: false, position: 6 },
];
const WORK_CENTER_NUMBER_FIELDS: ReadonlySet<string> = new Set([
  "capacityMinutesPerDay",
  "laborCostPerHourBase",
  "overheadCostPerHourBase",
]);
function minuteOfDayLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function renderWorkCenterCell(center: WorkCenter, key: string) {
  switch (key) {
    case "code":
      return center.code;
    case "name":
      return center.name;
    case "capacityMinutesPerDay":
      return `${center.capacityMinutesPerDay.toLocaleString("tr-TR")} dk`;
    case "laborCostPerHourBase":
      return center.laborCostPerHourBase.toLocaleString("tr-TR");
    case "overheadCostPerHourBase":
      return center.overheadCostPerHourBase.toLocaleString("tr-TR");
    case "status":
      return (
        <StatusTag tone={center.isActive ? "ok" : "off"}>
          {center.isActive ? "Aktif" : "Pasif"}
        </StatusTag>
      );
    case "shift":
      return `${minuteOfDayLabel(center.shiftStartMinuteOfDay)}–${minuteOfDayLabel(center.shiftEndMinuteOfDay)}`;
    default:
      return null;
  }
}
type OrderPageData = Page<Order> & { page: number; openOrderCount: number };
const manufacturingSections: Record<
  ManufacturingPageKey,
  { title: string; description: string }
> = {
  "manufacturing-recipes": {
    title: "Tanımlı reçeteler",
    description:
      "Tanımlı ürün reçetelerini arayın, düzenleyin ve durumlarını yönetin.",
  },
  "manufacturing-recipe-create": {
    title: "Reçete oluştur",
    description:
      "Mamul bileşenlerini, fire oranlarını ve operasyon rotalarını tanımlayın.",
  },
  "manufacturing-work-centers": {
    title: "İş merkezleri",
    description:
      "Üretim kapasitesini, işçilik ve genel gider maliyetlerini tanımlayın.",
  },
  "manufacturing-work-center-create": {
    title: "İş merkezi tanımla",
    description: "Kapasiteyi ve saatlik üretim maliyetlerini kaydedin.",
  },
  "manufacturing-orders": {
    title: "Üretim emirleri",
    description:
      "Emirleri planlayın, kapasiteye çizelgeleyin ve üretim adımlarını izleyin.",
  },
  "manufacturing-order-create": {
    title: "Yeni üretim emri",
    description: "Reçeteyi, depoyu ve planlanan üretim miktarını tanımlayın.",
  },
  "manufacturing-mrp": {
    title: "Malzeme planlama",
    description:
      "Talebi, mevcut stok ve tedarikle karşılaştırıp üretim önerilerini hazırlayın.",
  },
  "manufacturing-cost-variance": {
    title: "Maliyet analizi",
    description:
      "Üretim emirlerinin planlanan ve fiilî maliyetlerini karşılaştırın.",
  },
};
const statusLabel: Record<string, string> = {
  Planned: "Planlandı",
  Released: "Serbest bırakıldı",
  Completed: "Tamamlandı",
  Cancelled: "İptal edildi",
};
const operationStatusLabel: Record<string, string> = {
  Planned: "Bekliyor",
  InProgress: "Devam ediyor",
  Completed: "Tamamlandı",
};
const decimalText = (value: number, digits = 2) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value);
/** Actual minutes once an operation is completed, planned minutes before that. */
const operationMinutes = (operation: OrderOperation) =>
  operation.status === "Completed"
    ? (operation.actualSetupMinutes ?? 0) + (operation.actualRunMinutes ?? 0)
    : operation.setupMinutes + operation.runMinutes;
const formatBaseAmount = (amount: number, code: string) => {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(amount)} ${code}`;
  }
};
const localDateInputValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const minuteTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const secondTime = (second: number) =>
  `${minuteTime(Math.floor(second / 60))}:${String(second % 60).padStart(2, "0")}`;
const timeMinute = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

const MANUFACTURING_CHANGED_EVENT = "nexora:manufacturing-changed";

/** Default widths of the Üretim emirleri columns (tenant widths win), sized to fit beside the detail panel. */
const ORDER_LIST_WIDTHS: Record<string, number> = {
  code: 126,
  plannedDate: 92,
  billOfMaterialName: 272,
  warehouseName: 126,
  plannedQuantity: 92,
  productionSource: 130,
  components: 118,
  status: 124,
};
const ORDER_NUMBER_FIELDS: ReadonlySet<string> = new Set(["plannedQuantity"]);
const ORDER_CODE_FIELDS: ReadonlySet<string> = new Set(["code"]);

export default function ManufacturingPage({
  token,
  section,
  onNavigate,
  createOrderPage = false,
}: {
  token: string;
  section: ManufacturingPageKey;
  onNavigate: (page: ManufacturingPageKey) => void;
  createOrderPage?: boolean;
}) {
  const sectionLoadGeneration = useRef(0);
  /** Set by "Kaydet ve Yeni": keep the recipe form open after a successful create. */
  const stayAfterBomSave = useRef(false);
  const refreshRequestGeneration = useRef(0);
  const mutationEpoch = useRef(0);
  const calendarSelectionGeneration = useRef(0);
  const selectedCalendarCenterId = useRef("");
  const calendarReadyGeneration = useRef(-1);
  const setupRulesReadyGeneration = useRef(-1);
  const workCenterSaveGeneration = useRef(0);
  const workCenterSettingsSavePending = useRef(false);
  const mrpRequestGeneration = useRef(0);
  const stockItemSearchGeneration = useRef(0);
  const stockItemSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const stockItemSearchAbort = useRef<AbortController | null>(null);
  const activeSection = useRef(section);
  const captureMutationEpoch = () => ({
    epoch: mutationEpoch.current,
    section,
  });
  const mutationIsCurrent = (captured: {
    epoch: number;
    section: ManufacturingPageKey;
  }) =>
    captured.epoch === mutationEpoch.current &&
    captured.section === activeSection.current;
  const beginMrpRequest = () => ({
    ...captureMutationEpoch(),
    generation: ++mrpRequestGeneration.current,
  });
  const mrpRequestIsCurrent = (captured: {
    epoch: number;
    section: ManufacturingPageKey;
    generation: number;
  }) =>
    captured.section === "manufacturing-mrp" &&
    mutationIsCurrent(captured) &&
    captured.generation === mrpRequestGeneration.current;

  const [items, setItems] = useState<Item[]>([]),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]),
    [workCenters, setWorkCenters] = useState<WorkCenter[]>([]),
    [boms, setBoms] = useState<Bom[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [employees, setEmployees] = useState<Employee[]>([]),
    [sourceSalesOrders, setSourceSalesOrders] = useState<SourceSalesOrderOption[]>([]),
    [sourceSalesOrderLines, setSourceSalesOrderLines] = useState<SourceSalesOrderLine[]>([]),
    [productionMode, setProductionMode] = useState<"Stock" | "SalesOrder">("Stock"),
    [sourceSalesOrderId, setSourceSalesOrderId] = useState(""),
    [sourceSalesOrderLineNumber, setSourceSalesOrderLineNumber] = useState(""),
    [ordersTotalCount, setOrdersTotalCount] = useState(0),
    [openOrdersCount, setOpenOrdersCount] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState(""),
    [orderPage, setOrderPage] = useState(1),
    [orderSearchDraft, setOrderSearchDraft] = useState(""),
    [orderSearch, setOrderSearch] = useState(""),
    [orderStatus, setOrderStatus] = useState("");
  const orderPageSize = 25,
    pageOrders = orders;
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  const [editingBomId, setEditingBomId] = useState(""),
    [recipeSearch, setRecipeSearch] = useState(""),
    [recipeStatus, setRecipeStatus] = useState(""),
    [workCenterStatus, setWorkCenterStatus] = useState(""),
    [workCenterSearch, setWorkCenterSearch] = useState(""),
    [completingOperationId, setCompletingOperationId] = useState(""),
    [expandedBomOperations, setExpandedBomOperations] = useState<
      Record<number, boolean>
    >({}),
    // Section of the recipe form (navigator: Kimlik, Bileşenler, Rota).
    [recipeTab, setRecipeTab] = useState("identity"),
    [workCenterTab, setWorkCenterTab] = useState<
      "calendar" | "general" | "exceptions"
    >("calendar"),
    [recipePage, setRecipePage] = useState(1);
  const [workCenterToolsSlot, setWorkCenterToolsSlot] =
    useState<HTMLDivElement | null>(null);
  const [orderToolsSlot, setOrderToolsSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [product, setProduct] = useState(""),
    [output, setOutput] = useState("1"),
    [components, setComponents] = useState([
      { stockItemId: "", quantity: "1", scrap: "0", standardUnitCostBase: "0" },
    ]);
  const [bomOperations, setBomOperations] = useState<
    {
      workCenterId: string;
      setupMinutes: string;
      runMinutesPerOutputUnit: string;
      minimumWaitDaysAfterPrevious: string;
      setupFamilyCode: string;
      plannedEnergyKwhPerOutput: string;
      plannedEnergyCostPerKwhBase: string;
      alternateWorkCenterIds: string[];
    }[]
  >([]);
  const [wcCode, setWcCode] = useState(""),
    [wcName, setWcName] = useState(""),
    [wcCapacity, setWcCapacity] = useState("480"),
    [wcLabor, setWcLabor] = useState("0"),
    [wcOverhead, setWcOverhead] = useState("0");
  // İş merkezleri definition screen: Yeni (F2) opens the create form in the right pane.
  const [wcCreating, setWcCreating] = useState(false);
  const workCenterDefRef = useRef<HTMLDivElement>(null);
  const [calendarReloadKey, setCalendarReloadKey] = useState(0);
  const [calendarCenterId, setCalendarCenterId] = useState(""),
    [calendarMask, setCalendarMask] = useState(127),
    [calendarShiftStart, setCalendarShiftStart] = useState("08:00"),
    [calendarShiftEnd, setCalendarShiftEnd] = useState("16:00"),
    [calendarOverrides, setCalendarOverrides] = useState<
      WorkCenterCalendar["capacityOverrides"]
    >([]),
    [annualCapacityRules, setAnnualCapacityRules] = useState<
      AnnualCapacityRule[]
    >([]),
    [annualMonth, setAnnualMonth] = useState(String(new Date().getMonth() + 1)),
    [annualDay, setAnnualDay] = useState(String(new Date().getDate())),
    [annualCapacity, setAnnualCapacity] = useState("0"),
    [annualNote, setAnnualNote] = useState(""),
    [calendarDate, setCalendarDate] = useState(""),
    [calendarCapacity, setCalendarCapacity] = useState("0"),
    [calendarNote, setCalendarNote] = useState(""),
    [calendarLoading, setCalendarLoading] = useState(false),
    [calendarReady, setCalendarReady] = useState(false);
  const [shiftRotations, setShiftRotations] = useState<ShiftRotation[]>([]),
    [rotationFrom, setRotationFrom] = useState(localDateInputValue()),
    [rotationTo, setRotationTo] = useState(""),
    [rotationLength, setRotationLength] = useState("2"),
    [rotationStart, setRotationStart] = useState("08:00"),
    [rotationEnd, setRotationEnd] = useState("16:00"),
    [rotationCapacity, setRotationCapacity] = useState("480"),
    [rotationNote, setRotationNote] = useState("");
  const [setupRules, setSetupRules] = useState<SetupRule[]>([]),
    [setupRulesReady, setSetupRulesReady] = useState(false);
  const [orderCode, setOrderCode] = useState(""),
    [bomId, setBomId] = useState(""),
    [warehouseId, setWarehouseId] = useState(""),
    [plannedQuantity, setPlannedQuantity] = useState("1"),
    [plannedDate, setPlannedDate] = useState(localDateInputValue());
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null),
    [finishedCode, setFinishedCode] = useState(""),
    [finishedExpiry, setFinishedExpiry] = useState(""),
    [finishedSerials, setFinishedSerials] = useState(""),
    [actualGoodQuantity, setActualGoodQuantity] = useState(""),
    [scrapQuantity, setScrapQuantity] = useState("0"),
    [scrapReason, setScrapReason] = useState("");
  const [actualTimes, setActualTimes] = useState<
    Record<
      string,
      { setup: string; run: string; energyKwh: string; energyRate: string; employeeId: string }
    >
  >({});
  const [orderScreenFields, setOrderScreenFields] = useState<ScreenViewField[]>(
    [
      { key: "code", label: "Üretim emri", visible: true, position: 0 },
      { key: "plannedDate", label: "Plan tarihi", visible: true, position: 1 },
      {
        key: "billOfMaterialName",
        label: "Reçete / rota ve fiili süre",
        visible: true,
        position: 2,
      },
      { key: "warehouseName", label: "Depo", visible: true, position: 3 },
      {
        key: "plannedQuantity",
        label: "Planlanan miktar",
        visible: true,
        position: 4,
      },
      { key: "productionSource", label: "Üretim türü / sipariş", visible: true, position: 5 },
      { key: "components", label: "Bileşenler", visible: true, position: 6 },
      { key: "status", label: "Durum", visible: true, position: 7 },
      {
        key: "actions",
        label: "İşlem",
        visible: true,
        position: 8,
        fixed: true,
      },
    ],
  );
  const defaultMrpFields: ScreenViewField[] = [
    { key: "stockItem", label: "Stok kartı", visible: true, position: 0 },
    { key: "level", label: "Seviye", visible: true, position: 1 },
    {
      key: "grossRequirement",
      label: "Brüt ihtiyaç",
      visible: true,
      position: 2,
    },
    {
      key: "onHandAndReserved",
      label: "Stok / rezerve",
      visible: true,
      position: 3,
    },
    {
      key: "openPurchaseOrders",
      label: "Açık satın alma",
      visible: true,
      position: 4,
    },
    {
      key: "openManufacturingOrders",
      label: "Açık üretim",
      visible: true,
      position: 5,
    },
    { key: "netRequirement", label: "Net ihtiyaç", visible: true, position: 6 },
    {
      key: "requiredByDate",
      label: "Gerekli tarih",
      visible: true,
      position: 7,
    },
    {
      key: "recommendedOrderDate",
      label: "Sipariş / üretim tarihi",
      visible: true,
      position: 8,
    },
    { key: "recommendation", label: "Öneri", visible: true, position: 9 },
  ];
  const [mrpScreenFields, setMrpScreenFields] =
    useState<ScreenViewField[]>(defaultMrpFields);
  const [workCenterScreenFields, setWorkCenterScreenFields] = useState<
    ScreenViewField[]
  >(defaultWorkCenterFields);
  const [recipeScreenFields, setRecipeScreenFields] =
    useState<ScreenViewField[]>(defaultRecipeFields);
  const visibleWorkCenterFields = workCenterScreenFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const visibleMrpFields = mrpScreenFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const [mrpPlanDate, setMrpPlanDate] = useState(localDateInputValue),
    [mrpDemands, setMrpDemands] = useState<
      { stockItemId: string; quantity: string; requiredByDate: string }[]
    >([
      { stockItemId: "", quantity: "1", requiredByDate: localDateInputValue() },
    ]),
    [mrpPlan, setMrpPlan] = useState<MrpPlan | null>(null),
    [mrpHistory, setMrpHistory] = useState<MrpPlanHistory[]>([]),
    [mrpSelected, setMrpSelected] = useState<number[]>([]),
    [mrpBomSelections, setMrpBomSelections] = useState<Record<number, string>>(
      {},
    ),
    [purchaseRequestFields, setPurchaseRequestFields] = useState<
      PurchaseRequestField[]
    >([]),
    [purchaseRequestFieldValues, setPurchaseRequestFieldValues] = useState<
      Record<string, string>
    >({});
  const filledMrpDemands = mrpDemands.filter(
    (x) => x.stockItemId && x.requiredByDate,
  );
  const hasDuplicateMrpDemand =
    new Set(filledMrpDemands.map((x) => `${x.stockItemId}|${x.requiredByDate}`))
      .size < filledMrpDemands.length;
  const hasDuplicateSetupRule =
    new Set(
      setupRules.map(
        (x) =>
          `${x.fromSetupFamilyCode.trim().toUpperCase()}|${x.toSetupFamilyCode.trim().toUpperCase()}`,
      ),
    ).size < setupRules.length;
  const instanceId = useRef(Math.random().toString(36).slice(2));
  const silentRefresh = useRef(false);
  const request = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const method = (init?.method ?? "GET").toUpperCase(),
        r = await authenticatedFetch(url, token, init);
      if (!r.ok) {
        if (r.status === 403) {
          const path = url.split("?")[0],
            tail =
              path.replace(/\/+$/, "").split("/").pop()?.toLowerCase() ?? "";
          const action =
            method === "GET" || method === "HEAD"
              ? "read"
              : method === "PUT" || method === "PATCH"
                ? "update"
                : method === "DELETE"
                  ? "delete"
                  : method === "POST" &&
                      [
                        "release",
                        "schedule",
                        "start",
                        "complete",
                        "cancel",
                        "deactivate",
                        "convert",
                      ].includes(tail)
                    ? "execute"
                    : "create";
          const resource = path.startsWith("/api/manufacturing/")
            ? "erp.manufacturing"
            : path.startsWith("/api/stock/items")
              ? "erp.stock-items"
              : path.startsWith("/api/warehouses/")
                ? "erp.warehouses"
                : path.startsWith("/api/purchasing/requests/")
                  ? "erp.purchase-requests"
                  : null;
          const permission = resource ? `${resource}.${action}` : null;
          const label =
            path.includes("/work-centers/") && path.endsWith("/calendar")
              ? "İş merkezi takvimi"
              : path.includes("/work-centers/") && path.endsWith("/setup-rules")
                ? "İş merkezi kurulum kuralları"
                : path.includes("/work-centers")
                  ? "İş merkezleri"
                  : path.includes("/boms")
                    ? "Ürün reçeteleri"
                    : path.includes("/orders")
                      ? "Üretim emirleri"
                      : path.startsWith("/api/stock/items")
                        ? "Stok kartları"
                        : path.startsWith("/api/warehouses/")
                          ? "Depolar"
                          : path.startsWith("/api/purchasing/requests/")
                            ? "Satın alma talepleri"
                            : "Üretim verileri";
          throw new Error(
            `Erişim reddedildi. ${label} için seçili firmada gerekli yetki bulunmuyor.${permission ? ` Gerekli izin: ${permission}.` : ""} Firma yöneticinizden izinlerinizi kontrol etmesini isteyin.`,
          );
        }
        const body = (await r.json().catch(() => null)) as {
          error?: string;
          title?: string;
          errors?: Record<string, string[]>;
        } | null;
        const detail =
          body?.error ||
          Object.values(body?.errors ?? {})
            .flat()
            .join(" ") ||
          problemDetail(body);
        throw new Error(detail || `İstek başarısız (${r.status})`);
      }
      const result =
        r.status === 204 ? (undefined as T) : await (r.json() as Promise<T>);
      // Other open manufacturing tabs (keep-alive views) refresh their lists after a successful write,
      // e.g. a work center created in one tab appears in the recipe form's picker in another.
      if (method !== "GET" && method !== "HEAD" && url.startsWith("/api/manufacturing/"))
        window.dispatchEvent(
          new CustomEvent(MANUFACTURING_CHANGED_EVENT, { detail: { source: instanceId.current } }),
        );
      return result;
    },
    [token],
  );
  const searchStockItems = useCallback(
    (rawQuery: string) => {
      const generation = ++stockItemSearchGeneration.current;
      if (stockItemSearchTimer.current)
        clearTimeout(stockItemSearchTimer.current);
      stockItemSearchAbort.current?.abort();
      stockItemSearchAbort.current = null;
      const query = rawQuery.trim();
      if (query.length < 2) return;
      stockItemSearchTimer.current = setTimeout(() => {
        const controller = new AbortController();
        stockItemSearchAbort.current = controller;
        void request<Page<Item>>(
          `/api/stock/items/?page=1&pageSize=100&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        )
          .then((result) => {
            if (generation !== stockItemSearchGeneration.current) return;
            setItems((current) => {
              const byId = new Map(current.map((item) => [item.id, item]));
              for (const item of result.items)
                if (item.isActive) byId.set(item.id, item);
              return [...byId.values()];
            });
          })
          .catch((e) => {
            if (generation === stockItemSearchGeneration.current)
              setError(`Stok kartı araması: ${(e as Error).message}`);
          });
      }, 250);
    },
    [request],
  );
  useEffect(
    () => () => {
      ++stockItemSearchGeneration.current;
      if (stockItemSearchTimer.current)
        clearTimeout(stockItemSearchTimer.current);
      stockItemSearchAbort.current?.abort();
    },
    [section],
  );
  const refresh = useCallback(async () => {
    const generation = sectionLoadGeneration.current;
    const requestGeneration = ++refreshRequestGeneration.current;
    const isCurrent = () =>
      generation === sectionLoadGeneration.current &&
      requestGeneration === refreshRequestGeneration.current;
    setLoading(true);
    // The recipe list gets product names and component details from the BOM endpoint.
    // Fetch the full stock catalog only on screens that actually need a stock picker.
    const needItems =
        section === "manufacturing-recipe-create" ||
        section === "manufacturing-mrp",
      needWarehouses =
        section === "manufacturing-recipes" ||
        section === "manufacturing-recipe-create" ||
        section === "manufacturing-orders" ||
        section === "manufacturing-mrp",
      needCenters =
        section === "manufacturing-recipes" ||
        section === "manufacturing-recipe-create" ||
        section === "manufacturing-work-centers" ||
        section === "manufacturing-work-center-create" ||
        section === "manufacturing-orders" ||
        section === "manufacturing-mrp",
      needBoms =
        section === "manufacturing-recipes" ||
        section === "manufacturing-recipe-create" ||
        section === "manufacturing-orders" ||
        section === "manufacturing-mrp",
      needOrders = section === "manufacturing-orders";
    const load = async <T,>(
      enabled: boolean,
      url: string,
      label: string,
    ): Promise<{ data: T | null; error: string | null }> => {
      if (!enabled) return { data: null, error: null };
      try {
        return { data: await request<T>(url), error: null };
      } catch (e) {
        return { data: null, error: `${label}: ${(e as Error).message}` };
      }
    };
    const loadStockItemPage = async (): Promise<Item[]> => {
      const first = await request<Page<Item>>(
        "/api/stock/items/?page=1&pageSize=100",
      );
      return first.items;
    };
    const [stock, wh, centers, bomRows, orderRows, employeeRows, sourceOrders] = await Promise.all([
      needItems
        ? loadStockItemPage()
            .then((data) => ({ data, error: null as string | null }))
            .catch((e) => ({
              data: null,
              error: `Stok kartları: ${(e as Error).message}`,
            }))
        : Promise.resolve({ data: null, error: null }),
      load<Warehouse[]>(needWarehouses, "/api/warehouses/", "Depolar"),
      load<WorkCenter[]>(
        needCenters,
        "/api/manufacturing/work-centers/",
        "İş merkezleri",
      ),
      load<Bom[]>(needBoms, "/api/manufacturing/boms/", "Reçeteler"),
      load<OrderPageData>(
        needOrders,
        `/api/manufacturing/orders/?page=${orderPage}&pageSize=${orderPageSize}&q=${encodeURIComponent(orderSearch)}&status=${encodeURIComponent(orderStatus)}`,
        "Üretim emirleri",
      ),
      load<Employee[]>(needOrders, "/api/hr/employees/", "Personel listesi"),
      load<{ items: SourceSalesOrderOption[] }>(needOrders && createOrderPage,
        "/api/sales/orders/?page=1&pageSize=100", "Satış siparişleri"),
    ]);
    const failures = [
      stock.error,
      wh.error,
      centers.error,
      bomRows.error,
      orderRows.error,
      employeeRows.error,
      sourceOrders.error,
    ].filter((x): x is string => Boolean(x));
    if (!isCurrent()) return;
    // A background refresh triggered by another tab stays silent; the user didn't ask for it.
    if (!silentRefresh.current) setError(failures.join(" · "));
    if (stock.data) setItems(stock.data.filter((x) => x.isActive));
    else if (needItems) setItems([]);
    if (wh.data) setWarehouses(wh.data.filter((x) => x.isActive));
    else if (needWarehouses) setWarehouses([]);
    if (centers.data) setWorkCenters(centers.data);
    else if (needCenters) setWorkCenters([]);
    if (bomRows.data) setBoms(bomRows.data);
    else if (needBoms) setBoms([]);
    if (orderRows.data) {
      // Keep list state array-shaped even if a stale or partial API payload omits `items`.
      const rows = Array.isArray(orderRows.data.items)
        ? orderRows.data.items
        : [];
      setOrders(rows);
      setOrdersTotalCount(
        Number.isFinite(orderRows.data.totalCount)
          ? orderRows.data.totalCount
          : rows.length,
      );
      setOpenOrdersCount(
        Number.isFinite(orderRows.data.openOrderCount)
          ? orderRows.data.openOrderCount
          : null,
      );
    } else if (needOrders) {
      setOrders([]);
      setOrdersTotalCount(0);
      setOpenOrdersCount(null);
    }
    if (employeeRows.data) setEmployees(employeeRows.data.filter((x) => x.status === "Active"));
    else if (needOrders) setEmployees([]);
    if (sourceOrders.data) setSourceSalesOrders(sourceOrders.data.items.filter((x) => x.status === "Open"));
    else if (needOrders && createOrderPage) setSourceSalesOrders([]);
    setLoading(false);
  }, [request, section, orderPage, orderSearch, orderStatus]);
  useEffect(() => {
    const generation = ++sectionLoadGeneration.current;
    setBusy(false);
    setLoading(true);
    setError("");
    setNotice("");
    void refresh().catch((e) => {
      if (generation === sectionLoadGeneration.current) {
        setError((e as Error).message);
        setLoading(false);
      }
    });
    return () => {
      if (generation === sectionLoadGeneration.current)
        sectionLoadGeneration.current++;
    };
  }, [refresh]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const onChanged = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      if (source === instanceId.current) return;
      // Lists only: form inputs live in their own state and are not reset by refresh().
      silentRefresh.current = true;
      void refreshRef
        .current()
        .catch(() => undefined)
        .finally(() => {
          silentRefresh.current = false;
        });
    };
    window.addEventListener(MANUFACTURING_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(MANUFACTURING_CHANGED_EVENT, onChanged);
  }, []);
  useEffect(() => {
    if (!ordersTotalCount) {
      setSelectedOrderId("");
      if (orderPage !== 1) setOrderPage(1);
      return;
    }
    const page = Math.min(
      orderPage,
      Math.max(1, Math.ceil(ordersTotalCount / orderPageSize)),
    );
    if (page !== orderPage) {
      setOrderPage(page);
      return;
    }
    // The current row is the one the user chose (click, ↑/↓); a row that left the page is dropped, none is picked.
    if (selectedOrderId && !pageOrders.some((order) => order.id === selectedOrderId))
      setSelectedOrderId("");
  }, [orders, ordersTotalCount, orderPage, selectedOrderId]);
  useEffect(() => {
    if (section !== "manufacturing-orders") return;
    let active = true;
    void request<{ fields: ScreenViewField[] }>(
      "/api/screen-views/manufacturing-orders/active",
    )
      .then((view) => {
        if (active && view.fields?.length) setOrderScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request, section]);
  useEffect(() => {
    if (section !== "manufacturing-work-centers") return;
    let active = true;
    void request<{ fields: ScreenViewField[] }>(
      "/api/screen-views/manufacturing-work-centers/active",
    )
      .then((view) => {
        if (active && view.fields?.length)
          setWorkCenterScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request, section]);
  useEffect(() => {
    if (section !== "manufacturing-recipes") return;
    let active = true;
    void request<{ fields: ScreenViewField[] }>(
      "/api/screen-views/manufacturing-recipes/active",
    )
      .then((view) => {
        if (active && view.fields?.length) setRecipeScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request, section]);
  useEffect(() => {
    if (section !== "manufacturing-mrp") return;
    let active = true;
    void request<{ fields: ScreenViewField[] }>(
      "/api/screen-views/manufacturing-mrp-lines/active",
    )
      .then((view) => {
        if (active && view.fields?.length) setMrpScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request, section]);
  useLayoutEffect(() => {
    activeSection.current = section;
    mutationEpoch.current++;
    return () => {
      mutationEpoch.current++;
      workCenterSettingsSavePending.current = false;
    };
  }, [section]);
  // G-U20: the recipe list system page opens this legacy recipe card with the page param `bomId` (erpPage `params` +
  // `legacyScreen`). Once the BOM list is loaded the card opens that recipe for editing and drops only that param, so
  // the next visit starts clean and an open tab re-reads it when it is opened again with another recipe.
  const recipeParamsPage = section === "manufacturing-recipe-create" ? section : undefined;
  const recipeParams = usePageParams(recipeParamsPage);
  // The param is dropped once read: the recipe card reports the recipe it edits, so deleting that recipe closes the tab.
  useTabRecord(recipeParamsPage, editingBomId);
  useEffect(() => {
    if (!recipeParamsPage || loading) return;
    // Read the store, not the render's snapshot: a re-run effect (StrictMode) must not open the recipe twice.
    const paramBomId = pageParamsOf(recipeParamsPage).bomId;
    if (!paramBomId) return;
    dropPageParam(recipeParamsPage, "bomId");
    const bom = boms.find((candidate) => candidate.id === paramBomId);
    if (bom) beginEditBom(bom);
    else {
      resetBomForm();
      setError((current) => current || "Reçete bulunamadı; silinmiş olabilir.");
    }
    // beginEditBom / resetBomForm only set state.
  }, [recipeParamsPage, recipeParams, loading, boms]);
  // Definition screen: no work centre is opened by itself (the user picks one); one that left the list is dropped.
  useEffect(() => {
    if (
      section === "manufacturing-work-centers" &&
      !loading &&
      calendarCenterId &&
      !workCenters.some((x) => x.id === calendarCenterId)
    )
      changeCalendarCenter("");
  }, [section, workCenters, calendarCenterId, loading]);
  // Esc = Vazgeç on the definition screen: closes the create form or the open work centre (and the drawer below 1280px).
  useEffect(() => {
    if (section !== "manufacturing-work-centers" || (!wcCreating && !calendarCenterId)) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const root = workCenterDefRef.current;
      if (!root || root.closest("[hidden]")) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role='dialog'], [role='alertdialog'], [role='listbox'], [role='menu']") || document.querySelector("dialog[open]")) return;
      // An open record's calendar / rule fields have no discard prompt: Esc while typing there does not close it.
      if (!wcCreating && target?.closest("input, select, textarea")) return;
      event.preventDefault();
      void closeWorkCenterPane();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  useEffect(() => {
    if (section !== "manufacturing-work-centers" || !calendarCenterId) return;
    let active = true;
    const centerId = calendarCenterId,
      selectionGeneration = calendarSelectionGeneration.current;
    const isCurrent = () =>
      active &&
      activeSection.current === "manufacturing-work-centers" &&
      centerId === selectedCalendarCenterId.current &&
      selectionGeneration === calendarSelectionGeneration.current;
    setCalendarReady(false);
    setCalendarMask(127);
    setCalendarOverrides([]);
    setAnnualCapacityRules([]);
    setShiftRotations([]);
    setCalendarLoading(true);
    void request<WorkCenterCalendar>(
      `/api/manufacturing/work-centers/${centerId}/calendar`,
    )
      .then((data) => {
        if (isCurrent()) {
          setCalendarMask(data.workingDaysMask);
          setCalendarShiftStart(minuteTime(data.shiftStartMinuteOfDay));
          setCalendarShiftEnd(minuteTime(data.shiftEndMinuteOfDay));
          setCalendarOverrides(data.capacityOverrides);
          setAnnualCapacityRules(data.annualCapacityRules ?? []);
          setShiftRotations(data.shiftRotations ?? []);
          calendarReadyGeneration.current = selectionGeneration;
          setCalendarReady(true);
        }
      })
      .catch((e) => {
        if (isCurrent()) setError((e as Error).message);
      })
      .finally(() => {
        if (isCurrent()) setCalendarLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, section, calendarCenterId, calendarReloadKey]);
  useEffect(() => {
    if (section !== "manufacturing-work-centers" || !calendarCenterId) return;
    let active = true;
    const centerId = calendarCenterId,
      selectionGeneration = calendarSelectionGeneration.current;
    const isCurrent = () =>
      active &&
      activeSection.current === "manufacturing-work-centers" &&
      centerId === selectedCalendarCenterId.current &&
      selectionGeneration === calendarSelectionGeneration.current;
    setSetupRulesReady(false);
    void request<SetupRule[]>(
      `/api/manufacturing/work-centers/${centerId}/setup-rules`,
    )
      .then((data) => {
        if (isCurrent()) {
          setSetupRules(data);
          setupRulesReadyGeneration.current = selectionGeneration;
          setSetupRulesReady(true);
        }
      })
      .catch((e) => {
        if (isCurrent()) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [request, section, calendarCenterId]);
  function resetBomForm() {
    setRecipeTab("identity");
    setEditingBomId("");
    setCode("");
    setName("");
    setProduct("");
    setOutput("1");
    setComponents([
      { stockItemId: "", quantity: "1", scrap: "0", standardUnitCostBase: "0" },
    ]);
    setBomOperations([]);
  }
  function beginEditBom(bom: Bom) {
    setRecipeTab("identity");
    setEditingBomId(bom.id);
    setCode(bom.code);
    setName(bom.name);
    setProduct(bom.productStockItemId);
    setOutput(String(bom.outputQuantity));
    setComponents(
      bom.lines.map((line) => ({
        stockItemId: line.componentStockItemId,
        quantity: String(line.quantity),
        scrap: String(line.scrapPercent),
        standardUnitCostBase: String(line.standardUnitCostBase),
      })),
    );
    setBomOperations(
      bom.operations.map((operation) => ({
        workCenterId: operation.workCenterId,
        setupMinutes: String(operation.setupMinutes),
        runMinutesPerOutputUnit: String(operation.runMinutesPerOutputUnit),
        minimumWaitDaysAfterPrevious: String(
          operation.minimumWaitDaysAfterPrevious,
        ),
        setupFamilyCode: operation.setupFamilyCode,
        plannedEnergyKwhPerOutput: String(operation.plannedEnergyKwhPerOutput),
        plannedEnergyCostPerKwhBase: String(
          operation.plannedEnergyCostPerKwhBase,
        ),
        alternateWorkCenterIds: operation.eligibleWorkCenterIds.filter(
          (id) => id !== operation.workCenterId,
        ),
      })),
    );
    setError("");
    setNotice("");
    onNavigate("manufacturing-recipe-create");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function saveBom(e: FormEvent) {
    e.preventDefault();
    const captured = captureMutationEpoch(),
      editing = boms.find((x) => x.id === editingBomId);
    if (editingBomId && !editing) return;
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      code,
      name,
      productStockItemId: product,
      outputQuantity: Number(output),
      lines: components.map((x) => ({
        componentStockItemId: x.stockItemId,
        quantity: Number(x.quantity),
        scrapPercent: Number(x.scrap),
        standardUnitCostBase: Number(x.standardUnitCostBase),
      })),
      operations: bomOperations.map((x, i) => ({
        sequence: i + 1,
        workCenterId: x.workCenterId,
        setupMinutes: Number(x.setupMinutes),
        runMinutesPerOutputUnit: Number(x.runMinutesPerOutputUnit),
        minimumWaitDaysAfterPrevious: Number(x.minimumWaitDaysAfterPrevious),
        setupFamilyCode: x.setupFamilyCode,
        plannedEnergyKwhPerOutput: Number(x.plannedEnergyKwhPerOutput),
        plannedEnergyCostPerKwhBase: Number(x.plannedEnergyCostPerKwhBase),
        eligibleWorkCenterIds: [
          ...new Set([x.workCenterId, ...x.alternateWorkCenterIds]),
        ],
      })),
    };
    try {
      await request(
        editing
          ? `/api/manufacturing/boms/${editing.id}`
          : "/api/manufacturing/boms/",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(
            editing ? { ...payload, rowVersion: editing.rowVersion } : payload,
          ),
        },
      );
      if (!mutationIsCurrent(captured)) return;
      resetBomForm();
      setNotice(
        editing ? "Ürün reçetesi güncellendi." : "Ürün reçetesi oluşturuldu.",
      );
      await refresh();
      if (!editing && stayAfterBomSave.current) return;
      onNavigate("manufacturing-recipes");
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  async function changeBomState(bom: Bom) {
    const captured = captureMutationEpoch();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/manufacturing/boms/${bom.id}/${bom.isActive ? "deactivate" : "activate"}`,
        { method: "POST", body: "{}" },
      );
      if (!mutationIsCurrent(captured)) return;
      setNotice(
        bom.isActive
          ? "Ürün reçetesi pasife alındı."
          : "Ürün reçetesi etkinleştirildi.",
      );
      await refresh();
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  async function deleteBom(bom: Bom) {
    if (
      bom.orderCount > 0 ||
      !(await confirmDialog({
        title: "Ürün reçetesi kalıcı olarak silinsin mi?",
        message: `${bom.code} · ${bom.name} reçetesi kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
        tone: "danger",
        confirmLabel: "Kalıcı olarak sil",
      }))
    )
      return;
    const captured = captureMutationEpoch();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/manufacturing/boms/${bom.id}`, { method: "DELETE" });
      if (!mutationIsCurrent(captured)) return;
      if (editingBomId === bom.id) resetBomForm();
      setNotice(`${bom.code} reçetesi silindi.`);
      await refresh();
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  /** `onCreated`: the definition screen's pane closes the form and opens the new record instead of the notice. */
  async function createWorkCenter(e: FormEvent, onCreated?: (id: string | undefined) => void) {
    e.preventDefault();
    const captured = captureMutationEpoch();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await request<{ id?: string } | undefined>("/api/manufacturing/work-centers/", {
        method: "POST",
        body: JSON.stringify({
          code: wcCode,
          name: wcName,
          capacityMinutesPerDay: Number(wcCapacity),
          laborCostPerHourBase: Number(wcLabor),
          overheadCostPerHourBase: Number(wcOverhead),
        }),
      });
      if (!mutationIsCurrent(captured)) return;
      setWcCode("");
      setWcName("");
      if (onCreated) {
        onCreated(created?.id);
        return;
      }
      setNotice("İş merkezi oluşturuldu. Liste ekranına dönebilirsiniz.");
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  function changeCalendarCenter(centerId: string) {
    if (centerId === calendarCenterId) return;
    selectedCalendarCenterId.current = centerId;
    calendarSelectionGeneration.current++;
    calendarReadyGeneration.current = -1;
    setupRulesReadyGeneration.current = -1;
    workCenterSaveGeneration.current++;
    if (workCenterSettingsSavePending.current) {
      workCenterSettingsSavePending.current = false;
      setBusy(false);
    }
    setCalendarCenterId(centerId);
  }
  // İş merkezleri definition screen (list left, record right). The create form asks before a typed draft is dropped;
  // an open work centre's calendar / rule edits keep today's behaviour (switching rows does not ask).
  const workCenterDraftDirty = wcCreating && !!(wcCode.trim() || wcName.trim());
  async function confirmWorkCenterDiscard() {
    return (
      !workCenterDraftDirty ||
      (await confirmDialog({
        title: "İş merkezi",
        message: "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?",
        confirmLabel: "Devam",
      }))
    );
  }
  const focusWorkCenterList = () =>
    window.setTimeout(
      () => workCenterDefRef.current?.querySelector<HTMLElement>(".nx-def-list .advanced-grid-scroll")?.focus(),
      0,
    );
  async function closeWorkCenterPane() {
    if (!(await confirmWorkCenterDiscard())) return;
    setWcCreating(false);
    changeCalendarCenter("");
    focusWorkCenterList();
  }
  async function openWorkCenter(id: string) {
    if (id === calendarCenterId && !wcCreating) return;
    if (!(await confirmWorkCenterDiscard())) return;
    setWcCreating(false);
    changeCalendarCenter(id);
  }
  function startWorkCenterCreate() {
    setError("");
    setNotice("");
    changeCalendarCenter("");
    setWcCreating(true);
    window.setTimeout(
      () => document.getElementById("mfg-wc-create")?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus(),
      0,
    );
  }
  async function saveWorkCenterCalendar() {
    const selectionGeneration = calendarSelectionGeneration.current;
    if (
      !calendarCenterId ||
      !calendarReady ||
      calendarReadyGeneration.current !== selectionGeneration
    )
      return;
    const captured = captureMutationEpoch(),
      centerId = calendarCenterId,
      requestGeneration = ++workCenterSaveGeneration.current;
    const isCurrent = () =>
      mutationIsCurrent(captured) &&
      requestGeneration === workCenterSaveGeneration.current &&
      selectionGeneration === calendarSelectionGeneration.current &&
      centerId === calendarCenterId;
    workCenterSettingsSavePending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await request<WorkCenterCalendar>(
        `/api/manufacturing/work-centers/${centerId}/calendar`,
        {
          method: "PUT",
          body: JSON.stringify({
            workingDaysMask: calendarMask,
            shiftStartMinuteOfDay: timeMinute(calendarShiftStart),
            shiftEndMinuteOfDay: timeMinute(calendarShiftEnd),
            capacityOverrides: calendarOverrides,
            annualCapacityRules,
            shiftRotations,
          }),
        },
      );
      if (!isCurrent()) return;
      setCalendarMask(saved.workingDaysMask);
      setCalendarShiftStart(minuteTime(saved.shiftStartMinuteOfDay));
      setCalendarShiftEnd(minuteTime(saved.shiftEndMinuteOfDay));
      setCalendarOverrides(saved.capacityOverrides);
      setAnnualCapacityRules(saved.annualCapacityRules ?? []);
      setShiftRotations(saved.shiftRotations ?? []);
      setNotice("İş merkezi vardiyası ve çalışma takvimi kaydedildi.");
    } catch (e) {
      if (isCurrent()) setError((e as Error).message);
    } finally {
      if (isCurrent()) {
        workCenterSettingsSavePending.current = false;
        setBusy(false);
      }
    }
  }
  async function saveSetupRules() {
    const selectionGeneration = calendarSelectionGeneration.current;
    if (
      !calendarCenterId ||
      !setupRulesReady ||
      setupRulesReadyGeneration.current !== selectionGeneration
    )
      return;
    const captured = captureMutationEpoch(),
      centerId = calendarCenterId,
      requestGeneration = ++workCenterSaveGeneration.current;
    const isCurrent = () =>
      mutationIsCurrent(captured) &&
      requestGeneration === workCenterSaveGeneration.current &&
      selectionGeneration === calendarSelectionGeneration.current &&
      centerId === calendarCenterId;
    workCenterSettingsSavePending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await request<SetupRule[]>(
        `/api/manufacturing/work-centers/${centerId}/setup-rules`,
        { method: "PUT", body: JSON.stringify({ rules: setupRules }) },
      );
      if (!isCurrent()) return;
      setSetupRules(saved);
      setNotice(
        "Sıralı kurulum kuralları kaydedildi. Yeni üretim emirleri bu kural anlık görüntüsünü kullanır.",
      );
    } catch (e) {
      if (isCurrent()) setError((e as Error).message);
    } finally {
      if (isCurrent()) {
        workCenterSettingsSavePending.current = false;
        setBusy(false);
      }
    }
  }
  function addCapacityOverride(e: FormEvent) {
    e.preventDefault();
    if (!calendarReady || !calendarDate) return;
    setCalendarOverrides((rows) =>
      [
        ...rows.filter((x) => x.workDate !== calendarDate),
        {
          workDate: calendarDate,
          capacityMinutes: Number(calendarCapacity),
          note: calendarNote.trim() || null,
        },
      ].sort((a, b) => a.workDate.localeCompare(b.workDate)),
    );
    setCalendarDate("");
    setCalendarCapacity("0");
    setCalendarNote("");
  }
  function addAnnualCapacityRule(e: FormEvent) {
    e.preventDefault();
    if (!calendarReady) return;
    const month = Number(annualMonth),
      day = Number(annualDay),
      probe = new Date(Date.UTC(2000, month - 1, day));
    if (probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
      setError("Yıllık kapasite kuralı için geçerli bir ay ve gün girin.");
      return;
    }
    setError("");
    setAnnualCapacityRules((rows) =>
      [
        ...rows.filter((x) => x.month !== month || x.day !== day),
        {
          month,
          day,
          capacityMinutes: Number(annualCapacity),
          note: annualNote.trim() || null,
        },
      ].sort((a, b) => a.month - b.month || a.day - b.day),
    );
    setAnnualCapacity("0");
    setAnnualNote("");
  }
  function addShiftRotation(e: FormEvent) {
    e.preventDefault();
    if (!calendarReady) return;
    const length = Number(rotationLength),
      start = timeMinute(rotationStart),
      end = timeMinute(rotationEnd);
    if (!rotationFrom || length < 1 || length > 366 || end <= start) {
      setError(
        "Döngü 1–366 gün olmalı; başlangıç tarihi ve geçerli vardiya saatleri girin.",
      );
      return;
    }
    if (rotationTo && rotationTo < rotationFrom) {
      setError("Bitiş tarihi başlangıç tarihinden önce olamaz.");
      return;
    }
    const effectiveTo = rotationTo || null;
    const overlaps = shiftRotations.some(
      (row) =>
        (row.effectiveToDate === null || row.effectiveToDate >= rotationFrom) &&
        (effectiveTo === null || row.effectiveFromDate <= effectiveTo),
    );
    if (overlaps) {
      setError(
        "Vardiya planı tarih aralığı mevcut bir planla çakışıyor. Çakışmayan bir aralık seçin.",
      );
      return;
    }
    setError("");
    const days = Array.from({ length }, (_, dayIndex) => ({
      dayIndex,
      capacityMinutes: Number(rotationCapacity),
      shiftStartMinuteOfDay: start,
      shiftEndMinuteOfDay: end,
    }));
    setShiftRotations((rows) =>
      [
        ...rows,
        {
          effectiveFromDate: rotationFrom,
          effectiveToDate: effectiveTo,
          note: rotationNote.trim() || null,
          days,
        },
      ].sort((a, b) => a.effectiveFromDate.localeCompare(b.effectiveFromDate)),
    );
    setRotationTo("");
    setRotationNote("");
  }
  async function createOrder(e: FormEvent) {
    e.preventDefault();
    const captured = captureMutationEpoch();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/api/manufacturing/orders/", {
        method: "POST",
        body: JSON.stringify({
          code: orderCode,
          billOfMaterialId: bomId,
          warehouseId,
          plannedQuantity: Number(plannedQuantity),
          plannedDate,
          sourceSalesOrderId: productionMode === "SalesOrder" ? sourceSalesOrderId : null,
          sourceSalesOrderLineNumber: productionMode === "SalesOrder" ? Number(sourceSalesOrderLineNumber) : null,
        }),
      });
      if (!mutationIsCurrent(captured)) return;
      setOrderCode("");
      setProductionMode("Stock");
      setSourceSalesOrderId("");
      setSourceSalesOrderLineNumber("");
      setSourceSalesOrderLines([]);
      setNotice("Üretim emri planlandı.");
      await refresh();
      if (createOrderPage) onNavigate("manufacturing-orders");
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  async function selectSourceSalesOrder(id: string) {
    setSourceSalesOrderId(id);
    setSourceSalesOrderLineNumber("");
    setSourceSalesOrderLines([]);
    if (!id) return;
    setError("");
    try {
      const detail = await request<SourceSalesOrderDetail>(`/api/sales/orders/${id}`);
      setSourceSalesOrderLines(detail.lines.filter((line) => line.remainingQuantity > 0));
    } catch (e) {
      setError(`Satış siparişi satırları yüklenemedi: ${(e as Error).message}`);
    }
  }
  function selectSourceSalesOrderLine(lineNumber: string) {
    setSourceSalesOrderLineNumber(lineNumber);
    const line = sourceSalesOrderLines.find((x) => String(x.lineNumber) === lineNumber);
    if (!line) return;
    const matchingBom = boms.find((x) => x.isActive && x.productStockItemId === line.stockItemId);
    if (matchingBom) setBomId(matchingBom.id);
    setPlannedQuantity(String(line.remainingQuantity));
    const deliveryDate = sourceSalesOrders.find((x) => x.id === sourceSalesOrderId)?.requestedDeliveryDate;
    if (deliveryDate) setPlannedDate(deliveryDate);
  }
  async function transition(
    order: Order,
    action: "release" | "complete" | "cancel",
    finishedGoodsTracking?: {
      trackingCode: string;
      quantity: number;
      expiryDate: string | null;
    }[],
    productionActuals?: {
      actualGoodQuantity: number;
      scrapQuantity: number;
      scrapReason: string | null;
    },
  ) {
    const captured = captureMutationEpoch();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{
        costStatus?: string;
        totalCostBase?: number;
        baseCurrencyCode?: string;
      }>(`/api/manufacturing/orders/${order.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(
          action === "complete"
            ? { finishedGoodsTracking: finishedGoodsTracking ?? [], ...productionActuals }
            : {},
        ),
      });
      if (!mutationIsCurrent(captured)) return;
      setNotice(
        action === "complete"
          ? `Üretim tamamlandı.${result?.costStatus === "Valued" ? ` Mamul maliyeti: ${formatBaseAmount(result.totalCostBase ?? 0, result.baseCurrencyCode || "TRY")}.` : " Bileşen maliyetleri eksik; mamul girişi maliyetsiz kaydedildi."}`
          : action === "release"
            ? "Üretim emri serbest bırakıldı."
            : "Üretim emri iptal edildi.",
      );
      if (action === "complete") setTrackingOrder(null);
      await refresh();
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  function completeOrder(order: Order) {
    setTrackingOrder(order);
    setFinishedCode("");
    setFinishedExpiry("");
    setFinishedSerials("");
    setActualGoodQuantity(String(order.plannedQuantity));
    setScrapQuantity("0");
    setScrapReason("");
  }
  async function scheduleOrder(order: Order) {
    const captured = captureMutationEpoch();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request<Order>(`/api/manufacturing/orders/${order.id}/schedule`, {
        method: "POST",
        body: "{}",
      });
      if (!mutationIsCurrent(captured)) return;
      setNotice(`${order.code} için iş merkezi kapasitesi ayrıldı.`);
      await refresh();
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  async function startOperation(order: Order, operation: OrderOperation) {
    const captured = captureMutationEpoch();
    setBusy(true);
    setError("");
    try {
      await request<Order>(
        `/api/manufacturing/orders/${order.id}/operations/${operation.id}/start`,
        { method: "POST", body: "{}" },
      );
      if (!mutationIsCurrent(captured)) return;
      setNotice(`${operation.workCenterCode} operasyonu başlatıldı.`);
      await refresh();
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  async function completeOperation(order: Order, operation: OrderOperation) {
    const captured = captureMutationEpoch();
    const actual = actualTimes[operation.id] ?? {
      setup: String(operation.setupMinutes),
      run: String(operation.runMinutes),
      energyKwh: "0",
      energyRate: "0",
      employeeId: employees.length === 1 ? employees[0].id : "",
    };
    if (!actual.employeeId) {
      setError("Fiili operasyon kaydı için operatör/personel seçin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await request<Order>(
        `/api/manufacturing/orders/${order.id}/operations/${operation.id}/complete`,
        {
          method: "POST",
          body: JSON.stringify({
            actualSetupMinutes: Number(actual.setup),
            actualRunMinutes: Number(actual.run),
            actualEnergyQuantityKwh: Number(actual.energyKwh),
            actualEnergyCostPerKwhBase: Number(actual.energyRate),
            performedByEmployeeId: actual.employeeId,
          }),
        },
      );
      if (!mutationIsCurrent(captured)) return;
      // Show the completed operation at once from the response; the list refresh follows.
      if (updated?.id)
        setOrders((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setCompletingOperationId("");
      setNotice(
        `${operation.workCenterCode} operasyonunun fiili süre, enerji tüketimi ve maliyeti kaydedildi.`,
      );
      await refresh();
    } catch (e) {
      if (mutationIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mutationIsCurrent(captured)) setBusy(false);
    }
  }
  function updateActual(
    operation: OrderOperation,
    field: "setup" | "run" | "energyKwh" | "energyRate" | "employeeId",
    value: string,
  ) {
    setActualTimes((previous) => {
      const current = previous[operation.id] ?? {
        setup: String(operation.setupMinutes),
        run: String(operation.runMinutes),
        energyKwh: "0",
        energyRate: "0",
        employeeId: employees.length === 1 ? employees[0].id : "",
      };
      return { ...previous, [operation.id]: { ...current, [field]: value } };
    });
  }
  function submitFinishedTracking(e: FormEvent) {
    e.preventDefault();
    if (!trackingOrder) return;
    const mode =
      boms.find((x) => x.id === trackingOrder.billOfMaterialId)
        ?.productTrackingMode ?? "None";
    const goodQuantity = Number(actualGoodQuantity);
    const scrapQty = Number(scrapQuantity);
    if (
      !Number.isFinite(goodQuantity) ||
      !Number.isFinite(scrapQty) ||
      goodQuantity <= 0 ||
      scrapQty < 0 ||
      Math.round((goodQuantity + scrapQty) * 10000) !==
        Math.round(trackingOrder.plannedQuantity * 10000)
    ) {
      setError("İyi ürün ve fire miktarlarının toplamı planlanan miktara eşit olmalıdır.");
      return;
    }
    if (scrapQty > 0 && !scrapReason.trim()) {
      setError("Fire miktarı varsa fire nedeni girilmelidir.");
      return;
    }
    const actuals = {
      actualGoodQuantity: goodQuantity,
      scrapQuantity: scrapQty,
      scrapReason: scrapQty > 0 ? scrapReason.trim() : null,
    };
    if (mode === "Lot") {
      void transition(trackingOrder, "complete", [
        {
          trackingCode: finishedCode.trim(),
          quantity: goodQuantity,
          expiryDate: finishedExpiry || null,
        },
      ], actuals);
      return;
    }
    if (mode === "None") {
      void transition(trackingOrder, "complete", [], actuals);
      return;
    }
    const serials = finishedSerials
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    void transition(
      trackingOrder,
      "complete",
      serials.map((trackingCode) => ({
        trackingCode,
        quantity: 1,
        expiryDate: null,
      })),
      actuals,
    );
  }
  async function runMrp(e: FormEvent) {
    e.preventDefault();
    if (!warehouseId || mrpDemands.length === 0) return;
    const captured = beginMrpRequest();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const plan = await request<MrpPlan>("/api/manufacturing/mrp/plan", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          planDate: mrpPlanDate,
          demand: mrpDemands.map((x) => ({
            stockItemId: x.stockItemId,
            quantity: Number(x.quantity),
            requiredByDate: x.requiredByDate,
          })),
          includeOpenSalesOrders: true,
        }),
      });
      if (!mrpRequestIsCurrent(captured)) return;
      setMrpPlan(plan);
      setMrpSelected(
        plan.lines
          .map((x, i) =>
            x.issue === null && ["Üret", "Satın al"].includes(x.recommendation)
              ? i
              : -1,
          )
          .filter((i) => i >= 0),
      );
      setMrpBomSelections(
        Object.fromEntries(
          plan.lines.map((line, i) => [
            i,
            boms.find(
              (b) => b.isActive && b.productStockItemId === line.stockItemId,
            )?.id ?? "",
          ]),
        ),
      );
      setPurchaseRequestFieldValues({});
      const history = await request<MrpPlanHistory[]>(
        "/api/manufacturing/mrp/plans",
      );
      if (!mrpRequestIsCurrent(captured)) return;
      setMrpHistory(history);
      if (plan.lines.some((x) => x.recommendation === "Satın al")) {
        const fields = await request<PurchaseRequestField[]>(
          "/api/purchasing/requests/custom-fields",
        );
        if (!mrpRequestIsCurrent(captured)) return;
        setPurchaseRequestFields(fields);
      }
      setNotice("Zaman aşamalı malzeme ihtiyaç planı kaydedildi.");
    } catch (e) {
      if (mrpRequestIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mrpRequestIsCurrent(captured)) setBusy(false);
    }
  }
  async function openMrpPlan(id: string) {
    const captured = beginMrpRequest();
    setBusy(true);
    setError("");
    try {
      const plan = await request<MrpPlan>(`/api/manufacturing/mrp/plans/${id}`);
      if (!mrpRequestIsCurrent(captured)) return;
      setMrpPlan(plan);
      setMrpSelected(
        plan.lines
          .map((x, i) =>
            x.issue === null &&
            ["Üret", "Satın al"].includes(x.recommendation) &&
            !plan.convertedLineIndexes?.includes(i)
              ? i
              : -1,
          )
          .filter((i) => i >= 0),
      );
      setMrpBomSelections(
        Object.fromEntries(
          plan.lines.map((line, i) => [
            i,
            boms.find(
              (b) => b.isActive && b.productStockItemId === line.stockItemId,
            )?.id ?? "",
          ]),
        ),
      );
      if (plan.lines.some((x) => x.recommendation === "Satın al")) {
        const fields = await request<PurchaseRequestField[]>(
          "/api/purchasing/requests/custom-fields",
        );
        if (!mrpRequestIsCurrent(captured)) return;
        setPurchaseRequestFields(fields);
      }
      setNotice("Kaydedilmiş MRP planı açıldı.");
    } catch (e) {
      if (mrpRequestIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mrpRequestIsCurrent(captured)) setBusy(false);
    }
  }
  async function loadMrpHistory() {
    const captured = beginMrpRequest();
    setBusy(true);
    setError("");
    try {
      const history = await request<MrpPlanHistory[]>(
        "/api/manufacturing/mrp/plans",
      );
      if (!mrpRequestIsCurrent(captured)) return;
      setMrpHistory(history);
    } catch (e) {
      if (mrpRequestIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mrpRequestIsCurrent(captured)) setBusy(false);
    }
  }
  async function convertMrpPlan() {
    if (!mrpPlan?.planId || mrpSelected.length === 0) return;
    const captured = beginMrpRequest(),
      planId = mrpPlan.planId;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const lines = mrpSelected.map((lineIndex) => ({
        lineIndex,
        billOfMaterialId:
          mrpPlan.lines[lineIndex].recommendation === "Üret"
            ? mrpBomSelections[lineIndex] || null
            : null,
      }));
      const result = await request<{
        created: { resourceType: string; code: string }[];
      }>("/api/manufacturing/mrp/plans/" + planId + "/convert", {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          lines,
          purchaseRequestCustomFields: purchaseRequestFieldValues,
        }),
      });
      if (!mrpRequestIsCurrent(captured)) return;
      setNotice(
        `${result.created.length} MRP önerisi ilgili talep ve üretim kayıtlarına dönüştürüldü.`,
      );
      const plan = await request<MrpPlan>(
        `/api/manufacturing/mrp/plans/${planId}`,
      );
      if (!mrpRequestIsCurrent(captured)) return;
      setMrpPlan(plan);
      setMrpSelected([]);
      const history = await request<MrpPlanHistory[]>(
        "/api/manufacturing/mrp/plans",
      );
      if (!mrpRequestIsCurrent(captured)) return;
      setMrpHistory(history);
      await refresh();
    } catch (e) {
      if (mrpRequestIsCurrent(captured)) setError((e as Error).message);
    } finally {
      if (mrpRequestIsCurrent(captured)) setBusy(false);
    }
  }
  const eligibleItems = items;
  // Row actions live in the order detail panel, so the list has no actions column.
  const visibleOrderFields = orderScreenFields
    .filter((field) => field.key !== "actions" && (field.visible || field.fixed))
    .sort((a, b) => a.position - b.position);
  // Üretim emirleri list (mockup 10): selectable grid, current row → detail panel, İşlemler.
  const ordersListActive =
    section === "manufacturing-orders" && !createOrderPage && !trackingOrder;
  const orderListBodyRef = useRef<HTMLDivElement>(null);
  const orderPanelRef = useRef<ManufacturingOrderPanelHandle>(null);
  const orderGridExportRef = useRef<GridExportActions | null>(null);
  const [orderTicked, setOrderTicked] = useState<string[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const recipeGridExportRef = useRef<GridExportActions | null>(null);
  const workCenterGridExportRef = useRef<GridExportActions | null>(null);
  const orderPanel = useStockDetailPanelOpen(ordersListActive, orderListBodyRef);
  const orderRecipe = (order: Order) =>
    boms.find((bom) => bom.id === order.billOfMaterialId);
  const orderRecipeTitle = (order: Order) => {
    const bom = orderRecipe(order);
    return bom ? `${bom.code} · ${bom.productName}` : order.billOfMaterialName;
  };
  const orderUnitCode = (order: Order) => {
    const bom = orderRecipe(order);
    return bom
      ? (items.find((item) => item.id === bom.productStockItemId)?.unitCode ?? "")
      : "";
  };
  /** Opens the current order's panel and moves the focus there (an order has no document screen). */
  const openOrderPanel = (id: string) => {
    setSelectedOrderId(id);
    if (!orderPanel.open) orderPanel.toggle();
    window.setTimeout(() => orderPanelRef.current?.focus(), 0);
  };
  const runOrderStep = (order: Order, step: OrderStep) => {
    if (step === "schedule") void scheduleOrder(order);
    else if (step === "release") void transition(order, "release");
    else completeOrder(order);
  };
  const renderOrderRoute = (order: Order) => {
    const total = order.operations.length;
    if (!total) return <span className="mfg-cell-muted">rota yok</span>;
    if (order.status === "Planned")
      return orderNeedsScheduling(order) ? (
        <span className="mfg-cell-warn">
          <span>{total}</span> <span>op · çizelgelenmedi</span>
        </span>
      ) : (
        <span className="mfg-cell-muted">
          <span>{total}</span> <span>op · çizelgelendi</span>
        </span>
      );
    if (order.status === "Cancelled")
      return (
        <span className="mfg-cell-muted">
          <span>{total}</span> <span>op</span>
        </span>
      );
    const done = order.operations.filter((op) => op.status === "Completed").length;
    return (
      <span className="mfg-cell-muted">
        <span>
          {done} / {total}
        </span>{" "}
        <span>tamamlandı</span>
      </span>
    );
  };
  const renderOrderCell = (key: string, order: Order): ReactNode => {
    switch (key) {
      case "code":
        return order.code;
      case "plannedDate":
        return displayDate(order.plannedDate);
      case "productionSource":
        return order.sourceSalesOrderCode ? (
          <>
            <span className="nx-code">{order.sourceSalesOrderCode}</span> ·{" "}
            <span>satır</span> <span>{order.sourceSalesOrderLineNumber}</span>
          </>
        ) : (
          "Stoka üretim"
        );
      case "billOfMaterialName":
        return (
          <span className="mfg-cell-line" title={order.billOfMaterialName}>
            <span className="mfg-cell-recipe">{orderRecipeTitle(order)}</span>{" "}
            · {renderOrderRoute(order)}
          </span>
        );
      case "warehouseName":
        return order.warehouseName;
      case "plannedQuantity":
        return order.plannedQuantity.toLocaleString("tr-TR", {
          maximumFractionDigits: 4,
        });
      case "components":
        return order.lines.length ? (
          <span
            className="mfg-cell-line"
            title={order.lines
              .map((line) => `${line.componentCode} · ${line.componentName}`)
              .join("\n")}
          >
            {order.lines.map((line) => line.componentCode).join(", ")}
          </span>
        ) : (
          "—"
        );
      case "status": {
        const tag = orderStatusTag(order.status);
        return <StatusTag tone={tag.tone}>{tag.label}</StatusTag>;
      }
      default:
        return null;
    }
  };
  const orderFigures = orderPageFigures(orders);
  const orderFigure = (value: number) =>
    loading ? "—" : value.toLocaleString("tr-TR");
  const orderSummaryCards: SummaryCard[] = [
    {
      id: "open",
      label: "Açık emir",
      value: openOrdersCount === null || loading ? "—" : openOrdersCount.toLocaleString("tr-TR"),
      icon: Clock3,
      hint: "firma geneli · Planlandı + Serbest bırakıldı",
    },
    {
      id: "planned-cost",
      label: "Planlanan maliyet",
      value: loading || !orderFigures.costedCount ? "—" : amountText(orderFigures.plannedCost),
      icon: CircleDollarSign,
      hint: (
        <>
          <span>bu sayfa</span> · <span>{orderFigures.costedCount}</span>{" "}
          <span>emir · iptal hariç</span>
        </>
      ),
    },
    {
      id: "unscheduled",
      label: "Çizelgelenmemiş",
      value: orderFigure(orderFigures.unscheduled),
      icon: AlertTriangle,
      tone: orderFigures.unscheduled > 0 ? "warn" : "primary",
      hint: "bu sayfa · rotası takvimsiz",
    },
    {
      id: "completed",
      label: "Tamamlanan",
      value: orderFigure(orderFigures.completed),
      icon: CheckCircle2,
      tone: "ok",
      hint: "bu sayfa",
      // The list's existing status filter (Tamamlandı).
      filterActive: orderStatus === "Completed",
      onFilter: () => {
        setOrderStatus((value) => (value === "Completed" ? "" : "Completed"));
        setOrderPage(1);
      },
    },
  ];
  const orderGridSelection = {
    currentId: selectedOrderId || null,
    onCurrentChange: (id: string | null) => setSelectedOrderId(id ?? ""),
    onTickedChange: setOrderTicked,
    bulkActions: ordersListActive
      ? [
          {
            id: "export-selected",
            label: "Excel (seçilenler)",
            run: () => void orderGridExportRef.current?.exportExcel(),
          },
        ]
      : undefined,
    onOpen: openOrderPanel,
  };
  // Operations of the current order with their start / complete actions (detail panel, Rota tab).
  const orderRoute = selectedOrder ? (
    <>
                      {selectedOrder.operations.length ? (
                        <ul className="manufacturing-op-rows">
                          {selectedOrder.operations.map((op) => {
                            const isCompleted = op.status === "Completed";
                            const windowText = op.scheduledStartDate
                              ? `${op.scheduledStartDate} ${secondTime(op.scheduledStartSecondOfDay ?? (op.scheduledStartMinuteOfDay ?? 0) * 60)}–${op.scheduledEndDate} ${secondTime(op.scheduledEndSecondOfDay ?? (op.scheduledEndMinuteOfDay ?? 0) * 60)}`
                              : "";
                            const meta = (
                              isCompleted
                                ? [
                                    `${decimalText(op.actualEnergyQuantityKwh ?? 0, 3)} kWh enerji`,
                                    `fiili ${decimalText(op.actualCostBase ?? 0)} baz para`,
                                    op.performedByEmployeeName
                                      ? `Operatör: ${op.performedByEmployeeName}`
                                      : "",
                                  ]
                                : [
                                    `${decimalText(op.plannedEnergyQuantityKwh, 3)} kWh enerji`,
                                    `plan ${decimalText(op.plannedCostBase)} baz para`,
                                    windowText,
                                    ...(op.capacityDays.length > 1
                                      ? op.capacityDays.map(
                                          (slot) =>
                                            `${slot.date} ${secondTime(slot.startSecondOfDay ?? slot.startMinuteOfDay * 60)}–${secondTime(slot.endSecondOfDay ?? slot.endMinuteOfDay * 60)} (${slot.minutes} dk)`,
                                        )
                                      : []),
                                  ]
                            )
                              .filter(Boolean)
                              .join("\n");
                            return (
                              <li
                                key={op.id}
                                className={`manufacturing-op-row is-${op.status.toLowerCase()}`}
                              >
                                <div className="manufacturing-op-row-main" title={meta}>
                                  <span className="manufacturing-op-row-name">
                                    <i aria-hidden="true" />
                                    <span>{`${op.sequence} · ${op.workCenterCode}`}</span>
                                    <small>
                                      {operationStatusLabel[op.status] || op.status}
                                    </small>
                                  </span>
                                  <b>{`${decimalText(operationMinutes(op))} dk`}</b>
                                  {selectedOrder.status === "Released" &&
                                    op.status === "Planned" && (
                                      <button
                                        type="button"
                                        className="secondary small-button"
                                        disabled={busy}
                                        onClick={() =>
                                          void startOperation(selectedOrder, op)
                                        }
                                      >
                                        Operasyonu başlat
                                      </button>
                                    )}
                                  {selectedOrder.status === "Released" &&
                                    op.status === "InProgress" && (
                                      <button
                                        type="button"
                                        className="primary small-button"
                                        aria-expanded={completingOperationId === op.id}
                                        disabled={busy}
                                        onClick={() =>
                                          setCompletingOperationId((id) =>
                                            id === op.id ? "" : op.id,
                                          )
                                        }
                                      >
                                        Operasyonu tamamla
                                      </button>
                                    )}
                                </div>
                                {selectedOrder.status === "Released" &&
                                  op.status === "InProgress" && completingOperationId === op.id && (
                                    <div className="actual-time-entry">
                                      <label>
                                        Kurulum dk
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={
                                            actualTimes[op.id]?.setup ??
                                            String(op.setupMinutes)
                                          }
                                          onChange={(e) =>
                                            updateActual(op, "setup", e.target.value)
                                          }
                                        />
                                      </label>
                                      <label>
                                        Çalışma dk
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={
                                            actualTimes[op.id]?.run ??
                                            String(op.runMinutes)
                                          }
                                          onChange={(e) =>
                                            updateActual(op, "run", e.target.value)
                                          }
                                        />
                                      </label>
                                      <label>
                                        Enerji kWh
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.001"
                                          value={
                                            actualTimes[op.id]?.energyKwh ?? "0"
                                          }
                                          onChange={(e) =>
                                            updateActual(op, "energyKwh", e.target.value)
                                          }
                                        />
                                      </label>
                                      <label>
                                        Baz para / kWh
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.000001"
                                          value={
                                            actualTimes[op.id]?.energyRate ?? "0"
                                          }
                                          onChange={(e) =>
                                            updateActual(op, "energyRate", e.target.value)
                                          }
                                        />
                                      </label>
                                      <label className="is-wide">
                                        Operatör
                                        <select
                                          value={
                                            actualTimes[op.id]?.employeeId ??
                                            (employees.length === 1 ? employees[0].id : "")
                                          }
                                          onChange={(e) =>
                                            updateActual(op, "employeeId", e.target.value)
                                          }
                                          required
                                        >
                                          <option value="">Personel seçin</option>
                                          {employees.map((employee) => (
                                            <option key={employee.id} value={employee.id}>
                                              {employee.personnelCode} · {employee.fullName}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <button
                                        type="button"
                                        className="primary small-button"
                                        disabled={busy || employees.length === 0}
                                        onClick={() =>
                                          void completeOperation(selectedOrder, op)
                                        }
                                      >
                                        Fiili kayıtları kaydet
                                      </button>
                                    </div>
                                  )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="sales-ld-muted">Operasyon rotası tanımlı değil.</p>
                      )}
    </>
  ) : null;
  const orderPanelNode =
    ordersListActive && orderPanel.open ? (
      selectedOrder ? (
        <ManufacturingOrderPanel
          ref={orderPanelRef}
          order={selectedOrder}
          recipeTitle={orderRecipeTitle(selectedOrder)}
          unitCode={orderUnitCode(selectedOrder)}
          busy={busy}
          onStep={(step) => runOrderStep(selectedOrder, step)}
          route={orderRoute}
          onClose={orderPanel.close}
          takeFocus={orderPanel.takeFocus}
        />
      ) : (
        <SalesListDetailEmpty
          label="Üretim emri özeti"
          text="Özetini görmek için listeden bir üretim emri seçin."
        />
      )
    ) : null;
  const busyReason = busy ? "İşlem sürüyor…" : undefined;
  const orderCommands: PageCommands = (() => {
    const current = selectedOrder;
    const more: MenuCommand[] = [];
    if (current) {
      // The detail panel's workflow buttons, with their conditions.
      if (orderNeedsScheduling(current))
        more.push({ id: "order-schedule", label: "Kapasiteye çizelgele", disabledReason: busyReason, run: () => runOrderStep(current, "schedule") });
      else if (orderCanRelease(current))
        more.push({ id: "order-release", label: "Serbest bırak", disabledReason: busyReason, run: () => runOrderStep(current, "release") });
      if (orderCanComplete(current))
        more.push({ id: "order-complete", label: "Üretimi tamamla", disabledReason: busyReason, run: () => runOrderStep(current, "complete") });
      if (orderCanCancel(current))
        more.push({ id: "order-cancel", label: "İptal et", disabledReason: busyReason, run: () => void transition(current, "cancel") });
    }
    more.push(csvExportCommand(orderGridExportRef));
    return {
      new: { primary: true, run: () => onNavigate("manufacturing-order-create") },
      open: {
        disabledReason: current ? undefined : "Önce bir kayıt seçin",
        run: () => {
          const id = focusedRecordId() ?? current?.id;
          if (id) openOrderPanel(id);
        },
      },
      delete: {
        disabledReason: current
          ? "Üretim emri silinemez; İşlemler'den iptal edin."
          : "Önce bir kayıt seçin",
      },
      more,
    };
  })();
  const filteredBoms = boms.filter((bom) =>
    (!recipeStatus || bom.isActive === (recipeStatus === "Active")) &&
    `${bom.code} ${bom.name} ${bom.productName}`
      .toLocaleLowerCase("tr-TR")
      .includes(recipeSearch.trim().toLocaleLowerCase("tr-TR")),
  );
  const recipePageSize = RECIPE_PAGE_SIZE,
    pagedBoms = filteredBoms.slice(
      (recipePage - 1) * recipePageSize,
      recipePage * recipePageSize,
    );
  const bomSaveBlocked = items.length === 0;
  const orderSaveBlocked = boms.length === 0 || warehouses.length === 0;
  const trackingProductMode = trackingOrder
    ? (boms.find((x) => x.id === trackingOrder.billOfMaterialId)
        ?.productTrackingMode ?? "None")
    : "None";
  if (section === "manufacturing-recipe-create") {
    const cancelBom = () => {
      if (busy) return;
      resetBomForm();
      onNavigate("manufacturing-recipes");
    };
    const clearBom = () => {
      resetBomForm();
      setError("");
      setNotice("");
    };
    const bomCreateMode = !editingBomId;
    const canAddBomOperation =
      workCenters.some((x) => x.isActive) && bomOperations.length < 50;
    const addBomOperation = () =>
      setBomOperations((rows) => [
        ...rows,
        {
          workCenterId: workCenters.find((x) => x.isActive)?.id || "",
          setupMinutes: "0",
          runMinutesPerOutputUnit: "1",
          minimumWaitDaysAfterPrevious: "0",
          setupFamilyCode: "",
          plannedEnergyKwhPerOutput: "0",
          plannedEnergyCostPerKwhBase: "0",
          alternateWorkCenterIds: [],
        },
      ]);
    const updateBomOperation = (
      index: number,
      change: (row: (typeof bomOperations)[number]) => (typeof bomOperations)[number],
    ) =>
      setBomOperations((rows) =>
        rows.map((row, i) => (i === index ? change(row) : row)),
      );
    const recipeMaterialCost = components.reduce((sum, line) => {
      const quantity = Number(line.quantity),
        scrap = Number(line.scrap),
        cost = Number(line.standardUnitCostBase);
      return Number.isFinite(quantity) &&
        Number.isFinite(scrap) &&
        Number.isFinite(cost)
        ? sum + quantity * (1 + scrap / 100) * cost
        : sum;
    }, 0);
    // The former "Kaydetmeden önce" checklist (reçete kodu, mamul, en az bir bileşen) is the section navigator's state.
    const recipeTabs: RecordFormTab[] = [
      { key: "identity", label: "Kimlik", state: code.trim() && product ? "done" : "empty" },
      {
        key: "components",
        label: "Bileşenler",
        count: components.length,
        state: components.some((line) => !!line.stockItemId) ? "done" : "empty",
      },
      { key: "route", label: "Rota", count: bomOperations.length, state: bomOperations.length ? "done" : "empty" },
    ];
    return (
      <div className="manufacturing-page manufacturing-record-form-host">
        <RecordFormPage
          className="mfg-rf"
          title={editingBomId ? "Ürün Reçetesini Düzenle" : "Ürün Reçetesi Tanımlama"}
          // Record v3 with the kit line table (the lined-record header: type, code · mamul).
          document={{
            type: "Ürün reçetesi",
            code: code.trim() || undefined,
            party: eligibleItems.find((x) => x.id === product)?.name,
          }}
          mode={editingBomId ? "edit" : "create"}
          busy={busy}
          saveLabel={editingBomId ? "Değişiklikleri Kaydet" : "Reçeteyi Kaydet"}
          onSubmit={(event) => {
            if (bomSaveBlocked) {
              event.preventDefault();
              return;
            }
            void saveBom(event);
          }}
          onCancel={cancelBom}
          onSaveIntent={(stay) => {
            stayAfterBomSave.current = stay;
          }}
          error={error}
          onDismissError={() => setError("")}
          status={
            <>
              <span>
                Bileşen: <b>{components.length}</b>
              </span>
              <span>
                Operasyon: <b>{bomOperations.length} / 50</b>
              </span>
              {bomSaveBlocked && !loading && (
                <span className="rf-status-warning">
                  Stok kartı bulunmadığı için reçete kaydedilemez.
                </span>
              )}
              {notice && <span className="rf-status-notice">{notice}</span>}
              <span className="rf-status-end">Firma kapsamı · Reçeteler</span>
            </>
          }
        >
          {bomCreateMode && (
            <ToolbarMoreMenu
              items={[{ label: "Temizle", onSelect: clearBom, disabled: busy }]}
            />
          )}
          <RecordFormTabs tabs={recipeTabs} active={recipeTab} onChange={setRecipeTab} label="Reçete bölümleri">
          <div className="mfg-rf-layout">
            <div className="mfg-rf-stack">
            <div data-rf-section="identity" hidden={recipeTab !== "identity"}>
            <section className="mfg-rf-card mfg-rf-main">
              <div className="mfg-rf-row">
                <label>
                  <span>Reçete kodu <RequiredMark /></span>
                  <input
                    className="rf-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={48}
                    placeholder="REC-URUN-001"
                  />
                </label>
                <label>
                  <span>Reçete adı <RequiredMark /></span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={160}
                    placeholder="Standart montaj reçetesi"
                  />
                </label>
              </div>
              <div className="mfg-rf-row mfg-rf-row--wide">
                <label>
                  <span>Mamul <RequiredMark /></span>
                  <SearchableRecordPicker
                    options={eligibleItems.map((x) => ({
                      id: x.id,
                      label: `${x.code} · ${x.name}`,
                      description:
                        x.trackingMode !== "None"
                          ? `İzlemeli: ${x.trackingMode === "Lot" ? "Lot" : "Seri"}`
                          : x.unitCode,
                      searchText: x.unitCode,
                    }))}
                    selectedId={product}
                    onSelect={(id) => {
                      setProduct(id);
                      setComponents((rows) =>
                        rows.map((row) =>
                          row.stockItemId === id
                            ? { ...row, stockItemId: "" }
                            : row,
                        ),
                      );
                    }}
                    onSearchChange={searchStockItems}
                    title="Mamul seçin"
                    placeholder="Mamul seçin"
                    searchPlaceholder="Stok kodu veya adıyla ara"
                    emptyMessage="Aramanızla eşleşen aktif stok kartı bulunamadı."
                    required
                  />
                </label>
                <label>
                  <span>Çıktı miktarı <RequiredMark /></span>
                  <input
                    className="rf-num"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                    required
                  />
                </label>
              </div>
            </section>
            </div>
            {/* Bileşenler: the kit line table (mockup 02 satır kartı). */}
            <div data-rf-section="components" hidden={recipeTab !== "components"}>
            <section className="dd-box mfg-rf-lines" aria-label="Bileşenler">
              <DetailLinesHead
                title="Bileşenler"
                meta={
                  <>
                    <span>{components.length.toLocaleString("tr-TR")}</span> <span>bileşen</span>
                  </>
                }
              />
              <div className="dd-lines-wrap">
                <table className="dd-lines mfg-rf-components">
                  <thead>
                    <tr>
                      <th className="dd-ix">Sıra</th>
                      <th>Stok kartı</th>
                      <th className="dd-num">Miktar</th>
                      <th className="dd-num">Fire %</th>
                      <th className="dd-num">Birim maliyet</th>
                      <th className="dd-menu" aria-label="Satır işlemleri" />
                    </tr>
                  </thead>
                  <tbody>
                  {components.map((line, index) => (
                    <tr key={index}>
                      <td className="dd-ix">{index + 1}</td>
                      <td className="dd-stock-cell">
                      <SearchableRecordPicker
                        options={eligibleItems
                          .filter((x) => x.id !== product)
                          .map((x) => ({
                            id: x.id,
                            label: `${x.code} · ${x.name}`,
                            description: x.unitCode,
                            searchText: x.unitCode,
                          }))}
                        selectedId={line.stockItemId}
                        onSelect={(id) =>
                          setComponents((rows) =>
                            rows.map((x, i) =>
                              i === index ? { ...x, stockItemId: id } : x,
                            ),
                          )
                        }
                        onSearchChange={searchStockItems}
                        title="Bileşen stok kartı seçin"
                        placeholder="Bileşen seçin"
                        searchPlaceholder="Stok kodu veya adıyla ara"
                        emptyMessage="Aramanızla eşleşen bileşen bulunamadı."
                        required
                      />
                      </td>
                      <td className="dd-num">
                      <input
                        className="rf-num"
                        aria-label="Bileşen miktarı"
                        title="Reçete çıktısı başına gereken miktar"
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={line.quantity}
                        onChange={(e) =>
                          setComponents((rows) =>
                            rows.map((x, i) =>
                              i === index
                                ? { ...x, quantity: e.target.value }
                                : x,
                            ),
                          )
                        }
                        required
                      />
                      </td>
                      <td className="dd-num">
                      <input
                        className="rf-num"
                        aria-label="Fire yüzdesi"
                        title="Reçete çıktısı başına fire yüzdesi"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={line.scrap}
                        onChange={(e) =>
                          setComponents((rows) =>
                            rows.map((x, i) =>
                              i === index ? { ...x, scrap: e.target.value } : x,
                            ),
                          )
                        }
                        required
                      />
                      </td>
                      <td className="dd-num">
                      <input
                        className="rf-num"
                        aria-label="Standart birim maliyeti baz para"
                        title="Firma baz para biriminde bileşenin standart birim maliyeti"
                        type="number"
                        min="0"
                        step="0.0001"
                        value={line.standardUnitCostBase}
                        onChange={(e) =>
                          setComponents((rows) =>
                            rows.map((x, i) =>
                              i === index
                                ? { ...x, standardUnitCostBase: e.target.value }
                                : x,
                            ),
                          )
                        }
                        required
                      />
                      </td>
                      <td className="dd-menu">
                      <button
                        type="button"
                        className="dd-line-remove"
                        aria-label="Bileşeni kaldır"
                        title="Bileşeni kaldır"
                        disabled={components.length === 1}
                        onClick={() =>
                          setComponents((rows) =>
                            rows.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="dd-new-line">
                    <td colSpan={6}>
                      <button
                        type="button"
                        onClick={() =>
                          setComponents((x) => [
                            ...x,
                            {
                              stockItemId: "",
                              quantity: "1",
                              scrap: "0",
                              standardUnitCostBase: "0",
                            },
                          ])
                        }
                      >
                        <Plus size={13} aria-hidden="true" /> Bileşen ekle
                      </button>
                    </td>
                  </tr>
                  </tbody>
                </table>
              </div>
              <p className="mfg-rf-lines-note">
                Miktar reçete çıktısı başınadır; birim maliyet baz para
                birimindedir.
              </p>
            </section>
            </div>
            <div data-rf-section="route" hidden={recipeTab !== "route"}>
            {/* Rota: the kit line table (mockup 10 · record v3 "satır ızgarası"); Gelişmiş opens a detail row. */}
            <section className="dd-box mfg-rf-lines mfg-rf-route" aria-label="Rota">
              <DetailLinesHead
                title="Rota / operasyonlar"
                meta={
                  <>
                    <span>{bomOperations.length.toLocaleString("tr-TR")}</span> <span>/ 50 operasyon · isteğe bağlı</span>
                  </>
                }
              />
              <div className="dd-lines-wrap">
                <table className="dd-lines mfg-rf-operations">
                  <thead>
                    <tr>
                      <th className="dd-ix">Sıra</th>
                      <th>İş merkezi</th>
                      <th className="dd-num">Birim süre (dk)</th>
                      <th className="dd-num">Kurulum (dk)</th>
                      <th>Gelişmiş</th>
                      <th className="dd-menu" aria-label="Satır işlemleri" />
                    </tr>
                  </thead>
                  <tbody>
                    {bomOperations.map((operation, index) => {
                      const waitDays = operation.minimumWaitDaysAfterPrevious;
                      const advancedInvalid =
                        waitDays.trim() === "" ||
                        !Number.isInteger(Number(waitDays)) ||
                        Number(waitDays) < 0 ||
                        Number(waitDays) > 365 ||
                        Number(operation.plannedEnergyKwhPerOutput) < 0 ||
                        Number(operation.plannedEnergyCostPerKwhBase) < 0;
                      const advancedSet =
                        operation.setupFamilyCode.trim() !== "" ||
                        Number(operation.plannedEnergyKwhPerOutput) !== 0 ||
                        Number(operation.plannedEnergyCostPerKwhBase) !== 0 ||
                        Number(waitDays) !== 0 ||
                        operation.alternateWorkCenterIds.length > 0;
                      const expanded =
                        advancedInvalid ||
                        (expandedBomOperations[index] ?? advancedSet);
                      return (
                        <Fragment key={index}>
                          <tr>
                            <td className="dd-ix">{index + 1}</td>
                            <td>
                              <select
                                aria-label="İş merkezi"
                                value={operation.workCenterId}
                                onChange={(e) =>
                                  updateBomOperation(index, (x) => ({
                                    ...x,
                                    workCenterId: e.target.value,
                                    alternateWorkCenterIds:
                                      x.alternateWorkCenterIds.filter(
                                        (id) => id !== e.target.value,
                                      ),
                                  }))
                                }
                                required
                              >
                                <option value="">İş merkezi seçin</option>
                                {workCenters
                                  .filter((x) => x.isActive)
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.code} · {x.name}
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="dd-num">
                              <input
                                className="rf-num"
                                aria-label="Birim süre (dk)"
                                type="number"
                                min="0"
                                step="0.0001"
                                value={operation.runMinutesPerOutputUnit}
                                onChange={(e) =>
                                  updateBomOperation(index, (x) => ({
                                    ...x,
                                    runMinutesPerOutputUnit: e.target.value,
                                  }))
                                }
                                required
                              />
                            </td>
                            <td className="dd-num">
                              <input
                                className="rf-num"
                                aria-label="Kurulum (dk)"
                                type="number"
                                min="0"
                                step="0.01"
                                value={operation.setupMinutes}
                                onChange={(e) =>
                                  updateBomOperation(index, (x) => ({
                                    ...x,
                                    setupMinutes: e.target.value,
                                  }))
                                }
                                required
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="mfg-rf-disclosure"
                                aria-expanded={expanded}
                                disabled={advancedInvalid}
                                onClick={() =>
                                  setExpandedBomOperations((state) => ({
                                    ...state,
                                    [index]: !expanded,
                                  }))
                                }
                              >
                                <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                                Gelişmiş
                              </button>
                            </td>
                            <td className="dd-menu">
                              <button
                                type="button"
                                className="dd-line-remove"
                                aria-label="Operasyonu kaldır"
                                title="Operasyonu kaldır"
                                onClick={() => {
                                  setBomOperations((rows) =>
                                    rows.filter((_, i) => i !== index),
                                  );
                                  setExpandedBomOperations({});
                                }}
                              >
                                <Trash2 size={13} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="mfg-rf-op-detail-row">
                              <td />
                              <td colSpan={5}>
                            <div className="mfg-rf-op-details">
                              <label>
                                Kurulum ailesi
                                <input
                                  title="Benzer kurulum gerektiren ürünleri aynı aile koduyla gruplayın; harf, rakam, nokta, alt çizgi ve tire kullanın. Örnek: BOYA-ACIK"
                                  value={operation.setupFamilyCode}
                                  onChange={(e) =>
                                    updateBomOperation(index, (x) => ({
                                      ...x,
                                      setupFamilyCode: e.target.value,
                                    }))
                                  }
                                  placeholder="Kurulum ailesi"
                                  maxLength={48}
                                />
                              </label>
                              <label>
                                Enerji (kWh/birim)
                                <input
                                  className="rf-num"
                                  title="Bu operasyonun bir mamul birimi için standart elektrik tüketimi"
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={operation.plannedEnergyKwhPerOutput}
                                  onChange={(e) =>
                                    updateBomOperation(index, (x) => ({
                                      ...x,
                                      plannedEnergyKwhPerOutput: e.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                Enerji bedeli (baz para/kWh)
                                <input
                                  className="rf-num"
                                  title="Firma baz para biriminde standart elektrik bedeli"
                                  type="number"
                                  min="0"
                                  step="0.000001"
                                  value={operation.plannedEnergyCostPerKwhBase}
                                  onChange={(e) =>
                                    updateBomOperation(index, (x) => ({
                                      ...x,
                                      plannedEnergyCostPerKwhBase:
                                        e.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                Bekleme (gün)
                                <input
                                  className="rf-num"
                                  title="Önceki operasyon bitince bu operasyon başlamadan beklenecek en az takvim günü"
                                  type="number"
                                  min="0"
                                  max="365"
                                  step="1"
                                  value={operation.minimumWaitDaysAfterPrevious}
                                  onChange={(e) =>
                                    updateBomOperation(index, (x) => ({
                                      ...x,
                                      minimumWaitDaysAfterPrevious:
                                        e.target.value,
                                    }))
                                  }
                                  required
                                />
                              </label>
                              <div
                                className="manufacturing-alternates mfg-rf-alternates"
                                role="group"
                                aria-label="Alternatif iş merkezleri"
                              >
                                <small>
                                  {`Alternatif iş merkezleri · ${operation.alternateWorkCenterIds.length}/19`}
                                </small>
                                <div>
                                  {workCenters
                                    .filter(
                                      (x) =>
                                        x.isActive &&
                                        x.id !== operation.workCenterId,
                                    )
                                    .map((x) => {
                                      const checked =
                                        operation.alternateWorkCenterIds.includes(
                                          x.id,
                                        );
                                      return (
                                        <label
                                          key={x.id}
                                          title={`${x.code} · ${x.name}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={
                                              !checked &&
                                              operation.alternateWorkCenterIds
                                                .length >= 19
                                            }
                                            onChange={(e) =>
                                              updateBomOperation(
                                                index,
                                                (row) => ({
                                                  ...row,
                                                  alternateWorkCenterIds: e
                                                    .target.checked
                                                    ? [
                                                        ...row.alternateWorkCenterIds,
                                                        x.id,
                                                      ]
                                                    : row.alternateWorkCenterIds.filter(
                                                        (id) => id !== x.id,
                                                      ),
                                                }),
                                              )
                                            }
                                          />
                                          <span>{x.code}</span>
                                        </label>
                                      );
                                    })}
                                </div>
                              </div>
                            </div>

                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!bomOperations.length && (
                      <tr>
                        <td colSpan={6} className="mfg-rf-lines-empty">
                          Rota isteğe bağlıdır; henüz operasyon yok.
                        </td>
                      </tr>
                    )}
                    <tr className="dd-new-line">
                      <td colSpan={6}>
                        <button type="button" disabled={!canAddBomOperation} onClick={addBomOperation}>
                          <Plus size={13} aria-hidden="true" /> {`Operasyon ekle (${bomOperations.length}/50)`}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mfg-rf-lines-note">

                  Enerji, bekleme ve alternatif merkezler 'Gelişmiş' altında.
                  <span
                    className="mfg-rf-info"
                    role="img"
                    aria-label="Operasyon rotası hakkında"
                    title="Enerji standartları mamul birimi başına kWh ve firma baz para biriminde kWh bedeliyle girilir; üretim emri oluşturulurken miktara göre sabitlenir. Operasyon başına en fazla 20 uygun iş merkezi vardır (tercih edilen merkez dahil). Aynı iş merkezinde art arda yapılacak ürünleri kurulum ailesiyle gruplayın. Geçiş süresi ve yasak geçişleri İş Merkezi ayarlarından tanımlanır."
                  >
                    <Info size={13} aria-hidden="true" />
                  </span>

              </p>
            </section>
            </div>
            </div>
            <aside className="mfg-rf-side">
              <section className="mfg-rf-card" aria-labelledby="mfg-recipe-summary">
                <h2 id="mfg-recipe-summary">Özet</h2>
                <dl className="mfg-rf-facts">
                  <div>
                    <dt>Bileşen</dt>
                    <dd>{components.length.toLocaleString("tr-TR")}</dd>
                  </div>
                  <div>
                    <dt>Operasyon</dt>
                    <dd>{bomOperations.length.toLocaleString("tr-TR")}</dd>
                  </div>
                </dl>
                <div className="mfg-rf-total">
                  <small>Planlanan malzeme</small>
                  <output aria-live="polite">
                    {recipeMaterialCost.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </output>
                  <small>
                    Miktar × (1 + fire) × birim maliyet · reçete çıktısı başına,
                    baz para
                  </small>
                </div>
              </section>
            </aside>
          </div>
          </RecordFormTabs>
          <StickyFormBar
            saveLabel={
              editingBomId ? "Değişiklikleri Kaydet" : "Reçeteyi Kaydet"
            }
            busy={busy}
            onSave={() => {
              stayAfterBomSave.current = false;
            }}
            items={[
              ...(bomCreateMode
                ? [
                    {
                      label: "Kaydet ve Yeni",
                      submit: true,
                      disabled: busy,
                      onSelect: () => {
                        stayAfterBomSave.current = true;
                      },
                    },
                    { label: "Temizle", onSelect: clearBom, disabled: busy },
                  ]
                : []),
              { label: "Vazgeç", onSelect: cancelBom },
            ]}
          />
        </RecordFormPage>
      </div>
    );
  }
  if (section === "manufacturing-orders" && createOrderPage) {
    const orderBom = boms.find((x) => x.id === bomId) ?? null;
    const orderUnit = orderBom
      ? items.find((x) => x.id === orderBom.productStockItemId)?.unitCode ?? ""
      : "";
    const orderQuantity = Number(plannedQuantity);
    const orderFactor =
      orderBom && orderBom.outputQuantity > 0 && Number.isFinite(orderQuantity)
        ? orderQuantity / orderBom.outputQuantity
        : 0;
    const orderMinutes = orderBom
      ? orderBom.operations.reduce(
          (sum, op) =>
            sum +
            op.setupMinutes +
            op.runMinutesPerOutputUnit *
              (Number.isFinite(orderQuantity) ? orderQuantity : 0),
          0,
        )
      : 0;
    const orderMaterial = orderBom
      ? orderBom.lines.reduce(
          (sum, line) =>
            sum +
            line.quantity *
              (1 + line.scrapPercent / 100) *
              line.standardUnitCostBase *
              orderFactor,
          0,
        )
      : 0;
    return (
      <div className="manufacturing-page manufacturing-record-form-host">
        <RecordFormPage
          className="mfg-rf"
          title="Üretim Emri Planlama"
          // Record v3: lined-record header (type, code · mamul); no status step before the order is saved.
          document={{
            type: "Üretim emri",
            code: orderCode.trim() || undefined,
            party: orderBom?.productName,
          }}
          mode="create"
          busy={busy}
          saveLabel="Emir Planla"
          formId="manufacturing-order-create-form"
          onSubmit={(event) => {
            if (orderSaveBlocked) {
              event.preventDefault();
              return;
            }
            void createOrder(event);
          }}
          onCancel={() => onNavigate("manufacturing-orders")}
          error={error}
          onDismissError={() => setError("")}
          status={
            <>
              <span>Reçete ve depo seçerek miktarı planlayın.</span>
              {orderSaveBlocked && !loading && (
                <span className="rf-status-warning">
                  Emir planlamak için en az bir reçete ve üretim deposu gerekir.
                </span>
              )}
              {notice && <span className="rf-status-notice">{notice}</span>}
            </>
          }
        >
          <div className="mfg-rf-layout">
            <div className="mfg-rf-stack">
            <section className="mfg-rf-card mfg-rf-main">
              <label className="mfg-rf-lead">
                <span>Reçete <RequiredMark /></span>
                <select
                  value={bomId}
                  onChange={(e) => setBomId(e.target.value)}
                  required
                >
                  <option value="">Reçete seçin</option>
                  {boms
                    .filter((x) => x.isActive)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} · {x.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="mfg-rf-row">
                <label>
                  <span>Planlanan miktar <RequiredMark /></span>
                  <div className="mfg-rf-suffix">
                    <input
                      className="rf-num"
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={plannedQuantity}
                      onChange={(e) => setPlannedQuantity(e.target.value)}
                      required
                    />
                    {orderUnit && <span>{orderUnit}</span>}
                  </div>
                </label>
                <label>
                  <span>Üretim deposu <RequiredMark /></span>
                  <SearchableRecordPicker
                    options={warehouses.map((x) => ({
                      id: x.id,
                      label: `${x.code} · ${x.name}`,
                    }))}
                    selectedId={warehouseId}
                    onSelect={setWarehouseId}
                    title="Üretim deposu seçin"
                    placeholder="Depo seçin"
                    searchPlaceholder="Depo kodu veya adıyla ara"
                    emptyMessage="Aramanızla eşleşen depo bulunamadı."
                    required
                  />
                </label>
              </div>
              <div className="mfg-rf-row">
                <label>
                  <span>Plan tarihi <RequiredMark /></span>
                  <input
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Emir kodu <RequiredMark /></span>
                  <input
                    className="rf-mono"
                    value={orderCode}
                    onChange={(e) => setOrderCode(e.target.value)}
                    required
                    maxLength={48}
                    placeholder="URE-2026-001"
                  />
                </label>
              </div>
              <div className="mfg-rf-field">
                <span>Üretim türü</span>
                <div
                  className="mfg-rf-segments"
                  role="group"
                  aria-label="Üretim türü"
                >
                  {(
                    [
                      ["Stock", "Stoka üretim"],
                      ["SalesOrder", "Satış siparişine üretim"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={productionMode === mode}
                      onClick={() => {
                        setProductionMode(mode);
                        if (mode === "Stock") {
                          setSourceSalesOrderId("");
                          setSourceSalesOrderLineNumber("");
                          setSourceSalesOrderLines([]);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {productionMode === "SalesOrder" && (
                <div className="mfg-rf-row">
                  <label>
                    Satış siparişi
                    <select
                      value={sourceSalesOrderId}
                      onChange={(e) => void selectSourceSalesOrder(e.target.value)}
                      required
                    >
                      <option value="">Açık sipariş seçin</option>
                      {sourceSalesOrders.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.code} · {order.customerName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sipariş satırı
                    <select
                      value={sourceSalesOrderLineNumber}
                      onChange={(e) => selectSourceSalesOrderLine(e.target.value)}
                      required
                      disabled={!sourceSalesOrderId || sourceSalesOrderLines.length === 0}
                    >
                      <option value="">Üretilecek mamul satırını seçin</option>
                      {sourceSalesOrderLines.map((line) => (
                        <option key={line.lineNumber} value={line.lineNumber}>
                          {line.stockCode} · {line.stockName} · kalan {line.remainingQuantity.toLocaleString("tr-TR")}
                        </option>
                      ))}
                    </select>
                  </label>
                  {sourceSalesOrderId && sourceSalesOrderLines.length === 0 && (
                    <small>Açık siparişte üretime bağlanabilecek kalan satır yok.</small>
                  )}
                </div>
              )}
            </section>
            {/* Bileşen ve rota reçeteden gelir: salt okunur önizleme (kit satır tablosu); emir satır girişi almaz. */}
            {orderBom && (
              <section className="dd-box mfg-rf-lines" aria-label="Bileşenler">
                <DetailLinesHead
                  title="Bileşenler"
                  meta={
                    <>
                      <span>{orderBom.lines.length.toLocaleString("tr-TR")}</span> <span>bileşen</span> ·{" "}
                      <span>reçeteden, salt okunur</span>
                    </>
                  }
                />
                <div className="dd-lines-wrap">
                  <table className="dd-lines">
                    <thead>
                      <tr>
                        <th className="dd-ix">Sıra</th>
                        <th>Bileşen</th>
                        <th className="dd-num">Fire %</th>
                        <th className="dd-num">Gereken miktar</th>
                        <th className="dd-num">Birim maliyet</th>
                        <th className="dd-num">Planlanan maliyet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderBom.lines.map((line, index) => {
                        const required = line.quantity * (1 + line.scrapPercent / 100) * orderFactor;
                        return (
                          <tr key={`${line.componentStockItemId}-${index}`}>
                            <td className="dd-ix">{index + 1}</td>
                            <td>{line.componentName}</td>
                            <td className="dd-num">{line.scrapPercent.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</td>
                            <td className="dd-num">{required.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}</td>
                            <td className="dd-num">{line.standardUnitCostBase.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                            <td className="dd-num">
                              {(required * line.standardUnitCostBase).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                      {orderBom.lines.length === 0 && (
                        <tr>
                          <td colSpan={6} className="mfg-rf-lines-empty">Bu emirde bileşen satırı yok.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {orderBom && (
              <section className="dd-box mfg-rf-lines" aria-label="Rota">
                <DetailLinesHead
                  title="Rota"
                  meta={
                    <>
                      <span>{orderBom.operations.length.toLocaleString("tr-TR")}</span> <span>operasyon</span>
                    </>
                  }
                />
                <div className="dd-lines-wrap">
                  <table className="dd-lines">
                    <thead>
                      <tr>
                        <th className="dd-ix">Sıra</th>
                        <th>İş merkezi</th>
                        <th className="dd-num">Kurulum dk</th>
                        <th className="dd-num">Çalışma dk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderBom.operations.map((op, index) => (
                        <tr key={`${op.sequence}-${index}`}>
                          <td className="dd-ix">{op.sequence}</td>
                          <td>{op.workCenterName}</td>
                          <td className="dd-num">{op.setupMinutes.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</td>
                          <td className="dd-num">
                            {(op.runMinutesPerOutputUnit * (Number.isFinite(orderQuantity) ? orderQuantity : 0)).toLocaleString("tr-TR", {
                              maximumFractionDigits: 1,
                            })}
                          </td>
                        </tr>
                      ))}
                      {orderBom.operations.length === 0 && (
                        <tr>
                          <td colSpan={4} className="mfg-rf-lines-empty">Operasyon rotası tanımlı değil.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            </div>
            <aside className="mfg-rf-side">
              <section className="mfg-rf-card" aria-labelledby="mfg-order-summary">
                <h2 id="mfg-order-summary">Reçete özeti</h2>
                {!orderBom ? (
                  <small>Reçete seçilmeden özet boş kalır.</small>
                ) : (
                  <>
                    <dl className="mfg-rf-facts">
                      <div>
                        <dt>Mamul</dt>
                        <dd>{orderBom.productName}</dd>
                      </div>
                      <div>
                        <dt>Bileşen</dt>
                        <dd>{orderBom.lines.length.toLocaleString("tr-TR")}</dd>
                      </div>
                      <div>
                        <dt>Operasyon</dt>
                        <dd>
                          {orderBom.operations.length.toLocaleString("tr-TR")}
                          {orderBom.operations.length > 0 &&
                            ` · ${orderMinutes.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} dk`}
                        </dd>
                      </div>
                    </dl>
                    <div className="mfg-rf-total">
                      <small>Planlanan malzeme</small>
                      <output aria-live="polite">
                        {orderMaterial.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </output>
                      <small>
                        Seçilen miktar için standart maliyetle, baz para
                      </small>
                    </div>
                  </>
                )}
              </section>
            </aside>
          </div>
        </RecordFormPage>
      </div>
    );
  }
  /** Fields of the work centre create form: the create page and the definition screen's pane (one POST). */
  const workCenterFormBody = (tip: ReactNode) => {
    const wcCurrency = "TRY";
    const wcCapacityMinutes = Number(wcCapacity);
    const wcHourly =
      (Number.isFinite(Number(wcLabor)) ? Number(wcLabor) : 0) +
      (Number.isFinite(Number(wcOverhead)) ? Number(wcOverhead) : 0);
    const wcDaily = Number.isFinite(wcCapacityMinutes)
      ? (wcHourly * wcCapacityMinutes) / 60
      : 0;
    const money = (value: number) =>
      value.toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    return (
          <div className="mfg-rf-layout">
            <section className="mfg-rf-card mfg-rf-main">
              <label className="mfg-rf-lead">
                <span>İş merkezi adı <RequiredMark /></span>
                <input
                  value={wcName}
                  onChange={(e) => setWcName(e.target.value)}
                  required
                  maxLength={160}
                  placeholder="Montaj hattı"
                />
              </label>
              <div className="mfg-rf-row">
                <label>
                  <span>Kod <RequiredMark /></span>
                  <input
                    className="rf-mono"
                    value={wcCode}
                    onChange={(e) => setWcCode(e.target.value)}
                    required
                    maxLength={48}
                    placeholder="WC-MONTAJ"
                  />
                </label>
                <label>
                  <span>Günlük kapasite <RequiredMark /></span>
                  <div className="mfg-rf-suffix">
                    <input
                      className="rf-num"
                      type="number"
                      min="1"
                      max="1440"
                      value={wcCapacity}
                      onChange={(e) => setWcCapacity(e.target.value)}
                      required
                    />
                    <span>dk</span>
                  </div>
                  <small>
                    {`= ${(Number.isFinite(wcCapacityMinutes) ? wcCapacityMinutes / 60 : 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} saat`}
                  </small>
                </label>
              </div>
              <div className="mfg-rf-divider">
                <span>Saatlik maliyetler</span>
              </div>
              <div className="mfg-rf-row">
                <label>
                  <span>İşçilik / saat <RequiredMark /></span>
                  <div className="mfg-rf-suffix">
                    <input
                      className="rf-num"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={wcLabor}
                      onChange={(e) => setWcLabor(e.target.value)}
                      required
                    />
                    <span>{wcCurrency}</span>
                  </div>
                </label>
                <label>
                  <span>Genel gider / saat <RequiredMark /></span>
                  <div className="mfg-rf-suffix">
                    <input
                      className="rf-num"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={wcOverhead}
                      onChange={(e) => setWcOverhead(e.target.value)}
                      required
                    />
                    <span>{wcCurrency}</span>
                  </div>
                </label>
              </div>
            </section>
            <aside className="mfg-rf-side">
              <section className="mfg-rf-card" aria-labelledby="mfg-wc-total">
                <h2 id="mfg-wc-total">Saatlik toplam maliyet</h2>
                <div className="mfg-rf-total">
                  <output aria-live="polite">
                    {`${money(wcHourly)} ${wcCurrency}`}
                  </output>
                  <small>
                    {`Dakika başına ${money(wcHourly / 60)} · günlük ${money(wcDaily)}`}
                  </small>
                </div>
              </section>
              <p className="mfg-rf-tip">{tip}</p>
            </aside>
          </div>
    );
  };
  if (section === "manufacturing-work-center-create") {
    return (
      <div className="manufacturing-page manufacturing-record-form-host">
        <RecordFormPage
          className="mfg-rf"
          title="İş Merkezi Tanımlama"
          mode="create"
          busy={busy}
          saveLabel="İş Merkezini Kaydet"
          onSubmit={(event) => void createWorkCenter(event)}
          onCancel={() => onNavigate("manufacturing-work-centers")}
          error={error}
          onDismissError={() => setError("")}
          status={
            notice ? (
              <span className="rf-status-notice">{notice}</span>
            ) : undefined
          }
        >
          {workCenterFormBody(
            "Kaydettikten sonra çalışma takvimini iş merkezleri listesinden ayarlayın.",
          )}
        </RecordFormPage>
      </div>
    );
  }
  // Record lists follow the shared list-v2 structure (see list-page/README.md).
  const listSection =
    section === "manufacturing-recipes" ||
    section === "manufacturing-work-centers" ||
    (section === "manufacturing-orders" && !createOrderPage);
  const listCount = loading
    ? null
    : section === "manufacturing-recipes"
      ? boms.length
      : section === "manufacturing-work-centers"
        ? workCenters.length
        : ordersTotalCount;
  const refreshList = () => {
    if (!busy) void refresh();
  };
  const activeWorkCenterCount = workCenters.filter((x) => x.isActive).length;
  const workCenterQuery = workCenterSearch.trim().toLocaleLowerCase("tr-TR");
  const visibleWorkCenters = workCenters.filter(
    (center) =>
      (!workCenterStatus ||
        center.isActive === (workCenterStatus === "Active")) &&
      (!workCenterQuery ||
        center.code.toLocaleLowerCase("tr-TR").includes(workCenterQuery) ||
        center.name.toLocaleLowerCase("tr-TR").includes(workCenterQuery)),
  );
  const selectedWorkCenter =
    workCenters.find((center) => center.id === calendarCenterId) ?? null;
  const activeWorkCenterCapacity = workCenters
    .filter((x) => x.isActive)
    .reduce((sum, x) => sum + x.capacityMinutesPerDay, 0);
  const mrpSection = section === "manufacturing-mrp";
  const mrpLatestPlanAt =
    mrpPlan?.plannedAt ??
    mrpHistory.reduce<string | null>(
      (latest, x) => (!latest || x.createdAt > latest ? x.createdAt : latest),
      null,
    );
  const mrpCounts = mrpPlan
    ? {
        make: mrpPlan.lines.filter((x) => x.recommendation === "Üret").length,
        buy: mrpPlan.lines.filter((x) => x.recommendation === "Satın al")
          .length,
        issues: mrpPlan.lines.filter((x) => x.issue !== null).length,
      }
    : null;
  const mrpRunDisabled =
    busy ||
    !warehouseId ||
    filledMrpDemands.length === 0 ||
    hasDuplicateMrpDemand;
  const currentRecipe =
    pagedBoms.find((bom) => bom.id === selectedRecipeId) ?? null;
  const recipeCommands: PageCommands = {
    new: {
      primary: true,
      run: () => {
        resetBomForm();
        setError("");
        setNotice("");
        onNavigate("manufacturing-recipe-create");
      },
    },
    open: {
      disabledReason: currentRecipe ? busyReason : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? currentRecipe?.id;
        const bom = boms.find((candidate) => candidate.id === id);
        if (bom) beginEditBom(bom);
      },
    },
    delete: {
      disabledReason: !currentRecipe
        ? "Önce bir kayıt seçin"
        : currentRecipe.orderCount > 0
          ? "Üretim emri referansı olan reçeteler silinemez."
          : busyReason,
      run: () => {
        if (currentRecipe) void deleteBom(currentRecipe);
      },
    },
    more: [
      ...(currentRecipe
        ? [
            {
              id: "recipe-state",
              label: currentRecipe.isActive ? "Pasife al" : "Etkinleştir",
              disabledReason: busyReason,
              run: () => void changeBomState(currentRecipe),
            },
          ]
        : []),
      csvExportCommand(recipeGridExportRef),
    ],
  };
  const workCenterCommands: PageCommands = {
    // Yeni (F2) opens the empty form in the right pane (the menu's "İş merkezi tanımla" page stays).
    new: {
      primary: !wcCreating,
      disabledReason: busyReason,
      run: () => {
        if (wcCreating) {
          document.getElementById("mfg-wc-create")?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
          return;
        }
        void confirmWorkCenterDiscard().then((ok) => ok && startWorkCenterCreate());
      },
    },
    open: {
      disabledReason: selectedWorkCenter ? undefined : "Önce bir kayıt seçin",
      run: () => {
        window.setTimeout(
          () => workCenterDefRef.current?.querySelector<HTMLElement>(".nx-def-pane [role='tab'][aria-selected='true']")?.focus(),
          0,
        );
      },
    },
    delete: {
      disabledReason: selectedWorkCenter
        ? "İş merkezi silinemez; durumu Genel sekmesinden değiştirilir."
        : "Önce bir kayıt seçin",
    },
    more: [csvExportCommand(workCenterGridExportRef)],
  };
  const mrpCommands: PageCommands = {
    refresh: { disabledReason: busyReason, run: () => void refresh() },
    more: [
      {
        id: "mrp-history",
        label: "Plan geçmişi",
        disabledReason: busyReason,
        run: () => void loadMrpHistory(),
      },
    ],
  };
  const sectionCommands: PageCommands | null =
    section === "manufacturing-orders"
      ? orderCommands
      : section === "manufacturing-recipes"
        ? recipeCommands
        : section === "manufacturing-work-centers"
          ? workCenterCommands
          : mrpSection
            ? mrpCommands
            : null;
  return (
    <div
      className={`manufacturing-page manufacturing-workbench${listSection || mrpSection ? " list-v2" : ""}${mrpSection ? " mrp-v2" : ""}`}
    >
      {sectionCommands && <PageCommandsSlot commands={sectionCommands} />}
      <ManufacturingPageHeader
        title={manufacturingSections[section].title}
        description={manufacturingSections[section].description}
        count={listSection ? listCount : null}
        countLabel={
          section === "manufacturing-work-centers"
            ? `kayıt · günlük kapasite ${activeWorkCenterCapacity.toLocaleString("tr-TR")} dk`
            : undefined
        }
        meta={
          mrpSection ? (
            <>
              <span>{boms.length.toLocaleString("tr-TR")}</span> <span>reçete</span> ·{" "}
              <span>{workCenters.length.toLocaleString("tr-TR")}</span> <span>iş merkezi</span> ·{" "}
              <span>{warehouses.length.toLocaleString("tr-TR")}</span> <span>depo</span>
            </>
          ) : undefined
        }
      />
      {error && !trackingOrder && !(section === "manufacturing-work-centers" && wcCreating) && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {notice && <div className="notice">{notice}</div>}
      <div className="manufacturing-grid">
        {section === "manufacturing-recipes" && (
          <ManufacturingRecipeList
            boms={boms}
            filteredBoms={filteredBoms}
            pagedBoms={pagedBoms}
            fields={recipeScreenFields}
            loading={loading}
            active={!busy}
            search={recipeSearch}
            setSearch={setRecipeSearch}
            status={recipeStatus}
            setStatus={setRecipeStatus}
            onRefresh={refreshList}
            page={recipePage}
            setPage={setRecipePage}
            currentId={currentRecipe?.id ?? null}
            onCurrentChange={(id) => setSelectedRecipeId(id ?? "")}
            onOpen={beginEditBom}
            exportActionsRef={recipeGridExportRef}
          />
        )}
      </div>
      {section === "manufacturing-work-centers" && (
        <DefinitionLayout
          rootRef={workCenterDefRef}
          className="work-center-def"
          paneOpen={wcCreating || !!selectedWorkCenter}
          paneLabel="İş merkezi kaydı"
          list={
            <>
        <ListToolbar
          search={workCenterSearch}
          onSearchChange={setWorkCenterSearch}
          searchLabel="İş merkezlerinde ara"
          searchPlaceholder="Kod veya ad ara"
          onRefresh={refreshList}
          toolsSlotRef={setWorkCenterToolsSlot}
        >
          <ListChipGroup
            label="Durum"
            value={workCenterStatus}
            onChange={setWorkCenterStatus}
            allowClear
            options={[
              { value: "Active", label: "Aktif", count: activeWorkCenterCount },
              {
                value: "Inactive",
                label: "Pasif",
                count: workCenters.length - activeWorkCenterCount,
              },
            ]}
          />
        </ListToolbar>
          <section
            className="work-center-card work-center-list-card"
            aria-label="Tanımlı iş merkezleri"
          >
            {workCenters.length === 0 ? (
              <div className="manufacturing-empty">
                <Factory size={22} />
                <b>Henüz iş merkezi tanımlanmamış</b>
                <span>
                  Üretim kapasitesini planlamak için önce bir iş merkezi
                  tanımlayın.
                </span>
              </div>
            ) : (
              <div className="manufacturing-table-wrap work-center-list-table list-v2-list">
                <AdvancedDataGrid
                  gridId="manufacturing-work-centers"
                  {...screenViewGridDefaults(visibleWorkCenterFields)}
                  externalPagination
                  hideSearch
                  enableRowSelection={false}
                  toolbarContainer={workCenterToolsSlot}
                  hideExport
                  exportActionsRef={workCenterGridExportRef}
                  aria-label="İş merkezi kayıtları"
                  selectable
                  currentRowKey={calendarCenterId || null}
                  onCurrentRowChange={(id) => {
                    if (id) void openWorkCenter(id);
                  }}
                >
                  <thead>
                    <tr>
                      {visibleWorkCenterFields.map((field) => (
                        <th
                          key={field.key}
                          className={WORK_CENTER_NUMBER_FIELDS.has(field.key) ? "nx-num" : undefined}
                        >
                          {field.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWorkCenters.map((center) => (
                      <tr key={center.id} data-record-id={center.id} tabIndex={0}>
                        {visibleWorkCenterFields.map((field) => (
                          <td
                            key={field.key}
                            className={
                              WORK_CENTER_NUMBER_FIELDS.has(field.key)
                                ? "nx-num"
                                : field.key === "code"
                                  ? "nx-code"
                                  : undefined
                            }
                          >
                            {renderWorkCenterCell(center, field.key)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </AdvancedDataGrid>
              </div>
            )}
          </section>
            </>
          }
          pane={
            wcCreating ? (
              <section id="mfg-wc-create" className="inv-rf-embedded mfg-wc-embedded">
                <RecordFormPage
                  variant="dialog"
                  className="mfg-rf"
                  title="İş Merkezi Tanımlama"
                  mode="create"
                  busy={busy}
                  saveLabel="İş Merkezini Kaydet"
                  onSubmit={(event) =>
                    void createWorkCenter(event, (id) => {
                      setWcCreating(false);
                      setNotice("İş merkezi oluşturuldu.");
                      void refresh().then(() => {
                        if (id) changeCalendarCenter(id);
                      });
                    })
                  }
                  onCancel={() => void closeWorkCenterPane()}
                  error={error}
                  onDismissError={() => setError("")}
                >
                  {workCenterFormBody(
                    "Çekirdek alanlar kayıttan sonra değiştirilemez; çalışma takvimi ve kurulum kuralları bu ekrandan ayarlanır.",
                  )}
                </RecordFormPage>
              </section>
            ) : !selectedWorkCenter ? (
              <DefinitionEmptyPane>
                Bir iş merkezi seçin ya da F2 ile yeni iş merkezi ekleyin.
              </DefinitionEmptyPane>
            ) : (
          <aside
            className="work-center-card work-center-detail"
            aria-label="Seçili iş merkezi ayrıntısı"
          >
            {!selectedWorkCenter ? (
              <div className="manufacturing-empty" role="status">
                Çalışma takvimi ayarları için önce bir iş merkezi tanımlayın.
              </div>
            ) : (
              <>
                <div className="list-v2-detail-head">
                  <div>
                    <span className="list-v2-kind">İş merkezi</span>
                    <h2>{selectedWorkCenter.name}</h2>
                    <small className="work-center-detail-code">
                      {selectedWorkCenter.code}
                    </small>
                  </div>
                  {/* Below 1280px the record is a drawer over an inert list: this (or Esc) closes it. */}
                  <button
                    type="button"
                    className="work-center-detail-close"
                    aria-label="Detay panelini kapat"
                    title="Detay panelini kapat"
                    onClick={() => void closeWorkCenterPane()}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
                <div
                  className="list-v2-tabs"
                  role="tablist"
                  aria-label="İş merkezi ayrıntı sekmeleri"
                >
                  {(
                    [
                      ["calendar", "Çalışma takvimi"],
                      ["general", "Genel"],
                      ["exceptions", "İstisnalar"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={workCenterTab === key}
                      className={workCenterTab === key ? "is-active" : ""}
                      onClick={() => setWorkCenterTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {workCenterTab === "general" ? (
                  <div className="work-center-tab-body">
                    <dl className="list-v2-facts">
                      <div>
                        <dt>Günlük kapasite</dt>
                        <dd>
                          {selectedWorkCenter.capacityMinutesPerDay.toLocaleString(
                            "tr-TR",
                          )}{" "}
                          dk
                        </dd>
                      </div>
                      <div>
                        <dt>İşçilik / saat</dt>
                        <dd>
                          {selectedWorkCenter.laborCostPerHourBase.toLocaleString(
                            "tr-TR",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Genel gider / saat</dt>
                        <dd>
                          {selectedWorkCenter.overheadCostPerHourBase.toLocaleString(
                            "tr-TR",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Durum</dt>
                        <dd>
                          {renderWorkCenterCell(selectedWorkCenter, "status")}
                        </dd>
                      </div>
                      <div>
                        <dt>Vardiya</dt>
                        <dd>
                          {minuteOfDayLabel(
                            selectedWorkCenter.shiftStartMinuteOfDay,
                          )}{" "}
                          –{" "}
                          {minuteOfDayLabel(
                            selectedWorkCenter.shiftEndMinuteOfDay,
                          )}
                        </dd>
                      </div>
                    </dl>
                  <section
                    className="work-center-calendar"
                    aria-labelledby="setup-rules-title"
                  >
                    <div className="calendar-title">
                      <div>
                        <h3 id="setup-rules-title">Sıralı kurulum kuralları</h3>
                        <p>
                          Kurulum aileleri arasındaki dakika süresini veya üretimi
                          engelleyen geçişleri tanımlayın. Kurallar yeni emir
                          oluşturulurken anlık görüntüye alınır.
                        </p>
                      </div>
                    </div>
                    {!workCenters.length ? (
                      <div className="manufacturing-empty" role="status">
                        Kurulum kuralı eklemek için önce bir iş merkezi tanımlayın.
                      </div>
                    ) : !setupRulesReady ? (
                      <div className="manufacturing-empty">
                        Kurulum kuralları yükleniyor…
                      </div>
                    ) : (
                      <>
                        <div className="calendar-override-list">
                          {setupRules.map((rule, index) => (
                            <div
                              className="calendar-override-row"
                              key={`${rule.fromSetupFamilyCode}-${rule.toSetupFamilyCode}`}
                            >
                              <label>
                                Önceki aile
                                <input
                                  value={rule.fromSetupFamilyCode}
                                  maxLength={48}
                                  onChange={(e) =>
                                    setSetupRules((rows) =>
                                      rows.map((x, i) =>
                                        i === index
                                          ? {
                                              ...x,
                                              fromSetupFamilyCode: e.target.value,
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                Sonraki aile
                                <input
                                  value={rule.toSetupFamilyCode}
                                  maxLength={48}
                                  onChange={(e) =>
                                    setSetupRules((rows) =>
                                      rows.map((x, i) =>
                                        i === index
                                          ? { ...x, toSetupFamilyCode: e.target.value }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                Geçiş dk
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  disabled={!rule.isTransitionAllowed}
                                  value={rule.setupMinutes}
                                  onChange={(e) =>
                                    setSetupRules((rows) =>
                                      rows.map((x, i) =>
                                        i === index
                                          ? {
                                              ...x,
                                              setupMinutes: Number(e.target.value),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                İzin ver
                                <input
                                  type="checkbox"
                                  checked={rule.isTransitionAllowed}
                                  onChange={(e) =>
                                    setSetupRules((rows) =>
                                      rows.map((x, i) =>
                                        i === index
                                          ? {
                                              ...x,
                                              isTransitionAllowed: e.target.checked,
                                              setupMinutes: e.target.checked
                                                ? x.setupMinutes
                                                : 0,
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="manufacturing-remove"
                                aria-label="Geçiş kuralını kaldır"
                                onClick={() =>
                                  setSetupRules((rows) =>
                                    rows.filter((_, i) => i !== index),
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        {hasDuplicateSetupRule && (
                          <small className="mrp-demand-error" role="alert">
                            Aynı önceki/sonraki aile çifti bir kez tanımlanabilir;
                            baştaki/sondaki boşluk ve harf büyüklüğü dikkate alınmaz.
                          </small>
                        )}
                        {setupRules.some(
                          (rule) =>
                            !rule.fromSetupFamilyCode.trim() &&
                            !rule.toSetupFamilyCode.trim(),
                        ) && (
                          <small className="mrp-demand-error" role="alert">
                            En az bir aile kodu girin; iki aile kodu aynı anda boş
                            bırakılamaz.
                          </small>
                        )}
                        <div className="calendar-save-row">
                          <button
                            className="secondary"
                            type="button"
                            disabled={busy || setupRules.length >= 500}
                            onClick={() =>
                              setSetupRules((rows) => [
                                ...rows,
                                {
                                  fromSetupFamilyCode: "",
                                  toSetupFamilyCode: "",
                                  setupMinutes: 0,
                                  isTransitionAllowed: true,
                                },
                              ])
                            }
                          >
                            Geçiş ekle
                          </button>
                          <button
                            className="primary"
                            type="button"
                            disabled={
                              busy ||
                              !calendarCenterId ||
                              hasDuplicateSetupRule ||
                              setupRules.some(
                                (rule) =>
                                  !rule.fromSetupFamilyCode.trim() &&
                                  !rule.toSetupFamilyCode.trim(),
                              )
                            }
                            onClick={() => void saveSetupRules()}
                          >
                            Kuralları kaydet
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                  </div>
                ) : calendarLoading ? (
                  <div className="manufacturing-empty">Takvim yükleniyor…</div>
                ) : (
                  <div className="work-center-tab-body">
                    {!calendarReady && (
                      <div className="manufacturing-empty work-center-calendar-retry" role="alert">
                        <span>Takvim yüklenemedi.</span>
                        <button
                          type="button"
                          className="secondary small-button"
                          onClick={() => setCalendarReloadKey((key) => key + 1)}
                        >
                          Yeniden dene
                        </button>
                      </div>
                    )}
                    {workCenterTab === "calendar" ? (
                      <>
                        <div className="work-center-field">
                          <span>Çalışma günleri</span>
                          <div
                            className="work-calendar-segments"
                            role="group"
                            aria-label="Haftalık çalışma günleri"
                          >
                            {[
                              { label: "Pt", title: "Pazartesi", bit: 1 },
                              { label: "Sa", title: "Salı", bit: 2 },
                              { label: "Ça", title: "Çarşamba", bit: 3 },
                              { label: "Pe", title: "Perşembe", bit: 4 },
                              { label: "Cu", title: "Cuma", bit: 5 },
                              { label: "Ct", title: "Cumartesi", bit: 6 },
                              { label: "Pz", title: "Pazar", bit: 0 },
                            ].map((day) => {
                              const on = (calendarMask & (1 << day.bit)) !== 0;
                              return (
                                <button
                                  key={day.bit}
                                  type="button"
                                  title={day.title}
                                  aria-label={day.title}
                                  aria-pressed={on}
                                  className={on ? "is-on" : ""}
                                  disabled={!calendarReady}
                                  onClick={() =>
                                    setCalendarMask(
                                      (mask) => mask ^ (1 << day.bit),
                                    )
                                  }
                                >
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="work-center-shift-row">
                          <label>
                            Vardiya başlangıcı
                            <input
                              type="time"
                              disabled={!calendarReady}
                              value={calendarShiftStart}
                              onChange={(e) =>
                                setCalendarShiftStart(e.target.value)
                              }
                            />
                          </label>
                          <label>
                            Vardiya bitişi
                            <input
                              type="time"
                              disabled={!calendarReady}
                              value={calendarShiftEnd}
                              onChange={(e) =>
                                setCalendarShiftEnd(e.target.value)
                              }
                            />
                          </label>
                        </div>
                        <small className="work-center-note">
                          Öncelik: tarih istisnası › yıllık kural › haftalık
                          takvim
                        </small>
                      </>
                    ) : (
                      <>
                        <form
                          className="calendar-override-form"
                          onSubmit={addCapacityOverride}
                        >
                          <label>
                            Tarih
                            <input
                              type="date"
                              disabled={!calendarReady}
                              value={calendarDate}
                              onChange={(e) => setCalendarDate(e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Kapasite (dk)
                            <input
                              type="number"
                              min="0"
                              max="1440"
                              disabled={!calendarReady}
                              value={calendarCapacity}
                              onChange={(e) => setCalendarCapacity(e.target.value)}
                              required
                            />
                            <small>0 dakika, o günün kapalı olduğunu belirtir.</small>
                          </label>
                          <label>
                            Açıklama
                            <input
                              disabled={!calendarReady}
                              value={calendarNote}
                              onChange={(e) => setCalendarNote(e.target.value)}
                              maxLength={200}
                              placeholder="Bakım, tatil veya ek vardiya"
                            />
                          </label>
                          <button
                            className="secondary"
                            disabled={
                              !calendarReady ||
                              (calendarOverrides.length >= 366 &&
                                !calendarOverrides.some(
                                  (x) => x.workDate === calendarDate,
                                ))
                            }
                          >
                            İstisna ekle
                          </button>
                        </form>
                        {calendarOverrides.length > 0 ? (
                          <div
                            className="calendar-override-list"
                            aria-label="Tarih bazlı kapasite istisnaları"
                          >
                            {calendarOverrides.map((row) => (
                              <div className="calendar-override-row" key={row.workDate}>
                                <b>
                                  {new Date(
                                    `${row.workDate}T12:00:00`,
                                  ).toLocaleDateString("tr-TR")}
                                </b>
                                <span>
                                  {row.capacityMinutes === 0
                                    ? "Kapalı"
                                    : `${row.capacityMinutes} dk kapasite`}
                                </span>
                                <small>{row.note || "Açıklama yok"}</small>
                                <button
                                  type="button"
                                  disabled={!calendarReady}
                                  className="manufacturing-remove"
                                  aria-label={`${row.workDate} istisnasını sil`}
                                  onClick={() =>
                                    setCalendarOverrides((rows) =>
                                      rows.filter((x) => x.workDate !== row.workDate),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="manufacturing-empty">
                            Tarih bazlı kapasite istisnası yok.
                          </div>
                        )}
                        <div className="calendar-title">
                          <div>
                            <h3>Her yıl tekrarlanan kapasite kuralı</h3>
                            <p>
                              Örneğin resmî tatil veya bakım günü tanımlayın. 29 Şubat
                              kuralı yalnızca artık yıllarda uygulanır.
                            </p>
                          </div>
                        </div>
                        <form
                          className="calendar-override-form annual-capacity-form"
                          onSubmit={addAnnualCapacityRule}
                        >
                          <label>
                            Ay
                            <input
                              type="number"
                              min="1"
                              max="12"
                              disabled={!calendarReady}
                              value={annualMonth}
                              onChange={(e) => setAnnualMonth(e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Gün
                            <input
                              type="number"
                              min="1"
                              max="31"
                              disabled={!calendarReady}
                              value={annualDay}
                              onChange={(e) => setAnnualDay(e.target.value)}
                              required
                            />
                            <small>
                              29 Şubat desteklenir; geçersiz günler reddedilir.
                            </small>
                          </label>
                          <label>
                            Kapasite (dk)
                            <input
                              type="number"
                              min="0"
                              max="1440"
                              disabled={!calendarReady}
                              value={annualCapacity}
                              onChange={(e) => setAnnualCapacity(e.target.value)}
                              required
                            />
                            <small>0 dakika, her yıl o günü kapatır.</small>
                          </label>
                          <label>
                            Açıklama
                            <input
                              disabled={!calendarReady}
                              value={annualNote}
                              onChange={(e) => setAnnualNote(e.target.value)}
                              maxLength={200}
                              placeholder="Yıllık bakım veya tatil"
                            />
                          </label>
                          <button
                            className="secondary"
                            disabled={
                              !calendarReady ||
                              (annualCapacityRules.length >= 366 &&
                                !annualCapacityRules.some(
                                  (x) =>
                                    x.month === Number(annualMonth) &&
                                    x.day === Number(annualDay),
                                ))
                            }
                          >
                            Yıllık kural ekle
                          </button>
                        </form>
                        {annualCapacityRules.length > 0 ? (
                          <div
                            className="calendar-override-list"
                            aria-label="Yıllık kapasite kuralları"
                          >
                            {annualCapacityRules.map((row) => (
                              <div
                                className="calendar-override-row"
                                key={`${row.month}-${row.day}`}
                              >
                                <b>
                                  {String(row.day).padStart(2, "0")}.
                                  {String(row.month).padStart(2, "0")} · her yıl
                                </b>
                                <span>
                                  {row.capacityMinutes === 0
                                    ? "Kapalı"
                                    : `${row.capacityMinutes} dk kapasite`}
                                </span>
                                <small>
                                  {row.note || "Açıklama yok"}
                                  {row.month === 2 && row.day === 29
                                    ? " · yalnızca artık yıllarda"
                                    : ""}
                                </small>
                                <button
                                  type="button"
                                  disabled={!calendarReady}
                                  className="manufacturing-remove"
                                  aria-label={`${row.day}.${row.month} yıllık kuralını sil`}
                                  onClick={() =>
                                    setAnnualCapacityRules((rows) =>
                                      rows.filter(
                                        (x) =>
                                          x.month !== row.month || x.day !== row.day,
                                      ),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="manufacturing-empty">
                            Yıllık tekrar kuralı yok.
                          </div>
                        )}
                        <div className="calendar-title">
                          <div>
                            <h3>Dönüşümlü vardiya planları</h3>
                            <p>
                              Başlangıç tarihinden itibaren gün sırasıyla tekrar eden
                              vardiya döngüleri tanımlayın. Kesin tarih kapasite
                              istisnası ve yıllık kapasite kuralı günlük kapasiteyi
                              öncelikli belirler; vardiya aralığı dönüşümlü plandan
                              alınır.
                            </p>
                          </div>
                        </div>
                        <form
                          className="calendar-override-form annual-capacity-form"
                          onSubmit={addShiftRotation}
                        >
                          <label>
                            Etkin başlangıç
                            <input
                              type="date"
                              disabled={!calendarReady}
                              value={rotationFrom}
                              onChange={(e) => setRotationFrom(e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Etkin bitiş (isteğe bağlı)
                            <input
                              type="date"
                              disabled={!calendarReady}
                              value={rotationTo}
                              onChange={(e) => setRotationTo(e.target.value)}
                            />
                          </label>
                          <label>
                            Döngü gün sayısı
                            <input
                              type="number"
                              min="1"
                              max="366"
                              disabled={!calendarReady}
                              value={rotationLength}
                              onChange={(e) => setRotationLength(e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Vardiya başlangıcı
                            <input
                              type="time"
                              disabled={!calendarReady}
                              value={rotationStart}
                              onChange={(e) => setRotationStart(e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Vardiya bitişi
                            <input
                              type="time"
                              disabled={!calendarReady}
                              value={rotationEnd}
                              onChange={(e) => setRotationEnd(e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Günlük kapasite (dk)
                            <input
                              type="number"
                              min="0"
                              max="1440"
                              disabled={!calendarReady}
                              value={rotationCapacity}
                              onChange={(e) => setRotationCapacity(e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Açıklama
                            <input
                              disabled={!calendarReady}
                              value={rotationNote}
                              onChange={(e) => setRotationNote(e.target.value)}
                              maxLength={200}
                              placeholder="Örn. 2 vardiyalı döngü"
                            />
                          </label>
                          <button
                            className="secondary"
                            disabled={!calendarReady || shiftRotations.length >= 100}
                          >
                            Döngü ekle
                          </button>
                        </form>
                        {shiftRotations.length > 0 ? (
                          <div
                            className="calendar-override-list"
                            aria-label="Dönüşümlü vardiya planları"
                          >
                            {shiftRotations.map((rotation, rotationIndex) => (
                              <div
                                className="calendar-override-row rotation-row"
                                key={`${rotation.effectiveFromDate}-${rotationIndex}`}
                              >
                                <div className="rotation-header">
                                  <b>
                                    {rotation.effectiveFromDate} –{" "}
                                    {rotation.effectiveToDate || "süresiz"}
                                  </b>
                                  <small>
                                    {rotation.note ||
                                      `${rotation.days.length} günlük döngü`}
                                  </small>
                                  <button
                                    type="button"
                                    disabled={!calendarReady}
                                    className="manufacturing-remove"
                                    aria-label="Vardiya planını sil"
                                    onClick={() =>
                                      setShiftRotations((rows) =>
                                        rows.filter((_, i) => i !== rotationIndex),
                                      )
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                                <div className="rotation-days">
                                  {rotation.days.map((day, index) => (
                                    <div className="rotation-day" key={day.dayIndex}>
                                      <b>Döngü günü {day.dayIndex + 1}</b>
                                      <label>
                                        Kapasite (dk)
                                        <input
                                          type="number"
                                          min="0"
                                          max="1440"
                                          disabled={!calendarReady}
                                          value={day.capacityMinutes}
                                          onChange={(e) =>
                                            setShiftRotations((rows) =>
                                              rows.map((r, i) =>
                                                i === rotationIndex
                                                  ? {
                                                      ...r,
                                                      days: r.days.map((d, j) =>
                                                        j === index
                                                          ? {
                                                              ...d,
                                                              capacityMinutes: Number(
                                                                e.target.value,
                                                              ),
                                                            }
                                                          : d,
                                                      ),
                                                    }
                                                  : r,
                                              ),
                                            )
                                          }
                                        />
                                      </label>
                                      <label>
                                        Başlangıç
                                        <input
                                          type="time"
                                          disabled={!calendarReady}
                                          value={minuteTime(day.shiftStartMinuteOfDay)}
                                          onChange={(e) =>
                                            setShiftRotations((rows) =>
                                              rows.map((r, i) =>
                                                i === rotationIndex
                                                  ? {
                                                      ...r,
                                                      days: r.days.map((d, j) =>
                                                        j === index
                                                          ? {
                                                              ...d,
                                                              shiftStartMinuteOfDay:
                                                                timeMinute(
                                                                  e.target.value,
                                                                ),
                                                            }
                                                          : d,
                                                      ),
                                                    }
                                                  : r,
                                              ),
                                            )
                                          }
                                        />
                                      </label>
                                      <label>
                                        Bitiş
                                        <input
                                          type="time"
                                          disabled={!calendarReady}
                                          value={minuteTime(day.shiftEndMinuteOfDay)}
                                          onChange={(e) =>
                                            setShiftRotations((rows) =>
                                              rows.map((r, i) =>
                                                i === rotationIndex
                                                  ? {
                                                      ...r,
                                                      days: r.days.map((d, j) =>
                                                        j === index
                                                          ? {
                                                              ...d,
                                                              shiftEndMinuteOfDay:
                                                                timeMinute(
                                                                  e.target.value,
                                                                ),
                                                            }
                                                          : d,
                                                      ),
                                                    }
                                                  : r,
                                              ),
                                            )
                                          }
                                        />
                                      </label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="manufacturing-empty">
                            Dönüşümlü vardiya planı yok.
                          </div>
                        )}
                      </>
                    )}
                    <div className="calendar-save-row">
                      <small>
                        Kaydedilen takvim bu iş merkezinin üretim emirlerini
                        çizelgelerken uygulanır.
                      </small>
                      <button
                        className="primary"
                        type="button"
                        disabled={busy || !calendarReady || !calendarCenterId}
                        onClick={() => void saveWorkCenterCalendar()}
                      >
                        {busy ? "Kaydediliyor…" : "Takvimi kaydet"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
            )
          }
        />
      )}
      {section === "manufacturing-orders" && !createOrderPage && (
        <div className="manufacturing-order-stack">
          <ListSummaryCards cards={orderSummaryCards} />
          <ListToolbar
            search={orderSearchDraft}
            onSearchChange={setOrderSearchDraft}
            onSearchApply={() => {
              setOrderSearch(orderSearchDraft.trim());
              setOrderPage(1);
            }}
            searchLabel="Üretim emirlerinde ara"
            searchPlaceholder="Emir, reçete, depo veya sipariş ara"
            onRefresh={refreshList}
            toolsSlotRef={setOrderToolsSlot}
          >
            <ListChipGroup
              label="Durum"
              value={orderStatus}
              onChange={(value) => {
                setOrderStatus(value);
                setOrderPage(1);
              }}
              allowClear
              options={["Planned", "Released", "Completed", "Cancelled"].map(
                (value) => ({ value, label: statusLabel[value] }),
              )}
            />
            <SalesListPanelToggle open={orderPanel.open} onToggle={orderPanel.toggle} />
          </ListToolbar>
          <div
            ref={orderListBodyRef}
            className={`sales-list-body${orderPanelNode ? " has-detail" : ""}`}
          >
            <section
              className="manufacturing-order-list list-v2-list"
              aria-label="Üretim emirleri"
            >
              <SalesDocumentGrid
                gridId="manufacturing-orders"
                ariaLabel="Üretim emri kayıtları"
                hideExport
                exportActionsRef={orderGridExportRef}
                fields={visibleOrderFields}
                items={pageOrders}
                loading={loading && orders.length === 0}
                loadingMessage="Üretim emirleri yükleniyor…"
                emptyMessage={orderStatus ? "Filtreyle eşleşen üretim emri yok" : "Henüz üretim emri yok. Bir reçete oluşturduktan sonra ilk emri planlayabilirsiniz."}
                search={orderSearch}
                searchEmptyMessage="Filtreyle eşleşen üretim emri yok"
                toolbarContainer={orderToolsSlot}
                renderCell={(field, order) => renderOrderCell(field.key, order)}
                selection={orderGridSelection}
                footer={
                  <SalesListFooter
                    ticked={orderTicked.length}
                    shown={pageOrders.length}
                    total={ordersTotalCount}
                    page={orderPage}
                    pageSize={orderPageSize}
                    loading={loading}
                    onPageChange={setOrderPage}
                  />
                }
                columnWidths={ORDER_LIST_WIDTHS}
                numberFields={ORDER_NUMBER_FIELDS}
                codeFields={ORDER_CODE_FIELDS}
              />
            </section>
            {orderPanelNode}
          </div>
        </div>
      )}
      {section === "manufacturing-mrp" && (
        <div className="mrp-layout">
          <section className="mrp-card mrp-inputs" aria-labelledby="mrp-inputs-title">
            <h2 id="mrp-inputs-title">Plan girdileri</h2>
            <form className="mrp-input-form" onSubmit={runMrp}>
              <div className="mrp-input-row">
                <label>
                  Planlama deposu
                  <SearchableRecordPicker
                    options={warehouses.map((x) => ({
                      id: x.id,
                      label: `${x.code} · ${x.name}`,
                    }))}
                    selectedId={warehouseId}
                    onSelect={setWarehouseId}
                    title="Planlama deposu seçin"
                    placeholder="Depo seçin"
                    searchPlaceholder="Depo kodu veya adıyla ara"
                    emptyMessage="Aramanızla eşleşen depo bulunamadı."
                    required
                  />
                </label>
                <label>
                  Plan tarihi
                  <input
                    type="date"
                    value={mrpPlanDate}
                    onChange={(e) => setMrpPlanDate(e.target.value)}
                    required
                  />
                </label>
              </div>
              <small className="mrp-muted">
                Kapsam: açık satış siparişleri + ek talepler
              </small>
              <div className="mrp-demand-table" role="table" aria-label="Ek talepler">
                <div className="mrp-demand-head" role="row">
                  <span role="columnheader">Ek talep · stok kartı</span>
                  <span role="columnheader">Miktar</span>
                  <span role="columnheader">İhtiyaç</span>
                  <span role="columnheader" aria-label="Kaldır" />
                </div>
                {mrpDemands.map((demand, index) => (
                  <div className="mrp-demand-line" role="row" key={index}>
                    <SearchableRecordPicker
                      options={items.map((x) => ({
                        id: x.id,
                        label: `${x.code} · ${x.name}`,
                        description: x.unitCode,
                        searchText: x.unitCode,
                      }))}
                      selectedId={demand.stockItemId}
                      onSelect={(id) =>
                        setMrpDemands((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, stockItemId: id } : row,
                          ),
                        )
                      }
                      onSearchChange={searchStockItems}
                      title="Stok kartı seçin"
                      placeholder="Stok kartı seçin"
                      searchPlaceholder="Stok kodu veya adıyla ara"
                      emptyMessage="Aramanızla eşleşen stok kartı bulunamadı."
                      required
                    />
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      aria-label="Miktar"
                      value={demand.quantity}
                      onChange={(e) =>
                        setMrpDemands((rows) =>
                          rows.map((row, i) =>
                            i === index
                              ? { ...row, quantity: e.target.value }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                    <input
                      type="date"
                      aria-label="İhtiyaç tarihi"
                      value={demand.requiredByDate}
                      onChange={(e) =>
                        setMrpDemands((rows) =>
                          rows.map((row, i) =>
                            i === index
                              ? { ...row, requiredByDate: e.target.value }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                    <button
                      type="button"
                      className="manufacturing-remove"
                      aria-label="Talebi kaldır"
                      disabled={mrpDemands.length <= 1}
                      onClick={() =>
                        setMrpDemands((rows) =>
                          rows.filter((_, i) => i !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="mrp-demand-foot">
                  <button
                    type="button"
                    className="mrp-link-button"
                    disabled={mrpDemands.length >= 100}
                    onClick={() =>
                      setMrpDemands((rows) => [
                        ...rows,
                        {
                          stockItemId: "",
                          quantity: "1",
                          requiredByDate: mrpPlanDate,
                        },
                      ])
                    }
                  >
                    {`+ Talep ekle (${mrpDemands.length}/100)`}
                  </button>
                </div>
              </div>
              {hasDuplicateMrpDemand && (
                <small className="mrp-demand-error" role="alert">
                  Aynı stok kartı ve ihtiyaç tarihi bir kez eklenebilir.
                </small>
              )}
              <button className="primary mrp-run-button" disabled={mrpRunDisabled}>
                Planı hesapla ve kaydet
              </button>
              {mrpRunDisabled && !busy && !hasDuplicateMrpDemand && (
                <small className="mrp-muted">
                  Depo ve en az bir talep seçildiğinde etkin olur.
                </small>
              )}
            </form>
          </section>
          <section className="mrp-card mrp-results" aria-labelledby="mrp-results-title">
            <div className="mrp-results-head">
              <h2 id="mrp-results-title">Plan sonucu</h2>
              <small className="mrp-muted">
                Son plan:{" "}
                {mrpLatestPlanAt
                  ? new Date(mrpLatestPlanAt).toLocaleString("tr-TR")
                  : "—"}
              </small>
            </div>
            {mrpCounts && (
              <div className="mrp-stat-tiles">
                <div>
                  <span>Üretim önerisi</span>
                  <b>{mrpCounts.make.toLocaleString("tr-TR")}</b>
                </div>
                <div>
                  <span>Satın alma önerisi</span>
                  <b>{mrpCounts.buy.toLocaleString("tr-TR")}</b>
                </div>
                <div>
                  <span>Eksik / sorunlu</span>
                  <b>{mrpCounts.issues.toLocaleString("tr-TR")}</b>
                </div>
              </div>
            )}
            {mrpHistory.length > 0 && (
              <div
                className="work-center-chips"
                aria-label="Kaydedilmiş MRP planları"
              >
                {mrpHistory.map((x) => (
                  <button
                    className="secondary small-button"
                    type="button"
                    key={x.id}
                    disabled={busy}
                    onClick={() => void openMrpPlan(x.id)}
                  >
                    {x.planDate} · {new Date(x.createdAt).toLocaleString("tr-TR")}
                  </button>
                ))}
              </div>
            )}
            {mrpPlan && (
              <>
                <p className="mrp-caveat">
                  Kaydedilmiş plan {mrpPlan.planId?.slice(0, 8)} · Açık satış
                  siparişleri dahil. {mrpPlan.supplyCaveat}
                </p>
                {mrpPlan.lines.length === 0 ? (
                  <div className="manufacturing-empty">
                    Karşılanmamış malzeme ihtiyacı bulunamadı.
                  </div>
                ) : (
                  <div className="manufacturing-table-wrap">
                    <AdvancedDataGrid
                      hideSearch
                      gridId="manufacturing-mrp-lines"
                      {...screenViewGridDefaults(visibleMrpFields)}
                    >
                      <thead>
                        <ScreenViewGroupHeader fields={visibleMrpFields} />
                        <tr>
                          {visibleMrpFields.map((field) => (
                            <th key={field.key}>{field.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mrpPlan.lines.map((x, i) => (
                          <tr
                            key={`${x.stockItemId}-${x.level}-${i}-${x.requiredByDate}`}
                          >
                            {visibleMrpFields.map((field) => (
                              <td key={field.key}>
                                {field.key === "stockItem" ? (
                                  <>
                                    <span
                                      className="mrp-item"
                                      style={{ paddingLeft: `${x.level * 18}px` }}
                                    >
                                      <b>{x.stockCode}</b>
                                      <small>{x.stockName}</small>
                                    </span>
                                    {x.issue && (
                                      <small className="mrp-issue">
                                        {x.issue}
                                      </small>
                                    )}
                                  </>
                                ) : field.key === "level" ? (
                                  x.level
                                ) : field.key === "grossRequirement" ? (
                                  `${x.grossRequirement.toLocaleString("tr-TR")} ${x.unitCode}`
                                ) : field.key === "onHandAndReserved" ? (
                                  `${x.fromOnHand.toLocaleString("tr-TR")} / ${x.reserved.toLocaleString("tr-TR")}`
                                ) : field.key === "openPurchaseOrders" ? (
                                  x.fromOpenPurchaseOrders.toLocaleString("tr-TR")
                                ) : field.key === "openManufacturingOrders" ? (
                                  x.fromOpenManufacturingOrders.toLocaleString(
                                    "tr-TR",
                                  )
                                ) : field.key === "netRequirement" ? (
                                  <b>
                                    {x.netRequirement.toLocaleString("tr-TR")}{" "}
                                    {x.unitCode}
                                  </b>
                                ) : field.key === "requiredByDate" ? (
                                  x.requiredByDate
                                ) : field.key === "recommendedOrderDate" ? (
                                  x.recommendedOrderDate
                                ) : field.key === "recommendation" ? (
                                  <span
                                    className={`mrp-recommendation ${x.recommendation === "Üret" ? "make" : x.recommendation === "Satın al" ? "buy" : "covered"}`}
                                  >
                                    {x.recommendation}
                                  </span>
                                ) : null}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </AdvancedDataGrid>
                  </div>
                )}
                {mrpPlan.lines.some(
                  (x, i) =>
                    x.issue === null &&
                    ["Üret", "Satın al"].includes(x.recommendation) &&
                    !mrpPlan.convertedLineIndexes?.includes(i),
                ) && (
                  <div className="mrp-conversion">
                    <h3>Önerileri uygulamaya hazırla</h3>
                    <p>
                      Üretim önerileri taslak emir, satın alma önerileri onaya
                      gönderilen talep oluşturur. Her satır ayrı seçilebilir.
                    </p>
                    {mrpPlan.lines.map((line, i) => {
                      if (
                        line.issue !== null ||
                        !["Üret", "Satın al"].includes(line.recommendation) ||
                        mrpPlan.convertedLineIndexes?.includes(i)
                      )
                        return null;
                      const checked = mrpSelected.includes(i);
                      return (
                        <div
                          className="mrp-conversion-row"
                          key={`${i}-${line.stockItemId}`}
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setMrpSelected((rows) =>
                                  e.target.checked
                                    ? [...rows, i]
                                    : rows.filter((x) => x !== i),
                                )
                              }
                            />
                            <span>
                              <b>
                                {line.stockCode} · {line.stockName}
                              </b>
                              <small>
                                {line.recommendation}{" "}
                                {line.netRequirement.toLocaleString("tr-TR")}{" "}
                                {line.unitCode} · ihtiyaç {line.requiredByDate}
                              </small>
                              {line.sourceSalesOrder ? (
                                <small>
                                  Kaynak sipariş: {line.sourceSalesOrder.salesOrderCode} · satır {line.sourceSalesOrder.salesOrderLineNumber}
                                </small>
                              ) : line.sources.some((source) => source.startsWith("Satış ")) ? (
                                <small>Birden fazla talep birleşti; sipariş satırı bağlantısı kurulmayacak.</small>
                              ) : null}
                            </span>
                          </label>
                          {line.recommendation === "Üret" && (
                            <select
                              aria-label={`${line.stockCode} reçetesi`}
                              disabled={!checked}
                              value={mrpBomSelections[i] ?? ""}
                              onChange={(e) =>
                                setMrpBomSelections((x) => ({
                                  ...x,
                                  [i]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Ürün reçetesi seçin</option>
                              {boms
                                .filter(
                                  (b) =>
                                    b.isActive &&
                                    b.productStockItemId === line.stockItemId,
                                )
                                .map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.code} · {b.name}
                                  </option>
                                ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                    {mrpSelected.some(
                      (i) => mrpPlan.lines[i]?.recommendation === "Satın al",
                    ) &&
                      purchaseRequestFields
                        .filter((x) => x.isRequired)
                        .map((field) => (
                          <label className="mrp-field" key={field.code}>
                            {field.label}
                            {field.isRequired ? " *" : ""}
                            <input
                              value={purchaseRequestFieldValues[field.code] ?? ""}
                              onChange={(e) =>
                                setPurchaseRequestFieldValues((x) => ({
                                  ...x,
                                  [field.code]: e.target.value,
                                }))
                              }
                              required
                              maxLength={field.maxLength || 500}
                            />
                          </label>
                        ))}
                    <button
                      className="primary"
                      type="button"
                      disabled={
                        busy ||
                        mrpSelected.length === 0 ||
                        mrpSelected.some(
                          (i) =>
                            mrpPlan.lines[i]?.recommendation === "Üret" &&
                            !mrpBomSelections[i],
                        )
                      }
                      onClick={() => void convertMrpPlan()}
                    >
                      Seçili önerileri dönüştür
                    </button>
                  </div>
                )}
              </>
            )}
            {!mrpPlan && (
              <div className="mrp-empty-state">
                Planı hesapladığınızda öneriler ve MRP satırları burada
                listelenir.
              </div>
            )}
          </section>
        </div>
      )}{" "}
      {trackingOrder && (
        <div
          className="manufacturing-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setTrackingOrder(null);
          }}
        >
          <section
            className="manufacturing-modal manufacturing-modal--record-form"
            role="dialog"
            aria-modal="true"
            aria-label={`Üretimi bildir · ${trackingOrder.code}`}
          >
            <RecordFormPage
              variant="dialog"
              title={`Üretimi bildir · ${trackingOrder.code}`}
              mode="create"
              busy={busy}
              saveLabel="Bildir ve Tamamla"
              onSubmit={submitFinishedTracking}
              onCancel={() => {
                if (!busy) setTrackingOrder(null);
              }}
              error={error}
              onDismissError={() => setError("")}
              status={
                <>
                  <span>
                    Planlanan: <b>{trackingOrder.plannedQuantity.toLocaleString("tr-TR")}</b>
                  </span>
                  <span>
                    Bildirilen: <b>{(Number(actualGoodQuantity || 0) + Number(scrapQuantity || 0)).toLocaleString("tr-TR")}</b>
                  </span>
                </>
              }
            >
              <RecordFormGroup title="Üretim Miktarları">
                <small>İyi ürün ve fire miktarını bildirin. Toplam, planlanan miktara eşit olmalıdır.</small>
                <div className="rf-pair">
                  <label>
                    <span>İyi ürün miktarı <RequiredMark /></span>
                    <input
                      className="rf-must rf-num"
                      type="number"
                      min="0.0001"
                      max={trackingOrder.plannedQuantity}
                      step="0.0001"
                      required
                      value={actualGoodQuantity}
                      onChange={(e) => setActualGoodQuantity(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Fire miktarı <RequiredMark /></span>
                    <input
                      className="rf-must rf-num"
                      type="number"
                      min="0"
                      max={trackingOrder.plannedQuantity}
                      step="0.0001"
                      required
                      value={scrapQuantity}
                      onChange={(e) => setScrapQuantity(e.target.value)}
                    />
                  </label>
                </div>
              {Number(scrapQuantity) > 0 && (
                <label>
                  Fire nedeni
                  <textarea
                    value={scrapReason}
                    onChange={(e) => setScrapReason(e.target.value)}
                    required
                    maxLength={500}
                    placeholder="Örn. hammadde hatası, makine arızası"
                  />
                </label>
              )}
              </RecordFormGroup>
              {(trackingProductMode === "Lot" ||
                trackingProductMode === "Serial") && (
                <RecordFormGroup title="Lot / Seri İzleme">
              {boms.find((x) => x.id === trackingOrder.billOfMaterialId)
                ?.productTrackingMode === "Lot" ? (
                <>
                  <label>
                    Lot numarası
                    <input
                      autoFocus
                      value={finishedCode}
                      onChange={(e) => setFinishedCode(e.target.value)}
                      required
                      maxLength={100}
                      placeholder="LOT-2026-001"
                    />
                  </label>
                  <label>
                    Son kullanma tarihi
                    <input
                      type="date"
                      value={finishedExpiry}
                      onChange={(e) => setFinishedExpiry(e.target.value)}
                      required
                    />
                  </label>
                  <small>
                    Lot miktarı iyi ürün miktarı kadar kaydedilir.
                  </small>
                </>
              ) : boms.find((x) => x.id === trackingOrder.billOfMaterialId)
                    ?.productTrackingMode === "Serial" ? (
                <>
                  <label>
                    Seri numaraları
                    <textarea
                      autoFocus
                      value={finishedSerials}
                      onChange={(e) => setFinishedSerials(e.target.value)}
                      required
                      placeholder={
                        "Her satıra bir seri numarası yazın\nSN-0001\nSN-0002"
                      }
                    />
                  </label>
                  <small>
                    {Number(actualGoodQuantity || 0).toLocaleString("tr-TR")} iyi ürün için aynı sayıda benzersiz seri numarası girin. Virgül veya noktalı virgül ayraç olarak kullanılabilir.
                  </small>
                </>
              ) : null}
                </RecordFormGroup>
              )}
            </RecordFormPage>
          </section>
        </div>
      )}
    </div>
  );
}
