import { useEffect, useMemo, useRef, useState } from "react";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand } from "./commands/gridCommands";
import type { GridExportActions } from "./AdvancedDataGrid";
import { ListFooter } from "./list-page/ListFooter";
import type { MenuCommand, PageCommands } from "./commands/types";
import { authenticatedFetch } from "./authApi";
import { useTakePageParam } from "./pageNavigation";
import { localizedText } from "./locale";
import { X } from "lucide-react";
import { confirmDialog } from "./confirmDialog";
import "./foreign-trade.css";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import "./finance-record-forms.css";
import "./foreign-trade/foreign-trade-list-v2.css";
import "./sales/sales-list-v2.css";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ForeignTradeFilters } from "./foreign-trade/components/ForeignTradeFilters";
import {
  ForeignTradeGrid,
  defaultForeignTradeFields,
  withFrontendForeignTradeFields,
  type ForeignTradeScreenField,
} from "./foreign-trade/components/ForeignTradeGrid";
import {
  ForeignTradeDetail,
  incotermsCodes,
  type ForeignTradePanelNotice,
} from "./foreign-trade/components/ForeignTradeDetail";
import type {
  Direction,
  TradeStatus,
  TradeOrder,
  TradeCase,
  InventoryDocument,
  TradeCapabilities,
  Draft,
  CasePage,
  AdvanceInputs,
} from "./foreign-trade/types";
import { problemDetail } from "./erpApi";
import { advanceCheck, canLinkInventoryDocument } from "./foreign-trade/advance";
import { ForeignTradeDocumentPicker } from "./foreign-trade/components/ForeignTradeDocumentPicker";

const blankDraft = (): Draft => ({
  direction: "Import",
  orderId: "",
  referenceCode: "",
  originCountryCode: "",
  destinationCountryCode: "",
  incotermsCode: "",
  harmonizedSystemCode: "",
  transportMode: "Road",
  carrierReference: "",
  customsReference: "",
  declaredValue: "",
  plannedShipDate: "",
  plannedArrivalDate: "",
  notes: "",
});
const tr = (turkish: string, english: string) =>
  localizedText(turkish, english);
const locale = () => localizedText("tr-TR", "en-US");
const statusLabels: Record<TradeStatus, [string, string]> = {
  Draft: ["Taslak", "Draft"],
  Booked: ["Planlandı", "Booked"],
  Shipped: ["Sevkte", "Shipped"],
  CustomsClearance: ["Gümrükte", "Customs clearance"],
  Arrived: ["Ulaştı", "Arrived"],
  Closed: ["Kapandı", "Closed"],
  Cancelled: ["İptal", "Cancelled"],
};
const statusLabel = (status: TradeStatus) => tr(...statusLabels[status]);
const directionLabel = (direction: Direction) =>
  tr(direction === "Import" ? "İthalat" : "İhracat", direction);
const transportLabel = (mode: string) => {
  const labels: Record<string, [string, string]> = {
    Road: ["Kara", "Road"],
    Sea: ["Deniz", "Sea"],
    Air: ["Hava", "Air"],
    Rail: ["Demir yolu", "Rail"],
    Multimodal: ["Çok modlu", "Multimodal"],
  };
  const label = labels[mode];
  return label ? tr(...label) : mode;
};
/** HS codes are stored as 6–10 digits (backend: ^[0-9]{6,10}$); dots and spaces are accepted while typing. */
const normalizeHsCode = (value: string) => value.replace(/[\s.]/g, "");
const hsCodeError = (value: string) => {
  const normalized = normalizeHsCode(value.trim());
  if (!normalized) return "";
  return /^[0-9]{6,10}$/.test(normalized)
    ? ""
    : tr(
        "HS kodu 6–10 rakam olmalıdır (nokta ve boşluk kabul edilir).",
        "HS code must be 6–10 digits (dots and spaces are accepted).",
      );
};
const countryInput = (value: string) =>
  value.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
const nextStatus: Partial<Record<TradeStatus, TradeStatus>> = {
  Draft: "Booked",
  Booked: "Shipped",
  Shipped: "CustomsClearance",
  CustomsClearance: "Arrived",
  Arrived: "Closed",
};

function requiredPermission(url: string, method?: string) {
  if (url.endsWith("/capabilities"))
    return tr("firma üyeliği ve oturum", "company membership and session");
  if (url.endsWith("/transition") || url.endsWith("/inventory-document"))
    return "erp.foreign-trade.execute";
  if (
    url.includes("/orders") ||
    (url.includes("/cases") && (!method || method.toUpperCase() === "GET"))
  )
    return "erp.foreign-trade.read";
  if (method?.toUpperCase() === "PUT") return "erp.foreign-trade.update";
  return "erp.foreign-trade.create";
}

