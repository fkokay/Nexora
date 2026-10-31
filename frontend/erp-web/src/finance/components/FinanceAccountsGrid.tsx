import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { BuiltInScreenLayoutField, FinancialAccount } from '../../erp-types'

type Props = {
  loading: boolean
  busy: boolean
  accounts: FinancialAccount[]
  fields: BuiltInScreenLayoutField[]
  onShowDetail: (account: FinancialAccount) => void
  onToggle: (account: FinancialAccount) => void
}

export function FinanceAccountsGrid({ loading, busy, accounts, fields, onShowDetail, onToggle }: Props) {
  return <div className="ledger-list finance-account-list">
    <table className="customer-table"><thead><ScreenViewGroupHeader fields={fields}/><tr>{fields.map(field => <th key={field.key} style={field.width ? { width: `${field.width}px`, minWidth: `${field.width}px` } : undefined}>{field.label}</th>)}</tr></thead>
      <tbody>{accounts.map(account => <tr key={account.id}>{fields.map(field => <td key={field.key} style={field.width ? { width: `${field.width}px`, minWidth: `${field.width}px` } : undefined}>
        {field.key === 'code' ? <span className="customer-code">{account.code}</span>
          : field.key === 'name' ? <b>{account.name}</b>
          : field.key === 'type' ? account.type === 'Cash' ? 'Kasa' : 'Banka'
          : field.key === 'currencyCode' ? account.currencyCode
          : field.key === 'balance' ? <b>{account.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {account.currencyCode}</b>
          : field.key === 'transactionCount' ? account.transactionCount
          : field.key === 'status' ? <span className={`quote-status ${account.isActive ? 'accepted' : 'rejected'}`}>{account.isActive ? 'Aktif' : 'Pasif'}</span>
          : field.key === 'actions' ? <><button className="row-action" onClick={() => onShowDetail(account)}>Hareketler</button><button className="row-action" disabled={busy} onClick={() => onToggle(account)}>{account.isActive ? 'Pasifleştir' : 'Etkinleştir'}</button></>
          : null}
      </td>)}</tr>)}
        {!loading && accounts.length === 0 && <tr><td colSpan={Math.max(1, fields.length)} className="table-empty">Filtreye uygun kasa veya banka hesabı yok.</td></tr>}
        {loading && <tr><td colSpan={Math.max(1, fields.length)} className="table-empty" role="status">Hesaplar yükleniyor…</td></tr>}
      </tbody>
    </table>
  </div>
}
