import type { ReactNode } from "react";
import { DocumentStatusFlow, type DocumentFlowStep } from "../document-page/DocumentStatusFlow";
import type { DocumentTotalRow } from "../document-detail/DocumentDetailLayout";
import {
  returnStatus,
  salesDeliveryStatus,
  salesInvoiceStatus,
  salesOrderStatus,
  salesQuoteStatus,
  salesRequestStatus,
} from "../document-page/documentStatus";

/*
 * Satış belge detaylarının ortak parçaları (taslak 02): türün gerçek durumlarından durum akışı, KDV oranına göre
 * toplamlar ve alt bilgi özeti. Yalnızca belgenin mevcut verisi kullanılır; olmayan durum çizilmez.
 */

const step = (key: string, label: string): DocumentFlowStep => ({ key, label });
const CANCELLED = step("Cancelled", "İptal");
const VOIDED = step("Voided", "İptal");

/** Talep: Açık → Kısmen teklif verildi → Teklif verildi; İptal akış dışı son durum. */
/** `status` verilmezse (kaydedilmemiş yeni belge) geçerli adım yoktur: bütün adımlar ilerididir. */
export function SalesRequestFlow({ status }: { status?: string }) {
  return (
    <DocumentStatusFlow
      steps={["Open", "PartiallyQuoted", "Quoted"].map((key) => step(key, salesRequestStatus(key).label))}
      current={status}
      terminal={CANCELLED}
    />
  );
}

/** Teklif: Taslak → İletildi → Kabul edildi; Reddedildi ya da Süresi doldu akış dışı son durum. */
export function SalesQuoteFlow({ status }: { status: string }) {
  const terminal = status === "Rejected" || status === "Expired" ? step(status, salesQuoteStatus(status).label) : undefined;
  return (
    <DocumentStatusFlow
      steps={["Draft", "Sent", "Accepted"].map((key) => step(key, salesQuoteStatus(key).label))}
      current={status}
      terminal={terminal}
    />
  );
}

/** Sipariş: Taslak → Onay bekliyor → Onaylı → Sevk edildi → Faturalandı; İptal akış dışı son durum. */
export function SalesOrderFlow({ status }: { status?: string }) {
  return (
    <DocumentStatusFlow
      steps={["Draft", "PendingApproval", "Open", "Fulfilled", "Invoiced"].map((key) => step(key, salesOrderStatus(key).label))}
      current={status}
      terminal={CANCELLED}
    />
  );
}

/**
 * İrsaliye: Sevk edildi → Faturalandı; İptal akış dışı son durum. "Faturalandı" ayrı bir irsaliye durumu değildir:
 * bağlı faturası kesilmiş (iptal edilmemiş) irsaliyede geçerli adımdır. `draft`: siparişsiz irsaliye önce taslak
 * kaydedilir, listeden stoğa işlenir; akış Taslak ile başlar.
 */
export function SalesDeliveryFlow({ status, invoiced, draft = false }: { status: string; invoiced: boolean; draft?: boolean }) {
  return (
    <DocumentStatusFlow
      steps={[
        ...(draft ? [step("Draft", salesDeliveryStatus("Draft").label)] : []),
        step("Posted", salesDeliveryStatus("Posted").label),
        step("Invoiced", "Faturalandı"),
      ]}
      current={status === "Posted" && invoiced ? "Invoiced" : status}
      terminal={VOIDED}
    />
  );
}

/** Fatura: Kesildi; İptal akış dışı son durum (faturanın Taslak / Onaylı durumu yoktur). */
export function SalesInvoiceFlow({ status }: { status?: string }) {
  return <DocumentStatusFlow steps={[step("Posted", salesInvoiceStatus("Posted").label)]} current={status} terminal={VOIDED} />;
}

/** Satış ve alış iadesi: İşlendi; İptal akış dışı son durum. */
export function ReturnFlow({ status }: { status: string }) {
  return <DocumentStatusFlow steps={[step("Posted", returnStatus("Posted").label)]} current={status} terminal={VOIDED} />;
}

