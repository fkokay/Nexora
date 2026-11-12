import { useEffect, useState } from "react";
import { Globe2, Plus, Trash2 } from "lucide-react";
import { api } from "../erpApi";
import {
  RecordFormGroup,
  RecordFormPage,
  RecordFormTabs,
  RequiredMark,
} from "../record-form/RecordForm";
import "./accounting-rule-profiles.css";
import "../finance-record-forms.css";

type Profile = {
  id: string; profileCode: string; name: string; jurisdictionCode: string;
  reportingStandard: string; baseCurrencyCode: string; fiscalYearStartMonth: number;
  effectiveFrom: string; effectiveTo: string | null; parametersJson: string;
  officialSourceUrl: string; isActive: boolean; updatedAt: string;
};
type TaxRule = {
  code: string; name: string; rate: number; operationType: "Sales" | "Purchase" | "Both";
  treatment: "Additive" | "Withholding"; calculationBase: "Net" | "PreviousTaxInclusive";
  active: boolean; effectiveFrom?: string | null; effectiveTo?: string | null;
};

const defaultProfile: Omit<Profile, "id" | "updatedAt"> = {
  profileCode: "TR-LOCAL", name: "Türkiye · Tek Düzen", jurisdictionCode: "TR",
  reportingStandard: "TDHP", baseCurrencyCode: "TRY", fiscalYearStartMonth: 1,
  effectiveFrom: `${new Date().getFullYear()}-01-01`, effectiveTo: null,
  parametersJson: '{"defaultForDocuments":true}', officialSourceUrl: "", isActive: true,
};

