import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { DetailLinesFooter, DetailLinesHead, type DocumentTotalRow } from "../document-detail/DocumentDetailLayout";
import { SalesLinesMeta } from "./salesDocumentDetail";

/*
 * Satış belge oluşturma / düzenleme ekranlarının ortak parçaları (taslak 02, belge düzenlenirken): satır kartı
 * (başlık + ızgara + alt bantta notlar ve toplamlar) ve bugünkü oluşturma toplamlarından toplam satırları. Davranış
 * değişmez: satır ekleme bugünkü düğmeyle (Ctrl+Shift+Enter, App.tsx formdaki [data-line-add-shortcut] düğmesine basar).
 */

/** Ekranda gerçekten çalışan tek satır kısayolu (App.tsx): formdaki "Satır ekle" düğmesi. */
export const LINE_ADD_HINT = "Ctrl+Shift+Enter satır ekle";
export const SALES_FORM_HINTS = [LINE_ADD_HINT];

/**
 * Satır kartı: "Satırlar" başlığı, özet ("2 satır · TRY"), satır kısayolu; ızgara kartın kenarına dayanır. `totals`
 * verilirse alt bantta solda `notes`, sağda toplamlar çizilir.
 */
export function SalesFormLines({
  label,
  lines,
  extra,
  addHint = true,
  notes,
  totals,
  totalsLabel,
  children,
}: {
  /** Izgaranın erişilebilir adı ("Teklif satırları"). */
  label: string;
  lines: number;
  /** Özetin ikinci parçası: belge dövizi ya da kısa not. */
  extra?: string;
  /** Satır ekleme kısayolu ekranda varsa (Ctrl+Shift+Enter). */
  addHint?: boolean;
  notes?: ReactNode;
  totals?: DocumentTotalRow[];
  totalsLabel?: string;
  /** `table.dd-lines` (son satırı `dd-new-line` içinde "Satır ekle" düğmesi). */
  children: ReactNode;
}) {
  return (
    <section className="dd-box" aria-label={label}>
      <DetailLinesHead
        title="Satırlar"
        meta={<SalesLinesMeta lines={lines} extra={extra} />}
        hints={addHint ? [{ keys: "Ctrl+Shift+Enter", label: "satır ekle" }] : undefined}
      />
      <div className="dd-lines-wrap">{children}</div>
      {totals && <DetailLinesFooter aside={notes} totals={totals} label={totalsLabel} />}
    </section>
  );
}

/** "Satır ekle" düğmesinin içi (ızgaranın son, "yeni satır" satırında): artı, metin, kısayol. */
export function LineAddLabel() {
  return (
    <>
      <Plus size={13} aria-hidden="true" /> Satır ekle <kbd>Ctrl+Shift+Enter</kbd>
    </>
  );
}

export type SalesFormTotals = {
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  taxableByRate: Record<number, number>;
  vatByRate: Record<number, number>;
};

/**
 * Teklif / sipariş oluşturma toplamları, bugünkü sıra ve adlarıyla: Mal / hizmet toplamı, Toplam iskonto (− X),
 * KDV %r matrahı satırları, KDV %r satırları (oran artan), KDV toplamı, Genel toplam · Ödenecek tutar. Tutarlar
 * ekranın kendi hesabıdır; burada hesap yapılmaz.
 */
export function salesFormTotalRows(totals: SalesFormTotals, money: (value: number) => ReactNode): DocumentTotalRow[] {
  const rates = (byRate: Record<number, number>) => Object.keys(byRate).map(Number).sort((a, b) => a - b);
  return [
    { key: "subtotal", label: "Mal / hizmet toplamı", value: money(totals.subtotal) },
    { key: "discount", label: "Toplam iskonto", value: <span className="sales-total-discount">− {money(totals.discount)}</span> },
    ...rates(totals.taxableByRate).map((rate) => ({ key: `taxable-${rate}`, label: `KDV %${rate} matrahı`, value: money(totals.taxableByRate[rate]) })),
    ...rates(totals.vatByRate).map((rate) => ({ key: `vat-${rate}`, label: `KDV %${rate}`, value: money(totals.vatByRate[rate]) })),
    { key: "vat", label: "KDV toplamı", value: money(totals.vat) },
    { key: "grand", label: "Genel toplam · Ödenecek tutar", value: money(totals.total), emphasis: "grand" },
  ];
}
