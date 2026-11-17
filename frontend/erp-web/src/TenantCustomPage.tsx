import { type ComponentProps, type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, LayoutTemplate } from "lucide-react";
import { confirmDialog } from "./confirmDialog";
import { api } from "./erpApi";
import TenantReportWidget from "./TenantReportWidget";
import { MetricCard } from "./custom-page/MetricCard";
import TenantWorkflowAction from "./TenantWorkflowAction";
import { displayText, interpolate, type PageScope } from "./custom-page/pageBindings";
import { readPageQueries, resolveQueryParameters, usePageQueries, type PageQueryDefinition, type QueryState } from "./custom-page/usePageQueries";
import { collectTexts, COUNTS_ROOT, referencedCountCodes, usePageCounts } from "./custom-page/usePageCounts";
import { columnTotal, formatCell, trendPoints, isRightAligned, parseColumnFormats, parseToneMap, toneFor, type ColumnFormat, type Tone } from "./custom-page/cellFormat";
import { FormCard } from "./custom-page/LayoutComponents";
import { idList, ownedInputIds } from "./custom-page/layoutRefs";
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

const BINDABLE_PROPS = ["text", "title", "description", "label", "value", "placeholder", "defaultValue"];
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
  /** formCard/facetPanel'in sahiplendiği girişler (üst düzeyde ayrıca çizilmez) ve kimliğe göre giriş bileşenleri. */
  ownedInputs: Set<string>;
  inputById: Record<string, ComponentDefinition>;
  rights: NonNullable<PublishedPage["rights"]>;
  rerun: (queryIds: string[]) => void;
  /** Studio taslak önizlemesi: yazma sorguları her zaman onay sorar ve sunucuya açık onay (confirmWrite) gönderir. */
  isPreview: boolean;
  writeFor: (query: PageQueryDefinition, confirmWrite: boolean) => Promise<{ affectedRows: number }>;
};

const PREVIEW_WRITE_WARNING = "Bu taslak önizlemesinde veriler gerçekten değişecek. Devam edilsin mi?";

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
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    id = String((JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { sub?: unknown }).sub ?? "");
  } catch { /* geçersiz belirteç: kimlik boş kalır */ }
  let name = "";
  try { name = localStorage.getItem("aierp.user") ?? ""; } catch { /* depolama kapalı */ }
  return { id, ad: name };
};

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

const isolatedCodeDocument = (css: string, javascript: string) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none';"><style>html,body{margin:0;padding:12px;font:14px system-ui,sans-serif;color:#172554;min-height:24px;box-sizing:border-box}*{box-sizing:border-box}${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="nexora-root">Özel kod bileşeni</div><script>${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;