export function AccountingRuleProfilesPanel({ token }: { token: string }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState(defaultProfile);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formTab, setFormTab] = useState("taxes");
  const [previewAmount, setPreviewAmount] = useState("1000.00");
  const [previewOperation, setPreviewOperation] = useState<"Sales" | "Purchase">("Sales");
  const [preview, setPreview] = useState<{ additiveTaxTotal: number; withholdingTotal: number; payableAmount: number; taxes: { code: string; name: string; rate: number; amount: number; treatment: string }[] } | null>(null);

  async function load() {
    try { setProfiles(await api<Profile[]>("/api/finance/general-ledger/rule-profiles", token)); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, [token]);
  function select(item: Profile) { setProfile({ ...item }); setMessage(""); }
  function isDefaultForDocuments(parametersJson: string) {
    try { return JSON.parse(parametersJson)?.defaultForDocuments === true; }
    catch { return false; }
  }
  function setDefaultForDocuments(checked: boolean) {
    try {
      const parameters = JSON.parse(profile.parametersJson || "{}");
      if (!parameters || Array.isArray(parameters) || typeof parameters !== "object") throw new Error("Mevzuat parametreleri JSON nesnesi olmalıdır.");
      update("parametersJson", JSON.stringify({ ...parameters, defaultForDocuments: checked }, null, 2));
      setError("");
    } catch {
      setError("Varsayılan profil seçimini değiştirmeden önce mevzuat parametrelerindeki JSON hatasını düzeltin.");
    }
  }
  function readTaxRules(): TaxRule[] {
    try {
      const rules = JSON.parse(profile.parametersJson || "{}").taxRules;
      if (!Array.isArray(rules)) return [];
      return rules.map((rule: Partial<TaxRule>) => ({
        code: String(rule.code ?? ""), name: String(rule.name ?? ""), rate: Number(rule.rate ?? 0),
        operationType: rule.operationType ?? "Both", treatment: rule.treatment ?? "Additive",
        calculationBase: rule.calculationBase ?? "Net", active: rule.active !== false,
        effectiveFrom: rule.effectiveFrom ?? null, effectiveTo: rule.effectiveTo ?? null,
      }));
    } catch { return []; }
  }
  function writeTaxRules(taxRules: TaxRule[]) {
    try {
      const parameters = JSON.parse(profile.parametersJson || "{}");
      if (!parameters || Array.isArray(parameters) || typeof parameters !== "object") throw new Error("JSON nesnesi gerekli.");
      update("parametersJson", JSON.stringify({ ...parameters, taxRules }, null, 2));
      setError("");
    } catch { setError("Vergi kurallarını düzenlemek için mevzuat parametrelerinin geçerli bir JSON nesnesi olması gerekir."); }
  }
  function updateTaxRule(index: number, patch: Partial<TaxRule>) {
    const rules = readTaxRules();
    if (rules[index]) { rules[index] = { ...rules[index], ...patch }; writeTaxRules(rules); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const saved = await api<Profile>(`/api/finance/general-ledger/rule-profiles/${encodeURIComponent(profile.profileCode)}`, token, {
        method: "PUT", body: JSON.stringify(profile),
      });
      setMessage(`${saved.profileCode} mevzuat profili kaydedildi.`);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function runTaxPreview() {
    setPreviewBusy(true); setError(""); setPreview(null);
    try {
      const result = await api<typeof preview>(`/api/finance/general-ledger/rule-profiles/${encodeURIComponent(profile.profileCode)}/tax-preview`, token, {
        method: "POST", body: JSON.stringify({ taxableAmount: Number(previewAmount), documentDate: new Date().toISOString().slice(0, 10), operationType: previewOperation }),
      });
      setPreview(result);
    } catch (e) { setError((e as Error).message); }
    finally { setPreviewBusy(false); }
  }
  const update = <K extends keyof typeof profile>(key: K, value: (typeof profile)[K]) => setProfile(current => ({ ...current, [key]: value }));

  const isSavedProfile = profiles.some(item => item.profileCode === profile.profileCode);

  return <section className="accounting-rule-profiles">
    <header><div className="accounting-rule-icon"><Globe2 size={19} /></div><div><span className="eyebrow">MEVZUAT VE RAPORLAMA</span><h2>Ülke ve muhasebe profilleri</h2><p>Yürürlük tarihine bağlı yerel mevzuat ve raporlama standartlarını firma bazında tanımlayın.</p></div></header>
    {error && <p className="error-banner">{error}</p>}{message && <p className="notice">{message}</p>}
    <div className="accounting-rule-layout">
      <aside><h3>Kayıtlı profiller</h3>{profiles.map(item => <button type="button" key={item.id} onClick={() => select(item)} className={item.profileCode === profile.profileCode ? "selected" : ""}><b>{item.name}</b><span>{item.jurisdictionCode} · {item.reportingStandard} · {item.profileCode}{isDefaultForDocuments(item.parametersJson) ? " · Varsayılan" : ""}</span></button>)}<button type="button" className="accounting-rule-new" onClick={() => setProfile({ ...defaultProfile, profileCode: "", name: "", jurisdictionCode: "", reportingStandard: "", baseCurrencyCode: "", parametersJson: "{}" })}>+ Profil ekle</button></aside>
      <div className="fin-rf-host accounting-rule-form-host">
        <RecordFormPage
          variant="dialog"
          className="fin-rf-no-cancel"
          title="Mevzuat profili"
          mode={isSavedProfile ? "edit" : "create"}
          busy={busy}
          saveLabel="Profili kaydet"
          onSubmit={(event) => void save(event)}
          onCancel={() => {}}
          status={
            <>
              <span>{profile.isActive ? "Etkin" : "Pasif"}</span>
              <span>{readTaxRules().length} vergi kuralı</span>
              {isDefaultForDocuments(profile.parametersJson) && <span className="rf-status-notice">Varsayılan belge mevzuatı</span>}
            </>
          }
        >
          <RecordFormGroup title="Profil Kimliği" bodyClassName="rf-identity">
            <label><span>Profil kodu<RequiredMark /></span><input className="rf-must rf-mono" value={profile.profileCode} onChange={e => update("profileCode", e.target.value.toUpperCase())} maxLength={32} required placeholder="TR-LOCAL" /></label>
            <label><span>Profil adı<RequiredMark /></span><input className="rf-must" value={profile.name} onChange={e => update("name", e.target.value)} maxLength={120} required placeholder="Türkiye · Tek Düzen" /></label>
            <label><span>Ülke / yetki alanı<RequiredMark /></span><input className="rf-must rf-mono" value={profile.jurisdictionCode} onChange={e => update("jurisdictionCode", e.target.value.toUpperCase())} maxLength={8} required placeholder="TR, US, DE" /></label>
            <label><span>Raporlama standardı<RequiredMark /></span><input className="rf-must rf-mono" value={profile.reportingStandard} onChange={e => update("reportingStandard", e.target.value.toUpperCase())} maxLength={32} required placeholder="TDHP, IFRS, US-GAAP" /></label>
          </RecordFormGroup>
          <RecordFormGroup title="Yürürlük bilgileri" bodyClassName="fin-rf-grid-4">
            <label><span>Temel para birimi<RequiredMark /></span><input className="rf-must rf-mono" value={profile.baseCurrencyCode} onChange={e => update("baseCurrencyCode", e.target.value.toUpperCase())} maxLength={3} required placeholder="TRY" /></label>
            <label><span>Mali yıl başlangıç ayı<RequiredMark /></span><input className="rf-must rf-num" type="number" min={1} max={12} value={profile.fiscalYearStartMonth} onChange={e => update("fiscalYearStartMonth", Number(e.target.value))} required /></label>
            <label><span>Yürürlük başlangıcı<RequiredMark /></span><input className="rf-must" type="date" value={profile.effectiveFrom} onChange={e => update("effectiveFrom", e.target.value)} required /></label>
            <label>Yürürlük bitişi<input type="date" value={profile.effectiveTo || ""} onChange={e => update("effectiveTo", e.target.value || null)} /></label>
            <label className="rf-check fin-rf-span-2"><input type="checkbox" checked={profile.isActive} onChange={e => update("isActive", e.target.checked)} /> Bu profili etkin kullan</label>
            <label className="rf-check fin-rf-span-2"><input type="checkbox" checked={isDefaultForDocuments(profile.parametersJson)} onChange={e => setDefaultForDocuments(e.target.checked)} /> Bu profili varsayılan belge mevzuatı olarak kullan</label>
          </RecordFormGroup>
          <RecordFormTabs
            tabs={[
              { key: "taxes", label: "Vergi kuralları" },
              { key: "parameters", label: "Parametreler ve Kaynak" },
              { key: "preview", label: "Vergi kuralı önizlemesi" },
            ]}
            active={formTab}
            onChange={setFormTab}
            label="Mevzuat profili bölümleri"
          >
            {formTab === "taxes" && <>
            <div className="accounting-tax-rule-editor">
              <div className="accounting-tax-rule-title"><div><b>Vergi kuralları</b><span>ÖTV, ÖİV, damga vergisi ve tevkifat gibi ekleri belge tarihine göre yönetin.</span></div><button type="button" onClick={() => writeTaxRules([...readTaxRules(), { code: `TAX_${Date.now()}`, name: "Yeni vergi", rate: 0, operationType: "Both", treatment: "Additive", calculationBase: "Net", active: true }])}><Plus size={14} /> Vergi ekle</button></div>
              {readTaxRules().length === 0 ? <p className="accounting-tax-empty">Henüz vergi kuralı yok. Temel KDV oranı stok ve belge satırlarından alınır.</p> : readTaxRules().map((rule, index) => <div className="accounting-tax-rule-row" key={`${index}-${rule.code}`}>
                <label>Kod<input value={rule.code} maxLength={32} onChange={e => updateTaxRule(index, { code: e.target.value.toUpperCase() })} /></label>
                <label>Vergi adı<input value={rule.name} maxLength={100} onChange={e => updateTaxRule(index, { name: e.target.value })} /></label>
                <label>Oran (%)<input type="number" min="0" max="100" step="0.0001" value={rule.rate} onChange={e => updateTaxRule(index, { rate: Number(e.target.value) })} /></label>
                <label>İşlem türü<select value={rule.operationType} onChange={e => updateTaxRule(index, { operationType: e.target.value as TaxRule["operationType"] })}><option value="Both">Alış ve satış</option><option value="Sales">Satış</option><option value="Purchase">Alış</option></select></label>
                <label>Uygulama<select value={rule.treatment} onChange={e => updateTaxRule(index, { treatment: e.target.value as TaxRule["treatment"] })}><option value="Additive">Fiyata ekle</option><option value="Withholding">Tevkifat</option></select></label>
                <label>Matrah<select value={rule.calculationBase} onChange={e => updateTaxRule(index, { calculationBase: e.target.value as TaxRule["calculationBase"] })}><option value="Net">Net tutar</option><option value="PreviousTaxInclusive">Önceki vergiler dahil</option></select></label>
                <label>Vergi yürürlük başlangıcı<input type="date" value={rule.effectiveFrom || ""} onChange={e => updateTaxRule(index, { effectiveFrom: e.target.value || null })} /></label>
                <label>Vergi yürürlük bitişi<input type="date" value={rule.effectiveTo || ""} onChange={e => updateTaxRule(index, { effectiveTo: e.target.value || null })} /></label>
                <label className="accounting-tax-active rf-check"><input type="checkbox" checked={rule.active} onChange={e => updateTaxRule(index, { active: e.target.checked })} /> Etkin</label>
                <button type="button" className="accounting-tax-remove" aria-label={`${rule.name} vergisini sil`} onClick={() => writeTaxRules(readTaxRules().filter((_, ruleIndex) => ruleIndex !== index))}><Trash2 size={14} /> Sil</button>
              </div>)}
            </div>
            </>}
            {formTab === "parameters" && <div className="fin-rf-lines">
              <label>Resmi mevzuat kaynağı<input type="url" value={profile.officialSourceUrl} onChange={e => update("officialSourceUrl", e.target.value)} maxLength={500} placeholder="https://…" /></label>
              <label>Mevzuat parametreleri (JSON)<textarea className="fin-rf-code" value={profile.parametersJson} onChange={e => update("parametersJson", e.target.value)} rows={7} spellCheck={false} aria-describedby="accounting-tax-rules-help" /></label>
              <div className="fin-rf-code-help" id="accounting-tax-rules-help">
                <b>Vergi kuralı biçimi</b>
                <code>{'{ "taxRules": [{ "code": "VAT", "name": "KDV", "rate": 20, "operationType": "Both", "treatment": "Additive", "calculationBase": "Net", "active": true }] }'}</code>
                <span><strong>operationType:</strong> Sales, Purchase veya Both · <strong>treatment:</strong> Additive veya Withholding · <strong>calculationBase:</strong> Net veya PreviousTaxInclusive. Geçerlilik tarihleri isteğe bağlıdır. Faturada temel KDV oranı stok/sipariş satırından alınır; diğer kodlar ek vergi kuralı olarak uygulanır.</span>
              </div>
            </div>}
            {formTab === "preview" && <>
              <div className="fin-rf-preview">
                <label>Matrah<input className="rf-num" type="number" min="0" step="0.01" value={previewAmount} onChange={e => setPreviewAmount(e.target.value)} /></label>
                <label>İşlem<select value={previewOperation} onChange={e => setPreviewOperation(e.target.value as "Sales" | "Purchase")}><option value="Sales">Satış</option><option value="Purchase">Alış</option></select></label>
                <button type="button" className="secondary" disabled={previewBusy || !profile.profileCode} onClick={() => void runTaxPreview()}>{previewBusy ? "Hesaplanıyor…" : "Vergileri hesapla"}</button>
                {preview && <div className="fin-rf-preview-result"><span>Vergi: <b>{preview.additiveTaxTotal.toFixed(2)}</b></span><span>Tevkifat: <b>{preview.withholdingTotal.toFixed(2)}</b></span><span>Ödenecek: <b>{preview.payableAmount.toFixed(2)}</b></span>{preview.taxes.map(tax => <small key={tax.code}>{tax.name} ({tax.rate}% · {tax.treatment}) {tax.amount.toFixed(2)}</small>)}</div>}
              </div>
            </>}
          </RecordFormTabs>
        </RecordFormPage>
      </div>
    </div>
  </section>;
}
