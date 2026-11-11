import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, localDateString } from "./erpApi";
import type {
  SalesCustomer,
  StockItem,
  Warehouse,
  WarehouseLocationOption,
} from "./erp-types";
import SearchableRecordPicker from "./SearchableRecordPicker";

export function StandaloneFulfillmentPanel({
  token,
  sales = false,
  customers,
  stockItems,
  warehouses,
  initialCustomerId = "",
}: {
  token: string;
  sales?: boolean;
  customers: SalesCustomer[];
  stockItems: StockItem[];
  warehouses: Warehouse[];
  initialCustomerId?: string;
}) {
  type Row = {
    id: string;
    code: string;
    customerId?: string;
    supplierId?: string;
    customerName?: string;
    supplierName?: string;
    warehouseId: string;
    date: string;
    status: "Draft" | "Posted" | "Voided";
    lineCount: number;
    createdAt: string;
    invoiceId?: string | null;
  };
  type Line = {
    stockItemId: string;
    quantity: string;
    unitCostBase: string;
    trackingCode: string;
    expiryDate: string;
    storageLocationId: string;
  };
  type InvoiceLine = {
    lineNumber: number;
    stockCode: string;
    stockName: string;
    unitCode: string;
    quantity: number;
    unitPrice: string;
    discountPercent: string;
    vatPercent: string;
  };
  const [items, setItems] = useState<Row[]>([]),
    [customerId, setCustomerId] = useState(initialCustomerId),
    [warehouseId, setWarehouseId] = useState(""),
    [code, setCode] = useState(""),
    [date, setDate] = useState(localDateString()),
    [editingId, setEditingId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([
      {
        stockItemId: "",
        quantity: "1",
        unitCostBase: "0",
        trackingCode: "",
        expiryDate: "",
        storageLocationId: "",
      },
    ]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [locations, setLocations] = useState<WarehouseLocationOption[]>([]),
    [invoiceDraft, setInvoiceDraft] = useState<{
      delivery: Row;
      date: string;
      lines: InvoiceLine[];
      eDocument: { scenario: string; typeCode: string; recipientAlias: string; purchaseUrl: string; paymentTaxId: string; paymentTitle: string; paymentAlias: string; paymentAgentName: string; paymentType: string; paymentDate: string; paymentDueDate: string; paymentMeans: string; paymentInstructionNote: string; intermediaryCountry: string; intermediaryCountryCode: string; intermediaryCity: string; intermediaryDistrict: string; carrierTaxId: string; carrierName: string; carrierSurname: string; sentAt: string };
    } | null>(null);
  const endpoint = sales
    ? "/api/sales/standalone-deliveries"
    : "/api/purchasing/standalone-receipts";
  const counterparties = customers.filter(
    (x) =>
      x.isActive && (sales ? x.type !== "Supplier" : x.type !== "Customer"),
  );
  useEffect(() => {
    if (initialCustomerId) setCustomerId(initialCustomerId);
  }, [initialCustomerId]);
  async function load() {
    try {
      const result = await api<{ items: Row[] }>(
        `${endpoint}/?page=1&pageSize=100`,
        token,
      );
      setItems(result.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [token, sales]);
  useEffect(() => {
    let cancelled = false;
    setLocations([]);
    if (!warehouseId) return;
    api<WarehouseLocationOption[]>(
      `/api/warehouses/${warehouseId}/locations`,
      token,
    )
      .then((result) => {
        if (!cancelled) setLocations(result.filter((x) => x.isActive));
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, warehouseId]);
  async function createDraft(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const valid = lines.filter(
        (x) => x.stockItemId && Number(x.quantity) > 0,
      );
      if (!valid.length) throw new Error("En az bir stok satırı ekleyin.");
      const requestId = crypto.randomUUID();
      const request = {
        requestId,
        code,
        customerId,
        supplierId: customerId,
        warehouseId,
        [sales ? "deliveryDate" : "receiptDate"]: date,
        lines: valid.map((x) => ({
          stockItemId: x.stockItemId,
          quantity: Number(x.quantity),
          unitCode:
            stockItems.find((i) => i.id === x.stockItemId)?.unitCode || "EA",
          unitCostBase: Number(x.unitCostBase),
          trackingCode: x.trackingCode || null,
          expiryDate: x.expiryDate || null,
          storageLocationId: x.storageLocationId || null,
        })),
      };
      await api<{ id: string }>(
        editingId ? `${endpoint}/${editingId}` : `${endpoint}/`,
        token,
        { method: editingId ? "PUT" : "POST", body: JSON.stringify(request) },
      );
      setNotice(
        editingId
          ? "Taslak güncellendi. Stok hareketi oluşturulmadı."
          : "Taslak oluşturuldu. Takip bilgileri taslakla birlikte saklandı; stok hareketi için listedeki Kaydet düğmesini kullanın.",
      );
      setEditingId(null);
      setCode("");
      setCustomerId("");
      setWarehouseId("");
      setLines([
        {
          stockItemId: "",
          quantity: "1",
          unitCostBase: "0",
          trackingCode: "",
          expiryDate: "",
          storageLocationId: "",
        },
      ]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editDraft(item: Row) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const detail = await api<{
        customerId?: string;
        supplierId?: string;
        warehouseId: string;
        code: string;
        deliveryDate?: string;
        receiptDate?: string;
        lines: Array<{
          stockItemId: string;
          quantity: number;
          unitCostBase?: number;
          trackingCode?: string | null;
          expiryDate?: string | null;
          storageLocationId?: string | null;
        }>;
      }>(`${endpoint}/${item.id}`, token);
      setEditingId(item.id);
      setCustomerId(detail.customerId || detail.supplierId || "");
      setWarehouseId(detail.warehouseId);
      setCode(detail.code);
      setDate(detail.deliveryDate || detail.receiptDate || localDateString());
      setLines(
        detail.lines.map((x) => ({
          stockItemId: x.stockItemId,
          quantity: String(x.quantity),
          unitCostBase: String(x.unitCostBase ?? 0),
          trackingCode: x.trackingCode || "",
          expiryDate: x.expiryDate || "",
          storageLocationId: x.storageLocationId || "",
        })),
      );
      setNotice(`${item.code} taslağı düzenleniyor.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function cancelEdit() {
    setEditingId(null);
    setCode("");
    setCustomerId("");
    setWarehouseId("");
    setDate(localDateString());
    setLines([
      {
        stockItemId: "",
        quantity: "1",
        unitCostBase: "0",
        trackingCode: "",
        expiryDate: "",
        storageLocationId: "",
      },
    ]);
    setNotice("Taslak düzenlemesi iptal edildi.");
  }
  async function postDraft(item: Row) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`${endpoint}/${item.id}/post`, token, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNotice(
        sales
          ? "İrsaliye kaydedildi; stok düşüldü."
          : "Mal kabul kaydedildi; belirtilen maliyetle stoğa eklendi.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function beginInvoice(item: Row) {
    setBusy(true);
    setError("");
    try {
      const detail = await api<{
        lines: Array<{
          lineNumber: number;
          stockCode: string;
          stockName: string;
          unitCode: string;
          quantity: number;
        }>;
      }>(`${endpoint}/${item.id}`, token);
      setInvoiceDraft({
        delivery: item,
        date: localDateString(),
        eDocument: { scenario: "", typeCode: "SATIS", recipientAlias: "", purchaseUrl: "", paymentTaxId: "", paymentTitle: "", paymentAlias: "", paymentAgentName: "", paymentType: "", paymentDate: "", paymentDueDate: "", paymentMeans: "", paymentInstructionNote: "", intermediaryCountry: "", intermediaryCountryCode: "", intermediaryCity: "", intermediaryDistrict: "", carrierTaxId: "", carrierName: "", carrierSurname: "", sentAt: "" },
        lines: detail.lines.map((line) => ({
          ...line,
          unitPrice: "0",
          discountPercent: "0",
          vatPercent: "20",
        })),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createInvoice(event: FormEvent) {
    event.preventDefault();
    if (!invoiceDraft) return;
    setBusy(true);
    setError("");
    try {
      const invoice = await api<{ id: string; code: string }>(
        `${endpoint}/${invoiceDraft.delivery.id}/invoice`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            invoiceDate: invoiceDraft.date,
            lines: invoiceDraft.lines.map((line) => ({
              lineNumber: line.lineNumber,
              unitPrice: Number(line.unitPrice),
              discountPercent: Number(line.discountPercent),
              vatPercent: Number(line.vatPercent),
            })),
            eDocument: { ...invoiceDraft.eDocument, sentAt: invoiceDraft.eDocument.sentAt || null,
              paymentDate: invoiceDraft.eDocument.paymentDate ? new Date(invoiceDraft.eDocument.paymentDate).toISOString() : null,
              paymentDueDate: invoiceDraft.eDocument.paymentDueDate ? new Date(invoiceDraft.eDocument.paymentDueDate).toISOString() : null },
          }),
        },
      );
      setInvoiceDraft(null);
      setNotice(
        `Fatura ${invoice.code} oluşturuldu; irsaliyedeki stok çıkışı tekrarlanmadı.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: Row) {
    const action =
      item.status === "Draft"
        ? "silinsin"
        : "ters stok hareketiyle iptal edilsin";
    if (!window.confirm(`${item.code} ${action} mi?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `${endpoint}/${item.id}${item.status === "Draft" ? "" : "/void"}`,
        token,
        { method: item.status === "Draft" ? "DELETE" : "POST" },
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`panel standalone-fulfillment-panel${sales ? " sales-order-create-card sales-delivery-create-card" : ""}`}
    >
      <div className="panel-heading">
        <div>
          <b>
            {sales
              ? "Siparişsiz satış irsaliyesi"
              : "Siparişsiz satın alma mal kabulü"}
          </b>
          <small>
            {sales
              ? "Kaydetme stok çıkışı oluşturur; fatura daha sonra kesilir."
              : "Birim maliyeti girin; fatura geldiğinde maliyet farkı işlenir."}
          </small>
        </div>
      </div>
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
        </div>
      )}
      {notice && <div className="success-banner">{notice}</div>}
      <form id={sales ? "sales-delivery-create-form" : undefined} className="collection-form" onSubmit={createDraft}>
        <div className="form-two">
          <label>
            {sales ? "Müşteri" : "Tedarikçi"}
            <SearchableRecordPicker
              options={counterparties.map((x) => ({
                id: x.id,
                label: `${x.code} · ${x.name}`,
                searchText: x.code,
              }))}
              selectedId={customerId}
              onSelect={setCustomerId}
              title={sales ? "Müşteri seçin" : "Tedarikçi seçin"}
              placeholder="Cari seçin"
              searchPlaceholder="Cari kodu veya unvanıyla ara"
              emptyMessage="Aramanızla eşleşen cari bulunamadı."
              required
            />
          </label>
          <label>
            Depo
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setLines((rows) =>
                  rows.map((r) => ({ ...r, storageLocationId: "" })),
                );
              }}
              required
            >
              <option value="">Depo seçin</option>
              {warehouses
                .filter((x) => x.isActive)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="form-two">
          <label>
            {sales ? "İrsaliye kodu" : "Mal kabul kodu"}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={40}
              placeholder={sales ? "IRS-2026-001" : "MK-2026-001"}
            />
          </label>
          <label>
            Tarih
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
        </div>
        {sales && (
          <div className="quote-lines-heading">
            <b>İrsaliye satırları</b>
            <button
              type="button"
              className="secondary small-button"
              data-line-add-shortcut
              title="Ctrl+Shift+Enter ile satır ekle"
              onClick={() =>
                setLines((rows) => [
                  ...rows,
                  {
                    stockItemId: "",
                    quantity: "1",
                    unitCostBase: "0",
                    trackingCode: "",
                    expiryDate: "",
                    storageLocationId: "",
                  },
                ])
              }
            >
              Satır ekle
            </button>
          </div>
        )}
        {lines.map((line, index) => (
          <div
            className={sales ? "quote-line delivery-document-line" : "form-two"}
            key={index}
          >
            {sales && (
              <div className="quote-line-title">
                <b>Satır {index + 1}</b>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="row-action"
                    onClick={() =>
                      setLines((rows) => rows.filter((_, i) => i !== index))
                    }
                  >
                    Kaldır
                  </button>
                )}
              </div>
            )}
            <div className="form-two delivery-document-line-fields">
              <label>
                Stok kartı
                <SearchableRecordPicker
                  options={stockItems
                    .filter((x) => x.isActive)
                    .map((x) => ({
                      id: x.id,
                      label: `${x.code} · ${x.name} (${x.unitCode})`,
                      searchText: x.code,
                    }))}
                  selectedId={line.stockItemId}
                  onSelect={(value) =>
                    setLines((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, stockItemId: value } : r,
                      ),
                    )
                  }
                  title="Stok kartı seçin"
                  placeholder="Stok seçin"
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
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, quantity: e.target.value } : r,
                      ),
                    )
                  }
                  required
                />
              </label>
              {locations.length > 0 && (
                <label>
                  Depo gözü (isteğe bağlı)
                  <select
                    value={line.storageLocationId}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, storageLocationId: e.target.value }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="">Depo düzeyinde</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} · {location.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!sales && (
                <label>
                  Birim maliyet (temel birim)
                  <input
                    type="number"
                    min="0"
                    step="0.00000001"
                    value={line.unitCostBase}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, unitCostBase: e.target.value }
                            : r,
                        ),
                      )
                    }
                    required
                  />
                </label>
              )}
              {stockItems.find((x) => x.id === line.stockItemId)?.trackingMode !==
                "None" &&
                line.stockItemId && (
                  <label>
                    Lot / seri kodu
                    <input
                      value={line.trackingCode}
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? { ...r, trackingCode: e.target.value }
                              : r,
                          ),
                        )
                      }
                      required
                      maxLength={80}
                    />
                  </label>
                )}
              {stockItems.find((x) => x.id === line.stockItemId)?.trackingMode ===
                "Lot" && (
                <label>
                  Son kullanma tarihi
                  <input
                    type="date"
                    value={line.expiryDate}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, expiryDate: e.target.value } : r,
                        ),
                      )
                    }
                    required
                  />
                </label>
              )}
            </div>
          </div>
        ))}
        <div className="modal-foot">
          {!sales && (
            <button
              type="button"
              className="secondary"
              data-line-add-shortcut
              title="Ctrl+Shift+Enter ile satır ekle"
              onClick={() =>
                setLines((rows) => [
                  ...rows,
                  {
                    stockItemId: "",
                    quantity: "1",
                    unitCostBase: "0",
                    trackingCode: "",
                    expiryDate: "",
                    storageLocationId: "",
                  },
                ])
              }
            >
              Satır ekle
            </button>
          )}
          {editingId && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={cancelEdit}
            >
              Düzenlemeyi iptal et
            </button>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Kaydediliyor…"
              : editingId
                ? "Taslağı güncelle"
                : "Taslak oluştur"}
          </button>
        </div>
      </form>
      {items.length > 0 && (
        <div className="requests-list" style={{ marginTop: 12 }}>
          {items.map((item) => (
            <article className="request-row" key={item.id}>
              <div className="request-info">
                <b>
                  {item.code} · {sales ? item.customerName : item.supplierName}
                </b>
                <small>
                  {item.date} · {item.lineCount} satır ·{" "}
                  {item.status === "Posted"
                    ? "Kaydedildi"
                    : item.status === "Draft"
                      ? "Taslak"
                      : "İptal"}
                  {sales && item.invoiceId ? " · Faturalı" : ""}
                </small>
              </div>
              {item.status === "Draft" && (
                <button
                  className="row-action"
                  disabled={busy}
                  onClick={() => void editDraft(item)}
                >
                  Düzenle
                </button>
              )}
              {item.status === "Draft" && (
                <button
                  className="row-action"
                  disabled={busy}
                  onClick={() => void postDraft(item)}
                >
                  Kaydet ve stoğa işle
                </button>
              )}
              {item.status === "Draft" && (
                <button
                  className="row-action danger-action"
                  disabled={busy}
                  onClick={() => void remove(item)}
                >
                  Taslağı sil
                </button>
              )}
              {sales && item.status === "Posted" && !item.invoiceId && (
                <button
                  className="row-action"
                  disabled={busy}
                  onClick={() => void beginInvoice(item)}
                >
                  Fatura oluştur
                </button>
              )}
              {item.status === "Posted" && (!sales || !item.invoiceId) && (
                <button
                  className="row-action danger-action"
                  disabled={busy}
                  onClick={() => void remove(item)}
                >
                  Ters hareketle iptal et
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {invoiceDraft && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setInvoiceDraft(null);
          }}
        >
          <form
            className="modal sales-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="standalone-invoice-title"
            onSubmit={createInvoice}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">SATIŞ · FATURA</p>
                <h2 id="standalone-invoice-title">
                  {invoiceDraft.delivery.code} için fatura oluştur
                </h2>
                <span className="muted">
                  Müşteri: {invoiceDraft.delivery.customerName}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                onClick={() => setInvoiceDraft(null)}
              >
                ×
              </button>
            </div>
            <label>
              Fatura tarihi
              <input
                type="date"
                value={invoiceDraft.date}
                onChange={(event) =>
                  setInvoiceDraft((current) =>
                    current
                      ? { ...current, date: event.target.value }
                      : current,
                  )
                }
                required
              />
            </label>
            <details className="sales-delivery-lines-wrap">
              <summary>E-belge bilgileri</summary>
              <label>Senaryo<input value={invoiceDraft.eDocument.scenario} placeholder="TEMELFATURA / EARSIVFATURA" onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, scenario: event.target.value } } : current)} /></label>
              <label>Fatura tür kodu<input value={invoiceDraft.eDocument.typeCode} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, typeCode: event.target.value } } : current)} /></label>
              <label>Alıcı e-Fatura etiketi<input value={invoiceDraft.eDocument.recipientAlias} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, recipientAlias: event.target.value } } : current)} /></label>
              <label>Satın alma URL'si<input value={invoiceDraft.eDocument.purchaseUrl} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, purchaseUrl: event.target.value } } : current)} /></label>
              <label>Aracı firma VKN/TCKN<input value={invoiceDraft.eDocument.paymentTaxId} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, paymentTaxId: event.target.value } } : current)} /></label>
              <label>Aracı firma ünvanı<input value={invoiceDraft.eDocument.paymentTitle} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, paymentTitle: event.target.value } } : current)} /></label>
              <label>Aracı firma etiketi<input value={invoiceDraft.eDocument.paymentAlias} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, paymentAlias: event.target.value } } : current)} /></label>
              {([['paymentAgentName','Ödeme aracısı adı','text'],['paymentType','Ödeme türü','text'],['paymentMeans','Ödeme yöntemi (CREDIT_CARD / EFT / ON_DELIVERY / MEDIATOR / OTHER)','text'],['paymentDate','Ödeme tarihi','datetime-local'],['paymentDueDate','Son ödeme tarihi','datetime-local'],['paymentInstructionNote','Ödeme notu','text'],['intermediaryCountry','Aracı firma ülkesi','text'],['intermediaryCountryCode','Aracı firma ülke kodu','text'],['intermediaryCity','Aracı firma şehri','text'],['intermediaryDistrict','Aracı firma ilçesi','text']] as const).map(([key,label,type]) => <label key={key}>{label}<input type={type} value={type === 'datetime-local' && invoiceDraft.eDocument[key] ? invoiceDraft.eDocument[key].slice(0,16) : invoiceDraft.eDocument[key]} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, [key]: event.target.value } } : current)} /></label>)}
              <label>Taşıyıcı VKN/TCKN<input value={invoiceDraft.eDocument.carrierTaxId} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, carrierTaxId: event.target.value } } : current)} /></label>
              <label>Taşıyıcı adı/ünvanı<input value={invoiceDraft.eDocument.carrierName} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, carrierName: event.target.value } } : current)} /></label>
              <label>Taşıyıcı soyadı<input value={invoiceDraft.eDocument.carrierSurname} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, carrierSurname: event.target.value } } : current)} /></label>
              <label>Sevk tarihi<input type="date" value={invoiceDraft.eDocument.sentAt} onChange={(event) => setInvoiceDraft((current) => current ? { ...current, eDocument: { ...current.eDocument, sentAt: event.target.value } } : current)} /></label>
            </details>
            <div className="customer-table-wrap sales-delivery-lines-wrap">
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Stok</th>
                    <th>Miktar</th>
                    <th>Birim fiyat</th>
                    <th>İskonto %</th>
                    <th>KDV %</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceDraft.lines.map((line, index) => (
                    <tr key={line.lineNumber}>
                      <td>
                        <b>{line.stockCode}</b>
                        <small className="cell-subtitle">
                          {line.stockName}
                        </small>
                      </td>
                      <td>
                        {line.quantity} {line.unitCode}
                      </td>
                      {(
                        ["unitPrice", "discountPercent", "vatPercent"] as const
                      ).map((field) => (
                        <td key={field}>
                          <input
                            aria-label={`${line.stockCode} ${field}`}
                            type="number"
                            min="0"
                            max={field === "unitPrice" ? undefined : 100}
                            step={field === "unitPrice" ? "0.0001" : "0.01"}
                            value={line[field]}
                            required={field === "unitPrice"}
                            onChange={(event) =>
                              setInvoiceDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      lines: current.lines.map((row, i) =>
                                        i === index
                                          ? {
                                              ...row,
                                              [field]: event.target.value,
                                            }
                                          : row,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Fatura ve cari borç kaydı oluşturulur. Sevkiyatta kaydedilen stok
              çıkışı değişmez.
            </p>
            <div className="modal-foot">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setInvoiceDraft(null)}
              >
                Vazgeç
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Kaydediliyor…" : "Faturayı kaydet"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
