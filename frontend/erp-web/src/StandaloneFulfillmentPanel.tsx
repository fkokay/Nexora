import { PageCommandsSlot, confirmStartNew } from "./commands/PageCommandsSlot";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, localDateString } from "./erpApi";
import { dropPageParam, usePageParams } from "./pageNavigation";
import type {
  SalesCustomer,
  StockItem,
  Warehouse,
  WarehouseLocationOption,
} from "./erp-types";
import SearchableRecordPicker from "./SearchableRecordPicker";
import { confirmDialog } from "./confirmDialog";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import "./sales/sales-record-forms.css";
import { SalesDeliveryFlow } from "./sales/salesDocumentDetail";
import { LineAddLabel, SALES_FORM_HINTS, SalesFormLines } from "./sales/salesDocumentForm";

export function StandaloneFulfillmentPanel({
  token,
  sales = false,
  customers,
  stockItems,
  warehouses,
  initialCustomerId = "",
  onCancel,
  ownsActionBar = false,
  commandsActive = true,
}: {
  token: string;
  sales?: boolean;
  customers: SalesCustomer[];
  stockItems: StockItem[];
  warehouses: Warehouse[];
  initialCustomerId?: string;
  /** Leaves the create screen (Vazgeç). Without it Vazgeç only clears the form. */
  onCancel?: () => void;
  /** The panel is the whole screen: it registers the action bar's Yeni (a fresh draft). */
  ownsActionBar?: boolean;
  /** False while the panel is mounted but hidden (a document over its list): its form registers no bar commands. */
  commandsActive?: boolean;
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
  // Siparişsiz irsaliye listesi (sistem sayfası) bir taslağı `deliveryId` sayfa parametresiyle açar: bir kez okunur, sonra silinir.
  const paramDeliveryId = usePageParams(sales ? "sales-delivery-create" : undefined).deliveryId ?? "";
  useEffect(() => {
    if (!sales || !paramDeliveryId) return;
    dropPageParam("sales-delivery-create", "deliveryId");
    void editDraft({ id: paramDeliveryId } as Row);
  }, [sales, paramDeliveryId]); // eslint-disable-line react-hooks/exhaustive-deps
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
      setNotice(`${item.code || detail.code} taslağı düzenleniyor.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function resetForm() {
    cancelEdit();
    setNotice("");
    setError("");
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
    const isDraft = item.status === "Draft";
    if (
      !(await confirmDialog(
        isDraft
          ? {
              title: "Taslak silinsin mi?",
              message: `${item.code} silinecek.`,
              tone: "danger",
              confirmLabel: "Sil",
            }
          : {
              title: "Belge iptal edilsin mi?",
              message: `${item.code} ters stok hareketiyle iptal edilecek.`,
              tone: "danger",
              confirmLabel: "İptal et",
            },
      ))
    )
      return;
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
  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addLine = () =>
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
    ]);
  const trackingMode = (line: Line) => stockItems.find((x) => x.id === line.stockItemId)?.trackingMode;
  const needsTracking = (line: Line) => trackingMode(line) !== "None" && !!line.stockItemId;
  const needsExpiry = (line: Line) => trackingMode(line) === "Lot";
  // Line controls, shared by the sales line grid and the purchasing line cards.
  const stockPicker = (line: Line, index: number) => (
    <SearchableRecordPicker
      options={stockItems
        .filter((x) => x.isActive)
        .map((x) => ({
          id: x.id,
          label: `${x.code} · ${x.name} (${x.unitCode})`,
          searchText: x.code,
        }))}
      selectedId={line.stockItemId}
      onSelect={(value) => setLine(index, { stockItemId: value })}
      title="Stok kartı seçin"
      placeholder="Stok seçin"
      searchPlaceholder="Stok kodu veya adıyla ara"
      emptyMessage="Aramanızla eşleşen stok kartı bulunamadı."
      required
    />
  );
  const quantityInput = (line: Line, index: number, label?: string) => (
    <input
      aria-label={label}
      type="number"
      min="0.0001"
      step="0.0001"
      value={line.quantity}
      onChange={(e) => setLine(index, { quantity: e.target.value })}
      required
    />
  );
  const locationSelect = (line: Line, index: number, label?: string) => (
    <select aria-label={label} value={line.storageLocationId} onChange={(e) => setLine(index, { storageLocationId: e.target.value })}>
      <option value="">Depo düzeyinde</option>
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.code} · {location.name}
        </option>
      ))}
    </select>
  );
  const trackingInput = (line: Line, index: number, label?: string) => (
    <input aria-label={label} value={line.trackingCode} onChange={(e) => setLine(index, { trackingCode: e.target.value })} required maxLength={80} />
  );
  const expiryInput = (line: Line, index: number, label?: string) => (
    <input aria-label={label} type="date" value={line.expiryDate} onChange={(e) => setLine(index, { expiryDate: e.target.value })} required />
  );
  const formDirty = Boolean(
    editingId || code.trim() || (customerId && customerId !== initialCustomerId) || lines.some((line) => line.stockItemId),
  );
  return (
    <section className="sales-rf-fulfillment">
      {ownsActionBar && (
        <PageCommandsSlot
          commands={{
            new: {
              run: async () => {
                if (await confirmStartNew(formDirty)) resetForm();
              },
            },
          }}
        />
      )}
      <RecordFormPage
        variant={sales ? "page" : "dialog"}
        commandsActive={commandsActive}
        className={sales ? "sales-rf" : "sales-rf sales-rf-embedded"}
        document={
          sales
            ? {
                type: "Satış irsaliyesi",
                code: code.trim() || undefined,
                party: counterparties.find((x) => x.id === customerId)?.name,
                statusFlow: <SalesDeliveryFlow status="Draft" invoiced={false} draft />,
                hints: [...SALES_FORM_HINTS, "Alt+İ işlemler"],
              }
            : undefined
        }
        title={
          sales
            ? "Siparişsiz satış irsaliyesi"
            : "Siparişsiz satın alma mal kabulü"
        }
        mode={editingId ? "edit" : "create"}
        busy={busy}
        saveLabel={editingId ? "Taslağı güncelle" : "Taslak oluştur"}
        formId={sales ? "sales-delivery-create-form" : undefined}
        onSubmit={createDraft}
        onCancel={editingId ? cancelEdit : (onCancel ?? resetForm)}
        onReset={resetForm}
        error={error}
        onDismissError={() => setError("")}
        status={
          <>
            <span>
              {sales
                ? "Kaydetme stok çıkışı oluşturur; fatura daha sonra kesilir."
                : "Birim maliyeti girin; fatura geldiğinde maliyet farkı işlenir."}
            </span>
            {notice && <span className="rf-status-notice">{notice}</span>}
            <span className="rf-status-end">
              Satır: <b>{lines.length}</b>
            </span>
          </>
        }
      >
        <RecordFormGroup
          title={sales ? "Belge bilgileri" : "Mal Kabul Kimliği"}
          hint={sales ? "* zorunlu alan" : undefined}
          bodyClassName={sales ? "rf-identity doc-form-fields" : "rf-identity"}
        >
          <label>
            <span>
              {sales ? "İrsaliye kodu" : "Mal kabul kodu"} <RequiredMark />
            </span>
            <input
              className="rf-must rf-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={40}
              placeholder={sales ? "IRS-2026-001" : "MK-2026-001"}
            />
          </label>
          <label>
            <span>
              {sales ? "Müşteri" : "Tedarikçi"} <RequiredMark />
            </span>
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
            <span>
              Depo <RequiredMark />
            </span>
            <select
              className="rf-must"
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
          <label>
            <span>
              Tarih <RequiredMark />
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
        </RecordFormGroup>
        {sales ? (
          <SalesFormLines
            label="İrsaliye satırları"
            lines={lines.length}
            extra="Lot / seri takipli stoklarda takip kodu zorunludur."
          >
            <table className="dd-lines">
              <thead>
                <tr>
                  <th className="dd-ix">#</th>
                  <th>Stok kartı</th>
                  <th className="dd-num">Miktar</th>
                  <th>Birim</th>
                  {locations.length > 0 && <th>Depo gözü</th>}
                  {lines.some(needsTracking) && <th>Lot / seri kodu</th>}
                  {lines.some(needsExpiry) && <th>Son kullanma tarihi</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td className="dd-ix">
                      <span>{index + 1}</span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          className="dd-line-remove"
                          aria-label={`Satır ${index + 1} kaldır`}
                          title="Satırı kaldır"
                          onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                        >
                          ×
                        </button>
                      )}
                    </td>
                    <td className="dd-stock-cell">{stockPicker(line, index)}</td>
                    <td className="dd-num">{quantityInput(line, index, `Satır ${index + 1} miktar`)}</td>
                    <td>{stockItems.find((x) => x.id === line.stockItemId)?.unitCode || "—"}</td>
                    {locations.length > 0 && <td>{locationSelect(line, index, `Satır ${index + 1} depo gözü`)}</td>}
                    {lines.some(needsTracking) && <td>{needsTracking(line) && trackingInput(line, index, `Satır ${index + 1} lot / seri kodu`)}</td>}
                    {lines.some(needsExpiry) && <td>{needsExpiry(line) && expiryInput(line, index, `Satır ${index + 1} son kullanma tarihi`)}</td>}
                  </tr>
                ))}
                <tr className="dd-new-line">
                  <td colSpan={4 + (locations.length > 0 ? 1 : 0) + (lines.some(needsTracking) ? 1 : 0) + (lines.some(needsExpiry) ? 1 : 0)}>
                    <button type="button" data-line-add-shortcut title="Ctrl+Shift+Enter ile satır ekle" onClick={addLine}>
                      <LineAddLabel />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </SalesFormLines>
        ) : (
        <RecordFormGroup title="Mal Kabul Satırları">
          <div className="quote-lines-heading sales-rf-group-actions">
            <span className="muted">
              Lot / seri takipli stoklarda takip kodu zorunludur.
            </span>
            <button
              type="button"
              className="secondary small-button"
              data-line-add-shortcut
              title="Ctrl+Shift+Enter ile satır ekle"
              onClick={addLine}
            >
              Satır ekle
            </button>
          </div>
        {lines.map((line, index) => (
          <div className="quote-line delivery-document-line" key={index}>
            <div className="delivery-document-line-fields">
              <label>
                Stok kartı
                {stockPicker(line, index)}
              </label>
              <label>
                Miktar
                {quantityInput(line, index)}
              </label>
              {locations.length > 0 && (
                <label>
                  Depo gözü (isteğe bağlı)
                  {locationSelect(line, index)}
                </label>
              )}
              <label>
                Birim maliyet (temel birim)
                <input
                  type="number"
                  min="0"
                  step="0.00000001"
                  value={line.unitCostBase}
                  onChange={(e) => setLine(index, { unitCostBase: e.target.value })}
                  required
                />
              </label>
              {needsTracking(line) && (
                <label>
                  Lot / seri kodu
                  {trackingInput(line, index)}
                </label>
              )}
              {needsExpiry(line) && (
                <label>
                  Son kullanma tarihi
                  {expiryInput(line, index)}
                </label>
              )}
            </div>
          </div>
        ))}
        </RecordFormGroup>
        )}
      </RecordFormPage>
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
          <div
            className="modal sales-detail-modal sales-rf-host"
            role="dialog"
            aria-modal="true"
            aria-label={`${invoiceDraft.delivery.code} için fatura oluştur`}
          >
          <RecordFormPage
            variant="dialog"
            className="sales-rf"
            title={`${invoiceDraft.delivery.code} için fatura oluştur`}
            mode="create"
            busy={busy}
            saveLabel="Faturayı kaydet"
            onSubmit={createInvoice}
            onCancel={() => {
              if (!busy) setInvoiceDraft(null);
            }}
            error={error}
            onDismissError={() => setError("")}
            status={
              <>
                <span>Müşteri: {invoiceDraft.delivery.customerName}</span>
                <span>
                  Fatura ve cari borç kaydı oluşturulur. Sevkiyatta kaydedilen
                  stok çıkışı değişmez.
                </span>
              </>
            }
          >
            <RecordFormGroup title="Fatura Kimliği" bodyClassName="rf-identity">
            <label>
              <span>
                Fatura tarihi <RequiredMark />
              </span>
              <input
                className="rf-must"
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
            </RecordFormGroup>
            <RecordFormGroup title="E-belge Bilgileri">
            <details className="sales-rf-details">
              <summary>E-belge bilgileri</summary>
              <div className="rf-custom-grid">
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
              </div>
            </details>
            </RecordFormGroup>
            <RecordFormGroup title="Fatura Satırları">
            <div className="customer-table-wrap sales-delivery-lines-wrap sales-rf-lines">
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
            </RecordFormGroup>
          </RecordFormPage>
          </div>
        </div>
      )}
    </section>
  );
}
