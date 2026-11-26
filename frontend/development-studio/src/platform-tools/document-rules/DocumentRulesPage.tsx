import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPeople, loadRules, publishRules, saveDraft, tryRules, type RulesView, type TryResult } from "./documentRulesClient";
import {
  ACTION_LABELS, addRule, emptyRule, moveRule, OP_LABELS, removeRule, ruleProblem, sentence, toggleRule, updateRule, MAX_APPROVERS, MAX_MESSAGE,
  type DocumentRule, type RuleAction, type RulePerson,
} from "./documentRulesModel";
import "./document-rules.css";

type Transition = "onayla" | "karar" | "sevk" | "fatura" | "geri" | "iptal";

/** Gri adımlar: modülün gerçekten yaptığı işler (spec §5.5); kural bu seride yalnız Onayla'ya bağlanır. */
const CORE: Record<Exclude<Transition, "onayla">, { title: string; note: string; steps: [string, string][] }> = {
  karar: { title: "Onay bekleyen siparişte karar", note: "Bu geçişe kural bağlanmaz; kararı kuraldaki kişiler verir.", steps: [
    ["Kuraldaki kişilerden biri Onayla ya da Reddet der", "Siparişi kaydeden, listede olsa bile kendi siparişine karar veremez"],
    ["Onaylanırsa Onaylı; reddedilirse gerekçeyle Taslak'a döner", "İşlem günlüğüne ve onay akışına yazılır"]] },
  sevk: { title: "Sevk et", note: "İrsaliye kaydedilince durum kendiliğinden türetilir. Bu seride kural bağlanmaz.", steps: [
    ["Tüm satırlar sevk edilince Sevk edildi", "Kısmi sevkte Onaylı kalır; irsaliye iptalinde geri türetilir"]] },
  fatura: { title: "Faturala", note: "Faturadan türetilir. Bu seride kural bağlanmaz.", steps: [
    ["Sevk edilen her irsaliye faturalanınca Faturalandı", "Fatura iptalinde geri türetilir"]] },
  geri: { title: "Onayı geri al", note: "Bu seride kural bağlanmaz.", steps: [["Sevk, fatura ve rezervasyon yoksa Taslak'a döner", "Satırlar yeniden düzenlenebilir"]] },
  iptal: { title: "İptal et", note: "Bu seride kural bağlanmaz.", steps: [
    ["Gerekçe zorunlu; kayıtlı sevk ya da fatura varsa iptal edilemez", "Taslak, Onay bekliyor ya da Onaylı siparişte"],
    ["Rezervasyon bırakılır, bekleyen onay akışı kapatılır", "Aynı işlem içinde"]] },
};
const ONAYLA_CORE: [string, string, string][] = [
  ["🔒", "Satırlar ve bilgiler geçerli", "1–200 satır; cari, döviz ve plasiyer geçerli; stok kartları aktif"],
  ["🔒", "Zorunlu özel alanlar dolu", "Firmanın zorunlu sipariş alanları"],
  ["🔒", "Cari risk limiti", "Açık bakiye + bu sipariş limiti aşarsa engeller"],
  ["⚠", "Stok yeterli mi?", "Kullanılabilir miktar azsa uyarır, onaylamayı durdurmaz"],
];
const OUTCOME_ICON: Record<string, string> = { done: "✓", warned: "⚠", blocked: "⛔", waiting: "⏸", skipped: "·" };

function Step({ icon, title, note, who, kind }: { icon: string; title: string; note: string; who: string; kind: "core" | "ext" }) {
  return <div className={`dr-step is-${kind}`}><span className="dr-ic" aria-hidden="true">{icon}</span>
    <div className="dr-tx"><b>{title}</b><span>{note}</span></div><span className="dr-who">{who}</span></div>;
}

/**
 * Kurallar ekranı (belge kuralları PR 3, taslak 10): satış siparişinin Onayla geçişine danışman kuralları. Her değişiklik taslağa
 * yazılır; Yayınla ile geçerli olur. Dene taslaktaki kuralları örnek değerlerde ya da var olan bir siparişte yazmadan çalıştırır.
 */
