/**
 * Yalnız Studio: bilgi kartı / bölümün `children` dizisini (kartın içindeki bileşenler) düzenleme yardımcıları. Kayıt biçimi
 * değişmez: kart `children` dizisini, kartın içindeki Sekmeler de sekme girdilerini ("Etiket=kimlik,kimlik") taşır; sekme
 * üyeleri sunucu kuralı gereği üst düzey bileşenlerdir. Değişmeyen bileşenler ve diziler aynı nesne olarak kalır (geri alma
 * yığını ve kaydedilen tanım bozulmaz). Başka modüle bağlı değildir (node ile doğrudan denenebilir).
 */

export type TreeComponent = { id: string; type: string; props?: Record<string, unknown>; children?: unknown };

export const CARD_TYPES: readonly string[] = ["card", "section"];
export const isCardType = (type: string) => CARD_TYPES.includes(type);

/**
 * Kart tasarım ekranında karta eklenebilen türler. Sunucu kartın içinde her türe izin verir; sayfa düzeyindeki kaplar
 * (İşlem Çubuğu, Pencere, iç içe kart/bölüm) ve sayfanın girişlerini sahiplenen yerleşimler (form kartı, yan filtre paneli,
 * filtre çipleri, giriş kutusu, düzenlenebilir tablo, özel alanlar) burada sunulmaz: onların başvuruları üst düzeyde çözülür.
 */
export const CARD_CHILD_TYPES: readonly string[] = ["heading", "text", "label", "badge", "button", "metric", "progress", "list", "image", "alert",
  "divider", "spacer", "tabs", "dataTable", "contextPanel"];
export const canBeCardChild = (type: string) => CARD_CHILD_TYPES.includes(type);

const isComponent = (value: unknown): value is TreeComponent =>
  !!value && typeof value === "object" && typeof (value as TreeComponent).id === "string" && typeof (value as TreeComponent).type === "string";

/** Kartın geçerli çocukları (geçersiz öğeler atlanır; yalnız okumak için). */
export function cardChildren<C extends TreeComponent>(component: C): C[] {
  return Array.isArray(component.children) ? component.children.filter(isComponent) as C[] : [];
}

/** Her düzeyde bütün bileşenler (önce sahip, sonra çocukları). */
export function flattenComponents<C extends TreeComponent>(components: C[]): C[] {
  const result: C[] = [];
  const visit = (list: C[]) => { for (const component of list) { result.push(component); visit(cardChildren(component)); } };
  visit(components);
  return result;
}

export function findComponent<C extends TreeComponent>(components: C[], id: string): C | null {
  for (const component of components) {
    if (component.id === id) return component;
    const found = findComponent(cardChildren(component), id);
    if (found) return found;
  }
  return null;
}

/** Bileşen bir üst düzey kartın doğrudan çocuğuysa kart kimliği ve kart içindeki sırası. */
export function cardLocation<C extends TreeComponent>(components: C[], id: string): { cardId: string; index: number } | null {
  for (const component of components) {
    if (!isCardType(component.type)) continue;
    const index = cardChildren(component).findIndex((child) => child.id === id);
    if (index >= 0) return { cardId: component.id, index };
  }
  return null;
}

function mapList<C extends TreeComponent>(list: unknown[], fn: (component: C) => C): unknown[] {
  let changed = false;
  const next = list.map((item) => {
    if (!isComponent(item)) return item;
    const mapped = mapNode(item as C, fn);
    if (mapped !== item) changed = true;
    return mapped;
  });
  return changed ? next : list;
}

function mapNode<C extends TreeComponent>(component: C, fn: (component: C) => C): C {
  const own = fn(component);
  if (!Array.isArray(own.children)) return own;
  const children = mapList(own.children, fn);
  return children === own.children ? own : { ...own, children };
}

/** `fn` her düzeydeki her bileşene uygulanır; hiçbiri değişmezse aynı dizi döner. */
export function mapComponents<C extends TreeComponent>(components: C[], fn: (component: C) => C): C[] {
  return mapList(components, fn) as C[];
}

/** Kimliği verilen bileşeni (hangi düzeyde olursa olsun) değiştirir. */
export function updateComponent<C extends TreeComponent>(components: C[], id: string, fn: (component: C) => C): C[] {
  return mapComponents(components, (component) => component.id === id ? fn(component) : component);
}

