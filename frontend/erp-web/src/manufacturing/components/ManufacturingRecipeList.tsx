import { Boxes, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { ManufacturingBom, ManufacturingPageKey } from '../types'

type Props = {
  boms: ManufacturingBom[]
  filteredBoms: ManufacturingBom[]
  pagedBoms: ManufacturingBom[]
  loading: boolean
  busy: boolean
  search: string
  setSearch: (value: string) => void
  page: number
  setPage: Dispatch<SetStateAction<number>>
  pageCount: number
  onResetForm: () => void
  onNavigate: (page: ManufacturingPageKey) => void
  onEdit: (bom: ManufacturingBom) => void
  onChangeState: (bom: ManufacturingBom) => void
  onDelete: (bom: ManufacturingBom) => void
}

export default function ManufacturingRecipeList({
  boms,
  filteredBoms,
  pagedBoms,
  loading,
  busy,
  search,
  setSearch,
  page,
  setPage,
  pageCount,
  onResetForm,
  onNavigate,
  onEdit,
  onChangeState,
  onDelete,
}: Props) {
  return (
    <section className="manufacturing-panel">
      <div className="manufacturing-heading">
        <div className="manufacturing-icon soft"><Boxes size={18} /></div>
        <div><h2>Tanımlı reçeteler</h2><p>Ürün reçetelerini arayın, inceleyin ve düzenleyin.</p></div>
      </div>
      <section className="manufacturing-recipe-list" aria-labelledby="manufacturing-recipe-list-title" aria-busy={loading}>
        <div className="manufacturing-recipe-list-heading">
          <div>
            <h3 id="manufacturing-recipe-list-title">Tanımlı reçeteler</h3>
            <p>{loading ? 'Reçete ve stok verileri yükleniyor…' : `${filteredBoms.length.toLocaleString('tr-TR')} kayıt · ${boms.filter(x => x.isActive).length.toLocaleString('tr-TR')} aktif · Kullanılmış reçeteler geçmiş emirler için korunur.`}</p>
          </div>
          <label className="manufacturing-recipe-search">
            <span className="sr-only">Reçetelerde ara</span>
            <input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Kod, reçete veya mamul ara" aria-label="Reçetelerde ara" />
          </label>
        </div>
        {loading ? <div className="manufacturing-empty" role="status" aria-live="polite"><RefreshCw size={18} aria-hidden="true" /><span>Ürün reçeteleri yükleniyor…</span></div>
          : boms.length === 0 ? <div className="manufacturing-empty"><Boxes size={22} /><b>Henüz ürün reçetesi yok</b><span>Yeni reçete düğmesini kullanarak ilk reçeteyi oluşturun.</span><button type="button" className="primary" onClick={() => { onResetForm(); onNavigate('manufacturing-recipe-create') }}><Plus size={15} /> Reçete oluştur</button></div>
            : filteredBoms.length === 0 ? <div className="manufacturing-empty">Aramanızla eşleşen reçete bulunamadı.</div>
              : <>
                <div className="manufacturing-table-wrap manufacturing-recipe-table-wrap">
                  <table aria-label="Ürün reçeteleri">
                    <thead><tr><th>Reçete</th><th>Mamul</th><th>Çıktı</th><th>İçerik</th><th>Durum / kullanım</th><th>İşlemler</th></tr></thead>
                    <tbody>{pagedBoms.map(bom => <tr key={bom.id}>
                      <td><b>{bom.code}</b><small>{bom.name}</small></td>
                      <td>{bom.productName}</td>
                      <td>{bom.outputQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</td>
                      <td>{bom.lines.length} bileşen · {bom.operations.length} operasyon</td>
                      <td><span className={`manufacturing-status ${bom.isActive ? 'manufacturing-completed' : 'manufacturing-cancelled'}`}>{bom.isActive ? 'Aktif' : 'Pasif'}</span><small>{bom.orderCount} üretim emri</small></td>
                      <td><div className="manufacturing-recipe-actions">
                        <button type="button" className="secondary small-button" disabled={busy} onClick={() => onEdit(bom)}><Pencil size={13} /> Düzenle</button>
                        <button type="button" className="secondary small-button" disabled={busy} onClick={() => onChangeState(bom)}>{bom.isActive ? 'Pasife al' : 'Etkinleştir'}</button>
                        <button type="button" className="secondary small-button manufacturing-recipe-delete" disabled={busy || bom.orderCount > 0} title={bom.orderCount > 0 ? 'Üretim emri referansı olan reçeteler silinemez.' : ''} aria-label={`${bom.code} reçetesini sil`} onClick={() => onDelete(bom)}><Trash2 size={13} /> Sil</button>
                      </div></td>
                    </tr>)}</tbody>
                  </table>
                </div>
                <div className="manufacturing-recipe-pagination">
                  <span>{filteredBoms.length.toLocaleString('tr-TR')} reçete · Sayfa {page}/{pageCount}</span>
                  <div><button type="button" className="secondary small-button" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Önceki</button><button type="button" className="secondary small-button" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Sonraki</button></div>
                </div>
              </>}
      </section>
    </section>
  )
}
