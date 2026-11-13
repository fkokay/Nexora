import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Field } from './DocumentShell'

export type FieldDataType = 'Text' | 'Decimal' | 'Date' | 'Boolean'
export type FieldDefinition = { id: string; code: string; label: string; dataType: FieldDataType; maxLength: number; version: number; isRequired: boolean; isActive: boolean }
export type FieldValue = { definitionId: string; code: string; label: string; dataType: FieldDataType; maxLength: number; definitionVersion: number; isRequired: boolean; value: string }
type ValueRevision = { id: string; definitionId: string; previousValue: string | null; newValue: string | null; definitionVersion: number; createdAt: string }
type DefinitionRevision = { definitionId: string; version: number; label: string; dataType: FieldDataType; maxLength: number; isRequired: boolean; isActive: boolean; changeKind?: string; createdAt: string }

const typeLabel: Record<FieldDataType, string> = { Text: 'Metin', Decimal: 'Ondalık sayı', Date: 'Tarih', Boolean: 'Evet/Hayır' }
const dateTime = (iso: string) => new Date(iso).toLocaleString('tr-TR')
const display = (field: { dataType: FieldDataType }, value: string | null) =>
  !value ? '—' : field.dataType === 'Boolean' ? (value === 'true' ? 'Evet' : 'Hayır') : value

