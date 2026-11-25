// Metin ve Bilgi kutusu panellerinin saf modeli (alt proje 5a, Karar 1 ve 3). Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Yalnız değiştirilen bileşen yeniden yazılır; `id`, `name`, `slot`, sekme üyeliği ve `visibleWhen` başvuruları aynı kalır.
import type { ModelComponent, ModelDefinition } from "./listPanelModel";

export type TextStyle = "heading" | "subheading" | "paragraph" | "label";
export type InfoTone = "info" | "warning" | "success" | "plain";
export type InfoBox = { tone: InfoTone; title: string; text: string; items: string[] | null; dismissible: boolean };
export const MAX_INFO_ITEMS = 40;

const TYPE_OF: Record<TextStyle, string> = { heading: "heading", subheading: "section", paragraph: "text", label: "label" };
/** Metnin yeri: `section` ve (ERP `title || text` çizdiği için) başlığı dolu `heading` için `title`, ötekiler için `text`. */
const keyOfType = (type: string) => (type === "section" ? "title" : "text");
const textKey = (c: ModelComponent) => (c.type === "heading" && str(c.props.title) ? "title" : keyOfType(c.type));
export const textKeyOf = textKey;
/** Birden çok parçadan oluşan metin (`parts`) panelden düzenlenmez. */
export const hasTextParts = (c: ModelComponent) => c.type === "text" && c.props.parts !== undefined;
/** Madde satırlarından boş olanları atar (alan odağı bırakınca). */
export const cleanItems = (lines: string[]): string[] => lines.filter((line) => line.trim() !== "");
const str = (value: unknown) => (typeof value === "string" ? value : "");

export function textStyleOf(c: ModelComponent): TextStyle {
  return c.type === "heading" ? "heading" : c.type === "section" ? "subheading" : c.type === "label" ? "label" : "paragraph";
}

/** Bir bileşeni yerinde değiştirir; sıra ve öteki bileşenler aynı kalır. */
function mapComponent<D extends ModelDefinition>(def: D, id: string, change: (c: ModelComponent) => ModelComponent): D {
  return { ...def, components: def.components.map((c) => (c.id === id ? change(c) : c)) };
}

type Props = ModelComponent["props"];
const without = (props: Props, ...keys: string[]): Props => Object.fromEntries(Object.entries(props).filter(([key]) => !keys.includes(key)));

export function setTextStyle<D extends ModelDefinition>(def: D, id: string, style: TextStyle): D {
  return mapComponent(def, id, (c) => {
    const type = TYPE_OF[style];
    const from = textKey(c);
    const to = keyOfType(type);
    const content = str(c.props[from]) || str(c.props[to]);
    const props: Props = {};
    for (const [key, value] of Object.entries(c.props)) {
      if (key === from && from !== to) continue;
      // Sayfa başlığı yalnız `heading` türünde geçerlidir (sunucu öteki türlerde reddeder).
      if (key === "pageTitle" && type !== "heading") continue;
      props[key] = key === to ? content : value;
    }
    if (!(to in props)) props[to] = content;
    return { ...c, type, props };
  });
}

export function setTextContent<D extends ModelDefinition>(def: D, id: string, stored: string): D {
  return mapComponent(def, id, (c) => ({ ...c, props: { ...c.props, [textKey(c)]: stored } }));
}

export function setTextAlign<D extends ModelDefinition>(def: D, id: string, align: "start" | "center"): D {
  return mapComponent(def, id, (c) => ({ ...c, props: align === "start" ? without(c.props, "textAlign") : { ...c.props, textAlign: "center" } }));
}

/** `true` ise "Mobilde gizle" açık; kapalıyken özellik kaldırılır. */
export function setHideOnMobile<D extends ModelDefinition>(def: D, id: string, hide: boolean): D {
  return mapComponent(def, id, (c) => ({ ...c, props: hide ? { ...c.props, hideOnMobile: true } : without(c.props, "hideOnMobile") }));
}

const TONES = ["info", "warning", "success"] as const;
const toneOf = (c: ModelComponent): InfoTone => {
  if (c.type !== "alert") return "plain";
  return (TONES as readonly string[]).includes(str(c.props.variant)) ? (c.props.variant as InfoTone) : "info";
};
/** Metnin okunduğu (ve geri yazıldığı) anahtar: `card` ve `list` için `text` boşsa `description`. */
const bodyKey = (c: ModelComponent) => (c.type !== "alert" && !str(c.props.text) && str(c.props.description) ? "description" : "text");

export function infoBoxOf(c: ModelComponent): InfoBox {
  const items = Array.isArray(c.props.items) ? c.props.items.filter((item): item is string => typeof item === "string") : null;
  return {
    tone: toneOf(c), title: str(c.props.title), text: str(c.props[bodyKey(c)]),
    items: items ?? (c.type === "list" ? [] : null), dismissible: c.props.dismissible === true,
  };
}

export function setInfoBox<D extends ModelDefinition>(def: D, id: string, patch: Partial<InfoBox>): D {
  return mapComponent(def, id, (c) => {
    const key = bodyKey(c);
    let type = c.type;
    let props: Props = { ...c.props };
    // Tür: `list` yalnız başka bir türe geçilirse `alert`/`card` olur; kendi türü (Sade) seçilirse olduğu gibi kalır.
    if (patch.tone !== undefined && !(c.type === "list" && patch.tone === "plain") && patch.tone !== toneOf(c)) {
      const text = str(props[key]);
      props = key === "description" ? without(props, "description", "variant") : without(props, "variant");
      props.text = text;
      if (patch.tone === "plain") type = "card";
      else { type = "alert"; props.variant = patch.tone; }
    }
    const textTo = type === c.type ? key : "text";
    if (patch.title !== undefined) props.title = patch.title;
    if (patch.text !== undefined) props[textTo] = patch.text;
    if (patch.items !== undefined) {
      if (patch.items === null) props = type === "list" ? { ...props, items: [] } : without(props, "items");
      else props.items = patch.items.slice(0, MAX_INFO_ITEMS);
    }
    if (patch.dismissible !== undefined && type !== "list") props = patch.dismissible ? { ...props, dismissible: true } : without(props, "dismissible");
    return { ...c, type, props };
  });
}
