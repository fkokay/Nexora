import { type ComponentProps, type CSSProperties, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, LayoutTemplate } from "lucide-react";
import { api } from "./erpApi";
import TenantReportWidget from "./TenantReportWidget";
import { MetricCard } from "./custom-page/MetricCard";
import TenantWorkflowAction from "./TenantWorkflowAction";
import { bindingPath, displayText, interpolate, resolvePath, type PageScope } from "./custom-page/pageBindings";
import { readPageQueries, resolveQueryParameters, usePageQueries, type PageQueryDefinition, type QueryState, type WriteResult } from "./custom-page/usePageQueries";
import { collectTexts, COUNTS_ROOT, referencedCountCodes, usePageCounts } from "./custom-page/usePageCounts";
import { columnTotal, formatCell, trendPoints, isRightAligned, parseColumnFormats, parseToneMap, toneFor, type ColumnFormat, type Tone } from "./custom-page/cellFormat";
import { chipText, ContextPanel, facetCount, FacetPanel, FilterChips, FormCard, type FacetGroup } from "./custom-page/LayoutComponents";
import { idList, ownedInputIds, parseFieldList, parseTabs, tableSearchInputIds, tabOwnedIds } from "./custom-page/layoutRefs";
import { LookupInput, lookupCandidates, lookupOptionsWithValue, type LookupOption } from "./custom-page/LookupInput";
import { PagedTableFooter } from "./custom-page/PagedTableFooter";
import { runWriteAction } from "./custom-page/writeAction";
import { conditionHolds } from "./custom-page/conditions";
import { applyTyping, boundInputNames, inputRules, validateInputValue, VALIDATION_BLOCKED } from "./custom-page/inputValidation";
import { PageTabs } from "./custom-page/PageTabs";
import type { BridgeHost } from "./custom-page/codeBridge";
import { CodeFrame } from "./custom-page/CodeFrame";
import { createPageEvents, type PageEvents } from "./custom-page/pageEvents";
import { mapOperationResult, type ErpOperation } from "./custom-page/erpOperations";
import { useErpOperations } from "./custom-page/useErpOperations";
import { actionBarOf, buildPageCommands, exportRows, movedButtonIds } from "./custom-page/pageActions";
import { usePageCommands } from "./commands/CommandProvider";
import { startPageWorkflow } from "./custom-page/workflowStart";
import { downloadXlsx } from "./general-ledger/ledgerReportUtils";
import "./tenant-custom-page.css";

type DynamicField = {
  code: string; label: string; dataType: "Text" | "Decimal" | "Date" | "Boolean" | "Choice";
  isRequired: boolean; maxLength?: number; options?: string[] | null; placeholder?: string | null;
  helpText?: string | null; isMultiline?: boolean; defaultValue?: string | null;
  visibleWhenFieldCode?: string | null; visibleWhenValue?: string | null;
  requiredWhenFieldCode?: string | null; requiredWhenValue?: string | null;
  minLength?: number; minValue?: number | null; maxValue?: number | null;
  minDate?: string | null; maxDate?: string | null;
};
type EmbeddedForm = { id: string; code: string; name: string; description?: string | null; version: number; fields: DynamicField[] };
type ComponentDefinition = {
  id: string; type: string; name?: string; props?: Record<string, unknown>; children?: ComponentDefinition[];
};
type PublishedPage = {
  id: string; code: string; name: string; description?: string | null; revision: number;
  definitionJson: string; forms: EmbeddedForm[];
  rights?: { view?: boolean; insert?: boolean; update?: boolean; delete?: boolean };
};

const textValue = (value: unknown, fallback = "") =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

const BINDABLE_PROPS = ["text", "title", "description", "label", "value", "placeholder", "defaultValue", "disabledReason"];
type InputRaw = string | boolean;
/** v2 sayfaların çalışma zamanı: bağlama kapsamı, sorgu durumları, giriş değerleri ve ızgara seçimleri. */
type PageRuntime = {
  scope: PageScope;
  states: Record<string, QueryState>;
  queryNames: Record<string, string>;
  inputValues: Record<string, InputRaw>;
  setInput: (componentId: string, value: InputRaw) => void;
  selections: Record<string, Record<string, unknown> | null>;
  select: (tableName: string, row: Record<string, unknown> | null) => void;
  queryById: Record<string, PageQueryDefinition>;
  /** ERP işlemi doğrulama hataları, giriş adına göre (parametre bağlaması `{{<giriş>.value}}`). */
  inputErrors: Record<string, string>;
  /** formCard/facetPanel'in sahiplendiği girişler (üst düzeyde ayrıca çizilmez) ve kimliğe göre giriş bileşenleri. */
  ownedInputs: Set<string>;
  inputById: Record<string, ComponentDefinition>;
  /** contextPanel'in `table` başvurusu için kimliğe göre veri tabloları. */
  tableById: Record<string, ComponentDefinition>;
  rights: NonNullable<PublishedPage["rights"]>;
  rerun: (queryIds: string[]) => void;
  /** Studio taslak önizlemesi: yazma sorguları her zaman onay sorar ve sunucuya açık onay (confirmWrite) gönderir. */
  isPreview: boolean;
  writeFor: (query: PageQueryDefinition, confirmWrite: boolean) => Promise<WriteResult>;
  /** Kod bileşenleri arası olay merkezi (load/select/beforeSave/afterSave) ve köprünün sayfa tarafı. */
  events: PageEvents;
  codeHost: BridgeHost;
  /** `actionBar.moreButtons` ile İşlemler menüsüne taşınan düğmeler: sayfada çizilmez. */
  movedButtons: Set<string>;
  /** Sayfadaki tüm yazma yolları (sorgu düğmeleri, İşlem Çubuğu, Ctrl+S) için tek uçuş kilidi. */
  writeLock: { current: boolean };
  /** İşlem Çubuğu eylemlerinin sonucu (sayfadaki durum satırı). */
  actionStatus: ActionStatus | null;
  /** Gösterilen istemci doğrulama iletileri, giriş kimliğine göre (bulanıklaşınca veya engellenen yazmada). */
  validationErrors: Record<string, string>;
  /** Yazmadan önce sorgunun bağladığı görünür, etkin girişleri doğrular; geçersizse VALIDATION_BLOCKED döner. */
  validateFor: (query: PageQueryDefinition) => string | null;
  /** Giriş doğrulanmıyor mu (kendisi veya bir sahibi gizli, ya da kendisi pasif). */
  skipsValidation: (inputId: string) => boolean;
  /** Engellenen yazmada hangi sekmeler bileşeninin hangi sekmesine atlanacağı (kimliğe göre); `signal` her engelde artar. */
  errorJump: { signal: number; targets: Record<string, number> } | null;
  /** Giriş bulanıklaştı: iletisi gösterilir veya kaldırılır. */
  blurInput: (componentId: string) => void;
  /** Sekmelerin sahiplendiği bileşenler (üst düzeyde ayrıca çizilmez) ve kimliğe göre üst düzey bileşenler. */
  tabOwned: Set<string>;
  topLevelById: Record<string, ComponentDefinition>;
  /** Sekme başına hata sayısı için: bileşenin sahip zinciri (giriş → formCard → sekmeler…). */
  ancestorsOf: (componentId: string) => string[];
  /** Arama kutusu (inputType: lookup) girişinin seçenekleri ve seçim/arama geri çağrıları. */
  lookupFor: (component: ComponentDefinition, props: Record<string, unknown>) => LookupBinding;
  /** Sunucu sayfalı veri listesinin geçerli sayfası ve sayfa değiştirme (sayfalı değilse undefined). */
  tablePaging: (table: ComponentDefinition) => { page: number; pageSize: number; onPage: (page: number) => void } | undefined;
};
type LookupBinding = {
  options: LookupOption[]; loading: boolean; error?: string;
  onChange: (value: string, row: Record<string, unknown> | null, label: string) => void; onSearch: (text: string) => void;
  /** Son seçimin değeri ve etiketi (çalışma zamanında saklanır; giriş yeniden bağlanınca etiket korunur). */
  selected: { value: string; label: string } | null;
};
/** Sayfalı listenin alt satırı ve başlıktaki arama girişi. */
export type TablePaging = { page: number; pageSize: number; meta: { label: string; value: string }[]; onPage: (page: number) => void; search?: ReactNode };
type ActionStatus = { tone: "success" | "error" | "warning"; text: string };

const bindProps = (props: Record<string, unknown>, scope: PageScope): Record<string, unknown> => {
  const bound = { ...props };
  for (const key of BINDABLE_PROPS) if (typeof bound[key] === "string") bound[key] = interpolate(bound[key] as string, scope);
  return bound;
};

const cellText = (value: unknown): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number" && Number.isFinite(value)) return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const sessionUser = (token: string) => {
  let id = "";
  let rol = "";
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { sub?: unknown; role?: unknown };
    id = String(claims.sub ?? "");
    // `role` talebi dizi olabilir: ilk öğe kullanılır; yoksa boş.
    const role = Array.isArray(claims.role) ? claims.role[0] : claims.role;
    rol = typeof role === "string" ? role : "";
  } catch { /* geçersiz belirteç: kimlik ve rol boş kalır */ }
  let name = "";
  try { name = localStorage.getItem("aierp.user") ?? ""; } catch { /* depolama kapalı */ }
  return { id, ad: name, rol };
};

/** v2 bileşen koşulları (`visibleWhen`, `disabledWhen`) sayfa kapsamında; v1'de (çalışma zamanı yok) her şey görünür ve etkindir. */
const componentVisible = (component: ComponentDefinition, runtime?: PageRuntime) =>
  !runtime || conditionHolds(component.props?.visibleWhen, runtime.scope, true);
const componentDisabled = (component: ComponentDefinition, runtime?: PageRuntime) =>
  !!runtime && (component.type === "button" || component.type === "input") && conditionHolds(component.props?.disabledWhen, runtime.scope, false);
const BUTTON_UNAVAILABLE = "Bu işlem şu anda kullanılamaz.";

const flattenComponents = (components: ComponentDefinition[]): ComponentDefinition[] =>
  components.flatMap((component) => [component, ...flattenComponents(component.children ?? [])]);

