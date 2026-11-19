// Saf (React'siz) yardımcılar: özel sayfa değişken bağlama kapsamı, yol çözümleme ve sorgu sıralama.

export type PageScope = Record<string, unknown>;

const PATH = String.raw`[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,4}\])*`;
const EMBEDDED = new RegExp(String.raw`\{\{\s*(${PATH})\s*\}\}`, "g");
const SINGLE = new RegExp(String.raw`^\{\{\s*(${PATH})\s*\}\}$`);
const TOKEN = /([A-Za-z_][A-Za-z0-9_]*)|\[(\d{1,4})\]/g;

/** "q.rows[0].Ad" gibi bir yolu kapsamda çözer; çözülemezse undefined döner. */
export function resolvePath(scope: PageScope, path: string): unknown {
  if (!new RegExp(`^${PATH}$`).test(path)) return undefined;
  let current: unknown = scope;
  TOKEN.lastIndex = 0;
  for (const match of path.matchAll(TOKEN)) {
    if (current === null || typeof current !== "object") return undefined;
    if (match[1] !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(current, match[1])) return undefined;
      current = (current as Record<string, unknown>)[match[1]];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(match[2])];
    }
  }
  return current;
}

/** Bir değeri metin olarak yazar; çözülemeyen, boş ve nesne değerleri "" olur. */
export function displayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "";
}

/** "{{a}} ve {{b.c}}" ifadelerini kapsamdaki değerlerle değiştirir; çözülemeyen ifade "" olur. */
export function interpolate(template: string, scope: PageScope): string {
  if (!template.includes("{{")) return template;
  return template.replace(EMBEDDED, (_match, path: string) => displayText(resolvePath(scope, path)));
}

/**
 * Tuval metni: `{{…}}` bağlamaları örnek kapsamla çözülür; sonuç boşsa (örnek veri yok, yol çözülemedi) ham metin kalır,
 * böylece tasarımcı bağlamayı görmeye devam eder.
 */
export function sampleText(template: string, scope: PageScope): string {
  if (!template.includes("{{")) return template;
  const resolved = interpolate(template, scope);
  return resolved.trim() === "" ? template : resolved;
}

/** Tek bir "{{ x.y }}" ifadesinin yolunu verir; ifade başka metin içeriyorsa null. */
export function bindingPath(expression: string): string | null {
  const match = SINGLE.exec(expression);
  return match ? match[1] : null;
}

/** Sorguları parametre bağlamalarının dayandığı sorgulara göre sıralar (bağımlılar sonra). Adların listesini döndürür. */
export function queryOrder(queries: { name: string; parameters: { binding: string }[] }[]): string[] {
  const names = new Set(queries.map((query) => query.name));
  const dependencies = new Map<string, string[]>(queries.map((query) => [query.name, query.parameters
    .map((parameter) => bindingPath(parameter.binding)?.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0])
    .filter((root): root is string => !!root && names.has(root) && root !== query.name)]));
  const ordered: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string) => {
    if (state.has(name)) return; // tamamlandı ya da döngü (şema döngüyü reddeder; burada sonsuz döngüden kaçınılır)
    state.set(name, "visiting");
    for (const dependency of dependencies.get(name) ?? []) visit(dependency);
    state.set(name, "done");
    ordered.push(name);
  };
  for (const query of queries) visit(query.name);
  return ordered;
}

/** Bağlama ifadesinden çıkan çözülmüş değeri parametre türüne çevirir; çözülemezse null. */
export function coerceParameter(value: unknown, type: string): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case "text":
      return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : null;
    case "int": case "decimal":
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    case "date":
      return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null;
    case "bool":
      if (typeof value === "boolean") return value;
      return value === "true" ? true : value === "false" ? false : null;
    case "guid":
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    default:
      return null;
  }
}
