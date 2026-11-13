import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import type { ScreenColumnPin } from "./erp-types";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { authenticatedFetch } from "./authApi";
import { Boxes, Factory, Plus } from "lucide-react";
import ScreenViewGroupHeader from "./ScreenViewGroupHeader";
import SearchableRecordPicker from "./SearchableRecordPicker";
import ManufacturingPageHeader from "./manufacturing/components/ManufacturingPageHeader";
import ManufacturingRecipeList, {
  defaultRecipeFields,
} from "./manufacturing/components/ManufacturingRecipeList";
import ManufacturingSummary from "./manufacturing/components/ManufacturingSummary";
import type {
  ManufacturingBom as Bom,
  ManufacturingPageKey,
} from "./manufacturing/types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import "./manufacturing.css";
import "./manufacturing-record-forms.css";
import "./manufacturing/manufacturing-list-v2.css";

export type { ManufacturingPageKey } from "./manufacturing/types";
import { confirmLocalized } from "./locale";

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
type OrderLine = {
  componentStockItemId: string;
  componentCode: string;
  componentName: string;
  requiredQuantity: number;
  standardUnitCostBaseSnapshot: number;
  plannedCostBase: number;
};
type OrderOperation = {
  id: string;
  sequence: number;
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  setupMinutes: number;
  runMinutes: number;
  minimumWaitDaysAfterPrevious: number;
  setupFamilyCode: string;
  sequenceSetupMinutes: number;
  plannedEnergyQuantityKwh: number;
  plannedEnergyCostPerKwhBase: number;
  plannedEnergyCostBase: number;
  plannedCostBase: number;
  scheduledStartDate: string | null;
  scheduledEndDate: string | null;
  scheduledStartMinuteOfDay: number | null;
  scheduledEndMinuteOfDay: number | null;
  scheduledStartSecondOfDay: number | null;
  scheduledEndSecondOfDay: number | null;
  status: string;
  actualSetupMinutes: number | null;
  actualRunMinutes: number | null;
  actualEnergyQuantityKwh: number | null;
  actualEnergyCostPerKwhBase: number | null;
  actualEnergyCostBase: number | null;
  actualCostBase: number | null;
  performedByEmployeeId: string | null;
  performedByEmployeeName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  capacityDays: {
    date: string;
    minutes: number;
    startMinuteOfDay: number;
    endMinuteOfDay: number;
    startSecondOfDay: number;
    endSecondOfDay: number;
  }[];
};
type Order = {
  id: string;
  code: string;
  billOfMaterialId: string;
  billOfMaterialName: string;
  warehouseId: string;
  warehouseName: string;
  plannedQuantity: number;
  sourceSalesOrderId: string | null;
  sourceSalesOrderLineNumber: number | null;
  sourceSalesOrderCode: string | null;
  actualGoodQuantity: number | null;
  scrapQuantity: number | null;
  scrapReason: string | null;
  status: string;
  plannedDate: string;
  completedAt: string | null;
  lines: OrderLine[];
  operations: OrderOperation[];
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
function minuteOfDayLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function renderWorkCenterCell(center: WorkCenter, key: string) {
  switch (key) {
    case "code":
      return <b>{center.code}</b>;
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
        <span
          className={
            center.isActive
              ? "manufacturing-status-active"
              : "manufacturing-status-inactive"
          }
        >
          {center.isActive ? "Aktif" : "Pasif"}
        </span>
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
    [openOrdersCount, setOpenOrdersCount] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState(""),
    [orderPage, setOrderPage] = useState(1),
    [orderSearchDraft, setOrderSearchDraft] = useState(""),
    [orderSearch, setOrderSearch] = useState(""),
    [orderStatus, setOrderStatus] = useState("");
  const orderPageSize = 25,
    orderPageCount = Math.max(1, Math.ceil(ordersTotalCount / orderPageSize)),
    pageOrders = orders;
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  // True when the detail panel has a next workflow step to offer for the selected order.
  const orderDetailHasStep =
    !!selectedOrder &&
    (selectedOrder.status === "Planned" ||
      (selectedOrder.status === "Released" &&
        selectedOrder.operations.every(
          (operation) => operation.status === "Completed",
        )));
  const [editingBomId, setEditingBomId] = useState(""),
    [recipeSearch, setRecipeSearch] = useState(""),
    [recipeStatus, setRecipeStatus] = useState(""),
    [workCenterStatus, setWorkCenterStatus] = useState(""),
    [recipePage, setRecipePage] = useState(1);
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
          body?.title;
        throw new Error(detail || `İstek başarısız (${r.status})`);
      }
      return r.status === 204 ? (undefined as T) : (r.json() as Promise<T>);
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
    setError(failures.join(" · "));
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
          : 0,
      );
    } else if (needOrders) {
      setOrders([]);
      setOrdersTotalCount(0);
      setOpenOrdersCount(0);
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
    if (
      orders.length &&
      !pageOrders.some((order) => order.id === selectedOrderId)
    )
      setSelectedOrderId(pageOrders[0]?.id ?? "");
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
  useEffect(() => {
    if (
      section === "manufacturing-work-centers" &&
      workCenters.length > 0 &&
      !workCenters.some((x) => x.id === calendarCenterId)
    ) {
      changeCalendarCenter(
        (workCenters.find((x) => x.isActive) ?? workCenters[0]).id,
      );
    }
  }, [section, workCenters, calendarCenterId]);
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
  }, [request, section, calendarCenterId]);
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
      !confirmLocalized(
        `${bom.code} · ${bom.name} reçetesini kalıcı olarak silmek istiyor musunuz? Bu işlem geri alınamaz.`,
      )
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
  async function createWorkCenter(e: FormEvent) {
    e.preventDefault();
    const captured = captureMutationEpoch();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/api/manufacturing/work-centers/", {
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
      await request<Order>(
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
  const filteredBoms = boms.filter((bom) =>
    (!recipeStatus || bom.isActive === (recipeStatus === "Active")) &&
    `${bom.code} ${bom.name} ${bom.productName}`
      .toLocaleLowerCase("tr-TR")
      .includes(recipeSearch.trim().toLocaleLowerCase("tr-TR")),
  );
  const recipePageSize = 25,
    recipePageCount = Math.max(
      1,
      Math.ceil(filteredBoms.length / recipePageSize),
    ),
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
  if (section === "manufacturing-recipe-create")
    return (
      <div className="manufacturing-page manufacturing-record-form-host">
        <RecordFormPage
          title={editingBomId ? "Ürün Reçetesini Düzenle" : "Ürün Reçetesi Tanımlama"}
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
          onCancel={() => {
            if (busy) return;
            resetBomForm();
            onNavigate("manufacturing-recipes");
          }}
          onSaveIntent={(stay) => {
            stayAfterBomSave.current = stay;
          }}
          onReset={() => {
            resetBomForm();
            setError("");
            setNotice("");
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
          <RecordFormGroup title="Reçete Kimliği" bodyClassName="rf-identity">
            <label>
              <span>Reçete kodu <RequiredMark /></span>
              <input
                className="rf-must rf-mono"
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
                className="rf-must"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={160}
                placeholder="Standart montaj reçetesi"
              />
            </label>
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
                className="rf-must rf-num"
                type="number"
                min="0.0001"
                step="0.0001"
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                required
              />
            </label>
          </RecordFormGroup>
          <RecordFormGroup title="Bileşenler">
              <div className="manufacturing-lines manufacturing-component-section">
                <div className="manufacturing-lines-title">
                  <div>
                    <small>
                      {components.length} satır · miktar, fire ve birim maliyeti
                      tanımlayın
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary small-button"
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
                    <Plus size={14} /> Bileşen ekle
                  </button>
                </div>
                <div className="manufacturing-line-labels" aria-hidden="true">
                  <span>Bileşen stok kartı</span>
                  <span>Miktar / çıktı</span>
                  <span>Fire %</span>
                  <span>Birim maliyet</span>
                  <span></span>
                </div>
                {components.map((line, index) => (
                  <div className="manufacturing-line" key={index}>
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
                    <input
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
                    <input
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
                    <input
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
                    <button
                      type="button"
                      className="manufacturing-remove"
                      aria-label="Bileşeni kaldır"
                      disabled={components.length === 1}
                      onClick={() =>
                        setComponents((rows) =>
                          rows.filter((_, i) => i !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <small>
                  Stok kartını kod veya adla arayın; uzun kataloglar seçim
                  penceresinde sayfa sayfa indirilmez. Sıra: bileşen, reçete
                  çıktısı başına miktar, fire %, baz para biriminde standart
                  birim maliyeti.
                </small>
              </div>
          </RecordFormGroup>
          <RecordFormGroup title="Operasyon Rotası">
              <div className="manufacturing-lines manufacturing-operation-section">
                <div className="manufacturing-lines-title">
                  <div>
                    <small>
                      {bomOperations.length} adım · kurulum, süre ve enerji
                      standartları
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary small-button"
                    disabled={
                      !workCenters.some((x) => x.isActive) ||
                      bomOperations.length >= 50
                    }
                    onClick={() =>
                      setBomOperations((rows) => [
                        ...rows,
                        {
                          workCenterId:
                            workCenters.find((x) => x.isActive)?.id || "",
                          setupMinutes: "0",
                          runMinutesPerOutputUnit: "1",
                          minimumWaitDaysAfterPrevious: "0",
                          setupFamilyCode: "",
                          plannedEnergyKwhPerOutput: "0",
                          plannedEnergyCostPerKwhBase: "0",
                          alternateWorkCenterIds: [],
                        },
                      ])
                    }
                  >
                    <Plus size={14} /> Operasyon ekle ({bomOperations.length}
                    /50)
                  </button>
                </div>
                <div
                  className="manufacturing-operation-labels"
                  aria-hidden="true"
                >
                  <span></span>
                  <span>İş merkezi</span>
                  <span>Kurulum ailesi</span>
                  <span>Kurulum (dk)</span>
                  <span>Birim süre (dk)</span>
                  <span>Enerji (kWh/birim)</span>
                  <span>Enerji bedeli (baz para/kWh)</span>
                  <span>Bekleme (gün)</span>
                  <span>Alternatif iş merkezleri</span>
                  <span></span>
                </div>
                {bomOperations.map((operation, index) => (
                  <div className="manufacturing-operation" key={index}>
                    <span>{index + 1}</span>
                    <select
                      aria-label="İş merkezi"
                      value={operation.workCenterId}
                      onChange={(e) =>
                        setBomOperations((rows) =>
                          rows.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  workCenterId: e.target.value,
                                  alternateWorkCenterIds:
                                    x.alternateWorkCenterIds.filter(
                                      (id) => id !== e.target.value,
                                    ),
                                }
                              : x,
                          ),
                        )
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
                    <input
                      aria-label="Kurulum ailesi"
                      title="Benzer kurulum gerektiren ürünleri aynı aile koduyla gruplayın; harf, rakam, nokta, alt çizgi ve tire kullanın. Örnek: BOYA-ACIK"
                      value={operation.setupFamilyCode}
                      onChange={(e) =>
                        setBomOperations((rows) =>
                          rows.map((x, i) =>
                            i === index
                              ? { ...x, setupFamilyCode: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="Kurulum ailesi"
                      maxLength={48}
                    />
                    <input
                      aria-label="Kurulum süresi dakika"
                      type="number"
                      min="0"
                      step="0.01"
                      value={operation.setupMinutes}
                      onChange={(e) =>
                        setBomOperations((rows) =>
                          rows.map((x, i) =>
                            i === index
                              ? { ...x, setupMinutes: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="Kurulum dk"
                      required
                    />
                    <input
                      aria-label="Birim üretim süresi dakika"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={operation.runMinutesPerOutputUnit}
                      onChange={(e) =>
                        setBomOperations((rows) =>
                          rows.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  runMinutesPerOutputUnit: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="Birim dk"
                      required
                    />
                    <input
                      aria-label="Planlanan enerji kWh / mamul birimi"
                      title="Bu operasyonun bir mamul birimi için standart elektrik tüketimi"
                      type="number"
                      min="0"
                      step="0.001"
                      value={operation.plannedEnergyKwhPerOutput}
                      onChange={(e) =>
                        setBomOperations((rows) =>
                          rows.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  plannedEnergyKwhPerOutput: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="Plan kWh/birim"
                    />
                    <input
                      aria-label="Planlanan enerji bedeli baz para / kWh"
                      title="Firma baz para biriminde standart elektrik bedeli"
                      type="number"
                      min="0"
                      step="0.000001"
                      value={operation.plannedEnergyCostPerKwhBase}
                      onChange={(e) =>
                        setBomOperations((rows) =>
                          rows.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  plannedEnergyCostPerKwhBase: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="Baz para/kWh"
                    />
                    <input
                      aria-label="Önceki operasyondan sonra bekleme günü"
                      title="Önceki operasyon bitince bu operasyon başlamadan beklenecek en az takvim günü"
                      type="number"
                      min="0"
                      max="365"
                      step="1"
                      value={operation.minimumWaitDaysAfterPrevious}
                      onChange={(e) =>
                        setBomOperations((rows) =>
                          rows.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  minimumWaitDaysAfterPrevious: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="Bekleme gün"
                      required
                    />
                    <div
                      className="manufacturing-alternates"
                      role="group"
                      aria-label="Alternatif iş merkezleri"
                    >
                      <small>
                        {operation.alternateWorkCenterIds.length}/19 alternatif
                      </small>
                      <div>
                        {workCenters
                          .filter(
                            (x) =>
                              x.isActive && x.id !== operation.workCenterId,
                          )
                          .map((x) => {
                            const checked =
                              operation.alternateWorkCenterIds.includes(x.id);
                            return (
                              <label key={x.id} title={`${x.code} · ${x.name}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={
                                    !checked &&
                                    operation.alternateWorkCenterIds.length >=
                                      19
                                  }
                                  onChange={(e) =>
                                    setBomOperations((rows) =>
                                      rows.map((row, i) =>
                                        i === index
                                          ? {
                                              ...row,
                                              alternateWorkCenterIds: e.target
                                                .checked
                                                ? [
                                                    ...row.alternateWorkCenterIds,
                                                    x.id,
                                                  ]
                                                : row.alternateWorkCenterIds.filter(
                                                    (id) => id !== x.id,
                                                  ),
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                />
                                <span>{x.code}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="manufacturing-remove"
                      aria-label="Operasyonu kaldır"
                      onClick={() =>
                        setBomOperations((rows) =>
                          rows.filter((_, i) => i !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <small>
                  Enerji standartları mamul birimi başına kWh ve firma baz para
                  biriminde kWh bedeliyle girilir; üretim emri oluşturulurken
                  miktara göre sabitlenir. Operasyon başına en fazla 20 uygun iş
                  merkezi vardır (tercih edilen merkez dahil). Aynı iş
                  merkezinde art arda yapılacak ürünleri kurulum ailesiyle
                  gruplayın. Geçiş süresi ve yasak geçişleri İş Merkezi
                  ayarlarından tanımlanır.
                </small>
              </div>
          </RecordFormGroup>
        </RecordFormPage>
      </div>
    );
  if (section === "manufacturing-orders" && createOrderPage)
    return (
      <div className="manufacturing-page manufacturing-record-form-host">
        <RecordFormPage
          title="Üretim Emri Planlama"
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
          <RecordFormGroup title="Emir Kimliği" bodyClassName="rf-identity">
            <label>
              <span>Emir kodu <RequiredMark /></span>
              <input
                className="rf-must rf-mono"
                value={orderCode}
                onChange={(e) => setOrderCode(e.target.value)}
                required
                maxLength={48}
                placeholder="URE-2026-001"
              />
            </label>
            <label>
              <span>Reçete <RequiredMark /></span>
              <select
                className="rf-must"
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
            <label>
              <span>Plan tarihi <RequiredMark /></span>
              <input
                className="rf-must"
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                required
              />
            </label>
          </RecordFormGroup>
          <div className="rf-columns">
            <RecordFormGroup title="Üretim Kaynağı">
              <label>
                Üretim türü
                <select
                  value={productionMode}
                  onChange={(e) => {
                    const mode = e.target.value as "Stock" | "SalesOrder";
                    setProductionMode(mode);
                    if (mode === "Stock") {
                      setSourceSalesOrderId("");
                      setSourceSalesOrderLineNumber("");
                      setSourceSalesOrderLines([]);
                    }
                  }}
                >
                  <option value="Stock">Stoka üretim</option>
                  <option value="SalesOrder">Satış siparişine üretim</option>
                </select>
              </label>
              {productionMode === "SalesOrder" && (
                <>
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
                </>
              )}
            </RecordFormGroup>
            <RecordFormGroup title="Planlama">
              <label className="rf-short">
                <span>Planlanan miktar <RequiredMark /></span>
                <input
                  className="rf-must rf-num"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={plannedQuantity}
                  onChange={(e) => setPlannedQuantity(e.target.value)}
                  required
                />
              </label>
            </RecordFormGroup>
          </div>
        </RecordFormPage>
      </div>
    );
  if (section === "manufacturing-work-center-create")
    return (
      <div className="manufacturing-page manufacturing-record-form-host">
        <RecordFormPage
          title="İş Merkezi Tanımlama"
          mode="create"
          busy={busy}
          saveLabel="İş Merkezini Kaydet"
          onSubmit={(event) => void createWorkCenter(event)}
          onCancel={() => onNavigate("manufacturing-work-centers")}
          error={error}
          onDismissError={() => setError("")}
          status={
            <>
              <span>
                Tanım kaydedildikten sonra iş merkezleri listesinde görünür.
              </span>
              {notice && <span className="rf-status-notice">{notice}</span>}
            </>
          }
        >
          <RecordFormGroup title="İş Merkezi Kimliği" bodyClassName="rf-identity">
            <label>
              <span>Kod <RequiredMark /></span>
              <input
                className="rf-must rf-mono"
                value={wcCode}
                onChange={(e) => setWcCode(e.target.value)}
                required
                maxLength={48}
                placeholder="WC-MONTAJ"
              />
            </label>
            <label>
              <span>Ad <RequiredMark /></span>
              <input
                className="rf-must"
                value={wcName}
                onChange={(e) => setWcName(e.target.value)}
                required
                maxLength={160}
                placeholder="Montaj hattı"
              />
            </label>
            <label>
              <span>Günlük kapasite (dk) <RequiredMark /></span>
              <input
                className="rf-must rf-num"
                type="number"
                min="1"
                max="1440"
                value={wcCapacity}
                onChange={(e) => setWcCapacity(e.target.value)}
                required
              />
            </label>
          </RecordFormGroup>
          <div className="rf-columns">
            <RecordFormGroup title="Saatlik Maliyetler">
              <div className="rf-pair">
                <label>
                  <span>İşçilik / saat <RequiredMark /></span>
                  <input
                    className="rf-must rf-num"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={wcLabor}
                    onChange={(e) => setWcLabor(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Genel gider / saat <RequiredMark /></span>
                  <input
                    className="rf-must rf-num"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={wcOverhead}
                    onChange={(e) => setWcOverhead(e.target.value)}
                    required
                  />
                </label>
              </div>
            </RecordFormGroup>
          </div>
        </RecordFormPage>
      </div>
    );
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
  const visibleWorkCenters = workCenters.filter(
    (center) =>
      !workCenterStatus || center.isActive === (workCenterStatus === "Active"),
  );
  return (
    <div
      className={`manufacturing-page manufacturing-workbench${listSection ? " list-v2" : ""}`}
    >
      <ManufacturingPageHeader
        listMode={listSection}
        listCount={listCount}
        title={createOrderPage ? manufacturingSections["manufacturing-order-create"].title : manufacturingSections[section].title}
        description={createOrderPage ? manufacturingSections["manufacturing-order-create"].description : manufacturingSections[section].description}
        showRecipeScope={false}
        showCreateRecipe={section === "manufacturing-recipes"}
        showRecipeListBack={false}
        showCreateWorkCenter={section === "manufacturing-work-centers"}
        showWorkCenterListBack={false}
        showCreateOrder={section === "manufacturing-orders" && !createOrderPage}
        showOrderListBack={createOrderPage}
        showOrderSave={createOrderPage}
        canSaveOrder={boms.length > 0 && warehouses.length > 0}
        busy={busy}
        onCreateRecipe={() => {
          resetBomForm();
          setError("");
          setNotice("");
          onNavigate("manufacturing-recipe-create");
        }}
        onBackToRecipeList={() => {
          resetBomForm();
          onNavigate("manufacturing-recipes");
        }}
        onCreateWorkCenter={() => {
          setError("");
          setNotice("");
          onNavigate("manufacturing-work-center-create");
        }}
        onBackToWorkCenterList={() => onNavigate("manufacturing-work-centers")}
        onCreateOrder={() => onNavigate("manufacturing-order-create")}
        onBackToOrderList={() => onNavigate("manufacturing-orders")}
        onRefresh={() => void refresh()}
      />
      {!createOrderPage &&
        section !== "manufacturing-recipes" &&
        section !== "manufacturing-orders" && <ManufacturingSummary
        workCenterMode={section === "manufacturing-work-centers"}
        workCenterMetrics={[
          // On the list page the counts are in the title and on the status chips;
          // the capacity total has no filter equivalent, so its card stays.
          ...(section === "manufacturing-work-centers"
            ? []
            : [
                {
                  label: "İş merkezi",
                  value: workCenters.length,
                  detail: "Toplam tanım",
                },
                {
                  label: "Aktif iş merkezi",
                  value: workCenters.filter((x) => x.isActive).length,
                  detail: "Üretim planlamasında kullanılabilir",
                },
              ]),
          {
            label: "Günlük kapasite",
            value: `${workCenters
              .filter((x) => x.isActive)
              .reduce((sum, x) => sum + x.capacityMinutesPerDay, 0)
              .toLocaleString("tr-TR")} dk`,
            detail: "Aktif merkezlerin toplamı",
          },
        ]}
        generalMetrics={[
          {
            label: "Ürün reçetesi",
            value: boms.length,
            detail: `${boms.filter((x) => x.isActive).length} aktif`,
          },
          {
            label: "Açık üretim emri",
            value: openOrdersCount,
            detail: `${ordersTotalCount.toLocaleString("tr-TR")} toplam kayıt`,
          },
          {
            label: "İş merkezi",
            value: workCenters.length,
            detail: `${workCenters.filter((x) => x.isActive).length} aktif`,
          },
          {
            label: "Üretim deposu",
            value: warehouses.length,
            detail: "Firma kapsamındaki depolar",
          },
        ]}
      />}
      {error && !trackingOrder && (
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
            busy={busy}
            search={recipeSearch}
            setSearch={setRecipeSearch}
            status={recipeStatus}
            setStatus={setRecipeStatus}
            onRefresh={refreshList}
            page={recipePage}
            setPage={setRecipePage}
            pageCount={recipePageCount}
            onResetForm={resetBomForm}
            onNavigate={onNavigate}
            onEdit={beginEditBom}
            onChangeState={(bom) => void changeBomState(bom)}
            onDelete={(bom) => void deleteBom(bom)}
          />
        )}
      </div>
      {section === "manufacturing-work-centers" && (
        <ListToolbar onRefresh={refreshList}>
          <ListChipGroup
            label="Durum"
            value={workCenterStatus}
            onChange={setWorkCenterStatus}
            allowClear
            hideEmpty
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
      )}
      {section === "manufacturing-work-centers" && (
        <section className="manufacturing-panel" aria-label="Tanımlı iş merkezleri">
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
              >
                <thead>
                  <tr>
                    {visibleWorkCenterFields.map((field) => (
                      <th key={field.key}>{field.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleWorkCenters.map((center) => (
                    <tr key={center.id}>
                      {visibleWorkCenterFields.map((field) => (
                        <td key={field.key}>
                          {renderWorkCenterCell(center, field.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </AdvancedDataGrid>
            </div>
          )}
          <section
            className="work-center-calendar"
            aria-labelledby="work-center-calendar-title"
          >
            <div className="calendar-title">
              <div>
                <h3 id="work-center-calendar-title">Çalışma takvimi</h3>
                <p>
                  Haftalık günleri, tarih istisnalarını ve her yıl tekrarlanan
                  kapasite kurallarını ayarlayın. Öncelik: tarih istisnası,
                  yıllık kural, haftalık takvim.
                </p>
              </div>
              <label>
                İş merkezi
                <select
                  value={calendarCenterId}
                  onChange={(e) => changeCalendarCenter(e.target.value)}
                  disabled={!workCenters.length}
                >
                  {workCenters.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code} · {x.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!workCenters.length ? (
              <div className="manufacturing-empty" role="status">
                Çalışma takvimi ayarları için önce bir iş merkezi tanımlayın.
              </div>
            ) : calendarLoading ? (
              <div className="manufacturing-empty">Takvim yükleniyor…</div>
            ) : (
              <>
                {!calendarReady && (
                  <div className="manufacturing-empty" role="alert">
                    Takvim yüklenemedi; güvenli düzenleme için yeniden seçip
                    tekrar deneyin.
                  </div>
                )}
                <div
                  className="work-calendar-days"
                  role="group"
                  aria-label="Haftalık çalışma günleri"
                >
                  {[
                    { label: "Pazartesi", bit: 1 },
                    { label: "Salı", bit: 2 },
                    { label: "Çarşamba", bit: 3 },
                    { label: "Perşembe", bit: 4 },
                    { label: "Cuma", bit: 5 },
                    { label: "Cumartesi", bit: 6 },
                    { label: "Pazar", bit: 0 },
                  ].map((day) => (
                    <label key={day.bit}>
                      <input
                        type="checkbox"
                        disabled={!calendarReady}
                        checked={(calendarMask & (1 << day.bit)) !== 0}
                        onChange={() =>
                          setCalendarMask((mask) => mask ^ (1 << day.bit))
                        }
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
                <div className="calendar-override-form">
                  <label>
                    Vardiya başlangıcı
                    <input
                      type="time"
                      disabled={!calendarReady}
                      value={calendarShiftStart}
                      onChange={(e) => setCalendarShiftStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Vardiya bitişi
                    <input
                      type="time"
                      disabled={!calendarReady}
                      value={calendarShiftEnd}
                      onChange={(e) => setCalendarShiftEnd(e.target.value)}
                    />
                    <small>Gün içi çizelgeleme bu saat aralığına sığar.</small>
                  </label>
                </div>
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
              </>
            )}
          </section>
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
        </section>
      )}
      {section === "manufacturing-orders" && !createOrderPage && (
        <div className="manufacturing-order-stack">
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
          >
            <ListChipGroup
              label="Üretim emri durumu"
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
          </ListToolbar>
          <section
            className="manufacturing-panel manufacturing-order-list list-v2-list"
            aria-label="Üretim emirleri"
          >
          {orders.length === 0 ? (
            <div className="manufacturing-empty">
              <Factory size={22} />
              <b>{orderSearch || orderStatus ? "Filtreyle eşleşen üretim emri yok" : "Henüz üretim emri yok"}</b>
              <span>
                {orderSearch || orderStatus
                  ? "Arama veya durum ölçütlerini değiştirip yeniden filtreleyin."
                  : "Bir reçete oluşturduktan sonra ilk emri planlayabilirsiniz."}
              </span>
            </div>
          ) : (
            <div className="manufacturing-order-workbench">
              <div className="manufacturing-table-wrap">
                <AdvancedDataGrid
                  gridId="manufacturing-orders"
                  {...screenViewGridDefaults(visibleOrderFields)}
                  externalPagination
                  hideSearch
                  enableRowSelection={false}
                >
                  <thead>
                    <ScreenViewGroupHeader fields={visibleOrderFields} />
                    <tr>
                      {visibleOrderFields.map((field) => (
                        <th key={field.key}>{field.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageOrders.map((x) => {
                      const orderCells = {
                        code: (
                          <>
                            <button
                              type="button"
                              className="manufacturing-order-select"
                              aria-pressed={selectedOrderId === x.id}
                              onClick={() => setSelectedOrderId(x.id)}
                            >
                              {x.code}
                            </button>
                          </>
                        ),
                        plannedDate: <>{x.plannedDate}</>,
                        productionSource: <>{x.sourceSalesOrderCode
                          ? `${x.sourceSalesOrderCode} · satır ${x.sourceSalesOrderLineNumber}`
                          : "Stoka üretim"}</>,
                        billOfMaterialName: (
                          <>
                            <span className="manufacturing-order-recipe-name">
                              {x.billOfMaterialName}
                            </span>
                            {x.operations.map((op) => (
                              <div
                                className="manufacturing-operation-detail"
                                key={op.id}
                              >
                                <small>
                                  {op.sequence}. {op.workCenterCode}: plan{" "}
                                  {op.setupMinutes + op.runMinutes} dk ·{" "}
                                  {op.plannedEnergyQuantityKwh.toLocaleString(
                                    "tr-TR",
                                  )}{" "}
                                  kWh enerji (
                                  {new Intl.NumberFormat("tr-TR", {
                                    maximumFractionDigits: 2,
                                  }).format(op.plannedEnergyCostBase)}{" "}
                                  baz para) · operasyon toplamı{" "}
                                  {new Intl.NumberFormat("tr-TR", {
                                    maximumFractionDigits: 2,
                                  }).format(op.plannedCostBase)}{" "}
                                  baz para
                                  {op.scheduledStartDate
                                    ? ` · ${op.scheduledStartDate} ${secondTime(op.scheduledStartSecondOfDay ?? (op.scheduledStartMinuteOfDay ?? 0) * 60)}–${op.scheduledEndDate} ${secondTime(op.scheduledEndSecondOfDay ?? (op.scheduledEndMinuteOfDay ?? 0) * 60)}`
                                    : ""}
                                </small>
                                {op.capacityDays.map((slot) => (
                                  <small key={slot.date}>
                                    {" "}
                                    · {slot.date}{" "}
                                    {secondTime(
                                      slot.startSecondOfDay ??
                                        slot.startMinuteOfDay * 60,
                                    )}
                                    –
                                    {secondTime(
                                      slot.endSecondOfDay ??
                                        slot.endMinuteOfDay * 60,
                                    )}{" "}
                                    ({slot.minutes} dk)
                                  </small>
                                ))}
                                {x.status === "Released" &&
                                  op.status === "Planned" && (
                                    <button
                                      className="secondary small-button"
                                      disabled={busy}
                                      onClick={() => void startOperation(x, op)}
                                    >
                                      Operasyonu başlat
                                    </button>
                                  )}
                                {x.status === "Released" &&
                                  op.status === "InProgress" && (
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
                                            updateActual(
                                              op,
                                              "setup",
                                              e.target.value,
                                            )
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
                                            updateActual(
                                              op,
                                              "run",
                                              e.target.value,
                                            )
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
                                            updateActual(
                                              op,
                                              "energyKwh",
                                              e.target.value,
                                            )
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
                                            actualTimes[op.id]?.energyRate ??
                                            "0"
                                          }
                                          onChange={(e) =>
                                            updateActual(
                                              op,
                                              "energyRate",
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label>
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
                                        className="primary small-button"
                                        disabled={busy || employees.length === 0}
                                        onClick={() =>
                                          void completeOperation(x, op)
                                        }
                                      >
                                        Fiili kayıtları kaydet
                                      </button>
                                    </div>
                                  )}
                                {op.status === "Completed" && (
                                  <small className="actual-cost">
                                    Tamamlandı · fiili{" "}
                                    {(
                                      (op.actualSetupMinutes ?? 0) +
                                      (op.actualRunMinutes ?? 0)
                                    ).toLocaleString("tr-TR")}{" "}
                                    dk · enerji{" "}
                                    {(
                                      op.actualEnergyQuantityKwh ?? 0
                                    ).toLocaleString("tr-TR")}{" "}
                                    kWh (
                                    {new Intl.NumberFormat("tr-TR", {
                                      maximumFractionDigits: 2,
                                    }).format(
                                      op.actualEnergyCostBase ?? 0,
                                    )}{" "}
                                    baz para) · toplam{" "}
                                    {new Intl.NumberFormat("tr-TR", {
                                      maximumFractionDigits: 2,
                                    }).format(op.actualCostBase ?? 0)}{" "}
                                    baz para{op.performedByEmployeeName ? ` · Operatör: ${op.performedByEmployeeName}` : ""}
                                  </small>
                                )}
                              </div>
                            ))}
                          </>
                        ),
                        warehouseName: <>{x.warehouseName}</>,
                        plannedQuantity: (
                          <>{x.plannedQuantity.toLocaleString("tr-TR")}</>
                        ),
                        components: (
                          <>
                            <div className="manufacturing-components">
                              {x.lines.map((l) => (
                                <span key={l.componentStockItemId}>
                                  {l.componentCode}:{" "}
                                  {l.requiredQuantity.toLocaleString("tr-TR")} ×{" "}
                                  {l.standardUnitCostBaseSnapshot.toLocaleString(
                                    "tr-TR",
                                    { maximumFractionDigits: 4 },
                                  )}{" "}
                                  ={" "}
                                  {l.plannedCostBase.toLocaleString("tr-TR", {
                                    maximumFractionDigits: 4,
                                  })}{" "}
                                  baz para
                                </span>
                              ))}
                              <b>
                                Planlanan malzeme:{" "}
                                {x.lines
                                  .reduce(
                                    (sum, line) => sum + line.plannedCostBase,
                                    0,
                                  )
                                  .toLocaleString("tr-TR", {
                                    maximumFractionDigits: 4,
                                  })}{" "}
                                baz para
                              </b>
                            </div>
                          </>
                        ),
                        status: (
                          <>
                            <span
                              className={`manufacturing-status manufacturing-${x.status.toLowerCase()}`}
                            >
                              {statusLabel[x.status] || x.status}
                            </span>
                          </>
                        ),
                      };
                      return (
                        <tr
                          key={x.id}
                          className={selectedOrderId === x.id ? "selected" : ""}
                          onClick={() => setSelectedOrderId(x.id)}
                        >
                          {visibleOrderFields.map((field) => (
                            <td key={field.key}>
                              {orderCells[field.key as keyof typeof orderCells]}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </AdvancedDataGrid>
              </div>
              <aside
                className="manufacturing-order-inspector"
                aria-label="Seçili üretim emri ayrıntısı"
              >
                {selectedOrder ? (
                  <>
                    <div className="list-v2-detail-head">
                      <div>
                        <span className="list-v2-kind">SEÇİLİ ÜRETİM EMRİ</span>
                        <h2>{selectedOrder.code}</h2>
                      </div>
                    </div>
                    <div className="list-v2-detail-meta">
                      <span
                        className={
                          "manufacturing-status manufacturing-" +
                          selectedOrder.status.toLowerCase()
                        }
                      >
                        {statusLabel[selectedOrder.status] ||
                          selectedOrder.status}
                      </span>
                    </div>
                    {/* Next workflow step of the order; cancelling is in the footer. */}
                    {orderDetailHasStep && (
                    <div className="list-v2-quick">
                      <div>
                      {selectedOrder.status === "Planned" &&
                        selectedOrder.operations.length > 0 &&
                        selectedOrder.operations.some(
                          (operation) => !operation.scheduledStartDate,
                        ) && (
                          <button
                            type="button"
                            className="primary"
                            disabled={busy}
                            onClick={() => void scheduleOrder(selectedOrder)}
                          >
                            Kapasiteye çizelgele
                          </button>
                        )}
                      {selectedOrder.status === "Planned" &&
                        (selectedOrder.operations.length === 0 ||
                          selectedOrder.operations.every(
                            (operation) => !!operation.scheduledStartDate,
                          )) && (
                          <button
                            type="button"
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void transition(selectedOrder, "release")
                            }
                          >
                            Serbest bırak
                          </button>
                        )}
                      {selectedOrder.status === "Released" &&
                        selectedOrder.operations.every(
                          (operation) => operation.status === "Completed",
                        ) && (
                          <button
                            type="button"
                            className="primary"
                            disabled={busy}
                            onClick={() => completeOrder(selectedOrder)}
                          >
                            Üretimi tamamla
                          </button>
                        )}
                      </div>
                    </div>
                    )}
                    <dl className="list-v2-facts">
                      <div>
                        <dt>Reçete</dt>
                        <dd>{selectedOrder.billOfMaterialName}</dd>
                      </div>
                      <div>
                        <dt>Üretim deposu</dt>
                        <dd>{selectedOrder.warehouseName}</dd>
                      </div>
                      <div>
                        <dt>Planlanan miktar</dt>
                        <dd>
                          {selectedOrder.plannedQuantity.toLocaleString(
                            "tr-TR",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Üretim türü</dt>
                        <dd>{selectedOrder.sourceSalesOrderCode
                          ? `Siparişe özel · ${selectedOrder.sourceSalesOrderCode} / satır ${selectedOrder.sourceSalesOrderLineNumber}`
                          : "Stoka üretim"}</dd>
                      </div>
                      <div>
                        <dt>Plan tarihi</dt>
                        <dd>{selectedOrder.plannedDate}</dd>
                      </div>
                      {selectedOrder.actualGoodQuantity !== null && (
                        <>
                          <div>
                            <dt>İyi ürün</dt>
                            <dd>{selectedOrder.actualGoodQuantity.toLocaleString("tr-TR")}</dd>
                          </div>
                          <div>
                            <dt>Fire</dt>
                            <dd>
                              {selectedOrder.scrapQuantity?.toLocaleString("tr-TR") ?? "0"}
                              {selectedOrder.scrapReason ? ` · ${selectedOrder.scrapReason}` : ""}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                    <div className="manufacturing-inspector-section">
                      <b>Bileşen ihtiyacı</b>
                      {selectedOrder.lines.length ? (
                        <ul>
                          {selectedOrder.lines.map((line) => (
                            <li key={line.componentStockItemId}>
                              <span>
                                {line.componentCode} · {line.componentName}
                              </span>
                              <b>
                                {line.requiredQuantity.toLocaleString("tr-TR")}
                              </b>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <small>Bu emirde bileşen satırı yok.</small>
                      )}
                    </div>
                    <div className="manufacturing-inspector-section">
                      <b>Operasyonlar</b>
                      {selectedOrder.operations.length ? (
                        <ul>
                          {selectedOrder.operations.map((operation) => (
                            <li key={operation.id}>
                              <span>
                                {operation.sequence}. {operation.workCenterCode}{" "}
                                · {operation.status}
                              </span>
                              <b>
                                {operation.setupMinutes + operation.runMinutes}{" "}
                                dk
                              </b>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <small>Operasyon rotası tanımlı değil.</small>
                      )}
                    </div>
                    {["Planned", "Released"].includes(selectedOrder.status) && (
                      <div className="list-v2-detail-foot">
                        <button
                          type="button"
                          className="is-danger"
                          disabled={busy}
                          onClick={() => void transition(selectedOrder, "cancel")}
                        >
                          İptal
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="manufacturing-empty">
                    Bir üretim emri seçin.
                  </div>
                )}
              </aside>
            </div>
          )}
          {ordersTotalCount > orderPageSize && (
            <div className="table-pagination manufacturing-order-pagination">
              <span>
                Sayfa {orderPage} / {orderPageCount} ·{" "}
                {(orderPage - 1) * orderPageSize + 1}–
                {Math.min(orderPage * orderPageSize, ordersTotalCount)} /{" "}
                {ordersTotalCount} emir
              </span>
              <div>
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={orderPage <= 1}
                  onClick={() => setOrderPage((page) => Math.max(1, page - 1))}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={orderPage >= orderPageCount}
                  onClick={() =>
                    setOrderPage((page) => Math.min(orderPageCount, page + 1))
                  }
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
        </section>
        </div>
      )}
      {section === "manufacturing-mrp" && (
        <section className="manufacturing-panel mrp-panel">
          <div className="manufacturing-heading">
            <div className="manufacturing-icon soft">
              <Boxes size={18} />
            </div>
            <div>
              <h2>Malzeme ihtiyaç planı</h2>
              <p>
                Açık satış siparişlerini ve ek talepleri reçetelerde çok
                seviyeli patlatıp stok ve tedarikle netleyin.
              </p>
            </div>
            <button
              className="secondary small-button"
              type="button"
              disabled={busy}
              onClick={() => void loadMrpHistory()}
            >
              Plan geçmişi
            </button>
          </div>
          <form className="mrp-form" onSubmit={runMrp}>
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
            <div className="mrp-demands">
              <div className="manufacturing-lines-title">
                <b>Ek talepler</b>
                <button
                  type="button"
                  className="secondary small-button"
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
                  Talep ekle ({mrpDemands.length}/100)
                </button>
              </div>
              {mrpDemands.map((demand, index) => (
                <div className="mrp-demand-row" key={index}>
                  <label>
                    Stok kartı
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
                  </label>
                  <label>
                    Miktar
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
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
                  </label>
                  <label>
                    İhtiyaç tarihi
                    <input
                      type="date"
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
                  </label>
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
            </div>
            {hasDuplicateMrpDemand && (
              <small className="mrp-demand-error" role="alert">
                Aynı stok kartı ve ihtiyaç tarihi bir kez eklenebilir.
              </small>
            )}
            <button
              className="primary"
              disabled={
                busy ||
                !warehouseId ||
                filledMrpDemands.length === 0 ||
                hasDuplicateMrpDemand
              }
            >
              Planı hesapla ve kaydet
            </button>
          </form>
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
        </section>
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
