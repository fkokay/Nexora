import { X } from 'lucide-react'
import type { BankStatementDetail, BankStatementLine, UnmatchedBookMovement } from '../../erp-types'
import { FinanceStudioGrid } from '../../FinanceStudioGrid'
import { financeGridDefaults } from '../../financeCatalog'

type Props = {
  token: string
  statement: BankStatementDetail
  unmatchedBook: UnmatchedBookMovement[]
  lineMatches: Record<string, string>
  busy: boolean
  onClose: () => void
  onAutoMatch: () => void
  onReconcile: () => void
  onMatchLine: (line: BankStatementLine) => void
  onPostLine: (line: BankStatementLine) => void
  onLineMatchChange: (lineId: string, transactionId: string) => void
}

const amount = (value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })

export function BankStatementDetailPanel({ token, statement, unmatchedBook, lineMatches, busy, onClose, onAutoMatch, onReconcile, onMatchLine, onPostLine, onLineMatchChange }: Props) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal ledger-modal">
      <div className="modal-head"><div><p className="eyebrow">{statement.code} · {statement.currencyCode}</p><h2>{statement.accountName}</h2><p className="muted">{statement.startDate} — {statement.endDate}</p></div><button className="icon-button" onClick={onClose} aria-label="Ekstre ayrıntısını kapat"><X size={19}/></button></div>
      <div className="balance-banner"><div><small>Açılış → kapanış</small><b>{amount(statement.openingBalance)} → {amount(statement.closingBalance)} {statement.currencyCode}</b><span>{statement.lines.filter(line => line.financialAccountTransactionId).length}/{statement.lines.length} satır eşleşti</span></div></div>
      {statement.status === 'Imported' && <div className="modal-foot"><span>Önce benzersiz eşleşmeleri bul, sonra kalanları incele.</span><div><button className="secondary" disabled={busy} onClick={onAutoMatch}>Otomatik eşleştir</button><button className="primary" disabled={busy || statement.lines.some(line => !line.financialAccountTransactionId)} onClick={onReconcile}>{busy ? 'Kontrol ediliyor…' : 'Mutabakatı tamamla'}</button></div></div>}
      <div className="list-toolbar"><div><h3>Ekstre hareketleri</h3><p>{statement.lines.length} satır</p></div></div>
      <div className="ledger-list"><FinanceStudioGrid token={token} screenKey="finance-statement-lines" defaults={financeGridDefaults['finance-statement-lines']}>
        <table className="customer-table"><thead><tr><th>Satır</th><th>Tarih</th><th>Yön</th><th>Açıklama</th><th>Dış işlem no</th><th>Referans</th><th>Tutar</th><th>Eşleştirme</th><th>İşlem</th></tr></thead><tbody>
          {statement.lines.map(line => {
            const candidates = unmatchedBook.filter(movement => movement.transactionDate === line.transactionDate && movement.direction === line.direction && movement.amount === line.amount)
            return <tr key={line.id}><td>{line.lineNumber}</td><td>{line.transactionDate}</td><td>{line.direction === 'Inflow' ? 'Giriş' : 'Çıkış'}</td><td>{line.description}</td><td>{line.externalId || '—'}</td><td>{line.reference || '—'}</td><td>{line.direction === 'Inflow' ? '+' : '−'}{amount(line.amount)}</td>
              <td>{line.financialAccountTransactionId ? line.isBookEntryCreated ? 'Deftere eklendi' : 'Eşleşti' : statement.status === 'Imported' && candidates.length > 0 ? <select aria-label={`${line.lineNumber}. satır için defter hareketi`} value={lineMatches[line.id] || ''} onChange={event => onLineMatchChange(line.id, event.target.value)}><option value="">Defter hareketi seçin</option>{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.transactionDate} · {candidate.direction === 'Inflow' ? 'Giriş' : 'Çıkış'} · {amount(candidate.amount)} · {candidate.sourceType || candidate.description}</option>)}</select> : 'Bekliyor'}</td>
              <td>{!line.financialAccountTransactionId && statement.status === 'Imported' && (candidates.length > 0 ? <button className="row-action" disabled={busy || !lineMatches[line.id]} onClick={() => onMatchLine(line)}>Eşleştir</button> : <button className="row-action" disabled={busy} onClick={() => onPostLine(line)}>Deftere ekle</button>)}</td></tr>
          })}
          {statement.lines.length === 0 && <tr><td colSpan={9} className="table-empty">Bu dönemde banka hareketi yok.</td></tr>}
        </tbody></table>
      </FinanceStudioGrid></div>
      <div className="list-toolbar"><div><h3>Defterde olup ekstreden henüz eşleşmeyen hareketler</h3><p>{unmatchedBook.length} hareket</p></div></div>
      <div className="ledger-list"><FinanceStudioGrid token={token} screenKey="finance-statement-unmatched-book" defaults={financeGridDefaults['finance-statement-unmatched-book']}>
        <table className="customer-table"><thead><tr><th>Tarih</th><th>Kaynak</th><th>Açıklama</th><th>Tutar</th></tr></thead><tbody>
          {unmatchedBook.map(movement => <tr key={movement.id}><td>{movement.transactionDate}</td><td>{movement.sourceType || 'Finans hareketi'}</td><td>{movement.description}</td><td>{movement.direction === 'Inflow' ? '+' : '−'}{amount(movement.amount)} {movement.currencyCode}</td></tr>)}
          {unmatchedBook.length === 0 && <tr><td colSpan={4} className="table-empty">Eşleşmemiş defter hareketi yok.</td></tr>}
        </tbody></table>
      </FinanceStudioGrid></div>
      <div className="modal-foot"><span>Mutabakat, iki bakiyeyi ve tüm dönem hareketlerini doğrular.</span><button className="secondary" onClick={onClose}>Kapat</button></div>
    </div>
  </div>
}
