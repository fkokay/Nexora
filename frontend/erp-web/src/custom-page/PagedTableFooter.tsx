import { useEffect } from "react";

const numberText = (value: number) => new Intl.NumberFormat("tr-TR").format(value);

/**
 * Sunucu sayfalı listenin alt satırı: "{from}–{to} / {total}", üst bilgiler ve Önceki/Sonraki düğmeleri. Toplam küçülüp
 * geçerli sayfa son sayfanın ötesinde kalırsa (ör. kayıtlar silindi) son sayfaya geçilir; sayfa değişince sorgu yeniden çalışır.
 */
export function PagedTableFooter({ page, pageSize, total, meta, onPage, loading = false }: {
  page: number; pageSize: number; total: number; meta: { label: string; value: string }[]; onPage: (page: number) => void; loading?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const beyond = page > pages;
  useEffect(() => { if (beyond && !loading) onPage(pages); }, [beyond, loading, pages]); // eslint-disable-line react-hooks/exhaustive-deps
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const range = beyond ? "Son sayfaya geçiliyor…"
    : total <= 0 || from > total ? `0 / ${numberText(Math.max(0, total))}` : `${numberText(from)}–${numberText(to)} / ${numberText(total)}`;
  const shownPage = Math.min(page, pages);
  return <div className="tenant-page-pager">
    <span className="tenant-page-pager-range" role="status">{range}</span>
    {meta.length > 0 && <span className="tenant-page-pager-meta">
      {meta.map((item, index) => <span key={`${index}-${item.label}`}>{`${item.label}: ${item.value}`}</span>)}
    </span>}
    <span className="tenant-page-pager-nav">
      <button type="button" className={`tenant-page-button${shownPage <= 1 ? " is-disabled" : ""}`} disabled={shownPage <= 1} onClick={() => onPage(shownPage - 1)}>Önceki</button>
      <span>{`Sayfa ${numberText(shownPage)} / ${numberText(pages)}`}</span>
      <button type="button" className={`tenant-page-button${shownPage >= pages ? " is-disabled" : ""}`} disabled={shownPage >= pages} onClick={() => onPage(shownPage + 1)}>Sonraki</button>
    </span>
  </div>;
}
