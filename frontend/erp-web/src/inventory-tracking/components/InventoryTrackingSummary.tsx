import { ShieldCheck } from 'lucide-react'

type Props = { totalCount: number; itemCount: number; page: number; maxPage: number; hasFilters: boolean; pageSize: number }

export default function InventoryTrackingSummary({ totalCount, itemCount, page, maxPage, hasFilters, pageSize }: Props) {
  return <section className="inventory-workbench-summary" aria-label="Stok izlenebilirliği özeti">
    <article><span>İzlenen bakiyeler</span><b>{totalCount}</b><small>Sıfırdan farklı lot ve seri kayıtları</small></article>
    <article><span>Görüntülenen satır</span><b>{itemCount}</b><small>{pageSize} kayıt / sayfa</small></article>
    <article><span>Sayfa</span><b>{page} / {maxPage}</b><small>{hasFilters ? 'Filtre uygulanıyor' : 'Tüm depolar ve iz türleri'}</small></article>
    <span className="tenant-scope"><ShieldCheck size={14} aria-hidden="true"/>Firma kapsamlı</span>
  </section>
}
