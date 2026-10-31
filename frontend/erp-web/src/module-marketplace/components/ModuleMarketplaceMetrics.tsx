import { localizedText } from '../../locale'

type Props = { moduleCount: number; activeCount: number; availableCount: number; blockedCount: number }

export function ModuleMarketplaceMetrics({ moduleCount, activeCount, availableCount, blockedCount }: Props) {
  return <section className="marketplace-kpis" aria-label={localizedText('Modül kataloğu özeti', 'Module catalog summary')}>
    <article><span>{localizedText('Katalog modülü', 'Catalog modules')}</span><b>{moduleCount}</b><small>{localizedText('Yayımlanmış paket', 'Published packages')}</small></article>
    <article><span>{localizedText('Tenant’ta etkin', 'Active in tenant')}</span><b>{activeCount}</b><small>{localizedText('Etkin modül', 'Active modules')}</small></article>
    <article><span>{localizedText('Etkinleştirilebilir', 'Available to activate')}</span><b>{availableCount}</b><small>{localizedText('Runtime hazır', 'Runtime ready')}</small></article>
    <article><span>{localizedText('Runtime engelli', 'Runtime blocked')}</span><b>{blockedCount}</b><small>{localizedText('Hazır olmayan paket', 'Packages not ready')}</small></article>
  </section>
}
