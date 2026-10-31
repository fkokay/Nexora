import { ArrowLeft, X } from 'lucide-react'
import { dateLabel, statusClass, type Contract, type ContractStatus, type Detail, type Translate } from '../types'

type Props = {
  selected: Detail
  error: string
  setError: (value: string) => void
  tx: Translate
  labels: Record<ContractStatus, string>
  en: boolean
  canEdit: boolean
  busy: boolean
  setSelected: (value: Detail | null) => void
  availableTransitions: ContractStatus[]
  transition: (status: ContractStatus) => void
}

export default function ContractDetailDialog(props: Props) {
  const { selected, error, setError, tx, labels, en, canEdit, busy, setSelected, availableTransitions, transition } = props
  return (<div className="contracts-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}} onKeyDown={e=>{if(e.key==='Escape')setSelected(null)}}>
    <section className="contracts-detail" role="dialog" aria-modal="true" aria-labelledby="contract-detail-title">
    <header>
    <button type="button" className="contracts-back" autoFocus onClick={()=>setSelected(null)}>
    <ArrowLeft size={16} aria-hidden="true"/> {tx('Listeye dön')}</button>
    <button type="button" className="icon-button" onClick={()=>setSelected(null)} aria-label={tx('Sözleşme detayını kapat')}>
    <X size={18} aria-hidden="true"/>
    </button>
    </header>{error&&<div className="contracts-alert" role="alert">{error}<button type="button" onClick={()=>setError('')} aria-label={tx('Hatayı kapat')}>
    <X size={15}/>
    </button>
    </div>}<div className="contracts-detail-heading">
    <p className="eyebrow">{selected.contract.type==='Sales'?tx('SATIŞ SÖZLEŞMESİ'):tx('SATIN ALMA SÖZLEŞMESİ')}</p>
    <h2 id="contract-detail-title">{selected.contract.code}</h2>
    <span className={`quote-status ${statusClass(selected.contract.status)}`}>{labels[selected.contract.status]}</span>
    </div>
    <div className="contracts-detail-grid">
    <div>
    <small>{tx('Cari hesap')}</small>
    <b>{selected.contract.counterpartyName}</b>
    </div>
    <div>
    <small>{tx('Geçerlilik')}</small>
    <b>{dateLabel(selected.contract.effectiveFrom,en)} – {dateLabel(selected.contract.effectiveThrough,en)}</b>
    </div>
    <div>
    <small>{tx('Para birimi')}</small>
    <b>{selected.contract.currencyCode}</b>
    </div>
    <div>
    <small>{tx('Sürüm')}</small>
    <b>v{selected.contract.revision}</b>
    </div>
    </div>
    <div className="contracts-source">
    <b>{tx('Bağlı kaynak')}</b>
    <span>{selected.contract.salesQuoteId||selected.contract.salesOrderId||selected.contract.purchaseSupplierQuoteId||selected.contract.purchaseOrderId||tx('Bağlı teklif veya sipariş yok')}</span>
    </div>{availableTransitions.length>0&&canEdit&&<div className="contracts-transition-actions">
    <b>{tx('Durum işlemi')}</b>{availableTransitions.map(next=>
    <button type="button" key={next} className={next==='Cancelled'||next==='Terminated'?'secondary small-button':'primary'} disabled={busy} onClick={()=>void transition(next)}>{next==='Active'?(selected.contract.status==='Suspended'?tx('Yeniden etkinleştir'):tx('Etkinleştir')):next==='Suspended'?tx('Askıya al'):next==='Completed'?tx('Tamamlandı olarak işaretle'):next==='Terminated'?tx('Feshet'):tx('İptal et')}</button>)}</div>}<div className="contracts-history">
    <h3>{tx('Durum geçmişi')}</h3>{selected.transitions.length===0?<p>{tx('Henüz durum değişikliği yapılmadı.')}</p>:<ol aria-label={tx('Sözleşme durum değişiklikleri')}>{selected.transitions.map(item=>
    <li key={item.id}>
    <span className="contracts-history-dot" aria-hidden="true"/>
    <div>
    <b>{labels[item.fromStatus as Contract['status']]||item.fromStatus} → {labels[item.toStatus as Contract['status']]||item.toStatus}</b>
    <small>
    <time dateTime={item.changedAt}>{new Date(item.changedAt).toLocaleString(en?'en-US':'tr-TR')}</time>{item.reason?` · ${item.reason}`:''}</small>
    </div>
    </li>)}</ol>}</div>
    </section>
    </div>  )
}
