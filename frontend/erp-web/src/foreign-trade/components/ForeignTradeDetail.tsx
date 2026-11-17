import { forwardRef, useEffect, useState } from "react";
import { AlertTriangle, Globe2, PackageCheck, X } from "lucide-react";
import { localizedText } from "../../locale";
import {
  tradeStageFlow,
  type AdvanceInputs,
  type Direction,
  type InventoryDocument,
  type TradeCapabilities,
  type TradeCase,
  type TradeOrder,
  type TradeStatus,
} from "../types";

export type ForeignTradePanelNotice = {
  kind: "success" | "error";
  text: string;
};

type Props = {
  item: TradeCase | null;
  orderMap: Map<string, TradeOrder>;
  documents: InventoryDocument[];
  documentId: string;
  capabilities: TradeCapabilities;
  busyId: string;
  nextStatus?: TradeStatus;
  locale: string;
  statusLabel: (status: TradeStatus) => string;
  directionLabel: (direction: Direction) => string;
  transportLabel: (mode: string) => string;
  /** Result of the last action on this panel; dismissible. */
  notice: ForeignTradePanelNotice | null;
  onDismissNotice: () => void;
  onDocumentChange: (id: string) => void;
  onLinkDocument: (item: TradeCase) => void;
  /** Saves the collected prerequisite inputs (if any) and moves the case to `status`. */
  onAdvance: (item: TradeCase, status: TradeStatus, inputs: AdvanceInputs) => void;
};

const tr = (turkish: string, english: string) =>
  localizedText(turkish, english);

export const incotermsCodes = [
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
];

const disclaimer = () =>
  tr(
    "Bu ekran siparişe bağlı iç operasyon kaydıdır. HS kodu, Incoterms, taşıma ve beyan bilgileri kullanıcı tarafından doğrulanmalıdır; resmî gümrük beyannamesi veya e-belge gönderimi değildir.",
    "This is an internal operations record linked to an order. Users must verify HS codes, Incoterms, transport and declaration details; this is not an official customs declaration or e-document submission.",
  );

/** Heading of the prerequisites block, per target stage. */
const requirementHeading = (next: TradeStatus) => {
  switch (next) {
    case "Shipped":
      return tr("Sevke geçmek için gerekli", "Required before shipping");
    case "CustomsClearance":
      return tr("Gümrüğe geçmek için gerekli", "Required before customs");
    case "Closed":
      return tr("Kapatmak için gerekli", "Required before closing");
    default:
      return tr("Geçiş için gerekli", "Required for this step");
  }
};

