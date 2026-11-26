// "Yazılımcı bileşeni" panelinin saf modeli (Yazılımcı bileşeni planı, Görev 6). Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Sayfa yalnız başvuru taşır: `code` bileşeninde `catalogComponent` (katalog bileşen kodu) ve `componentSettings` (ayar değerleri).
// Varsayılanlar sayfaya yazılmaz; köprü `get("ayarlar.<ad>")` için varsayılanı sunucunun çözdüğü katalogdan verir.
import type { ActiveCatalog, CatalogComponent, CatalogComponentSetting } from "../catalogClient";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";

export type SettingValue = string | number | boolean;
type Props = ModelComponent["props"];
type Settings = Record<string, SettingValue>;

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const settingsOf = (props: Props): Record<string, unknown> => {
  const raw = (props as Record<string, unknown>).componentSettings;
  return isObject(raw) ? raw : {};
};

/** Değer ayarın türüne uyuyor mu (seçim için seçeneklerden biri; sayı sonlu olmalı). */
export function settingValueFits(setting: CatalogComponentSetting, value: unknown): value is SettingValue {
  switch (setting.type) {
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "bool": return typeof value === "boolean";
    case "choice": return typeof value === "string" && setting.options.includes(value);
    default: return typeof value === "string";
  }
}

/** Yalnız bileşenin tanımladığı ve türüne uyan değerler kalır (Review Focus 2: kaldırılan ya da türü değişen ayar temizlenir). */
function fittingSettings(comp: CatalogComponent, values: Record<string, unknown>): Settings {
  const kept: Settings = {};
  for (const setting of comp.settings) {
    const value = values[setting.name];
    if (settingValueFits(setting, value)) kept[setting.name] = value;
  }
  return kept;
}

/** `componentSettings` boşsa özellik hiç yazılmaz. */
function withSettings(props: Props, settings: Settings): Props {
  const { componentSettings: _old, ...rest } = props as Record<string, unknown>;
  return (Object.keys(settings).length > 0 ? { ...rest, componentSettings: settings } : rest) as Props;
}

function mapComponent<D extends ModelDefinition>(def: D, id: string, change: (c: ModelComponent) => ModelComponent): D {
  return { ...def, components: def.components.map((c) => (c.id === id ? change(c) : c)) };
}

/**
 * Bileşeni seçer: `catalogComponent` yazılır, satır içi kod (`css`, `javascript`) kaldırılır, ayarlar varsayılanlarla doldurulmaz;
 * yeni bileşende tanımlı olmayan ya da türü uymayan eski değerler silinir.
 */
export function chooseComponent<D extends ModelDefinition>(def: D, id: string, comp: CatalogComponent): D {
  return mapComponent(def, id, (c) => {
    const { css: _css, javascript: _js, ...rest } = c.props as Record<string, unknown>;
    const props = { ...rest, catalogComponent: comp.code } as Props;
    return { ...c, props: withSettings(props, fittingSettings(comp, settingsOf(c.props))) };
  });
}

/**
 * Bir ayarın değerini yazar. Tanımsız ad, türe uymayan değer ya da seçenek dışı seçim yazılmaz (aynı tanım döner).
 * Boş metin ya da `null` değeri kaldırır (varsayılan kullanılır). Bileşenin artık tanımlamadığı eski değerler de temizlenir.
 */
export function setComponentSetting<D extends ModelDefinition>(def: D, id: string, comp: CatalogComponent, name: string, value: SettingValue | null): D {
  const setting = comp.settings.find((item) => item.name === name);
  if (!setting) return def;
  const clear = value === null || (value === "" && setting.type !== "choice");
  if (!clear && !settingValueFits(setting, value)) return def;
  if (!def.components.some((c) => c.id === id)) return def;
  return mapComponent(def, id, (c) => {
    const settings = fittingSettings(comp, settingsOf(c.props));
    if (clear) delete settings[name];
    else settings[name] = value as SettingValue;
    return { ...c, props: withSettings(c.props, settings) };
  });
}

/** Bileşenin seçili katalog bileşeni; kayıtta kod var ama etkin katalogda yoksa `missing` (Review Focus 1). */
export function developerComponentOf(def: ModelDefinition, id: string, catalog: ActiveCatalog | null):
  { comp: CatalogComponent | null; missing: boolean; values: Record<string, unknown> } {
  const component = def.components.find((c) => c.id === id);
  if (!component) return { comp: null, missing: false, values: {} };
  const raw = (component.props as Record<string, unknown>).catalogComponent;
  const code = typeof raw === "string" ? raw : "";
  const comp = code ? catalog?.components?.find((item) => item.code === code) ?? null : null;
  return { comp, missing: code !== "" && !comp, values: { ...settingsOf(component.props) } };
}
