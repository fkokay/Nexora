import { parseTabs } from "../custom-page/layoutRefs";
import type { Component } from "./listTemplateModel";

/** Kayıt kartının bir sekmesi: bölüm / satır tablosu / not / özel alan blokları, sekmede listelendiği sırayla. */
export type RecordTab<C> = { label: string; blocks: C[] };

export type RecordLayout<C extends Component = Component> = {
  summary: C | null; actions: C[]; tabs: C | null; tabList: RecordTab<C>[]; above: C[]; below: C[];
  /** Pencereler (`dialogs` yerinde `dialog`); içerikleri (`dialog` yeri) hiçbir yerleşim dizisine girmez. */
  dialogs: C[];
};

const slotOf = (component: Component) => (typeof component.props?.slot === "string" ? component.props.slot : "");
const BLOCK_TYPES: Record<string, string> = { section: "formCard", lines: "dataTable", note: "text", customFields: "customFieldsBlock" };

/** Kayıt kartının özeti (`summary` yerinde `recordHeader`) ya da sekmesi (`tabs` yerinde `tabs`) var mı; yoksa sayfa eski biçimde çizilir. */
export function hasRecordSlot(components: Component[]): boolean {
  return components.some((component) => (slotOf(component) === "summary" && component.type === "recordHeader") || (slotOf(component) === "tabs" && component.type === "tabs"));
}

/**
 * Bileşenleri `slot`'a göre ayırır, kayıt sırasını korur. Sekmeler `tabs` bileşeninin `tabs` özelliğinden okunur; sekmede
 * listelenip bulunamayan (ya da bölüm/satır/not olmayan) kimlik atlanır, boş sekme kalır.
 */
export function layoutRecordTemplate<C extends Component>(components: C[]): RecordLayout<C> {
  const of = (slot: string, type?: string) => components.filter((component) => slotOf(component) === slot && (!type || component.type === type));
  const blocks = new Map<string, C>();
  for (const component of components) if (BLOCK_TYPES[slotOf(component)] === component.type) blocks.set(component.id, component);
  const tabs = of("tabs", "tabs")[0] ?? null;
  const tabList = tabs
    ? parseTabs(tabs.props?.tabs).map((tab) => ({ label: tab.label, blocks: tab.ids.flatMap((id) => (blocks.has(id) ? [blocks.get(id)!] : [])) }))
    : [];
  return {
    summary: of("summary", "recordHeader")[0] ?? null,
    actions: of("actions", "button"),
    tabs, tabList,
    above: of("above"),
    below: of("below"),
    dialogs: of("dialogs", "dialog"),
  };
}

/**
 * Kayıt anahtarı sayfa parametresi: ilk bölümün `recordKey`'i (`{{X.rows[0].k}}`) X sorgusunu verir (ad ya da kimlikle);
 * o sorgunun `{{sayfa.parametre.<p>}}` bağlı parametresinin `<p>`'si döner. Bulunamazsa `null`.
 */
export function recordKeyParam(
  components: Component[],
  queries: { id: string; name?: string; parameters?: { name: string; binding?: string }[] }[],
): string | null {
  const section = components.find((component) => slotOf(component) === "section" && component.type === "formCard");
  const key = typeof section?.props?.recordKey === "string" ? section.props.recordKey : "";
  const root = /^\s*\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\./.exec(key)?.[1];
  if (!root) return null;
  const query = queries.find((item) => item.name === root) ?? queries.find((item) => item.id === root);
  for (const parameter of query?.parameters ?? []) {
    const match = /^\s*\{\{\s*sayfa\.parametre\.([^\s}.]+)\s*\}\}\s*$/.exec(parameter.binding ?? "");
    if (match) return match[1];
  }
  return null;
}

/** Basamak saklanmaz: `above` ya da `below` yerinde bileşen varsa 2, yoksa 1. */
export function recordTemplateLevel(layout: RecordLayout<Component>): 1 | 2 {
  return layout.above.length > 0 || layout.below.length > 0 ? 2 : 1;
}