// Tasarım dili varsayılanları (kart iç boşluğu 12px, köşe 8px); Studio tuvali aynı değerleri kullanır.
const DEFAULT_BLOCK_PADDING = 12;
const DEFAULT_RADIUS = 8;
const visualStyle = (type: string, props: Record<string, unknown>): CSSProperties => {
  const bounded = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = value == null || value === "" ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  const span = bounded(props.width, type === "metric" ? 3 : type === "heading" || type === "text" || type === "label" || type === "divider" || type === "spacer" || type === "formCard" ? 12 : 6, 1, 12);
  const number = (key: string, fallback: number, max: number) => bounded(props[key], fallback, 0, max);
  const color = (key: string) => typeof props[key] === "string" && /^#[\da-f]{6}$/i.test(props[key] as string) ? props[key] as string : undefined;
  return {
    gridColumn: `span ${Math.max(1, Math.min(12, span))}`,
    margin: `${number("margin", 0, 64)}px`,
    padding: `${number("padding", ["card", "section", "dataTable", "metric", "form", "alert", "list", "progress", "formCard"].includes(type) ? DEFAULT_BLOCK_PADDING : 0, 64)}px`,
    backgroundColor: color("backgroundColor"),
    color: color("textColor"),
    borderRadius: `${number("borderRadius", DEFAULT_RADIUS, 32)}px`,
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

export function QueryTable({ state, columns, title, description, style, selected, onSelect, formats = parseColumnFormats(undefined), toneMap = [], totals = [], density = "dense" }: {
  state: QueryState; columns: string[]; title: string; description: string; style: CSSProperties;
  selected?: Record<string, unknown> | null; onSelect?: (row: Record<string, unknown> | null) => void;
  formats?: Record<string, ColumnFormat>; toneMap?: { key: string; tone: Tone }[]; totals?: string[]; density?: "dense" | "comfort";
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
  const totalLabel = state.truncated ? `Toplam · ilk ${state.rows.length} satır` : `Toplam · ${state.rows.length} kayıt`;
  return <section className={`tenant-page-block tenant-page-table tenant-page-report-widget ${state.error ? "is-error" : ""}`} style={style}>
    {title && <h3>{title}</h3>}
    {description && <p>{description}</p>}
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
    {!state.loading && !state.error && state.truncated && <p className="tenant-page-truncated" role="status">İlk 5.000 satır gösteriliyor.</p>}
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
function QueryActionButton({ query, props, label, runtime }: { query: PageQueryDefinition; props: Record<string, unknown>; label: string; runtime: PageRuntime }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const allowed = runtime.rights[query.kind === "read" ? "view" : query.kind] === true;
  const mounted = useRef(true);
  // Çift tıklamada ikinci yazma isteğini engeller; busy durumu bir sonraki çizime kadar görünmez.
  const inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!allowed) return null;
  const write = query.kind !== "read";
  const refreshIds = Array.isArray(props.refreshQueries) ? props.refreshQueries.filter((id): id is string => typeof id === "string") : [];
  const bound = (key: string) => interpolate(textValue(props[key]), runtime.scope).trim();

  const click = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setFeedback(null);
      if (!write) { runtime.rerun([query.id]); return; }
      // Önizlemede onay her zaman sorulur (düğmede onay kapalı olsa da), çünkü taslak gerçek veriyi değiştirir.
      if (props.confirmEnabled === true || runtime.isPreview) {
        const configured = props.confirmEnabled === true ? bound("confirmText") : "";
        const message = runtime.isPreview ? [configured, PREVIEW_WRITE_WARNING].filter(Boolean).join(" ") : configured;
        const confirmed = await confirmDialog({
          title: "Emin misiniz?", message: message || undefined, confirmLabel: "Onayla", cancelLabel: "Vazgeç",
          tone: query.kind === "delete" || query.kind === "update" || runtime.isPreview ? "danger" : "default",
        });
        if (!confirmed) return;
      }
      setBusy(true);
      try {
        const result = await runtime.writeFor(query, runtime.isPreview);
        const message = `${bound("successMessage") || "İşlem tamamlandı."} (${result.affectedRows} kayıt)`;
        if (mounted.current) setFeedback({ tone: "success", text: message });
        runtime.rerun(refreshIds);
      } catch (cause) {
        if (mounted.current) setFeedback({ tone: "error", text: writeErrorText(bound("errorMessage"), cause) });
      } finally {
        if (mounted.current) setBusy(false);
      }
    } finally {
      inFlight.current = false;
    }
  };
  return <div className="tenant-page-query-action">
    <button className={`tenant-page-button${write && (query.kind === "delete" || query.kind === "update") ? " is-danger" : ""}`} type="button" disabled={busy} onClick={() => void click()}>{busy ? "Çalışıyor…" : label}</button>
    {feedback && <p className={`tenant-page-action-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p>}
  </div>;
}

export function PageInput({ component, props, raw, onChange, optionsState, style }: {
  component: ComponentDefinition; props: Record<string, unknown>; raw: InputRaw; onChange: (value: InputRaw) => void;
  optionsState?: QueryState; style: CSSProperties;
}) {
  const inputType = textValue(props.inputType, "text");
  const label = textValue(props.label);
  const inputId = `page-input-${component.id}`;
  let control;
  if (inputType === "checkbox") {
    control = <input id={inputId} type="checkbox" checked={raw === true} onChange={(event) => onChange(event.target.checked)} />;
  } else if (inputType === "select") {
    const valueColumn = textValue(props.optionValueColumn) || optionsState?.columns[0]?.code || "";
    const labelColumn = textValue(props.optionLabelColumn) || valueColumn;
    const options = (optionsState?.rows ?? []).map((row) => ({ value: displayText(row[valueColumn]), label: displayText(row[labelColumn]) || displayText(row[valueColumn]) }));
    control = <select id={inputId} value={typeof raw === "string" ? raw : ""} disabled={optionsState?.loading} onChange={(event) => onChange(event.target.value)}>
      <option value="">{optionsState?.loading ? "Yükleniyor…" : optionsState && neverRan(optionsState) ? MANUAL_QUERY_IDLE : "Seçin"}</option>
      {options.map((option, index) => <option key={`${index}-${option.value}`} value={option.value}>{option.label}</option>)}
    </select>;
  } else {
    control = <input id={inputId} type={inputType === "number" || inputType === "date" ? inputType : "text"} step={inputType === "number" ? "any" : undefined}
      placeholder={textValue(props.placeholder)} value={typeof raw === "string" ? raw : ""} onChange={(event) => onChange(event.target.value)} />;
  }
  return <div className={`tenant-page-input tenant-page-input-${inputType}`} style={style}>
    <label htmlFor={inputId}>{label && <span>{label}</span>}{control}</label>
    {inputType === "select" && optionsState?.error && <QueryError message={optionsState.error} />}
  </div>;
}

function renderPageInput(component: ComponentDefinition, props: Record<string, unknown>, style: CSSProperties, runtime?: PageRuntime) {
  return <PageInput key={component.id} component={component} props={props} style={style}
    raw={runtime?.inputValues[component.id] ?? ""} onChange={(next) => runtime?.setInput(component.id, next)}
    optionsState={runtime && typeof props.optionsQuery === "string" ? runtime.states[runtime.queryNames[props.optionsQuery]] : undefined} />;
}

function renderComponent(component: ComponentDefinition, forms: EmbeddedForm[], token: string, pageCode: string, runtime?: PageRuntime) {
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
    case "button": return <div className="tenant-page-action" style={style} key={component.id}>
      {props.actionType === "workflow" && typeof props.workflowId === "string"
        ? <TenantWorkflowAction token={token} workflowId={props.workflowId} title={text || title || "İş akışını başlat"} pageCode={pageCode} componentId={component.id} />
        : props.actionType === "query" && runtime && typeof props.queryId === "string" && runtime.queryById[props.queryId]
          ? <QueryActionButton query={runtime.queryById[props.queryId]} props={props} label={text || title || "Eylem"} runtime={runtime} />
        : <button className="tenant-page-button" type="button" disabled>{text || title || "Eylem"}</button>}
    </div>;
    case "dataTable": {
      const columns = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string").slice(0, 20) : [];
      const queryName = runtime && typeof props.query === "string" ? runtime.queryNames[props.query] : undefined;
      if (runtime && queryName && runtime.states[queryName]) {
        const tableName = component.name;
        const totals = Array.isArray(props.totals) ? props.totals.filter((code): code is string => typeof code === "string") : [];
        return <QueryTable key={component.id} state={runtime.states[queryName]} columns={columns} title={title || "Kayıtlar"} description={description} style={style}
          formats={parseColumnFormats(props.columnFormats)} toneMap={parseToneMap(props.toneMap)} totals={totals} density={props.density === "comfort" ? "comfort" : "dense"}
          selected={tableName ? runtime.selections[tableName] : undefined} onSelect={tableName ? (row) => runtime.select(tableName, row) : undefined} />;
      }
      return <TenantReportWidget key={component.id} kind="dataTable" source={props.source} columns={columns} title={title || "Kayıtlar"} description={description} style={style} token={token} rowActionsEnabled={props.rowActionsEnabled === true} rowActionWorkflowId={textValue(props.rowActionWorkflowId) || undefined} rowActionLabel={textValue(props.rowActionLabel, "İşlemi başlat")} pageCode={pageCode} componentId={component.id} columnFormats={props.columnFormats} toneMap={props.toneMap} density={props.density} />;
    }
    case "form": {
      const formCode = textValue(props.formCode);
      const form = forms.find((item) => item.code === formCode);
      return form ? <div key={component.id} className="tenant-page-form-wrap" style={style}><EmbeddedCustomForm form={form} token={token} /></div> : <section className="tenant-page-block tenant-page-form" style={style} key={component.id}><h3>{title || "Form"}</h3><p>Bu sayfa için seçilen form artık yayımlanmış değil.</p></section>;
    }
    case "code": return <iframe key={component.id} className="tenant-page-code-frame" style={style} title={title || "Yalıtılmış özel kod"} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={isolatedCodeDocument(textValue(props.css), textValue(props.javascript))} />;
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

/** Sayfa içeriği: v2 tanımlarda sorguları çalıştırır, girişleri ve ızgara seçimini tutar, bağlama kapsamını kurar. v1'de bağlama yoktur. */
function PageBody({ page, components, queryDefinitions, isV2, token, previewId }: {
  page: PublishedPage; components: ComponentDefinition[]; queryDefinitions: ReturnType<typeof readPageQueries>; isV2: boolean; token: string; previewId?: string;
}) {
  const [touched, setTouched] = useState<Record<string, InputRaw>>({});
  const [selections, setSelections] = useState<Record<string, Record<string, unknown> | null>>({});
  const user = useMemo(() => sessionUser(token), [token]);
  const inputs = useMemo(() => flattenComponents(components).filter((component) => component.type === "input"), [components]);
  const queryById = useMemo(() => Object.fromEntries(queryDefinitions.map((query) => [query.id, query])), [queryDefinitions]);
  // {{sayilar.x}}: yalnız sayfada geçen rapor kaynaklarının kayıt sayısı getirilir.
  const countCodes = useMemo(() => isV2
    ? referencedCountCodes(collectTexts([flattenComponents(components).map((component) => component.props ?? {}), queryDefinitions.map((query) => query.parameters)]))
    : [], [isV2, components, queryDefinitions]);
  const counts = usePageCounts(countCodes, token);
  const queryNames = useMemo(() => Object.fromEntries(queryDefinitions.map((query) => [query.id, query.name])), [queryDefinitions]);
  const ownedInputs = useMemo(() => ownedInputIds(flattenComponents(components).map((component) => ({ id: component.id, type: component.type, props: component.props }))), [components]);
  const inputById = useMemo(() => Object.fromEntries(inputs.map((input) => [input.id, input])), [inputs]);

  // Kapsam: oturum + sorgu durumları + ızgara seçimleri + girişler. Girişin varsayılanı yalnız sorgu/oturum/dokunulmuş
  // girişlerden çözülür (başka girişin varsayılanına bağlanamaz), böylece döngü oluşmaz.
  const effective = (states: Record<string, QueryState>) => {
    const base: PageScope = { kullanici: user, bugun: localToday(), [COUNTS_ROOT]: counts, ...states };
    for (const [name, row] of Object.entries(selections)) base[name] = { seciliSatir: row };
    for (const input of inputs) {
      if (input.name && input.id in touched) base[input.name] = { value: scopeInputValue(textValue(input.props?.inputType, "text"), touched[input.id]) };
    }
    const scope: PageScope = { ...base };
    const raw: Record<string, InputRaw> = {};
    for (const input of inputs) {
      const inputType = textValue(input.props?.inputType, "text");
      raw[input.id] = input.id in touched ? touched[input.id] : rawInputDefault(inputType, interpolate(textValue(input.props?.defaultValue), base));
      if (input.name) scope[input.name] = { value: scopeInputValue(inputType, raw[input.id]) };
    }
    return { scope, raw };
  };

  const { states, scope, rerun, runWrite } = usePageQueries({
    queries: isV2 ? queryDefinitions : [], token, pageCode: page.code, previewId, buildScope: (current) => effective(current).scope,
  });
  const runtime: PageRuntime | undefined = isV2 ? {
    scope, states, queryNames, inputValues: effective(states).raw,
    setInput: (componentId, value) => setTouched((current) => ({ ...current, [componentId]: value })),
    selections,
    select: (tableName, row) => setSelections((current) => ({ ...current, [tableName]: row })),
    queryById, ownedInputs, inputById, rights: page.rights ?? { view: true }, rerun, isPreview: Boolean(previewId),
    writeFor: (query, confirmWrite) => runWrite(query, resolveQueryParameters(query, scope), confirmWrite),
  } : undefined;

  return <div className="tenant-custom-page-content">{components.map((component) => renderComponent(component, page.forms ?? [], token, page.code, runtime))}</div>;
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