/** Kartın çocuk dizisini yazar; boş kalırsa `children` anahtarı kalkar (boş dizi eklenmez). */
function withChildren<C extends TreeComponent>(card: C, children: unknown[]): C {
  const next = { ...card };
  if (children.length > 0) next.children = children; else delete next.children;
  return next;
}

/** Kimliği her düzeyden kaldırır. */
export function removeComponent<C extends TreeComponent>(components: C[], id: string): C[] {
  const prune = (list: unknown[]): unknown[] => {
    let changed = false;
    const next: unknown[] = [];
    for (const item of list) {
      if (isComponent(item) && item.id === id) { changed = true; continue; }
      if (isComponent(item) && Array.isArray(item.children)) {
        const children = prune(item.children);
        if (children !== item.children) { changed = true; next.push(withChildren(item, children)); continue; }
      }
      next.push(item);
    }
    return changed ? next : list;
  };
  return prune(components) as C[];
}

/** Geçerli çocuk sırası (`at`) ham dizideki sıraya çevrilir (geçersiz öğeler yerinde kalır). */
function rawIndex(raw: unknown[], at: number): number {
  let seen = 0;
  for (let index = 0; index < raw.length; index++) {
    if (!isComponent(raw[index])) continue;
    if (seen === at) return index;
    seen++;
  }
  return raw.length;
}

const clampIndex = (value: number, length: number) => Math.max(0, Math.min(Number.isFinite(value) ? Math.floor(value) : length, length));

/** Yeni bileşeni kartın `at` sırasına ekler. Kart yoksa ya da kart türü değilse aynı dizi döner. */
export function insertCardChild<C extends TreeComponent>(components: C[], cardId: string, child: C, at: number): C[] {
  let done = false;
  const next = components.map((component) => {
    if (done || component.id !== cardId || !isCardType(component.type)) return component;
    done = true;
    const raw = Array.isArray(component.children) ? [...component.children] : [];
    raw.splice(rawIndex(raw, clampIndex(at, cardChildren(component).length)), 0, child);
    return withChildren(component, raw);
  });
  return done ? next : components;
}

/**
 * Kartın çocuğunu kart içinde `target` sırasına taşır (`target` taşımadan önceki sıradır, tuvaldeki yer tutucu gibi).
 * Yer değişmiyorsa aynı dizi döner.
 */
export function moveCardChild<C extends TreeComponent>(components: C[], childId: string, target: number): C[] {
  const location = cardLocation(components, childId);
  if (!location) return components;
  const card = components.find((component) => component.id === location.cardId)!;
  const children = cardChildren(card);
  const insertion = clampIndex(location.index < target ? target - 1 : target, children.length - 1);
  if (insertion === location.index) return components;
  const ordered = [...children];
  const [moved] = ordered.splice(location.index, 1);
  ordered.splice(insertion, 0, moved);
  // Geçersiz öğeler (varsa) sona kalır; Studio onları yazmaz ama silmez de.
  const raw = Array.isArray(card.children) ? card.children : [];
  const rest = raw.filter((item) => !isComponent(item));
  return components.map((component) => component === card ? withChildren(card, [...ordered, ...rest]) : component);
}

/** Kartın çocuğunu ±1 kaydırır; uçtaysa aynı dizi. */
export function stepCardChild<C extends TreeComponent>(components: C[], childId: string, delta: -1 | 1): C[] {
  const location = cardLocation(components, childId);
  if (!location) return components;
  return moveCardChild(components, childId, delta < 0 ? location.index - 1 : location.index + 2);
}

/** "Karttan çıkar": çocuk karttan alınır ve sayfada kartın hemen arkasına konur. */
export function ejectCardChild<C extends TreeComponent>(components: C[], childId: string): C[] {
  const location = cardLocation(components, childId);
  if (!location) return components;
  const child = findComponent(components, childId)!;
  const next = removeComponent(components, childId);
  const cardIndex = next.findIndex((component) => component.id === location.cardId);
  const result = [...next];
  result.splice(cardIndex + 1, 0, child);
  return result;
}

/** Üst düzey bir bileşeni kartın `at` sırasına alır (sayfadan çıkar). Kartın kendisi ya da kart türleri alınmaz. */
export function adoptIntoCard<C extends TreeComponent>(components: C[], cardId: string, id: string, at: number): C[] {
  const moving = components.find((component) => component.id === id);
  if (!moving || id === cardId || isCardType(moving.type)) return components;
  return insertCardChild(components.filter((component) => component.id !== id), cardId, moving, at);
}

