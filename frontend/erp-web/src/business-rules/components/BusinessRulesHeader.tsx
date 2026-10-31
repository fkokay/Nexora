import { Plus, Settings2 } from 'lucide-react'

type Props = {
  admin: boolean
  publishedCount: number
  draftCount: number
  evaluationCount: number
  matchedCount: number
  canCreate: boolean
  onCreate: () => void
}

export function BusinessRulesHeader({ admin, publishedCount, draftCount, evaluationCount, matchedCount, canCreate, onCreate }: Props) {
  return <>
    <header className="rules-hero screen-page-header">
      <div className="rules-hero-icon"><Settings2 size={22}/></div>
      <div><p className="eyebrow">OTOMASYON · ERP OLAYLARI</p><h1>İş kuralları</h1><p>Desteklenen ERP olaylarını koşullara göre onay akışlarına yönlendirin.</p></div>
      {admin && <button className="primary" disabled={!canCreate} onClick={onCreate}><Plus size={16}/> Yeni kural</button>}
    </header>
    {admin && <section className="rules-kpis" aria-label="İş kuralları özeti">
      <article><span>Yayımlanmış</span><b>{publishedCount}</b></article>
      <article><span>Taslak</span><b>{draftCount}</b></article>
      <article><span>Değerlendirme</span><b>{evaluationCount}</b></article>
      <article><span>Koşul eşleşmesi</span><b>{matchedCount}</b></article>
    </section>}
  </>
}
