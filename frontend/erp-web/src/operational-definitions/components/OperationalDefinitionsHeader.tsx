import { RefreshCw } from 'lucide-react'
import type { Translate } from '../types'

type Props = { tx: Translate; loading: boolean; onRefresh: () => void }

export function OperationalDefinitionsHeader({ tx, loading, onRefresh }: Props) {
  return <div className="page-heading">
    <div><p className="eyebrow">{tx('FİRMA TANIMLARI', 'COMPANY DEFINITIONS')}</p><h1>{tx('İş yeri, şube ve fabrika', 'Workplaces, branches and factories')}</h1><p className="muted">{tx('Firma lokasyonlarını tanımlayın. Depolar, stok işlemleri ve raf/konum bağlantılarıyla birlikte ayrı depo kayıtları olarak yönetilir.', 'Define company locations. Warehouses remain separate records managed with inventory and storage locations.')}</p></div>
    <button className="secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={15}/>{tx('Yenile', 'Refresh')}</button>
  </div>
}
