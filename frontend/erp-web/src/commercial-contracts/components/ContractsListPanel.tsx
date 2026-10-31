import type { ReactNode } from 'react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { Contract, ContractStatus, Page, ScreenField, Translate } from '../types'

type Props = {
  tx: Translate; query: string; setQuery: (value: string) => void; typeFilter: string; setTypeFilter: (value: string) => void
  statusFilter: string; setStatusFilter: (value: string) => void; labels: Record<ContractStatus, string>
  pageNumber: number; setPageNumber: (value: number) => void; pageSize: number; setPageSize: (value: number) => void
  page: Page | null; loading: boolean; detailLoading: boolean; visibleFields: ScreenField[]; filtered: Contract[]
  hasFilters: boolean; canEdit: boolean
  setGridSort: (value: { field: string; direction: 'asc' | 'desc' }) => void
  renderField: (item: Contract, field: ScreenField) => ReactNode
}

export default function ContractsListPanel(props: Props) {
  const { tx, query, setQuery, typeFilter, setTypeFilter, statusFilter, setStatusFilter, labels, pageNumber, setPageNumber, pageSize, setPageSize, page, loading, detailLoading, visibleFields, filtered, hasFilters, canEdit, setGridSort, renderField } = props
  return (<section className="contracts-panel" aria-labelledby="contracts-list-title">
    <div className="contracts-toolbar">
    <div>
    <h2 id="contracts-list-title">{tx('Sözleşme listesi')}</h2>
    <p>{tx('Satış ve satın alma sözleşmeleri aynı firma kapsamında listelenir.')}</p>
    </div>
    <div className="contracts-filters">
    <label className="contracts-search">
    <span className="sr-only">{tx('Sözleşme ara')}</span>
    <input type="search" aria-label={tx('Kod veya cari hesapta ara')} placeholder={tx('Kod veya cari ara')} value={query} onChange={e=>{setQuery(e.target.value);setPageNumber(1)}}/>
    </label>
    <label>
    <span className="sr-only">{tx('Sözleşme türüne göre filtrele')}</span>
    <select aria-label={tx('Tür filtresi')} value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);setPageNumber(1)}}>
    <option value="">{tx('Tüm türler')}</option>
    <option value="Sales">{tx('Satış')}</option>
    <option value="Purchase">{tx('Satın alma')}</option>
    </select>
    </label>
    <label>
    <span className="sr-only">{tx('Sözleşme durumuna göre filtrele')}</span>
    <select aria-label={tx('Durum filtresi')} value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPageNumber(1)}}>
    <option value="">{tx('Tüm durumlar')}</option>{Object.entries(labels).map(([key,label])=>
    <option key={key} value={key}>{label}</option>)}</select>
    </label>
    </div>
    </div>
      <div className="contracts-table-wrap" role="region" aria-label={tx('Sözleşme listesi')} tabIndex={0} aria-busy={loading||detailLoading}>
    <AdvancedDataGrid hideSearch className="customer-table" serverData={{page:page?.page??pageNumber,pageSize:page?.pageSize??pageSize,total:page?.total??0,search:query,loading,sortableColumns:visibleFields.map((field,index)=>field.key==='actions'?-1:index).filter(index=>index>=0),supported:{filters:false,sorting:true},onQueryChange:next=>{setQuery(next.search);setPageNumber(next.page);setPageSize(next.pageSize);const sort=next.sorts[0],field=visibleFields[sort?.index??-1]?.key;if(sort&&field&&field!=='actions')setGridSort({field,direction:sort.direction})}}}>
    <thead>
    <ScreenViewGroupHeader fields={visibleFields}/>
    <tr>{visibleFields.map(field=>
    <th key={field.key} scope="col">{field.key==='actions'?<span className="sr-only">{field.label}</span>:field.label}</th>)}</tr>
    </thead>
    <tbody aria-busy={loading}>{loading?<tr>
    <td colSpan={visibleFields.length} className="table-empty" role="status" aria-live="polite">{tx('Sözleşmeler yükleniyor…')}</td>
    </tr>:filtered.length===0?<tr>
    <td colSpan={visibleFields.length} className="table-empty" role="status">{hasFilters?tx('Seçili filtrelerle eşleşen sözleşme bulunamadı.'):tx('Henüz sözleşme bulunmuyor.')}{hasFilters&&<button type="button" className="contracts-clear-filters" onClick={()=>{setQuery('');setTypeFilter('');setStatusFilter('');setPageNumber(1)}}>{tx('Filtreleri temizle')}</button>}</td>
    </tr>:filtered.map(item=>
    <tr key={item.id}>{visibleFields.map(field=>
    <td key={field.key}>{renderField(item,field)}</td>)}</tr>)}</tbody>
    </AdvancedDataGrid>
    </div>
    <footer className="contracts-foot">
    <span>{loading?tx('Kayıtlar alınıyor…'):`${filtered.length} ${tx('görüntüleniyor')} · ${page?.total??0} ${tx('eşleşen kayıt')}`}</span>{canEdit&&<span>{tx('Oluşturma ve durum değiştirme işlemleri firma yöneticisine açıktır.')}</span>}</footer>
    </section>  )
}
