import { useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Clock3, ShoppingCart, Trophy, XCircle } from "lucide-react";
import type { PurchaseRequestSummary, PurchaseSupplierQuote } from "../erp-types";
import { DocumentStatusFlow, type DocumentFlowStep } from "../document-page/DocumentStatusFlow";
import { purchaseRequestStatus, supplierQuoteStatus } from "../document-page/documentStatus";
import type { DocumentStatusTone } from "../document-page/DocumentSurface";
import { StatusTag, type StatusTagTone } from "../list-page/StatusTag";
import type { SummaryCard } from "../list-page/ListSummaryCards";
import { useStockDetailPanelOpen } from "../inventory/components/InventoryStockDetailPanel";
import "./purchaseRequestList.css";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesPanelChain,
  SalesPanelFacts,
  SalesPanelRows,
  SalesPanelSection,
  panelMoney,
} from "../sales/components/SalesListDetailPanel";

/*
 * Satınalma talepleri ve teklifleri (Faz 4, taslak 07): liste durum etiketi, talep belgesinin durum akışı ve liste
 * sağ paneli. Yalnızca liste cevabındaki alanlar ve sayfanın zaten getirdiği tedarikçi teklifleri kullanılır.
 */

const tones: Record<string, StatusTagTone> = { Submitted: "warn", Approved: "info", Ordered: "ok", Rejected: "off" };

/** Talep listesi etiketi: Onay bekliyor (turuncu), Onaylandı (mavi), Siparişe dönüştü (yeşil), Reddedildi (gri). */
export function purchaseRequestListTag(status: string): { tone: StatusTagTone; label: string } {
  return { tone: tones[status] ?? "off", label: purchaseRequestStatus(status).label };
}

/** Status cell of the request list. */
export function PurchaseRequestTag({ status }: { status: string }) {
  const tag = purchaseRequestListTag(status);
  return <StatusTag tone={tag.tone}>{tag.label}</StatusTag>;
}

const step = (key: string): DocumentFlowStep => ({ key, label: purchaseRequestStatus(key).label });

/** Talep: Onay bekliyor → Onaylandı → Siparişe dönüştü; Reddedildi akış dışı son durum. */
export function PurchaseRequestFlow({ status }: { status?: string }) {
  return <DocumentStatusFlow steps={[step("Submitted"), step("Approved"), step("Ordered")]} current={status} terminal={step("Rejected")} />;
}

/**
 * Varsayılan sütun genişlikleri (kiracı genişliği olmayan alanlar): onay kutusu ve satır menüsüyle 1440'ta panel
 * kapalıyken, 1720'de panel açıkken yatay kaydırma olmadan sığar.
 */
export const PURCHASE_REQUEST_LIST_WIDTHS: Record<string, number> = {
  code: 230, requestedByName: 150, neededByDate: 110, quotes: 170, status: 130, description: 220, requestDate: 100,
  lineCount: 60, purchaseOrderCode: 120, actions: 56,
};

/** Right-aligned `tabular-nums` columns of the request list. */
export const PURCHASE_REQUEST_NUMBER_FIELDS: ReadonlySet<string> = new Set(["lineCount"]);

/**
 * Status of a supplier quote in the request document (today's labels there): Seçildi, Seçilmedi, a submitted quote past
 * its validity Süresi doldu, otherwise Değerlendiriliyor.
 */
export function supplierQuoteDocumentStatus(
  quote: { status: string; validUntil: string | null },
  today: string,
): { label: string; tone: DocumentStatusTone } {
  if (quote.status === "Selected") return { label: "Seçildi", tone: "success" };
  if (quote.status === "NotSelected") return { label: "Seçilmedi", tone: "neutral" };
  if (quote.validUntil && quote.validUntil < today) return { label: "Süresi doldu", tone: "neutral" };
  return { label: "Değerlendiriliyor", tone: "warning" };
}

const date = (value: string | null | undefined) => (value ? value.slice(0, 10).split("-").reverse().join(".") : "—");

/**
 * Open state of a purchasing list's right panel (same rule as the sales lists: open by default when the list area is
 * wide enough, Ctrl+. toggles). The panels read data the page already has, so nothing is fetched here.
 */
