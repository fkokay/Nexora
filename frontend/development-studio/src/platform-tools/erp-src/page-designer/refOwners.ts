/**
 * Yalnız Studio: üst düzey bileşenlere kimlikle başvuran kapların (Pencere `contains`, Form kartı ve Yan filtre paneli
 * `inputs`) tasarım ekranı yardımcıları. Kayıt biçimi değişmez: bu yardımcılar yalnız o kimlik dizisini yeniden yazar,
 * bileşenler sayfada (üst düzeyde) kalır. Değişmeyen bileşenler ve diziler aynı nesne olarak kalır (geri alma yığını ve
 * kaydedilen tanım bozulmaz). Başka modüle bağlı değildir (node ile doğrudan denenebilir); kurallar layoutRefs.ts ve
 * sunucudaki TenantCustomPageSchema ile aynıdır.
 */

export type RefComponent = { id: string; type: string; props?: Record<string, unknown>; children?: unknown };
export type RefOwnerType = "dialog" | "formCard" | "facetPanel";

export const REF_OWNER_TYPES: readonly RefOwnerType[] = ["dialog", "formCard", "facetPanel"];
export const isRefOwnerType = (type: string): type is RefOwnerType => (REF_OWNER_TYPES as readonly string[]).includes(type);
/** Kimlik dizisinin anahtarı. */
export const refKey = (type: RefOwnerType) => type === "dialog" ? "contains" : "inputs";
/** Sunucu sınırları: pencerede en çok 20 bileşen (MaxDialogContains), form kartı/yan panelde en çok 12 giriş (MaxLayoutInputs). */
export const refLimit = (type: RefOwnerType) => type === "dialog" ? 20 : 12;

/** Metin dizisinden tekil, boş olmayan, en fazla `max` kimlik (layoutRefs.idList ile aynı). */
function idList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id) seen.add(id);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Sahibin üyeleri (kayıt sırasıyla). Sahip türü değilse boş. */
export function refIds(owner: RefComponent): string[] {
  return isRefOwnerType(owner.type) ? idList(owner.props?.[refKey(owner.type)], refLimit(owner.type)) : [];
}

/** Bileşenin kimlikle bağlı olduğu ilk üst düzey sahip ve sahibin içindeki sırası (yoksa `null`). */
export function refLocation(components: RefComponent[], id: string): { ownerId: string; index: number } | null {
  for (const component of components) {
    if (!isRefOwnerType(component.type) || component.id === id) continue;
    const index = refIds(component).indexOf(id);
    if (index >= 0) return { ownerId: component.id, index };
  }
  return null;
}

/** Seçenek sorgulu seçim girişi: yan filtre panelinin alabildiği tek giriş türü (sunucudaki SelectInputsWithOptions). */
export const isFacetInput = (component: { type: string; props?: Record<string, unknown> }) => component.type === "input"
  && component.props?.inputType === "select" && typeof component.props?.optionsQuery === "string" && component.props.optionsQuery !== "";

/** Sahibe paletten eklenebilen türler: pencere İşlem Çubuğu ve başka Pencere dışında her şeyi, form kartı/yan panel yalnız giriş alır. */
export function canOwnType(ownerType: RefOwnerType, type: string): boolean {
  return ownerType === "dialog" ? type !== "dialog" && type !== "actionBar" : type === "input";
}

/** Form kartı ve yan filtre paneli girişleri ile sunucu sayfalı listelerin arama girişleri (bunlar başka yere alınamaz). */
function layoutClaims(components: RefComponent[], exceptOwnerId: string): Map<string, string> {
  const claims = new Map<string, string>();
  for (const component of components) {
    if (component.id === exceptOwnerId) continue;
    if (component.type === "formCard" || component.type === "facetPanel") for (const id of refIds(component)) if (!claims.has(id)) claims.set(id, component.type);
    if (component.type === "dataTable" && typeof component.props?.searchInput === "string") claims.set(component.props.searchInput, "searchInput");
    if (component.type === "dataTable") for (const id of idList(component.props?.rowActions, 4)) claims.set(id, "rowAction");
    if (component.type === "dataTable" && typeof component.props?.rowOpenAction === "string" && !claims.has(component.props.rowOpenAction)) claims.set(component.props.rowOpenAction, "rowOpen");
    if (component.type === "recordHeader") for (const id of idList(component.props?.buttons, 3)) if (!claims.has(id)) claims.set(id, "headerButton");
  }
  return claims;
}

const CLAIM_TEXT: Record<string, string> = {
  formCard: "başka bir form kartında", facetPanel: "bir yan filtre panelinde", searchInput: "bir listenin arama kutusu", rowAction: "bir listenin satır işlemi", headerButton: "bir kayıt özetinin düğmesi", rowOpen: "bir listenin satır açma düğmesi",
};

/**
 * Bileşen (var olan: `id` ile; paletten yeni: yalnız `type` ve gerekiyorsa `props` ile) sahibe alınabilir mi? Uygunsa
 * `null`, değilse kullanıcıya gösterilecek neden. Sekmede ya da başka bir pencerede duran bileşen alınabilir (oradan çıkar).
 */
