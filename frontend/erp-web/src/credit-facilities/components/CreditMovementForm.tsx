import type { Account, Facility } from '../types'

type Props = {
  isAdmin: boolean
  view?: 'drawdown'|'repayment'
  onNavigate?: (page:string,label?:string)=>void
  facilities: Facility[]
  accounts: Account[]
  facilityId: string
  movementFacility?: Facility
  movementType: 'Drawdown' | 'Repayment'
  accountId: string
  movementDate: string
  principal: string
  interest: string
  fee: string
  scheduleId: string
  notes: string
  busy: boolean
  formatMoney: (amount: number, currency: string) => string
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onFacilityChange: (value: string) => void
  onTypeChange: (value: 'Drawdown' | 'Repayment') => void
  onAccountChange: (value: string) => void
  onDateChange: (value: string) => void
  onPrincipalChange: (value: string) => void
  onInterestChange: (value: string) => void
  onFeeChange: (value: string) => void
  onNotesChange: (value: string) => void
  onScheduleSelected: (scheduleId: string) => void
}

export function CreditMovementForm(props: Props) {
  if (!props.isAdmin) return null
  const { movementFacility, busy } = props
  const movementType=props.view==='repayment'?'Repayment':'Drawdown'
  const usableAccounts = props.accounts.filter(account => account.isActive && account.currencyCode === movementFacility?.currencyCode)
  const availableSchedule = movementFacility?.schedule.filter(schedule => schedule.status === 'Planned') ?? []

  return <section className="panel credit-operation-page" id="credit-movement-form">
    <div className="panel-heading"><div><h2>{movementType==='Drawdown'?'Kredi kullandırımı kaydet':'Kredi geri ödemesi kaydet'}</h2><p>İşlem, aynı para birimli kasa/banka hesabına ve finansman nakit akışına bağlanır.</p></div></div>
    <form className="collection-form" onSubmit={props.onSubmit}>
      <div className="form-two">
        <label>Kredi / finansman<select value={props.facilityId} onChange={event => props.onFacilityChange(event.target.value)} required><option value="">Aktif kredi seçin</option>{props.facilities.filter(facility => facility.status === 'Active').map(facility => <option key={facility.id} value={facility.id}>{facility.code} · {facility.lenderName} · {facility.currencyCode}</option>)}</select></label>
        <label>Hareket türü<input value={movementType==='Drawdown'?'Kredi kullandırımı':'Geri ödeme'} readOnly/></label>
      </div>
      <div className="form-two">
        <label>Kasa / banka hesabı<select value={props.accountId} onChange={event => props.onAccountChange(event.target.value)} required><option value="">{movementFacility ? `${movementFacility.currencyCode} hesabı seçin` : 'Önce kredi seçin'}</option>{usableAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name} · {props.formatMoney(account.balance, account.currencyCode)}</option>)}</select></label>
        <label>İşlem tarihi<input type="date" value={props.movementDate} onChange={event => props.onDateChange(event.target.value)} required/></label>
      </div>
      {movementType === 'Repayment' && <label>Ödeme planı<select value={props.scheduleId} onChange={event => props.onScheduleSelected(event.target.value)}><option value="">Plansız / kısmi ödeme</option>{availableSchedule.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.dueDate} · {props.formatMoney(schedule.principalAmount + schedule.interestAmount + schedule.feeAmount, movementFacility!.currencyCode)}</option>)}</select></label>}
      <div className="form-two"><label>Anapara<input type="number" min="0.01" step="0.01" value={props.principal} onChange={event => props.onPrincipalChange(event.target.value)} required/></label>{movementType === 'Repayment' && <label>Faiz<input type="number" min="0" step="0.01" value={props.interest} onChange={event => props.onInterestChange(event.target.value)}/></label>}</div>
      {movementType === 'Repayment' && <label>Ücret / komisyon<input type="number" min="0" step="0.01" value={props.fee} onChange={event => props.onFeeChange(event.target.value)}/></label>}
      <label>Açıklama<input value={props.notes} onChange={event => props.onNotesChange(event.target.value)} maxLength={500}/></label>
      <div className="modal-foot"><span>{movementType === 'Drawdown' ? 'Kullandırım limit bakiyesiyle doğrulanır.' : 'Planlı taksit, ödeme kaydıyla birlikte kapatılır.'}</span><div className="credit-operation-actions"><button type="button" className="secondary" onClick={()=>props.onNavigate?.('finance-credit-facilities','Krediler & Finansman')}>Vazgeç</button><button className="primary" disabled={busy || !props.facilityId || !props.accountId}>{busy ? 'Kaydediliyor…' : movementType === 'Drawdown' ? 'Kullandırımı kaydet' : 'Geri ödemeyi kaydet'}</button></div></div>
    </form>
  </section>
}
