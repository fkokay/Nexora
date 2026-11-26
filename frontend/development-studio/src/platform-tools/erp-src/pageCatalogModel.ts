// Sayfa tasarımcısı giriş listesi: özel, sistem ve yerleşik sayfaları tek satır modeline çevirir,
// arama / tür / durum / modül süzgeçlerini ve istemci tarafı sayfalamayı uygular. Saf işlevler (test edilebilir).

import { templateCatalogText } from "./page-designer/pageTemplates";

export type PageCatalogItem = { key: string; label: string; fields: { key: string; label: string; defaultVisible: boolean }[] };
export type CustomPageCatalogItem = { id: string; code: string; name: string; description?: string | null; isPublished: boolean; revision: number; updatedAt?: string; screenKey?: string | null; template?: string | null; templateLevel?: number | null };
export type SystemPageItem = { screenKey: string; title: string; description?: string | null; module: string; version: number; stage: "preview" | "ready"; screenViewKeys: string[]; draftId?: string | null; publishedId?: string | null; standardVersion?: number | null; newItemCount: number; canEdit: boolean; template?: string | null; templateLevel?: number | null };

export type CatalogKind = "custom" | "system" | "builtIn";
export type CatalogFilter = "all" | CatalogKind;
export type StatusFilter = "all" | "draft" | "published" | "standard" | "preview" | "view";
export type StatusTone = "draft" | "published" | "standard" | "preview" | "view";
export type CatalogStatus = { label: string; tone: StatusTone };

export type CatalogRow = {
  key: string;
  kind: CatalogKind;
  name: string;
  /** Görünen kod: özel "/kod", sistem "@ekran", yerleşik ekran anahtarı. */
  code: string;
  module: string | null;
  version: number | null;
  /** Sürüm firma revizyonu değil, standart ekran tanımının sürümü. */
  versionIsStandard?: boolean;
  updatedAt: string | null;
  description: string | null;
  statuses: CatalogStatus[];
  /** Yerleşik ekranlarda düzenlenebilir alan sayısı. */
  fieldCount: number | null;
  newItemCount: number;
  /** Sayfa kalıbı ("list") ve hesaplanan basamak; kalıpsız sayfada null, yerleşik ekranda tanımsız. */
  template: string | null;
  templateLevel: number | null;
  custom?: CustomPageCatalogItem;
  system?: SystemPageItem;
  screen?: PageCatalogItem;
};

export const PAGE_SIZE = 25;

/** Geçmiş okunabilen satırlar: özel sayfa ya da firma tasarımı (taslak/yayın) olan sistem sayfası. */
export const historyUrl = (row: CatalogRow): string | null =>
  row.custom ? `/api/custom-pages/${row.custom.id}/history`
  : row.system && (row.system.draftId || row.system.publishedId) ? `/api/system-pages/${encodeURIComponent(row.system.screenKey)}/history` : null;
export const NO_MODULE = "__none__";

export const kindLabel: Record<CatalogKind, string> = { custom: "Özel", system: "Sistem", builtIn: "Yerleşik" };

export const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "draft", label: "Taslak" },
  { value: "published", label: "Yayında" },
  { value: "standard", label: "Standart" },
  { value: "preview", label: "Önizleme" },
  { value: "view", label: "Görünüm ayarı" },
];

const systemStatuses = (page: SystemPageItem): CatalogStatus[] => {
  const main: CatalogStatus = page.draftId ? { label: "Taslak var", tone: "draft" } : page.publishedId ? { label: "Yayında", tone: "published" } : { label: "Standart", tone: "standard" };
  return page.stage === "preview" ? [main, { label: "Önizleme", tone: "preview" }] : [main];
};

const systemRow = (system: SystemPageItem, name: string, key: string): CatalogRow => ({
  key, kind: "system", name, code: `@${system.screenKey}`, module: system.module || null,
  // Liste yanıtında firma tasarımı revizyonu yok; sistem sayfalarında sürüm Nexora standardının sürümüdür.
  version: system.version, versionIsStandard: true, updatedAt: null,
  description: system.description ?? null, statuses: systemStatuses(system), fieldCount: null, newItemCount: system.newItemCount, template: system.template ?? null, templateLevel: system.templateLevel ?? null, system,
});

