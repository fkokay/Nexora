import { ArrowDown, ArrowUp, Edit2, Plus, Trash2 } from 'lucide-react'
import type { Entry } from '../types'

type Props = {
  entries: Entry[]
  selectedId: string
  admin: boolean
  busy: boolean
  editing: boolean
  canAdd: boolean
  onSelect: (id: string) => void
  onMove: (index: number, offset: number) => void
  onEdit: (entry: Entry) => void
  onRemove: (entry: Entry) => void
  onAdd: () => void
}

export function CustomMenuList({ entries, selectedId, admin, busy, editing, canAdd, onSelect, onMove, onEdit, onRemove, onAdd }: Props) {
  return <section className="panel custom-menu-list"><div className="panel-heading"><div><h3>Çalışma alanı menüsü</h3><p>{entries.length ? 'Sıra, bütün tenant kullanıcılarına uygulanır.' : 'Henüz özel menü öğesi eklenmedi.'}</p></div></div>
    {entries.map((entry, index) => <div className={`custom-menu-entry ${selectedId === entry.id ? 'is-selected' : ''}`} key={entry.id}><button className="custom-menu-entry-select" type="button" aria-pressed={selectedId === entry.id} onClick={() => onSelect(entry.id)}><span className="custom-menu-entry-index">{String(index + 1).padStart(2, '0')}</span><span className="custom-menu-entry-copy"><b>{entry.label}</b><small>{entry.targetLabel} · <code>{entry.code}</code></small></span></button>{admin && <div className="custom-menu-entry-actions"><button type="button" className="icon-button" disabled={busy || index === 0} onClick={() => onMove(index, -1)} aria-label="Yukarı taşı"><ArrowUp size={16}/></button><button type="button" className="icon-button" disabled={busy || index === entries.length - 1} onClick={() => onMove(index, 1)} aria-label="Aşağı taşı"><ArrowDown size={16}/></button><button type="button" className="icon-button" disabled={busy} onClick={() => onEdit(entry)} aria-label="Düzenle"><Edit2 size={16}/></button><button type="button" className="icon-button danger" disabled={busy} onClick={() => onRemove(entry)} aria-label="Sil"><Trash2 size={16}/></button></div>}</div>)}
    {admin && canAdd && !editing && <button type="button" className="custom-menu-add-row" onClick={onAdd}><Plus size={16}/> Menü öğesi oluştur</button>}
  </section>
}
