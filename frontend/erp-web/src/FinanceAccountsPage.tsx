import { FinancePage } from './FinancePages'

export default function FinanceAccountsPage({ token, role, section = 'finance-accounts', createOnOpen = false }: { token: string; role: string; section?: 'finance-accounts' | 'finance-banks'; createOnOpen?: boolean }) {
  return <FinancePage key={`${section}-${createOnOpen}`} token={token} role={role} section={section} createOnOpen={createOnOpen}/>
}
