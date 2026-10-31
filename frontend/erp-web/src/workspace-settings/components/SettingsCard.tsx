import type { ReactNode } from 'react'

export function SettingsCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="settings-card"><header>{icon}<h2>{title}</h2></header>{children}</section>
}
