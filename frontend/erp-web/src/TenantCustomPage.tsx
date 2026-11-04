import { useEffect, useState } from "react";
import { AlertCircle, LayoutTemplate } from "lucide-react";
import { api } from "./erpApi";
import "./tenant-custom-page.css";

type ComponentDefinition = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: ComponentDefinition[];
};
type PageDefinition = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  revision: number;
  definitionJson: string;
};

const textValue = (value: unknown, fallback = "") =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;

function renderComponent(component: ComponentDefinition) {
  const props = component.props ?? {};
  const title = textValue(props.title);
  const text = textValue(props.text ?? props.label);
  const description = textValue(props.description);
  const value = textValue(props.value);
  const children = (component.children ?? []).map(renderComponent);

  switch (component.type) {
    case "heading":
      return <h2 key={component.id}>{title || text}</h2>;
    case "text":
      return <p key={component.id}>{text || description}</p>;
    case "metric":
      return (
        <article className="tenant-page-metric" key={component.id}>
          {title && <span>{title}</span>}
          <strong>{value || text || "—"}</strong>
          {description && <small>{description}</small>}
        </article>
      );
    case "card":
    case "section":
      return (
        <section className={`tenant-page-block tenant-page-${component.type}`} key={component.id}>
          {title && <h3>{title}</h3>}
          {description && <p>{description}</p>}
          {text && <p>{text}</p>}
          {children}
        </section>
      );
    case "divider":
      return <hr key={component.id} />;
    case "spacer":
      return <div className="tenant-page-spacer" aria-hidden="true" key={component.id} />;
    case "button":
      // Page definitions are inert: buttons are display-only until an approved
      // action binding is added to the low-code runtime.
      return (
        <button className="tenant-page-button" type="button" disabled key={component.id}>
          {text || title || "Eylem"}
        </button>
      );
    case "dataTable": {
      const columns = Array.isArray(props.columns)
        ? props.columns.filter((column): column is string => typeof column === "string").slice(0, 20)
        : [];
      return (
        <section className="tenant-page-block tenant-page-table" key={component.id}>
          {title && <h3>{title}</h3>}
          {columns.length > 0 ? (
            <div className="tenant-page-table-scroll">
              <table>
                <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                <tbody><tr><td colSpan={columns.length}>Bu görünüm için veri kaynağı henüz bağlanmadı.</td></tr></tbody>
              </table>
            </div>
          ) : <p>Bu tabloya henüz sütun eklenmemiş.</p>}
        </section>
      );
    }
    case "form":
      return (
        <section className="tenant-page-block tenant-page-form" key={component.id}>
          {title && <h3>{title}</h3>}
          <p>{description || text || "Bu form taslak olarak hazırlandı. Alanlar form tasarımcısından tanımlanabilir."}</p>
        </section>
      );
    default:
      return null;
  }
}

export default function TenantCustomPage({ code, token }: { code: string; token: string }) {
  const [page, setPage] = useState<PageDefinition | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPage(null);
    void api<PageDefinition>(`/api/custom-pages/${encodeURIComponent(code)}/published`, token)
      .then((result) => {
        if (!active) return;
        const definition = JSON.parse(result.definitionJson) as { schemaVersion?: unknown; components?: unknown };
        if (definition.schemaVersion !== 1 || !Array.isArray(definition.components))
          throw new Error("Yayımlanan sayfa tanımı geçersiz.");
        setPage(result);
      })
      .catch((cause: unknown) => {
        if (active) setError((cause as Error).message || "Sayfa yüklenemedi.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code, token]);

  if (loading) return <div className="tenant-custom-page-state" role="status">Sayfa yükleniyor…</div>;
  if (error || !page) return (
    <div className="tenant-custom-page-state tenant-custom-page-error" role="alert">
      <AlertCircle size={18} />
      <span>{error || "Yayımlanmış sayfa bulunamadı."}</span>
    </div>
  );

  let components: ComponentDefinition[] = [];
  try {
    const definition = JSON.parse(page.definitionJson) as { components?: ComponentDefinition[] };
    components = Array.isArray(definition.components) ? definition.components : [];
  } catch {
    return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert">Sayfa tanımı okunamadı.</div>;
  }

  return (
    <main className="tenant-custom-page">
      <header className="tenant-custom-page-header">
        <span className="tenant-custom-page-icon"><LayoutTemplate size={20} /></span>
        <div><h1>{page.name}</h1>{page.description && <p>{page.description}</p>}</div>
      </header>
      <div className="tenant-custom-page-content">{components.map(renderComponent)}</div>
    </main>
  );
}
