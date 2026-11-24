// Sorgunun çalışma biçimi (`runOn`): "load" (açılışta + bağlı değer değişince), "manual" (yalnız düğmeyle) ya da
// 1–10 farklı bileşen adı (önizleme: açılışta load gibi, sonra listelenen giriş / tablo değişince gecikmeli yeniden çalışır;
// `runDebounceMs`). Dizi yalnız okuma sorgusunda; sayfalı tablo sorgusu dizi olamaz.
// Sunucu şeması ve erp-web usePageQueries ile aynı biçim.

export type QueryRunOn = "load" | "manual" | string[];
export type RunOnMode = "load" | "manual" | "components";

export const DEFAULT_RUN_DEBOUNCE_MS = 400;
export const MIN_RUN_DEBOUNCE_MS = 150;
export const MAX_RUN_DEBOUNCE_MS = 3000;
export const MAX_RUN_ON_NAMES = 10;

export const runOnModeLabels: Record<RunOnMode, string> = { load: "Açılışta + değişince", manual: "Elle", components: "Açılışta + bileşen değişince (önizleme)" };

export const runOnMode = (runOn: unknown): RunOnMode => Array.isArray(runOn) ? "components" : runOn === "manual" ? "manual" : "load";
export const runOnNames = (runOn: unknown): string[] => Array.isArray(runOn) ? runOn.filter((item): item is string => typeof item === "string") : [];

/** Sorgu kartında gösterilen kısa çalışma metni. */
export function runOnSummary(runOn: unknown): string {
  const mode = runOnMode(runOn);
  if (mode !== "components") return runOnModeLabels[mode];
  const names = runOnNames(runOn);
  return names.length > 0 ? `Değişince: ${names.join(", ")}` : runOnModeLabels.components;
}

/** Kip değişimi: bileşen listesine geçerken ilk aday seçilir; diğer kiplerde gecikme kalkar. */
export function runOnPatch(mode: RunOnMode, candidates: string[], current: unknown): { runOn: QueryRunOn; runDebounceMs?: number | undefined } {
  if (mode !== "components") return { runOn: mode, runDebounceMs: undefined };
  const names = runOnNames(current);
  return { runOn: names.length > 0 ? names : candidates.slice(0, 1) };
}

/** Gecikme girdisi: boşsa varsayılan (yazılmaz), aksi halde 150–3000 aralığına çekilir. */
export const clampDebounce = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? undefined
  : Math.max(MIN_RUN_DEBOUNCE_MS, Math.min(MAX_RUN_DEBOUNCE_MS, Math.round(value)));

/**
 * Bileşen listeli `runOn` sorunu (sunucu da reddeder): yalnız okuma sorgusunda, 1–10 ad, her ad sayfadaki bir giriş ya da
 * düzenlenebilir tablo adı olmalı; gecikme 150–3000. Sorun yoksa null.
 */
export function runOnProblem(query: { name: string; kind: string; runOn?: unknown; runDebounceMs?: unknown }, componentNames: readonly string[]): string | null {
  if ("runDebounceMs" in query && query.runDebounceMs !== undefined) {
    if (!Array.isArray(query.runOn)) return `'${query.name}' sorgusu: runDebounceMs yalnız bileşen listeli runOn ile kullanılır.`;
    const value = query.runDebounceMs;
    if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_RUN_DEBOUNCE_MS || value > MAX_RUN_DEBOUNCE_MS)
      return `'${query.name}' sorgusu: runDebounceMs ${MIN_RUN_DEBOUNCE_MS}–${MAX_RUN_DEBOUNCE_MS} arasında bir tam sayı olmalıdır.`;
  }
  if (!Array.isArray(query.runOn)) return null;
  if (query.kind !== "read") return `'${query.name}' sorgusu: bileşen listeli runOn yalnız okuma sorgusunda kullanılır.`;
  const names = runOnNames(query.runOn);
  if (names.length < 1 || names.length > MAX_RUN_ON_NAMES || names.length !== query.runOn.length || new Set(names).size !== names.length)
    return `'${query.name}' sorgusu: runOn 1–${MAX_RUN_ON_NAMES} farklı bileşen adı içermelidir.`;
  const known = new Set(componentNames);
  const missing = names.find((name) => !known.has(name));
  return missing ? `'${query.name}' sorgusu: runOn dizisindeki '${missing}' sayfadaki bir giriş ya da düzenlenebilir tablo adı olmalıdır.` : null;
}

/** `runOn` listesine konabilecek bileşenler: adlı girişler ve düzenlenebilir tablolar. */
export const RUN_ON_TYPES = new Set(["input", "editableGrid"]);
