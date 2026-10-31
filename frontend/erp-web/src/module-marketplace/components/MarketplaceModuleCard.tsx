import { Boxes, Check, ShieldCheck, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { isEnglishLocale, localizedText } from '../../locale'
import type { MarketplaceModule } from '../types'

type Props = {
  item: MarketplaceModule
  selected: boolean
  role: string
  busy: boolean
  busyCode: string
  onSelect: (moduleCode: string) => void
  onToggle: (item: MarketplaceModule, remove?: boolean) => void
  invokePanel?: ReactNode
}

export function MarketplaceModuleCard({ item, selected, role, busy, busyCode, onSelect, onToggle, invokePanel }: Props) {
  const displayName = item.manifest?.displayName || item.moduleCode
  const publisher = item.manifest?.publisher || item.publisher
  const hasUpdate = item.isActivated && item.activatedVersion !== item.version
  const status = item.isActivated
    ? item.runtimeStatus !== 'Ready' ? localizedText('Etkin · runtime hazır değil', 'Active · runtime not ready') : hasUpdate ? localizedText('Yeni sürüm var', 'Update available') : localizedText('Tenant’ta etkin', 'Active in tenant')
    : item.runtimeStatus === 'Ready' ? localizedText('Etkinleştirilebilir', 'Available to activate') : localizedText('Runtime hazır değil', 'Runtime not ready')
  const publishedAt = item.publishedAt && !Number.isNaN(Date.parse(item.publishedAt))
    ? new Intl.DateTimeFormat(isEnglishLocale() ? 'en' : 'tr-TR', { dateStyle: 'medium' }).format(new Date(item.publishedAt))
    : localizedText('Belirtilmemiş', 'Not specified')

  return <article className="panel marketplace-card" aria-labelledby={`marketplace-title-${item.moduleCode}-${item.version}`}>
    <div className="marketplace-card-top"><span className="marketplace-module-icon"><Boxes size={19} aria-hidden="true"/></span><span className={`marketplace-status ${item.runtimeStatus !== 'Ready' ? 'blocked' : item.isActivated ? 'enabled' : 'available'}`}>{status}</span></div>
    <button type="button" className="marketplace-record-select" aria-pressed={selected} onClick={() => onSelect(item.moduleCode)}>{localizedText('Ayrıntıyı aç', 'Open details')}</button><p className="eyebrow">{item.moduleCode}</p><h2 id={`marketplace-title-${item.moduleCode}-${item.version}`}>{displayName}</h2><p className="marketplace-description">{localizedText(`${publisher} tarafından yayımlandı`, `Published by ${publisher}`)}</p>
    <div className="marketplace-version-row"><span className="marketplace-version">{localizedText('Yayımlanan', 'Published')} <b>v{item.version}</b></span>{item.isActivated && <span className="marketplace-version">Tenant <b>v{item.activatedVersion || '—'}</b></span>}</div>
    <div className="marketplace-meta"><span>Platform ≥ {item.manifest?.minimumPlatformVersion || '—'}</span><span>{localizedText(`${item.manifest?.dependencies.length || 0} bağımlılık`, `${item.manifest?.dependencies.length || 0} dependencies`)}</span><span>{localizedText(`${item.manifest?.permissions.length || 0} izin`, `${item.manifest?.permissions.length || 0} permissions`)}</span><span>{localizedText(`${item.manifest?.menuEntries.length || 0} eylem`, `${item.manifest?.menuEntries.length || 0} actions`)}</span></div>
    <details className="marketplace-details"><summary>{localizedText('Modül ayrıntıları', 'Module details')}</summary>
      <div className="marketplace-detail-content">
        <dl><div><dt>{localizedText('Yayıncı', 'Publisher')}</dt><dd>{publisher}</dd></div><div><dt>{localizedText('En düşük platform sürümü', 'Minimum platform version')}</dt><dd>{item.manifest?.minimumPlatformVersion || localizedText('Belirtilmemiş', 'Not specified')}</dd></div><div><dt>{localizedText('Yayın tarihi', 'Published date')}</dt><dd>{publishedAt}</dd></div><div><dt>{localizedText('Paket SHA-256', 'Package SHA-256')}</dt><dd className="marketplace-hash" title={item.artifactSha256}>{item.artifactSha256 || localizedText('Belirtilmemiş', 'Not specified')}</dd></div></dl>
        {!!item.manifest?.dependencies.length && <div className="marketplace-dependencies"><b>{localizedText('Bağımlılıklar', 'Dependencies')}</b><ul>{item.manifest.dependencies.map(x => <li key={x.moduleCode}>{x.moduleCode} ≥ {x.minimumVersion}</li>)}</ul></div>}
        {!!item.manifest?.permissions.length && <div className="marketplace-dependencies"><b>{localizedText('İstenen izinler', 'Requested permissions')}</b><ul>{item.manifest.permissions.map(x => <li key={x.code}><code>{x.code}</code> — {x.description}</li>)}</ul></div>}
        {!!item.manifest?.menuEntries.length && <div className="marketplace-dependencies"><b>{localizedText('Manifest eylemleri', 'Manifest actions')}</b><ul>{item.manifest.menuEntries.map(x => <li key={x.code}>{x.label} <code>{x.code}</code><small>{localizedText('İzin:', 'Permission:')} {x.permissionCode || localizedText('Tanımlı değil', 'Not defined')}</small></li>)}</ul></div>}
        {!item.manifest && <p className="marketplace-detail-unavailable">{localizedText('Bu paket için manifest ayrıntısı sunulmadı.', 'Manifest details are not available for this package.')}</p>}
      </div>
    </details>
    {invokePanel}
    <div className="marketplace-card-footer"><span className="marketplace-safety"><ShieldCheck size={14} aria-hidden="true"/> {localizedText('İmza doğrulamalı paket', 'Signature-verified package')}</span>{role === 'TenantAdmin' && <div className="marketplace-actions">
      {!item.isActivated && <button className="primary small-button" type="button" disabled={busy || item.runtimeStatus !== 'Ready'} onClick={() => onToggle(item)}>{busyCode === item.moduleCode ? localizedText('Doğrulanıyor…', 'Verifying…') : <><Check size={14} aria-hidden="true"/> {localizedText('Tenant’a ekle', 'Add to tenant')}</>}</button>}
      {hasUpdate && <button className="primary small-button" type="button" disabled={busy} onClick={() => onToggle(item)}>{busyCode === item.moduleCode ? localizedText('Güncelleniyor…', 'Updating…') : localizedText(`v${item.version} sürümüne geç`, `Switch to v${item.version}`)}</button>}
      {item.isActivated && <button className="secondary small-button" type="button" disabled={busy} onClick={() => onToggle(item, true)}>{busyCode === item.moduleCode ? localizedText('Kaydediliyor…', 'Saving…') : <><Trash2 size={14} aria-hidden="true"/> {localizedText('Tenant’tan çıkar', 'Remove from tenant')}</>}</button>}
    </div>}</div>
  </article>
}