export function usePurchaseListPanel(active: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);
  return { rootRef, ...useStockDetailPanelOpen(active, rootRef) };
}

/**
 * Durum kartları: sunucunun durum başına sayıları (çiplerle aynı çağrılar, aramayı izler). Kart tıklanınca liste o
 * durumla süzülür; sayı henüz bilinmiyorsa "—".
 */
export function purchaseRequestSummaryCards(
  counts: Partial<Record<string, number>> | null,
  status: string,
  onStatus: (status: string) => void,
  searching: boolean,
): SummaryCard[] {
  const hint = searching ? "aramayla eşleşen" : "tüm talepler";
  const card = (key: string, icon: SummaryCard["icon"], tone?: SummaryCard["tone"]): SummaryCard => {
    const count = counts?.[key];
    return {
      id: `request-${key}`,
      label: purchaseRequestStatus(key).label,
      value: count != null ? count.toLocaleString("tr-TR") : "—",
      icon,
      tone,
      hint,
      filterActive: status === key,
      onFilter: () => onStatus(status === key ? "" : key),
    };
  };
  return [card("Submitted", Clock3, "warn"), card("Approved", CheckCircle2), card("Ordered", ShoppingCart, "ok"), card("Rejected", XCircle)];
}

/** Another screen (Satınalma Teklifleri › Aç) asks the request list to open one request. */
const openRequestStorageKey = "nexora.purchase-request.open";
export const PURCHASE_REQUEST_OPEN_EVENT = "nexora:purchase-request-open";

export function requestPurchaseRequestOpen(id: string) {
  try {
    sessionStorage.setItem(openRequestStorageKey, id);
  } catch {
    /* Session storage is optional; a mounted request list still reacts to the event. */
  }
  window.dispatchEvent(new CustomEvent(PURCHASE_REQUEST_OPEN_EVENT, { detail: { id } }));
}

/** The request another screen asked to open (read once). */
export function takePurchaseRequestOpen(): string | null {
  try {
    const id = sessionStorage.getItem(openRequestStorageKey);
    if (id) sessionStorage.removeItem(openRequestStorageKey);
    return id || null;
  } catch {
    return null;
  }
}

type QuotesState = PurchaseSupplierQuote[] | "loading" | "error";

type PanelProps = {
  row: PurchaseRequestSummary;
  /** "N gün" / "N gün geçti" until the need date (null when not shown). */
  needHint: { text: string; overdue: boolean } | null;
  /** Supplier quotes of an approved / ordered request (the page's quote cache); undefined when the request has none. */
  quotes?: QuotesState;
  /** The page's inline approve / reject controls (null when the user cannot decide). */
  decision?: ReactNode;
  onOpen: () => void;
  openDisabled?: boolean;
  onOpenOrder: () => void;
  onClose: () => void;
  takeFocus: () => boolean;
};

/** Lowest base-currency total among the quotes that can be compared. */
function bestQuote(quotes: PurchaseSupplierQuote[]) {
  return quotes.reduce<PurchaseSupplierQuote | null>(
    (best, quote) =>
      quote.comparableGrandTotal !== null && (best === null || quote.comparableGrandTotal < (best.comparableGrandTotal ?? Infinity))
        ? quote
        : best,
    null,
  );
}