/** Üç kaynağı tek listeye çevirir. Sistem sayfasıyla eşleşen yerleşik ekran sistem satırı olarak görünür. */
export function buildCatalogRows(screens: PageCatalogItem[], customPages: CustomPageCatalogItem[], systemPages: SystemPageItem[]): CatalogRow[] {
  const custom = customPages.map((page): CatalogRow => ({
    key: `custom-${page.id}`, kind: "custom", name: page.name, code: `/${page.code}`, module: null, version: page.revision, updatedAt: page.updatedAt ?? null,
    description: page.description ?? null, statuses: [page.isPublished ? { label: "Yayında", tone: "published" } : { label: "Taslak", tone: "draft" }], fieldCount: null, newItemCount: 0, template: page.template ?? null, templateLevel: page.templateLevel ?? null, custom: page,
  }));
  const builtIn = screens.map((screen): CatalogRow => {
    const title = screen.key === "customers" ? "Cari Hesaplar" : screen.label;
    const system = systemPages.find((page) => page.screenViewKeys.includes(screen.key));
    if (system) return { ...systemRow(system, title, `screen-${screen.key}`), screen };
    return {
      key: `screen-${screen.key}`, kind: "builtIn", name: title, code: screen.key, module: null, version: null, updatedAt: null, description: null,
      statuses: [{ label: `Görünüm ayarı · ${screen.fields.length} alan`, tone: "view" }], fieldCount: screen.fields.length, newItemCount: 0, template: null, templateLevel: null, screen,
    };
  });
  const unmatched = systemPages.filter((page) => !page.screenViewKeys.some((key) => screens.some((screen) => screen.key === key)))
    .map((system) => systemRow(system, system.title, `system-${system.screenKey}`));
  return [...custom, ...builtIn, ...unmatched];
}

export type TemplateFilter = "all" | "list" | "record" | "none";
export const templateFilterOptions: { value: TemplateFilter; label: string }[] = [
  { value: "all", label: "Tümü" }, { value: "list", label: "Liste" }, { value: "record", label: "Kayıt kartı" }, { value: "none", label: "Kalıpsız" },
];
/** Satırın kalıp metni: yerleşik görünüm ayarı satırında kalıp kavramı yoktur. */
export const rowTemplateText = (row: CatalogRow): string | null => row.kind === "builtIn" ? null : templateCatalogText(row.template, row.templateLevel);
const templateMatches = (row: CatalogRow, template: TemplateFilter) => template === "all" || (template === "list" || template === "record" ? row.template === template : row.kind !== "builtIn" && row.template == null);

export type CatalogQuery = { search: string; status: StatusFilter; module: string; template?: TemplateFilter };

const statusMatches = (row: CatalogRow, status: StatusFilter) => status === "all" || row.statuses.some((item) => item.tone === status);
const moduleMatches = (row: CatalogRow, module: string) => module === "all" || (module === NO_MODULE ? !row.module : row.module === module);

/** Arama (ad + kod), durum ve modül süzgeçleri; tür süzgeci ayrı uygulanır ki sayaçlar doğru kalsın. */
export function filterCatalogRows(rows: CatalogRow[], { search, status, module, template = "all" }: CatalogQuery): CatalogRow[] {
  const query = search.trim().toLocaleLowerCase("tr-TR");
  return rows.filter((row) =>
    (!query || row.name.toLocaleLowerCase("tr-TR").includes(query) || row.code.toLocaleLowerCase("tr-TR").includes(query))
    && statusMatches(row, status) && moduleMatches(row, module) && templateMatches(row, template));
}

export function kindCounts(rows: CatalogRow[]): Record<CatalogFilter, number> {
  return {
    all: rows.length,
    custom: rows.filter((row) => row.kind === "custom").length,
    system: rows.filter((row) => row.kind === "system").length,
    builtIn: rows.filter((row) => row.kind === "builtIn").length,
  };
}

export const byKind = (rows: CatalogRow[], kind: CatalogFilter) => kind === "all" ? rows : rows.filter((row) => row.kind === kind);

export function moduleOptions(rows: CatalogRow[]): string[] {
  return [...new Set(rows.map((row) => row.module).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "tr-TR"));
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): { items: T[]; page: number; pageCount: number; from: number; to: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: current, pageCount, from: items.length ? start + 1 : 0, to: start + slice.length };
}

export const formatUpdatedAt = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("tr-TR");
};

export type CatalogView = "list" | "cards";
const VIEW_KEY = "nexora.studio.pageDesigner.view";
export function readCatalogView(): CatalogView {
  try { return window.localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list"; } catch { return "list"; }
}
export function writeCatalogView(view: CatalogView) {
  try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* tarayıcı deposu kapalı olabilir; görünüm yalnız bu oturumda kalır */ }
}
