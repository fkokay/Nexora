import type { ProjectCostSummary } from '../types'

export function ProjectCostSummaryCard({ summary,en }: { summary:ProjectCostSummary|null; en:boolean }) {
  const hourUnit=en?'h':'saat'
  const formatHours=(value:number)=>value.toLocaleString(en?'en-US':'tr-TR',{maximumFractionDigits:2})
  return <section className="op-project-cost">
    <div className="panel-heading"><div><h3>{en?'Cost summary':'Maliyet özeti'}</h3><p>{en?'Planning view only; amounts stay in their original currencies.':'Yalnızca planlama görünümüdür; tutarlar kendi para birimlerinde kalır.'}</p></div>
      <div className="op-project-cost-actual"><small>{en?'Actual hours visible':'Görünen gerçekleşen süre'}</small><b>{summary?formatHours(summary.actualHours):'—'} {hourUnit}</b><small>{summary?.actualTimeEntryCount??0} {en?'entries':'kayıt'}</small></div>
    </div>
    <div className="op-project-cost-grid">
      <article><small>{en?'Project budget':'Proje bütçesi'}</small><b>{summary?summary.budgetAmount.toLocaleString(en?'en-US':'tr-TR',{style:'currency',currency:summary.budgetCurrencyCode}):'—'}</b></article>
      <article><small>{en?'Actual labor cost':'Gerçekleşen işçilik maliyeti'}</small><b>{summary?.actualLaborCost==null?(en?'Not calculated':'Hesaplanmıyor'):summary.actualLaborCost.toLocaleString(en?'en-US':'tr-TR',{maximumFractionDigits:2})}</b><small>{en?'Hourly rate mapping is not defined':'Saatlik ücret eşlemesi tanımlı değil'}</small></article>
    </div>
    <div className="op-project-cost-list">{summary?.plannedCosts.map(cost=><article key={cost.currencyCode}><div><b>{cost.currencyCode} · {cost.plannedCost.toLocaleString(en?'en-US':'tr-TR',{style:'currency',currency:cost.currencyCode})}</b><small>{cost.allocationCount} {en?'allocations':'planlama'} · {formatHours(cost.allocatedHours)} {hourUnit}</small></div><span>{en?`${formatHours(cost.pricedHours)} priced h · ${formatHours(cost.unpricedHours)} unpriced h`:`${formatHours(cost.pricedHours)} saat fiyatlı · ${formatHours(cost.unpricedHours)} saat fiyatsız`}</span></article>)}{summary?.plannedCosts.length===0&&<p className="muted">{en?'No resource costs planned':'Henüz kaynak maliyeti planlanmadı.'}</p>}</div>
    <p className="op-project-footnote">{summary?.limitation??(en?'Loading cost summary…':'Maliyet özeti yükleniyor…')}</p>
  </section>
}
