import type { FxRevaluationHeaderProps } from "./types";

/**
 * Title row of the revaluation voucher list (list-v2). This list is a section of the
 * "Kur & Değerleme" page, which already owns the page's h1, so the kit's title-row
 * classes are used with an h2 instead of ListPageHeader (which renders an h1).
 */
export default function FxRevaluationHeader({ count }: FxRevaluationHeaderProps) {
  return (
    <div className="list-v2-heading">
      <div className="list-v2-title">
        <h2 title="Açık dövizli satış ve alış faturalarını dönem kuru ile değerler. Deftere aktarım için tenant hesap eşleştirmeleri gerekir; otomatik aktarım yapılmaz.">
          Dönem sonu kur değerleme fişleri
        </h2>
        {count != null && (
          <span className="list-v2-count">
            <span>{count.toLocaleString("tr-TR")}</span> <span>kayıt</span>
          </span>
        )}
      </div>
    </div>
  );
}
