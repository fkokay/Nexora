import SearchableRecordPicker from '../../SearchableRecordPicker'
import type { DraftInput, Supplier } from '../types'

type Props = {
  draft: DraftInput
  editing: boolean
  suppliers: Supplier[]
  onUpdate: <K extends keyof DraftInput>(field: K, value: DraftInput[K]) => void
  onSelectSupplier: (id: string) => void
  onSearchSuppliers: (value: string) => void
}

export function InvoiceDraftDocumentFields({ draft, editing, suppliers, onUpdate, onSelectSupplier, onSearchSuppliers }: Props) {
  return <section className="sid-card">
    <div className="sid-card-heading"><div><h2>Belge bilgileri</h2><p>Tedarikçi faturasında görünen değerleri girin.</p></div><span>{editing ? 'Taslak düzenleniyor' : 'Taslak'}</span></div>
    <div className="sid-fields">
      <label>Tedarikçi *<SearchableRecordPicker options={suppliers.map(x=>({id:x.id,label:`${x.code ? `${x.code} · ` : ''}${x.name}`}))} selectedId={draft.supplierId} onSelect={onSelectSupplier} onSearchChange={onSearchSuppliers} title="Tedarikçi seçin" placeholder="Tedarikçi seçin" searchPlaceholder="Tedarikçi kodu veya unvanıyla ara" emptyMessage="Aramanızla eşleşen tedarikçi bulunamadı." required/></label>
      <label>Tedarikçi fatura no *<input value={draft.invoiceNumber} onChange={e => onUpdate('invoiceNumber', e.target.value)} maxLength={100} required/></label>
      <label>Fatura tarihi *<input type="date" value={draft.invoiceDate} onChange={e => onUpdate('invoiceDate', e.target.value)} required/></label>
      <label>Vade tarihi<input type="date" value={draft.dueDate} onChange={e => onUpdate('dueDate', e.target.value)}/></label>
      <label>Para birimi *<input value={draft.currencyCode} onChange={e => onUpdate('currencyCode', e.target.value.toUpperCase())} maxLength={3} minLength={3} required/></label>
      <label className="sid-wide">Not<textarea value={draft.notes} onChange={e => onUpdate('notes', e.target.value)} maxLength={1000} rows={2}/></label>
    </div>
  </section>
}
