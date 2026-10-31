import type { BankStatement } from '../../erp-types'
import { FinanceStudioGrid } from '../../FinanceStudioGrid'
import { financeGridDefaults } from '../../financeCatalog'

type Props = {
  token: string
  statements: BankStatement[]
  loading: boolean
  onOpen: (statement: BankStatement) => void
}

const amount = (value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })

export function BankStatementsGrid({ token, statements, loading, onOpen }: Props) {
  return <>
    <div className="list-toolbar"><div><h2>Banka ekstreleri</h2><p>{statements.length} aktarım</p></div></div>
    <div className="ledger-list">
      <FinanceStudioGrid token={token} screenKey="finance-statements" defaults={financeGridDefaults['finance-statements']}>
        <table className="customer-table">
          <thead><tr><th>Ekstre</th><th>Hesap</th><th>Dönem</th><th>Açılış</th><th>Kapanış</th><th>Eşleşme</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {statements.map(statement => <tr key={statement.id}>
              <td><span className="customer-code">{statement.code}</span></td>
              <td>{statement.accountName} · {statement.currencyCode}</td>
              <td>{statement.startDate} — {statement.endDate}</td>
              <td>{amount(statement.openingBalance)}</td>
              <td>{amount(statement.closingBalance)}</td>
              <td>{statement.matchedLineCount}/{statement.lineCount}</td>
              <td><span className={`quote-status ${statement.status === 'Reconciled' ? 'accepted' : 'rejected'}`}>{statement.status === 'Reconciled' ? 'Mutabık' : 'Bekliyor'}</span></td>
              <td><button className="row-action" onClick={() => onOpen(statement)}>Aç</button></td>
            </tr>)}
            {!loading && statements.length === 0 && <tr><td colSpan={8} className="table-empty">Henüz banka ekstresi aktarılmadı.</td></tr>}
            {loading && statements.length === 0 && <tr><td colSpan={8} className="table-empty" role="status">Ekstreler yükleniyor…</td></tr>}
          </tbody>
        </table>
      </FinanceStudioGrid>
    </div>
  </>
}