function FieldInput({ field, value, onChange, disabled }: { field: { code: string; label: string; dataType: FieldDataType; maxLength: number; isRequired: boolean }; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  if (field.dataType === 'Boolean') return <select required={field.isRequired} disabled={disabled} value={value} onChange={e => onChange(e.target.value)}>
    <option value="">Seçin</option><option value="true">Evet</option><option value="false">Hayır</option>
  </select>
  return <input type={field.dataType === 'Decimal' ? 'number' : field.dataType === 'Date' ? 'date' : 'text'} step={field.dataType === 'Decimal' ? 'any' : undefined}
    maxLength={field.dataType === 'Text' ? field.maxLength : undefined} required={field.isRequired} disabled={disabled} value={value} onChange={e => onChange(e.target.value)}/>
}

/** Yeni belge formunda: aktif alan tanımları için giriş alanları. */
export function CustomFieldInputs({ definitions, values, onChange }: { definitions: FieldDefinition[]; values: Record<string, string>; onChange: (values: Record<string, string>) => void }) {
  const active = definitions.filter(definition => definition.isActive)
  if (!active.length) return null
  return <div className="doc-grid">{active.map(definition => <Field key={definition.id} label={`${definition.label}${definition.isRequired ? ' *' : ''}`}>
    <FieldInput field={definition} value={values[definition.code] ?? ''} onChange={value => onChange({ ...values, [definition.code]: value })}/>
  </Field>)}</div>
}

export function useFieldDefinitions(token: string, basePath: string, enabled = true) {
  const [definitions, setDefinitions] = useState<FieldDefinition[]>([])
  useEffect(() => {
    if (!enabled) return
    let active = true
    api<FieldDefinition[]>(`${basePath}/custom-fields`, token).then(items => { if (active) setDefinitions(items) }).catch(() => { if (active) setDefinitions([]) })
    return () => { active = false }
  }, [token, basePath, enabled])
  return definitions
}

type ValuesProps = {
  token: string
  basePath: string
  documentId: string
  fields: FieldValue[]
  editable: boolean
  lockedText: string
  valueHistory?: boolean
  onSaved: (fields: FieldValue[]) => void
  onError: (message: string) => void
  onNotice: (message: string) => void
}

/** Kayıtlı belgede özel alan değerleri: düzenleme, değer geçmişi ve geri yükleme. */
export function CustomFieldValues({ token, basePath, documentId, fields, editable, lockedText, valueHistory = true, onSaved, onError, onNotice }: ValuesProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [historyField, setHistoryField] = useState<FieldValue | null>(null)
  const [history, setHistory] = useState<ValueRevision[]>([])
  useEffect(() => { setValues(Object.fromEntries(fields.map(field => [field.code, field.value ?? '']))) }, [fields])

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true)
    try { onSaved(await api<FieldValue[]>(`${basePath}/${documentId}/custom-fields`, token, { method: 'PUT', body: JSON.stringify({ values }) })); onNotice('Özel alanlar kaydedildi.') }
    catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }
  async function openHistory(field: FieldValue) {
    setHistoryField(field); setHistory([])
    try { setHistory(await api<ValueRevision[]>(`${basePath}/${documentId}/custom-fields/${field.definitionId}/history`, token)) }
    catch (e) { onError((e as Error).message) }
  }
  async function restore(revision: ValueRevision) {
    if (!historyField || !window.confirm(`${historyField.label} alanı bu kayıttan önceki değere döndürülsün mü? Bu işlem yeni bir geçmiş kaydı oluşturur.`)) return
    setBusy(true)
    try {
      await api(`${basePath}/${documentId}/custom-fields/${revision.definitionId}/history/${revision.id}/restore`, token, { method: 'POST', body: JSON.stringify({ confirmation: true }) })
      onSaved(await api<FieldValue[]>(`${basePath}/${documentId}/custom-fields`, token))
      await openHistory(historyField); onNotice('Alan değeri geçmişten geri yüklendi.')
    } catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }

  if (!fields.length) return <div className="doc-card"><p className="muted">Bu belge türü için özel alan tanımlanmamış.</p></div>
  return <div className="doc-stack">
    <form className="doc-card" onSubmit={save}>
      <div className="doc-grid">{fields.map(field => <div key={field.definitionId} className="doc-field">
        <span>{field.label}{field.isRequired ? ' *' : ''} <em>· {typeLabel[field.dataType]}</em></span>
        {editable ? <FieldInput field={field} value={values[field.code] ?? ''} disabled={busy} onChange={value => setValues(current => ({ ...current, [field.code]: value }))}/> : <span className="value">{display(field, field.value)}</span>}
        {valueHistory && <span><button type="button" className="doc-text-button" style={{ padding: 0 }} onClick={() => void openHistory(field)}>Değer geçmişi</button></span>}
      </div>)}</div>
      <div className="doc-form-foot"><span>{editable ? 'Değişiklikler sürüm geçmişiyle kaydedilir.' : lockedText}</span>{editable && <button className="primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Değerleri kaydet'}</button>}</div>
    </form>
    {historyField && <div className="doc-card">
      <div className="doc-section-title"><span>{historyField.label} · değer geçmişi</span><button className="doc-text-button" onClick={() => setHistoryField(null)}>Kapat</button></div>
      <div className="doc-row-list">
        {history.length === 0 && <p className="muted">Bu alan için değişiklik geçmişi yok.</p>}
        {history.map(revision => <div className="doc-row-item" key={revision.id}>
          <div><b>{display(historyField, revision.previousValue)} → {display(historyField, revision.newValue)}</b><small>{dateTime(revision.createdAt)} · tanım v{revision.definitionVersion}</small></div>
          {editable && <button className="doc-text-button" disabled={busy} onClick={() => void restore(revision)}>Öncekine döndür</button>}
        </div>)}
      </div>
    </div>}
  </div>
}

type CatalogProps = {
  token: string
  basePath: string
  title: string
  /** 'restore': sürüm geçmişi ve geri yükleme; 'view': yalnızca geçmiş; 'none': geçmiş yok. */
  history?: 'restore' | 'view' | 'none'
  onChanged?: () => void
  onError: (message: string) => void
  onNotice: (message: string) => void
}

