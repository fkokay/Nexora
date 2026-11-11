import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import { AlertCircle, LayoutTemplate } from "lucide-react";
import { api } from "./erpApi";
import TenantReportWidget from "./TenantReportWidget";
import TenantWorkflowAction from "./TenantWorkflowAction";
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
  id: string; type: string; props?: Record<string, unknown>; children?: ComponentDefinition[];
};
type PublishedPage = {
  id: string; code: string; name: string; description?: string | null; revision: number;
  definitionJson: string; forms: EmbeddedForm[];
};

const textValue = (value: unknown, fallback = "") =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

const isolatedCodeDocument = (css: string, javascript: string) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none';"><style>html,body{margin:0;padding:12px;font:14px system-ui,sans-serif;color:#172554;min-height:24px;box-sizing:border-box}*{box-sizing:border-box}${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="nexora-root">Özel kod bileşeni</div><script>${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;

const visualStyle = (type: string, props: Record<string, unknown>): CSSProperties => {
  const bounded = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = value == null || value === "" ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  const span = bounded(props.width, type === "metric" ? 3 : type === "heading" || type === "text" || type === "divider" || type === "spacer" ? 12 : 6, 1, 12);
  const number = (key: string, fallback: number, max: number) => bounded(props[key], fallback, 0, max);
  const color = (key: string) => typeof props[key] === "string" && /^#[\da-f]{6}$/i.test(props[key] as string) ? props[key] as string : undefined;
  return {
    gridColumn: `span ${Math.max(1, Math.min(12, span))}`,
    margin: `${number("margin", 0, 64)}px`,
    padding: `${number("padding", ["card", "section", "dataTable", "metric", "form"].includes(type) ? 16 : 0, 64)}px`,
    backgroundColor: color("backgroundColor"),
    color: color("textColor"),
    borderRadius: `${number("borderRadius", 12, 32)}px`,
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

function renderComponent(component: ComponentDefinition, forms: EmbeddedForm[], token: string, pageCode: string) {
  const props = component.props ?? {};
  const style = visualStyle(component.type, props);
  const title = textValue(props.title);
  const text = textValue(props.text ?? props.label);
  const description = textValue(props.description);
  const value = textValue(props.value);
  const children = (component.children ?? []).map((child) => renderComponent(child, forms, token, pageCode));

  switch (component.type) {
    case "heading": return <h2 key={component.id} className="tenant-page-heading" style={style}>{title || text}</h2>;
    case "text": return <p key={component.id} className="tenant-page-text" style={style}>{text || description}</p>;
    case "metric": return <TenantReportWidget key={component.id} kind="metric" source={props.source} title={title || text || "Gösterge"} description={description} fallbackValue={value} style={style} token={token} />;
    case "card": case "section": return <section className={`tenant-page-block tenant-page-${component.type}`} style={style} key={component.id}>{title && <h3>{title}</h3>}{description && <p>{description}</p>}{text && <p>{text}</p>}{children}</section>;
    case "divider": return <hr key={component.id} style={style} />;
    case "spacer": return <div className="tenant-page-spacer" style={style} aria-hidden="true" key={component.id} />;
    case "button": return <div className="tenant-page-action" style={style} key={component.id}>
      {props.actionType === "workflow" && typeof props.workflowId === "string"
        ? <TenantWorkflowAction token={token} workflowId={props.workflowId} title={text || title || "İş akışını başlat"} pageCode={pageCode} componentId={component.id} />
        : <button className="tenant-page-button" type="button" disabled>{text || title || "Eylem"}</button>}
    </div>;
    case "dataTable": {
      const columns = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string").slice(0, 20) : [];
      return <TenantReportWidget key={component.id} kind="dataTable" source={props.source} columns={columns} title={title || "Kayıtlar"} description={description} style={style} token={token} rowActionsEnabled={props.rowActionsEnabled === true} rowActionWorkflowId={textValue(props.rowActionWorkflowId) || undefined} rowActionLabel={textValue(props.rowActionLabel, "İşlemi başlat")} pageCode={pageCode} componentId={component.id} />;
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
      const variant = ["success", "warning", "danger", "info"].includes(textValue(props.variant)) ? textValue(props.variant) : "info";
      return <span key={component.id} className={`tenant-page-badge tone-${variant}`} style={style}>{text || title || "Durum"}</span>;
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
    void api<PublishedPage>(endpoint, token)
      .then((result) => {
        if (!active) return;
        const definition = JSON.parse(result.definitionJson) as { schemaVersion?: unknown; components?: unknown };
        if (definition.schemaVersion !== 1 || !Array.isArray(definition.components)) throw new Error("Yayımlanan sayfa tanımı geçersiz.");
        setPage(result);
      })
      .catch((cause: unknown) => { if (active) setError((cause as Error).message || "Sayfa yüklenemedi."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code, previewId, token]);

  if (loading) return <div className="tenant-custom-page-state" role="status">Sayfa yükleniyor…</div>;
  if (error || !page) return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert"><AlertCircle size={18} /><span>{error || "Yayımlanmış sayfa bulunamadı."}</span></div>;

  let components: ComponentDefinition[] = [];
  try {
    const definition = JSON.parse(page.definitionJson) as { components?: ComponentDefinition[] };
    components = Array.isArray(definition.components) ? definition.components : [];
  } catch { return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert">Sayfa tanımı okunamadı.</div>; }

  return <main className={`tenant-custom-page${previewId ? " is-preview" : ""}`}>
    {previewId && <div className="tenant-custom-page-preview-banner" role="status"><strong>Studio taslak önizlemesi</strong><span>Bu taslak henüz yayımlanmadı; ERP kullanıcılarının aktif sayfasını değiştirmez.</span></div>}
    <header className="tenant-custom-page-header"><span className="tenant-custom-page-icon"><LayoutTemplate size={20} /></span><div><h1>{page.name}</h1>{page.description && <p>{page.description}</p>}</div></header>
    <div className="tenant-custom-page-content">{components.map((component) => renderComponent(component, page.forms ?? [], token, page.code))}</div>
  </main>;
}
