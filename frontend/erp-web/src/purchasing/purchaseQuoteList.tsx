import { useState } from "react";
import { supplierQuoteStatus } from "../document-page/documentStatus";
import { StatusTag, type StatusTagTone } from "../list-page/StatusTag";
import type { Quote, QuoteDetail } from "../purchase-supplier-quotes/types";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesPanelChain,
  SalesPanelFacts,
  SalesPanelLines,
  SalesPanelLinesPreview,
  SalesPanelStats,
  panelMoney,
} from "../sales/components/SalesListDetailPanel";

/* Satınalma Teklifleri listesi (Faz 4, taslak 07): durum etiketi ve sağ panel. Liste salt okunurdur; Aç talebi açar. */

const tones: Record<string, StatusTagTone> = { Submitted: "warn", Selected: "ok", NotSelected: "off" };

/** Teklif listesi etiketi: Değerlendirmede (turuncu), Seçildi (yeşil), Seçilmedi (gri). */
export function purchaseQuoteListTag(status: string): { tone: StatusTagTone; label: string } {
  return { tone: tones[status] ?? "off", label: supplierQuoteStatus(status).label };
}

/** Varsayılan sütun genişlikleri (kiracı genişliği olmayan alanlar). */
export const PURCHASE_QUOTE_LIST_WIDTHS: Record<string, number> = {
  code: 140, requestCode: 130, supplierName: 230, quoteDate: 100, validUntil: 100, status: 130, grandTotal: 140,
  lineCount: 60, createdAt: 150,
};

const date = (value: string | null | undefined) => (value ? value.slice(0, 10).split("-").reverse().join(".") : "—");

type Props = {
  row: Quote;
  /** The quote's lines (the request's supplier quotes endpoint); null while loading. */
  detail: QuoteDetail | null;
  error: string;
  onOpen: () => void;
  onClose: () => void;
  takeFocus: () => boolean;
};

/** Sağ panel: teklif tutarı, tarihler, talep → teklif zinciri ve satırlar. Aç (Enter) teklifin talebini açar. */
export function PurchaseQuoteListPanel({ row, detail, error, onOpen, onClose, takeFocus }: Props) {
  const [tab, setTab] = useState("summary");
  const tag = purchaseQuoteListTag(row.status);
  const lines = (Array.isArray(detail?.lines) ? detail.lines : []).map((line) => ({ key: String(line.requestLineNumber), ...line }));
  return (
    <SalesListDetailPanel
      label="Satınalma teklifi özeti"
      code={row.code}
      title={row.supplierName}
      tags={<StatusTag tone={tag.tone}>{tag.label}</StatusTag>}
      tabs={[
        { id: "summary", label: "Özet" },
        { id: "lines", label: "Satırlar" },
      ]}
      tab={tab}
      onTabChange={setTab}
      onOpen={onOpen}
      onClose={onClose}
      takeFocus={takeFocus}
      loading={!detail}
      error={error}
    >
      {detail &&
        (tab === "lines" ? (
          <SalesPanelLines currency={row.currencyCode} lines={lines} />
        ) : (
          <>
            <SalesPanelStats items={[{ label: "Genel toplam", value: panelMoney(row.grandTotal, row.currencyCode) }]} />
            <SalesPanelFacts
              items={[
                { label: "Teklif tarihi", value: date(row.quoteDate) },
                { label: "Geçerlilik", value: date(row.validUntil) },
                ...(detail.notes ? [{ label: "Not", value: detail.notes }] : []),
              ]}
            />
            <SalesPanelChain
              items={[
                { key: "request", code: row.requestCode, label: "Satınalma talebi" },
                { key: "self", code: row.code, label: "Bu teklif", current: true, status: tag },
              ]}
            />
            <SalesPanelLinesPreview lines={lines} currency={row.currencyCode} onShowAll={() => setTab("lines")} />
          </>
        ))}
    </SalesListDetailPanel>
  );
}

export function PurchaseQuoteListEmpty() {
  return <SalesListDetailEmpty label="Satınalma teklifi özeti" text="Özetini görmek için listeden bir teklif seçin." />;
}
