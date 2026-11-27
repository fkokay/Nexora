// Kalıplı sayfanın pencereleri ve grupları (5b-2 adım 2). Kurallar sunucuyla aynıdır (PageTemplateRules: DialogOwners,
// DialogPartTypes, GroupChildTypes): pencere üst düzey `dialog` bileşeni, `dialogs` yerinde; içeriği `dialog` yerinde ve tam bir
// pencereye ait. Grup `section` / `card` + `children`, tek kat. Bütün işlevler bileşen dizisini değiştirmeden yenisini döndürür;
// değişiklik yoksa aynı dizi döner.
import { freeId, type ModelComponent, type ModelDefinition } from "./listPanelModel";

export const DIALOGS_SLOT = "dialogs";
export const DIALOG_SLOT = "dialog";
/** Pencere içinde izinli türler (sunucu: DialogPartTypes). */
export const DIALOG_PART_TYPES: ReadonlySet<string> = new Set(["recordHeader", "section", "card", "formCard", "input", "text", "alert", "metric", "button", "dataTable", "tabs"]);
/** Grubun içine konabilen türler (sunucu: GroupChildTypes). */
export const GROUP_CHILD_TYPES: ReadonlySet<string> = new Set(["badge", "heading", "text", "metric", "alert", "button", "formCard", "dataTable", "contextPanel", "tabs"]);

type Components = ModelComponent[];
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const childrenOf = (component: ModelComponent | undefined): ModelComponent[] =>
  component && Array.isArray(component.children) ? (component.children as unknown[]).filter((item): item is ModelComponent => !!item && typeof item === "object") : [];
/** Sekme bileşeninin `Etiket=id1,id2` öğelerinin işaret ettiği kimlikler (sunucu: TabIds). */
const tabIds = (tabs: ModelComponent) => strings(tabs.props.tabs).flatMap((item) => {
  const at = item.indexOf("=");
  const rest = at < 0 ? "" : item.slice(at + 1);
  return rest ? rest.split(",") : [];
});

/** Grup mu: `section` ya da `card`, `children` dizisiyle. */
export const isGroup = (component: ModelComponent | null | undefined): component is ModelComponent =>
  !!component && (component.type === "section" || component.type === "card") && Array.isArray(component.children);

export const dialogsOf = (components: Components) => components.filter((component) => component.type === "dialog");

/** Bir pencerenin sahip olduğu kimlikler: `contains`, içerikteki (ya da içerikteki grubun) sekmelerinin işaret ettikleri, içerikteki form kartlarının girişleri. */
function ownedBy(components: Components, dialog: ModelComponent): string[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const owned: string[] = [];
  for (const id of strings(dialog.props.contains)) {
    owned.push(id);
    const part = byId.get(id);
    if (!part) continue;
    if (part.type === "tabs") owned.push(...tabIds(part));
    for (const child of childrenOf(part)) if (child.type === "tabs") owned.push(...tabIds(child));
  }
  for (const id of [...owned]) {
    const part = byId.get(id);
    if (!part) continue;
    for (const card of [part, ...childrenOf(part)]) if (card.type === "formCard") owned.push(...strings(card.props.inputs));
  }
  return [...new Set(owned)];
}

/** Bileşen kimliği → pencere kimliği (sunucu: DialogOwners). İki pencerenin istediği kimlik hiçbirine ait değildir. */
export function dialogOwners(components: Components): Map<string, string> {
  const owners = new Map<string, string>();
  const shared = new Set<string>();
  for (const dialog of dialogsOf(components)) {
    for (const id of ownedBy(components, dialog)) {
      const owner = owners.get(id);
      if (owner === undefined) owners.set(id, dialog.id);
      else if (owner !== dialog.id) shared.add(id);
    }
  }
  for (const id of shared) owners.delete(id);
  return owners;
}

const asDef = (components: Components): ModelDefinition => ({ schemaVersion: 2, queries: [], components });

