import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "./authApi";
import "./custom-data-models.css";

type Field = { code: string; label: string; dataType: string; isRequired: boolean; maxLength?: number; placeholder?: string | null; options?: string[] | null };
type Entity = { id: string; code: string; name: string; description?: string | null; version: number; status: string; fields: Field[] };
type RecordItem = { id: string; entityId: string; values: Record<string, string | null>; fields?: Field[] };
type Capabilities = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canPublish: boolean; canDelete: boolean };
const blankField = (): Field => ({ code: `alan_${crypto.randomUUID().slice(0, 6)}`, label: "Yeni alan", dataType: "Text", isRequired: false, maxLength: 250 });

export default function CustomDataModelsPage({ token }: { token: string }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [recordPage, setRecordPage] = useState(1);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordLoading, setRecordLoading] = useState(false);
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [description, setDescription] = useState(""); const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await authenticatedFetch(path, token, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string } | null; throw new Error(body?.error || body?.detail || body?.title || `İstek başarısız (${response.status})`); }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }, [token]);
  const refresh = useCallback(async () => setEntities(await request<Entity[]>("/api/custom-data/entities")), [request]);
  const loadRecords = async (entity: Entity, page = 1) => {
    setRecordLoading(true);
    try {
      const result = await request<{ items: RecordItem[]; total: number; page: number }>(`/api/custom-data/entities/${encodeURIComponent(entity.code)}/records?page=${page}&pageSize=50`);
      setRecords(result.items); setRecordTotal(result.total); setRecordPage(result.page);
    } finally { setRecordLoading(false); }
  };
  useEffect(() => {
    void Promise.all([
      refresh(),
      request<Record<string, Capabilities>>("/api/low-code/capabilities").then((result) => setCapabilities(result.customData)),
    ]).catch((cause) => setError((cause as Error).message));
  }, [refresh, request]);
  const open = async (entity: Entity) => {
    setSelected(entity); setName(entity.name); setCode(entity.code); setDescription(entity.description || ""); setFields(entity.fields || []); setError(""); setNotice("");
    setEditingRecordId(null); setValues({});
    if (entity.status === "Published") {
      try { await loadRecords(entity); }
      catch (cause) { setRecords([]); setRecordTotal(0); setError((cause as Error).message); }
    } else { setRecords([]); setRecordTotal(0); setRecordPage(1); }
  };
  const newEntity = () => { setSelected(null); setName(""); setCode(""); setDescription(""); setFields([]); setRecords([]); setError(""); setNotice("Yeni mantıksal tablo taslağı oluşturun."); };
  const save = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const body = { name, description: description || null, fields };
      const entity = selected
        ? await request<Entity>(`/api/custom-data/entities/${selected.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await request<Entity>("/api/custom-data/entities", { method: "POST", body: JSON.stringify({ ...body, code }) });
      setSelected(entity); setName(entity.name); setCode(entity.code); setFields(entity.fields); setNotice("Taslak kaydedildi."); await refresh();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const publish = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try { const entity = await request<Entity>(`/api/custom-data/entities/${selected.id}/publish`, { method: "POST" }); await open(entity); setNotice("Veri modeli yayımlandı; kayıt girişi açıldı."); await refresh(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const createDraft = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try { const entity = await request<Entity>(`/api/custom-data/entities/${selected.id}/draft`, { method: "POST" }); await refresh(); await open(entity); setNotice("Yeni taslak sürümü oluşturuldu."); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const deleteDraft = async () => {
    if (!selected || selected.status !== "Draft" || !window.confirm("Bu taslak veri modeli silinsin mi?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/custom-data/entities/${selected.id}`, { method: "DELETE" });
      setSelected(null); setName(""); setCode(""); setDescription(""); setFields([]); setRecords([]); setValues({});
      await refresh(); setNotice("Taslak veri modeli silindi.");
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const addRecord = async () => {
    if (!selected) return;
    const missing = selected.fields.find((field) => field.isRequired && !(values[field.code] ?? "").trim());
    if (missing) { setError(`${missing.label} alanı zorunludur.`); return; }
    setBusy(true); setError("");
    try {
      const path = editingRecordId ? `/api/custom-data/records/${editingRecordId}` : `/api/custom-data/entities/${encodeURIComponent(selected.code)}/records`;
      await request(path, { method: editingRecordId ? "PUT" : "POST", body: JSON.stringify({ values }) });
      const wasEditing = !!editingRecordId; setValues({}); setEditingRecordId(null); await open(selected); setNotice(wasEditing ? "Kayıt güncellendi." : "Kayıt eklendi.");
    }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const deleteRecord = async (record: RecordItem) => {
    if (!selected || !window.confirm("Bu kayıt silinsin mi? Bu işlem geri alınamaz.")) return;
    setBusy(true); setError("");
    try { await request(`/api/custom-data/records/${record.id}`, { method: "DELETE" }); if (editingRecordId === record.id) { setEditingRecordId(null); setValues({}); } await open(selected); setNotice("Kayıt silindi."); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const canEditDefinition = selected ? capabilities?.canUpdate === true : capabilities?.canCreate === true;
  return <main className="custom-data-models">
    <header><div><small>LOW-CODE VERİ</small><h2>Veri modelleri</h2><p>Müşteriye özel kayıt türleri ve alanlar tanımlayın. Modeller tenant içinde saklanır.</p></div><button type="button" onClick={newEntity} disabled={!capabilities?.canCreate}>Yeni veri modeli</button></header>
    <div className="custom-data-models-layout"><aside><b>Modeller</b>{entities.length === 0 ? <p>Henüz veri modeli yok.</p> : entities.map((entity) => <button type="button" key={entity.id} className={selected?.id === entity.id ? "selected" : ""} onClick={() => void open(entity)}><span>{entity.name}<small>{entity.code} · v{entity.version}</small></span><i>{entity.status === "Published" ? "Yayında" : entity.status === "Draft" ? "Taslak" : "Arşiv"}</i></button>)}</aside>
      <section className="custom-data-model-editor"><div className="custom-data-model-heading"><div><small>{selected?.status === "Published" ? "YAYIMLANMIŞ MODEL" : "TASLAK MODEL"}</small><h3>{name || "Yeni model"}</h3></div><div className="custom-data-model-heading-actions">{selected?.status === "Published" && <button type="button" onClick={() => void createDraft()} disabled={busy || !capabilities?.canCreate}>Yeni sürüm taslağı</button>}{selected?.status === "Draft" && <button type="button" className="remove" onClick={() => void deleteDraft()} disabled={busy || !capabilities?.canDelete}>Taslağı sil</button>}</div></div>
        {error && <p role="alert" className="custom-data-model-error">{error}</p>}{notice && <p role="status" className="custom-data-model-notice">{notice}</p>}
        {selected?.status !== "Published" && !canEditDefinition && <p className="custom-data-model-readonly">Bu taslağı görüntüleyebilirsiniz; düzenleme izniniz yok.</p>}{selected?.status !== "Published" && canEditDefinition && <><div className="custom-data-model-fields"><label>Model adı<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Kod<input value={code} disabled={!!selected} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))} placeholder="proje-notlari" /></label><label className="wide">Açıklama<input value={description} onChange={(e) => setDescription(e.target.value)} /></label></div><div className="custom-data-field-list"><div><b>Alanlar</b><button type="button" onClick={() => setFields((current) => [...current, blankField()])}>Alan ekle</button></div>{fields.map((field, index) => <div className="custom-data-field-row" key={`${field.code}-${index}`}><label>Etiket<input value={field.label} onChange={(e) => setFields((all) => all.map((x, i) => i === index ? { ...x, label: e.target.value } : x))} /></label><label>Kod<input value={field.code} onChange={(e) => setFields((all) => all.map((x, i) => i === index ? { ...x, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-") } : x))} /></label><label>Tür<select value={field.dataType} onChange={(e) => setFields((all) => all.map((x, i) => i === index ? { ...x, dataType: e.target.value, options: e.target.value === "Choice" ? x.options ?? [] : null } : x))}>{["Text", "Decimal", "Date", "Boolean", "Choice"].map((type) => <option key={type}>{type}</option>)}</select></label><label className="required"><input type="checkbox" checked={field.isRequired} onChange={(e) => setFields((all) => all.map((x, i) => i === index ? { ...x, isRequired: e.target.checked } : x))} /> Zorunlu</label><button type="button" className="remove" onClick={() => setFields((all) => all.filter((_, i) => i !== index))} aria-label={`${field.label} alanını sil`}>Sil</button>{field.dataType === "Text" && <><label className="choice-options">Yer tutucu<input value={field.placeholder ?? ""} onChange={(e) => setFields((all) => all.map((x, i) => i === index ? { ...x, placeholder: e.target.value } : x))} placeholder="Alan için ipucu" /></label><label className="choice-options">En fazla karakter<input type="number" min="1" max="1000" value={field.maxLength ?? 250} onChange={(e) => setFields((all) => all.map((x, i) => i === index ? { ...x, maxLength: Number(e.target.value) || undefined } : x))} /></label></>}{field.dataType === "Choice" && <label className="choice-options">Seçenekler (virgülle ayırın)<input value={(field.options || []).join(", ")} onChange={(e) => setFields((all) => all.map((x, i) => i === index ? { ...x, options: e.target.value.split(",").map((option) => option.trim()).filter(Boolean) } : x))} placeholder="Yeni, Devam ediyor, Tamamlandı" /></label>}</div>)}</div><div className="custom-data-model-actions"><button type="button" onClick={() => void save()} disabled={busy || !canEditDefinition || !name.trim() || !code.trim()}>Taslağı kaydet</button>{selected && <button type="button" onClick={() => void publish()} disabled={busy || !capabilities?.canPublish || fields.length === 0}>Yayımla</button>}</div></>}
        {selected?.status === "Published" && <div className="custom-data-records">
          <h4>Kayıtlar <span>{recordTotal}</span></h4>
          {(capabilities?.canCreate || (editingRecordId && capabilities?.canUpdate)) && <div className="custom-data-record-form">
            {selected.fields.map((field) => <label key={field.code}>{field.label}
              {field.dataType === "Boolean" ? <select required={field.isRequired} value={values[field.code] ?? ""} onChange={(e) => setValues((current) => ({ ...current, [field.code]: e.target.value }))}><option value="">Seçin</option><option value="true">Evet</option><option value="false">Hayır</option></select>
                : field.dataType === "Choice" ? <select required={field.isRequired} value={values[field.code] ?? ""} onChange={(e) => setValues((current) => ({ ...current, [field.code]: e.target.value }))}><option value="">Seçin</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  : <input type={field.dataType === "Date" ? "date" : field.dataType === "Decimal" ? "number" : "text"} maxLength={field.dataType === "Text" ? field.maxLength : undefined} placeholder={field.placeholder ?? undefined} required={field.isRequired} value={values[field.code] ?? ""} onChange={(e) => setValues((current) => ({ ...current, [field.code]: e.target.value }))} />}
            </label>)}
            <div className="custom-data-record-form-actions">
              <button type="button" onClick={() => void addRecord()} disabled={busy || (editingRecordId ? !capabilities?.canUpdate : !capabilities?.canCreate)}>{busy ? "Kaydediliyor…" : editingRecordId ? "Değişiklikleri kaydet" : "Kayıt ekle"}</button>
              {editingRecordId && <button type="button" className="secondary" onClick={() => { setEditingRecordId(null); setValues({}); }} disabled={busy}>Düzenlemeyi iptal et</button>}
            </div>
          </div>}
          <div className="custom-data-record-list">
            {records.length === 0 ? <p>Henüz kayıt yok.</p> : records.map((record) => <article key={record.id}>
              <div className="custom-data-record-values">{(record.fields ?? selected.fields).map((field) => <span key={field.code}><small>{field.label}</small>{record.values[field.code] || "—"}</span>)}{record.entityId !== selected.id && <span className="custom-data-record-legacy">Önceki şema sürümü · salt okunur</span>}</div>
              <div className="custom-data-record-actions">
                <button type="button" disabled={busy || !capabilities?.canUpdate || record.entityId !== selected.id} onClick={() => { setEditingRecordId(record.id); setValues(Object.fromEntries(selected.fields.map((field) => [field.code, record.values[field.code] ?? ""]))); }}>Düzenle</button>
                <button type="button" className="remove" disabled={busy || !capabilities?.canDelete || record.entityId !== selected.id} onClick={() => void deleteRecord(record)}>Sil</button>
              </div>
            </article>)}
          </div>
          {recordTotal > 50 && <div className="custom-data-record-pagination"><span>{recordPage}. sayfa · {recordTotal} kayıt</span><div><button type="button" disabled={busy || recordLoading || recordPage <= 1} onClick={() => void loadRecords(selected, recordPage - 1)}>Önceki</button><button type="button" disabled={busy || recordLoading || recordPage * 50 >= recordTotal} onClick={() => void loadRecords(selected, recordPage + 1)}>Sonraki</button></div></div>}
        </div>}
      </section>
    </div>
  </main>;
}
