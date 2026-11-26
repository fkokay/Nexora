// Serbest gövde (alt proje 5c, taslak 09) saf modeli. Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Biçim (sunucu: PageTemplateRules, ERP: FreeTemplate):
// - bölüm üst düzey `section`, `slot: "block"`, `title`, `columns` (1 / 2 / 3), `members` (en çok 12 üye kimliği, sıralı);
// - bileşen üst düzeyde `slot: "item"` ve tam bir bölümün `members`'ında;
// - sekmeler (isteğe bağlı) tek `tabs` bileşeninin `"Etiket=bölüm1,bölüm2"` öğeleri; varsa her bölüm tam bir sekmede, boş sekme
//   yok, tek sekme kalırsa sekme bileşeni kaldırılır (Karar 2, 4);
// - sayfa eylemleri `slot: "actions"` sorgu düğmeleri; parametresiz eylem sorgusu çalıştırır (Karar 8).
import type { CatalogAction, CatalogComponent } from "../catalogClient";
import { MAX_TABS, MAX_TAB_LABEL, parseTabs, tabsValue } from "../layoutRefs";
import type { PageQuery } from "../QueriesPanel";
import { createConsultantComponent, type CreatableKind } from "./consultantPalette";
import { freeId, stringList, type ModelComponent, type ModelDefinition, type Usable } from "./listPanelModel";
import { GENERAL_TAB, NEW_TAB_LABEL } from "./recordModel";

type PropValue = string | number | boolean | string[];
export type BlockColumns = 1 | 2 | 3;
export type FreeTab = { label: string; blockIds: string[] };

export const FREE_BLOCK_FULL = "Bu bölüm dolu; yeni bir bölüm ekleyin.";
export const FREE_BLOCK_NOT_EMPTY = "Önce bu bölümdeki bileşenleri kaldırın ya da başka bölüme taşıyın.";
export const FREE_LAST_BLOCK = "Serbest gövdede en az bir bölüm olmalı.";
export const FREE_BLOCKS_FULL = "Serbest gövdede en fazla 20 bölüm olabilir.";
export const FREE_TABS_FULL = "Serbest gövdede en fazla 8 sekme olabilir.";
export const FREE_ACTIONS_FULL = "İşlem çubuğunda en fazla 8 düğme olabilir.";
export const FREE_PAGE_CODE_INVALID = "Ekran kodu harf, rakam, - ve _ içerebilir (en çok 40); sistem ekranları için @ ile başlayan küçük harfli anahtar yazın.";
export const PAGE_ACTION_ROW = "Bu eylem bir satıra ait; serbest gövdede kullanılamaz.";
export const PAGE_ACTION_BULK = "Toplu eylemler serbest gövdede kullanılamaz.";
export const PAGE_ACTION_NEEDS_INPUT = "Bu eylem ek bilgi istiyor; serbest gövdede kullanılamaz.";
/** Sunucu (`members` 0..12) ve ERP bölümde en çok 12 bileşen okur. */
export const MAX_BLOCK_MEMBERS = 12;
export const MAX_FREE_BLOCKS = 20;
/** `layoutRefs` sınırı: en çok 8 sekme. */
export const MAX_FREE_TABS = MAX_TABS;
/** İşlem çubuğunda en çok 8 düğme. */
export const MAX_PAGE_ACTIONS = 8;
export const DEFAULT_BLOCK_TITLE = "Bölüm";
const MAX_TITLE = 120;

// ---------- okuma ----------

const slotOf = (component: ModelComponent) => typeof component.props.slot === "string" ? component.props.slot : "";
export const isFreeBlock = (component: ModelComponent) => component.type === "section" && slotOf(component) === "block";
export const isFreeItem = (component: ModelComponent) => slotOf(component) === "item";
const isActionButton = (component: ModelComponent) => component.type === "button" && slotOf(component) === "actions";
const tabsComponent = (def: ModelDefinition) => def.components.find((component) => component.type === "tabs" && slotOf(component) === "tabs");
const findBlock = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id && isFreeBlock(component));
const findItem = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id && isFreeItem(component));
const membersOf = (block: ModelComponent) => stringList(block.props.members);

/** Sekmeler (etiket ve bölüm kimlikleri, sırayla); sekme bileşeni yoksa null. */
export function freeTabs(def: ModelDefinition): FreeTab[] | null {
  const owner = tabsComponent(def);
  return owner ? parseTabs(owner.props.tabs).map((tab) => ({ label: tab.label, blockIds: tab.ids })) : null;
}

