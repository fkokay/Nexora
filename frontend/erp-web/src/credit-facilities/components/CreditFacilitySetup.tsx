import type { Facility } from '../types'

type Props = {
  isAdmin: boolean
  facilityCreateDialog: React.RefObject<HTMLDialogElement | null>
  busy: boolean
  activeFacilities: Facility[]
  code: string
  lender: string
  kind: string
  currency: string
  limit: string
  startDate: string
  maturityDate: string
  rate: string
  notes: string
  facilityId: string
  dueDate: string
  principal: string
  interest: string
  fee: string
  scheduleNotes: string
  onCloseFacilityDialog: () => void
  onSubmitFacility: (event: React.FormEvent<HTMLFormElement>) => void
  onSubmitSchedule: (event: React.FormEvent<HTMLFormElement>) => void
  onCodeChange: (value: string) => void
  onLenderChange: (value: string) => void
  onKindChange: (value: string) => void
  onCurrencyChange: (value: string) => void
  onLimitChange: (value: string) => void
  onStartDateChange: (value: string) => void
  onMaturityDateChange: (value: string) => void
  onRateChange: (value: string) => void
  onNotesChange: (value: string) => void
  onFacilityIdChange: (value: string) => void
  onDueDateChange: (value: string) => void
  onPrincipalChange: (value: string) => void
  onInterestChange: (value: string) => void
  onFeeChange: (value: string) => void
  onScheduleNotesChange: (value: string) => void
}

export function CreditFacilitySetup(props: Props) {
  if (!props.isAdmin) return null
  const { facilityCreateDialog, busy, activeFacilities } = props
  return <div className="credit-setup-grid">
    <dialog ref={facilityCreateDialog} className="credit-create-dialog" aria-labelledby="credit-create-title" onClose={props.onCloseFacilityDialog} onClick={event => { if (event.target === event.currentTarget) facilityCreateDialog.current?.close() }}>
      <section className="panel">
        <div className="panel-heading"><div><h2 id="credit-create-title">Kredi veya limit ekle</h2><p>Faiz oranı sözleşme bilgisidir; burada ayrıca hesaplanmaz.</p></div><button type="button" className="secondary small-button" onClick={() => facilityCreateDialog.current?.close()}>Kapat</button></div>
        <form className="collection-form" onSubmit={props.onSubmitFacility}>
          <div className="form-two"><label>Kod<input value={props.code} onChange={event => props.onCodeChange(event.target.value)} maxLength={40} required placeholder="KRD-001"/></label><label>Banka / finansman kurumu<input value={props.lender} onChange={event => props.onLenderChange(event.target.value)} maxLength={160} required/></label></div>
          <div className="form-two"><label>Ürün türü<select value={props.kind} onChange={event => props.onKindChange(event.target.value)}><option value="Loan">Ticari kredi</option><option value="Revolving">Rotatif / BCH</option><option value="Leasing">Finansal kiralama</option><option value="Other">Diğer</option></select></label><label>Para birimi<input value={props.currency} onChange={event => props.onCurrencyChange(event.target.value.toUpperCase())} minLength={3} maxLength={3} required/></label></div>
          <div className="form-two"><label>Onaylı limit<input type="number" min="0.01" step="0.01" value={props.limit} onChange={event => props.onLimitChange(event.target.value)} required/></label><label>Yıllık faiz (%)<input type="number" min="0" max="1000" step="0.0001" value={props.rate} onChange={event => props.onRateChange(event.target.value)}/></label></div>
          <div className="form-two"><label>Başlangıç tarihi<input type="date" value={props.startDate} onChange={event => props.onStartDateChange(event.target.value)} required/></label><label>Vade sonu<input type="date" min={props.startDate} value={props.maturityDate} onChange={event => props.onMaturityDateChange(event.target.value)}/></label></div>
          <label>Not<textarea value={props.notes} onChange={event => props.onNotesChange(event.target.value)} maxLength={1000}/></label>
          <div className="modal-foot"><span>Limit bilgisi; kullandırım/bakiye mutabakatı değildir.</span><button className="primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydı oluştur'}</button></div>
        </form>
      </section>
    </dialog>
    <section className="panel">
      <div className="panel-heading"><div><h2>Ödeme planına taksit ekle</h2><p>Planlanan anapara, faiz ve ücretler nakit tahmininde ödeme olarak görünür.</p></div></div>
      <form className="collection-form" onSubmit={props.onSubmitSchedule}>
        <label>Kredi / limit<select value={props.facilityId} onChange={event => props.onFacilityIdChange(event.target.value)} required><option value="">Aktif kredi seçin</option>{activeFacilities.map(facility => <option key={facility.id} value={facility.id}>{facility.code} · {facility.lenderName}</option>)}</select></label>
        <div className="form-two"><label>Vade tarihi<input type="date" value={props.dueDate} onChange={event => props.onDueDateChange(event.target.value)} required/></label><label>Anapara<input type="number" min="0" step="0.01" value={props.principal} onChange={event => props.onPrincipalChange(event.target.value)} required/></label></div>
        <div className="form-two"><label>Faiz<input type="number" min="0" step="0.01" value={props.interest} onChange={event => props.onInterestChange(event.target.value)}/></label><label>Ücret / komisyon<input type="number" min="0" step="0.01" value={props.fee} onChange={event => props.onFeeChange(event.target.value)}/></label></div>
        <label>Not<input value={props.scheduleNotes} onChange={event => props.onScheduleNotesChange(event.target.value)} maxLength={500}/></label>
        <div className="modal-foot"><span>Plan satırı muhasebe kaydı oluşturmaz.</span><button className="primary" disabled={busy || !props.facilityId}>{busy ? 'Kaydediliyor…' : 'Taksit ekle'}</button></div>
      </form>
    </section>
  </div>
}
