import { RefreshCw } from 'lucide-react'
import { localizedText } from '../../locale'

type Props = { loading: boolean; onRefresh: () => void }

export function ModuleMarketplaceHeader({ loading, onRefresh }: Props) {
  return <div className="page-heading customer-heading">
    <div><p className="eyebrow">{localizedText('MODÜL YÖNETİMİ · TENANT KATALOĞU', 'MODULE MANAGEMENT · TENANT CATALOG')}</p><h1>{localizedText('Modül pazaryeri', 'Module marketplace')}</h1><p className="muted">{localizedText('Yayımlanmış modülleri inceleyin; imza doğrulaması, sandbox ve tenant izin sınırları altında etkinleştirin.', 'Review published modules and activate them within signature verification, sandbox, and tenant permission boundaries.')}</p></div>
    <button className="secondary" type="button" onClick={onRefresh} disabled={loading} aria-label={loading ? localizedText('Modül kataloğu yenileniyor', 'Refreshing module catalog') : localizedText('Modül kataloğunu yenile', 'Refresh module catalog')}><RefreshCw size={16} aria-hidden="true"/> {loading ? localizedText('Yenileniyor…', 'Refreshing…') : localizedText('Yenile', 'Refresh')}</button>
  </div>
}