/** Bölümler görünüş sırasıyla: sekme varsa sekme sırası (sekmesiz kalan sona), yoksa bileşen sırası. */
export function freeBlocks(def: ModelDefinition): ModelComponent[] {
  const blocks = def.components.filter(isFreeBlock);
  const tabs = freeTabs(def);
  if (!tabs) return blocks;
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const ordered: ModelComponent[] = [];
  for (const id of tabs.flatMap((tab) => tab.blockIds)) {
    const block = byId.get(id);
    if (block && !ordered.includes(block)) ordered.push(block);
  }
  return [...ordered, ...blocks.filter((block) => !ordered.includes(block))];
}

/** Bileşenin bölümü (`members`'ında olduğu ilk bölüm); yoksa null. */
export function blockOf(def: ModelDefinition, itemId: string): string | null {
  return freeBlocks(def).find((block) => membersOf(block).includes(itemId))?.id ?? null;
}

/**
 * Seçili bölümün ya da bileşenin (bölümünün) sekmesi: tuval o sekmeyi `showTab` ile gösterir. Sekmesiz sayfada, seçim yokken,
 * sekme bileşeninde, sayfa eyleminde ve sekmede olmayan bölümde null.
 */
export function freeSelectionTab(def: ModelDefinition, componentId: string | null | undefined): { tabsId: string; index: number } | null {
  if (!componentId) return null;
  const owner = tabsComponent(def);
  const tabs = freeTabs(def);
  if (!owner || !tabs) return null;
  const blockId = findBlock(def, componentId) ? componentId : findItem(def, componentId) ? blockOf(def, componentId) : null;
  const index = blockId ? tabs.findIndex((tab) => tab.blockIds.includes(blockId)) : -1;
  return index < 0 ? null : { tabsId: owner.id, index };
}

/** Tuvalde görünen sekme: görünen bloklar arasında bölümü olan ilk sekme; sekmesiz sayfada ya da bilinmiyorsa -1. */
export function shownFreeTab(def: ModelDefinition, visibleIds: Iterable<string>): number {
  const tabs = freeTabs(def);
  if (!tabs) return -1;
  const ids = new Set(visibleIds);
  return tabs.findIndex((tab) => tab.blockIds.some((id) => ids.has(id)));
}

// ---------- yazma yardımcıları ----------

const withProps = (component: ModelComponent, patch: Record<string, PropValue | undefined>): ModelComponent => {
  const props: Record<string, PropValue> = { ...component.props };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete props[key]; else props[key] = value;
  }
  return { ...component, props };
};
const patchComponent = <D extends ModelDefinition>(def: D, id: string, patch: Record<string, PropValue | undefined>): D =>
  ({ ...def, components: def.components.map((component) => component.id === id ? withProps(component, patch) : component) });
/** `index` konumuna ekler; dizin yoksa, tam sayı değilse ya da taşkınsa sona. */
const insertAt = <T,>(list: T[], value: T, index?: number): T[] => {
  const at = index !== undefined && Number.isInteger(index) && index >= 0 && index < list.length ? index : list.length;
  return [...list.slice(0, at), value, ...list.slice(at)];
};
const swap = <T,>(list: T[], index: number, other: number): T[] => {
  const next = [...list];
  [next[index], next[other]] = [next[other], next[index]];
  return next;
};

/**
 * Sekmeleri yazar: boş sekmeler atılır; bir sekme ya da hiç sekme kalmazsa sekme bileşeni kaldırılır (bölümler sırasını korur);
 * sekme bileşeni yoksa ilk bölümün önüne kurulur.
 */
export function setFreeTabs<D extends ModelDefinition>(def: D, tabs: FreeTab[]): D {
  const kept = tabs.filter((tab) => tab.blockIds.length > 0);
  const owner = tabsComponent(def);
  if (kept.length <= 1) {
    if (!owner) return def;
    // Sekme kalkınca bölümler bileşen sırasıyla çizilir: son sekme sırasını bileşen sırasına yazar.
    const order = kept[0]?.blockIds ?? [];
    return reorderBlocks({ ...def, components: def.components.filter((component) => component !== owner) }, order);
  }
  const value = tabsValue(kept.map((tab) => ({ label: tab.label, ids: tab.blockIds })));
  if (owner) return patchComponent(def, owner.id, { tabs: value });
  const created: ModelComponent = { id: freeId(def, "sekmeler"), type: "tabs", props: { slot: "tabs", tabs: value } };
  const at = def.components.findIndex(isFreeBlock);
  const index = at < 0 ? def.components.length : at;
  return { ...def, components: [...def.components.slice(0, index), created, ...def.components.slice(index)] };
}