export type VatGroup = { rate: number; taxable: number; vat: number };

/**
 * KDV oranına göre matrah ve KDV: satırların sunucudan gelen tutarları (matrah, KDV) orana göre toplanır, yüksek
 * oran önce. Toplamlar belgenin sunucu toplamlarını (oran grubu başına ± 1 kuruş) tutmazsa — tevkifat, ek vergi, eski kayıt —
 * döküm verilmez (`null`) ve belge toplamları olduğu gibi kalır.
 */
export function vatByRate(
  lines: { vatPercent: number; taxable: number; vat: number }[],
  expected: { taxable: number; vat: number },
): VatGroup[] | null {
  if (!lines.length) return null;
  const groups = new Map<number, VatGroup>();
  for (const line of lines) {
    const group = groups.get(line.vatPercent) ?? { rate: line.vatPercent, taxable: 0, vat: 0 };
    group.taxable += line.taxable;
    group.vat += line.vat;
    groups.set(line.vatPercent, group);
  }
  const all = [...groups.values()];
  // One kuruş of rounding per rate group (the server rounds each line; the groups are what is compared).
  const tolerance = 0.01 * all.length;
  const sum = (key: "taxable" | "vat") => all.reduce((total, group) => total + group[key], 0);
  if (Math.abs(sum("taxable") - expected.taxable) > tolerance || Math.abs(sum("vat") - expected.vat) > tolerance) return null;
  const round = (value: number) => Math.round(value * 100) / 100;
  return all.map((group) => ({ rate: group.rate, taxable: round(group.taxable), vat: round(group.vat) })).sort((a, b) => b.rate - a.rate);
}

/**
 * Belge toplamları bloğu: Ara toplam, Toplam iskonto, Toplam KDV (oran dökümüyle), Genel toplam. Tutarlar belgenin
 * bugünkü toplamlarıdır; döküm yalnızca `vatByRate` tutarlı bulduğunda eklenir.
 */
export function salesTotalRows(
  totals: { subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number },
  money: (value: number) => string,
  vat: VatGroup[] | null,
): DocumentTotalRow[] {
  return [
    { key: "subtotal", label: "Ara toplam", value: money(totals.subtotal) },
    totals.discountTotal > 0
      ? { key: "discount", label: "Toplam iskonto", value: `−${money(totals.discountTotal)}`, emphasis: "negative" }
      : { key: "discount", label: "Toplam iskonto", value: money(totals.discountTotal) },
    { key: "tax", label: "Toplam KDV", value: money(totals.taxTotal) },
    ...(vat ?? []).map(
      (group): DocumentTotalRow => ({
        key: `vat-${group.rate}`,
        label: `KDV %${group.rate} · matrah ${money(group.taxable)}`,
        value: money(group.vat),
        emphasis: "sub",
      }),
    ),
    { key: "grand", label: "Genel toplam", value: money(totals.grandTotal), emphasis: "grand" },
  ];
}

/** Alt bilgi satırının sağı: "5 satır · Genel toplam …". */
export function SalesFooterStatus({ lines, total }: { lines: number; total?: ReactNode }) {
  return (
    <span>
      <span>{`${lines} satır`}</span>
      {total !== undefined && (
        <>
          {" · "}
          <span>Genel toplam</span> <b>{total}</b>
        </>
      )}
    </span>
  );
}

/** Satır kartı başlığının özeti: "5 satır · TRY". Parçalar ayrı metin düğümleridir (çeviri her parçayı ayrı bulur). */
export function SalesLinesMeta({ lines, extra }: { lines: number; extra?: string }) {
  return (
    <>
      <span>{`${lines} satır`}</span>
      {extra && (
        <>
          {" · "}
          <span>{extra}</span>
        </>
      )}
    </>
  );
}

/** Detay satır tabloları salt okunurdur; alt bilgide yalnızca ekranda gerçekten çalışan tuşlar listelenir. */
export const SALES_DETAIL_HINTS = ["Alt+İ işlemler"];