/** Boş bir görünüm penceresi ve içindeki tek metin; sayfanın sonuna eklenir. */
export function addDialog(components: Components): { components: Components; dialogId: string } {
  const dialogId = freeId(asDef(components), "pencere");
  const textId = freeId(asDef(components), "pencereMetni", new Set([dialogId.toLowerCase()]));
  const dialog: ModelComponent = { id: dialogId, type: "dialog", name: dialogId,
    props: { slot: DIALOGS_SLOT, presentation: "dialog", size: "lg", title: "Yeni pencere", contains: [textId] } };
  const text: ModelComponent = { id: textId, type: "text", name: textId, props: { slot: DIALOG_SLOT, text: "Pencere içeriği" } };
  return { components: [...components, dialog, text], dialogId };
}

/** Pencereyi ve yalnız ona ait içeriği (sekmenin işaret ettikleri, form girişleri dahil) siler; başka pencereyle paylaşılanlar kalır. */
export function removeDialog(components: Components, dialogId: string): Components {
  const dialog = dialogsOf(components).find((item) => item.id === dialogId);
  if (!dialog) return components;
  const owners = dialogOwners(components);
  const gone = new Set([dialogId, ...ownedBy(components, dialog).filter((id) => owners.get(id) === dialogId)]);
  return components.filter((component) => !gone.has(component.id));
}

/**
 * Pencerenin `contains` dizisini verilen sıraya koyar. Yalnız sayfada olan, başka pencereye ait olmayan ve bir kez geçen kimlikler
 * alınır; listeden çıkan kimliğin bileşeni silinmez (sekmeden işaret edilen içerik pencerede kalır). Aynı sıra aynı diziyi döndürür.
 */
export function setDialogContents(components: Components, dialogId: string, ids: string[]): Components {
  const dialog = dialogsOf(components).find((item) => item.id === dialogId);
  if (!dialog) return components;
  const owners = dialogOwners(components);
  const present = new Set(components.map((component) => component.id));
  const next = [...new Set(ids)].filter((id) => id !== dialogId && present.has(id) && (owners.get(id) ?? dialogId) === dialogId);
  const current = strings(dialog.props.contains);
  if (next.length === current.length && next.every((id, index) => id === current[index])) return components;
  return components.map((component) => component === dialog ? { ...component, props: { ...component.props, contains: next } } : component);
}

/** Yeni grup çocuğunun başlangıç ayarları. */
const CHILD_DEFAULTS: Record<string, ModelComponent["props"]> = {
  badge: { text: "Rozet" }, heading: { text: "Başlık" }, text: { text: "Metin" }, metric: { title: "Gösterge", value: "" }, alert: { text: "Uyarı" },
  button: { text: "Düğme" }, formCard: { inputs: [] }, dataTable: {}, contextPanel: {}, tabs: { tabs: [] },
};

const withChildren = (components: Components, groupId: string, change: (children: ModelComponent[]) => ModelComponent[] | null): Components => {
  const group = components.find((component) => component.id === groupId);
  if (!isGroup(group)) return components;
  const next = change(childrenOf(group));
  return next ? components.map((component) => component === group ? { ...component, children: next } : component) : components;
};

/** Gruba izinli türden boş bir çocuk ekler (sonuna); bölüm, kart, pencere ve öteki türler eklenmez. */
export function addToGroup(components: Components, groupId: string, type: string): Components {
  if (!GROUP_CHILD_TYPES.has(type)) return components;
  return withChildren(components, groupId, (children) => {
    const id = freeId(asDef(components), type);
    return [...children, { id, type, name: id, props: { ...CHILD_DEFAULTS[type] } }];
  });
}

export function removeFromGroup(components: Components, groupId: string, childId: string): Components {
  return withChildren(components, groupId, (children) => children.some((child) => child.id === childId) ? children.filter((child) => child.id !== childId) : null);
}

/** Çocuğu grupta bir yukarı (-1) ya da aşağı (1) taşır; sınırda değişmez. */
export function moveInGroup(components: Components, groupId: string, childId: string, delta: -1 | 1): Components {
  return withChildren(components, groupId, (children) => {
    const from = children.findIndex((child) => child.id === childId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= children.length) return null;
    const next = [...children];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
}
