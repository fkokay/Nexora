const numberText = (value: number) => new Intl.NumberFormat("tr-TR").format(value);

/** Sunucu sayfalı listenin alt satırı: "{from}–{to} / {total}", üst bilgiler ve Önceki/Sonraki düğmeleri. */
export function PagedTableFooter({ page, pageSize, total, meta, onPage }: {
  page: number; pageSize: number; total: number; meta: { label: string; value: string }[]; onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const range = total <= 0 || from > total ? `0 / ${numberText(Math.max(0, total))}` : `${numberText(from)}–${numberText(to)} / ${numberText(total)}`;
  return <div className="tenant-page-pager">
    <span className="tenant-page-pager-range" role="status">{range}</span>
    {meta.length > 0 && <span className="tenant-page-pager-meta">
      {meta.map((item, index) => <span key={`${index}-${item.label}`}>{`${item.label}: ${item.value}`}</span>)}
    </span>}
    <span className="tenant-page-pager-nav">
      <button type="button" className="tenant-page-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Önceki</button>
      <span>{`Sayfa ${numberText(page)} / ${numberText(pages)}`}</span>
      <button type="button" className="tenant-page-button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sonraki</button>
    </span>
  </div>;
}
