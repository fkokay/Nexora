import { FinancePage } from './FinancePages'

export default function CashFlowPage({ token, role }: { token: string; role: string }) {
  return <FinancePage token={token} role={role} section="finance-cash-flow"/>
}
