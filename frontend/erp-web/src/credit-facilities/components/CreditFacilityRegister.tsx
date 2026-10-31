import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import { CreditFacilitiesFilters } from './CreditFacilitiesFilters'
import type { EffectiveInterestPreview, Facility, InterestPreview, Movement, Schedule, ScreenField } from '../types'

type Props = {
  facilities: Facility[]
  visibleFacilities: Facility[]
  loading: boolean
  admin: boolean
  search: string
  statusFilter: string
  currencyFilter: string
  currencies: string[]
  visibleScheduleFields: ScreenField[]
  visibleMovementFields: ScreenField[]
  interestPreviews: Record<string, InterestPreview>
  effectiveInterestPreviews: Record<string, EffectiveInterestPreview>
  busy: boolean
  formatMoney: (amount:number,currency:string)=>string
  onSearchChange: (value:string)=>void
  onStatusChange: (value:string)=>void
  onCurrencyChange: (value:string)=>void
  onClearFilters: ()=>void
  onPreviewInterest: (facility:Facility)=>void
  onPreviewEffectiveInterest: (facility:Facility,initialTransactionCosts:string)=>void
  onPostPreviousMonthInterest: (facility:Facility)=>void
  onCloseFacility: (facility:Facility)=>void
  onPrepareSchedulePayment: (facility:Facility,item:Schedule)=>void
  onSetScheduleStatus: (item:Schedule,status:'Cancelled')=>void
  onReverseMovement: (facility:Facility,movement:Movement)=>void
}

