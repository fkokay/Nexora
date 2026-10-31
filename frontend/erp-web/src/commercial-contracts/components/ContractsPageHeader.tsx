import { FileSignature, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import type { Translate } from '../types'

type Props = {
  total: number | undefined
  activeCount: number
  loading: boolean
  canEdit: boolean
  tx: Translate
  onRefresh: () => void
  onCreate: () => void
}

export default function ContractsPageHeader({ total, activeCount, loading, canEdit, tx, onRefresh, onCreate }: Props) {
  return <>
    <header className="contracts-hero screen-page-header">
      <div className="contracts-hero-icon"><FileSignature size={23}/></div>
      <div>
        <p className="eyebrow">{tx('SATIŞ · SATIN ALMA')}</p>
        <h1>{tx('Ticari sözleşmeler')}</h1>
        <p>{tx('Müşteri ve tedarikçi sözleşmelerini firma kapsamında izleyin; durum değişiklikleri geçmişe kaydedilir.')}</p>
      </div>
      <div className="contracts-hero-actions">
        <button className="secondary small-button" onClick={onRefresh} disabled={loading}><RefreshCw size={15}/> {tx('Yenile')}</button>
        {canEdit && <button className="primary" onClick={onCreate}><Plus size={17}/> {tx('Yeni sözleşme')}</button>}
      </div>
    </header>
    <div className="contracts-summary">
      <div><b>{total ?? '—'}</b><span>{tx('Filtreye uyan sözleşme')}</span></div>
      <div><b>{activeCount}</b><span>{tx('Bu sayfada aktif')}</span></div>
      <div className="contracts-scope"><ShieldCheck size={16}/> {tx('Aktif firma verisi')}</div>
    </div>
  </>
}
