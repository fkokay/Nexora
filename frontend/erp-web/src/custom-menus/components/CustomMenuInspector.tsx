import { Edit2 } from 'lucide-react'
import type { Entry } from '../types'

type Props = { entry: Entry | null; entryIndex: number; admin: boolean; onEdit: (entry: Entry) => void }

export function CustomMenuInspector({ entry, entryIndex, admin, onEdit }: Props) {
  return <aside className="panel custom-menu-inspector" aria-label="Seçili menü ayrıntısı">{entry ? <><div className="custom-menu-inspector-heading"><span className="custom-menu-entry-index">{String(entryIndex + 1).padStart(2, '0')}</span><div><p className="eyebrow">SEÇİLİ KAYIT</p><h3>{entry.label}</h3></div></div><dl><div><dt>Menü kodu</dt><dd><code>{entry.code}</code></dd></div><div><dt>Hedef sayfa</dt><dd>{entry.targetLabel}</dd></div><div><dt>Sayfa anahtarı</dt><dd><code>{entry.targetPage}</code></dd></div><div><dt>Sıralama</dt><dd>{entry.position + 1}</dd></div></dl>{admin&&<button className="secondary" type="button" onClick={() => onEdit(entry)}><Edit2 size={15}/> Menüyü düzenle</button>}</> : <p>Menü öğesi seçildiğinde ayrıntısı burada görünür.</p>}</aside>
}
