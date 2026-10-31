import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { DistributionPage, Need, ScreenField } from './types'

type Props = {
  page: DistributionPage | null
  busy: boolean
  visibleFields: ScreenField[]
  pageNumber: number
  selectedStockId: string
  selected: Need | null
  onSelectStock: (stockId: string) => void
  onPreviousPage: () => void
  onNextPage: () => void
}

function fieldValue(item: Need, key: string) {
  return key === 'stock' ? <><b>{item.stockCode}</b><small>{item.stockName}</small></>
    : key === 'openDemand' ? `${item.openDemand.toLocaleString('tr-TR')} ${item.unitCode}`
      : key === 'onHand' ? `${item.onHand.toLocaleString('tr-TR')} ${item.unitCode}`
        : key === 'activeReserved' ? `${item.activeReserved.toLocaleString('tr-TR')} ${item.unitCode}`
          : key === 'available' ? `${item.available.toLocaleString('tr-TR')} ${item.unitCode}`
            : key === 'uncovered' ? <b>{item.uncovered.toLocaleString('tr-TR')} {item.unitCode}</b>
              : item.openOrderCount
}

function StockNeedsTable({ page, busy, visibleFields, selectedStockId, onSelectStock }: Pick<Props, 'page' | 'busy' | 'visibleFields' | 'selectedStockId' | 'onSelectStock'>) {
  return <div className="sales-distribution-table-wrap"><AdvancedDataGrid gridId="sales-distribution-plan-v2" hideSearch externalPagination enableRowSelection={false} className="compact" initialColumnWidths={[160, 95, 105, 100, 105, 105, 80]} minimumColumnWidths={[130, 80, 85, 85, 85, 90, 70]}>
    <thead><ScreenViewGroupHeader fields={visibleFields} /><tr>{visibleFields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead>
    <tbody>
      {page?.items.map(item => <tr key={item.stockItemId} tabIndex={0} aria-selected={selectedStockId === item.stockItemId} onClick={() => onSelectStock(item.stockItemId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectStock(item.stockItemId) } }}>{visibleFields.map(field => <td key={field.key}>{fieldValue(item, field.key)}</td>)}</tr>)}
      {page?.items.length === 0 && <tr><td colSpan={Math.max(1, visibleFields.length)} className="sales-distribution-empty">Açık satış siparişlerinde eşleşen ihtiyaç bulunamadı.</td></tr>}
      {!page && !busy && <tr><td colSpan={Math.max(1, visibleFields.length)} className="sales-distribution-empty">İhtiyaçları görmek için depo seçin.</td></tr>}
    </tbody>
  </AdvancedDataGrid></div>
}

function SelectedStockDetail({ selected }: { selected: Need | null }) {
  return <aside className="sales-distribution-detail" aria-label="Seçili stok özeti">{selected ? <>
    <small>SEÇİLİ STOK</small><h3>{selected.stockCode}</h3><p>{selected.stockName}</p>
    <dl>
      <div><dt>Açık talep</dt><dd>{selected.openDemand.toLocaleString('tr-TR')} {selected.unitCode}</dd></div>
      <div><dt>Depo mevcudu</dt><dd>{selected.onHand.toLocaleString('tr-TR')} {selected.unitCode}</dd></div>
      <div><dt>Aktif rezervasyon</dt><dd>{selected.activeReserved.toLocaleString('tr-TR')} {selected.unitCode}</dd></div>
      <div><dt>Kullanılabilir</dt><dd>{selected.available.toLocaleString('tr-TR')} {selected.unitCode}</dd></div>
      <div><dt>Karşılanmamış</dt><dd>{selected.uncovered.toLocaleString('tr-TR')} {selected.unitCode}</dd></div>
      <div><dt>Açık sipariş</dt><dd>{selected.openOrderCount}</dd></div>
    </dl>
    <p className="sales-distribution-note">Bu görünüm ihtiyaç analizi sağlar; stok rezervasyonu veya sipariş değişikliği yapmaz.</p>
  </> : <div className="sales-distribution-placeholder"><b>Stok satırı seçin</b><span>Karşılanabilir miktar ve açık ihtiyaç özeti burada gösterilir.</span></div>}</aside>
}

function DistributionPagination({ page, busy, pageNumber, onPreviousPage, onNextPage }: Pick<Props, 'page' | 'busy' | 'pageNumber' | 'onPreviousPage' | 'onNextPage'>) {
  return <footer className="sales-distribution-pagination">
    <span>Sayfa {pageNumber} / {Math.max(1, Math.ceil((page?.totalCount ?? 0) / (page?.pageSize ?? 25)))}</span>
    <div>
      <button className="secondary" disabled={busy || pageNumber <= 1} onClick={onPreviousPage}>Önceki</button>
      <button className="secondary" disabled={busy || !page || pageNumber * page.pageSize >= page.totalCount} onClick={onNextPage}>Sonraki</button>
    </div>
  </footer>
}

export default function DistributionPlanPanel({ page, busy, visibleFields, pageNumber, selectedStockId, selected, onSelectStock, onPreviousPage, onNextPage }: Props) {
  return <section className="sales-distribution-panel" aria-busy={busy}>
    <div className="sales-distribution-panel-heading"><div><h2>Stok ihtiyaçları</h2><p>{page?.warehouse ? `${page.warehouse.code} · ${page.totalCount} stok kalemi · yalnız açık siparişler` : 'Önce depo seçin'}</p></div><span>{busy ? 'Yükleniyor…' : page?.method ?? ''}</span></div>
    <div className="sales-distribution-workspace">
      <StockNeedsTable page={page} busy={busy} visibleFields={visibleFields} selectedStockId={selectedStockId} onSelectStock={onSelectStock} />
      <SelectedStockDetail selected={selected} />
    </div>
    <DistributionPagination page={page} busy={busy} pageNumber={pageNumber} onPreviousPage={onPreviousPage} onNextPage={onNextPage} />
  </section>
}
