import { Boxes, Search, ShieldCheck } from 'lucide-react'

export type SalesListTab = 'quotes' | 'orders' | 'invoices'

type SalesListToolbarProps = {
  activeTab: SalesListTab
  total: number
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
}

const labels: Record<SalesListTab, { total: string; summary: string; placeholder: string; context: string }> = {
  quotes: {
    total: 'satış teklifi',
    summary: 'Teklif para birimi seçilen müşteri kartından alınır',
    placeholder: 'Teklif no veya müşteriyle ara',
    context: 'Taslak → iletildi',
  },
  orders: {
    total: 'satış siparişi',
    summary: 'Sevkiyat ve faturalama durumlarını izleyin.',
    placeholder: 'Sipariş no veya müşteriyle ara',
    context: 'Açık siparişler → sevkiyat',
  },
  invoices: {
    total: 'satış faturası',
    summary: 'Kesilen faturalar müşteri cari hareketlerine yansır.',
    placeholder: 'Fatura no veya müşteriyle ara',
    context: 'Faturalar → cari hareketi',
  },
}

export default function SalesListToolbar({ activeTab, total, loading, search, onSearchChange }: SalesListToolbarProps) {
  const copy = labels[activeTab]

  return <>
    <div className="customer-summary">
      <div className="customer-summary-icon"><Boxes size={19}/></div>
      <div><b>{total} {copy.total}</b><small>{copy.summary}</small></div>
      <span className="tenant-scope"><ShieldCheck size={14}/>Firma kapsamlı belgeler · 25 kayıt/sayfa</span>
    </div>
    <div className="customer-toolbar">
      <label className="customer-search">
        <Search size={16}/>
        <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder={copy.placeholder}/>
      </label>
      <span className="date-pill">{loading ? 'Yükleniyor…' : copy.context}</span>
    </div>
  </>
}
