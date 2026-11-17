import { useState } from "react";
import { Database, Play, Plus, Trash2 } from "lucide-react";
import BindingInput, { type BindingSuggestion } from "./BindingInput";
import SqlQueryEditor, { type SqlSchemaTable } from "./SqlQueryEditor";
import { bindingPath } from "./pageBindings";

export type QueryParameterType = "text" | "int" | "decimal" | "date" | "bool" | "guid";
export type PageQueryParameter = { name: string; binding: string; type: QueryParameterType };
export type QueryKind = "read" | "insert" | "update" | "delete";
export type PageQuery = { id: string; name: string; kind: QueryKind; sql: string; parameters: PageQueryParameter[]; runOn: "load" | "manual" };
export type QueryPreview = { columns: { code: string; label: string; dataType: string }[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean };

export const queryKindLabels: Record<QueryKind, string> = { read: "Okuma", insert: "Ekle", update: "Güncelle", delete: "Sil" };
export const isWriteKind = (kind: QueryKind) => kind !== "read";
export const MAX_QUERIES = 20;
export const MAX_QUERY_PARAMETERS = 20;
export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export const RESERVED_NAMES = ["kullanici", "bugun", "sayilar"];
/** Çalışma zamanı kapsamında JavaScript nesne iç anahtarlarıyla çakışan adlar (sunucudaki ObjectKeyNames). */
export const OBJECT_KEY_NAMES = ["__proto__", "constructor", "prototype"];
const WRITE_CONFIRM = "Bu sorgu verileri değiştirecek. Devam edilsin mi?";
const parameterTypes: [QueryParameterType, string][] = [["text", "Metin"], ["int", "Tam sayı"], ["decimal", "Ondalık"], ["date", "Tarih"], ["bool", "Evet/Hayır"], ["guid", "Kimlik (GUID)"]];
const runOnLabels: Record<PageQuery["runOn"], string> = { load: "Açılışta + değişince", manual: "Elle" };

/** Sorgu/bileşen adı kuralları (sunucudaki şemayla aynı); sorun yoksa null. */
export function nameProblem(value: string, taken: string[]): string | null {
  if (!NAME_PATTERN.test(value)) return "Ad harf veya _ ile başlamalı; yalnız İngilizce harf, rakam ve _ içermelidir.";
  if (RESERVED_NAMES.includes(value.toLowerCase()) || OBJECT_KEY_NAMES.includes(value.toLowerCase())) return `“${value}” ayrılmış bir addır.`;
  if (taken.includes(value.toLowerCase())) return "Bu ad sayfada başka bir sorgu ya da bileşende kullanılıyor.";
  return null;
}

const isParameterChar = (char: string) => /[A-Za-z0-9_@#$]/.test(char);
/**
 * SQL metninde geçen @parametre adları (ilk geçiş sırası, büyük/küçük harf duyarsız tekil). Sunucudaki
 * TenantCustomPageQueries.SqlParameterNames ile aynı kurallar: dizgiler, [köşeli]/"tırnaklı" adlar, yorumlar
 * ve @@sistem değişkenleri sayılmaz.
 */
export function sqlParameterNames(sql: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < sql.length; index++) {
    const current = sql[index];
    if (current === "'" || current === "[" || current === "\"") {
      const closing = current === "[" ? "]" : current;
      index++;
      while (index < sql.length) {
        if (sql[index] === closing && sql[index + 1] === closing) { index += 2; continue; }
        if (sql[index] === closing) break;
        index++;
      }
      continue;
    }
    if (current === "-" && sql[index + 1] === "-") { while (index < sql.length && sql[index] !== "\n") index++; continue; }
    if (current === "/" && sql[index + 1] === "*") { const end = sql.indexOf("*/", index + 2); index = end < 0 ? sql.length : end + 1; continue; }
    if (current !== "@") continue;
    const start = index + 1;
    if (sql[start] === "@") { index = start; while (index + 1 < sql.length && isParameterChar(sql[index + 1])) index++; continue; }
    let stop = start;
    while (stop < sql.length && isParameterChar(sql[stop])) stop++;
    if (stop > start) {
      const name = sql.slice(start, stop);
      if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); names.push(name); }
    }
    index = stop - 1;
  }
  return names;
}

/**
 * Parametre listesini SQL'deki adlara eşitler; var olan parametrelerin bağlaması ve türü korunur. Yazarken adı geçici
 * olarak bozulan (ör. "@tarih" → "@tari" → "@tarih") parametreler için `remembered` önceki ayarı verir.
 */
export function syncParameters(sql: string, existing: PageQueryParameter[], remembered: (name: string) => PageQueryParameter | undefined, defaultBinding: (name: string) => string): PageQueryParameter[] {
  return sqlParameterNames(sql).slice(0, MAX_QUERY_PARAMETERS).map((name) => {
    const previous = existing.find((parameter) => parameter.name.toLowerCase() === name.toLowerCase()) ?? remembered(name);
    return previous ? { ...previous, name } : { name, binding: defaultBinding(name), type: "text" };
  });
}

