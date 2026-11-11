import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "./authApi";
import { Eye, Hash, Save, ShieldCheck } from "lucide-react";

type Template = { documentType: string; scenarioCode: string | null; pattern: string; resetsYearly: boolean };
const types = [
  ["SalesQuote", "Satış teklifi"], ["PurchaseRequest", "Satın alma talebi"], ["SalesOrder", "Satış siparişi"],
  ["SalesDelivery", "Satış irsaliyesi"], ["SalesInvoice", "Satış faturası"], ["EInvoice", "e-Fatura"],
  ["EDelivery", "e-İrsaliye"], ["EArchive", "e-Arşiv fatura"],
] as const;

export function DocumentNumberTemplatesPanel({ token, isAdmin }: { token: string; isAdmin: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState("SalesInvoice|");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState("");
  const current = useMemo(() => templates.find(x => `${x.documentType}|${x.scenarioCode ?? ""}` === selected), [templates, selected]);
  const selectedType = selected.split("|")[0];
  const eDocument = ["EInvoice", "EDelivery", "EArchive"].includes(selectedType);

  async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await authenticatedFetch(path, token, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.errors ? Object.values(payload.errors).flat()[0] as string : payload?.error ?? payload?.title ?? `İstek başarısız (${response.status}).`);
    return payload as T;
  }
  useEffect(() => { let alive = true; void api<Template[]>("/api/document-number-templates/").then(rows => { if (alive) setTemplates(rows); }).catch(e => { if (alive) setError((e as Error).message); }); return () => { alive = false; }; }, [token]);
  const update = (patch: Partial<Template>) => setTemplates(rows => rows.map(row => `${row.documentType}|${row.scenarioCode ?? ""}` === selected ? { ...row, ...patch } : row));
  const scenarios = templates.filter(row => row.documentType === selectedType);
  async function save() {
    if (!current) return;
    setBusy(true); setError(""); setNotice("");
    try { const saved = await api<Template>("/api/document-number-templates/", "PUT", current); setTemplates(rows => rows.map(row => row.documentType === saved.documentType && row.scenarioCode === saved.scenarioCode ? saved : row)); setNotice("Numara şablonu kaydedildi."); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function showPreview() {
    if (!current) return;
    setError("");
    try { const result = await api<{ code: string }>("/api/document-number-templates/preview", "POST", { documentType: current.documentType, pattern: current.pattern, sequence: 1 }); setPreview(result.code); }
    catch (e) { setError((e as Error).message); }
  }

  return <section className="panel company-setting-card document-number-settings">
    <div className="panel-heading"><div><h3><Hash size={17} /> Belge numara şablonları</h3><p>Her belge serisini firmaya göre belirleyin. E-belge şablonları GİB’in 16 karakter biçimini uygular.</p></div><span className="status-live ready"><ShieldCheck size={14}/> Firma kapsamlı</span></div>
    {error && <div className="alert inline-alert">{error}</div>}{notice && <div className="notice">{notice}</div>}
    {templates.length > 0 && <>
      <div className="form-two">
        <label className="company-setting-field">Belge türü<select value={selectedType} onChange={e => { const row = templates.find(x => x.documentType === e.target.value); if (row) setSelected(`${row.documentType}|${row.scenarioCode ?? ""}`); setPreview(""); }}>
          {types.map(([id, title]) => <option value={id} key={id}>{title}</option>)}
        </select></label>
        {scenarios.length > 1 && <label className="company-setting-field">e-Fatura senaryosu<select value={selected.split("|")[1]} onChange={e => { setSelected(`${selectedType}|${e.target.value}`); setPreview(""); }}>
          {scenarios.map(row => <option key={row.scenarioCode} value={row.scenarioCode ?? ""}>{row.scenarioCode}</option>)}
        </select></label>}
      </div>
      {current && <>
        <label className="company-setting-field">Numara şablonu<input value={current.pattern} disabled={!isAdmin || busy} onChange={e => update({ pattern: e.target.value })} placeholder={eDocument ? "NXR{YYYY}{SEQ:9}" : "NXR{YYYY}{SEQ:6}"}/>
          <small>{eDocument ? "Biçim: 3 harf/rakam + yıl + 9 haneli sıra = 16 karakter. Örnek: NXR2026000000001." : "{YYYY}, {YY} ve {SEQ:n} belirteçlerini kullanın. Sıra numarası her yıl sıfırlanır."}</small>
        </label>
        {!eDocument && <label className="company-setting-check"><input type="checkbox" checked={current.resetsYearly} disabled={!isAdmin || busy} onChange={e => update({ resetsYearly: e.target.checked })}/> Her yıl sıra numarasını sıfırla</label>}
        <div className="setting-actions"><button className="secondary small-button" disabled={busy} onClick={() => void showPreview()}><Eye size={15}/> Önizle</button>{isAdmin && <button className="primary small-button" disabled={busy} onClick={() => void save()}><Save size={15}/>{busy ? "Kaydediliyor…" : "Kaydet"}</button>}</div>
        {preview && <output className="document-number-preview">Örnek numara <b>{preview}</b><span>{preview.length} karakter</span></output>}
      </>}
    </>}
  </section>;
}
