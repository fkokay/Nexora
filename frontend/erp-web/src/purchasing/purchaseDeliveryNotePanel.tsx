import { useState } from "react";
import type { DocumentStatus } from "../document-page/DocumentSurface";
import { formatDate, formatQuantity } from "../document-detail/DocumentDetailLayout";
import { StatusTag } from "../list-page/StatusTag";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesPanelChain,
  SalesPanelFacts,
  SalesPanelRows,
  type SalesChainItem,
} from "../sales/components/SalesListDetailPanel";
import type { Note } from "../purchase-delivery-notes/types";
import { formatMoneyWithCurrency, formatPrice } from "../delivery-pricing/deliveryPricing";
import { FreeTag, PricingStateTag } from "../delivery-pricing/DeliveryPricingCells";

/*
 * Satınalma İrsaliyeleri (taslak 07): irsaliyenin durumu yoktur; etiket mal kabul bağlantısından türetilir — "Mal kabul
 * eşleşti" (bağlı mal kabul var) ya da "Bağlantısı yok". Taslak 20: satır fiyatları varsa tutar ve fiyat durumu da gösterilir.
 */

/** Derived state of a delivery note: linked to a receipt or not. */
export function deliveryNoteLinkStatus(note: Pick<Note, "purchaseReceiptId">): DocumentStatus {
  return note.purchaseReceiptId ? { label: "Mal kabul eşleşti", tone: "success" } : { label: "Bağlantısı yok", tone: "warning" };
}

/** List / panel tag of the derived state (ok / warn). */
export function DeliveryNoteLinkTag({ note }: { note: Pick<Note, "purchaseReceiptId"> }) {
  const status = deliveryNoteLinkStatus(note);
  return <StatusTag tone={note.purchaseReceiptId ? "ok" : "warn"}>{status.label}</StatusTag>;
}

/** Chain of a delivery note from its own fields: order → this note → linked receipt. */
export function deliveryNoteChain(note: Note): SalesChainItem[] {
  return [
    { key: "order", code: note.purchaseOrderCode, label: "Satınalma siparişi" },
    { key: "self", code: note.documentNumber, label: "Bu irsaliye", current: true },
    ...(note.purchaseReceiptCode ? [{ key: "receipt", code: note.purchaseReceiptCode, label: "Mal kabul" }] : []),
  ];
}

const TABS = [
  { id: "summary", label: "Özet" },
  { id: "lines", label: "Satırlar" },
];

/** Right-hand panel of the delivery note list (the note's detail endpoint gives the lines). */
export function PurchaseDeliveryNoteListPanel({
  row,
  detail,
  error,
  onOpen,
  openDisabled,
  onClose,
  takeFocus,
}: {
  row: Note;
  detail: Note | null;
  error: string;
  onOpen: () => void;
  openDisabled?: boolean;
  onClose: () => void;
  takeFocus: () => boolean;
}) {
  const [tab, setTab] = useState("summary");
  return (
    <SalesListDetailPanel
      label="Tedarikçi irsaliyesi özeti"
      code={row.documentNumber}
      title={row.supplierName}
      tags={<DeliveryNoteLinkTag note={row} />}
      tabs={TABS}
      tab={tab}
      onTabChange={setTab}
      onOpen={onOpen}
      openDisabled={openDisabled}
      onClose={onClose}
      takeFocus={takeFocus}
      loading={tab === "lines" && !detail && !error}
      error={error}
    >
      {tab === "lines" ? (
        <SalesPanelRows
          empty="Satır yok."
          rows={(detail?.lines ?? []).map((line) => ({
            key: String(line.orderLineNumber),
            label: (
              <>
                <span>Sipariş satırı</span> <span>{line.orderLineNumber}</span>
                {line.isFreeOfCharge && <> <FreeTag /></>}
              </>
            ),
            meta: line.lineNetAmount !== null && line.lineNetAmount !== undefined ? formatPrice(line.lineNetAmount) : undefined,
            value: `${formatQuantity(line.quantity)} ${line.unitCode}`,
          }))}
        />
      ) : (
        <>
          <SalesPanelFacts
            items={[
              { label: "Belge tarihi", value: formatDate(row.documentDate) },
              { label: "Sipariş", value: <span className="nx-code">{row.purchaseOrderCode}</span> },
              {
                label: "Mal kabul",
                value: row.purchaseReceiptCode ? <span className="nx-code">{row.purchaseReceiptCode}</span> : "Bağlantısı yok",
              },
              { label: "Satır sayısı", value: row.lineCount },
              ...(row.pricedGrandTotal !== null && row.pricedGrandTotal !== undefined
                ? [{ label: "Tutar", value: formatMoneyWithCurrency(row.pricedGrandTotal, row.currencyCode) }]
                : []),
              ...(row.pricingState && row.pricingState !== "Priced"
                ? [{ label: "Fiyat durumu", value: <PricingStateTag state={row.pricingState} /> }]
                : []),
            ]}
          />
          <SalesPanelChain items={deliveryNoteChain(row)} />
        </>
      )}
    </SalesListDetailPanel>
  );
}

export function PurchaseDeliveryNoteListPanelEmpty() {
  return <SalesListDetailEmpty label="Tedarikçi irsaliyesi özeti" text="Özetini görmek için listeden bir irsaliye seçin." />;
}