/** Bölüm bileşenlerinin yerlerini (öteki bileşenlere dokunmadan) verilen sıraya göre doldurur; listede olmayanlar sonra gelir. */
function reorderBlocks<D extends ModelDefinition>(def: D, order: string[]): D {
  const blocks = def.components.filter(isFreeBlock);
  const sorted = [...order.map((id) => blocks.find((block) => block.id === id)).filter((block): block is ModelComponent => !!block),
    ...blocks.filter((block) => !order.includes(block.id))];
  if (sorted.every((block, index) => block === blocks[index])) return def;
  let next = 0;
  return { ...def, components: def.components.map((component) => isFreeBlock(component) ? sorted[next++] : component) };
}

const tabLabel = (label: string) => label.replace(/[=,{}]/g, "").trim().slice(0, MAX_TAB_LABEL).trim();
function nextBlockTitle(def: ModelDefinition): string {
  const titles = new Set(def.components.filter(isFreeBlock).map((block) => block.props.title));
  let index = def.components.filter(isFreeBlock).length + 1;
  while (titles.has(`${DEFAULT_BLOCK_TITLE} ${index}`)) index++;
  return `${DEFAULT_BLOCK_TITLE} ${index}`;
}
/** Yeni boş bölüm (eklenmemiş): benzersiz kimlik, benzersiz "Bölüm N" başlığı, 2 kolon. Güvenlik ağı da bunu kullanır. */
export function newFreeBlock(def: ModelDefinition): ModelComponent {
  return { id: freeId(def, "bolum"), type: "section", props: { slot: "block", title: nextBlockTitle(def), columns: 2, members: [] } };
}
/** Bileşeni son bölüm bileşeninin (ya da verilen bölümün) arkasına koyar. */
function insertBlock<D extends ModelDefinition>(def: D, block: ModelComponent, afterId?: string): D {
  const after = afterId ? def.components.findIndex((component) => component.id === afterId && isFreeBlock(component)) : -1;
  let index = after;
  if (index < 0) def.components.forEach((component, position) => { if (isFreeBlock(component)) index = position; });
  const at = index < 0 ? def.components.length : index + 1;
  return { ...def, components: [...def.components.slice(0, at), block, ...def.components.slice(at)] };
}

// ---------- bölümler ----------

/**
 * Yeni boş bölüm ("Bölüm N", 2 kolon), `afterBlockId`'nin arkasına; yoksa en sona. Sekme varsa `afterBlockId`'nin sekmesine
 * (onun arkasına), yoksa `shownTab` sekmesinin (tuvalde görünen), o da bilinmiyorsa ilk sekmenin sonuna girer. 20 bölümde neden döner.
 */
export function addBlock<D extends ModelDefinition>(def: D, afterBlockId?: string, shownTab?: number): { def: D; blockId: string } | { reason: string } {
  if (def.components.filter(isFreeBlock).length >= MAX_FREE_BLOCKS) return { reason: FREE_BLOCKS_FULL };
  const after = afterBlockId && findBlock(def, afterBlockId) ? afterBlockId : undefined;
  const block = newFreeBlock(def);
  let next = insertBlock(def, block, after);
  const tabs = freeTabs(next);
  if (tabs) {
    const tabIndex = after ? tabs.findIndex((tab) => tab.blockIds.includes(after)) : -1;
    const endTab = shownTab !== undefined && Number.isInteger(shownTab) && shownTab >= 0 && shownTab < tabs.length ? shownTab : 0;
    next = setFreeTabs(next, tabs.map((tab, index) => {
      if (tabIndex >= 0 ? index !== tabIndex : index !== endTab) return tab;
      const at = tabIndex >= 0 ? tab.blockIds.indexOf(after!) + 1 : tab.blockIds.length;
      return { ...tab, blockIds: [...tab.blockIds.slice(0, at), block.id, ...tab.blockIds.slice(at)] };
    }));
  }
  return { def: next, blockId: block.id };
}

/** Karar 3: üyesi olan bölüm ve son bölüm silinmez (neden döner). Silinen bölüm sekmesinden çıkar; boş kalan sekme kalkar. */
export function removeBlock<D extends ModelDefinition>(def: D, blockId: string): { def: D } | { reason: string } {
  const block = findBlock(def, blockId);
  if (!block) return { def };
  if (membersOf(block).length > 0) return { reason: FREE_BLOCK_NOT_EMPTY };
  if (def.components.filter(isFreeBlock).length <= 1) return { reason: FREE_LAST_BLOCK };
  const tabs = freeTabs(def);
  const next = { ...def, components: def.components.filter((component) => component !== block) };
  return { def: tabs ? setFreeTabs(next, tabs.map((tab) => ({ ...tab, blockIds: tab.blockIds.filter((id) => id !== blockId) }))) : next };
}

