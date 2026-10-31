import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  pages: number
  totalCount: number
  loading: boolean
  onPrevious: () => void
  onNext: () => void
}

export default function SupplierQuotesPagination({ page, pages, totalCount, loading, onPrevious, onNext }: Props) {
  return (
    <div className="table-pagination">
      <span>Sayfa {page}/{pages} · {totalCount} teklif</span>
      <div>
        <button className="secondary small-button" disabled={page <= 1 || loading} onClick={onPrevious}>
          <ChevronLeft size={15} /> Önceki
        </button>
        <button className="secondary small-button" disabled={page >= pages || loading} onClick={onNext}>
          Sonraki <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
