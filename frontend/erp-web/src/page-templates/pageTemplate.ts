/** Sayfa tanımındaki `template` alanı. Kabul edilen adlar: `list` (Liste), `record` (Kayıt kartı) ve `free` (Serbest gövde). */
export type PageTemplate = { name: "list" } | { name: "record" } | { name: "free" };

/** Geçersiz ya da eksik `template` için `null` döner: sayfa eski biçimde çizilir. */
export function readPageTemplate(definition: unknown): PageTemplate | null {
  if (!definition || typeof definition !== "object") return null;
  const template = (definition as { template?: unknown }).template;
  if (!template || typeof template !== "object" || Array.isArray(template)) return null;
  const name = (template as { name?: unknown }).name;
  return name === "list" ? { name: "list" } : name === "record" ? { name: "record" } : name === "free" ? { name: "free" } : null;
}
