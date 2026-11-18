// Saf (React'siz) kurallar: tuvaldeki okuma sorgularının otomatik örnek verisi.
import type { PageQuery } from "./QueriesPanel";

export const SAMPLE_DEBOUNCE_MS = 500;
export const SAMPLE_ROWS = 5;
export const NEEDS_SELECTION = "Bir satır seçin";
export const NEEDS_PARAMETER = "Örnek veri için zorunlu parametre boş.";

type ComponentLike = { type: string; props: Record<string, unknown> };

/** Örnek verisi kendiliğinden çalışacak sorgular: ızgara, gösterge (değer ve eğilim) ve açılır liste / arama kutusu seçenekleri. */
export function sampleQueryIds(components: readonly ComponentLike[]): string[] {
  const ids: string[] = [];
  const add = (value: unknown) => { if (typeof value === "string" && value !== "" && !ids.includes(value)) ids.push(value); };
  for (const component of components) {
    if (component.type === "dataTable" || component.type === "metric") add(component.props.query);
    if (component.type === "metric") add(component.props.trendQuery);
    if (component.type === "input" && (component.props.inputType === "select" || component.props.inputType === "lookup")) add(component.props.optionsQuery);
  }
  return ids;
}

/**
 * Önbellek anahtarı: sayfa + sorgunun tanımı + çözülmüş parametre değerleri. Tanım ya da bağlanan değer değişince
 * anahtar değişir ve örnek yeniden istenir; aynı anahtar yeniden istenmez.
 */
export function sampleCacheKey(pageId: string | null | undefined, query: PageQuery, values: Record<string, unknown>): string {
  const parameters = query.parameters.map((parameter) => [parameter.name, parameter.type, parameter.binding]);
  const resolved = Object.keys(values).sort().map((name) => [name, values[name] === undefined ? null : values[name]]);
  return JSON.stringify([pageId ?? "", query.id, query.kind, query.sql ?? null, query.operation ?? null, parameters, resolved]);
}

/**
 * Örnek verinin çalışmasını engelleyen parametre durumu. Seçili satıra (`…seciliSatir…`) bağlı parametre boşsa
 * "Bir satır seçin"; ERP işleminin zorunlu parametresi boşsa ayrı ileti. Boş giriş kutusuna bağlı isteğe bağlı
 * parametre (ör. arama metni) engel değildir.
 */
export function sampleBlocker(parameters: readonly { name: string; binding: string }[], pathOf: (binding: string) => string | null,
  resolve: (path: string) => unknown, required: ReadonlySet<string> = new Set()): string | null {
  let missingRequired = false;
  for (const parameter of parameters) {
    const path = pathOf(parameter.binding);
    const value = path ? resolve(path) : undefined;
    const empty = value === undefined || value === null || value === "";
    if (path && empty && /(^|\.)seciliSatir(\.|\[|$)/.test(path)) return NEEDS_SELECTION;
    if (empty && required.has(parameter.name)) missingRequired = true;
  }
  return missingRequired ? NEEDS_PARAMETER : null;
}

/**
 * SQL önizleme ucu taslağın kayıtlı tanımını çalıştırır. Örnek, yalnız sorgunun SQL'i, türü ve parametre adları/türleri
 * kayıtlı kopyayla aynıysa kendiliğinden istenir (bağlama değerleri istekle gider, kayıt gerektirmez).
 */
export function storedQueryMatches(stored: PageQuery | undefined, current: PageQuery): boolean {
  if (!stored || typeof current.operation === "string" || typeof stored.operation === "string") return false;
  if (stored.kind !== current.kind || (stored.sql ?? "") !== (current.sql ?? "")) return false;
  if (stored.parameters.length !== current.parameters.length) return false;
  return stored.parameters.every((parameter, index) => parameter.name.toLowerCase() === current.parameters[index].name.toLowerCase() && parameter.type === current.parameters[index].type);
}

/** Kayıtlı tanım JSON'undaki sorgular (okunamazsa boş liste). */
export function storedQueries(definitionJson: string | undefined | null): PageQuery[] {
  if (!definitionJson) return [];
  try {
    const raw = JSON.parse(definitionJson) as { queries?: unknown };
    return Array.isArray(raw.queries) ? raw.queries.filter((item): item is PageQuery => !!item && typeof item === "object" && typeof (item as PageQuery).id === "string")
      .map((item) => ({ ...item, parameters: Array.isArray(item.parameters) ? item.parameters : [] })) : [];
  } catch { return []; }
}
