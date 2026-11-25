// Sayfa kalıbı (pageTemplate): sayfanın kökündeki `template: { name: "list" }`. Bileşen ön ayarlarıyla (CustomPagesPage `templates`) karıştırılmamalıdır.
export type PageTemplate = { name: "list" };
export type PageTemplateChoice = { id: "list" | "free"; label: string; description: string };

export const PAGE_TEMPLATE_CHOICES: PageTemplateChoice[] = [
  { id: "list", label: "Liste", description: "Kayıtları aramak, süzmek ve seçmek için." },
  { id: "free", label: "Serbest (bugünkü tasarımcı)", description: "Kalıpsız sayfa." },
];

type TemplatedDefinition = { schemaVersion: 2; template?: PageTemplate; queries: unknown[]; components: unknown[] };
type DefinitionLike = { template?: unknown; components?: unknown };

/** Geçerli bir kalıp değerini döndürür; yoksa ya da bilinmiyorsa undefined (eski sayfa). */
export function readPageTemplate(raw: unknown): PageTemplate | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return (raw as { name?: unknown }).name === "list" ? { name: "list" } : undefined;
}

export function newListTemplateDefinition(): TemplatedDefinition {
  return { schemaVersion: 2, template: { name: "list" }, queries: [], components: [{ id: NEW_LIST_ID, type: "dataTable", props: { slot: "list" } }] };
}

/** Yeni liste sayfasının listesi (`newListTemplateDefinition`): oluşturulunca panelinde kaynak seçilsin diye seçilir. */
export const NEW_LIST_ID = "liste";
export const LIST_SOURCE_HINT = "Önce ne listeleneceğini seçin.";

/**
 * Liste kalıbında listenin okuma sorgusu (kaynak) yoksa kaydın önündeki ipucu; sunucu böyle taslağı "Liste kalıbında tam bir
 * liste (dataTable) olmalı." diye reddeder (PageTemplateRules). Kalıpsız sayfada ya da liste bağlıysa null.
 */
export function listSourceProblem(definition: DefinitionLike & { queries?: unknown }): string | null {
  if (!readPageTemplate(definition.template)) return null;
  const components = Array.isArray(definition.components) ? definition.components as { type?: unknown; props?: Record<string, unknown> }[] : [];
  const list = components.find((component) => component?.type === "dataTable" && component.props?.slot === "list");
  if (!list) return null;
  const queryId = typeof list.props?.query === "string" ? list.props.query : "";
  const queries = Array.isArray(definition.queries) ? definition.queries as { id?: unknown; kind?: unknown }[] : [];
  return queryId && queries.some((query) => query?.id === queryId && query.kind === "read") ? null : LIST_SOURCE_HINT;
}

/** Basamak saklanmaz, hesaplanır: `above`/`below` yerinde bileşen varsa 2, yoksa 1; kalıpsız sayfada null. */
export function templateLevel(definition: DefinitionLike): 1 | 2 | null {
  if (!readPageTemplate(definition.template)) return null;
  const components = Array.isArray(definition.components) ? definition.components : [];
  const extra = components.some((component) => {
    const slot = (component as { props?: { slot?: unknown } } | null)?.props?.slot;
    return slot === "above" || slot === "below";
  });
  return extra ? 2 : 1;
}

export function templateLabel(definition: DefinitionLike): "Liste" | "Kalıpsız" {
  return readPageTemplate(definition.template) ? "Liste" : "Kalıpsız";
}

/** Ekranlar listesindeki metin: "Liste · 1. basamak" ya da "Kalıpsız". */
export function templateCatalogText(template: string | null | undefined, level: number | null | undefined): string {
  return template === "list" ? `Liste · ${level === 2 ? 2 : 1}. basamak` : "Kalıpsız";
}