export default function DocumentRulesPage({ token }: { token: string }) {
  const [view, setView] = useState<RulesView | null>(null);
  const [people, setPeople] = useState<RulePerson[]>([]);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<Transition>("onayla");
  const [editing, setEditing] = useState<{ code: string | null; rule: DocumentRule } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const refresh = useCallback(() => {
    loadRules(token).then((next) => { setView(next); setError(""); }, (failure: { status?: number; message?: string }) => {
      if (failure.status === 403) setForbidden(true); else setError(failure.message ?? "Kurallar okunamadı.");
    });
  }, [token]);
  useEffect(() => { refresh(); loadPeople(token).then(setPeople, () => setPeople([])); }, [refresh, token]);

  const rules = useMemo(() => [...(view?.draft ?? view?.published)?.rules ?? []].sort((a, b) => a.order - b.order), [view]);
  const fields = view?.fields ?? [];
  const operators = view?.operators ?? {};

  const write = async (next: DocumentRule[]) => {
    setBusy(true); setError("");
    try { setView(await saveDraft(token, next, view?.draft?.updatedAt ?? null)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Kurallar kaydedilemedi."); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true); setError("");
    try { setView(await publishRules(token, view?.draft?.updatedAt ?? null)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Yayınlanamadı."); }
    finally { setBusy(false); }
  };

  if (forbidden) return <main className="dr-page"><p className="dr-error" role="alert">Kuralları görmek için Belge kuralları okuma izni gerekir.</p></main>;
  if (!view) return <main className="dr-page"><p className="dr-note" role="status">{error || "Kurallar yükleniyor…"}</p></main>;

  const draftChanged = !!view.draft;
  const problem = editing ? ruleProblem(editing.rule, fields, operators) : null;
  const saveEditing = () => {
    if (!editing || problem) return;
    void write(editing.code ? updateRule(rules, editing.code, editing.rule) : addRule(rules, editing.rule));
    setEditing(null);
  };

  return <main className="dr-page">
    <header className="dr-top">
      <h1>Kurallar</h1>
      <select aria-label="Belge" defaultValue="satis.siparis"><option value="satis.siparis">Satış siparişi</option>
        <option disabled>Satış teklifi · yakında</option><option disabled>Satış faturası · yakında</option></select>
      <span className={`dr-pill${draftChanged ? " is-draft" : ""}`}>{draftChanged ? `Taslak · sürüm ${view.draft!.version}` : view.published ? `Yayında · sürüm ${view.published.version}` : "Kural yok"}</span>
      <span className="dr-sp"/>
      <button type="button" className="dr-btn" aria-expanded={historyOpen} onClick={() => setHistoryOpen((x) => !x)}>Geçmiş</button>
      <button type="button" className="dr-btn primary" disabled={busy || !draftChanged} onClick={() => void publish()}>Yayınla</button>
    </header>
    {historyOpen && <section className="dr-history" aria-label="Sürüm geçmişi"><ul>{view.history.map((row) =>
      <li key={row.version}>Sürüm {row.version} · {row.status === "Published" ? "Yayında" : row.status === "Draft" ? "Taslak" : "Arşiv"} · {row.ruleCount} kural
        {row.publishedAt ? ` · ${new Date(row.publishedAt).toLocaleString("tr-TR")}` : ""}</li>)}</ul></section>}

    <nav className="dr-chain" aria-label="Geçişler">
      <span className="dr-st">Taslak</span>
      <button type="button" className={`dr-tr${current === "onayla" ? " on" : ""}`} onClick={() => setCurrent("onayla")}>Onayla<small>{ONAYLA_CORE.length + rules.length + 2} adım</small></button>
      <span className="dr-st is-cond" title="Yalnız bir kural onay isterse araya girer">Onay bekliyor</span>
      <button type="button" className={`dr-tr${current === "karar" ? " on" : ""}`} onClick={() => setCurrent("karar")}>Onaylayan karar verir</button>
      <span className="dr-st">Onaylı</span>
      <button type="button" className={`dr-tr${current === "sevk" ? " on" : ""}`} onClick={() => setCurrent("sevk")}>Sevk et</button>
      <span className="dr-st">Sevk edildi</span>
      <button type="button" className={`dr-tr${current === "fatura" ? " on" : ""}`} onClick={() => setCurrent("fatura")}>Faturala</button>
      <span className="dr-st">Faturalandı</span>
      <span className="dr-side">Öteki geçişler:
        <button type="button" className={`dr-tr2${current === "geri" ? " on" : ""}`} onClick={() => setCurrent("geri")}>Onayı geri al</button>
        <button type="button" className={`dr-tr2${current === "iptal" ? " on" : ""}`} onClick={() => setCurrent("iptal")}>İptal et</button></span>
    </nav>
    {error && <p className="dr-error" role="alert">{error}</p>}

    <div className="dr-wrap">
      <section className="dr-main">
        {current !== "onayla" ? <div className="dr-sec"><h3>{CORE[current].title}</h3><p className="dr-sub">{CORE[current].note}</p>
          {CORE[current].steps.map(([title, note]) => <Step key={title} icon="🔒" title={title} note={note} who="Modül" kind="core"/>)}</div>
          : <>
            <div className="dr-sec"><h3>“Onayla” denince — önce modülün kontrolleri</h3><p className="dr-sub">Biri engellerse sipariş onaylanmaz, kullanıcı nedenini görür.</p>
              {ONAYLA_CORE.map(([icon, title, note]) => <Step key={title} icon={icon} title={title} note={note} who="Modül" kind="core"/>)}</div>
            <div className="dr-sec"><h3>Sonra — senin kuralların</h3>
              <p className="dr-sub">Tutarlar firmanın ana para birimine, sipariş tarihindeki kurla çevrilerek karşılaştırılır; kur yoksa tutar kuralı tutmaz.</p>
              <p className="dr-sub">Birden çok kural tutarsa önce <b>Engelle</b>, sonra <b>Onay iste</b>, sonra <b>Uyar</b> değerlendirilir. Birden çok onay kuralı tutarsa onaylar kural sırasıyla tek akışta birleşir.</p>
              {rules.length === 0 && !editing && <p className="dr-empty">Kural yok: siparişi kaydeden kendisi onaylar.</p>}
              <ul className="dr-rules" aria-label="Kurallar">{rules.map((rule, index) => {
                const text = sentence(rule, fields, people);
                return <li key={rule.code} className={`dr-rule${rule.enabled ? "" : " is-off"}`}>
                  <span className="dr-cond">{text.condition}</span> <span className={`dr-act is-${rule.action}`}>{text.action}</span>
                  <span className="dr-tools">
                    <label className="dr-switch"><input type="checkbox" role="switch" aria-label={`${rule.code} açık`} checked={rule.enabled} disabled={busy}
                      onChange={() => void write(toggleRule(rules, rule.code))}/></label>
                    <button type="button" aria-label={`${rule.code} yukarı`} disabled={busy || index === 0} onClick={() => void write(moveRule(rules, rule.code, -1))}>↑</button>
                    <button type="button" aria-label={`${rule.code} düzenle`} disabled={busy} onClick={() => setEditing({ code: rule.code, rule: { ...rule } })}>✎</button>
                    <button type="button" aria-label={`${rule.code} sil`} disabled={busy} onClick={() => void write(removeRule(rules, rule.code))}>✕</button>
                  </span></li>;
              })}</ul>
              {editing ? <Builder rule={editing.rule} fields={fields} operators={operators} people={people} problem={problem}
                onChange={(rule) => setEditing({ ...editing, rule })} onSave={saveEditing} onCancel={() => setEditing(null)} saving={busy} isNew={!editing.code}/>
                : <button type="button" className="dr-btn link" disabled={busy} onClick={() => setEditing({ code: null, rule: emptyRule(fields) })}>+ Kural ekle</button>}
              <p className="dr-order">Hiçbir kural onay istemezse siparişi <b>kaydeden kendisi onaylar</b> ve sipariş doğrudan <b>Onaylı</b> olur. Bir kural onay isterse sipariş <b>Onay bekliyor</b>'a geçer.</p>
            </div>
            <div className="dr-sec"><h3>Geçişten sonra</h3><p className="dr-sub">Aynı işlem içinde çalışır.</p>
              <Step icon="🔒" title="Durum Onaylı (ya da Onay bekliyor) olur ve işlem günlüğüne yazılır" note="Kim, ne zaman, hangi kontrol ve kural" who="Modül" kind="core"/>
              <Step icon="＋" title="Yazılımcı uzantısı yok" note="Burası iş ortağı yazılımcısının kodunun yeri; sonraki projede bağlanır" who="Yazılımcı" kind="ext"/></div>
          </>}
      </section>
      <TryPanel token={token} fields={fields} people={people}/>
    </div>
  </main>;
}

function Builder({ rule, fields, operators, people, problem, onChange, onSave, onCancel, saving, isNew }: {
  rule: DocumentRule; fields: RulesView["fields"]; operators: Record<string, string[]>; people: RulePerson[]; problem: string | null;
  onChange: (rule: DocumentRule) => void; onSave: () => void; onCancel: () => void; saving: boolean; isNew: boolean;
}) {
  const field = fields.find((f) => f.code === rule.field);
  const ops = field ? operators[field.kind] ?? [] : [];
  const set = (patch: Partial<DocumentRule>) => onChange({ ...rule, ...patch });
  return <div className="dr-builder" role="group" aria-label="Kural">
    <div className="dr-row">
      <select aria-label="Koşul" value={rule.always ? "always" : "if"} onChange={(e) => set({ always: e.target.value === "always" })}>
        <option value="if">Eğer</option><option value="always">Her zaman</option></select>
      {!rule.always && <>
        <select aria-label="Alan" value={rule.field ?? ""} onChange={(e) => {
          const next = fields.find((f) => f.code === e.target.value);
          set({ field: e.target.value, op: next && !(operators[next.kind] ?? []).includes(rule.op ?? "") ? operators[next.kind]?.[0] : rule.op, value: "" });
        }}>{fields.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</select>
        <select aria-label="İşleç" value={rule.op ?? ""} onChange={(e) => set({ op: e.target.value })}>{ops.map((op) => <option key={op} value={op}>{OP_LABELS[op] ?? op}</option>)}</select>
        {rule.op !== "IsEmpty" && rule.op !== "IsNotEmpty" && <input aria-label="Değer" type={field?.kind === "date" ? "date" : field?.kind === "number" ? "number" : "text"}
          value={rule.value ?? ""} onChange={(e) => set({ value: e.target.value })}/>}
        <span>ise</span></>}
    </div>
    <div className="dr-row"><select aria-label="Eylem" value={rule.action} onChange={(e) => set({ action: e.target.value as RuleAction })}>
      {(Object.keys(ACTION_LABELS) as RuleAction[]).map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}</select></div>
    {rule.action === "approval"
      ? <div className="dr-row is-block"><p className="dr-sub">Onaylayacak kişiler (en çok {MAX_APPROVERS}; biri karar verir; siparişi kaydeden kendi siparişine karar veremez)</p>
        <div className="dr-people" role="group" aria-label="Onaylayacak kişiler">{people.map((p) => {
          const on = rule.approverUserIds.includes(p.id);
          return <button type="button" key={p.id} className={`dr-chip${on ? " on" : ""}`} aria-pressed={on}
            onClick={() => set({ approverUserIds: on ? rule.approverUserIds.filter((x) => x !== p.id) : [...rule.approverUserIds, p.id] })}>{p.displayName}</button>;
        })}</div></div>
      : <div className="dr-row"><input aria-label="Mesaj" maxLength={MAX_MESSAGE} value={rule.message ?? ""} onChange={(e) => set({ message: e.target.value })}
        placeholder={rule.action === "warn" ? "Kullanıcıya gösterilecek uyarı" : "Kullanıcıya gösterilecek neden"}/></div>}
    {problem && <p className="dr-problem" role="status">{problem}</p>}
    <div className="dr-row"><button type="button" className="dr-btn primary" disabled={!!problem || saving} onClick={onSave}>{isNew ? "Kuralı ekle" : "Kaydet"}</button>
      <button type="button" className="dr-btn" onClick={onCancel}>Vazgeç</button></div>
  </div>;
}

function TryPanel({ token, fields, people }: { token: string; fields: RulesView["fields"]; people: RulePerson[] }) {
  const [source, setSource] = useState<"sample" | "order">("sample");
  const [facts, setFacts] = useState<Record<string, string>>({ grandTotal: "120000", maxLineDiscount: "5", customerGroup: "Toptan" });
  const [orderId, setOrderId] = useState("");
  const [actor, setActor] = useState("");
  const [result, setResult] = useState<TryResult | null>(null);
  const [error, setError] = useState("");
  const run = async () => {
    setError(""); setResult(null);
    try { setResult(await tryRules(token, { ...(source === "order" ? { orderId: orderId.trim() } : { facts }), ...(actor ? { actorUserId: actor } : {}) })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Denenemedi."); }
  };
  const shown = fields.filter((f) => ["grandTotal", "maxLineDiscount", "customerGroup", "lineCount", "currency"].includes(f.code));
  return <aside className="dr-try" aria-label="Dene">
    <h4>Dene · Onayla</h4>
    <div className="dr-seg" role="group" aria-label="Kaynak">
      <button type="button" className={source === "sample" ? "on" : ""} aria-pressed={source === "sample"} onClick={() => setSource("sample")}>Örnek değerler</button>
      <button type="button" className={source === "order" ? "on" : ""} aria-pressed={source === "order"} onClick={() => setSource("order")}>Var olan sipariş</button></div>
    {source === "sample" ? shown.map((f) => <label key={f.code}>{f.label}
      <input type={f.kind === "number" ? "number" : "text"} value={facts[f.code] ?? ""} onChange={(e) => setFacts({ ...facts, [f.code]: e.target.value })}/></label>)
      : <label>Sipariş kimliği<input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Siparişin kimliği"/></label>}
    <label>Onayla'ya basan<select value={actor} onChange={(e) => setActor(e.target.value)}><option value="">Ben</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
    <button type="button" className="dr-btn primary dr-run" onClick={() => void run()} disabled={source === "order" && !orderId.trim()}>“Onayla” geçişini dene</button>
    <p className="dr-note">Modülün kontrolleri ve <b>taslaktaki</b> kurallarla çalışır. Hiçbir kayıt değişmez, kimseye bildirim gitmez.</p>
    {error && <p className="dr-error" role="alert">{error}</p>}
    {result && <div className="dr-log" aria-label="Dene sonucu">
      <ul>{result.steps.map((step, index) => <li key={index}><span aria-hidden="true">{OUTCOME_ICON[step.outcome] ?? "·"}</span>
        <span>{step.source === "rule" ? `Kural ${step.step}` : step.step}{step.message ? `: ${step.message}` : ""}</span></li>)}</ul>
      <p className={`dr-result is-${result.result}`} data-testid="dr-result">{result.result === "blocked" ? "Onaylanmazdı."
        : result.result === "approval" ? `Onay bekliyor'a geçerdi · karar: ${result.approvers.map((p) => p.displayName).join(" veya ") || "—"}`
        : "Onaylı olurdu · kaydeden onaylar"}{result.actorExcluded ? " · Onayla'ya basan kendi siparişine karar veremez." : ""}</p>
      {!result.usedDraft && <p className="dr-note">Taslak yok; yayındaki kurallar denendi.</p>}
    </div>}
  </aside>;
}
