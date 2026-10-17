import ReportsPage from './ReportsPage'

export default function CustomListsPage({ token, role }: { token: string; role: string }) {
  return <ReportsPage token={token} role={role} mode="list" />
}