const rawInputDefault = (inputType: string, defaultValue: string): InputRaw =>
  inputType === "checkbox" ? /^(true|1|evet)$/i.test(defaultValue.trim()) : defaultValue;

/** Giriş değerini bağlama kapsamındaki türüne çevirir: sayı → number|null, onay kutusu → boolean. */
const scopeInputValue = (inputType: string, raw: InputRaw): unknown => {
  if (inputType === "checkbox") return raw === true;
  if (typeof raw !== "string") return null;
  if (inputType === "number") { const parsed = raw.trim() === "" ? Number.NaN : Number(raw); return Number.isFinite(parsed) ? parsed : null; }
  return raw;
};


// Tasarım dili varsayılanları (kart iç boşluğu 12px, köşe 8px); Studio tuvali aynı değerleri kullanır.
const DEFAULT_BLOCK_PADDING = 12;
const DEFAULT_RADIUS = 8;
const visualStyle = (type: string, props: Record<string, unknown>): CSSProperties => {
  const bounded = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = value == null || value === "" ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  const span = bounded(props.width, type === "metric" ? 3 : type === "heading" || type === "text" || type === "label" || type === "divider" || type === "spacer" || type === "formCard" || type === "tabs" || type === "filterChips" || type === "actionBar" ? 12 : type === "facetPanel" ? 3 : type === "contextPanel" ? 4 : 6, 1, 12);
  const number = (key: string, fallback: number, max: number) => bounded(props[key], fallback, 0, max);
  const color = (key: string) => typeof props[key] === "string" && /^#[\da-f]{6}$/i.test(props[key] as string) ? props[key] as string : undefined;
  return {
    gridColumn: `span ${Math.max(1, Math.min(12, span))}`,
    margin: `${number("margin", 0, 64)}px`,
    padding: `${number("padding", ["card", "section", "dataTable", "metric", "form", "alert", "list", "progress", "formCard", "facetPanel", "contextPanel", "tabs"].includes(type) ? DEFAULT_BLOCK_PADDING : 0, 64)}px`,
    backgroundColor: color("backgroundColor"),
    color: color("textColor"),
    borderRadius: `${number("borderRadius", DEFAULT_RADIUS, 32)}px`,
    // ERP kabuğunun eski `[class*="-card"]`/`-panel` köşe kuralı !important; seçilen köşe bu değişkenle korunur.
    ["--tp-radius" as string]: `${number("borderRadius", DEFAULT_RADIUS, 32)}px`,
  };
};

function EmbeddedCustomForm({ form, token }: { form: EmbeddedForm; token: string }) {
  const [values, setValues] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(form.fields.map((field) => [field.code, field.defaultValue ?? (field.dataType === "Boolean" ? "false" : "")])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const isVisible = (field: DynamicField) => !field.visibleWhenFieldCode || field.visibleWhenValue == null
    || values[field.visibleWhenFieldCode]?.trim() === field.visibleWhenValue.trim()
    || (form.fields.find((source) => source.code === field.visibleWhenFieldCode)?.dataType === "Decimal"
      && Number(values[field.visibleWhenFieldCode]) === Number(field.visibleWhenValue));
  const isRequired = (field: DynamicField) => field.isRequired || (!!field.requiredWhenFieldCode
    && field.requiredWhenValue != null && (values[field.requiredWhenFieldCode]?.trim() === field.requiredWhenValue.trim()
      || (form.fields.find((source) => source.code === field.requiredWhenFieldCode)?.dataType === "Decimal"
        && Number(values[field.requiredWhenFieldCode]) === Number(field.requiredWhenValue))));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api(`/api/custom-forms/${form.id}/submissions`, token, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }),
      });
      setSubmitted(true);
    } catch (cause) { setError((cause as Error).message || "Form gönderilemedi."); }
    finally { setBusy(false); }
  };
  if (submitted) return <section className="tenant-page-block tenant-page-form tenant-page-form-success" role="status"><h3>{form.name}</h3><p>Formunuz gönderildi.</p></section>;
  return <form className="tenant-page-block tenant-page-form" onSubmit={(event) => void submit(event)}>
    <h3>{form.name}</h3>{form.description && <p>{form.description}</p>}
    {form.fields.filter(isVisible).map((field) => {
      const required = isRequired(field);
      return <label className="tenant-page-form-field" key={field.code}>
        <span>{field.label}{required && <b aria-hidden="true"> *</b>}</span>
        {field.dataType === "Boolean" ? <input type="checkbox" checked={values[field.code] === "true"} onChange={(event) => setValues((current) => ({ ...current, [field.code]: String(event.target.checked) }))} />
          : field.dataType === "Choice" ? <select required={required} value={values[field.code] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.code]: event.target.value }))}><option value="">Seçin</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
          : field.isMultiline ? <textarea required={required} minLength={field.minLength || undefined} maxLength={field.maxLength || undefined} placeholder={field.placeholder ?? ""} value={values[field.code] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.code]: event.target.value }))} />
          : <input required={required} minLength={field.dataType === "Text" ? field.minLength || undefined : undefined} maxLength={field.dataType === "Text" ? field.maxLength || undefined : undefined} min={field.dataType === "Decimal" ? field.minValue ?? undefined : field.dataType === "Date" ? field.minDate ?? undefined : undefined} max={field.dataType === "Decimal" ? field.maxValue ?? undefined : field.dataType === "Date" ? field.maxDate ?? undefined : undefined} type={field.dataType === "Date" ? "date" : field.dataType === "Decimal" ? "number" : "text"} step={field.dataType === "Decimal" ? "any" : undefined} placeholder={field.placeholder ?? ""} value={values[field.code] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.code]: event.target.value }))} />}
        {field.helpText && <small>{field.helpText}</small>}
      </label>;
    })}
    {error && <p className="tenant-page-form-error" role="alert">{error}</p>}
    <button className="tenant-page-submit" type="submit" disabled={busy}>{busy ? "Gönderiliyor…" : "Gönder"}</button>
  </form>;
}

function QueryError({ message }: { message: string }) {
  return <div className="tenant-custom-page-error tenant-page-query-error" role="alert"><AlertCircle size={16} /><span>{message}</span></div>;
}

type MetricExtras = Pick<ComponentProps<typeof MetricCard>, "tone" | "icon" | "trend" | "active" | "onActivate">;

const MANUAL_QUERY_IDLE = "Bu sorgu elle çalıştırılır.";
/** Elle çalışan ve henüz hiç çalışmamış sorgu (yükleme sorguları açılışta yüklenme durumuyla başlar). */
const neverRan = (state: QueryState) => !state.ran && !state.loading && !state.error;

function QueryMetric({ state, title, description, style, ...card }: { state: QueryState; title: string; description: string; style: CSSProperties } & MetricExtras) {
  const first = state.columns[0]?.code;
  const value = state.rows.length > 0 && first ? cellText(state.rows[0][first]) : "—";
  return <MetricCard title={title} description={description} style={style} hasError={!!state.error} {...card}
    value={state.loading ? <strong className="tenant-report-status" role="status">Yükleniyor…</strong> : state.error ? <QueryError message={state.error} />
      : neverRan(state) ? <strong className="tenant-report-status" role="status">{MANUAL_QUERY_IDLE}</strong> : <strong>{value}</strong>} />;
}

export function QueryTable({ state, columns, title, description, style, selected, onSelect, formats = parseColumnFormats(undefined), toneMap = [], totals = [], density = "dense", paging }: {
  state: QueryState; columns: string[]; title: string; description: string; style: CSSProperties;
  selected?: Record<string, unknown> | null; onSelect?: (row: Record<string, unknown> | null) => void;
  formats?: Record<string, ColumnFormat>; toneMap?: { key: string; tone: Tone }[]; totals?: string[]; density?: "dense" | "comfort";
  /** Sunucu sayfalı liste: sonuç her zaman "kesilmiş"tir; uyarı yerine sayfa alt satırı gösterilir. */
  paging?: TablePaging;
}) {
  const chosen = columns.length > 0 ? state.columns.filter((column) => columns.includes(column.code)) : [];
  const visible = (chosen.length > 0 ? chosen : state.columns).slice(0, 20);
  const hasTotals = visible.some((column) => totals.includes(column.code));
  // Yeni sonuç gelince eski satır seçimi geçersizdir.
  useEffect(() => { if (selected && !state.rows.includes(selected)) onSelect?.(null); }, [state.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (row: Record<string, unknown>) => onSelect?.(selected === row ? null : row);
  const cellClass = (column: { code: string; dataType?: string }) => {
    const format = formats[column.code];
    return [isRightAligned(format, column.dataType) ? "num" : "", format === "code" ? "code" : ""].filter(Boolean).join(" ") || undefined;
  };
  const renderCell = (column: { code: string; dataType?: string }, row: Record<string, unknown>) => {
    const text = formatCell(row[column.code], formats[column.code], column.dataType);
    if (formats[column.code] !== "status" || text === "—") return text;
    const tone = toneFor(text, toneMap);
    return <span className={`tenant-page-tag${tone ? ` tone-${tone}` : ""}`}>{text}</span>;
  };
  const totalLabel = paging ? `Sayfa toplamı · ${state.rows.length} kayıt`
    : state.truncated ? `Toplam · ilk ${state.rows.length} satır` : `Toplam · ${state.rows.length} kayıt`;
  return <section className={`tenant-page-block tenant-page-table tenant-page-report-widget ${state.error ? "is-error" : ""}`} style={style}>
    {title && <h3>{title}</h3>}
    {description && <p>{description}</p>}
    {/* Arama girişi yükleme sırasında da yerinde kalır (yazarken odak kaybolmasın). */}
    {paging?.search && <div className="tenant-page-table-search">{paging.search}</div>}
    {state.loading ? <div className="tenant-report-state" role="status">Yükleniyor…</div>
      : state.error ? <QueryError message={state.error} />
        : neverRan(state) ? <div className="tenant-report-state" role="status">{MANUAL_QUERY_IDLE}</div>
        : <div className="tenant-page-table-scroll"><table className={density === "comfort" ? "is-comfort" : undefined}>
          <thead><tr>{visible.map((column) => <th scope="col" key={column.code} className={isRightAligned(formats[column.code], column.dataType) ? "num" : undefined}>{column.label || column.code}</th>)}</tr></thead>
          <tbody>
            {state.rows.length === 0 && <tr><td colSpan={Math.max(1, visible.length)} className="tenant-report-state">Gösterilecek kayıt bulunamadı.</td></tr>}
            {state.rows.map((row, index) => <tr key={index} className={onSelect ? `tenant-page-row-selectable${selected === row ? " is-selected" : ""}` : undefined}
              aria-selected={onSelect ? selected === row : undefined} tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? () => toggle(row) : undefined}
              onKeyDown={onSelect ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(row); } } : undefined}>
              {visible.map((column) => <td key={column.code} className={cellClass(column)}>{renderCell(column, row)}</td>)}
            </tr>)}
          </tbody>
          {hasTotals && state.rows.length > 0 && <tfoot><tr className="tenant-page-total">
            {visible.map((column, index) => {
              const total = totals.includes(column.code) ? columnTotal(state.rows, column.code) : null;
              const inTotals = totals.includes(column.code);
          const text = total !== null ? formatCell(total, formats[column.code] === "money" ? "money" : "number") : inTotals ? "—" : "";
              if (index === 0 && total !== null) return <td key={column.code}><span className="tenant-page-total-label">{totalLabel}</span><span className="num">{text}</span></td>;
              return <td key={column.code} className={total !== null ? "num" : undefined}>{index === 0 ? totalLabel : text}</td>;
            })}
          </tr></tfoot>}
        </table></div>}
    {!paging && !state.loading && !state.error && state.truncated && <p className="tenant-page-truncated" role="status">İlk 5.000 satır gösteriliyor.</p>}
    {paging && !state.error && !neverRan(state) && <PagedTableFooter page={paging.page} pageSize={paging.pageSize} total={state.rowCount}
      meta={paging.meta} onPage={paging.onPage} loading={state.loading} />}
  </section>;
}

