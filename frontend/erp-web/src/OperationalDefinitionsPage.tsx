import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Plus, RefreshCw, X } from 'lucide-react'
import { authenticatedFetch } from './authApi'

type DefinitionKind = 'Workplace' | 'Branch' | 'Factory'
type Definition = { id: string; code: string; name: string; kind: DefinitionKind; isActive: boolean; rowVersion: string }

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, token, { ...init, headers: { Authorization: 'Bearer ' + token, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } })
  if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string; title?: string } | null; throw new Error(body?.error ?? body?.title ?? 'İstek başarısız (' + response.status + ')') }
  return response.json() as Promise<T>
}

export default function OperationalDefinitionsPage({ token, locale, onNavigate }: { token: string; locale: 'tr' | 'en'; onNavigate: (page: string) => void }) {
  const en = locale === 'en'
  const tx = (tr: string, english: string) => en ? english : tr
  const [rows, setRows] = useState<Definition[]>([])
  const [kind, setKind] = useState<DefinitionKind>('Workplace')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Definition | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() { setLoading(true); try { setRows(await request<Definition[]>(token, '/api/definitions/workplaces/')); setError('') } catch (e) { setError((e as Error).message) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [token])
  function clearForm() { setEditing(null); setCode(''); setName(''); setKind('Workplace') }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const body = { code, name, kind, ...(editing ? { rowVersion: editing.rowVersion } : {}) }
      await request(token, editing ? '/api/definitions/workplaces/' + editing.id : '/api/definitions/workplaces/', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) })
      clearForm(); setNotice(tx('Tanım kaydedildi.', 'Definition saved.')); await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function toggle(row: Definition) {
    setBusy(true); setError('')
    try { await request(token, '/api/definitions/workplaces/' + row.id + '/status', { method: 'POST', body: JSON.stringify({ isActive: !row.isActive }) }); await load() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const kindName = (value: DefinitionKind) => value === 'Workplace' ? tx('İş yeri', 'Workplace') : value === 'Branch' ? tx('Şube', 'Branch') : tx('Fabrika', 'Factory')

  return <><div className="page-heading"><div><p className="eyebrow">{tx('FİRMA TANIMLARI', 'COMPANY DEFINITIONS')}</p><h1>{tx('İş yeri, şube ve fabrika', 'Workplaces, branches and factories')}</h1><p className="muted">{tx('Firma lokasyonlarını tanımlayın. Depolar, stok işlemleri ve raf/konum bağlantılarıyla birlikte ayrı depo kayıtları olarak yönetilir.', 'Define company locations. Warehouses remain separate records managed with inventory and storage locations.')}</p></div><button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{tx('Yenile', 'Refresh')}</button></div>
    {error && <div className="alert inline-alert" role="alert">{error}<button type="button" onClick={() => setError('')}><X size={15}/></button></div>}
    {notice && <div className="notice">{notice}<button type="button" onClick={() => setNotice('')}><X size={15}/></button></div>}
    <section className="panel"><div className="panel-heading"><div><h2>{tx('Organizasyon tanımları', 'Organization definitions')}</h2><p>{tx('İş yeri, şube ve fabrikalar; personel iş yeri atamaları ve çalışma takvimlerinde kullanılabilir.', 'Workplaces, branches and factories can be used in employee assignments and work calendars.')}</p></div></div>
      <form className="collection-form" onSubmit={save}><div className="form-two"><label>{tx('Tanım türü', 'Definition type')}<select value={kind} onChange={event => setKind(event.target.value as DefinitionKind)}><option value="Workplace">{tx('İş yeri', 'Workplace')}</option><option value="Branch">{tx('Şube', 'Branch')}</option><option value="Factory">{tx('Fabrika', 'Factory')}</option></select></label><label>{tx('Kod', 'Code')}<input value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={40} required/></label><label>{tx('Ad', 'Name')}<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required/></label></div><div className="modal-foot"><span>{editing ? tx('Seçili tanımı düzenleyin.', 'Edit the selected definition.') : tx('Yeni tanım ekleyin.', 'Add a new definition.')}</span><div>{editing && <button type="button" className="secondary" onClick={clearForm}>{tx('Vazgeç', 'Cancel')}</button>}<button className="primary" disabled={busy}><Plus size={16}/>{busy ? tx('Kaydediliyor…', 'Saving…') : editing ? tx('Değişiklikleri kaydet', 'Save changes') : tx('Tanım ekle', 'Add definition')}</button></div></div></form>
      <div className="ledger-list"><table className="customer-table"><thead><tr><th>{tx('Tür', 'Type')}</th><th>{tx('Kod', 'Code')}</th><th>{tx('Ad', 'Name')}</th><th>{tx('Durum', 'Status')}</th><th>{tx('İşlemler', 'Actions')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{kindName(row.kind)}</td><td><b>{row.code}</b></td><td>{row.name}</td><td>{row.isActive ? tx('Etkin', 'Active') : tx('Devre dışı', 'Inactive')}</td><td><button type="button" className="row-action" disabled={busy} onClick={() => { setEditing(row); setKind(row.kind); setCode(row.code); setName(row.name) }}>{tx('Düzenle', 'Edit')}</button><button type="button" className="row-action" disabled={busy} onClick={() => void toggle(row)}>{row.isActive ? tx('Devre dışı bırak', 'Deactivate') : tx('Etkinleştir', 'Activate')}</button></td></tr>)}{!loading && rows.length === 0 && <tr><td colSpan={5} className="table-empty">{tx('Henüz tanım yok.', 'No definitions yet.')}</td></tr>}</tbody></table></div>
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>{tx('Depo tanımları', 'Warehouse definitions')}</h2><p>{tx('Stok bakiyesi, depo transferleri ve raf/konum yönetimi için depoları açın ve düzenleyin.', 'Create and edit warehouses for inventory, transfers, and storage locations.')}</p></div><button className="primary" onClick={() => onNavigate('inventory-warehouses')}>{tx('Depo tanımlarını aç', 'Open warehouse definitions')}<ArrowRight size={15}/></button></div></section>
    <section className="panel"><div className="panel-heading"><div><h2>{tx('Adres tanımları', 'Address definitions')}</h2><p>{tx('Cari adreslerinde kullanılan il ve ilçe kayıtlarını yönetin.', 'Manage provinces and districts used in customer and supplier addresses.')}</p></div><button className="secondary" onClick={() => onNavigate('address-definitions')}>{tx('Adres tanımlarını aç', 'Open address definitions')}<ArrowRight size={15}/></button></div></section>
  </>
}