/** Başlık kırpılır (en çok 120); boş başlık başlığı kaldırır (bölüm başlıksız çizilir). */
export function setBlockTitle<D extends ModelDefinition>(def: D, blockId: string, title: string): D {
  if (!findBlock(def, blockId)) return def;
  return patchComponent(def, blockId, { title: title.trim().slice(0, MAX_TITLE) || undefined });
}

export function setBlockColumns<D extends ModelDefinition>(def: D, blockId: string, columns: BlockColumns): D {
  if (!findBlock(def, blockId) || ![1, 2, 3].includes(columns)) return def;
  return patchComponent(def, blockId, { columns });
}

/** Bölümü bir yukarı / aşağı taşır: sekme varsa sekmesinin içinde, yoksa bölümler arasında. Uçta tanım değişmez. */
export function moveBlock<D extends ModelDefinition>(def: D, blockId: string, direction: -1 | 1): D {
  if (!findBlock(def, blockId)) return def;
  const tabs = freeTabs(def);
  if (tabs) {
    const tabIndex = tabs.findIndex((tab) => tab.blockIds.includes(blockId));
    if (tabIndex < 0) return def;
    const ids = tabs[tabIndex].blockIds;
    const index = ids.indexOf(blockId);
    const other = index + direction;
    if (other < 0 || other >= ids.length) return def;
    return setFreeTabs(def, tabs.map((tab, position) => position === tabIndex ? { ...tab, blockIds: swap(ids, index, other) } : tab));
  }
  const order = freeBlocks(def).map((block) => block.id);
  const index = order.indexOf(blockId);
  const other = index + direction;
  if (other < 0 || other >= order.length) return def;
  return reorderBlocks(def, swap(order, index, other));
}

// ---------- sekmeler ----------

/**
 * Karar 2: yeni sekme her zaman içinde yeni boş bir bölümle kurulur. İlk sekme eklenirken bütün mevcut bölümler "Genel"
 * sekmesine girer. Etiket verilmezse "Yeni sekme" (gerekirse "Yeni sekme 2"…). 8 sekmede ya da 20 bölümde neden döner.
 */
export function addTab<D extends ModelDefinition>(def: D, label?: string): { def: D; tabIndex: number; blockId: string } | { reason: string } {
  // Sekme bileşeni yoksa ya da hiç geçerli sekme taşımıyorsa bütün bölümler "Genel"e girer.
  const existing = freeTabs(def);
  const tabs = existing?.length ? existing : [{ label: GENERAL_TAB, blockIds: freeBlocks(def).map((block) => block.id) }];
  if (tabs.length >= MAX_FREE_TABS) return { reason: FREE_TABS_FULL };
  if (def.components.filter(isFreeBlock).length >= MAX_FREE_BLOCKS) return { reason: FREE_BLOCKS_FULL };
  let clean = tabLabel(label ?? "");
  if (!clean) {
    const labels = new Set(tabs.map((tab) => tab.label));
    clean = NEW_TAB_LABEL;
    for (let index = 2; labels.has(clean); index++) clean = `${NEW_TAB_LABEL} ${index}`;
  }
  const block = newFreeBlock(def);
  const next = insertBlock(def, block);
  return { def: setFreeTabs(next, [...tabs, { label: clean, blockIds: [block.id] }]), tabIndex: tabs.length, blockId: block.id };
}

/** Etiketten `=`, `,`, `{` ve `}` atılır, en çok 40 karakter; boş etiket yok sayılır. */
export function renameTab<D extends ModelDefinition>(def: D, tabIndex: number, label: string): D {
  const tabs = freeTabs(def);
  const clean = tabLabel(label);
  if (!tabs?.[tabIndex] || !clean || tabs[tabIndex].label === clean) return def;
  return setFreeTabs(def, tabs.map((tab, index) => index === tabIndex ? { ...tab, label: clean } : tab));
}

