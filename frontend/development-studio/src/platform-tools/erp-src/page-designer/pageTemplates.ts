import type { ActiveCatalog } from "./catalogClient";
// Sayfa kalıbı (pageTemplate): sayfanın kökündeki `template: { name: "list" }`. Bileşen ön ayarlarıyla (CustomPagesPage `templates`) karıştırılmamalıdır.
export type PageTemplate = { name: "list" } | { name: "record" } | { name: "free" };
export type PageTemplateChoice = { id: "list" | "record" | "free"; label: string; description: string };
/** Karar 1: kalıpsız (eski tasarımcı) sayfayı kuran seçim, pencerede en sonda. */
export type LegacyTemplateChoice = { id: "legacy"; label: string; description: string };

export const PAGE_TEMPLATE_CHOICES: PageTemplateChoice[] = [
  { id: "list", label: "Liste", description: "Kayıtları aramak, süzmek ve seçmek için." },
  { id: "record", label: "Kayıt kartı", description: "Tek bir kaydı görmek ve düzenlemek için." },
  { id: "free", label: "Serbest", description: "Kalıba uymayan sayfalar: panolar, özet ekranları. Sekmeler ve bölümler sizin." },
];
/** Karar 1'in son seçimi: NewPageDialog `[...PAGE_TEMPLATE_CHOICES, LEGACY_TEMPLATE_CHOICE]` gösterir, bu en sonda ve kesik çizgili. */
export const LEGACY_TEMPLATE_CHOICE: LegacyTemplateChoice = { id: "legacy", label: "Eski tasarımcı (kalıpsız)", description: "Sistem ekranlarına benzeyen gelişmiş sayfalar için." };

type TemplatedDefinition = { schemaVersion: 2; template?: PageTemplate; queries: unknown[]; components: unknown[] };
type DefinitionLike = { template?: unknown; components?: unknown };

/** Geçerli bir kalıp değerini döndürür; yoksa ya da bilinmiyorsa undefined (eski sayfa). */
export function readPageTemplate(raw: unknown): PageTemplate | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const name = (raw as { name?: unknown }).name;
  return name === "list" ? { name: "list" } : name === "record" ? { name: "record" } : name === "free" ? { name: "free" } : undefined;
}

export function newListTemplateDefinition(): TemplatedDefinition {
  return { schemaVersion: 2, template: { name: "list" }, queries: [], components: [{ id: NEW_LIST_ID, type: "dataTable", props: { slot: "list" } }] };
}

export function newRecordTemplateDefinition(): TemplatedDefinition {
  return { schemaVersion: 2, template: { name: "record" }, queries: [], components: [
    { id: "ozet", type: "recordHeader", props: { slot: "summary" } }, { id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: [] } }] };
}

/** Yeni serbest sayfa (Karar 2): sekmesiz tek bölüm, "Bölüm 1", 2 kolon, üyesiz. */
export function newFreeTemplateDefinition(): TemplatedDefinition {
  return { schemaVersion: 2, template: { name: "free" }, queries: [], components: [
    { id: NEW_FREE_BLOCK_ID, type: "section", props: { slot: "block", title: "Bölüm 1", columns: 2, members: [] } }] };
}
/** Yeni serbest sayfanın bölümü (`newFreeTemplateDefinition`). */
export const NEW_FREE_BLOCK_ID = "bolum";

/** Yeni sayfa penceresindeki seçimin kuracağı tanım; "Eski tasarımcı" için null (bugünkü kalıpsız sayfa, bileşen ön ayarıyla). */
export function newPageDefinitionFor(choice: PageTemplateChoice["id"] | LegacyTemplateChoice["id"]): TemplatedDefinition | null {
  return choice === "list" ? newListTemplateDefinition() : choice === "record" ? newRecordTemplateDefinition() : choice === "free" ? newFreeTemplateDefinition() : null;
}

export const RECORD_SOURCE_HINT = "Önce hangi kaydın gösterileceğini seçin.";

