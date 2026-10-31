type SalesListPaginationProps = {
  page: number
  total: number
  loading: boolean
  onPageChange: (page: number) => void
}

export default function SalesListPagination({ page, total, loading, onPageChange }: SalesListPaginationProps) {
  return <div className="table-pagination">
    <span>Sayfa {page} / {Math.max(1, Math.ceil(total / 25))} · {total} kayıt</span>
    <div>
      <button type="button" className="secondary" disabled={loading || page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Önceki</button>
      <button type="button" className="secondary" disabled={loading || page * 25 >= total} onClick={() => onPageChange(page + 1)}>Sonraki</button>
    </div>
  </div>
}
