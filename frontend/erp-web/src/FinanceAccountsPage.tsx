import { FinancePage } from './FinancePages'

export default function FinanceAccountsPage({ token, role, section = 'finance-accounts' }: { token: string; role: string; section?: 'finance-accounts' | 'finance-banks' }) {
  return <FinancePage key={section} token={token} role={role} section={section}/>
}
