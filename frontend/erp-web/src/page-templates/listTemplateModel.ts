/** Kalıplı sayfanın üst düzey bileşeni: yeri `props.slot`'ta yazar. */
export type Component = { id: string; type: string; name?: string; props?: Record<string, unknown> };

export type ListLayout<C extends Component = Component> = {
  indicators: C[]; filters: C | null; list: C; actions: C[]; rowActions: C[]; detail: C | null; above: C[]; below: C[];
  /** Pencereler (`dialogs` yerinde `dialog`); içerikleri (`dialog` yeri) hiçbir yerleşim dizisine girmez, pencerenin içinde çizilir. */
  dialogs: C[];
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
    // Detay yerinde detay paneli ya da (seçili satırı gösteren) kart grubu.
    detail: components.find((component) => slotOf(component) === "detail" && (component.type === "contextPanel" || component.type === "card")) ?? null,
    above: of("above"),
    below: of("below"),
    dialogs: of("dialogs", "dialog"),
  };
}

/** Gizli giriş (`input` + `hidden: true`): hiçbir şey çizmez, yalnız değeri kapsamda tutar (ör. sales-orders `sevkSayfaBoyutu`). */
export const isHiddenInput = (component: Component) => component.type === 'input' && component.props?.hidden === true;
/** Yalnız gizli girişlerden oluşmayan, yani ekranda bir şey çizen bileşen listesi mi. */
export const drawsSomething = (components: Component[]) => components.some((component) => !isHiddenInput(component));

/** Basamak saklanmaz: `above` ya da `below` yerinde (gizli giriş dışında) bileşen varsa 2, yoksa 1. */
export function templateLevel(layout: ListLayout<Component>): 1 | 2 {
  return drawsSomething(layout.above) || drawsSomething(layout.below) ? 2 : 1;
}

/**
 * Kalıplı sayfanın komut çubuğu: `commands` yerindeki üst düzey tek `actionBar` (Liste, Kayıt kartı, Serbest). Yerleşime girmez;
 * kabuk komutları kayıt defterinden çizer. Yoksa `null`: sayfa bugünkü gibi çizilir ve komut kaydetmez.
 */
export function commandsBarOf<C extends Component>(components: C[]): C | null {
  return components.find((component) => component.type === "actionBar" && slotOf(component) === "commands") ?? null;
}
