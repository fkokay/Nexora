import { ExternalLink } from 'lucide-react'

type Props = { onOpenRequests: () => void }

export default function SupplierQuotesHeader({ onOpenRequests }: Props) {
  return (
    <div className="page-heading customer-heading">
      <div>
        <p className="eyebrow">ERP CORE · SATIN ALMA</p>
        <h1>Tedarikçi Teklifleri</h1>
        <p className="muted">Taleplere bağlı teklifleri tek listede bulun, durumlarını ve fiyatlarını inceleyin.</p>
      </div>
      <button className="primary" onClick={onOpenRequests}>
        Talep üzerinden teklif gir <ExternalLink size={15} />
      </button>
    </div>
  )
}