export function refPlacementProblem(components: RefComponent[], ownerId: string, moving: { id?: string; type: string; props?: Record<string, unknown> }): string | null {
  const owner = components.find((component) => component.id === ownerId);
  if (!owner || !isRefOwnerType(owner.type)) return "Bileşen bulunamadı.";
  const ownerType = owner.type;
  if (!canOwnType(ownerType, moving.type)) {
    return ownerType === "dialog" ? "Pencereye İşlem Çubuğu ya da başka bir Pencere konamaz."
      : ownerType === "formCard" ? "Form kartına yalnız giriş kutusu konabilir." : "Yan filtre paneline yalnız giriş kutusu konabilir.";
  }
  const ids = refIds(owner);
  const member = moving.id !== undefined && ids.includes(moving.id);
  if (moving.id !== undefined && !member) {
    if (moving.id === ownerId) return "Bileşen kendi içine konamaz.";
    if (!components.some((component) => component.id === moving.id)) return "Yalnız sayfadaki (üst düzey) bileşenler alınabilir.";
    const claim = layoutClaims(components, ownerId).get(moving.id);
    if (claim) return `Bu bileşen ${CLAIM_TEXT[claim]}; önce oradan çıkarın.`;
  }
  const props = moving.id !== undefined ? components.find((component) => component.id === moving.id)?.props : moving.props;
  if (ownerType === "facetPanel" && !isFacetInput({ type: moving.type, props })) return "Yan filtre paneline yalnız seçenek sorgulu seçim girişi konabilir.";
  if (!member && ids.length >= refLimit(ownerType)) {
    return ownerType === "dialog" ? `Bir pencerede en fazla ${refLimit(ownerType)} bileşen olabilir.` : `Bir ${ownerType === "formCard" ? "form kartında" : "yan filtre panelinde"} en fazla ${refLimit(ownerType)} giriş olabilir.`;
  }
  return null;
}

const clampIndex = (value: number, length: number) => Math.max(0, Math.min(Number.isFinite(value) ? Math.floor(value) : length, length));

/** Sahibin kimlik dizisini yazar; boş kalırsa boş dizi kalır (anahtar silinmez, müfettiş "en az bir" uyarısını gösterir). */
function writeIds<C extends RefComponent>(components: C[], ownerId: string, update: (ids: string[]) => string[] | null): C[] {
  let changed = false;
  const next = components.map((component) => {
    if (changed || component.id !== ownerId || !isRefOwnerType(component.type)) return component;
    const ids = update(refIds(component));
    if (!ids) return component;
    changed = true;
    return { ...component, props: { ...component.props, [refKey(component.type)]: ids } };
  });
  return changed ? next : components;
}

/** Kimliği sahibin `at` sırasına ekler; zaten üyeyse aynı dizi (sıralama için `moveRef`). Sınır doluysa aynı dizi. */
export function insertRef<C extends RefComponent>(components: C[], ownerId: string, id: string, at: number): C[] {
  return writeIds(components, ownerId, (ids) => {
    const owner = components.find((component) => component.id === ownerId)!;
    if (ids.includes(id) || ids.length >= refLimit(owner.type as RefOwnerType)) return null;
    const next = [...ids];
    next.splice(clampIndex(at, ids.length), 0, id);
    return next;
  });
}

/** Üyeyi sahibinde `target` sırasına taşır (`target` taşımadan önceki sıradır, tuvaldeki yer tutucu gibi). Yer değişmiyorsa aynı dizi. */
export function moveRef<C extends RefComponent>(components: C[], ownerId: string, id: string, target: number): C[] {
  return writeIds(components, ownerId, (ids) => {
    const from = ids.indexOf(id);
    if (from < 0) return null;
    const insertion = clampIndex(from < target ? target - 1 : target, ids.length - 1);
    if (insertion === from) return null;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(insertion, 0, id);
    return next;
  });
}

/** Üyeyi ilk sahibinde ±1 kaydırır; uçtaysa aynı dizi. */
export function stepRef<C extends RefComponent>(components: C[], id: string, delta: -1 | 1): C[] {
  const location = refLocation(components, id);
  if (!location) return components;
  return moveRef(components, location.ownerId, id, delta < 0 ? location.index - 1 : location.index + 2);
}

/** "Pencereden / form kartından çıkar": kimlik sahibin dizisinden kalkar, bileşen sayfada kendi yerinde kalır. */
export function removeRef<C extends RefComponent>(components: C[], ownerId: string, id: string): C[] {
  return writeIds(components, ownerId, (ids) => ids.includes(id) ? ids.filter((item) => item !== id) : null);
}

/**
 * Var olan üst düzey bileşeni sahibin `at` sırasına alır: önce aynı türden başka pencerelerden çıkar (bir bileşenin tek
 * sahibi olur), sonra eklenir; zaten üyeyse sıralanır. Kural ihlalinde aynı dizi. Sekmeden çıkarma çağıranın işidir.
 */
export function adoptRef<C extends RefComponent>(components: C[], ownerId: string, id: string, at: number): C[] {
  const moving = components.find((component) => component.id === id);
  if (!moving || refPlacementProblem(components, ownerId, { id, type: moving.type })) return components;
  const owner = components.find((component) => component.id === ownerId)!;
  if (refIds(owner).includes(id)) return moveRef(components, ownerId, id, at);
  let next = components;
  for (const other of components) if (other.id !== ownerId && other.type === "dialog" && refIds(other).includes(id)) next = removeRef(next, other.id, id);
  return insertRef(next, ownerId, id, at);
}
