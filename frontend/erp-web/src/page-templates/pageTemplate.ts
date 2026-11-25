/** Sayfa tanımındaki `template` alanı. Bu sürümde kabul edilen tek ad `list`. */
export type PageTemplate = { name: "list" };

/** Geçersiz ya da eksik `template` için `null` döner: sayfa eski biçimde çizilir. */
export function readPageTemplate(definition: unknown): PageTemplate | null {
  if (!definition || typeof definition !== "object") return null;
  const template = (definition as { template?: unknown }).template;
  if (!template || typeof template !== "object" || Array.isArray(template)) return null;
  return (template as { name?: unknown }).name === "list" ? { name: "list" } : null;
}
