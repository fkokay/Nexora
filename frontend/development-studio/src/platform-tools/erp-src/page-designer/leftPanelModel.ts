/**
 * Sayfa tasarımcısı sol paneli için saf mantık: ortak arama, katman ağacı, bölüm boyutları ve yeni sayfa kodu.
 * React'e ve diğer modüllere bağlı değildir (node ile doğrudan denenebilir).
 */

// ---- Arama ----------------------------------------------------------------------------------------------------------

export const normalizeTerm = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

/** Terim boşsa her şey eşleşir; değilse alanlardan biri terimi içermelidir (tr-TR küçük harf). */
export function matchesTerm(term: string, ...fields: (string | undefined | null)[]): boolean {
  const normalized = normalizeTerm(term);
  if (!normalized) return true;
  return fields.some((field) => typeof field === "string" && field.toLocaleLowerCase("tr-TR").includes(normalized));
}

// ---- Katman ağacı ---------------------------------------------------------------------------------------------------

export type LayerSource = { id: string };
/** Bir bileşenin sahiplendiği çocuklar: sekme başına (etiketli) ya da pencere için tek grup. */
export type ChildGroup = { label?: string; ids: string[] };
export type LayerNode = { id: string; index: number; depth: number; parentId: string | null; group?: string };

/**
 * Düz bileşen listesinden görüntü sırasına göre düzleştirilmiş ağaç kurar. Sekme/pencere çocukları sahibinin hemen
 * altında, bir derece girintili listelenir. Bir bileşen birden çok sahipte geçse de yalnız ilk sahibin altında görünür;
 * döngüler ve var olmayan kimlikler yok sayılır. Hiçbir bileşen kaybolmaz (sahipsizler kökte kalır).
 */
export function buildLayerTree<T extends LayerSource>(components: T[], childrenOf: (component: T) => ChildGroup[]): LayerNode[] {
  const indexById = new Map<string, number>();
  components.forEach((component, index) => { if (!indexById.has(component.id)) indexById.set(component.id, index); });
  const ownerOf = new Map<string, { parentId: string; group?: string }>();
  for (const component of components) {
    for (const group of childrenOf(component)) for (const id of group.ids) {
      if (id === component.id || !indexById.has(id) || ownerOf.has(id)) continue;
      ownerOf.set(id, { parentId: component.id, group: group.label });
    }
  }
  // Döngü (A→B→A) varsa iki taraf da kökten erişilemez; böyle bileşenler köke alınır.
  const reachesRoot = (id: string) => {
    const seen = new Set<string>();
    let cursor: string | undefined = id;
    while (cursor && ownerOf.has(cursor)) {
      if (seen.has(cursor)) return false;
      seen.add(cursor);
      cursor = ownerOf.get(cursor)?.parentId;
    }
    return true;
  };
  const cyclic = [...ownerOf.keys()].filter((id) => !reachesRoot(id));
  for (const id of cyclic) ownerOf.delete(id);

  const childrenByParent = new Map<string, { id: string; group?: string }[]>();
  for (const component of components) {
    for (const group of childrenOf(component)) for (const id of group.ids) {
      const owner = ownerOf.get(id);
      if (!owner || owner.parentId !== component.id || owner.group !== group.label) continue;
      const list = childrenByParent.get(component.id) ?? [];
      if (!list.some((item) => item.id === id)) list.push({ id, group: group.label });
      childrenByParent.set(component.id, list);
    }
  }
  const result: LayerNode[] = [];
  const placed = new Set<string>();
  const visit = (id: string, depth: number, parentId: string | null, group?: string) => {
    if (placed.has(id)) return;
    placed.add(id);
    result.push({ id, index: indexById.get(id) ?? -1, depth, parentId, ...(group !== undefined ? { group } : {}) });
    for (const child of childrenByParent.get(id) ?? []) visit(child.id, depth + 1, id, child.group);
  };
  for (const component of components) if (!ownerOf.has(component.id)) visit(component.id, 0, null);
  return result;
}

/** Eşleşen düğümleri ve onların atalarını tutar (ağaç bağlamı kaybolmasın). */
export function filterLayerTree(nodes: LayerNode[], matches: (id: string) => boolean): LayerNode[] {
  const keep = new Set<string>();
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  for (const node of nodes) {
    if (!matches(node.id)) continue;
    let cursor: string | null | undefined = node.id;
    while (cursor && !keep.has(cursor)) { keep.add(cursor); cursor = parentOf.get(cursor); }
  }
  return nodes.filter((node) => keep.has(node.id));
}

