import { FinancePage } from './FinancePages'

export default function LedgerOverviewPage({ token, role }: { token: string; role: string }) {
  return <FinancePage token={token} role={role} section="finance-ledger"/>
}