/** Firma yöneticisi için alan tanımı kataloğu. */
export function CustomFieldCatalog({ token, basePath, title, history = 'restore', onChanged, onError, onNotice }: CatalogProps) {
  const [open, setOpen] = useState(false)
  const [definitions, setDefinitions] = useState<FieldDefinition[]>([])
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(''), [label, setLabel] = useState(''), [dataType, setDataType] = useState<FieldDataType>('Text'), [maxLength, setMaxLength] = useState('200'), [required, setRequired] = useState(false)
  const [editing, setEditing] = useState<FieldDefinition | null>(null)
  const [editLabel, setEditLabel] = useState(''), [editMaxLength, setEditMaxLength] = useState('200'), [editRequired, setEditRequired] = useState(false)
  const [historyOf, setHistoryOf] = useState<FieldDefinition | null>(null)
  const [revisions, setRevisions] = useState<DefinitionRevision[]>([])

  async function reload() { setDefinitions(await api<FieldDefinition[]>(`${basePath}/custom-fields`, token)) }
  useEffect(() => { if (open) void reload().catch(e => onError((e as Error).message)) }, [open, basePath, token])

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    try { await action(); await reload(); onChanged?.(); onNotice(message) }
    catch (e) { onError((e as Error).message) } finally { setBusy(false) }
  }
  function create(event: React.FormEvent) {
    event.preventDefault()
    void run(async () => {
      await api(`${basePath}/custom-fields`, token, { method: 'POST', body: JSON.stringify({ code, label, dataType, maxLength: Number(maxLength), isRequired: required }) })
      setCode(''); setLabel(''); setDataType('Text'); setMaxLength('200'); setRequired(false)
    }, 'Özel alan tanımlandı.')
  }
  function beginEdit(definition: FieldDefinition) { setEditing(definition); setEditLabel(definition.label); setEditMaxLength(String(definition.maxLength || 200)); setEditRequired(definition.isRequired) }
  function saveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    const target = editing
    void run(async () => {
      await api(`${basePath}/custom-fields/${target.id}`, token, { method: 'PUT', body: JSON.stringify({ label: editLabel, maxLength: target.dataType === 'Text' ? Number(editMaxLength) : target.maxLength, isRequired: editRequired }) })
      setEditing(null)
    }, 'Alan tanımı yeni sürüm olarak kaydedildi.')
  }
  function deactivate(definition: FieldDefinition) {
    if (!window.confirm(`${definition.label} alanı yeni belgeler için devre dışı bırakılsın mı? Mevcut değerler korunur.`)) return
    void run(() => api(`${basePath}/custom-fields/${definition.id}`, token, { method: 'DELETE' }), 'Alan devre dışı bırakıldı; değer geçmişi korundu.')
  }
  async function openHistory(definition: FieldDefinition) {
    setHistoryOf(definition); setRevisions([])
    try { setRevisions(await api<DefinitionRevision[]>(`${basePath}/custom-fields/${definition.id}/history`, token)) }
    catch (e) { onError((e as Error).message) }
  }
  function restore(revision: DefinitionRevision) {
    if (!historyOf || !window.confirm(`v${revision.version} alan tanımı yeni sürüm olarak geri yüklensin mi?`)) return
    const target = historyOf
    void run(async () => {
      await api(`${basePath}/custom-fields/${revision.definitionId}/restore`, token, { method: 'POST', body: JSON.stringify({ version: revision.version, confirmation: true }) })
      await openHistory(target)
    }, `v${revision.version} tanımı yeni sürüm olarak geri yüklendi.`)
  }

  return <div className="doc-card">
    <div className="doc-section-title" style={{ marginBottom: open ? 10 : 0 }}><span>{title} <small>· firma yöneticisi</small></span><button className="doc-text-button" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? 'Kapat' : 'Alan tanımlarını yönet'}</button></div>
    {open && <div className="doc-stack">
      <div className="doc-row-list">
        {definitions.length === 0 && <p className="muted">Henüz alan tanımlanmadı.</p>}
        {definitions.map(definition => editing?.id === definition.id
          ? <form className="doc-row-item" key={definition.id} onSubmit={saveEdit}>
            <div className="doc-grid" style={{ flex: 1 }}>
              <Field label="Ekran etiketi"><input value={editLabel} onChange={e => setEditLabel(e.target.value)} required maxLength={120}/></Field>
              {definition.dataType === 'Text' && <Field label="En fazla karakter"><input type="number" min="1" max="500" value={editMaxLength} onChange={e => setEditMaxLength(e.target.value)} required/></Field>}
              <label className="check-row"><input type="checkbox" checked={editRequired} onChange={e => setEditRequired(e.target.checked)}/> Zorunlu alan</label>
            </div>
            <span className="doc-inline-actions"><button type="button" className="secondary small-button" onClick={() => setEditing(null)}>Vazgeç</button><button className="primary small-button" disabled={busy}>Kaydet</button></span>
          </form>
          : <div className="doc-row-item" key={definition.id}>
            <div><b>{definition.label}{definition.isRequired ? ' *' : ''}</b><small>{definition.code} · {typeLabel[definition.dataType]}{definition.dataType === 'Text' ? ` (${definition.maxLength})` : ''} · v{definition.version}{definition.isActive ? '' : ' · devre dışı'}</small></div>
            <span className="doc-inline-actions">
              {history !== 'none' && <button className="doc-text-button" onClick={() => void openHistory(definition)}>Sürümler</button>}
              {definition.isActive && <button className="doc-text-button" disabled={busy} onClick={() => beginEdit(definition)}>Düzenle</button>}
              {definition.isActive && <button className="doc-text-button danger" disabled={busy} onClick={() => deactivate(definition)}>Devre dışı bırak</button>}
            </span>
          </div>)}
      </div>
      {historyOf && <div>
        <div className="doc-section-title"><span>{historyOf.label} · tanım sürümleri</span><button className="doc-text-button" onClick={() => setHistoryOf(null)}>Kapat</button></div>
        <div className="doc-row-list">
          {revisions.length === 0 && <p className="muted">Sürüm geçmişi yok.</p>}
          {revisions.map(revision => <div className="doc-row-item" key={`${revision.definitionId}-${revision.version}`}>
            <div><b>v{revision.version} · {revision.label}</b><small>{dateTime(revision.createdAt)} · {revision.isRequired ? 'zorunlu' : 'isteğe bağlı'}{revision.dataType === 'Text' ? ` · ${revision.maxLength} karakter` : ''}{revision.isActive ? '' : ' · devre dışı'}</small></div>
            {history === 'restore' && <button className="doc-text-button" disabled={busy} onClick={() => restore(revision)}>Bu sürüme dön</button>}
          </div>)}
        </div>
      </div>}
      <form onSubmit={create}>
        <div className="doc-section-title"><span>Yeni alan</span></div>
        <div className="doc-grid">
          <Field label="Alan kodu"><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required maxLength={40} placeholder="TESLIM_NOTU"/></Field>
          <Field label="Ekran etiketi"><input value={label} onChange={e => setLabel(e.target.value)} required maxLength={120} placeholder="Teslim notu"/></Field>
          <Field label="Veri türü"><select value={dataType} onChange={e => setDataType(e.target.value as FieldDataType)}>{(Object.keys(typeLabel) as FieldDataType[]).map(type => <option key={type} value={type}>{typeLabel[type]}</option>)}</select></Field>
          {dataType === 'Text' && <Field label="En fazla karakter"><input type="number" min="1" max="500" value={maxLength} onChange={e => setMaxLength(e.target.value)} required/></Field>}
          <label className="check-row"><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)}/> Zorunlu alan</label>
        </div>
        <div className="doc-form-foot"><span>Zorunlu alan, mevcut açık belgelerde değer yoksa reddedilebilir.</span><button className="primary" disabled={busy}>Alanı oluştur</button></div>
      </form>
    </div>}
  </div>
}
