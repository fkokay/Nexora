import type { ReactNode } from 'react'

export function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="settings-row"><span>{label}</span>{children}</div>
}
