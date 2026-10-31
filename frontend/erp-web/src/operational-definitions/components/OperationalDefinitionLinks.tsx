import { ArrowRight } from 'lucide-react'
import type { Translate } from '../types'

type Props = { tx: Translate; onNavigate: (page: string) => void }

export function OperationalDefinitionLinks({ tx, onNavigate }: Props) {
  return <>
    <section className="panel op-definitions-warehouse-panel"><div className="panel-heading"><div><h2>{tx('Depo tanımları', 'Warehouse definitions')}</h2><p>{tx('Stok bakiyesi, depo transferleri ve raf/konum yönetimi için depoları açın ve düzenleyin.', 'Create and edit warehouses for inventory, transfers, and storage locations.')}</p></div><button className="primary" onClick={() => onNavigate('inventory-warehouses')}>{tx('Depo tanımlarını aç', 'Open warehouse definitions')}<ArrowRight size={15}/></button></div><div className="op-definitions-warehouse-note">{tx('Depolar, iş yeri ve şube kartlarından ayrı tutulur; stok ve raf konumlarıyla birlikte yönetilir.', 'Warehouses are separate from workplace and branch records and are managed with inventory and storage locations.')}</div></section>
    <section className="panel op-definitions-address-panel"><div className="panel-heading"><div><h2>{tx('Adres tanımları', 'Address definitions')}</h2><p>{tx('Cari adreslerinde kullanılan il ve ilçe kayıtlarını yönetin.', 'Manage provinces and districts used in customer and supplier addresses.')}</p></div><button className="secondary" onClick={() => onNavigate('address-definitions')}>{tx('Adres tanımlarını aç', 'Open address definitions')}<ArrowRight size={15}/></button></div></section>
  </>
}