export function CreditFacilityRegister({facilities,visibleFacilities,loading,admin,search,statusFilter,currencyFilter,currencies,visibleScheduleFields,visibleMovementFields,interestPreviews,effectiveInterestPreviews,busy,formatMoney,onSearchChange,onStatusChange,onCurrencyChange,onClearFilters,onPreviewInterest,onPreviewEffectiveInterest,onPostPreviousMonthInterest,onCloseFacility,onPrepareSchedulePayment,onSetScheduleStatus,onReverseMovement}:Props) {
  const money=formatMoney
  const previewInterest=onPreviewInterest
  const postPreviousMonthInterest=onPostPreviousMonthInterest
  const closeFacility=onCloseFacility
  const prepareSchedulePayment=onPrepareSchedulePayment
  const setScheduleStatus=onSetScheduleStatus
  const reverseMovement=onReverseMovement
  return <section className="panel credit-records-panel" aria-labelledby="credit-records-title">
    <div className="credit-records-heading"><div><h2 id="credit-records-title">Kredi ve finansman kayıtları</h2><p>{facilities.length} kayıt · {visibleFacilities.length} gösteriliyor · sadece açık taksitler gelecek tahmine eklenir</p></div></div>
    <CreditFacilitiesFilters search={search} statusFilter={statusFilter} currencyFilter={currencyFilter} currencies={currencies} onSearchChange={onSearchChange} onStatusChange={onStatusChange} onCurrencyChange={onCurrencyChange} onClear={onClearFilters}/>
      {loading?<div className="credit-state" role="status" aria-live="polite" aria-busy="true"><span className="credit-spinner" aria-hidden="true"/>Kayıtlar yükleniyor…</div>:facilities.length===0?<div className="credit-state credit-empty"><strong>Henüz kredi veya finansman kaydı yok.</strong><span>{admin?'İlk kredi kaydını yukarıdaki formdan oluşturabilirsiniz.':'Kayıtlar oluşturulduğunda burada görüntülenir.'}</span></div>:visibleFacilities.length===0?<div className="credit-state credit-empty"><strong>Filtrelerle eşleşen kayıt bulunamadı.</strong><span>Arama veya filtreleri değiştirerek tekrar deneyin.</span><button type="button" className="secondary small-button" onClick={onClearFilters}>Filtreleri temizle</button></div>:<div className="credit-facility-list" aria-live="polite">{visibleFacilities.map(f=><section className="credit-facility-card" key={f.id} aria-labelledby={`credit-${f.id}`}>
        <div className="credit-card-heading"><div className="credit-card-main"><p className="eyebrow">{f.code} · {f.currencyCode} · {f.status==='Active'?'AKTİF':'KAPALI'}</p><h3 id={`credit-${f.id}`}>{f.lenderName}</h3><p>{f.facilityType} · Yıllık faiz {f.annualInterestRatePercent===null?'—':`${f.annualInterestRatePercent}%`} · Vade {f.maturityDate||'Belirtilmedi'}</p></div><div className="credit-row-actions"><button type="button" className="secondary small-button" disabled={busy||f.annualInterestRatePercent===null} onClick={()=>void previewInterest(f)}>Bu ay faiz önizle</button>{admin&&<><button type="button" className="secondary small-button" disabled={busy||f.annualInterestRatePercent===null} onClick={()=>void postPreviousMonthInterest(f)}>Önceki ayı muhasebeleştir</button><button className="secondary small-button" disabled={busy||f.openScheduleCount>0&&f.status==='Active'||f.outstandingPrincipal>0&&f.status==='Active'} onClick={()=>void closeFacility(f)}>{f.status==='Active'?'Kapat':'Etkinleştir'}</button></>}</div></div>
        <dl className="credit-balance-grid"><div><dt>Onaylı limit</dt><dd>{money(f.approvedLimit,f.currencyCode)}</dd></div><div><dt>Toplam kullandırım</dt><dd>{money(f.totalDrawdown,f.currencyCode)}</dd></div><div><dt>Anapara geri ödendi</dt><dd>{money(f.principalRepaid,f.currencyCode)}</dd></div><div className="credit-balance-emphasis"><dt>Açık anapara</dt><dd>{money(f.outstandingPrincipal,f.currencyCode)}</dd></div></dl>
        <details className="credit-facility-details"><summary>Ödeme planı, kullandırım ve geri ödeme detayları <span>{f.openScheduleCount} açık taksit · {f.movements.length} hareket</span></summary>
        {interestPreviews[f.id]&&<div className="credit-movements" role="status"><h4>Faiz tahakkuk önizlemesi · {interestPreviews[f.id].from} – {interestPreviews[f.id].to}</h4><p>{interestPreviews[f.id].dayCountConvention} · kayıtlı hareketlerin günlük kapanış bakiyesi · henüz muhasebeleştirilmedi</p><ul>{interestPreviews[f.id].months.map(item=><li key={item.month}>{item.month}: {money(item.accruedInterest,interestPreviews[f.id].currencyCode)}</li>)}</ul><strong>Toplam: {money(interestPreviews[f.id].totalAccruedInterest,interestPreviews[f.id].currencyCode)}</strong></div>}
        <form className="credit-effective-interest-form" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);onPreviewEffectiveInterest(f,String(data.get('initialTransactionCosts')||'0'))}}><label>İlk işlem maliyeti ({f.currencyCode})<input name="initialTransactionCosts" type="number" min="0" step="0.01" defaultValue="0" aria-label={`${f.code} ilk işlem maliyeti`}/></label><button type="submit" className="secondary small-button" disabled={busy||f.movements.every(m=>m.type!=='Drawdown')}>TFRS 9 etkin faiz önizle</button></form>
        {effectiveInterestPreviews[f.id]&&<div className="credit-movements" role="status"><h4>Etkin faiz oranı · %{effectiveInterestPreviews[f.id].effectiveAnnualRatePercent.toLocaleString('tr-TR',{maximumFractionDigits:6})}</h4><p>{effectiveInterestPreviews[f.id].dayCountConvention} · ilk işlem maliyeti {money(effectiveInterestPreviews[f.id].initialTransactionCosts,effectiveInterestPreviews[f.id].currencyCode)} · muhasebeleştirilmedi</p><div className="credit-table-wrap" role="region" aria-label={`${f.code} etkin faiz önizleme satırları`} tabIndex={0}><AdvancedDataGrid hideSearch className="customer-table credit-table"><thead><tr><th>Tarih</th><th>Açılış itfa edilmiş maliyet</th><th>Etkin faiz gideri</th><th>Nakit ödeme</th><th>Kapanış itfa edilmiş maliyet</th></tr></thead><tbody>{effectiveInterestPreviews[f.id].rows.map(row=><tr key={row.date}><td>{row.date}</td><td>{money(row.openingAmortizedCost,f.currencyCode)}</td><td>{money(row.effectiveInterestExpense,f.currencyCode)}</td><td>{money(row.cashPayment,f.currencyCode)}</td><td>{money(row.closingAmortizedCost,f.currencyCode)}</td></tr>)}</tbody></AdvancedDataGrid></div><p className="muted">{effectiveInterestPreviews[f.id].note}</p></div>}
        <div className="credit-table-wrap" role="region" aria-label={`${f.code} ödeme planı`} tabIndex={0}><AdvancedDataGrid hideSearch className="customer-table credit-table"><caption>Ödeme planı · {f.openScheduleCount} açık taksit · planlanan toplam {money(f.openScheduleTotal,f.currencyCode)}</caption><thead><ScreenViewGroupHeader fields={visibleScheduleFields}/><tr>{visibleScheduleFields.map(field=><th key={field.key} scope="col">{field.key==='actions'?<span className="sr-only">{field.label}</span>:field.label}</th>)}</tr></thead><tbody>{f.schedule.map(item=><tr key={item.id}>{visibleScheduleFields.map(field=><td key={field.key} data-label={field.label}>{field.key==='dueDate'?item.dueDate:field.key==='principalAmount'?money(item.principalAmount,f.currencyCode):field.key==='interestAmount'?money(item.interestAmount,f.currencyCode):field.key==='feeAmount'?money(item.feeAmount,f.currencyCode):field.key==='total'?<b>{money(item.principalAmount+item.interestAmount+item.feeAmount,f.currencyCode)}</b>:field.key==='status'?item.status==='Paid'?`Ödendi · ${item.paidDate}`:item.status==='Cancelled'?'İptal':'Planlandı':field.key==='actions'&&admin&&item.status==='Planned'?<div className="credit-row-actions">{f.status==='Active'&&<button className="row-action" aria-label={`${f.code} ${item.dueDate} taksidini öde`} disabled={busy} onClick={()=>prepareSchedulePayment(f,item)}>Öde</button>}<button className="row-action" aria-label={`${f.code} ${item.dueDate} taksidini iptal et`} disabled={busy} onClick={()=>void setScheduleStatus(item,'Cancelled')}>İptal</button></div>:null}</td>)}</tr>)}{f.schedule.length===0&&<tr><td colSpan={Math.max(1,visibleScheduleFields.length)} className="table-empty">Ödeme planı yok.</td></tr>}</tbody></AdvancedDataGrid></div>
        {f.movements.length>0&&<div className="credit-movements"><h4>Gerçekleşen kredi hareketleri</h4><div className="credit-table-wrap" role="region" aria-label={`${f.code} gerçekleşen hareketler`} tabIndex={0}><AdvancedDataGrid hideSearch className="customer-table credit-table credit-movement-table"><caption>Gerçekleşen kullandırım, geri ödeme ve ters kayıtlar</caption><thead><ScreenViewGroupHeader fields={visibleMovementFields}/><tr>{visibleMovementFields.map(field=><th key={field.key} scope="col">{field.key==='actions'?<span className="sr-only">{field.label}</span>:field.label}</th>)}</tr></thead><tbody>{f.movements.map(m=><tr key={m.id}>{visibleMovementFields.map(field=><td key={field.key} data-label={field.label}>{field.key==='transactionDate'?m.transactionDate:field.key==='type'?<>{m.type==='Drawdown'?'Kullandırım':m.type==='Repayment'?'Geri ödeme':`Ters kayıt · ${m.reversesMovementId?.slice(0,8)}`}{m.isReversed&&<small> · Ters çevrildi</small>}</>:field.key==='accountCode'?m.accountCode:field.key==='principalAmount'?money(m.principalAmount,f.currencyCode):field.key==='interestAmount'?money(m.interestAmount,f.currencyCode):field.key==='feeAmount'?money(m.feeAmount,f.currencyCode):field.key==='actions'&&admin&&m.type!=='Reversal'&&!m.isReversed&&f.status==='Active'?<button type="button" className="row-action" disabled={busy} onClick={()=>void reverseMovement(f,m)}>Ters kayıt</button>:null}</td>)}</tr>)}</tbody></AdvancedDataGrid></div><p className="muted">Ters kayıt özgün satırı silmez; aynı banka/kasa hesabında karşı hareket ve kredi defterinde bağlantılı bir ters satır oluşturur.</p></div>}{f.notes&&<p className="muted credit-notes">{f.notes}</p>}</details>
      </section>)}</div>}
  </section>
}
