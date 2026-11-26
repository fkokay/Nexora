import { parseTabs } from "../custom-page/layoutRefs";
import type { Component } from "./listTemplateModel";

/** Serbest gövdenin bir bölümü (`slot: block` olan `section`) ve `members` sırasıyla üyeleri. */
export type FreeBlock<C> = { block: C; members: C[] };
export type FreeTab<C> = { label: string; blocks: FreeBlock<C>[] };
/**
 * Serbest gövdenin yerleşimi. Sekmesizse `tabs: null`; `blocks` her zaman bütün bölümleri kayıt sırasıyla taşır.
 * `tabsComponent`: sekme bileşeninin kendisi (sekme çubuğu onunla çizilir: `tabParam`, tuvalin `showTab`'ı, sekme işaretleri).
 */
export type FreeLayout<C> = { actions: C[]; tabs: FreeTab<C>[] | null; blocks: FreeBlock<C>[]; tabsComponent: C | null };

const slotOf = (component: Component) => (typeof component.props?.slot === "string" ? component.props.slot : "");
const isBlock = (component: Component) => component.type === "section" && slotOf(component) === "block";

/** Serbest gövdede en az bir bölüm var mı; yoksa sayfa eski biçimde çizilir. */
export function hasFreeSlot(components: Component[]): boolean {
  return components.some(isBlock);
}

/**
 * Bileşenleri yerlerine ayırır, kayıt sırasını korur. Bölümün `members` kimlikleri `slot: item` bileşenlere çözülür;
 * bilinmeyen kimlik atlanır. Sekmeler `tabs` bileşeninin `tabs` özelliğinden okunur; sekmede listelenip bulunamayan kimlik atlanır.
 */
export function layoutFreeTemplate<C extends Component>(components: C[]): FreeLayout<C> {
  const items = new Map<string, C>();
  for (const component of components) if (slotOf(component) === "item") items.set(component.id, component);
  const blocks: FreeBlock<C>[] = components.filter(isBlock).map((block) => {
    const raw = Array.isArray(block.props?.members) ? block.props.members : [];
    const ids = [...new Set(raw.filter((id): id is string => typeof id === "string"))];
    return { block, members: ids.flatMap((id) => (items.has(id) ? [items.get(id)!] : [])) };
  });
  const byId = new Map(blocks.map((entry) => [entry.block.id, entry]));
  const tabsComponent = components.find((component) => component.type === "tabs" && slotOf(component) === "tabs") ?? null;
  const tabs = tabsComponent
    ? parseTabs(tabsComponent.props?.tabs).map((tab) => ({ label: tab.label, blocks: tab.ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) }))
    : null;
  return {
    actions: components.filter((component) => component.type === "button" && slotOf(component) === "actions"),
    tabs, blocks, tabsComponent,
  };
}

/** Tam satır üyeler: Liste, Görsel ve maddeli Bilgi kutusu / kart / madde listesi. */
export function freeFullRow(component: Component): boolean {
  if (component.type === "dataTable" || component.type === "image") return true;
  if (component.type !== "alert" && component.type !== "card" && component.type !== "list") return false;
  const items = component.props?.items;
  return Array.isArray(items) && items.some((item) => typeof item === "string" && item.trim() !== "");
}
