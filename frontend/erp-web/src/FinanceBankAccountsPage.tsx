import { FinancePage } from './FinancePages'

export default function FinanceBankAccountsPage({ token, role }: { token: string; role: string }) {
  return <FinancePage token={token} role={role} section="finance-bank-accounts"/>
}
