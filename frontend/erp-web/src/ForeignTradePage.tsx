import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "./authApi";
import { localizedText } from "./locale";
import {
  PackageCheck,
  Plus,
  Ship,
} from "lucide-react";
import "./foreign-trade.css";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import "./finance-record-forms.css";
import "./foreign-trade/foreign-trade-list-v2.css";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ForeignTradeFilters } from "./foreign-trade/components/ForeignTradeFilters";
import {
  ForeignTradeGrid,
  defaultForeignTradeFields,
  type ForeignTradeScreenField,
} from "./foreign-trade/components/ForeignTradeGrid";
import { ForeignTradeDetail } from "./foreign-trade/components/ForeignTradeDetail";
import type {
  Direction,
  TradeStatus,
  TradeOrder,
  TradeCase,
  InventoryDocument,
  TradeCapabilities,
  Draft,
  CasePage,
} from "./foreign-trade/types";

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
}: {
  token: string;
  role: string;
}) {
  const [cases, setCases] = useState<TradeCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<TradeCase | null>(null);
  const [orders, setOrders] = useState<TradeOrder[]>([]);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"All" | Direction>("All");
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
  const [inventoryDocumentId, setInventoryDocumentId] = useState("");
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
            body?.title ||
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
      setSelectedCase((current) =>
        current
          ? casePage.items.find((x) => x.id === current.id) || null
          : null,
      );
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
    api<{ fields: ForeignTradeScreenField[] }>(
      "/api/screen-views/foreign-trade-files/active",
    )
      .then((view) => {
        if (active && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    setInventoryDocuments([]);
    setInventoryDocumentId("");
    if (!selectedCase) return;
    let active = true;
    void api<InventoryDocument[]>(
      `/api/foreign-trade/cases/${selectedCase.id}/inventory-documents`,
    )
      .then((items) => {
        if (active) {
          setInventoryDocuments(items);
          setInventoryDocumentId(items.find((x) => x.isLinked)?.id || "");
        }
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [selectedCase?.id, token]);

  const filtered = useMemo(
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
  const selectedNextStatus = selectedCase
    ? nextStatus[selectedCase.status]
    : undefined;
  const orderMap = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders],
  );
  const selectedOrder = orders.find((order) => order.id === draft.orderId);

  function startCreate(direction: Direction) {
    setError("");
    setNotice("");
    setEditingId("");
    setDraft({ ...blankDraft(), direction });
    setCreating(true);
  }
  function startEdit(item: TradeCase) {
    setError("");
    setNotice("");
    setEditingId(item.id);
    setDraft({
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
    });
    setCreating(true);
  }
  async function saveCase(event: React.FormEvent) {
    event.preventDefault();
    if (
      !selectedOrder ||
      (editingId ? !capabilities.canUpdate : !capabilities.canCreate)
    )
      return;
    setBusyId(editingId || "create");
    setError("");
    try {
      const payload = {
        direction: draft.direction,
        purchaseOrderId: draft.direction === "Import" ? draft.orderId : null,
        salesOrderId: draft.direction === "Export" ? draft.orderId : null,
        referenceCode: draft.referenceCode,
        originCountryCode: draft.originCountryCode,
        destinationCountryCode: draft.destinationCountryCode,
        incotermsCode: draft.incotermsCode || null,
        harmonizedSystemCode: draft.harmonizedSystemCode || null,
        transportMode: draft.transportMode,
        carrierReference: draft.carrierReference || null,
        customsReference: draft.customsReference || null,
        declaredValue: Number(draft.declaredValue || selectedOrder.grandTotal),
        plannedShipDate: draft.plannedShipDate || null,
        plannedArrivalDate: draft.plannedArrivalDate || null,
        notes: draft.notes || null,
      };
      if (editingId) {
        await api<TradeCase>(`/api/foreign-trade/cases/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setCreating(false);
        setEditingId("");
        setNotice(
          tr(
            "Dış ticaret dosyası güncellendi ve denetim kaydına eklendi.",
            "Foreign trade case updated and added to the audit log.",
          ),
        );
      } else {
        await api<TradeCase>("/api/foreign-trade/cases", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setCreating(false);
        setNotice(
          tr(
            "Dış ticaret dosyası oluşturuldu ve denetim kaydına eklendi.",
            "Foreign trade case created and added to the audit log.",
          ),
        );
      }
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId("");
    }
  }
  async function transition(item: TradeCase, status: TradeStatus) {
    if (!capabilities.canAdvance) return;
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      await api<TradeCase>(`/api/foreign-trade/cases/${item.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setSelectedCase({ ...item, status });
      setNotice(
        tr(
          `${item.referenceCode}: ${statusLabel(status)} durumuna geçirildi.`,
          `${item.referenceCode}: moved to ${statusLabel(status)}.`,
        ),
      );
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId("");
    }
  }
  async function linkInventoryDocument(item: TradeCase) {
    if (!inventoryDocumentId || !capabilities.canAdvance) return;
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      await api<TradeCase>(
        `/api/foreign-trade/cases/${item.id}/inventory-document`,
        {
          method: "POST",
          body: JSON.stringify({ documentId: inventoryDocumentId }),
        },
      );
      setNotice(
        tr(
          "Standart stok belgesi dış ticaret dosyasına bağlandı; stok defterine ikinci kez kayıt yapılmadı.",
          "The standard inventory document was linked; no duplicate stock posting was created.",
        ),
      );
      setInventoryDocuments(
        await api<InventoryDocument[]>(
          `/api/foreign-trade/cases/${item.id}/inventory-documents`,
        ),
      );
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="page-content foreign-trade-page list-v2">
      <ListPageHeader
        title={tr("İthalat ve ihracat dosyaları", "Import and export cases")}
        description={tr(
          "Satın alma ve satış siparişlerine bağlı lojistik, gümrük referansı ve sevkiyat adımlarını izleyin.",
          "Track logistics, customs references and shipment steps linked to purchase and sales orders.",
        )}
        count={loading && cases.length === 0 ? null : cases.length}
        countLabel={tr("kayıt", "records")}
      >
        {capabilities.canCreate && (
          <>
            <button
              className="secondary"
              onClick={() => startCreate("Import")}
            >
              <Plus size={15} />
              {tr("İthalat dosyası", "Import case")}
            </button>
            <button className="primary" onClick={() => startCreate("Export")}>
              <Plus size={15} />
              {tr("İhracat dosyası", "Export case")}
            </button>
          </>
        )}
      </ListPageHeader>
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
        <div className="alert inline-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
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
        onRefresh={() => {
          if (!loading) void load();
        }}
        toolsSlotRef={setToolsSlot}
      />
      <div className="foreign-trade-metrics">
        <article className="panel">
          <span>
            <PackageCheck size={17} />
          </span>
          <b>{cases.filter((x) => x.status === "CustomsClearance").length}</b>
          <small>{tr("Gümrük adımı", "At customs")}</small>
        </article>
        <article className="panel">
          <span>
            <Ship size={17} />
          </span>
          <b>
            {
              cases.filter(
                (x) =>
                  x.status === "Shipped" || x.status === "CustomsClearance",
              ).length
            }
          </b>
          <small>{tr("Yolda", "In transit")}</small>
        </article>
      </div>
      {creating && (
        <div
          className="foreign-trade-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCreating(false);
              setEditingId("");
            }
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
              onCancel={() => {
                setCreating(false);
                setEditingId("");
              }}
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
                    maxLength={2}
                    pattern="[A-Za-z]{2}"
                    value={draft.originCountryCode}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        originCountryCode: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="TR"
                  />
                </label>
                <label>
                  {tr(
                    "Varış ülkesi (ISO alfa-2)",
                    "Destination country (ISO alpha-2)",
                  )}
                  <input
                    required
                    maxLength={2}
                    pattern="[A-Za-z]{2}"
                    value={draft.destinationCountryCode}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        destinationCountryCode: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="DE"
                  />
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
                    {[
                      "EXW",
                      "FCA",
                      "CPT",
                      "CIP",
                      "DAP",
                      "DPU",
                      "DDP",
                      "FAS",
                      "FOB",
                      "CFR",
                      "CIF",
                    ].map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("HS kodu", "HS code")}
                  <input
                    maxLength={10}
                    pattern="[0-9]{0,10}"
                    value={draft.harmonizedSystemCode}
                    onChange={(e) =>
                      setDraft((x) => ({
                        ...x,
                        harmonizedSystemCode: e.target.value,
                      }))
                    }
                    placeholder={tr("6–10 rakam", "6–10 digits")}
                  />
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
      <section className="panel foreign-trade-list list-v2-list">
        <div
          className={`foreign-trade-workspace${selectedCase ? " has-selection" : ""}`}
        >
          <div className="foreign-trade-record-list">
            <ForeignTradeGrid
              items={filtered}
              caseCount={cases.length}
              loading={loading}
              selectedId={selectedCase?.id || null}
              orderMap={orderMap}
              capabilities={capabilities}
              statusLabel={statusLabel}
              directionLabel={directionLabel}
              onSelect={setSelectedCase}
              transportLabel={transportLabel}
              fields={screenFields}
              toolbarContainer={toolsSlot}
            />
          </div>
          <ForeignTradeDetail
            item={selectedCase}
            orderMap={orderMap}
            documents={inventoryDocuments}
            documentId={inventoryDocumentId}
            capabilities={capabilities}
            busyId={busyId}
            nextStatus={selectedNextStatus}
            locale={locale()}
            statusLabel={statusLabel}
            directionLabel={directionLabel}
            transportLabel={transportLabel}
            onClear={() => setSelectedCase(null)}
            onDocumentChange={setInventoryDocumentId}
            onLinkDocument={(item) => void linkInventoryDocument(item)}
            onEdit={startEdit}
            onTransition={(item, status) => void transition(item, status)}
          />
        </div>
      </section>
      <p className="foreign-trade-footnote">
        {tr(
          "Bu ekran siparişe bağlı iç operasyon kaydıdır. HS kodu, Incoterms, taşıma ve beyan bilgileri kullanıcı tarafından doğrulanmalıdır; resmî gümrük beyannamesi veya e-belge gönderimi değildir.",
          "This is an internal operations record linked to an order. Users must verify HS codes, Incoterms, transport and declaration details; this is not an official customs declaration or e-document submission.",
        )}
      </p>
    </div>
  );
}