const sqlStatements: Record<QueryKind, string> = {
  read: "Yalnız tek bir SELECT ya da WITH sorgusu.",
  insert: "Yalnız tek bir INSERT deyimi.",
  update: "Yalnız tek bir UPDATE deyimi; WHERE koşulu gerekir.",
  delete: "Yalnız tek bir DELETE deyimi; WHERE koşulu gerekir.",
};
const cellText = (value: unknown) => value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

type Props = {
  queries: PageQuery[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  editable: boolean;
  readOnlyReason: string | null;
  schema: SqlSchemaTable[];
  suggestions: BindingSuggestion[];
  previews: Record<string, QueryPreview>;
  previewBlockedReason: string | null;
  takenNames: (exceptQueryId: string) => string[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<PageQuery>, coalesceKey?: string) => void;
  onRemove: (id: string) => void;
  /** Yazma türünde `confirmWrite` true gönderilir; etkilenen kayıt sayısı döner (okumada null). */
  onPreview: (id: string, confirmWrite: boolean) => Promise<number | null>;
};

/** Tasarımcının "Sorgular" sekmesi: sorgu kartları, seçili sorgunun SQL'i, parametreleri ve önizlemesi. */
export default function QueriesPanel({ queries, selectedId, onSelect, editable, readOnlyReason, schema, suggestions, previews, previewBlockedReason, takenNames, onAdd, onUpdate, onRemove, onPreview }: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [affected, setAffected] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const selected = queries.find((query) => query.id === selectedId) ?? null;
  const write = !!selected && isWriteKind(selected.kind);
  const preview = selected ? previews[selected.id] : undefined;
  // Sorgu kendi sonucuna bağlanamaz (döngü); kendi adıyla başlayan öneriler gösterilmez.
  const ownSuggestions = selected ? suggestions.filter((item) => !item.path.toLowerCase().startsWith(`${selected.name.toLowerCase()}.`)) : suggestions;
  const run = async (query: PageQuery) => {
    const id = query.id;
    const writing = isWriteKind(query.kind);
    if (writing && !window.confirm(WRITE_CONFIRM)) return;
    setRunning(id);
    setErrors((current) => { const next = { ...current }; delete next[id]; return next; });
    setAffected((current) => { const next = { ...current }; delete next[id]; return next; });
    try {
      const rows = await onPreview(id, writing);
      if (rows !== null) setAffected((current) => ({ ...current, [id]: rows }));
    }
    catch (error) { setErrors((current) => ({ ...current, [id]: (error as Error).message })); }
    finally { setRunning(null); }
  };

  return <div className="pd-left-body pd-query-panel">
    {readOnlyReason && <p className="pd-query-readonly">{readOnlyReason}</p>}
    {queries.length === 0 ? <p className="pd-empty-note">Bu sayfada henüz sorgu yok. Okuma sorgularının sonuçları ızgara, gösterge ve metinlere bağlanır; Ekle, Güncelle ve Sil sorguları düğmeyle çalışır.</p>
      : <ul className="pd-query-list">{queries.map((query) => {
        const result = previews[query.id];
        return <li key={query.id}>
          <button type="button" className={`pd-query-card ${query.id === selectedId ? "is-selected" : ""}`} aria-pressed={query.id === selectedId} onClick={() => onSelect(query.id)}>
            <span className="pd-query-card-head"><Database size={13}/><b>{query.name || "Adsız sorgu"}</b><span className={`pd-query-kind${isWriteKind(query.kind) ? " is-write" : ""}`}>{queryKindLabels[query.kind]}</span></span>
            <small>{isWriteKind(query.kind) ? "Yalnız düğmeyle" : runOnLabels[query.runOn]}{result ? ` · ${result.rowCount.toLocaleString("tr-TR")} satır` : ""}</small>
          </button>
        </li>;
      })}</ul>}
    <button type="button" className="pd-button small pd-query-add" disabled={!editable || queries.length >= MAX_QUERIES} onClick={onAdd}
      title={queries.length >= MAX_QUERIES ? `Bir sayfada en fazla ${MAX_QUERIES} sorgu olabilir.` : undefined}><Plus size={13}/>Sorgu ekle</button>

    {selected && <section className="pd-query-detail" aria-label={`${selected.name} sorgusu`}>
      <fieldset className="pd-fieldset" disabled={!editable}>
        <div className="pd-field-row pd-query-meta">
          <label className="pd-field">Ad<input className="pd-query-name" value={selected.name} maxLength={64} spellCheck={false}
            onChange={(event) => onUpdate(selected.id, { name: event.target.value }, `query:${selected.id}:name`)}/></label>
          {write ? <div className="pd-field">Çalışma<small className="pd-query-manual">Yalnız düğmeyle çalışır.</small></div>
            : <label className="pd-field">Çalışma<select value={selected.runOn} onChange={(event) => onUpdate(selected.id, { runOn: event.target.value as PageQuery["runOn"] })}>
              <option value="load">{runOnLabels.load}</option><option value="manual">{runOnLabels.manual}</option>
            </select></label>}
        </div>
        <div className="pd-field">Tür<div className="pd-segment pd-query-kinds" role="group" aria-label="Sorgu türü">
          {(Object.keys(queryKindLabels) as QueryKind[]).map((kind) => <button type="button" key={kind} aria-pressed={selected.kind === kind} className={`${selected.kind === kind ? "active" : ""}${isWriteKind(kind) ? " is-write" : ""}`}
            onClick={() => { if (kind !== selected.kind) onUpdate(selected.id, isWriteKind(kind) ? { kind, runOn: "manual" } : { kind }); }}>{queryKindLabels[kind]}</button>)}
        </div></div>
        {nameProblem(selected.name, takenNames(selected.id)) && <small className="pd-query-warning">{nameProblem(selected.name, takenNames(selected.id))}</small>}
      </fieldset>
      <div className="pd-field">SQL<small>{sqlStatements[selected.kind]} Değerleri <code>@ad</code> parametreleriyle verin.</small>
        <SqlQueryEditor queryId={selected.id} value={selected.sql} readOnly={!editable} schema={schema}
          onChange={(sql) => onUpdate(selected.id, { sql }, `query:${selected.id}:sql`)}/>
      </div>
      <div className="pd-field">Parametreler<small>Adlar SQL'deki <code>@ad</code> ifadelerinden otomatik gelir.</small>
        {selected.parameters.length === 0 ? <p className="pd-query-muted">Bu sorguda parametre yok.</p>
          : <table className="pd-query-params"><thead><tr><th scope="col">Ad</th><th scope="col">Bağlama</th><th scope="col">Tür</th></tr></thead><tbody>
            {selected.parameters.map((parameter, index) => {
              const update = (patch: Partial<PageQueryParameter>, key?: string) => onUpdate(selected.id, { parameters: selected.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }, key);
              return <tr key={parameter.name}>
                <td><code>@{parameter.name}</code></td>
                <td><BindingInput value={parameter.binding} suggestions={ownSuggestions} replaceOnInsert disabled={!editable} invalid={!bindingPath(parameter.binding)} placeholder="{{girisAdi.value}}"
                  ariaLabel={`@${parameter.name} bağlaması`} onChange={(binding) => update({ binding }, `query:${selected.id}:param:${parameter.name}`)}/></td>
                <td><select value={parameter.type} disabled={!editable} aria-label={`@${parameter.name} türü`} onChange={(event) => update({ type: event.target.value as QueryParameterType })}>
                  {parameterTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></td>
              </tr>;
            })}
          </tbody></table>}
        {selected.parameters.some((parameter) => !bindingPath(parameter.binding)) && <small className="pd-query-warning">Her parametre tek bir <code>{"{{…}}"}</code> ifadesine bağlanmalıdır.</small>}
      </div>
      <div className="pd-query-actions">
        <button type="button" className="pd-button small primary" disabled={!editable || !!previewBlockedReason || running !== null} title={previewBlockedReason ?? undefined}
          onClick={() => void run(selected)}><Play size={13}/>{running === selected.id ? "Çalışıyor…" : write ? "Gerçekten çalıştır…" : "Çalıştır ve önizle"}</button>
        <button type="button" className="pd-button small danger" disabled={!editable} onClick={() => onRemove(selected.id)}><Trash2 size={13}/>Sorguyu sil</button>
      </div>
      {previewBlockedReason && editable && <small className="pd-query-muted">{previewBlockedReason}</small>}
      {errors[selected.id] && <div className="pd-query-error" role="alert">{errors[selected.id]}</div>}
      {write && affected[selected.id] !== undefined && <div className="pd-query-affected" role="status">{affected[selected.id].toLocaleString("tr-TR")} kayıt etkilendi.</div>}
      {!write && preview && <div className="pd-query-result">
        <small>{preview.rowCount.toLocaleString("tr-TR")} satır{preview.rowCount > 20 ? " · ilk 20 satır gösteriliyor" : ""}{preview.truncated ? " · sonuç 5.000 satırda kesildi" : ""}</small>
        {preview.columns.length === 0 ? <p className="pd-query-muted">Sorgu sütun döndürmedi.</p>
          : <div className="pd-query-result-scroll"><table><thead><tr>{preview.columns.map((column) => <th scope="col" key={column.code}>{column.label || column.code}</th>)}</tr></thead>
            <tbody>{preview.rows.length === 0 ? <tr><td colSpan={preview.columns.length}>Kayıt yok.</td></tr>
              : preview.rows.slice(0, 20).map((row, rowIndex) => <tr key={rowIndex}>{preview.columns.map((column) => <td key={column.code}>{cellText(row[column.code])}</td>)}</tr>)}</tbody></table></div>}
      </div>}
    </section>}
  </div>;
}
