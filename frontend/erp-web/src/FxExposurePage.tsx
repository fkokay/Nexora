import { FinancePage } from './FinancePages'

export default function FxExposurePage({ token, role }: { token: string; role: string }) {
  return <FinancePage token={token} role={role} section="finance-exposure"/>
}
