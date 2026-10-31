import type { Plan } from './types'

type Props = {
  plans: Plan[]
  eligibleCount: number
  loading: boolean
  controlsLocked: boolean
  error: string
  notice: string
  onRefresh: () => void
  onRetry: () => void
}

export function BudgetPageChrome({plans,eligibleCount,loading,controlsLocked,error,notice,onRefresh,onRetry}:Props) {
  return <>
    <header className="page-heading budget-hero">
      <div className="budget-hero-copy"><p className="eyebrow">FİNANS YÖNETİMİ <span>·</span> PLANLAMA</p><h1>Bütçe planı ve gerçekleşen</h1><p>Aylık gelir ve gider hedeflerini yevmiye gerçekleşenleriyle aynı ekranda izleyin.</p><div className="budget-hero-caption"><span className="budget-hero-dot"/> Onaylanan bütçeler değiştirilemez ve mali yıl bazında takip edilir.</div></div>
      <button type="button" className="budget-refresh" onClick={onRefresh} disabled={controlsLocked} aria-busy={loading}>{loading?'Yenileniyor…':'Yenile'}</button>
    </header>
    <section className="budget-overview" aria-label="Bütçe özeti">
      <article className="budget-overview-card"><span>Toplam senaryo</span><strong>{plans.length}</strong><small>Firma kapsamındaki bütçeler</small></article>
      <article className="budget-overview-card"><span>Taslak</span><strong>{plans.filter(plan=>!isApproved(plan.status)).length}</strong><small>Onay sürecine hazır</small></article>
      <article className="budget-overview-card"><span>Onaylı</span><strong>{plans.filter(plan=>isApproved(plan.status)).length}</strong><small>Değiştirilemez planlar</small></article>
      <article className="budget-overview-card"><span>Uygun hesap</span><strong>{eligibleCount}</strong><small>Gelir ve gider hesapları</small></article>
    </section>
    {error&&<div className="alert inline-alert budget-alert" role="alert"><span>{error}</span><button type="button" className="row-action" onClick={onRetry} disabled={loading}>Yeniden dene</button></div>}
    {notice&&<div className="notice inline-notice budget-notice" role="status">{notice}</div>}
  </>
}

function isApproved(status:Plan['status']) { return status===2||status==='Approved' }

export function BudgetBoundaryNote({baseCurrency}:{baseCurrency:string}) {
  return <div className="boundary-note"><span>Gerçekleşen değerler yalnız mali yıldaki yevmiye kayıtlarından ve firmanın baz para birimi ({baseCurrency||'yükleniyor'}) üzerinden hesaplanır. Gelir hesabında alacak − borç, gider hesabında borç − alacak kullanılır. Bu ekran kur çevrimi, bordro veya vergi mevzuatı hesabı yapmaz.</span></div>
}