export default function ForeignTradePage({
  token,
  recordParamPage,
}: {
  token: string;
  role: string;
  /** Sekme anahtarı (`foreign-trade-case`): sistem dosya listesinin `id` (aç) ve `direction` (yeni) sayfa parametreleri. */
  recordParamPage?: string;
}) {
  const [cases, setCases] = useState<TradeCase[]>([]);
  // Total case count the endpoint reports (the page loads only the first 100).
  const [caseTotal, setCaseTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Set when the user deselects on purpose, so the first row is not re-selected immediately.
  const selectionCleared = useRef(false);
  const tradeGridExportRef = useRef<GridExportActions | null>(null);
  const [orders, setOrders] = useState<TradeOrder[]>([]);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState<ForeignTradePanelNotice | null>(null);
  const [filter, setFilter] = useState<"All" | Direction>("All");
  const [stage, setStage] = useState<TradeStatus | null>(null);
  const [query, setQuery] = useState("");
  // list-v2: the page toolbar hosts the list's own tools (columns, pivot, export…).
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [capabilities, setCapabilities] = useState<TradeCapabilities>({
    canCreate: false,
    canUpdate: false,
    canAdvance: false,
  });
  const [inventoryDocuments, setInventoryDocuments] = useState<
    InventoryDocument[]
  >([]);
  const [inventoryDocumentId, setInventoryDocumentId] = useState(""),
    [linkPickerOpen, setLinkPickerOpen] = useState(false);
  // Prerequisite inputs of the selected case's next stage (entered in the panel, used by İşlemler's step).
  const [advanceInputs, setAdvanceInputs] = useState<AdvanceInputs>({});
  const [screenFields, setScreenFields] = useState<ForeignTradeScreenField[]>(
    defaultForeignTradeFields,
  );

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await authenticatedFetch(url, token, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        title?: string;
        errors?: Record<string, string[]>;
      } | null;
      if (response.status === 403) {
        const permission = requiredPermission(url, init?.method);
        throw new Error(
          tr(
            `Bu firmada ${permission} erişiminiz yok. Dış ticaret izinlerini firma yöneticiniz İzin politikaları ekranından tanımlayabilir. Bu kodu iletin: ${permission}.`,
            `You do not have ${permission} access in this company. Ask your company administrator to configure foreign trade permissions on the Access policies page. Provide this code: ${permission}.`,
          ),
        );
      }
      const validationMessages = body?.errors
        ? Object.values(body.errors).flat().filter(Boolean)
        : [];
      throw new Error(
        validationMessages.length
          ? validationMessages.join(" ")
          : body?.error ||
            problemDetail(body) ||
            tr(
              `İstek başarısız (${response.status}).`,
              `Request failed (${response.status}).`,
            ),
      );
    }
    return (
      response.status === 204 ? undefined : response.json()
    ) as Promise<T>;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [casePage, imports, exports, permissions] = await Promise.all([
        api<CasePage>("/api/foreign-trade/cases?page=1&pageSize=100"),
        api<TradeOrder[]>("/api/foreign-trade/orders?direction=Import"),
        api<TradeOrder[]>("/api/foreign-trade/orders?direction=Export"),
        api<TradeCapabilities>("/api/foreign-trade/capabilities"),
      ]);
      setCapabilities(permissions);
      setCases(casePage.items);
      setCaseTotal(casePage.total ?? casePage.items.length);
      setOrders([
        ...imports.map((x) => ({ ...x, direction: "Import" as const })),
        ...exports.map((x) => ({ ...x, direction: "Export" as const })),
      ]);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  useEffect(() => {
    let active = true;
    api<{ id?: string | null; fields: ForeignTradeScreenField[] }>(
      "/api/screen-views/foreign-trade-files/active",
    )
      .then((view) => {
        // Without a published tenant view the API echoes its catalog defaults (id null);
        // the page then keeps its own default columns.
        if (active && view.id && view.fields?.length)
          setScreenFields(withFrontendForeignTradeFields(view.fields));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    setInventoryDocuments([]);
    setInventoryDocumentId("");
    if (!selectedId) return;
    let active = true;
    void api<InventoryDocument[]>(
      `/api/foreign-trade/cases/${selectedId}/inventory-documents`,
    )
      .then((items) => {
        if (active) {
          setInventoryDocuments(items);
          setInventoryDocumentId(items.find((x) => x.isLinked)?.id || "");
        }
      })
      .catch((cause) => {
        if (active) setNotice({ kind: "error", text: (cause as Error).message });
      });
    return () => {
      active = false;
    };
  }, [selectedId, token]);

  const scoped = useMemo(
    () =>
      cases.filter(
        (item) =>
          (filter === "All" || item.direction === filter) &&
          `${item.referenceCode} ${item.customsReference || ""} ${item.carrierReference || ""}`
            .toLocaleLowerCase(locale())
            .includes(query.toLocaleLowerCase(locale())),
      ),
    [cases, filter, query],
  );
  const filtered = useMemo(
    () => (stage ? scoped.filter((item) => item.status === stage) : scoped),
    [scoped, stage],
  );
  const selectedCase = filtered.find((item) => item.id === selectedId) || null;
  // The current row is the one the user chose (list type): none is picked by itself; a row that left the
  // filtered list is dropped.
  useEffect(() => {
    if (loading) return;
    if (selectedId && !filtered.some((item) => item.id === selectedId)) setSelectedId(null);
  }, [filtered, selectedId, loading]);
  function selectCase(id: string | null) {
    if (id === selectedId) return;
    selectionCleared.current = id === null;
    setSelectedId(id);
    setNotice(null);
  }
  const detailRef = useRef<HTMLElement>(null);
  /** Double click / Enter: an editable case opens its form (Aç); any other case moves the focus to its panel. */
  function openCase(id: string) {
    const item = filtered.find((candidate) => candidate.id === id);
    if (!item) return;
    selectCase(id);
    // While this case's transition runs the form would show stale details: focus the panel instead.
    if (["Draft", "Booked"].includes(item.status) && capabilities.canUpdate && busyId !== id) startEdit(item);
    else window.setTimeout(() => detailRef.current?.focus(), 0);
  }
  useEffect(() => {
    if (creating) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [role='dialog']")) return;
      selectionCleared.current = true;
      setSelectedId(null);
      setNotice(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [creating]);
  // Success messages fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (notice?.kind !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const selectedNextStatus = selectedCase
    ? nextStatus[selectedCase.status]
    : undefined;
  // A new case or a moved case starts with empty prerequisite inputs (as the panel did).
  useEffect(() => {
    setAdvanceInputs({});
  }, [selectedCase?.id, selectedCase?.status]);
  const orderMap = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders],
  );
  const selectedOrder = orders.find((order) => order.id === draft.orderId);

  function startCreate(direction: Direction) {
    setFormError("");
    setNotice(null);
    setEditingId("");
    setDraft({ ...blankDraft(), direction });
    setCreating(true);
  }
  function draftFromCase(item: TradeCase): Draft {
    return {
      direction: item.direction,
      orderId: item.purchaseOrderId || item.salesOrderId || "",
      referenceCode: item.referenceCode,
      originCountryCode: item.originCountryCode,
      destinationCountryCode: item.destinationCountryCode,
      incotermsCode: item.incotermsCode || "",
      harmonizedSystemCode: item.harmonizedSystemCode || "",
      transportMode: item.transportMode,
      carrierReference: item.carrierReference || "",
      customsReference: item.customsReference || "",
      declaredValue: String(item.declaredValue),
      plannedShipDate: item.plannedShipDate || "",
      plannedArrivalDate: item.plannedArrivalDate || "",
      notes: item.notes || "",
    };
  }
  function startEdit(item: TradeCase) {
    setFormError("");
    setNotice(null);
    setEditingId(item.id);
    setDraft(draftFromCase(item));
    setCreating(true);
  }
  // Sistem dış ticaret listesi kartı `foreign-trade-case` sekmesinde `id` (dosyayı aç) ya da `direction=Import|Export` (yeni
  // dosya) parametresiyle açar (kart sistem sayfası yayımlı değilken bu eski ekran çizilir). Düzenlenebilir dosya (Taslak,
  // Planlandı; güncelleme izni) formda açılır, diğeri seçilir; okunamayan dosya hata olarak gösterilir.
  const caseParamRequest = useRef(0);
  useTakePageParam(recordParamPage, "id", (id) => {
    const requestId = ++caseParamRequest.current;
    setError("");
    void Promise.all([
      api<TradeCase>(`/api/foreign-trade/cases/${encodeURIComponent(id)}`),
      api<TradeCapabilities>("/api/foreign-trade/capabilities"),
    ])
      .then(([item, permissions]) => {
        if (requestId !== caseParamRequest.current) return;
        setCapabilities(permissions);
        selectCase(item.id);
        if (["Draft", "Booked"].includes(item.status) && permissions.canUpdate) startEdit(item);
      })
      .catch((cause) => { if (requestId === caseParamRequest.current) setError((cause as Error).message); });
  });
  useTakePageParam(recordParamPage, "direction", (direction) => {
    if (direction !== "Import" && direction !== "Export") return;
    caseParamRequest.current += 1;
    startCreate(direction);
  });
  function closeForm() {
    setCreating(false);
    setEditingId("");
    setFormError("");
  }
  /** Request body of the create/update endpoints (ForeignTradeCaseWriteRequest). */
  function writePayload(value: Draft, fallbackDeclaredValue: number) {
    return {
      direction: value.direction,
      purchaseOrderId: value.direction === "Import" ? value.orderId : null,
      salesOrderId: value.direction === "Export" ? value.orderId : null,
      referenceCode: value.referenceCode.trim(),
      originCountryCode: value.originCountryCode,
      destinationCountryCode: value.destinationCountryCode,
      incotermsCode: value.incotermsCode || null,
      harmonizedSystemCode: normalizeHsCode(value.harmonizedSystemCode.trim()) || null,
      transportMode: value.transportMode,
      carrierReference: value.carrierReference || null,
      customsReference: value.customsReference || null,
      declaredValue: Number(value.declaredValue || fallbackDeclaredValue),
      plannedShipDate: value.plannedShipDate || null,
      plannedArrivalDate: value.plannedArrivalDate || null,
      notes: value.notes || null,
    };
  }
  async function saveCase(event: React.FormEvent) {
    event.preventDefault();
    if (
      !selectedOrder ||
      (editingId ? !capabilities.canUpdate : !capabilities.canCreate)
    )
      return;
    const hsError = hsCodeError(draft.harmonizedSystemCode);
    if (hsError) {
      setFormError(hsError);
      return;
    }
    setBusyId(editingId || "create");
    setFormError("");
    try {
      const payload = writePayload(draft, selectedOrder.grandTotal);
      if (editingId) {
        await api<TradeCase>(`/api/foreign-trade/cases/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        closeForm();
        setNotice({
          kind: "success",
          text: tr(
            "Dış ticaret dosyası güncellendi ve denetim kaydına eklendi.",
            "Foreign trade case updated and added to the audit log.",
          ),
        });
      } else {
        const created = await api<TradeCase>("/api/foreign-trade/cases", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        closeForm();
        // Show the new case in the panel even if the current filters would hide it.
        setStage(null);
        setFilter("All");
        setQuery("");
        selectionCleared.current = false;
        setSelectedId(created.id);
        setNotice({
          kind: "success",
          text: tr(
            "Dış ticaret dosyası oluşturuldu ve denetim kaydına eklendi.",
            "Foreign trade case created and added to the audit log.",
          ),
        });
      }
      await load();
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusyId("");
    }
  }
  async function transition(
    item: TradeCase,
    status: TradeStatus,
    inputs: AdvanceInputs = {},
  ) {
    if (!capabilities.canAdvance) return;
    setBusyId(item.id);
    setNotice(null);
    let saved = false;
    try {
      // Ship prerequisites are case details: save them through the edit endpoint first
      // (allowed while Draft/Booked). The customs reference travels with the transition.
      const detailChanges = {
        ...(inputs.plannedShipDate ? { plannedShipDate: inputs.plannedShipDate } : {}),
        ...(inputs.declaredValue ? { declaredValue: inputs.declaredValue } : {}),
        ...(inputs.incotermsCode ? { incotermsCode: inputs.incotermsCode } : {}),
      };
      if (Object.keys(detailChanges).length) {
        if (!capabilities.canUpdate) return;
        await api<TradeCase>(`/api/foreign-trade/cases/${item.id}`, {
          method: "PUT",
          body: JSON.stringify(
            writePayload({ ...draftFromCase(item), ...detailChanges }, item.declaredValue),
          ),
        });
        saved = true;
      }
      await api<TradeCase>(`/api/foreign-trade/cases/${item.id}/transition`, {
        method: "POST",
        body: JSON.stringify({
          status,
          customsReference: inputs.customsReference?.trim() || null,
        }),
      });
      // Keep the moved file (and its message) in view when a stage tile filters the list.
      if (stage && stage !== status) setStage(status);
      setNotice({
        kind: "success",
        text: tr(
          `${item.referenceCode}: ${statusLabel(status)} durumuna geçirildi.`,
          `${item.referenceCode}: moved to ${statusLabel(status)}.`,
        ),
      });
      await load();
    } catch (cause) {
      setNotice({ kind: "error", text: (cause as Error).message });
      if (saved) await load();
    } finally {
      setBusyId("");
    }
  }
  async function linkInventoryDocument(item: TradeCase, documentId = inventoryDocumentId) {
    if (!documentId || !capabilities.canAdvance) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      await api<TradeCase>(
        `/api/foreign-trade/cases/${item.id}/inventory-document`,
        {
          method: "POST",
          body: JSON.stringify({ documentId }),
        },
      );
      setNotice({
        kind: "success",
        text: tr(
          "Standart stok belgesi dış ticaret dosyasına bağlandı; stok defterine ikinci kez kayıt yapılmadı.",
          "The standard inventory document was linked; no duplicate stock posting was created.",
        ),
      });
      setInventoryDocuments(
        await api<InventoryDocument[]>(
          `/api/foreign-trade/cases/${item.id}/inventory-documents`,
        ),
      );
      await load();
    } catch (cause) {
      setNotice({ kind: "error", text: (cause as Error).message });
    } finally {
      setBusyId("");
    }
  }

  // Header create buttons, the panel's Düzenle and İptal et are on the action bar (mockup 10, Dış Ticaret).
  const createReason = capabilities.canCreate
    ? undefined
    : tr("erp.foreign-trade.create izni gerekir", "Requires the erp.foreign-trade.create permission");
  const caseEditable = !!selectedCase && ["Draft", "Booked"].includes(selectedCase.status);
  const caseBusy = !!selectedCase && busyId === selectedCase.id;
  const gridExportRef = tradeGridExportRef;
  const tradeMore: MenuCommand[] = [
    { id: "trade-new-import", label: tr("İthalat dosyası", "Import case"), disabledReason: createReason, run: () => startCreate("Import") },
    { id: "trade-new-export", label: tr("İhracat dosyası", "Export case"), disabledReason: createReason, run: () => startCreate("Export") },
  ];
  // The panel's "… aşamasına geçir" step, with the same conditions (advanceCheck) and the inputs entered there.
  if (selectedCase && capabilities.canAdvance && selectedNextStatus) {
    const step = advanceCheck(selectedCase, selectedNextStatus, capabilities, advanceInputs, caseBusy);
    tradeMore.push({
      id: "trade-advance",
      label: tr(`${statusLabel(selectedNextStatus)} aşamasına geçir`, `Move to ${statusLabel(selectedNextStatus)}`),
      disabledReason: step.disabledReason,
      run: () => void transition(selectedCase, selectedNextStatus, advanceInputs),
    });
  }
  // "Stok belgesi bağla": the panel's former select + button, as a selection list (same conditions).
  if (
    selectedCase &&
    capabilities.canAdvance &&
    selectedCase.status !== "Cancelled" &&
    !selectedCase.purchaseReceiptId &&
    !selectedCase.salesDeliveryId &&
    canLinkInventoryDocument(selectedCase)
  )
    tradeMore.push({
      id: "trade-link-document",
      label: tr("Stok belgesi bağla…", "Link inventory document…"),
      disabledReason: caseBusy
        ? tr("İşlem sürüyor…", "An operation is in progress…")
        : !inventoryDocuments.some((document) => !document.isLinked)
          ? tr("Uygun kayıtlı stok belgesi yok", "No eligible posted inventory document")
          : undefined,
      run: () => setLinkPickerOpen(true),
    });
  if (selectedCase && caseEditable && capabilities.canAdvance)
    tradeMore.push({
      id: "trade-cancel",
      label: tr("İptal et", "Cancel case"),
      disabledReason: caseBusy ? tr("İşlem sürüyor…", "An operation is in progress…") : undefined,
      run: async () => {
        const confirmed = await confirmDialog({
          title: tr("Dosyayı iptal et", "Cancel case"),
          message: tr("Dosya iptal edilsin mi? Bu işlem geri alınamaz.", "Cancel this case? This cannot be undone."),
          confirmLabel: tr("Evet, iptal et", "Yes, cancel"),
          cancelLabel: tr("Vazgeç", "Keep"),
          tone: "danger",
        });
        if (confirmed) void transition(selectedCase, "Cancelled");
      },
    });
  const tradeCommands: PageCommands = {
    new: {
      primary: true,
      disabledReason: createReason,
      run: () => startCreate(filter === "Import" ? "Import" : "Export"),
    },
    open: {
      disabledReason: !selectedCase
        ? tr("Önce bir kayıt seçin", "Select a record first")
        : !caseEditable
          ? tr("Yalnız Taslak ve Planlandı dosyalar düzenlenebilir", "Only Draft and Booked cases can be edited")
          : !capabilities.canUpdate
            ? tr("erp.foreign-trade.update izni gerekir", "Requires the erp.foreign-trade.update permission")
            : caseBusy
              ? tr("İşlem sürüyor…", "An operation is in progress…")
              : undefined,
      run: () => {
        if (selectedCase) startEdit(selectedCase);
      },
    },
    delete: {
      disabledReason: selectedCase
        ? tr("Dosya silinemez; İşlemler'den iptal edin.", "Cases cannot be deleted; cancel from Actions.")
        : tr("Önce bir kayıt seçin", "Select a record first"),
    },
    more: [...tradeMore, csvExportCommand(gridExportRef)],
  };
  return (
    <div className="page-content foreign-trade-page list-v2">
      {!creating && <PageCommandsSlot commands={tradeCommands} />}
      {linkPickerOpen && selectedCase && (
        <ForeignTradeDocumentPicker
          direction={selectedCase.direction}
          caseCode={selectedCase.referenceCode}
          documents={inventoryDocuments}
          busy={busyId === selectedCase.id}
          locale={locale()}
          onClose={() => setLinkPickerOpen(false)}
          onLink={(documentId) => {
            setInventoryDocumentId(documentId);
            setLinkPickerOpen(false);
            void linkInventoryDocument(selectedCase, documentId);
          }}
        />
      )}
      <ListPageHeader
        title={tr("İthalat ve ihracat dosyaları", "Import and export cases")}
        description={tr(
          "Satın alma ve satış siparişlerine bağlı lojistik, gümrük referansı ve sevkiyat adımlarını izleyin.",
          "Track logistics, customs references and shipment steps linked to purchase and sales orders.",
        )}
        count={loading && cases.length === 0 ? null : cases.length}
        countLabel={tr("dosya", "cases")}
      />
      {(!capabilities.canCreate ||
        !capabilities.canUpdate ||
        !capabilities.canAdvance) &&
        !loading &&
        !error && (
          <div className="foreign-trade-access-note" role="note">
            <strong>
              {tr("Eksik işlem izni", "Missing action permission")}
            </strong>
            <span>
              {[
                !capabilities.canCreate && "erp.foreign-trade.create",
                !capabilities.canUpdate && "erp.foreign-trade.update",
                !capabilities.canAdvance && "erp.foreign-trade.execute",
              ]
                .filter(Boolean)
                .join(" · ")}{" "}
              {tr(
                "izinlerini firma yöneticiniz İzin politikaları ekranında bu üyeye veya TenantUser rolüne tanımlayabilir. Kayıtları görüntülemek için ayrıca",
                "permissions can be assigned to this member or the TenantUser role by your company administrator on the Access policies page. Viewing records also requires",
              )}{" "}
              <code>erp.foreign-trade.read</code>{" "}
              {tr("gerekir.", "permission.")}
            </span>
          </div>
        )}
      {error && (
        <div className="alert inline-alert foreign-trade-page-alert" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label={tr("Bildirimi kapat", "Dismiss message")}
            onClick={() => setError("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <ForeignTradeFilters
        query={query}
        direction={filter}
        counts={{
          all: cases.length,
          imports: cases.filter((x) => x.direction === "Import").length,
          exports: cases.filter((x) => x.direction === "Export").length,
        }}
        onQueryChange={setQuery}
        onDirectionChange={setFilter}
        stage={stage}
        onStageChange={setStage}
        statusLabel={statusLabel}
        onRefresh={() => {
          if (!loading) void load();
        }}
        toolsSlotRef={setToolsSlot}
      />
      {creating && (
        <div
          className="foreign-trade-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="panel foreign-trade-create fin-rf-host"
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? tr("Dosyayı düzenle", "Edit case") : tr("Yeni dosya", "New case")}
          >
            <RecordFormPage
              variant="dialog"
              title={
                editingId
                  ? tr(
                      `${directionLabel(draft.direction)} dosyasını düzenle`,
                      `Edit ${draft.direction.toLowerCase()} case`,
                    )
                  : tr(
                      `${directionLabel(draft.direction)} dosyası oluştur`,
                      `Create ${draft.direction.toLowerCase()} case`,
                    )
              }
              mode={editingId ? "edit" : "create"}
              busy={busyId === (editingId || "create")}
              saveLabel={
                editingId
                  ? tr("Değişiklikleri kaydet", "Save changes")
                  : tr("Dosya oluştur", "Create case")
              }
              onSubmit={(event) => void saveCase(event)}
              onCancel={closeForm}
              error={formError}
              onDismissError={() => setFormError("")}
              status={
                <>
                  <span>
                    {tr(
                      "Sipariş, firma veritabanında doğrulanır ve referans değişiklikleri denetlenir.",
                      "The order is validated in the company database and reference changes are audited.",
                    )}
                  </span>
                  {!selectedOrder && (
                    <span className="rf-status-warning">
                      {tr(
                        "Kaydetmek için bağlı sipariş seçin.",
                        "Select a linked order to save.",
                      )}
                    </span>
                  )}
                </>
              }
            >
              {!editingId &&
                !orders.some(
                  (order) =>
                    order.direction === draft.direction &&
                    order.status !== "Cancelled",
                ) && (
                  <p role="status" className="fin-rf-note">
                    {draft.direction === "Import"
                      ? tr(
                          "İthalat dosyası için seçilebilir satın alma siparişi bulunamadı. Önce Satın Alma → Siparişler ekranından bir sipariş oluşturun.",
                          "No purchase order is available. Create a purchase order in Purchasing → Orders first.",
                        )
                      : tr(
                          "İhracat dosyası için seçilebilir satış siparişi bulunamadı. Önce Satış → Siparişler ekranından bir sipariş oluşturun.",
                          "No sales order is available. Create a sales order in Sales → Orders first.",
                        )}
                  </p>
                )}
              <RecordFormGroup
                title={tr("Dosya Kimliği", "Case identity")}
                bodyClassName="fin-rf-grid-4"
              >
                <label className="fin-rf-span-2">
                  <span>
                    {tr("Bağlı sipariş", "Linked order")}
                    <RequiredMark />
                  </span>
                  <select
                    className="rf-must"
                    required
                    disabled={!!editingId}
                    value={draft.orderId}
                    onChange={(e) => {
                      const orderId = e.target.value;
                      const order = orders.find((x) => x.id === orderId);
                      setDraft((x) => ({
                        ...x,
                        orderId,
                        declaredValue: order ? String(order.grandTotal) : "",
                      }));
                    }}
                  >
                    <option value="">
                      {tr("Sipariş seçin", "Select an order")}
                    </option>
                    {orders
                      .filter(
                        (order) =>
                          order.direction === draft.direction &&
                          order.status !== "Cancelled",
                      )
                      .map((order) => (
                        <option value={order.id} key={order.id}>
                          {order.code} · {order.counterpartyName} ·{" "}
                          {order.grandTotal.toLocaleString(locale())}{" "}
                          {order.currencyCode}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="fin-rf-span-2">
                  <span>
                    {tr("Dış ticaret referansı", "Foreign trade reference")}
                    <RequiredMark />
                  </span>
                  <input
                    className="rf-must rf-mono"
                    required
                    maxLength={50}
                    value={draft.referenceCode}
                    onChange={(e) =>
                      setDraft((x) => ({ ...x, referenceCode: e.target.value }))
                    }
                    placeholder={
                      draft.direction === "Import"
                        ? "IMP-2026-001"
                        : "EXP-2026-001"
                    }
                  />
                </label>
              </RecordFormGroup>
              <RecordFormGroup
                title={tr("Güzergâh ve Teslim", "Route and delivery")}
                bodyClassName="fin-rf-grid-4"
              >
                <label>
                  {tr(
                    "Çıkış ülkesi (ISO alfa-2)",
                    "Origin country (ISO alpha-2)",
                  )}
                  <input
                    required
                    className="rf-mono"
                    maxLength={2}
                    pattern="[A-Z]{2}"
                    autoCapitalize="characters"
                    value={draft.originCountryCode}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        originCountryCode: countryInput(e.target.value),
                      }))
                    }
                    placeholder="TR"
                  />
                  <small className="foreign-trade-field-hint">
                    {tr("2 harf, ör. TR", "2 letters, e.g. TR")}
                  </small>
                </label>
                <label>
                  {tr(
                    "Varış ülkesi (ISO alfa-2)",
                    "Destination country (ISO alpha-2)",
                  )}
                  <input
                    required
                    className="rf-mono"
                    maxLength={2}
                    pattern="[A-Z]{2}"
                    autoCapitalize="characters"
                    value={draft.destinationCountryCode}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        destinationCountryCode: countryInput(e.target.value),
                      }))
                    }
                    placeholder="DE"
                  />
                  <small className="foreign-trade-field-hint">
                    {tr("2 harf, ör. DE", "2 letters, e.g. DE")}
                  </small>
                </label>
                <label>
                  Incoterms 2020
                  <select
                    value={draft.incotermsCode}
                    onChange={(e) =>
                      setDraft((x) => ({ ...x, incotermsCode: e.target.value }))
                    }
                  >
                    <option value="">{tr("Seçin", "Select")}</option>
                    {incotermsCodes.map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("HS kodu", "HS code")}
                  <input
                    className="rf-mono"
                    inputMode="decimal"
                    maxLength={16}
                    value={draft.harmonizedSystemCode}
                    aria-invalid={hsCodeError(draft.harmonizedSystemCode) ? true : undefined}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.\s]/g, "");
                      e.target.setCustomValidity(hsCodeError(value));
                      setDraft((x) => ({ ...x, harmonizedSystemCode: value }));
                    }}
                    onBlur={(e) => {
                      // Once valid, show the stored digits-only form.
                      if (!hsCodeError(e.target.value))
                        setDraft((x) => ({
                          ...x,
                          harmonizedSystemCode: normalizeHsCode(x.harmonizedSystemCode.trim()),
                        }));
                    }}
                    placeholder="8443.32"
                  />
                  <small className="foreign-trade-field-hint">
                    {tr("6–10 hane; 8443.32 yazabilirsiniz", "6–10 digits; you can type 8443.32")}
                  </small>
                </label>
                <label>
                  {tr("Taşıma", "Transport")}
                  <select
                    value={draft.transportMode}
                    onChange={(e) =>
                      setDraft((x) => ({ ...x, transportMode: e.target.value }))
                    }
                  >
                    {(
                      ["Road", "Sea", "Air", "Rail", "Multimodal"] as const
                    ).map((mode) => (
                      <option key={mode} value={mode}>
                        {transportLabel(mode)}
                      </option>
                    ))}
                  </select>
                </label>
              </RecordFormGroup>
              <RecordFormGroup
                title={tr("Değer ve Planlama", "Value and planning")}
                bodyClassName="rf-custom-grid"
              >
                <label>
                  {tr("Beyan değeri", "Declared value")} (
                  {selectedOrder?.currencyCode ||
                    tr("sipariş para birimi", "order currency")}
                  )
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.declaredValue}
                    onChange={(e) =>
                      setDraft((x) => ({ ...x, declaredValue: e.target.value }))
                    }
                    placeholder={
                      selectedOrder
                        ? String(selectedOrder.grandTotal)
                        : tr("Sipariş seçin", "Select an order")
                    }
                  />
                </label>
                <label>
                  {tr("Planlanan sevkiyat", "Planned shipment")}
                  <input
                    type="date"
                    value={draft.plannedShipDate}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        plannedShipDate: e.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {tr("Planlanan varış", "Planned arrival")}
                  <input
                    type="date"
                    value={draft.plannedArrivalDate}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        plannedArrivalDate: e.target.value,
                      }))
                    }
                  />
                </label>
              </RecordFormGroup>
              <RecordFormGroup
                title={tr("Referanslar ve Not", "References and notes")}
                bodyClassName="fin-rf-grid-2"
              >
                <label>
                  {tr(
                    "Taşıyıcı / takip referansı",
                    "Carrier / tracking reference",
                  )}
                  <input
                    maxLength={100}
                    value={draft.carrierReference}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        carrierReference: e.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {tr("Gümrük referansı", "Customs reference")}
                  <input
                    maxLength={100}
                    value={draft.customsReference}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        customsReference: e.target.value,
                      }))
                    }
                  />
                </label>
              <label className="fin-rf-span-all">
                {tr("Operasyon notu", "Operational notes")}
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft((x) => ({ ...x, notes: e.target.value }))
                  }
                />
              </label>
              </RecordFormGroup>
            </RecordFormPage>
          </section>
        </div>
      )}
      <div className="sales-list-body has-detail foreign-trade-body">
        <section
          className="foreign-trade-list list-v2-list"
          aria-label={tr("Dış ticaret dosyaları", "Foreign trade cases")}
        >
          <ForeignTradeGrid
            items={filtered}
            caseCount={cases.length}
            loading={loading}
            selectedId={selectedCase?.id || null}
            orderMap={orderMap}
            statusLabel={statusLabel}
            directionLabel={directionLabel}
            onSelect={selectCase}
            onOpen={openCase}
            exportActionsRef={gridExportRef}
            transportLabel={transportLabel}
            fields={screenFields}
            toolbarContainer={toolsSlot}
            footer={
              <ListFooter hints={tr("↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç", "↑↓ move · Space mark · Enter open · Double-click open")}>
                <span>
                  <span>{tr("Gösterilen", "Shown")}</span>{" "}
                  <span>
                    {filtered.length.toLocaleString(locale())} / {cases.length.toLocaleString(locale())}
                  </span>
                </span>
                {/* The page loads one page of 100 cases; there is no pager. */}
                {cases.length >= 100 && (
                  <span>
                    {tr(
                      `ilk 100 / toplam ${caseTotal.toLocaleString(locale())}`,
                      `first 100 / total ${caseTotal.toLocaleString(locale())}`,
                    )}
                  </span>
                )}
              </ListFooter>
            }
          />
        </section>
        <ForeignTradeDetail
          ref={detailRef}
          item={selectedCase}
          orderMap={orderMap}
          documents={inventoryDocuments}
          capabilities={capabilities}
          busyId={busyId}
          nextStatus={selectedNextStatus}
          locale={locale()}
          statusLabel={statusLabel}
          directionLabel={directionLabel}
          transportLabel={transportLabel}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
          inputs={advanceInputs}
          onInputsChange={setAdvanceInputs}
        />
      </div>
    </div>
  );
}
