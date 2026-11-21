import BindingInput, { type BindingSuggestion } from "./BindingInput";

/** Gezinme eylemleri: veri yazmaz; adres, ERP ekranı ya da sayfa açar. */
export const NAVIGATION_ACTION_TYPES = ["link", "erpPage", "page"];
/** Eylem türüne göre gezinme özellikleri (sunucu: her özellik yalnız kendi türünde). */
export const NAVIGATION_PROPS: Record<string, string[]> = { link: ["href"], erpPage: ["pageKey", "queryText", "params"], page: ["pageCode", "params"] };
export const MAX_PAGE_PARAMS = 6;
const PARAM_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;
const LINK_PREFIX = /^https?:\/\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?::[0-9]{1,5})?([/?#]|$)/i;

/** Sunucunun SafeLinkTemplate kuralı: sabit http(s) şeması ve sunucu adı; {{…}} yalnız / ? # sonrasında. */
export function linkProblem(href: unknown): string | null {
  if (typeof href !== "string" || href === "") return "Bağlantı düğmesi için 'href' gerekli.";
  const first = href.indexOf("{{");
  const match = LINK_PREFIX.exec(first < 0 ? href : href.slice(0, first));
  const literal = href.replace(/\{\{[^}]*\}\}/g, "");
  if (!match || (first >= 0 && match[1] === "") || /[\s\\]/.test(literal))
    return "'href' http:// veya https:// ile başlayan, sunucu adı sabit yazılmış bir adres olmalıdır; {{…}} ifadeleri yalnız sunucu adından sonra (/, ? veya # ardından) kullanılabilir.";
  return null;
}

export type ScreenOption = { key: string; label: string };
export type PageOption = { code: string; name: string };
type Entry = { name: string; value: string };
const entries = (value: unknown): Entry[] => (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string" && item.includes("="))
  .map((item) => ({ name: item.slice(0, item.indexOf("=")), value: item.slice(item.indexOf("=") + 1) }));

/** "Eylem" bölümünün gezinme alanları: hedef, açılış biçimi ve onay. `onPatch` undefined değeri siler. */
export function NavigationFields({ actionType, props, screens, pages, suggestions, disabled, onPatch }: {
  actionType: string; props: Record<string, unknown>; screens: ScreenOption[]; pages: PageOption[]; suggestions: BindingSuggestion[]; disabled?: boolean;
  onPatch: (patch: Record<string, string | boolean | string[] | undefined>) => void;
}) {
  const text = (key: string) => (typeof props[key] === "string" ? props[key] as string : "");
  const params = entries(props.params);
  const setParams = (next: Entry[]) => onPatch({ params: next.length > 0 ? next.map((entry) => `${entry.name}=${entry.value}`) : undefined });
  const badParam = params.find((entry, index) => !PARAM_NAME.test(entry.name) || params.findIndex((other) => other.name === entry.name) !== index);
  const defaultTarget = actionType === "link" ? "newTab" : "sameTab";
  const problem = actionType === "link" ? linkProblem(props.href)
    : actionType === "erpPage" && !text("pageKey") ? "ERP ekranı düğmesi için 'pageKey' gerekli."
    : actionType === "page" && !text("pageCode") ? "Sayfa düğmesi için 'pageCode' gerekli." : null;
  const paramRows = <div className="pd-field">Parametreler<small>{actionType === "erpPage" ? "Ekran bunları sayfa parametresi olarak alır (ör. customerId); desteklemeyen ekran yok sayar" : <>Açılan sayfa bunları <code>{"{{sayfa.parametre.<ad>}}"}</code> ile okur</>} (en fazla {MAX_PAGE_PARAMS}).</small>
    {params.map((entry, index) => <div className="pd-inline" key={index}>
      <input aria-label="Parametre adı" value={entry.name} maxLength={32} disabled={disabled} placeholder="ad"
        onChange={(event) => setParams(params.map((item, at) => at === index ? { ...item, name: event.target.value.replace(/[^a-zA-Z0-9]/g, "") } : item))}/>
      <BindingInput value={entry.value} maxLength={200} suggestions={suggestions} disabled={disabled} ariaLabel="Parametre değeri"
        onChange={(next) => setParams(params.map((item, at) => at === index ? { ...item, value: next } : item))}/>
      <button type="button" className="pd-button small" disabled={disabled} aria-label="Parametreyi kaldır" onClick={() => setParams(params.filter((_, at) => at !== index))}>×</button>
    </div>)}
    <button type="button" className="pd-button small" disabled={disabled || params.length >= MAX_PAGE_PARAMS}
      onClick={() => setParams([...params, { name: `p${params.length + 1}`, value: "" }])}>Parametre ekle</button>
    {badParam && <small className="pd-query-warning">Parametre adı küçük harfle başlamalı, en fazla 32 harf/rakam olmalı ve benzersiz olmalıdır.</small>}
  </div>;
  return <>
    {actionType === "link" && <label className="pd-field">Adres<small>Yalnız http:// veya https://; sunucu adı sabit yazılır. Bağlanan değerler adrese kodlanarak eklenir.</small>
      <BindingInput value={text("href")} maxLength={1000} suggestions={suggestions} disabled={disabled} ariaLabel="Bağlantı adresi"
        placeholder="https://kargo.example.com/takip?no={{liste.seciliSatir.takipNo}}" onChange={(next) => onPatch({ href: next || undefined })}/></label>}
    {actionType === "erpPage" && <>
      <label className="pd-field">ERP ekranı<select value={text("pageKey")} disabled={disabled} onChange={(event) => onPatch({ pageKey: event.target.value || undefined })}>
        <option value="">Ekran seçin</option>
        {text("pageKey") && !screens.some((screen) => screen.key === text("pageKey")) && <option value={text("pageKey")}>{text("pageKey")}</option>}
        {screens.map((screen) => <option key={screen.key} value={screen.key}>{screen.label}</option>)}</select>
        {screens.length === 0 && <small>ERP ekran listesi yüklenemedi.</small>}</label>
      <label className="pd-field">Arama metni<small>Ekrana <code>{"{{sayfa.parametre.q}}"}</code> olarak gider; desteklemeyen ekran yok sayar.</small>
        <BindingInput value={text("queryText")} maxLength={200} suggestions={suggestions} disabled={disabled} ariaLabel="Arama metni" onChange={(next) => onPatch({ queryText: next || undefined })}/></label>
      {paramRows}
    </>}
    {actionType === "page" && <>
      <label className="pd-field">Açılacak sayfa<select value={text("pageCode")} disabled={disabled} onChange={(event) => onPatch({ pageCode: event.target.value || undefined })}>
        <option value="">Sayfa seçin</option>
        {text("pageCode") && !pages.some((page) => page.code === text("pageCode")) && !screens.some((screen) => `@${screen.key}` === text("pageCode")) && <option value={text("pageCode")}>{text("pageCode")}</option>}
        <optgroup label="Özel sayfalar">{pages.map((page) => <option key={page.code} value={page.code}>{page.name} · {page.code}</option>)}</optgroup>
        <optgroup label="Sistem ekranları">{screens.map((screen) => <option key={screen.key} value={`@${screen.key}`}>{screen.label}</option>)}</optgroup>
      </select></label>
      {paramRows}
    </>}
    <label className="pd-field">Açılış<select value={props.target === "newTab" || props.target === "sameTab" ? props.target as string : defaultTarget} disabled={disabled}
      onChange={(event) => onPatch({ target: event.target.value === defaultTarget ? undefined : event.target.value })}>
      <option value="newTab">Yeni sekmede</option><option value="sameTab">Aynı sekmede</option></select></label>
    <label className="pd-check"><input type="checkbox" checked={props.confirmEnabled === true} disabled={disabled} onChange={(event) => onPatch({ confirmEnabled: event.target.checked || undefined })}/>Onay iste</label>
    {props.confirmEnabled === true && <label className="pd-field">Onay metni<BindingInput value={text("confirmText")} maxLength={300} suggestions={suggestions} disabled={disabled} ariaLabel="Onay metni"
      placeholder="Boşsa standart onay sorusu gösterilir" onChange={(next) => onPatch({ confirmText: next || undefined })}/></label>}
    {problem && <small className="pd-query-warning">{problem}</small>}
    <p className="pd-binding-note">Bu eylem veri yazmaz.</p>
  </>;
}