/** Karar 4: sekmenin bölümleri önceki sekmenin (ilk sekmede sonrakinin) sonuna geçer; tek sekme kalırsa sekme bileşeni kalkar. */
export function removeTab<D extends ModelDefinition>(def: D, tabIndex: number): D {
  const tabs = freeTabs(def);
  if (!tabs?.[tabIndex]) return def;
  const target = tabIndex > 0 ? tabIndex - 1 : 1;
  const moved = tabs[tabIndex].blockIds;
  const next = tabs.map((tab, index) => index === target ? { ...tab, blockIds: [...tab.blockIds, ...moved] } : tab).filter((_, index) => index !== tabIndex);
  return setFreeTabs(def, next);
}

/** Sekmeyi bir sola / sağa taşır (bölümleri onunla gider). Uçta ya da sekmesiz sayfada tanım değişmez. */
export function moveTab<D extends ModelDefinition>(def: D, tabIndex: number, direction: -1 | 1): D {
  const tabs = freeTabs(def);
  const other = tabIndex + direction;
  if (!tabs?.[tabIndex] || other < 0 || other >= tabs.length) return def;
  return setFreeTabs(def, swap(tabs, tabIndex, other));
}

/** Bölümü başka sekmenin sonuna taşır; boş kalan sekme kalkar, tek sekme kalırsa sekme bileşeni de. */
export function moveBlockToTab<D extends ModelDefinition>(def: D, blockId: string, tabIndex: number): D {
  const tabs = freeTabs(def);
  if (!tabs?.[tabIndex] || !findBlock(def, blockId) || tabs[tabIndex].blockIds.includes(blockId)) return def;
  return setFreeTabs(def, tabs.map((tab, index) => ({
    ...tab, blockIds: index === tabIndex ? [...tab.blockIds, blockId] : tab.blockIds.filter((id) => id !== blockId) })));
}

/**
 * Bölümü tuvalde bırakılan yere taşır: `index` taşımadan önceki listede "bunun önüne" konumudur. Sekmesiz sayfada `tabIndex`
 * null ve liste bölüm sırasıdır; sekmeli sayfada `tabIndex` hedef sekmedir (başka sekmeye de olabilir). Boş kalan sekme kalkar,
 * tek sekme kalırsa sekme bileşeni de (setFreeTabs). Sekme dizini sayfaya uymuyorsa ya da yer değişmiyorsa tanım aynen döner.
 */
export function moveBlockTo<D extends ModelDefinition>(def: D, blockId: string, tabIndex: number | null, index: number): D {
  if (!findBlock(def, blockId)) return def;
  const tabs = freeTabs(def);
  const place = (list: string[]) => {
    const own = list.indexOf(blockId);
    const placed = insertAt(list.filter((id) => id !== blockId), blockId, own >= 0 && own < index ? index - 1 : index);
    return own >= 0 && placed.every((id, position) => id === list[position]) ? null : placed;
  };
  if (!tabs) {
    if (tabIndex !== null) return def;
    const order = place(freeBlocks(def).map((block) => block.id));
    return order ? reorderBlocks(def, order) : def;
  }
  if (tabIndex === null || !tabs[tabIndex]) return def;
  const order = place(tabs[tabIndex].blockIds);
  if (!order) return def;
  return setFreeTabs(def, tabs.map((tab, position) => position === tabIndex ? { ...tab, blockIds: order } : { ...tab, blockIds: tab.blockIds.filter((id) => id !== blockId) }));
}

// ---------- bileşenler ----------

/**
 * Tam satır üyeler (ERP `freeTemplateModel.freeFullRow` ile aynı kural; Studio erp-web'i içe aktaramaz): Liste, Görsel,
 * yazılımcı bileşeni ve maddeli Bilgi kutusu / kart / madde listesi.
 */
export function freeFullRow(component: ModelComponent): boolean {
  if (component.type === "dataTable" || component.type === "image" || component.type === "code") return true;
  if (component.type !== "alert" && component.type !== "card" && component.type !== "list") return false;
  const items = component.props.items;
  return Array.isArray(items) && items.some((item) => typeof item === "string" && item.trim() !== "");
}

const ITEM_BASE: Record<CreatableKind | "table" | "developer", string> = { text: "metin", infoBox: "bilgi", indicator: "gosterge", image: "gorsel", table: "liste", developer: "bilesen" };

/**
 * Karar 5: bileşen seçili bölüme (`blockId`), yoksa seçili bileşenin (`nearItemId`) bölümüne, o da yoksa son bölüme, sona
 * eklenir; `index` verilirse (tuvalde bırakma) bölümün o sırasına. Bölüm doluysa (12) neden döner. `"table"` boş bir
 * `dataTable` (kaynağını paneli seçer). `"developer"` verilen katalog bileşenine başvuran `code` bileşenidir (kod ve ayar yazılmaz).
 */
