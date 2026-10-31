import type { Account, Entry, PlanView } from './types'

type Props = {
  selected: PlanView|null
  name: string
  year: number
  entries: Entry[]
  eligible: Account[]
  baseCurrency: string
  controlsLocked: boolean
  busy: boolean
  onNameChange: (value:string)=>void
  onYearChange: (value:number)=>void
  onAddLine: ()=>void
  onUpdateLine: (index:number,patch:Partial<Entry>)=>void
  onRemoveLine: (index:number)=>void
  onCancel: ()=>void
  onNew: ()=>void
  onSubmit: (event:React.FormEvent)=>void
}

export default function BudgetEditor({selected,name,year,entries,eligible,baseCurrency,controlsLocked,busy,onNameChange,onYearChange,onAddLine,onUpdateLine,onRemoveLine,onCancel,onNew,onSubmit}:Props) {
  return <section className="panel budget-editor" aria-labelledby="budget-editor-title">
    <div className="panel-heading"><div><h2 id="budget-editor-title">{selected?'Bütçe taslağını düzenle':'Yeni bütçe taslağı'}</h2><p>Yalnız aktif gelir ve gider hesapları seçilebilir.</p></div>{selected&&<button type="button" className="row-action" onClick={onNew} disabled={controlsLocked}>Yeni</button>}</div>
    <form className="collection-form budget-form" onSubmit={onSubmit}>
      <div className="budget-form-basics">
        <label>Senaryo adı<input value={name} onChange={e=>onNameChange(e.target.value)} maxLength={120} required autoComplete="off" disabled={controlsLocked} /></label>
        <label>Mali yıl<input type="number" min="2000" max="2100" value={year} onChange={e=>onYearChange(Number(e.target.value))} required disabled={controlsLocked} /></label>
        <label>Baz para birimi<input value={baseCurrency} readOnly aria-readonly="true" aria-describedby="budget-currency-help" disabled={controlsLocked} /></label>
      </div>
      <p className="budget-field-help" id="budget-currency-help">Bütçe ve yevmiye gerçekleşenleri aynı ölçekte karşılaştırmak için yalnızca firmanın baz para birimi kullanılır. Döviz çevrimi uygulanmaz.</p>
      <div className="budget-entry-header"><div><h3>Aylık bütçe satırları</h3><p>Her satır bir hesap ve ay için planlanan tahakkuk tutarını belirtir.</p></div><button type="button" className="secondary small-button" onClick={onAddLine} disabled={controlsLocked}>+ Satır ekle</button></div>
      {entries.length===0&&<div className="budget-inline-empty">Henüz satır yok. Devam etmek için bir bütçe satırı ekleyin.</div>}
      <div className="budget-entry-list">
        {entries.map((line,index)=><fieldset className="budget-entry-row" key={index}>
          <legend>Satır {index+1}</legend>
          <label className="budget-entry-account">Gelir / gider hesabı<select value={line.accountId} onChange={e=>onUpdateLine(index,{accountId:e.target.value})} required disabled={controlsLocked}><option value="">Hesap seçin</option>{eligible.map(account=><option key={account.id} value={account.id}>{account.code} · {account.name} ({account.statementSection==='Revenue'?'Gelir':'Gider'})</option>)}</select></label>
          <label>Ay<input type="month" value={line.periodStart.slice(0,7)} onChange={e=>onUpdateLine(index,{periodStart:`${e.target.value}-01`})} required disabled={controlsLocked} /></label>
          <label>Planlanan tahakkuk tutarı<input type="number" min="0" step="0.01" value={line.plannedAmount} onChange={e=>onUpdateLine(index,{plannedAmount:Number(e.target.value)})} required disabled={controlsLocked} /></label>
          <label className="budget-entry-note">Not <input value={line.notes||''} maxLength={240} onChange={e=>onUpdateLine(index,{notes:e.target.value||null})} disabled={controlsLocked} /></label>
          <button type="button" className="row-action danger budget-remove" aria-label={`Satır ${index+1} sil`} disabled={controlsLocked||entries.length===1} onClick={()=>onRemoveLine(index)}>Sil</button>
        </fieldset>)}
      </div>
      <div className="budget-form-foot"><span>{eligible.length} uygun hesap</span><div><button type="button" className="secondary" onClick={onCancel} disabled={controlsLocked}>Vazgeç</button><button type="submit" className="primary" disabled={controlsLocked||!baseCurrency||eligible.length===0||entries.length===0} aria-busy={busy}>{busy?'Kaydediliyor…':selected?'Taslağı kaydet':'Taslak oluştur'}</button></div></div>
      {eligible.length===0&&<p className="budget-field-help" role="status">Aktif gelir veya gider hesabı bulunamadı. Bütçe oluşturmak için önce hesap planını güncelleyin.</p>}
    </form>
  </section>
}
