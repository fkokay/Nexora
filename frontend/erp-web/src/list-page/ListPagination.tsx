export type ListPaginationProps = {
  /** 1'den başlayan geçerli sayfa. */
  page: number;
  /** Sunucudan gelen toplam kayıt sayısı. */
  total: number;
  /** Sayfa başına kayıt; varsayılan 25. */
  pageSize?: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

/**
 * Sunucu tarafında sayfalanan listelerin ortak sayfalama satırı:
 * "Sayfa x / y · n kayıt" ve Önceki / Sonraki düğmeleri. Tek sayfa olsa da görünür.
 */
export function ListPagination({ page, total, pageSize = 25, loading = false, onPageChange }: ListPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="table-pagination">
      <span>
        Sayfa {page} / {pages} · {total} kayıt
      </span>
      <div>
        <button
          type="button"
          className="secondary"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Önceki
        </button>
        <button
          type="button"
          className="secondary"
          disabled={loading || page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Sonraki
        </button>
      </div>
    </div>
  );
}