/**
 * Kayıt kartı kalıbında sekme yoksa (kaynak seçilmemiş) kaydın önündeki ipucu; sunucu böyle taslağı reddeder.
 * Kayıt kartı olmayan sayfada null.
 */
export function recordSourceProblem(definition: DefinitionLike): string | null {
  if (readPageTemplate(definition.template)?.name !== "record") return null;
  const components = Array.isArray(definition.components) ? definition.components as { type?: unknown; props?: Record<string, unknown> }[] : [];
  const tabs = components.find((component) => component?.type === "tabs" && component.props?.slot === "tabs");
  return Array.isArray(tabs?.props?.tabs) && tabs.props.tabs.length > 0 ? null : RECORD_SOURCE_HINT;
}

/** Sayfası olmayan ilk "açılır" kod (katalogdaki kayıt kartı hedefi); yoksa null. */
export function suggestRecordPageCode(catalog: ActiveCatalog, existingCodes: string[]): string | null {
  return catalog.dataSources.map((source) => source.opens).find((code): code is string => !!code && !existingCodes.includes(code)) ?? null;
}

/** Yeni liste sayfasının listesi (`newListTemplateDefinition`): oluşturulunca panelinde kaynak seçilsin diye seçilir. */
export const NEW_LIST_ID = "liste";
export const LIST_SOURCE_HINT = "Önce ne listeleneceğini seçin.";

/**
 * Liste kalıbında listenin okuma sorgusu (kaynak) yoksa kaydın önündeki ipucu; sunucu böyle taslağı "Liste kalıbında tam bir
 * liste (dataTable) olmalı." diye reddeder (PageTemplateRules). Kalıpsız sayfada ya da liste bağlıysa null.
 */
export function listSourceProblem(definition: DefinitionLike & { queries?: unknown }): string | null {
  if (readPageTemplate(definition.template)?.name !== "list") return null;
  const components = Array.isArray(definition.components) ? definition.components as { type?: unknown; props?: Record<string, unknown> }[] : [];
  const list = components.find((component) => component?.type === "dataTable" && component.props?.slot === "list");
  if (!list) return null;
  const queryId = typeof list.props?.query === "string" ? list.props.query : "";
  const queries = Array.isArray(definition.queries) ? definition.queries as { id?: unknown; kind?: unknown }[] : [];
  return queryId && queries.some((query) => query?.id === queryId && query.kind === "read") ? null : LIST_SOURCE_HINT;
}

/** Basamak saklanmaz, hesaplanır: serbest gövde her zaman 3; `above`/`below` yerinde bileşen varsa 2, yoksa 1; kalıpsız sayfada null. */
export function templateLevel(definition: DefinitionLike): 1 | 2 | 3 | null {
  const template = readPageTemplate(definition.template);
  if (!template) return null;
  if (template.name === "free") return 3;
  const components = Array.isArray(definition.components) ? definition.components : [];
  const extra = components.some((component) => {
    const slot = (component as { props?: { slot?: unknown } } | null)?.props?.slot;
    return slot === "above" || slot === "below";
  });
  return extra ? 2 : 1;
}

export function templateLabel(definition: DefinitionLike): "Liste" | "Kayıt kartı" | "Serbest" | "Kalıpsız" {
  const name = readPageTemplate(definition.template)?.name;
  return name === "list" ? "Liste" : name === "record" ? "Kayıt kartı" : name === "free" ? "Serbest" : "Kalıpsız";
}

/** Ekranlar listesindeki metin: "Liste · 1. basamak", "Serbest · 3. basamak" (her zaman 3) ya da "Kalıpsız". */
export function templateCatalogText(template: string | null | undefined, level: number | null | undefined): string {
  if (template === "free") return "Serbest · 3. basamak";
  const label = template === "list" ? "Liste" : template === "record" ? "Kayıt kartı" : null;
  return label ? `${label} · ${level === 2 ? 2 : 1}. basamak` : "Kalıpsız";
}