/** Right-hand panel of the case list; Enter / double click on a non-editable case moves the focus here. */
export const ForeignTradeDetail = forwardRef<HTMLElement, Props>(function ForeignTradeDetail({
  item,
  orderMap,
  documents,
  documentId,
  capabilities,
  busyId,
  nextStatus,
  locale,
  statusLabel,
  directionLabel,
  transportLabel,
  notice,
  onDismissNotice,
  onDocumentChange,
  onLinkDocument,
  onAdvance,
}: Props, ref) {
  const [inputs, setInputs] = useState<AdvanceInputs>({});
  useEffect(() => {
    setInputs({});
  }, [item?.id, item?.status]);

  if (!item)
    return (
      <aside
        ref={ref}
        tabIndex={-1}
        className="foreign-trade-detail"
        aria-label={tr(
          "Seçili dış ticaret dosyası",
          "Selected foreign trade case",
        )}
      >
        {notice && (
          <div
            className={`foreign-trade-panel-notice is-${notice.kind}`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              aria-label={tr("Bildirimi kapat", "Dismiss message")}
              onClick={onDismissNotice}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="foreign-trade-detail-empty">
          <Globe2 size={20} />
          <b>{tr("Dosya seçin", "Select a case")}</b>
          <span>
            {tr(
              "Seçili dosyanın rota, taşıma ve gümrük bilgileri burada görünür.",
              "The selected case route, transport and customs details appear here.",
            )}
          </span>
        </div>
        <p className="foreign-trade-disclaimer" title={disclaimer()}>
          {tr(
            "İç operasyon kaydıdır; resmî gümrük beyannamesi değildir.",
            "Internal operations record; not an official customs declaration.",
          )}
        </p>
      </aside>
    );

  const busy = busyId === item.id;
  const stageIndex = tradeStageFlow.indexOf(item.status);
  const cancelled = item.status === "Cancelled";
  const linked = Boolean(item.purchaseReceiptId || item.salesDeliveryId);
  const canLinkNow =
    (item.direction === "Import" &&
      ["Arrived", "Closed"].includes(item.status)) ||
    (item.direction === "Export" &&
      ["Shipped", "CustomsClearance", "Arrived", "Closed"].includes(
        item.status,
      ));

  // Prerequisites the backend checks on transition (ForeignTradeEndpoints.cs, /transition).
  type Field = "plannedShipDate" | "declaredValue" | "incotermsCode" | "customsReference";
  const fields: Field[] = [];
  const blockers: string[] = [];
  let fieldsEditable = true;
  if (nextStatus === "Shipped") {
    if (!item.plannedShipDate) fields.push("plannedShipDate");
    if (!(item.declaredValue > 0)) fields.push("declaredValue");
    if (!item.incotermsCode) fields.push("incotermsCode");
    // Ship prerequisites are file details saved through the edit endpoint.
    if (fields.length && !capabilities.canUpdate) {
      fieldsEditable = false;
      blockers.push(
        tr(
          "Planlanan sevk tarihi, pozitif beyan değeri ve Incoterms için dosya düzenleme izni (erp.foreign-trade.update) gerekir.",
          "Planned ship date, a positive declared value and Incoterms require the case update permission (erp.foreign-trade.update).",
        ),
      );
    }
  }
  if (nextStatus === "CustomsClearance") {
    if (!item.customsReference) fields.push("customsReference");
    if (
      item.direction === "Export" &&
      item.inventoryPostingRequired &&
      !item.salesDeliveryId
    )
      blockers.push(
        tr(
          "Kayıtlı teslimat belgesini aşağıdan bu dosyaya bağlayın.",
          "Link the posted delivery document to this case below.",
        ),
      );
  }
  if (nextStatus === "Closed") {
    if (!item.actualArrivalDate)
      blockers.push(
        tr("Gerçek varış tarihi kaydedilmelidir.", "An actual arrival date must be recorded."),
      );
    if (
      item.direction === "Import" &&
      item.inventoryPostingRequired &&
      !item.purchaseReceiptId
    )
      blockers.push(
        tr(
          "Kayıtlı mal kabul belgesini aşağıdan bu dosyaya bağlayın.",
          "Link the posted goods receipt to this case below.",
        ),
      );
  }
  // Inputs stay visible next to other blockers so every prerequisite is shown up front.
  const editableFields = fieldsEditable ? fields : [];
  const fieldsFilled = editableFields.every((field) => {
    const value = inputs[field]?.trim() || "";
    if (field === "declaredValue") return Number(value) > 0;
    return value.length > 0;
  });
  const canSubmitAdvance =
    capabilities.canAdvance &&
    !!nextStatus &&
    !blockers.length &&
    fieldsFilled &&
    !busy;
  const set = (field: Field, value: string) =>
    setInputs((current) => ({ ...current, [field]: value }));

  const order = orderMap.get(item.purchaseOrderId || item.salesOrderId || "");

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      className="foreign-trade-detail"
      aria-label={tr("Seçili dış ticaret dosyası", "Selected foreign trade case")}
    >
      <header className="foreign-trade-detail-top">
        <span className="list-v2-kind">
          {tr("Seçili dosya", "Selected case")} · {directionLabel(item.direction)}
        </span>
        <h2>{item.referenceCode}</h2>
      </header>

      {notice && (
        <div
          className={`foreign-trade-panel-notice is-${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            aria-label={tr("Bildirimi kapat", "Dismiss message")}
            onClick={onDismissNotice}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="foreign-trade-progress">
        <ol aria-hidden="true">
          {tradeStageFlow.map((status, index) => (
            <li
              key={status}
              title={statusLabel(status)}
              className={
                cancelled
                  ? ""
                  : index < stageIndex
                    ? "is-done"
                    : index === stageIndex
                      ? "is-current"
                      : ""
              }
            />
          ))}
        </ol>
        <p>
          <b className={`trade-status ${item.status.toLowerCase()}`}>
            {statusLabel(item.status)}
          </b>
          {nextStatus && (
            <span>
              {" "}
              · {tr("sıradaki", "next")}: {statusLabel(nextStatus)}
            </span>
          )}
        </p>
      </div>

      <dl className="foreign-trade-kv">
        <div>
          <dt>{tr("Sipariş", "Order")}</dt>
          <dd>{order ? `${order.code} · ${order.counterpartyName}` : "—"}</dd>
        </div>
        <div>
          <dt>{tr("Rota", "Route")}</dt>
          <dd>
            {item.originCountryCode} → {item.destinationCountryCode} ·{" "}
            {item.incotermsCode || "—"} · {transportLabel(item.transportMode)}
          </dd>
        </div>
        <div>
          <dt>{tr("HS kodu", "HS code")}</dt>
          <dd className="is-mono">{item.harmonizedSystemCode || "—"}</dd>
        </div>
        <div>
          <dt>{tr("Beyan değeri", "Declared value")}</dt>
          <dd>
            {item.declaredValue.toLocaleString(locale, {
              minimumFractionDigits: 2,
            })}{" "}
            {item.currencyCode}
          </dd>
        </div>
        <div>
          <dt>{tr("Taşıyıcı / takip", "Carrier / tracking")}</dt>
          <dd className={item.carrierReference ? "" : "is-unset"}>
            {item.carrierReference || "—"}
          </dd>
        </div>
        <div>
          <dt>{tr("Gümrük referansı", "Customs reference")}</dt>
          <dd className={item.customsReference ? "" : "is-unset"}>
            {item.customsReference || tr("Girilmedi", "Not entered")}
          </dd>
        </div>
      </dl>

      {item.notes && <p className="foreign-trade-detail-notes">{item.notes}</p>}

      {capabilities.canAdvance && nextStatus && (
        <section
          className="foreign-trade-next"
          aria-label={tr("Sonraki adım", "Next step")}
        >
          {(fields.length > 0 || blockers.length > 0) && (
            <div className="foreign-trade-requirements">
              <span className="foreign-trade-req-label">
                <AlertTriangle size={13} /> {requirementHeading(nextStatus)}
              </span>
              {blockers.map((text) => (
                <small key={text}>{text}</small>
              ))}
              {editableFields.includes("customsReference") && (
                <label>
                  {tr("Gümrük referansı", "Customs reference")}
                  <input
                    maxLength={100}
                    value={inputs.customsReference || ""}
                    onChange={(e) => set("customsReference", e.target.value)}
                    placeholder={tr("ör. 26TR3400...", "e.g. 26TR3400...")}
                  />
                </label>
              )}
              {editableFields.includes("plannedShipDate") && (
                <label>
                  {tr("Planlanan sevkiyat", "Planned shipment")}
                  <input
                    type="date"
                    value={inputs.plannedShipDate || ""}
                    onChange={(e) => set("plannedShipDate", e.target.value)}
                  />
                </label>
              )}
              {editableFields.includes("declaredValue") && (
                <label>
                  {tr("Beyan değeri", "Declared value")} ({item.currencyCode})
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={inputs.declaredValue || ""}
                    onChange={(e) => set("declaredValue", e.target.value)}
                  />
                </label>
              )}
              {editableFields.includes("incotermsCode") && (
                <label>
                  Incoterms 2020
                  <select
                    value={inputs.incotermsCode || ""}
                    onChange={(e) => set("incotermsCode", e.target.value)}
                  >
                    <option value="">{tr("Seçin", "Select")}</option>
                    {incotermsCodes.map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <button
            type="button"
            className="primary foreign-trade-advance"
            disabled={!canSubmitAdvance}
            onClick={() => onAdvance(item, nextStatus, inputs)}
          >
            {tr(
              `${statusLabel(nextStatus)} aşamasına geçir`,
              `Move to ${statusLabel(nextStatus)}`,
            )}
          </button>
        </section>
      )}

      {/* Düzenle and İptal et are in the action bar (Aç, İşlemler). */}
      {(linked || canLinkNow || item.inventoryPostingRequired) && !cancelled && (
        <section className="foreign-trade-inventory-link">
          <h4>{tr("Stok belgesi", "Inventory document")}</h4>
          {linked ? (
            <div className="foreign-trade-linked-document">
              <PackageCheck size={16} />
              <span>
                {documents.find((document) => document.isLinked)?.code ||
                  item.purchaseReceiptId ||
                  item.salesDeliveryId}
              </span>
            </div>
          ) : (
            <>
              <p>
                {tr(
                  "Stok hareketini standart mal kabul veya teslimat ekranında oluşturun. Bu adım yalnızca mevcut belgeyi bağlar; stok ikinci kez işlenmez.",
                  "Post stock in the standard receipt or delivery screen. This only links the existing document; it does not post inventory again.",
                )}
              </p>
              {canLinkNow && capabilities.canAdvance && (
                <div className="foreign-trade-link-controls">
                  <select
                    aria-label={tr("Stok belgesi seçin", "Select inventory document")}
                    value={documentId}
                    onChange={(event) => onDocumentChange(event.target.value)}
                  >
                    <option value="">
                      {tr("Kayıtlı stok belgesi seçin", "Select a posted inventory document")}
                    </option>
                    {documents.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.code} · {document.warehouseName} ·{" "}
                        {document.lineCount} {tr("satır", "lines")}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!documentId || busy}
                    onClick={() => onLinkDocument(item)}
                  >
                    {tr("Belgeyi bağla", "Link document")}
                  </button>
                </div>
              )}
              {canLinkNow && !documents.length && (
                <small>
                  {tr(
                    "Uygun kayıtlı stok belgesi bulunamadı. Önce standart mal kabul veya teslimat işlemini tamamlayın.",
                    "No eligible posted inventory document was found. Complete the standard receipt or delivery first.",
                  )}
                </small>
              )}
            </>
          )}
        </section>
      )}

      <p className="foreign-trade-disclaimer" title={disclaimer()}>
        {tr(
          "İç operasyon kaydıdır; resmî gümrük beyannamesi değildir.",
          "Internal operations record; not an official customs declaration.",
        )}
      </p>
    </aside>
  );
});
