/**
 * Katalog düzeyindeki sabit sorgu değerleri (`fixedQuery`, ör. pasife al/etkinleştir için `isActive`). Sayfa bunları bağlayamaz;
 * sunucu anahtarların bağlı parametrelerle çakışmadığını doğrular. `false`/`0` boş sayılmaz, olduğu gibi yazılır; null ve
 * nesne/dizi değerler atlanır. Aynı adlı bağlı değer varsa sabit değer kazanır.
 */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function appendFixedQuery(query: URLSearchParams, fixed: Record<string, unknown> | null | undefined): void {
  if (!fixed || typeof fixed !== "object" || Array.isArray(fixed)) return;
  for (const [key, value] of Object.entries(fixed)) {
    if (key === "" || UNSAFE_KEYS.has(key)) continue;
    if (typeof value === "boolean") query.set(key, value ? "true" : "false");
    else if (typeof value === "number" && Number.isFinite(value)) query.set(key, String(value));
    else if (typeof value === "string") query.set(key, value);
  }
}
