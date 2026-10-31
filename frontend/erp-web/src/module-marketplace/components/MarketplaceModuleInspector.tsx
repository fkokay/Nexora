import { Boxes } from 'lucide-react'
import type { ReactNode } from 'react'
import { localizedText } from '../../locale'
import type { MarketplaceModule } from '../types'

type Props = { item: MarketplaceModule | null; invokePanel?: ReactNode }

export function MarketplaceModuleInspector({ item, invokePanel }: Props) {
  return <aside className="marketplace-inspector" aria-label={localizedText('Seçili modül ayrıntısı', 'Selected module details')}>
    {item ? <>
      <div className="marketplace-inspector-title"><span className="marketplace-module-icon"><Boxes size={18} aria-hidden="true"/></span><div><p className="eyebrow">{localizedText('SEÇİLİ MODÜL', 'SELECTED MODULE')}</p><h2>{item.manifest?.displayName || item.moduleCode}</h2><small>{item.moduleCode} · v{item.version}</small></div></div>
      <div className="marketplace-inspector-status"><span>Runtime</span><b className={item.runtimeStatus === 'Ready' ? 'ready' : 'blocked'}>{item.runtimeStatus}</b></div>
      <dl><div><dt>{localizedText('Yayıncı', 'Publisher')}</dt><dd>{item.manifest?.publisher || item.publisher}</dd></div><div><dt>{localizedText('Tenant sürümü', 'Tenant version')}</dt><dd>{item.isActivated ? item.activatedVersion || '—' : localizedText('Etkin değil', 'Inactive')}</dd></div><div><dt>{localizedText('Minimum platform', 'Minimum platform')}</dt><dd>{item.manifest?.minimumPlatformVersion || '—'}</dd></div><div><dt>{localizedText('Paket SHA-256', 'Package SHA-256')}</dt><dd className="marketplace-hash" title={item.artifactSha256}>{item.artifactSha256 || localizedText('Belirtilmemiş', 'Not specified')}</dd></div></dl>
      {!!item.manifest?.dependencies.length && <section><b>{localizedText('Bağımlılıklar', 'Dependencies')}</b><ul>{item.manifest.dependencies.map(dependency => <li key={dependency.moduleCode}>{dependency.moduleCode} ≥ {dependency.minimumVersion}</li>)}</ul></section>}
      {!!item.manifest?.permissions.length && <section><b>{localizedText('İzin kapsamı', 'Permission scope')}</b><ul>{item.manifest.permissions.map(permission => <li key={permission.code}><code>{permission.code}</code><small>{permission.description}</small></li>)}</ul></section>}
      {invokePanel}
    </> : <div className="marketplace-empty">{localizedText('Ayrıntıyı görmek için modül seçin.', 'Select a module to see its details.')}</div>}
  </aside>
}