export function addItem<D extends ModelDefinition>(def: D, kind: "developer", target: { blockId?: string; nearItemId?: string }, component: CatalogComponent, index?: number):
  { def: D; itemId: string } | { reason: string };
export function addItem<D extends ModelDefinition>(def: D, kind: CreatableKind | "table", target: { blockId?: string; nearItemId?: string }, index?: number):
  { def: D; itemId: string } | { reason: string };
export function addItem<D extends ModelDefinition>(def: D, kind: CreatableKind | "table" | "developer", target: { blockId?: string; nearItemId?: string },
  componentOrIndex?: CatalogComponent | number, developerIndex?: number):
  { def: D; itemId: string } | { reason: string } {
  const component = typeof componentOrIndex === "object" ? componentOrIndex : undefined;
  const index = typeof componentOrIndex === "number" ? componentOrIndex : developerIndex;
  const blockId = (target.blockId && findBlock(def, target.blockId) ? target.blockId : null)
    ?? (target.nearItemId ? blockOf(def, target.nearItemId) : null)
    ?? freeBlocks(def).at(-1)?.id ?? null;
  const block = blockId ? findBlock(def, blockId) : undefined;
  if (!block) return { reason: FREE_LAST_BLOCK };
  if (membersOf(block).length >= MAX_BLOCK_MEMBERS) return { reason: FREE_BLOCK_FULL };
  const id = freeId(def, ITEM_BASE[kind]);
  const created = kind === "table" ? { id, type: "dataTable", props: {} }
    : kind === "developer" ? createConsultantComponent("developer", id, component!) : createConsultantComponent(kind, id);
  const item: ModelComponent = { ...created, props: { ...created.props, slot: "item" } };
  const next = patchComponent(def, block.id, { members: insertAt(membersOf(block), id, index) });
  return { def: { ...next, components: [...next.components, item] }, itemId: id };
}

/** Bileşeni bölümünün içinde bir yukarı / aşağı taşır (sıra `members` sırasıdır). Uçta tanım değişmez. */
export function moveItem<D extends ModelDefinition>(def: D, itemId: string, direction: -1 | 1): D {
  const blockId = blockOf(def, itemId);
  const block = blockId ? findBlock(def, blockId) : undefined;
  if (!block) return def;
  const ids = membersOf(block);
  const index = ids.indexOf(itemId);
  const other = index + direction;
  if (other < 0 || other >= ids.length) return def;
  return patchComponent(def, block.id, { members: swap(ids, index, other) });
}

/**
 * Bileşeni başka bölümün sonuna (ya da `index` verilirse, taşımadan önceki `members` sırasında o konumun önüne) taşır; bütün
 * bölümlerden çıkarıldığı için tam bir bölümde kalır. Hedef doluysa (bileşen zaten onda değilse) neden döner. Yeri değişmeyen
 * taşıma tanımı aynen döner.
 */
export function moveItemToBlock<D extends ModelDefinition>(def: D, itemId: string, blockId: string, index?: number): { def: D } | { reason: string } {
  const target = findBlock(def, blockId);
  if (!target || !findItem(def, itemId)) return { def };
  const current = membersOf(target);
  const soleOwner = current.includes(itemId) && def.components.filter(isFreeBlock).every((block) => block === target || !membersOf(block).includes(itemId));
  if (soleOwner && index === undefined) return { def };
  const without = current.filter((id) => id !== itemId);
  if (without.length >= MAX_BLOCK_MEMBERS) return { reason: FREE_BLOCK_FULL };
  const own = current.indexOf(itemId);
  const placed = insertAt(without, itemId, index === undefined ? undefined : own >= 0 && own < index ? index - 1 : index);
  if (soleOwner && placed.every((id, position) => id === current[position])) return { def };
  return { def: { ...def, components: def.components.map((component) => {
    if (component === target) return withProps(component, { members: placed });
    return isFreeBlock(component) && membersOf(component).includes(itemId)
      ? withProps(component, { members: membersOf(component).filter((id) => id !== itemId) }) : component;
  }) } };
}

