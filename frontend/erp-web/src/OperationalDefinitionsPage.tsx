import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { authenticatedFetch } from './authApi'
import './operational-definitions.css'
import { OperationalDefinitionsHeader } from './operational-definitions/components/OperationalDefinitionsHeader'
import { DefinitionForm } from './operational-definitions/components/DefinitionForm'
import { DefinitionGrid } from './operational-definitions/components/DefinitionGrid'
import { OperationalDefinitionLinks } from './operational-definitions/components/OperationalDefinitionLinks'
import type { Definition, DefinitionKind } from './operational-definitions/types'


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

  return <div className="operational-definitions-page"><OperationalDefinitionsHeader tx={tx} loading={loading} onRefresh={() => void load()} />
    {error && <div className="alert inline-alert" role="alert">{error}<button type="button" onClick={() => setError('')}><X size={15}/></button></div>}
    {notice && <div className="notice">{notice}<button type="button" onClick={() => setNotice('')}><X size={15}/></button></div>}
    <section className="panel op-definitions-panel"><div className="panel-heading"><div><h2>{tx('Organizasyon tanımları', 'Organization definitions')}</h2><p>{tx('İş yeri, şube ve fabrikalar; personel iş yeri atamaları ve çalışma takvimlerinde kullanılabilir.', 'Workplaces, branches and factories can be used in employee assignments and work calendars.')}</p></div></div>
      <DefinitionForm tx={tx} kind={kind} code={code} name={name} editing={editing} busy={busy} onSubmit={save} onKindChange={setKind} onCodeChange={setCode} onNameChange={setName} onCancel={clearForm} />
      <DefinitionGrid rows={rows} loading={loading} busy={busy} tx={tx} kindName={kindName} onEdit={row => { setEditing(row); setKind(row.kind); setCode(row.code); setName(row.name) }} onToggle={row => void toggle(row)} />
    </section>
    <OperationalDefinitionLinks tx={tx} onNavigate={onNavigate} />
  </div>
}
