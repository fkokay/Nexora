import { Plus, Trash2 } from 'lucide-react'
import SearchableRecordPicker from '../../SearchableRecordPicker'
import type { DraftInput, DraftLineInput, ExpenseAccount, ReceiptOption } from '../types'

type Props = {
  draft: DraftInput
  expenseAccounts: ExpenseAccount[]
  receiptOptions: ReceiptOption[]
  onUpdateLine: (index: number, field: keyof DraftLineInput, value: string) => void
  onSelectReceiptLine: (index: number, id: string) => void
  onAddLine: () => void
  onRemoveLine: (index: number) => void
}

export function InvoiceDraftLineEditor({ draft, expenseAccounts, receiptOptions, onUpdateLine, onSelectReceiptLine, onAddLine, onRemoveLine }: Props) {
  return <section className="sid-card">
    <div className="sid-card-heading"><div><h2>Fatura satırları</h2><p>Miktar ve birim fiyat isteğe bağlıdır; satır tutarları kaynak belgeden girilir, yeniden hesaplanmaz.</p></div><button type="button" className="sid-secondary" onClick={onAddLine}><Plus size={15}/> Satır ekle</button></div>
    <div className="sid-lines">{draft.lines.map((line, index) => <div className="sid-line" key={index}>
      <div className="sid-line-title"><b>Satır {index + 1}</b><button type="button" className="sid-icon-button" disabled={draft.lines.length === 1} aria-label={`Satır ${index + 1} sil`} onClick={() => onRemoveLine(index)}><Trash2 size={15}/></button></div>
      <label className="sid-wide">Siparişsiz mal kabul satırı<SearchableRecordPicker options={receiptOptions.map(receipt=>({id:receipt.lineId,label:`${receipt.receiptCode} · ${receipt.receiptDate} · ${receipt.stockCode} · ${receipt.stockName}`,description:`Kalan ${receipt.quantity} ${receipt.unitCode} · birim maliyet ${receipt.unitCostBase.toLocaleString('tr-TR',{minimumFractionDigits:2})} baz para`,searchText:`${receipt.receiptCode} ${receipt.receiptDate} ${receipt.stockCode} ${receipt.stockName}`}))} selectedId={line.standalonePurchaseReceiptLineId} onSelect={value=>onSelectReceiptLine(index,value)} title="Siparişsiz mal kabul satırı seçin" placeholder="Mal kabule bağlı değil · gider hesabı seçin" searchPlaceholder="Mal kabul, stok kodu veya adıyla ara" emptyMessage="Bu tedarikçi için eşleşen mal kabul satırı yok." clearable clearLabel="Mal kabule bağlı değil · gider hesabı seçin"/></label>
      <label className="sid-wide">Açıklama *<input value={line.description} onChange={e => onUpdateLine(index, 'description', e.target.value)} maxLength={240} required/></label>
      <label>Miktar<input type="number" min="0" step="0.0001" value={line.quantity} onChange={e => onUpdateLine(index, 'quantity', e.target.value)}/></label>
      <label>Birim<input value={line.unitCode} onChange={e => onUpdateLine(index, 'unitCode', e.target.value)} maxLength={12}/></label>
      <label>Birim fiyat<input type="number" min="0" step="0.0001" value={line.unitPrice} onChange={e => onUpdateLine(index, 'unitPrice', e.target.value)}/></label>
      <label>Ara toplam *<input type="number" min="0" step="0.01" value={line.subtotal} onChange={e => onUpdateLine(index, 'subtotal', e.target.value)} required/></label>
      <label>İskonto *<input type="number" min="0" step="0.01" value={line.discountAmount} onChange={e => onUpdateLine(index, 'discountAmount', e.target.value)} required/></label>
      <label>Vergi tutarı *<input type="number" min="0" step="0.01" value={line.taxAmount} onChange={e => onUpdateLine(index, 'taxAmount', e.target.value)} required/></label>
      <label>Belgedeki KDV oranı (%)<input type="number" min="0" max="100" step="0.01" value={line.vatRate} onChange={e => onUpdateLine(index, 'vatRate', e.target.value)}/></label>
      {!line.standalonePurchaseReceiptLineId && <label>Gider hesabı<select value={line.expenseAccountId} onChange={e => onUpdateLine(index, 'expenseAccountId', e.target.value)}><option value="">Şimdi seçme</option>{expenseAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>}
      <label>Satır toplamı *<input type="number" min="0" step="0.01" value={line.total} onChange={e => onUpdateLine(index, 'total', e.target.value)} required/></label>
      <p className="sid-line-note sid-wide">{line.standalonePurchaseReceiptLineId ? 'Bu satır mal kabul maliyetini faturadaki net tutara günceller. Yalnız kalan, tüketilmemiş stok için aktarılır; stok miktarı değişmez.' : 'KDV oranı belge üzerinden kaydedilir; yeniden hesaplanmaz. Gider hesabı yalnız sonraki muhasebeleştirme için sınıflandırmadır.'}</p>
    </div>)}</div>
  </section>
}
