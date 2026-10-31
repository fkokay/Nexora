import { Plus } from 'lucide-react'

type Props = { onCreate: () => void }

export default function SalesInvoiceListHeader({ onCreate }: Props) {
  return <div className="list-toolbar">
    <div><h2>Satış faturaları</h2><p>Sevk edilmiş irsaliyelerden fatura kesin; cari borç kaydı otomatik oluşur.</p></div>
    <button type="button" className="primary" onClick={onCreate}><Plus size={16}/> Fatura oluştur</button>
  </div>
}
