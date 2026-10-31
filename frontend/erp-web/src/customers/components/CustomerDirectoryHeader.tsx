import { Download, Plus, Upload } from 'lucide-react'

type Props = {
  canImport: boolean
  exportBusy: boolean
  onImport: () => void
  onExport: (format: 'csv' | 'xlsx') => void
  onGroups: () => void
  onCreate: () => void
}

export function CustomerDirectoryHeader({ canImport, exportBusy, onImport, onExport, onGroups, onCreate }: Props) {
  return <div className="page-heading customer-heading"><div><p className="eyebrow">ERP CORE · CARİ</p><h1>Cari Yönetimi</h1><p className="muted">Müşteri ve tedarikçi kartlarını firma bazında yönetin.</p></div><div className="heading-actions">
    {canImport && <button className="secondary" onClick={onImport}><Upload size={15}/> CSV / Excel içe aktar</button>}
    <details className="customer-export-menu"><summary className="secondary"><Download size={15}/> Dışa aktar</summary><div><button type="button" disabled={exportBusy} onClick={() => onExport('csv')}>CSV olarak indir</button><button type="button" disabled={exportBusy} onClick={() => onExport('xlsx')}>Excel olarak indir</button></div></details>
    <button className="secondary" onClick={onGroups}>Gruplar</button><button className="primary" onClick={onCreate}><Plus size={17}/> Yeni cari kartı</button>
  </div></div>
}