// Sorguya gerçek başvurular: kimliğini taşıyan özellikler ve `{{<sorgu adı|kimliği>.…}}` bağlamaları. Sözcük eşleşmesi kullanılmaz;
// bileşen kimliği bir sorgu kimliğiyle aynı olsa da başvuru sayılmaz.
const QUERY_ID_PROPS = ["query", "queryId", "bulkDeleteQuery", "trendQuery"];
const QUERY_LIST_PROPS = ["refreshQueries", "saveSequence"];
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function bindsQuery(value: unknown, query: PageQuery): boolean {
  if (typeof value === "string") {
    if (!value.includes("{{")) return false;
    return [query.id, query.name].some((token) => new RegExp(`\\{\\{\\s*${escapeRegExp(token)}\\.`).test(value));
  }
  if (Array.isArray(value)) return value.some((item) => bindsQuery(item, query));
  if (value && typeof value === "object") return Object.values(value).some((item) => bindsQuery(item, query));
  return false;
}
function componentUsesQuery(component: ModelComponent, query: PageQuery): boolean {
  if (QUERY_ID_PROPS.some((key) => component.props[key] === query.id)) return true;
  if (QUERY_LIST_PROPS.some((key) => stringList(component.props[key]).includes(query.id))) return true;
  if (bindsQuery(component.props, query)) return true;
  return Array.isArray(component.children) && (component.children as ModelComponent[])
    .some((child) => !!child && typeof child === "object" && !!child.props && componentUsesQuery(child, query));
}
/** Silinen bileşenlerin başvurduğu ve artık hiçbir bileşenin ya da öteki sorgunun (parametre bağlaması) başvurmadığı sorguları kaldırır. */
function dropOrphanQueries<D extends ModelDefinition>(def: D, removed: ModelComponent[]): D {
  const queries = def.queries.filter((query) => {
    if (!removed.some((component) => componentUsesQuery(component, query))) return true;
    return def.components.some((component) => componentUsesQuery(component, query))
      || def.queries.some((other) => other.id !== query.id && bindsQuery(other.parameters, query));
  });
  return queries.length === def.queries.length ? def : { ...def, queries };
}

/** Review Focus 1: bileşen silinir, bölümü boş da kalsa yerinde durur. Bileşenin kullandığı, başka yerde anılmayan sorgular da silinir. */
export function removeItem<D extends ModelDefinition>(def: D, itemId: string): D {
  const item = findItem(def, itemId);
  if (!item) return def;
  const components = def.components.filter((component) => component !== item).map((component) =>
    isFreeBlock(component) && membersOf(component).includes(itemId) ? withProps(component, { members: membersOf(component).filter((id) => id !== itemId) }) : component);
  return dropOrphanQueries({ ...def, components }, [item]);
}

// ---------- sayfa eylemleri ----------

const blockedOf = (item: object): string | undefined => (item as { blockedReason?: string }).blockedReason;

/** Karar 8: yalnız `target: page` ve parametresiz katalog eylemleri sayfa eylemi olur. */
export function pageActionUsable(action: CatalogAction): Usable {
  const blocked = blockedOf(action);
  if (blocked) return { usable: false, reason: blocked };
  if (action.target === "row") return { usable: false, reason: PAGE_ACTION_ROW };
  if (action.target === "bulk") return { usable: false, reason: PAGE_ACTION_BULK };
  if (action.parameters.length > 0) return { usable: false, reason: PAGE_ACTION_NEEDS_INPUT };
  return { usable: true };
}

const actionQueryOf = (def: ModelDefinition, button: ModelComponent) =>
  typeof button.props.queryId === "string" ? def.queries.find((query) => query.id === button.props.queryId && typeof query.action === "string") : undefined;

/** İşlem çubuğundaki katalog eylemlerinin kodları, düğme sırasıyla. */
export function pageActionCodes(def: ModelDefinition): string[] {
  return def.components.filter((component) => isActionButton(component) && component.props.actionType === "query")
    .map((button) => actionQueryOf(def, button)?.action).filter((code): code is string => typeof code === "string");
}

/** İşlem çubuğu sırası: silme türündeki eylemler en sağda; öteki bileşenlerin yeri değişmez. */
function orderActions<D extends ModelDefinition>(def: D): D {
  const positions: number[] = [];
  const buttons: ModelComponent[] = [];
  def.components.forEach((component, index) => { if (isActionButton(component)) { positions.push(index); buttons.push(component); } });
  const rank = (button: ModelComponent) => actionQueryOf(def, button)?.kind === "delete" ? 1 : 0;
  const sorted = buttons.map((button, index) => ({ button, index })).sort((a, b) => rank(a.button) - rank(b.button) || a.index - b.index).map((item) => item.button);
  if (sorted.every((button, index) => button === buttons[index])) return def;
  const components = [...def.components];
  positions.forEach((position, index) => { components[position] = sorted[index]; });
  return { ...def, components };
}

