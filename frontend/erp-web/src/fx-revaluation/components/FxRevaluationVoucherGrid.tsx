import { FinanceStudioGrid } from '../../FinanceStudioGrid'
import { financeGridDefaults } from '../../financeCatalog'
import type { FxRevaluationVoucherGridProps } from './types'

export default function FxRevaluationVoucherGrid({ token, vouchers, money, onOpen }: FxRevaluationVoucherGridProps) {
  return <div className="ledger-list"><FinanceStudioGrid token={token} screenKey="finance-fx-revaluations" defaults={financeGridDefaults['finance-fx-revaluations']}><table className="customer-table"><thead><tr><th>Fiş</th><th>Dönem sonu</th><th>Döviz kalemi</th><th>Borç</th><th>Alacak</th><th></th></tr></thead><tbody>{vouchers.map(voucher=><tr key={voucher.id}><td><span className="customer-code">{voucher.code}</span></td><td>{voucher.asOfDate.split('-').reverse().join('.')}</td><td>{voucher.lineCount}</td><td>{money(voucher.totalDebit,voucher.baseCurrencyCode)}</td><td>{money(voucher.totalCredit,voucher.baseCurrencyCode)}</td><td><button className="row-action" onClick={()=>onOpen(voucher.id)}>Fişi aç</button></td></tr>)}{vouchers.length===0&&<tr><td colSpan={6} className="table-empty">Henüz değerleme fişi oluşturulmadı.</td></tr>}</tbody></table></FinanceStudioGrid></div>
}
