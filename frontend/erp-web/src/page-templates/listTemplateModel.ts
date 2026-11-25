/** Kalıplı sayfanın üst düzey bileşeni: yeri `props.slot`'ta yazar. */
export type Component = { id: string; type: string; name?: string; props?: Record<string, unknown> };

export type ListLayout<C extends Component = Component> = {
  indicators: C[]; filters: C | null; list: C; actions: C[]; rowActions: C[]; detail: C | null; above: C[]; below: C[];
};

const slotOf = (component: Component) => (typeof component.props?.slot === "string" ? component.props.slot : "");

/** Liste yerinde bir `dataTable` var mı (yoksa sayfa eski biçimde çizilir). */
export function hasListSlot(components: Component[]): boolean {
  return components.some((component) => component.type === "dataTable" && slotOf(component) === "list");
}

/**
 * Bileşenleri `slot`'a göre ayırır, kayıt sırasını korur. Yeri tanınmayan ya da türü yerine uymayan bileşen çizilmez
 * (sunucu bunları zaten reddeder). Liste yerinde `dataTable` yoksa hata atar; önce `hasListSlot` ile bakılır.
 */
export function layoutListTemplate<C extends Component>(components: C[]): ListLayout<C> {
  const of = (slot: string, type?: string) => components.filter((component) => slotOf(component) === slot && (!type || component.type === type));
  const list = of("list", "dataTable")[0];
  if (!list) throw new Error("Liste kalıbında tam bir liste (dataTable) olmalı.");
  return {
    indicators: of("indicators", "metric"),
    filters: of("filters", "filterBar")[0] ?? null,
    list,
    actions: of("actions", "button"),
    rowActions: of("rowActions", "button"),
    detail: of("detail", "contextPanel")[0] ?? null,
    above: of("above"),
    below: of("below"),
  };
}

/** Basamak saklanmaz: `above` ya da `below` yerinde bileşen varsa 2, yoksa 1. */
export function templateLevel(layout: ListLayout<Component>): 1 | 2 {
  return layout.above.length > 0 || layout.below.length > 0 ? 2 : 1;
}
