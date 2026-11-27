// Kalıplı sayfanın pencereleri ve grupları (5b-2 adım 2). Kurallar sunucuyla aynıdır (PageTemplateRules: DialogOwners,
// DialogPartTypes, GroupChildTypes): pencere üst düzey `dialog` bileşeni, `dialogs` yerinde; içeriği `dialog` yerinde ve tam bir
// pencereye ait. Grup `section` / `card` + `children`, tek kat. Bütün işlevler bileşen dizisini değiştirmeden yenisini döndürür;
// değişiklik yoksa aynı dizi döner.
import type { PageQuery } from "../QueriesPanel";
import { commandsBar } from "./commandsModel";
import { freeId, type ModelComponent, type ModelDefinition } from "./listPanelModel";

export const DIALOGS_SLOT = "dialogs";
export const DIALOG_SLOT = "dialog";
/** Pencere içinde izinli türler (sunucu: DialogPartTypes). */
export const DIALOG_PART_TYPES: ReadonlySet<string> = new Set(["recordHeader", "section", "card", "formCard", "input", "text", "alert", "metric", "button", "dataTable", "tabs", "customFieldsBlock", "editableGrid"]);
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

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Pencereyi açanlar: `dialogId` ile bağlı düğmeler (üst düzey ya da grup çocuğu; Komutlar'a bağlıysa komutun adıyla) ve satır açma
 * düğmesi bu pencereyi açan listenin `openParam`'ı (`sayfa bağlantısı <param>`). Açanı olan pencere silinmez (sunucu, var olmayan
 * pencereyi açan düğmeyi reddeder).
 */
export function dialogOpeners(def: ModelDefinition, dialogId: string): string[] {
  const all = def.components.flatMap((component) => [component, ...childrenOf(component)]);
  const opens = (component: ModelComponent | undefined) => component?.type === "button" && component.props.actionType === "openDialog" && component.props.dialogId === dialogId;
  const bar = commandsBar(def);
  const commandOf = (id: string) => bar?.props.openButton === id ? "Görüntüle" : bar?.props.newButton === id ? "Yeni" : null;
  const buttons = all.filter(opens).map((button) => { const command = commandOf(button.id); return command ? `${command} (komut)` : text(button.props.text) || button.name || button.id; });
  const links = def.components.filter((component) => component.type === "dataTable" && text(component.props.openParam) !== ""
    && opens(all.find((item) => item.id === component.props.rowOpenAction))).map((table) => `sayfa bağlantısı ${text(table.props.openParam)}`);
  return [...new Set([...buttons, ...links])];
}

/** Yeni kimlikler sayfanın bileşen ve sorgu kimlikleri / adlarıyla çakışmasın diye sorgular da verilir. */
const asDef = (components: Components, queries: PageQuery[]): ModelDefinition => ({ schemaVersion: 2, queries, components });

