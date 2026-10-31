import { FinancePage } from './FinancePages'

export default function FxSettingsPage({ token, role }: { token: string; role: string }) {
  return <FinancePage token={token} role={role} section="finance-fx"/>
}
