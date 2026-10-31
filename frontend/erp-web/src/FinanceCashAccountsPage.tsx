import { FinancePage } from './FinancePages'

export default function FinanceCashAccountsPage({ token, role }: { token: string; role: string }) {
  return <FinancePage token={token} role={role} section="finance-cash-accounts"/>
}
