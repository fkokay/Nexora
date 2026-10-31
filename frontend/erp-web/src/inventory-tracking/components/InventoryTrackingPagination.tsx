type Props = { totalCount: number; page: number; maxPage: number; loading: boolean; onPageChange: (page: number) => void }

export default function InventoryTrackingPagination({ totalCount, page, maxPage, loading, onPageChange }: Props) {
  return <div className="table-pagination inventory-tracking-pagination">
    <span>{totalCount} kayıt · Sayfa {page} / {maxPage}</span>
    <div>
      <button className="secondary" type="button" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>Önceki</button>
      <button className="secondary" type="button" disabled={loading || page >= maxPage} onClick={() => onPageChange(page + 1)}>Sonraki</button>
    </div>
  </div>
}
