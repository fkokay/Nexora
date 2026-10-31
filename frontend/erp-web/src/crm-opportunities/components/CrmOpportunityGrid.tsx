import { Target } from 'lucide-react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import { stageLabels, type Opportunity, type ScreenField } from '../types'
import type { ReactNode } from 'react'

type Props = {
  items: Opportunity[]; fields: ScreenField[]; loading: boolean; error: string; query: string; filter: string
  selectedId: string | null; renderField: (item: Opportunity, field: ScreenField) => ReactNode
  onSelect: (item: Opportunity) => void; onRefresh: () => void; onCreate: () => void; onClearFilters: () => void
}

export function CrmOpportunityGrid({ items, fields, loading, error, query, filter, selectedId, renderField, onSelect, onRefresh, onCreate, onClearFilters }: Props) {
  return <div className="crm-record-list">
        {error ? <div className="crm-empty crm-error-state" role="alert"><b>Fırsatlar yüklenemedi</b><span>Satış hattı şu anda alınamıyor: {error}</span><span>Bağlantınızı kontrol edin ve tekrar deneyin.</span><button type="button" className="secondary small-button" onClick={onRefresh}>Yeniden dene</button></div>
          : loading ? <div className="crm-empty" role="status" aria-live="polite"><span className="crm-spinner" aria-hidden="true" /><b>Fırsatlar yükleniyor</b><span>Satış hattınızdaki kayıtlar getiriliyor. Bu işlem birkaç saniye sürebilir.</span></div>
            : items.length === 0 ? <div className={`crm-empty crm-empty-explained${query.trim() || filter ? ' crm-empty-filtered' : ''}`}>
              <div className="crm-empty-icon"><Target size={23} aria-hidden="true" /></div><b>{query.trim() || filter ? 'Bu aramayla eşleşen fırsat yok' : 'Satış hattınız henüz boş'}</b>
              <span>{query.trim() || filter ? 'Girilen kod, fırsat adı veya müşteri adıyla eşleşen bir kayıt bulunamadı. Arama metnini ve aşama filtresini kontrol edip yeniden deneyin.' : 'Henüz CRM fırsatı oluşturulmadığı için listelenecek kayıt bulunmuyor. İlk fırsatınızı ekleyerek müşteri, tahmini tutar, kazanma olasılığı ve takip tarihini satış hattınızda izlemeye başlayabilirsiniz.'}</span>
              {query.trim() || filter ? <div className="crm-active-filters">{query.trim() && <span>Arama: “{query.trim()}”</span>}{filter && <span>Aşama: {stageLabels[filter] || filter}</span>}</div> : <button type="button" className="primary crm-empty-action" onClick={onCreate}><span aria-hidden="true">＋</span>İlk fırsatı oluştur</button>}
              {(query.trim() || filter) && <button type="button" className="secondary small-button" onClick={onClearFilters}>Aramayı ve filtreleri temizle</button>}
            </div>
              : <><p className="crm-scroll-hint">Tablonun diğer sütunlarını görmek için yatay kaydırın.</p><div className="crm-table-wrap" role="region" aria-label="Fırsatlar tablosu; daha fazla sütun için yatay kaydırın" tabIndex={0}>
                <AdvancedDataGrid hideSearch externalPagination enableRowSelection={false} gridId="crm-opportunities-v2" className="crm-table" initialColumnWidths={fields.map(field => ({ code: 100, name: 165, customerName: 150, stage: 90, estimatedValue: 120, probabilityPercent: 105, expectedCloseDate: 135, nextActivityAt: 145, actions: 136 }[field.key] ?? 120))} minimumColumnWidths={fields.map(field => ({ code: 85, name: 125, customerName: 115, stage: 78, estimatedValue: 100, probabilityPercent: 90, expectedCloseDate: 112, nextActivityAt: 122, actions: 120 }[field.key] ?? 80))}>
                  <thead><ScreenViewGroupHeader fields={fields} /><tr>{fields.map(field => <th key={field.key} scope="col" data-column={field.key}>{field.label}</th>)}</tr></thead>
                  <tbody>{items.map(item => <tr key={item.id} tabIndex={0} aria-selected={selectedId === item.id} onClick={() => onSelect(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item) } }}>{fields.map(field => <td key={field.key} data-column={field.key}>{renderField(item, field)}</td>)}</tr>)}</tbody>
                </AdvancedDataGrid>
              </div></>}
  </div>
}

type PaginationProps = { loading: boolean; page: number; totalCount: number; onPageChange: (page: number) => void }
export function CrmOpportunityPagination({ loading, page, totalCount, onPageChange }: PaginationProps) {
  return <div className="table-pagination"><span>Sayfa {page} / {Math.max(1, Math.ceil(totalCount / 50))} · {totalCount} fırsat</span><div><button type="button" className="secondary" disabled={loading || page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Önceki</button><button type="button" className="secondary" disabled={loading || page * 50 >= totalCount} onClick={() => onPageChange(page + 1)}>Sonraki</button></div></div>
}
