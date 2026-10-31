import { FilePlus2 } from 'lucide-react'
import type { DraftInput } from '../types'

type Props = { draft: DraftInput; editing: boolean; busy: boolean; supplierCount: number; onUpdate: <K extends keyof DraftInput>(field: K, value: DraftInput[K]) => void; onCancelEdit: () => void }

export function InvoiceDraftTotals({ draft, editing, busy, supplierCount, onUpdate, onCancelEdit }: Props) {
  return <section className="sid-card">
    <div className="sid-card-heading"><div><h2>Belge toplamları</h2><p>Toplamları tedarikçi belgesinden aynen aktarın.</p></div></div>
    <div className="sid-fields sid-totals"><label>Ara toplam *<input type="number" min="0" step="0.01" value={draft.subtotal} onChange={e => onUpdate('subtotal', e.target.value)} required/></label><label>İskonto toplamı *<input type="number" min="0" step="0.01" value={draft.discountTotal} onChange={e => onUpdate('discountTotal', e.target.value)} required/></label><label>Vergi toplamı *<input type="number" min="0" step="0.01" value={draft.taxTotal} onChange={e => onUpdate('taxTotal', e.target.value)} required/></label><label>Genel toplam *<input type="number" min="0" step="0.01" value={draft.grandTotal} onChange={e => onUpdate('grandTotal', e.target.value)} required/></label></div>
    <footer className="sid-form-footer"><span>Tutarlar kaydedildiği haliyle korunur; bu işlem muhasebe veya stok kaydı oluşturmaz.</span><div className="sid-form-actions">{editing && <button type="button" className="sid-secondary" disabled={busy} onClick={onCancelEdit}>Düzenlemeyi iptal et</button>}<button className="sid-primary" disabled={busy || supplierCount === 0}>{busy ? 'Kaydediliyor…' : <><FilePlus2 size={16}/> {editing ? 'Taslağı güncelle' : 'Taslağı kaydet'}</>}</button></div></footer>
  </section>
}