/** Durum rozeti: değer toneMap ile eşleşirse o ton, yoksa variant geri dönüş tonudur. */
export function PageBadge({ text, variant, toneMap, style }: { text: string; variant?: unknown; toneMap?: unknown; style?: CSSProperties }) {
  const fallback = ["success", "warning", "danger", "info"].includes(textValue(variant)) ? textValue(variant) : "info";
  const tone = toneFor(text, parseToneMap(toneMap)) ?? fallback;
  return <span className={`tenant-page-badge tone-${tone}`} style={style}>{text}</span>;
}

/**
 * Yazma hatasının metni. 400/403 yanıtlarında sunucunun nedeni her zaman gösterilir: yapılandırılmış hata mesajı varsa
 * "{mesaj} ({sunucu})" biçiminde, yoksa yalnız sunucu mesajı.
 */
function writeErrorText(configured: string, cause: unknown): string {
  const failure = cause as Error & { status?: number; serverError?: string };
  const server = failure.status === 400 || failure.status === 403 ? (failure.serverError || failure.message || "").trim() : "";
  if (configured) return server ? `${configured} (${server})` : configured;
  return failure.serverError || failure.message || "İşlem tamamlanamadı.";
}

/** Sorgu eylemli düğme: hak yoksa gizlenir; yazma türünde isteğe bağlı onay sorar, çalışırken pasif kalır ve sonucu bildirir. */
function QueryActionButton({ query, props, label, runtime, disabled = false, disabledReason = "" }: {
  query: PageQueryDefinition; props: Record<string, unknown>; label: string; runtime: PageRuntime; disabled?: boolean; disabledReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // ERP işlemi yazmaları da (SQL yazmaları gibi) sayfanın insert/update/delete hakkını ister; sunucu yalnız işlemin kendi iznine bakar, istemci bilerek daha sıkıdır.
  const allowed = runtime.rights[query.kind === "read" ? "view" : query.kind] === true;
  const mounted = useRef(true);
  // Okuma yeniden çalıştırmada çift tıklamayı engeller; yazmalar sayfanın ortak kilidini (runtime.writeLock) kullanır.
  const inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!allowed) return null;
  const write = query.kind !== "read";
  const refreshIds = Array.isArray(props.refreshQueries) ? props.refreshQueries.filter((id): id is string => typeof id === "string") : [];
  const bound = (key: string) => interpolate(textValue(props[key]), runtime.scope).trim();

  const click = async () => {
    if (disabled) return;
    setFeedback(null);
    if (!write) {
      if (inFlight.current) return;
      inFlight.current = true;
      try { runtime.rerun([query.id]); } finally { inFlight.current = false; }
      return;
    }
    const result = await runWriteAction({
      query, isPreview: runtime.isPreview, inFlight: runtime.writeLock,
      confirm: {
        enabled: props.confirmEnabled === true, text: bound("confirmText"),
        tone: query.kind === "delete" || query.kind === "update" ? "danger" : "default",
      },
      write: async (target, confirmWrite) => {
        if (mounted.current) setBusy(true);
        try { return await runtime.writeFor(target, confirmWrite); } finally { if (mounted.current) setBusy(false); }
      },
      errorText: (cause) => writeErrorText(bound("errorMessage"), cause),
      validate: () => runtime.validateFor(query),
      ...codeWriteHooks(runtime.events),
    });
    if ("ok" in result && result.ok) {
      if (mounted.current) setFeedback({ tone: "success", text: `${bound("successMessage") || "İşlem tamamlandı."} (${result.affectedRows} kayıt)` });
      runtime.rerun(refreshIds);
    } else if ("error" in result) {
      if (mounted.current) setFeedback({ tone: "error", text: result.error });
    }
  };
  return <div className="tenant-page-query-action">
    <button className={`tenant-page-button${write && (query.kind === "delete" || query.kind === "update") ? " is-danger" : ""}`} type="button"
      disabled={busy || disabled} title={disabled && disabledReason ? disabledReason : undefined} onClick={() => void click()}>{busy ? "Çalışıyor…" : label}</button>
    {disabled && disabledReason && <small className="tenant-page-disabled-reason">{disabledReason}</small>}
    {feedback && <p className={`tenant-page-action-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p>}
  </div>;
}

/** Seçim girişinin seçenekleri (optionsQuery sonucundan); satır başına seçilen sütun değeri ve etiketi. Sayı sütunu için `row` korunur. */
const selectOptions = (props: Record<string, unknown>, optionsState?: QueryState) => {
  const valueColumn = textValue(props.optionValueColumn) || optionsState?.columns[0]?.code || "";
  const labelColumn = textValue(props.optionLabelColumn) || valueColumn;
  return (optionsState?.rows ?? []).map((row) => ({ value: displayText(row[valueColumn]), label: displayText(row[labelColumn]) || displayText(row[valueColumn]), row }));
};

export function PageInput({ component, props, raw, onChange, optionsState, style, error, disabled = false, onBlur, lookup }: {
  component: ComponentDefinition; props: Record<string, unknown>; raw: InputRaw; onChange: (value: InputRaw) => void;
  optionsState?: QueryState; style: CSSProperties; error?: string; disabled?: boolean; onBlur?: () => void; lookup?: LookupBinding;
}) {
  const inputType = textValue(props.inputType, "text");
  const label = textValue(props.label);
  const inputId = `page-input-${component.id}`;
  if (inputType === "lookup") {
    // Arama kutusu yalnız `required` kuralını destekler; bulanıklaşma sarmalayıcıda yakalanır (doğrulama iletisi için).
    return <div className={`tenant-page-input tenant-page-input-lookup${error ? " is-invalid" : ""}`} style={style} onBlur={onBlur}>
      <LookupInput inputId={inputId} label={label} raw={typeof raw === "string" ? raw : ""} placeholder={textValue(props.placeholder)}
        allowClear={props.allowClear === true} disabled={disabled} options={lookup?.options ?? []} loading={lookup?.loading ?? false}
        error={lookup?.error} selected={lookup?.selected} onChange={(value, row, chosenLabel) => (lookup ? lookup.onChange(value, row, chosenLabel) : onChange(value))}
        onSearch={(text) => lookup?.onSearch(text)} />
      {error && <small className="tenant-page-input-error" role="alert">{error}</small>}
    </div>;
  }
  const rules = inputRules(props);
  const invalid = !!error;
  const common = { id: inputId, required: rules.required || undefined, "aria-invalid": invalid || undefined, onBlur };
  const limit = (value: number | string | undefined) =>
    value === undefined ? undefined : inputType === "number" ? (typeof value === "number" ? value : undefined) : inputType === "date" ? (typeof value === "string" ? value : undefined) : undefined;
  let control;
  if (inputType === "checkbox") {
    control = <input {...common} type="checkbox" checked={raw === true} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />;
  } else if (inputType === "select") {
    const options = selectOptions(props, optionsState);
    control = <select {...common} value={typeof raw === "string" ? raw : ""} disabled={disabled || optionsState?.loading} onChange={(event) => onChange(event.target.value)}>
      <option value="">{optionsState?.loading ? "Yükleniyor…" : optionsState && neverRan(optionsState) ? MANUAL_QUERY_IDLE : "Seçin"}</option>
      {options.map((option, index) => <option key={`${index}-${option.value}`} value={option.value}>{option.label}</option>)}
    </select>;
  } else {
    const htmlType = inputType === "number" || inputType === "date" ? inputType : "text";
    control = <input {...common} type={htmlType} disabled={disabled}
      step={inputType === "number" ? rules.step ?? "any" : undefined} min={limit(rules.min)} max={limit(rules.max)}
      maxLength={htmlType === "text" ? rules.maxLength : undefined}
      placeholder={textValue(props.placeholder)} value={typeof raw === "string" ? raw : ""} onChange={(event) => onChange(applyTyping(rules, event.target.value))} />;
  }
  return <div className={`tenant-page-input tenant-page-input-${inputType}${invalid ? " is-invalid" : ""}`} style={style}>
    <label htmlFor={inputId}>{label && <span>{label}</span>}{control}</label>
    {inputType === "select" && optionsState?.error && <QueryError message={optionsState.error} />}
    {error && <small className="tenant-page-input-error" role="alert">{error}</small>}
  </div>;
}

function renderPageInput(component: ComponentDefinition, props: Record<string, unknown>, style: CSSProperties, runtime?: PageRuntime) {
  if (!componentVisible(component, runtime)) return null;
  // İstemci doğrulama iletisi sunucunun alan hatasından önce gelir.
  const error = runtime ? runtime.validationErrors[component.id] ?? (component.name ? runtime.inputErrors[component.name] : undefined) : undefined;
  return <PageInput key={component.id} component={component} props={props} style={style}
    raw={runtime?.inputValues[component.id] ?? ""} onChange={(next) => runtime?.setInput(component.id, next)}
    error={error} disabled={componentDisabled(component, runtime)} onBlur={runtime ? () => runtime.blurInput(component.id) : undefined}
    optionsState={runtime && typeof props.optionsQuery === "string" ? runtime.states[runtime.queryNames[props.optionsQuery]] : undefined}
    lookup={runtime && textValue(props.inputType, "text") === "lookup" ? runtime.lookupFor(component, props) : undefined} />;
}

function renderComponent(component: ComponentDefinition, forms: EmbeddedForm[], token: string, pageCode: string, runtime?: PageRuntime): ReactNode {
  // `visibleWhen` her şeyden önce uygulanır (formCard, sekmeler ve iç içe bileşenler dahil).
  if (!componentVisible(component, runtime)) return null;
  const props = runtime ? bindProps(component.props ?? {}, runtime.scope) : component.props ?? {};
  const style = visualStyle(component.type, props);
  const title = textValue(props.title);
  const text = textValue(props.text ?? props.label);
  const description = textValue(props.description);
  const value = textValue(props.value);
  const children = (component.children ?? []).map((child) => renderComponent(child, forms, token, pageCode, runtime));

  switch (component.type) {
    case "heading": return <h2 key={component.id} className="tenant-page-heading" style={style}>{title || text}</h2>;
    case "text": return <p key={component.id} className="tenant-page-text" style={style}>{text || description}</p>;
    case "label": return <p key={component.id} className="tenant-page-text tenant-page-label" style={style}>{text}</p>;
    case "input": return runtime?.ownedInputs.has(component.id) ? null : renderPageInput(component, props, style, runtime);
    case "formCard": {
      const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
      const owned = runtime ? idList(props.inputs).map((id) => runtime.inputById[id]).filter((input): input is ComponentDefinition => Boolean(input)) : [];
      return <FormCard key={component.id} title={title} columns={columns} style={style}>
        {owned.map((input) => renderPageInput(input, bindProps(input.props ?? {}, runtime!.scope), {}, runtime))}
      </FormCard>;
    }
    case "filterChips": {
      if (!runtime) return null;
      const chips = idList(props.inputs).flatMap((id) => {
        const input = runtime.inputById[id];
        if (!input || !componentVisible(input, runtime)) return [];
        const inputProps = bindProps(input.props ?? {}, runtime.scope);
        const inputType = textValue(inputProps.inputType, "text");
        const optionsState = typeof inputProps.optionsQuery === "string" ? runtime.states[runtime.queryNames[inputProps.optionsQuery]] : undefined;
        const text = chipText(runtime.inputValues[id], inputType, inputType === "select" ? selectOptions(inputProps, optionsState) : undefined);
        return text === null ? [] : [{ id, label: textValue(inputProps.label) || input.name || id, text }];
      });
      const clear = (id: string) => runtime.setInput(id, textValue(runtime.inputById[id]?.props?.inputType, "text") === "checkbox" ? false : "");
      return <FilterChips key={component.id} chips={chips} style={style} onClear={clear} onClearAll={() => chips.forEach((chip) => clear(chip.id))} />;
    }
    case "facetPanel": {
      if (!runtime) return null;
      const counts = Object.fromEntries(parseFieldList(props.facetCounts).map((entry) => [entry.code, entry.label]));
      const groups = idList(props.inputs).flatMap((id): FacetGroup[] => {
        const input = runtime.inputById[id];
        if (!input || !componentVisible(input, runtime)) return [];
        const inputProps = bindProps(input.props ?? {}, runtime.scope);
        if (textValue(inputProps.inputType, "text") !== "select") return [];
        const optionsState = typeof inputProps.optionsQuery === "string" ? runtime.states[runtime.queryNames[inputProps.optionsQuery]] : undefined;
        const countColumn = counts[id];
        const options = selectOptions(inputProps, optionsState).map(({ value, label, row }) => {
          return { value, label, count: countColumn ? facetCount(row[countColumn]) : undefined };
        });
        const raw = runtime.inputValues[id];
        return [{ id, label: textValue(inputProps.label) || input.name || id, options, selected: typeof raw === "string" ? raw : "", loading: Boolean(optionsState?.loading), error: optionsState?.error || undefined, disabled: componentDisabled(input, runtime) }];
      });
      return <FacetPanel key={component.id} title={title} groups={groups} style={style} onSelect={(inputId, next) => runtime.setInput(inputId, next)} />;
    }
    case "contextPanel": {
      if (!runtime) return null;
      const table = typeof props.table === "string" ? runtime.tableById[props.table] : undefined;
      const row = table?.name ? runtime.selections[table.name] ?? null : null;
      const formats = parseColumnFormats(table?.props?.columnFormats);
      const fields = parseFieldList(props.fields).map((field) => ({ ...field, text: row ? formatCell(row[field.code], formats[field.code]) : "" }));
      const relatedState = typeof props.relatedQuery === "string" ? runtime.states[runtime.queryNames[props.relatedQuery]] : undefined;
      const relatedCodes = (relatedState?.columns ?? []).slice(0, 2).map((column) => column.code);
      const related = relatedState ? {
        title: textValue(props.relatedTitle) || "İlgili kayıtlar", loading: relatedState.loading, error: relatedState.error || undefined,
        rows: relatedState.rows.map((relatedRow) => relatedCodes.map((code) => displayText(relatedRow[code])).filter(Boolean).join(" · ")),
      } : undefined;
      return <ContextPanel key={component.id} title={title} row={row} fields={fields} related={related} style={style} />;
    }
    case "metric": {
      const queryName = runtime && typeof props.query === "string" ? runtime.queryNames[props.query] : undefined;
      const tone = runtime ? (["info", "success", "warning", "danger"] as const).find((name) => name === props.variant) ?? "info" : "info";
      const icon = runtime && typeof props.icon === "string" ? props.icon : undefined;
      const trendState = runtime && typeof props.trendQuery === "string" ? runtime.states[runtime.queryNames[props.trendQuery]] : undefined;
      const trend = trendState ? trendPoints(trendState.rows) : undefined;
      const filterInput = typeof props.filterInput === "string" && props.filterInput ? props.filterInput : undefined;
      const filterValue = typeof props.filterValue === "string" ? props.filterValue : "";
      const active = !!runtime && !!filterInput && filterValue !== "" && String(runtime.inputValues[filterInput] ?? "") === filterValue;
      const onActivate = runtime && filterInput && filterValue !== "" ? () => runtime.setInput(filterInput, active ? "" : filterValue) : undefined;
      const card = { tone, icon, trend, active, onActivate };
      if (runtime && queryName && runtime.states[queryName]) return <QueryMetric key={component.id} state={runtime.states[queryName]} title={title || text || "Gösterge"} description={description} style={style} {...card} />;
      return <TenantReportWidget key={component.id} kind="metric" source={props.source} title={title || text || "Gösterge"} description={description} fallbackValue={value} style={style} token={token} {...card} />;
    }
    case "card": case "section": return <section className={`tenant-page-block tenant-page-${component.type}`} style={style} key={component.id}>{title && <h3>{title}</h3>}{description && <p>{description}</p>}{text && <p>{text}</p>}{children}</section>;
    case "divider": return <hr key={component.id} style={style} />;
    case "spacer": return <div className="tenant-page-spacer" style={style} aria-hidden="true" key={component.id} />;
    case "actionBar": {
      const status = runtime?.actionStatus;
      return status ? <div key={component.id} className={`tenant-page-action-status is-${status.tone}`} role={status.tone === "error" ? "alert" : "status"} style={{ gridColumn: style.gridColumn, margin: style.margin }}>{status.text}</div> : null;
    }
    case "button": {
      if (runtime?.movedButtons.has(component.id)) return null;
      const disabled = componentDisabled(component, runtime);
      const reason = disabled ? textValue(props.disabledReason).trim() : "";
      const workflow = props.actionType === "workflow" && typeof props.workflowId === "string";
      return <div className="tenant-page-action" style={style} key={component.id}>
        {props.actionType === "query" && runtime && typeof props.queryId === "string" && runtime.queryById[props.queryId]
          ? <QueryActionButton query={runtime.queryById[props.queryId]} props={props} label={text || title || "Eylem"} runtime={runtime} disabled={disabled} disabledReason={reason} />
          : workflow && !disabled
            ? <TenantWorkflowAction token={token} workflowId={props.workflowId as string} title={text || title || "İş akışını başlat"} pageCode={pageCode} componentId={component.id} />
            : <>
              <button className="tenant-page-button" type="button" disabled title={reason || undefined}>{text || title || (workflow ? "İş akışını başlat" : "Eylem")}</button>
              {reason && <small className="tenant-page-disabled-reason">{reason}</small>}
            </>}
      </div>;
    }
    case "tabs": {
      if (!runtime) return null;
      const tabs = parseTabs(props.tabs);
      const defaultTab = typeof props.defaultTab === "number" ? props.defaultTab : 0;
      // Doğrulanmayan (gizli veya pasif) girişlerin kalan iletileri sayılmaz.
      const errorCounts = tabs.map((tab) => Object.keys(runtime.validationErrors)
        .filter((inputId) => !runtime.skipsValidation(inputId) && runtime.ancestorsOf(inputId).some((id) => tab.ids.includes(id))).length);
      const target = runtime.errorJump?.targets[component.id];
      const jumpTo = runtime.errorJump && target !== undefined ? { tab: target, signal: runtime.errorJump.signal } : null;
      const renderOwned = (id: string) => {
        const owned = runtime.topLevelById[id];
        // Sekme yalnız üst düzey bileşen sahiplenir; sekme içinde sekme ve İşlem Çubuğu çizilmez.
        if (!owned || owned.type === "tabs" || owned.type === "actionBar") return null;
        return renderComponent(owned, forms, token, pageCode, runtime);
      };
      return <PageTabs key={component.id} id={component.id} tabs={tabs} defaultTab={defaultTab} renderOwned={renderOwned}
        errorCounts={errorCounts} jumpTo={jumpTo} style={style} />;
    }
    case "dataTable": {
      const columns = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string").slice(0, 20) : [];
      const queryName = runtime && typeof props.query === "string" ? runtime.queryNames[props.query] : undefined;
      if (runtime && queryName && runtime.states[queryName]) {
        const tableName = component.name;
        const totals = Array.isArray(props.totals) ? props.totals.filter((code): code is string => typeof code === "string") : [];
        const state = runtime.states[queryName];
        const pager = runtime.tablePaging(component);
        let paging: TablePaging | undefined;
        if (pager) {
          const searchInput = typeof props.searchInput === "string" ? runtime.inputById[props.searchInput.trim()] : undefined;
          paging = {
            ...pager,
            meta: parseFieldList(props.footerMeta).map((item) => ({ label: item.label, value: cellText(state.meta?.[item.code]) })),
            search: searchInput ? renderPageInput(searchInput, bindProps(searchInput.props ?? {}, runtime.scope), {}, runtime) : undefined,
          };
        }
        return <QueryTable key={component.id} state={state} columns={columns} title={title || "Kayıtlar"} description={description} style={style}
          formats={parseColumnFormats(props.columnFormats)} toneMap={parseToneMap(props.toneMap)} totals={totals} density={props.density === "comfort" ? "comfort" : "dense"}
          selected={tableName ? runtime.selections[tableName] : undefined} onSelect={tableName ? (row) => runtime.select(tableName, row) : undefined} paging={paging} />;
      }
      return <TenantReportWidget key={component.id} kind="dataTable" source={props.source} columns={columns} title={title || "Kayıtlar"} description={description} style={style} token={token} rowActionsEnabled={props.rowActionsEnabled === true} rowActionWorkflowId={textValue(props.rowActionWorkflowId) || undefined} rowActionLabel={textValue(props.rowActionLabel, "İşlemi başlat")} pageCode={pageCode} componentId={component.id} columnFormats={props.columnFormats} toneMap={props.toneMap} density={props.density} />;
    }
    case "form": {
      const formCode = textValue(props.formCode);
      const form = forms.find((item) => item.code === formCode);
      return form ? <div key={component.id} className="tenant-page-form-wrap" style={style}><EmbeddedCustomForm form={form} token={token} /></div> : <section className="tenant-page-block tenant-page-form" style={style} key={component.id}><h3>{title || "Form"}</h3><p>Bu sayfa için seçilen form artık yayımlanmış değil.</p></section>;
    }
    case "code": return <CodeFrame key={component.id} id={component.id} css={textValue(props.css)} javascript={textValue(props.javascript)}
      hidden={props.hidden === true} style={style} title={title || "Yalıtılmış özel kod"} host={runtime?.codeHost ?? INERT_CODE_HOST} events={runtime?.events ?? INERT_PAGE_EVENTS} />;
    case "alert": {
      const variant = ["success", "warning", "danger", "info"].includes(textValue(props.variant)) ? textValue(props.variant) : "info";
      return <aside key={component.id} className={`tenant-page-alert tone-${variant}`} style={style} role={variant === "danger" ? "alert" : "status"}><strong>{title || "Bilgilendirme"}</strong>{text && <p>{text}</p>}</aside>;
    }
    case "badge": {
      return <PageBadge key={component.id} text={text || title || "Durum"} variant={props.variant} toneMap={props.toneMap} style={style} />;
    }
    case "list": {
      const items = Array.isArray(props.items) ? props.items.filter((item): item is string => typeof item === "string").slice(0, 40) : [];
      return <section key={component.id} className="tenant-page-block tenant-page-list" style={style}>{title && <h3>{title}</h3>}{description && <p>{description}</p>}{items.length ? <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>Henüz liste öğesi eklenmedi.</p>}</section>;
    }
    case "progress": {
      const progress = Math.max(0, Math.min(100, Number(props.value) || 0));
      return <section key={component.id} className="tenant-page-block tenant-page-progress" style={style}><div><strong>{title || "İlerleme"}</strong><span>{progress}%</span></div><progress max={100} value={progress} aria-label={title || "İlerleme"} /></section>;
    }
    default: return null;
  }
}

const inputIsCheckbox = (input: ComponentDefinition | undefined) => textValue(input?.props?.inputType, "text") === "checkbox";

/** Sayfa yazma yollarının kod bileşeni kancaları: beforeSave sorusu ve afterSave olayı. */
const codeWriteHooks = (events: PageEvents) => ({
  beforeWrite: (query: PageQueryDefinition) => events.beforeSave(query.name),
  afterWrite: (query: PageQueryDefinition, result: WriteResult) => events.emit("afterSave", { query: query.name, sonuc: result.sonuc ?? null }),
});

/** v1 sayfalarda bağlama/sorgu yoktur: köprü yalnız yüksekliği ve abonelikleri kabul eder, veri isteklerini reddeder. */
const V1_BRIDGE_ERROR = "Bu sayfada kod köprüsü kullanılamaz.";
const INERT_CODE_HOST: BridgeHost = {
  get: () => { throw new Error(V1_BRIDGE_ERROR); },
  setInput: () => { throw new Error(V1_BRIDGE_ERROR); },
  runQuery: async () => { throw new Error(V1_BRIDGE_ERROR); },
  callOperation: async () => { throw new Error(V1_BRIDGE_ERROR); },
  subscribe: () => undefined,
  setHeight: () => undefined,
};
const INERT_PAGE_EVENTS = createPageEvents();

const NO_RIGHTS = "Bu işlem için yetkiniz yok.";
const WRITE_BUSY = "Başka bir yazma işlemi sürüyor; biraz sonra yeniden deneyin.";
const CATALOG_WAIT_MS = 10_000;

/**
 * Sayfadaki `actionBar` bileşeninin komutlarını kabuğun İşlem Çubuğu'na kaydeder (yalnız actionBar varken bağlanır;
 * kalkınca kayıt da kalkar). Tüm yazma yolları tek uçuş kilidini paylaşır.
 */
function PageActionCommands({ barProps, runtime, page, token, flat, loadIds, onStatus, onBusy, busy }: {
  barProps: Record<string, unknown>; runtime: PageRuntime; page: PublishedPage; token: string; flat: ComponentDefinition[];
  loadIds: string[]; onStatus: (status: ActionStatus | null) => void; onBusy: (busy: boolean) => void; busy: boolean;
}) {
  const inFlight = runtime.writeLock;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latest = useRef(runtime);
  latest.current = runtime;
  const buttonProps = (component: ComponentDefinition) => bindProps(component.props ?? {}, latest.current.scope);
  const buttonLabel = (id: string) => {
    const component = flat.find((item) => item.id === id && item.type === "button");
    if (!component) return undefined;
    const props = buttonProps(component);
    const label = textValue(props.text ?? props.label) || textValue(props.title);
    if (props.actionType === "workflow" && typeof props.workflowId === "string" && props.workflowId) return label || "İş akışını başlat";
    const query = props.actionType === "query" && typeof props.queryId === "string" ? runtime.queryById[props.queryId] : undefined;
    if (!query || runtime.rights[query.kind === "read" ? "view" : query.kind] !== true) return undefined;
    return label || "Eylem";
  };

  const writeThroughBar = async (query: PageQueryDefinition, confirm: Parameters<typeof runWriteAction>[0]["confirm"], successText: string, errorPrefix: string, extraRefresh: string[] = []) => {
    onStatus(null);
    const result = await runWriteAction({
      query, isPreview: latest.current.isPreview, inFlight, confirm,
      write: async (target, confirmWrite) => {
        if (mounted.current) onBusy(true);
        try { return await latest.current.writeFor(target, confirmWrite); } finally { if (mounted.current) onBusy(false); }
      },
      errorText: (cause) => writeErrorText(errorPrefix, cause),
      validate: () => latest.current.validateFor(query),
      ...codeWriteHooks(latest.current.events),
    });
    if (!mounted.current || !("ok" in result)) return;
    if (result.ok) {
      onStatus({ tone: "success", text: `${successText} (${result.affectedRows} kayıt)` });
      latest.current.rerun([...new Set([...loadIds, ...extraRefresh])]);
    } else if ("error" in result) onStatus({ tone: "error", text: result.error });
  };

  const runButton = (id: string) => {
    const component = flat.find((item) => item.id === id && item.type === "button");
    if (!component) return;
    // Menü komutu oluşturulduktan sonra koşul değişmiş olabilir: gizli veya pasif düğme çalışmaz.
    if (!componentVisible(component, latest.current) || componentDisabled(component, latest.current)) return;
    const props = buttonProps(component);
    const bound = (key: string) => interpolate(textValue(props[key]), latest.current.scope).trim();
    if (props.actionType === "workflow" && typeof props.workflowId === "string") {
      const title = textValue(props.text ?? props.label) || textValue(props.title) || "İş akışını başlat";
      if (inFlight.current) return;
      inFlight.current = true;
      onStatus(null);
      void startPageWorkflow(token, props.workflowId, title, page.code, id)
        .then(() => { if (mounted.current) onStatus({ tone: "success", text: "İş akışı başlatıldı." }); })
        .catch((cause: unknown) => { if (mounted.current) onStatus({ tone: "error", text: (cause as Error).message || "İş akışı başlatılamadı." }); })
        .finally(() => { inFlight.current = false; });
      return;
    }
    const query = typeof props.queryId === "string" ? latest.current.queryById[props.queryId] : undefined;
    if (!query) return;
    if (query.kind === "read") { latest.current.rerun([query.id]); return; }
    const refresh = Array.isArray(props.refreshQueries) ? props.refreshQueries.filter((item): item is string => typeof item === "string") : [];
    void writeThroughBar(query, {
      enabled: props.confirmEnabled === true, text: bound("confirmText"),
      tone: query.kind === "delete" || query.kind === "update" ? "danger" : "default",
    }, bound("successMessage") || "İşlem tamamlandı.", bound("errorMessage"), refresh);
  };

  const exportTable = async (tableId: string) => {
    const current = latest.current;
    const table = current.tableById[tableId];
    const state = table && typeof table.props?.query === "string" ? current.states[current.queryNames[table.props.query]] : undefined;
    if (!table || !state) return;
    const chosen = Array.isArray(table.props?.columns) ? table.props.columns.filter((column): column is string => typeof column === "string").slice(0, 20) : [];
    const title = interpolate(textValue(table.props?.title), current.scope).trim() || "Liste";
    onStatus(null);
    try {
      await downloadXlsx(`${page.code}.xlsx`, title, exportRows(state.columns, state.rows, chosen));
      // Sunucu sayfalı liste her zaman "kesilmiş"tir: yalnız görünen sayfa aktarılır ve bu bildirilir.
      if (mounted.current && table.props?.paging === "server") onStatus({ tone: "warning", text: `Yalnız görünen sayfa aktarıldı (${state.rows.length} satır).` });
      else if (mounted.current && state.truncated) onStatus({ tone: "warning", text: `Liste ilk ${state.rows.length} satırla sınırlı` });
    } catch (cause) {
      if (mounted.current) onStatus({ tone: "error", text: (cause as Error).message || "Excel dosyası oluşturulamadı." });
    }
  };

  usePageCommands(buildPageCommands(barProps, {
    rights: runtime.rights, busy,
    queryKind: (id) => runtime.queryById[id]?.kind,
    inputIds: new Set(Object.keys(runtime.inputById)),
    tableState: (tableId) => {
      const table = runtime.tableById[tableId];
      const state = table && typeof table.props?.query === "string" ? runtime.states[runtime.queryNames[table.props.query]] : undefined;
      return state ? { loading: state.loading || neverRan(state), error: state.error || undefined, rowCount: state.rowCount } : undefined;
    },
    buttonLabel,
    buttonGate: (id) => {
      const component = flat.find((item) => item.id === id && item.type === "button");
      if (!component) return undefined;
      if (!componentVisible(component, runtime)) return { hidden: true };
      if (!componentDisabled(component, runtime)) return undefined;
      return { disabled: true, disabledReason: textValue(buttonProps(component).disabledReason).trim() || BUTTON_UNAVAILABLE };
    },
    deleteNeedsSelection: (() => {
      const deleteQuery = latest.current.queryById[typeof barProps.deleteQuery === "string" ? barProps.deleteQuery.trim() : ""];
      return !!deleteQuery && deleteQuery.parameters.some((parameter) => {
        const table = /^([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir(?:\.|$)/.exec(bindingPath(parameter.binding) ?? "")?.[1];
        return !!table && !runtime.selections[table];
      });
    })(),
    run: {
      clearInputs: (ids) => ids.forEach((id) => latest.current.setInput(id, inputIsCheckbox(latest.current.inputById[id]) ? false : "")),
      write: (queryId, kind) => {
        const query = latest.current.queryById[queryId];
        if (!query) return;
        if (kind === "save") void writeThroughBar(query, { enabled: false }, "İşlem tamamlandı.", "");
        else void writeThroughBar(query, { enabled: true, title: "Kayıt silinsin mi?", confirmLabel: "Sil", tone: "danger" }, "İşlem tamamlandı.", "");
      },
      refresh: () => latest.current.rerun(loadIds),
      focus: (inputId) => document.getElementById(`page-input-${inputId}`)?.focus(),
      print: () => window.print(),
      exportTable: (tableId) => void exportTable(tableId),
      button: runButton,
    },
  }));
  return null;
}

/** Sayfa içeriği: v2 tanımlarda sorguları çalıştırır, girişleri ve ızgara seçimini tutar, bağlama kapsamını kurar. v1'de bağlama yoktur. */
function PageBody({ page, components, queryDefinitions, isV2, token, previewId }: {
  page: PublishedPage; components: ComponentDefinition[]; queryDefinitions: ReturnType<typeof readPageQueries>; isV2: boolean; token: string; previewId?: string;
}) {
  const [touched, setTouched] = useState<Record<string, InputRaw>>({});
  const [selections, setSelections] = useState<Record<string, Record<string, unknown> | null>>({});
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const flat = useMemo(() => flattenComponents(components), [components]);
  const bar = useMemo(() => (isV2 ? actionBarOf(flat) : null), [isV2, flat]);
  const queryIdSet = useMemo(() => new Set(queryDefinitions.map((query) => query.id)), [queryDefinitions]);
  const movedButtons = useMemo(() => (bar ? movedButtonIds(flat, (button) => {
    const props = button.props ?? {};
    if (props.actionType === "workflow") return typeof props.workflowId === "string" && props.workflowId.trim() !== "";
    return props.actionType === "query" && typeof props.queryId === "string" && queryIdSet.has(props.queryId);
  }) : new Set<string>()), [bar, flat, queryIdSet]);
  // Sayfadaki tüm yazma yolları (sorgu düğmeleri ve İşlem Çubuğu) için tek uçuş kilidi.
  const writeLock = useRef(false);
  const user = useMemo(() => sessionUser(token), [token]);
  const inputs = useMemo(() => flattenComponents(components).filter((component) => component.type === "input"), [components]);
  const queryById = useMemo(() => Object.fromEntries(queryDefinitions.map((query) => [query.id, query])), [queryDefinitions]);
  // {{sayilar.x}}: yalnız sayfada geçen rapor kaynaklarının kayıt sayısı getirilir.
  const countCodes = useMemo(() => isV2
    ? referencedCountCodes(collectTexts([flattenComponents(components).map((component) => component.props ?? {}), queryDefinitions.map((query) => query.parameters)]))
    : [], [isV2, components, queryDefinitions]);
  const counts = usePageCounts(countCodes, token);
  const queryNames = useMemo(() => Object.fromEntries(queryDefinitions.map((query) => [query.id, query.name])), [queryDefinitions]);
  // formCard/facetPanel girişleri ve sayfalı listelerin arama girişleri üst düzeyde ayrıca çizilmez.
  const ownedInputs = useMemo(() => {
    const layout = flattenComponents(components).map((component) => ({ id: component.id, type: component.type, props: component.props }));
    return new Set([...ownedInputIds(layout), ...(isV2 ? tableSearchInputIds(layout) : [])]);
  }, [components, isV2]);
  const pagedTables = useMemo(() => (isV2 ? flat.filter((component) => component.type === "dataTable" && component.props?.paging === "server" && !!component.name) : []), [isV2, flat]);
  const inputById = useMemo(() => Object.fromEntries(inputs.map((input) => [input.id, input])), [inputs]);
  const tableById = useMemo(() => Object.fromEntries(flattenComponents(components).filter((component) => component.type === "dataTable").map((table) => [table.id, table])), [components]);
  const flatById = useMemo(() => Object.fromEntries(flat.map((component) => [component.id, component])), [flat]);
  const topLevelById = useMemo(() => Object.fromEntries(components.map((component) => [component.id, component])), [components]);
  const tabOwned = useMemo(() => (isV2 ? tabOwnedIds(flat) : new Set<string>()), [isV2, flat]);
  // Sahip zinciri: iç içe çocuk → üst bileşen, formCard/facetPanel girişi → kart, sekmenin bileşeni → sekmeler.
  const parentOf = useMemo(() => {
    const map: Record<string, string> = {};
    const walk = (list: ComponentDefinition[], parent?: string) => list.forEach((component) => {
      if (parent) map[component.id] = parent;
      walk(component.children ?? [], component.id);
    });
    walk(components);
    for (const component of flat) {
      if (component.type === "formCard" || component.type === "facetPanel") for (const id of idList(component.props?.inputs)) map[id] = component.id;
      // Sayfalı listenin arama girişi liste başlığında çizilir: görünürlüğü ve sekme hata zinciri listeyi izler.
      if (component.type === "dataTable" && component.props?.paging === "server" && typeof component.props.searchInput === "string") {
        const searchId = component.props.searchInput.trim();
        if (searchId && !(searchId in map)) map[searchId] = component.id;
      }
    }
    for (const component of flat) {
      if (component.type !== "tabs") continue;
      for (const tab of parseTabs(component.props?.tabs)) for (const id of tab.ids) if (!(id in map)) map[id] = component.id;
    }
    return map;
  }, [components, flat]);
  const ancestorsOf = (componentId: string): string[] => {
    const chain: string[] = [];
    for (let id: string | undefined = componentId; id !== undefined && !chain.includes(id); id = parentOf[id]) chain.push(id);
    return chain;
  };
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [errorJump, setErrorJump] = useState<PageRuntime["errorJump"]>(null);
  // Arama kutuları: yazılan metin ve seçim anında saklanan satır (yalnız değer hâlâ aynıyken geçerli).
  const [lookupState, setLookupState] = useState<Record<string, { search: string; value?: string; row?: Record<string, unknown> | null; label?: string }>>({});
  // Sayfalı listeler: sayfa, hangi sorgu değerleri (sayfa parametreleri hariç) ve arama metniyle seçildiyse o anahtarla saklanır.
  const [tablePages, setTablePages] = useState<Record<string, { page: number; key: string }>>({});

  /** Girişin kapsamdaki nesnesi; arama kutusunda `search` (minChars altında null) ve `seciliSatir` da vardır. */
  const inputScope = (input: ComponentDefinition, raw: InputRaw, states: Record<string, QueryState>): Record<string, unknown> => {
    const inputType = textValue(input.props?.inputType, "text");
    const value = scopeInputValue(inputType, raw);
    if (inputType !== "lookup") return { value };
    const stored = lookupState[input.id];
    const search = stored?.search ?? "";
    const minChars = typeof input.props?.minChars === "number" ? input.props.minChars : 1;
    const text = typeof raw === "string" ? raw : "";
    let seciliSatir: Record<string, unknown> | null = null;
    if (stored && "value" in stored && stored.value === text) seciliSatir = stored.row ?? null;
    else if (text !== "") {
      // Değer dışarıdan geldi (varsayılan, setInput): eşleşen sorgu satırı; sabit veya bilinmeyen seçenekte null.
      const optionsId = input.props?.optionsQuery;
      const optionsState = typeof optionsId === "string" ? states[queryNames[optionsId]] : undefined;
      seciliSatir = lookupCandidates(input.props ?? {}, optionsState, "", false).find((option) => option.value === text)?.row ?? null;
    }
    return { value, search: search.length >= minChars ? search : null, seciliSatir };
  };
  /** Sayfalı listenin sayfası: saklanan anahtar güncel sorgu değerleriyle (sayfa parametreleri hariç) ve arama metniyle eşleşmezse 1. */
  const tablePageInfo = (table: ComponentDefinition, scope: PageScope, raw: Record<string, InputRaw>) => {
    const props = table.props ?? {};
    const pageSize = typeof props.pageSize === "number" && Number.isInteger(props.pageSize) && props.pageSize >= 5 && props.pageSize <= 100 ? props.pageSize : 25;
    const pageParam = textValue(props.pageParam) || "page";
    const pageSizeParam = textValue(props.pageSizeParam) || "pageSize";
    const query = typeof props.query === "string" ? queryById[props.query] : undefined;
    const values = query ? resolveQueryParameters({ ...query, parameters: query.parameters.filter((parameter) => parameter.name !== pageParam && parameter.name !== pageSizeParam) }, scope) : null;
    const searchId = typeof props.searchInput === "string" ? props.searchInput.trim() : "";
    const key = JSON.stringify([values, searchId ? raw[searchId] ?? "" : null]);
    const stored = tablePages[table.name!];
    return { page: stored && stored.key === key ? stored.page : 1, pageSize, key };
  };

  // Kapsam: oturum + sorgu durumları + ızgara seçimleri + girişler. Girişin varsayılanı yalnız sorgu/oturum/dokunulmuş
  // girişlerden çözülür (başka girişin varsayılanına bağlanamaz), böylece döngü oluşmaz.
  const effective = (states: Record<string, QueryState>) => {
    const base: PageScope = { kullanici: user, bugun: localToday(), [COUNTS_ROOT]: counts, ...states };
    for (const [name, row] of Object.entries(selections)) base[name] = { seciliSatir: row };
    // Sayfalı listenin kapsamı seçimden önce de vardır (ilk istek sayfa 1 ile gider); kesin sayfa girişlerden sonra çözülür.
    for (const table of pagedTables) base[table.name!] = { seciliSatir: selections[table.name!] ?? null, sayfa: tablePages[table.name!]?.page ?? 1, sayfaBoyutu: 25 };
    for (const input of inputs) {
      if (input.name && input.id in touched) base[input.name] = inputScope(input, touched[input.id], states);
    }
    const scope: PageScope = { ...base };
    const raw: Record<string, InputRaw> = {};
    for (const input of inputs) {
      const inputType = textValue(input.props?.inputType, "text");
      raw[input.id] = input.id in touched ? touched[input.id] : rawInputDefault(inputType, interpolate(textValue(input.props?.defaultValue), base));
      if (input.name) scope[input.name] = inputScope(input, raw[input.id], states);
    }
    const pages: Record<string, { page: number; pageSize: number; key: string }> = {};
    for (const table of pagedTables) {
      const info = tablePageInfo(table, scope, raw);
      pages[table.name!] = info;
      scope[table.name!] = { seciliSatir: selections[table.name!] ?? null, sayfa: info.page, sayfaBoyutu: info.pageSize };
    }
    return { scope, raw, pages };
  };

  // ERP işlem kataloğu yalnız işlem kullanan sayfalarda getirilir; SQL sorgulu sayfalar ek istek yapmaz.
  // Kod bileşeni callOperation çağırınca katalog ilk kez o an istenir (kod kullanmayan sayfalar ek istek yapmaz).
  const usesOperations = isV2 && queryDefinitions.some((query) => query.operation !== undefined);
  const [codeWantsOperations, setCodeWantsOperations] = useState(false);
  const erpOperations = useErpOperations(token, usesOperations || codeWantsOperations);
  const { states, scope, rerun, runWrite, runRead, callOperation } = usePageQueries({
    queries: isV2 ? queryDefinitions : [], token, pageCode: page.code, previewId, buildScope: (current) => effective(current).scope,
    operations: erpOperations.operations,
  });
  const inputErrors = operationInputErrors(queryDefinitions, states);
  const events = useMemo(() => createPageEvents(), []);
  const rights = page.rights ?? { view: true };
  const isPreview = Boolean(previewId);
  const writeFor = (query: PageQueryDefinition, confirmWrite: boolean) => runWrite(query, resolveQueryParameters(query, scope), confirmWrite);

  // Sayfa yüklendi: açılış sorgularının hiçbiri yüklenmiyorken load bir kez yayımlanır. ERP kataloğu yüklenemediyse
  // işlem sorguları hiç çalışmaz; onlar sonuçlanmış sayılır (load yine yayımlanır).
  const operationsFailed = Boolean(erpOperations.error);
  const loadSettled = isV2 && queryDefinitions.every((query) => query.kind !== "read" || query.runOn !== "load"
    || (query.operation !== undefined && operationsFailed) || !states[query.name]?.loading);
  useEffect(() => { if (loadSettled && !events.isLoaded()) events.emit("load", {}); }, [loadSettled, events]);

  // Köprü (BridgeHost) bir kez kurulur ve sayfanın en güncel durumunu okur; çerçeve her girdiye güvenilmez gözle bakar.
  const codeLatest = useRef({ scope, inputs, queryDefinitions, rights, isPreview, writeFor, runRead, callOperation, erpOperations });
  codeLatest.current = { scope, inputs, queryDefinitions, rights, isPreview, writeFor, runRead, callOperation, erpOperations };
  // İstemci giriş doğrulaması (aşağıda tanımlanır); köprünün yazma yolu da diğer yazma yolları gibi önce doğrular.
  const codeValidate = useRef<(query: PageQueryDefinition) => string | null>(() => null);
  const catalogWaiters = useRef(new Set<() => void>());
  useEffect(() => {
    if (!erpOperations.operations && !erpOperations.error) return;
    const waiters = [...catalogWaiters.current];
    catalogWaiters.current.clear();
    waiters.forEach((wake) => wake());
  }, [erpOperations.operations, erpOperations.error]);
  useEffect(() => () => { catalogWaiters.current.forEach((wake) => wake()); catalogWaiters.current.clear(); }, []);
  const codeHost = useMemo<BridgeHost>(() => {
    const catalog = async (): Promise<Map<string, ErpOperation>> => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { operations, error } = codeLatest.current.erpOperations;
        if (operations) return operations;
        if (error) throw new Error(`ERP işlem kataloğu yüklenemedi: ${error}`);
        if (attempt === 1) break;
        setCodeWantsOperations(true);
        await new Promise<void>((resolve) => {
          const wake = () => { clearTimeout(timer); catalogWaiters.current.delete(wake); resolve(); };
          const timer = setTimeout(wake, CATALOG_WAIT_MS);
          catalogWaiters.current.add(wake);
        });
      }
      throw new Error("ERP işlem kataloğu yüklenemedi.");
    };
    return {
      get: (path) => resolvePath(codeLatest.current.scope, path),
      setInput: (name, value) => {
        const input = codeLatest.current.inputs.find((candidate) => candidate.name === name);
        if (!input) throw new Error(`Giriş bulunamadı: ${name}`);
        const raw: InputRaw = inputIsCheckbox(input) ? value === true || value === "true" : value === null ? "" : String(value);
        setTouched((current) => ({ ...current, [input.id]: raw }));
      },
      runQuery: async (name) => {
        const current = codeLatest.current;
        const query = current.queryDefinitions.find((candidate) => candidate.name === name);
        if (!query) throw new Error(`Sorgu bulunamadı: ${name}`);
        if (current.rights[query.kind === "read" ? "view" : query.kind] !== true) throw new Error(NO_RIGHTS);
        if (query.kind === "read") {
          const state = await current.runRead(query.id);
          return { rows: state.rows, rowCount: state.rowCount };
        }
        const outcome = await runWriteAction({
          query, isPreview: current.isPreview, inFlight: writeLock, confirm: { enabled: false },
          write: (target, confirmWrite) => codeLatest.current.writeFor(target, confirmWrite),
          validate: () => codeValidate.current(query),
          errorText: (cause) => writeErrorText("", cause),
          ...codeWriteHooks(events),
        });
        if (outcome.ok) return { affectedRows: outcome.affectedRows, sonuc: outcome.sonuc ?? null };
        if ("busy" in outcome) throw new Error(WRITE_BUSY);
        if ("cancelled" in outcome) throw new Error("İşlem iptal edildi.");
        throw new Error(outcome.error);
      },
      callOperation: async (name, values) => {
        const op = (await catalog()).get(name);
        if (!op) throw new Error(`ERP işlemi bulunamadı: ${name}`);
        const current = codeLatest.current;
        // Yazma işlemi sayfanın ekle/güncelle/sil hakkını ister; tutarsız (yazma + pageKind "read") giriş reddedilir.
        const right = op.kind === "read" ? "view" : op.pageKind === "read" ? null : op.pageKind;
        if (!op.allowed || !right || current.rights[right] !== true) throw new Error(NO_RIGHTS);
        if (op.kind === "read") {
          const mapped = mapOperationResult(op, await current.callOperation(op, values));
          return { rows: mapped.rows, rowCount: mapped.rowCount };
        }
        if (current.isPreview) throw new Error("Önizlemede ERP yazma işlemi çalıştırılmaz.");
        if (writeLock.current) throw new Error(WRITE_BUSY);
        writeLock.current = true;
        try { return { sonuc: await current.callOperation(op, values) }; } finally { writeLock.current = false; }
      },
      subscribe: () => undefined,
      setHeight: () => undefined,
    };
  }, [events]);

  const current = effective(states);
  const inputValues = current.raw;
  // Arama metni veya listenin sorgu değerleri değişti: sayfa 1'e döner ve öyle saklanır (eski anahtara dönülse de 1 kalır).
  const stalePages = Object.entries(current.pages).filter(([name, info]) => tablePages[name] && tablePages[name].key !== info.key);
  const stalePageSignature = JSON.stringify(stalePages.map(([name, info]) => [name, info.key]));
  useEffect(() => {
    if (stalePages.length === 0) return;
    setTablePages((previous) => {
      const next = { ...previous };
      for (const [name, info] of stalePages) next[name] = { page: 1, key: info.key };
      return next;
    });
  }, [stalePageSignature]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Girişin istemci doğrulama iletisi (yoksa null); kurallar girişin kendi özelliklerinden okunur. */
  const inputMessage = (componentId: string, raw: InputRaw | undefined): string | null => {
    const input = inputById[componentId];
    if (!input) return null;
    return validateInputValue(textValue(input.props?.inputType, "text"), inputRules(input.props ?? {}), raw ?? "");
  };
  const storeMessage = (componentId: string, message: string | null) => setValidationErrors((current) => {
    if (message === null) {
      if (!(componentId in current)) return current;
      const next = { ...current };
      delete next[componentId];
      return next;
    }
    return current[componentId] === message ? current : { ...current, [componentId]: message };
  });
  // Doğrulanmayan girişler: kendisi veya bir sahibi `visibleWhen` ile gizli, ya da kendisi `disabledWhen` ile pasif.
  const skipsValidation = (input: ComponentDefinition) =>
    ancestorsOf(input.id).some((id) => flatById[id] && !conditionHolds(flatById[id].props?.visibleWhen, scope, true))
    || conditionHolds(input.props?.disabledWhen, scope, false);
  const validateFor = (query: PageQueryDefinition): string | null => {
    const names = boundInputNames(query);
    // Arama kutusu `{{ad.seciliSatir…}}` ile de bağlanabilir: o zaman da doğrulanır.
    for (const parameter of query.parameters) {
      const root = /^([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir(?:\.|$)/.exec(bindingPath(parameter.binding) ?? "")?.[1];
      if (root && !names.includes(root) && inputs.some((input) => input.name === root && textValue(input.props?.inputType, "text") === "lookup")) names.push(root);
    }
    const failures: Record<string, string> = {};
    const cleared: string[] = [];
    for (const input of inputs) {
      if (!input.name || !names.includes(input.name)) continue;
      const message = skipsValidation(input) ? null : inputMessage(input.id, inputValues[input.id]);
      if (message) failures[input.id] = message; else cleared.push(input.id);
    }
    setValidationErrors((current) => {
      const next = { ...current, ...failures };
      for (const id of cleared) delete next[id];
      return next;
    });
    const failing = Object.keys(failures);
    if (failing.length === 0) return null;
    // Her sekmeler bileşeninde (sekme sırasıyla) geçersiz girişi doğrudan veya bir sahip üzerinden içeren ilk sekme.
    const targets: Record<string, number> = {};
    for (const component of flat) {
      if (component.type !== "tabs") continue;
      const index = parseTabs(component.props?.tabs).findIndex((tab) => failing.some((id) => ancestorsOf(id).some((owner) => tab.ids.includes(owner))));
      if (index >= 0) targets[component.id] = index;
    }
    setErrorJump((current) => ({ signal: (current?.signal ?? 0) + 1, targets }));
    return VALIDATION_BLOCKED;
  };

  codeValidate.current = validateFor;

  const setInput = (componentId: string, value: InputRaw) => {
    setTouched((previous) => ({ ...previous, [componentId]: value }));
    // Gösterilen ileti, değer geçerli olunca kalkar (geçersiz kaldıkça güncel iletiyle kalır).
    const message = inputMessage(componentId, value);
    setValidationErrors((previous) => {
      if (!(componentId in previous)) return previous;
      const next = { ...previous };
      if (message) next[componentId] = message; else delete next[componentId];
      return next;
    });
  };
  const lookupFor = (component: ComponentDefinition, props: Record<string, unknown>): LookupBinding => {
    const optionsId = typeof props.optionsQuery === "string" ? props.optionsQuery : "";
    const optionsState = optionsId ? states[queryNames[optionsId]] : undefined;
    // Sunucu araması: seçenek sorgusunun bir parametresi `{{<ad>.search}}` bağlıyor; değilse satırlar istemcide süzülür.
    const serverSearch = !!component.name && !!queryById[optionsId]?.parameters.some((parameter) => bindingPath(parameter.binding) === `${component.name}.search`);
    const id = component.id;
    return {
      options: lookupOptionsWithValue(props, optionsState, lookupState[id]?.search ?? "", serverSearch, textValue(inputValues[id])),
      loading: Boolean(optionsState?.loading), error: optionsState?.error || undefined,
      onSearch: (text) => setLookupState((previous) => ({ ...previous, [id]: { ...previous[id], search: text } })),
      selected: lookupState[id] && "value" in lookupState[id] ? { value: lookupState[id].value ?? "", label: lookupState[id].label ?? "" } : null,
      onChange: (value, row, label) => {
        setLookupState((previous) => ({ ...previous, [id]: { search: previous[id]?.search ?? "", value, row, label } }));
        setInput(id, value);
      },
    };
  };
  const tablePaging = (table: ComponentDefinition) => {
    const name = table.name;
    const info = name && table.props?.paging === "server" ? current.pages[name] : undefined;
    if (!name || !info) return undefined;
    return { page: info.page, pageSize: info.pageSize, onPage: (page: number) => setTablePages((previous) => ({ ...previous, [name]: { page: Math.max(1, page), key: info.key } })) };
  };

  const runtime: PageRuntime | undefined = isV2 ? {
    scope, states, queryNames, inputValues, setInput, lookupFor, tablePaging,
    validationErrors, validateFor, errorJump,
    skipsValidation: (inputId) => !!inputById[inputId] && skipsValidation(inputById[inputId]),
    blurInput: (componentId) => storeMessage(componentId, inputMessage(componentId, inputValues[componentId])),
    tabOwned, topLevelById, ancestorsOf,
    selections,
    select: (tableName, row) => {
      setSelections((current) => ({ ...current, [tableName]: row }));
      // Güncelleyicinin dışında: StrictMode güncelleyiciyi iki kez çalıştırır.
      events.emit("select", { table: tableName, row });
    },
    queryById, inputErrors, ownedInputs, inputById, tableById, rights, rerun, isPreview,
    writeFor, events, codeHost,
    movedButtons, writeLock, actionStatus,
  } : undefined;

  return <div className="tenant-custom-page-content">
    {runtime && bar && conditionHolds(bar.props.visibleWhen, scope, true) && <PageActionCommands barProps={bar.props} runtime={runtime} page={page} token={token} flat={flat}
      loadIds={queryDefinitions.filter((query) => query.kind === "read" && query.runOn === "load").map((query) => query.id)} onStatus={setActionStatus} onBusy={setActionBusy} busy={actionBusy} />}
    {usesOperations && erpOperations.error && <QueryError message={`ERP işlem kataloğu yüklenemedi: ${erpOperations.error}`} />}
    {components.filter((component) => !tabOwned.has(component.id)).map((component) => renderComponent(component, page.forms ?? [], token, page.code, runtime))}
  </div>;
}

/** Sorgu durumlarındaki ERP doğrulama hatalarını (parametre adına göre) `{{<giriş>.value}}` bağlamasıyla giriş adlarına eşler. */
function operationInputErrors(queries: PageQueryDefinition[], states: Record<string, QueryState>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const query of queries) {
    const errors = states[query.name]?.fieldErrors;
    if (!errors) continue;
    const byLower = new Map(Object.entries(errors).map(([name, message]) => [name.toLowerCase(), message]));
    for (const parameter of query.parameters) {
      const message = byLower.get(parameter.name.toLowerCase());
      const input = bindingPath(parameter.binding)?.match(/^([A-Za-z_][A-Za-z0-9_]*)\.value$/)?.[1];
      if (message && input) result[input] = message;
    }
  }
  return result;
}

export default function TenantCustomPage({ code, previewId, token }: { code?: string; previewId?: string; token: string }) {
  const [page, setPage] = useState<PublishedPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setPage(null);
    const endpoint = previewId
      ? `/api/custom-pages/${encodeURIComponent(previewId)}/preview`
      : `/api/custom-pages/${encodeURIComponent(code || "")}/published`;
    // api() maps every 403 to a generic text; the published endpoint's own 403 message
    // ("Bu sayfayı görüntüleme yetkiniz yok.") travels on the error as serverError.
    void api<PublishedPage>(endpoint, token)
      .catch((cause: unknown) => {
        const failure = cause as Error & { status?: number; serverError?: string };
        throw failure.status === 403 && failure.serverError ? new Error(failure.serverError) : cause;
      })
      .then((result) => {
        if (!active) return;
        const definition = JSON.parse(result.definitionJson) as { schemaVersion?: unknown; components?: unknown };
        if ((definition.schemaVersion !== 1 && definition.schemaVersion !== 2) || !Array.isArray(definition.components)) throw new Error("Yayımlanan sayfa tanımı geçersiz.");
        setPage(result);
      })
      .catch((cause: unknown) => { if (active) setError((cause as Error).message || "Sayfa yüklenemedi."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code, previewId, token]);

  if (loading) return <div className="tenant-custom-page-state" role="status">Sayfa yükleniyor…</div>;
  if (error || !page) return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert"><AlertCircle size={18} /><span>{error || "Yayımlanmış sayfa bulunamadı."}</span></div>;

  let components: ComponentDefinition[] = [];
  let queryDefinitions: ReturnType<typeof readPageQueries> = [];
  let isV2 = false;
  try {
    const definition = JSON.parse(page.definitionJson) as { schemaVersion?: unknown; components?: ComponentDefinition[] };
    components = Array.isArray(definition.components) ? definition.components : [];
    isV2 = definition.schemaVersion === 2;
    if (isV2) queryDefinitions = readPageQueries(definition);
  } catch { return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert">Sayfa tanımı okunamadı.</div>; }

  return <main className={`tenant-custom-page${previewId ? " is-preview" : ""}`}>
    {previewId && <div className="tenant-custom-page-preview-banner" role="status"><strong>Studio taslak önizlemesi</strong><span>Bu taslak henüz yayımlanmadı; ERP kullanıcılarının aktif sayfasını değiştirmez.</span></div>}
    <header className="tenant-custom-page-header"><span className="tenant-custom-page-icon"><LayoutTemplate size={20} /></span><div><h1>{page.name}</h1>{page.description && <p>{page.description}</p>}</div></header>
    <PageBody key={`${page.id}:${page.revision}`} page={page} components={components} queryDefinitions={queryDefinitions} isV2={isV2} token={token} previewId={previewId} />
  </main>;
}