/**
 * Katalog eylemini işlem çubuğuna ekler: parametresiz bir eylem sorgusu ve ona bağlı bir sorgu düğmesi (onay metni katalogdan).
 * Kullanılamayan, zaten eklenmiş eylemde ya da 8 düğmede tanım değişmez.
 */
export function addPageAction<D extends ModelDefinition>(def: D, action: CatalogAction): D {
  if (!pageActionUsable(action).usable || pageActionCodes(def).includes(action.code)) return def;
  if (def.components.filter(isActionButton).length >= MAX_PAGE_ACTIONS) return def;
  const queryId = freeId(def, action.code);
  const query: PageQuery = { id: queryId, name: queryId, kind: action.kind, action: action.code, runOn: "manual", parameters: [] };
  const buttonId = freeId(def, `${action.code}Dugmesi`, new Set([queryId.toLowerCase()]));
  const button: ModelComponent = { id: buttonId, type: "button", props: {
    slot: "actions", text: action.label.trim().slice(0, MAX_TITLE) || action.code, actionType: "query", queryId,
    ...(action.confirmText ? { confirmEnabled: true, confirmText: action.confirmText } : {}),
  } };
  return orderActions({ ...def, queries: [...def.queries, query], components: [...def.components, button] });
}

/** Eylemin düğmelerini ve artık hiçbir yerde anılmayan eylem sorgularını kaldırır (katalogdan kalkmış eylem için de). */
export function removePageAction<D extends ModelDefinition>(def: D, code: string): D {
  const removed = def.components.filter((component) => isActionButton(component) && actionQueryOf(def, component)?.action === code);
  if (removed.length === 0) return def;
  return dropOrphanQueries({ ...def, components: def.components.filter((component) => !removed.includes(component)) }, removed);
}

// ---------- ekran açan düğmeler ----------

const isPageButton = (component: ModelComponent) => isActionButton(component) && component.props.actionType === "page";

// Sunucunun kabul ettiği kodlar (TenantCustomPageSchema.KnownPageCode): özel sayfa kodu ya da `@ekran-anahtarı`.
const CUSTOM_PAGE_CODE = /^[A-Za-z0-9_-]{1,40}$/;
const SCREEN_CODE = /^@[a-z0-9-]{1,39}$/;
/** Açılacak ekranın kodu sunucunun kabul edeceği biçimde değilse neden; boş ya da geçerliyse null. */
export function pageButtonCodeProblem(pageCode: string): string | null {
  const code = pageCode.trim();
  return !code || CUSTOM_PAGE_CODE.test(code) || SCREEN_CODE.test(code) ? null : FREE_PAGE_CODE_INVALID;
}

/**
 * Başka bir ekranı açan düğmeyi (`actionType: "page"`) işlem çubuğuna ekler; ilk düğme ana düğmedir, sıra eklendiği gibi kalır
 * (silme türündeki eylemler yine en sağda). Kod ya da metin boşsa, kod geçersizse ya da 8 düğme doluysa tanım değişmez.
 */
export function addPageButton<D extends ModelDefinition>(def: D, pageCode: string, label: string): D {
  const code = pageCode.trim();
  const text = label.trim().slice(0, MAX_TITLE).trim();
  if (!code || !text || pageButtonCodeProblem(code) || pageActionsFull(def)) return def;
  const button: ModelComponent = { id: freeId(def, "ekranDugmesi"), type: "button", props: { slot: "actions", text, actionType: "page", pageCode: code } };
  return orderActions({ ...def, components: [...def.components, button] });
}

/** Ekran açan düğmeyi kaldırır; başka türdeki düğmede tanım değişmez. */
export function removePageButton<D extends ModelDefinition>(def: D, buttonId: string): D {
  const button = def.components.find((component) => component.id === buttonId && isPageButton(component));
  return button ? { ...def, components: def.components.filter((component) => component !== button) } : def;
}

/** İşlem çubuğu dolu mu (8 düğme: katalog eylemleri ve ekran açan düğmeler birlikte). */
export const pageActionsFull = (def: ModelDefinition) => def.components.filter(isActionButton).length >= MAX_PAGE_ACTIONS;

/** İşlem çubuğundaki ekran açan düğmeler, sırayla. */
export function pageButtons(def: ModelDefinition): { id: string; text: string; pageCode: string }[] {
  return def.components.filter(isPageButton).map((component) => ({
    id: component.id,
    text: typeof component.props.text === "string" ? component.props.text : "",
    pageCode: typeof component.props.pageCode === "string" ? component.props.pageCode : "",
  }));
}