/** Üst düzey kartların doğrudan çocuğu olan Sekmeler bileşenleri. */
export function cardTabs<C extends TreeComponent>(components: C[]): C[] {
  return components.flatMap((component) => isCardType(component.type) ? cardChildren(component).filter((child) => child.type === "tabs") : []);
}

/**
 * Sekme yardımcılarının (placeInTab, removeFromTabs, tabLocation…) kartın içindeki Sekmeler'de de çalışması için düz görünüm:
 * üst düzey bileşenler, arkalarından kartlardaki Sekmeler. `applyFlat` sonucu yerine yazar.
 */
export function flatWithCardTabs<C extends TreeComponent>(components: C[]): C[] {
  const nested = cardTabs(components);
  return nested.length === 0 ? components : [...components, ...nested];
}

/** `flatWithCardTabs` görünümündeki değişiklikleri ağaca yazar. Görünüm sırası ve uzunluğu korunmalıdır. */
export function applyFlat<C extends TreeComponent>(components: C[], flat: C[]): C[] {
  const roots = flat.slice(0, components.length);
  let next: C[] = roots.every((component, index) => component === components[index]) ? components : roots;
  const nested = cardTabs(components);
  flat.slice(components.length).forEach((tabs, index) => {
    if (tabs !== nested[index]) next = updateComponent(next, tabs.id, () => tabs);
  });
  return next;
}

/** Düz görünümde bir işlem yapar; işlem `null` dönerse `null`, değişiklik yoksa aynı dizi. */
export function withCardTabs<C extends TreeComponent>(components: C[], op: (flat: C[]) => C[] | null): C[] | null {
  const flat = flatWithCardTabs(components);
  const result = op(flat);
  if (!result) return null;
  return result === flat ? components : applyFlat(components, result);
}

const TAB_OWNABLE_EXCLUDED = ["tabs", "actionBar", "dialog"];

/**
 * Kartın içindeki Sekmeler yalnız var olan üst düzey bileşenlere başvurabilir (sunucu kuralı): silinen ya da sekmeye
 * alınamayan bileşenin kimliği sekmeden kalkar. Değişiklik yoksa aynı dizi döner.
 */
export function pruneCardTabs<C extends TreeComponent>(components: C[]): C[] {
  if (cardTabs(components).length === 0) return components;
  const roots = new Map(components.map((component) => [component.id, component.type]));
  // Bir bileşenin tek sahibi olur: sayfadaki Sekmeler ya da Pencere'nin aldığı bileşen kartın sekmesinden kalkar.
  const claimed = new Set<string>();
  for (const component of components) {
    const list = component.type === "tabs" ? component.props?.tabs : component.type === "dialog" ? component.props?.contains : null;
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (typeof entry !== "string") continue;
      if (component.type === "dialog") { claimed.add(entry.trim()); continue; }
      const at = entry.indexOf("=");
      if (at >= 0 && at < entry.length - 1) for (const id of entry.slice(at + 1).split(",")) claimed.add(id.trim());
    }
  }
  const ok = (id: string) => roots.has(id) && !TAB_OWNABLE_EXCLUDED.includes(roots.get(id)!) && !claimed.has(id);
  let next = components;
  for (const tabs of cardTabs(components)) {
    const entries = Array.isArray(tabs.props?.tabs) ? tabs.props!.tabs as unknown[] : null;
    if (!entries) continue;
    let changed = false;
    const cleaned = entries.map((entry) => {
      if (typeof entry !== "string") return entry;
      const at = entry.indexOf("=");
      if (at < 0) return entry;
      const rest = entry.slice(at + 1);
      const ids = rest ? rest.split(",") : [];
      const kept = ids.filter((id) => ok(id.trim()));
      // İlk sahip kazanır: aynı bileşeni ikinci bir kart sekmesi (ör. kopya Sekmeler) alamaz.
      for (const id of kept) claimed.add(id.trim());
      if (kept.length === ids.length) return entry;
      changed = true;
      return `${entry.slice(0, at)}=${kept.join(",")}`;
    });
    if (changed) next = updateComponent(next, tabs.id, (component) => ({ ...component, props: { ...component.props, tabs: cleaned } }));
  }
  return next;
}