/** Sağ panel: talep özeti (tarihler, kalem sayısı, karar, bağlı sipariş), karar kontrolleri ve tedarikçi teklifleri. */
export function PurchaseRequestListPanel({ row, needHint, quotes, decision, onOpen, openDisabled, onOpenOrder, onClose, takeFocus }: PanelProps) {
  const [tab, setTab] = useState("summary");
  const tabs = quotes ? [{ id: "summary", label: "Özet" }, { id: "quotes", label: "Teklifler" }] : [{ id: "summary", label: "Özet" }];
  const active = tabs.some((item) => item.id === tab) ? tab : "summary";
  const tag = purchaseRequestListTag(row.status);
  const quoteList = Array.isArray(quotes) ? quotes : null;
  const best = quoteList ? bestQuote(quoteList) : null;
  return (
    <SalesListDetailPanel
      label="Satınalma talebi özeti"
      code={row.code}
      title={row.requestedByName}
      tags={<StatusTag tone={tag.tone}>{tag.label}</StatusTag>}
      tabs={tabs}
      tab={active}
      onTabChange={setTab}
      onOpen={onOpen}
      openDisabled={openDisabled}
      onClose={onClose}
      takeFocus={takeFocus}
    >
      {active === "quotes" ? (
        quoteList ? (
          <SalesPanelRows
            empty="Henüz tedarikçi teklifi kaydedilmedi."
            rows={quoteList.map((quote) => ({
              key: quote.id,
              label: (
                <span className="pr-ld-quote">
                  {best?.id === quote.id && <Trophy size={13} aria-label="En iyi teklif" />}
                  <span>{quote.supplierName}</span>
                </span>
              ),
              meta: (
                <>
                  <span className="nx-code">{quote.code}</span> · <span>{supplierQuoteStatus(quote.status).label}</span>
                </>
              ),
              value:
                quote.comparableGrandTotal !== null
                  ? panelMoney(quote.comparableGrandTotal, quote.baseCurrencyCode)
                  : panelMoney(quote.grandTotal, quote.currencyCode),
            }))}
          />
        ) : (
          <p className="sales-ld-muted">{quotes === "error" ? "Teklifler yüklenemedi." : "Teklifler yükleniyor…"}</p>
        )
      ) : (
        <>
          <SalesPanelFacts
            items={[
              { label: "Talep tarihi", value: date(row.requestDate) },
              {
                label: "İhtiyaç",
                value: (
                  <>
                    <span>{date(row.neededByDate)}</span>
                    {needHint && (
                      <>
                        {" · "}
                        <span className={needHint.overdue ? "pr-ld-overdue" : undefined}>{needHint.text}</span>
                      </>
                    )}
                  </>
                ),
              },
              { label: "Kalem", value: row.lineCount },
              ...(row.description ? [{ label: "Açıklama", value: row.description }] : []),
              ...(row.reviewedByName && row.status !== "Submitted"
                ? [{ label: row.status === "Rejected" ? "Reddeden" : "Onaylayan", value: row.reviewedByName }]
                : []),
              ...(row.reviewNote ? [{ label: "Not", value: row.reviewNote }] : []),
              ...(row.status === "Ordered"
                ? [
                    {
                      label: "Sipariş",
                      value: row.purchaseOrderId ? (
                        <button type="button" className="sales-ld-link" onClick={onOpenOrder}>
                          {row.purchaseOrderCode || "Siparişi aç"}
                        </button>
                      ) : (
                        row.purchaseOrderCode || "—"
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <SalesPanelChain
            items={[
              { key: "self", code: row.code, label: "Bu talep", current: true, status: tag },
              ...(row.purchaseOrderCode ? [{ key: "order", code: row.purchaseOrderCode, label: "Satınalma siparişi" }] : []),
            ]}
          />
          {quotes && (
            <SalesPanelSection title="Teklifler">
              {quoteList ? (
                quoteList.length === 0 ? (
                  <p className="sales-ld-muted">Henüz tedarikçi teklifi kaydedilmedi.</p>
                ) : (
                  <p className="pr-ld-quote-sum">
                    <span>{`${quoteList.length} teklif`}</span>
                    {best && best.comparableGrandTotal !== null && (
                      <>
                        {" · "}
                        <span>en iyi</span> <b>{panelMoney(best.comparableGrandTotal, best.baseCurrencyCode)}</b>
                      </>
                    )}
                  </p>
                )
              ) : (
                <p className="sales-ld-muted">{quotes === "error" ? "Teklifler yüklenemedi." : "Teklifler yükleniyor…"}</p>
              )}
            </SalesPanelSection>
          )}
          {decision}
        </>
      )}
    </SalesListDetailPanel>
  );
}

/** Panel while no row is current. */
export function PurchaseRequestListEmpty() {
  return <SalesListDetailEmpty label="Satınalma talebi özeti" text="Özetini görmek için listeden bir talep seçin." />;
}