/** Boş bir görünüm penceresi ve içindeki tek metin; sayfanın sonuna eklenir. */
export function addDialog(components: Components, queries: PageQuery[] = []): { components: Components; dialogId: string } {
  const dialogId = freeId(asDef(components, queries), "pencere");
  const textId = freeId(asDef(components, queries), "pencereMetni", new Set([dialogId.toLowerCase()]));
  const dialog: ModelComponent = { id: dialogId, type: "dialog", name: dialogId,
    props: { slot: DIALOGS_SLOT, presentation: "dialog", size: "lg", title: "Yeni pencere", contains: [textId] } };
  const content: ModelComponent = { id: textId, type: "text", name: textId, props: { slot: DIALOG_SLOT, text: "Pencere içeriği" } };
  return { components: [...components, dialog, content], dialogId };
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

/**
 * "+ ekle" ile kurulabilen üyeler ve başlangıç ayarları: yalnız kendi başına geçerli olanlar (sunucu doğrulayıcısı boş bağlamayı
 * reddeder). Tablo sayfanın ilk okuma sorgusuna bağlanır, okuma sorgusu yoksa sunulmaz. Form (`inputs` ister), sekmeler (sekme
 * öğeleri ister) ve detay paneli (`table` + `fields` ister) hiç kurulmaz: grupta zaten varsa sıralanır ve çıkarılır.
 */
const STANDALONE_CHILDREN: [string, ModelComponent["props"]][] = [
  ["badge", { text: "Rozet" }], ["heading", { text: "Başlık" }], ["text", { text: "Metin" }], ["metric", { title: "Gösterge", value: "—" }],
  ["alert", { text: "Uyarı" }], ["button", { text: "Düğme" }]];
const firstReadQuery = (queries: PageQuery[]) => queries.find((query) => query.kind === "read");
function childProps(type: string, queries: PageQuery[]): ModelComponent["props"] | null {
  const standalone = STANDALONE_CHILDREN.find(([item]) => item === type);
  if (standalone) return { ...standalone[1] };
  const read = type === "dataTable" ? firstReadQuery(queries) : undefined;
  return read ? { title: "Tablo", query: read.id } : null;
}
/** "+ ekle" menüsünün türleri, sırayla (sayfanın sorgularına göre). */
export const groupAddableTypes = (queries: PageQuery[]): string[] =>
  [...STANDALONE_CHILDREN.map(([type]) => type), ...(firstReadQuery(queries) ? ["dataTable"] : [])];

const withChildren = (components: Components, groupId: string, change: (children: ModelComponent[]) => ModelComponent[] | null): Components => {
  const group = components.find((component) => component.id === groupId);
  if (!isGroup(group)) return components;
  const next = change(childrenOf(group));
  return next ? components.map((component) => component === group ? { ...component, children: next } : component) : components;
};

/**
 * Gruba `groupAddableTypes` türünden geçerli bir çocuk ekler (sonuna); bölüm, kart, pencere, form, sekmeler, detay paneli ve
 * (okuma sorgusu yoksa) tablo eklenmez.
 */
export function addToGroup(components: Components, groupId: string, type: string, queries: PageQuery[] = []): Components {
  const props = GROUP_CHILD_TYPES.has(type) ? childProps(type, queries) : null;
  if (!props) return components;
  return withChildren(components, groupId, (children) => {
    const id = freeId(asDef(components, queries), type);
    return [...children, { id, type, name: id, props }];
  });
}

/**
 * Bir parça kalkınca pencerenin yalnız o parça üzerinden sahiplendiklerini (sekmenin işaret ettikleri, form kartının girişleri)
 * de siler: önce bir pencereye ait olup artık hiçbirine ait olmayan üst düzey bileşenler. Böylece hiçbir şey sahipsiz kalıp
 * `below` / `item` yerine düşmez; başka bir yoldan (ikinci form, `contains`) sahiplenilen kalır.
 */
function dropOrphaned(before: Components, after: Components): Components {
  const owned = dialogOwners(before);
  const still = dialogOwners(after);
  const orphaned = new Set([...owned.keys()].filter((id) => !still.has(id)));
  return orphaned.size === 0 ? after : after.filter((component) => !orphaned.has(component.id));
}

/** Çocuğu gruptan çıkarır; pencerenin yalnız o çocuk (form kartı, sekmeler) üzerinden sahiplendikleri de gider. */
export function removeFromGroup(components: Components, groupId: string, childId: string): Components {
  const next = withChildren(components, groupId, (children) => children.some((child) => child.id === childId) ? children.filter((child) => child.id !== childId) : null);
  return next === components ? components : dropOrphaned(components, next);
}

/**
 * Pencere içeriğinin genel silinmesi (Delete tuşu, çöp düğmeleri): üst düzey parça ya da bir grubun çocuğu kalkar, pencerenin yalnız
 * onun üzerinden sahiplendikleri de gider. Sahipsiz kalan bir şey yoksa null (genel silme yolu yeter).
 */
export function removeDialogPart(components: Components, id: string): Components | null {
  const group = components.find((component) => isGroup(component) && childrenOf(component).some((child) => child.id === id));
  const removed = group ? withChildren(components, group.id, (children) => children.filter((child) => child.id !== id))
    : components.filter((component) => component.id !== id);
  if (removed === components || removed.length === components.length && !group) return null;
  const next = dropOrphaned(components, removed);
  return next === removed ? null : next;
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