// ---- Bölümler ve ayırıcılar -----------------------------------------------------------------------------------------

export const LEFT_PANEL_SECTIONS = ["components", "layers", "queries", "variables"] as const;
export type LeftPanelSection = (typeof LEFT_PANEL_SECTIONS)[number];
export type LeftPanelState = { open: Record<LeftPanelSection, boolean>; weights: Record<LeftPanelSection, number> };
export const LEFT_PANEL_STORAGE_KEY = "nexora.studio.leftPanel";
export const MIN_SECTION_PX = 64;
export const defaultLeftPanelState = (): LeftPanelState => ({
  open: { components: true, layers: true, queries: false, variables: false },
  weights: { components: 2, layers: 1, queries: 1, variables: 1 },
});

/** Saklanan değeri doğrular; bozuk ya da eksik alanlar varsayılana döner. */
export function parseLeftPanelState(raw: string | null | undefined): LeftPanelState {
  const state = defaultLeftPanelState();
  if (!raw) return state;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return state; }
  if (!value || typeof value !== "object") return state;
  const { open, weights } = value as { open?: Record<string, unknown>; weights?: Record<string, unknown> };
  for (const key of LEFT_PANEL_SECTIONS) {
    if (open && typeof open[key] === "boolean") state.open[key] = open[key] as boolean;
    const weight = weights?.[key];
    if (typeof weight === "number" && Number.isFinite(weight) && weight > 0 && weight < 1000) state.weights[key] = weight;
  }
  return state;
}

/**
 * İki komşu açık bölüm arasındaki ayırıcı `delta` piksel sürüklenince yeni ağırlıklar. Toplam ağırlık ve toplam yükseklik
 * korunur; her bölüm en az `minPx` kalır (iki bölüm birlikte buna yetmiyorsa eşit bölünür).
 */
export function resizeSectionPair(weightA: number, weightB: number, heightA: number, heightB: number, delta: number, minPx = MIN_SECTION_PX): [number, number] {
  const totalWeight = weightA + weightB;
  const totalHeight = heightA + heightB;
  if (!(totalWeight > 0) || !(totalHeight > 0)) return [weightA, weightB];
  if (totalHeight < minPx * 2) return [totalWeight / 2, totalWeight / 2];
  const nextA = Math.max(minPx, Math.min(totalHeight - minPx, heightA + delta));
  const a = totalWeight * nextA / totalHeight;
  return [a, totalWeight - a];
}

// ---- Yuvalar (sabitle / otomatik gizle) -----------------------------------------------------------------------------

export type DockSide = "left" | "right";
export type DockState = Record<DockSide, boolean>;
export const DOCKS_STORAGE_KEY = "nexora.studio.docks";

/** Yuvaların sabitlenme durumu; varsayılan ikisi de sabit (bugünkü yerleşim). */
export function parseDockState(raw: string | null | undefined): DockState {
  const state: DockState = { left: true, right: true };
  if (!raw) return state;
  try {
    const value = JSON.parse(raw) as Partial<Record<DockSide, unknown>> | null;
    if (value && typeof value === "object") for (const side of ["left", "right"] as const) if (typeof value[side] === "boolean") state[side] = value[side] as boolean;
  } catch { /* bozuk değer: varsayılan */ }
  return state;
}

// ---- Yeni sayfa kodu ------------------------------------------------------------------------------------------------

export const PAGE_CODE_MAX = 40;
const turkishMap: Record<string, string> = { ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Elle yazılan kodu bugünkü kuralla temizler: küçük harf, rakam, - ve _; diğerleri "-". */
export const sanitizePageCode = (value: string) => value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, PAGE_CODE_MAX);

/** Sayfa adından kod önerir: "Masraf Merkezleri" → "masraf-merkezleri". */
export function pageCodeFromName(name: string): string {
  const lowered = name.toLocaleLowerCase("tr-TR");
  let out = "";
  for (const char of lowered) out += turkishMap[char] ?? char;
  return out.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, PAGE_CODE_MAX).replace(/-$/, "");
}

/** Kod alınmışsa sonuna -2, -3… ekler (bugünkü şablon davranışı). */
export function uniquePageCode(base: string, taken: (code: string) => boolean): string {
  if (!base || !taken(base)) return base;
  let suffix = 2;
  let next = `${base.slice(0, PAGE_CODE_MAX - 3)}-${suffix}`;
  while (taken(next)) next = `${base.slice(0, PAGE_CODE_MAX - 3)}-${++suffix}`;
  return next;
}
