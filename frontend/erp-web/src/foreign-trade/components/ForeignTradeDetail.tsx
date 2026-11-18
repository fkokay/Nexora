import { forwardRef } from "react";
import { AlertTriangle, Globe2, PackageCheck, X } from "lucide-react";
import { localizedText } from "../../locale";
import { advanceCheck, canLinkInventoryDocument, type AdvanceField } from "../advance";
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
  /**
   * Prerequisite inputs of the next stage, kept by the page: İşlemler's step ("… aşamasına geçir") saves them and
   * moves the case (the panel no longer has its own button).
   */
  inputs: AdvanceInputs;
  onInputsChange: (inputs: AdvanceInputs) => void;
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
  capabilities,
  busyId,
  nextStatus,
  locale,
  statusLabel,
  directionLabel,
  transportLabel,
  notice,
  onDismissNotice,
  inputs,
  onInputsChange,
}: Props, ref) {

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
  const canLinkNow = canLinkInventoryDocument(item);

  // Prerequisites of the next stage (advance.ts); the step itself runs from İşlemler with the same conditions.
  const { fields, editableFields, blockers } = advanceCheck(item, nextStatus, capabilities, inputs, busy);
  const set = (field: AdvanceField, value: string) => onInputsChange({ ...inputs, [field]: value });

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
          <p className="foreign-trade-next-hint">
            <span>{tr("Sıradaki adım", "Next step")}</span>{" "}
            <b>{statusLabel(nextStatus)}</b>{" "}
            <span>{tr("· İşlemler (Alt+İ)", "· Actions (Alt+İ)")}</span>
          </p>
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
              {/* The selection list opens from İşlemler (mockup 10 · "Stok belgesi bağla"). */}
              {canLinkNow && capabilities.canAdvance && !!documents.length && (
                <p className="foreign-trade-next-hint">
                  <span>{tr("Stok belgesi bağla", "Link inventory document")}</span>{" "}
                  <span>{tr("· İşlemler (Alt+İ)", "· Actions (Alt+İ)")}</span>
                </p>
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
