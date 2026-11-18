// Saf (React'siz) kurallar: İşlem Çubuğu Yeni / Aç / kaydettikten sonra.
/**
 * İşlem Çubuğu'nun Yeni / Aç / kaydettikten sonra komutları (taslak 13): ne yapılacağı çubuğun kendi düz özellikleriyle
 * seçilir (`newAction`, `openAction`, `afterSaveAction` …). Eski gizli düğme bağları (`newButton` / `openButton` /
 * `afterSaveButton`) çalışmaya devam eder; "İşlem Çubuğu'na taşı" onları yeni özelliklere çevirir.
 */

export type Value = string | number | boolean | string[];
export type Comp = { id: string; type: string; name?: string; props: Record<string, Value> };
export type Def = { components: Comp[] };
export type Patch = Record<string, Value | undefined>;

export const BAR_COMMAND_PROPS = ["newAction", "newPageCode", "newTarget", "openAction", "openPageCode", "openTarget", "openTable", "openParams",
  "afterSaveAction", "afterSavePageCode", "afterSaveTarget", "afterSaveRefresh"] as const;
export const LEGACY_KEYS = ["newButton", "openButton", "afterSaveButton"] as const;
export const OPEN_GROUP = ["openPageCode", "openTarget", "openTable", "openParams"] as const;
export const MAX_PARAMS = 6;
export const PARAM_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;
export const ROW_BINDING = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir\.([A-Za-z0-9_.]+)\s*\}\}$/;

export const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
export const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export type NewMode = "off" | "clear" | "dialog" | "page" | "button";
export type OpenMode = "off" | "dialog" | "page" | "button";
export type AfterSaveMode = "off" | "page" | "button";

/** ERP çalışma zamanıyla aynı öncelik: düz değer, yoksa kayıt penceresi, sonra düğme, Yeni için son olarak temizlenecek girişler. */
export function barModes(props: Record<string, unknown>): { new: NewMode; open: OpenMode; afterSave: AfterSaveMode } {
  const dialog = text(props.formDialog) !== "";
  const newAction = text(props.newAction);
  const openAction = text(props.openAction);
  const afterSaveAction = text(props.afterSaveAction);
  return {
    new: (["off", "clear", "dialog", "page"].includes(newAction) ? newAction as NewMode
      : dialog ? "dialog" : text(props.newButton) ? "button" : list(props.newInputs).length > 0 ? "clear" : "off"),
    open: (["off", "dialog", "page"].includes(openAction) ? openAction as OpenMode : dialog ? "dialog" : text(props.openButton) ? "button" : "off"),
    afterSave: (["off", "page"].includes(afterSaveAction) ? afterSaveAction as AfterSaveMode : text(props.afterSaveButton) ? "button" : "off"),
  };
}

/** Tuval önizlemesi: Yeni ve Aç bağlı mı. */
export function barBound(props: Record<string, unknown>): { new: boolean; open: boolean } {
  const modes = barModes(props);
  return {
    new: modes.new === "page" ? text(props.newPageCode) !== "" : modes.new === "clear" ? list(props.newInputs).length > 0 : modes.new !== "off",
    open: modes.open === "page" ? text(props.openPageCode) !== "" && text(props.openTable) !== "" : modes.open !== "off",
  };
}

/** Sunucunun ValidateBarCommands kurallarının kaydetmeden önceki karşılığı (metinler aynı); sorun yoksa null. */
export function barCommandProblem(props: Record<string, unknown>): string | null {
  for (const [label, action, legacy] of [["Yeni", "newAction", "newButton"], ["Aç", "openAction", "openButton"], ["Kaydettikten sonra", "afterSaveAction", "afterSaveButton"]] as const)
    if (action in props && legacy in props)
      return `İşlem Çubuğu ${label} komutu hem '${action}' hem '${legacy}' ile ayarlanamaz; Studio'da 'İşlem Çubuğu'na taşı' ile eski düğmeyi kaldırın.`;
  if (props.newAction === "clear" && list(props.newInputs).length === 0) return "İşlem Çubuğu Yeni 'clear' (Formu temizle) için temizlenecek girişler ('newInputs') gerekli.";
  for (const [label, action] of [["Yeni", "newAction"], ["Aç", "openAction"]] as const)
    if (props[action] === "dialog" && !text(props.formDialog)) return `İşlem Çubuğu ${label} 'dialog' (Pencere aç) için kayıt penceresi ('formDialog') gerekli.`;
  for (const [label, action, code] of [["Yeni", "newAction", "newPageCode"], ["Aç", "openAction", "openPageCode"], ["Kaydettikten sonra", "afterSaveAction", "afterSavePageCode"]] as const)
    if (props[action] === "page" && !text(props[code])) return `İşlem Çubuğu ${label} sayfa açıyor; açılacak sayfa ('${code}') gerekli.`;
  for (const [label, action] of [["Yeni", "newAction"], ["Aç", "openAction"]] as const)
    if (props[action] === "page" && text(props.formDialog)) return `İşlem Çubuğu ${label} sayfa açarken kayıt penceresi ('formDialog') kullanılamaz; pencere için 'dialog' seçin.`;
  if (props.openAction === "page" && !text(props.openTable)) return "İşlem Çubuğu Aç sayfa açıyor; satırı kullanılacak liste ('openTable') gerekli.";
  const params = list(props.openParams);
  if (params.some((item, index) => { const name = item.slice(0, item.indexOf("=")); return !item.includes("=") || !PARAM_NAME.test(name) || params.findIndex((other) => other.startsWith(`${name}=`)) !== index; }))
    return "'openParams' en fazla 6 adet ad=değer öğesi içermelidir; ad küçük harfle başlar, en fazla 32 harf/rakamdır ve benzersizdir.";
  return null;
}

/** Bir bileşenin özelliklerinden biri bu kimliği gösteriyor mu (tekil değer, liste ya da sekme "Etiket=a,b" öğesi). */
const references = (component: Comp, id: string) => Object.values(component.props).some((value) =>
  value === id || Array.isArray(value) && value.some((item) => item === id || typeof item === "string" && item.includes("=") && item.slice(item.indexOf("=") + 1).split(",").includes(id)));

/** Taşınabilir eski düğme: "Sayfa aç" eylemli, onaysız, pasiflik koşulsuz. Aç'ın seçim koşulu (visibleWhen) liste seçiminden gelir. */
function movableButton(button: Comp | undefined, slot: "new" | "open" | "afterSave"): boolean {
  if (!button || button.type !== "button" || button.props.actionType !== "page" || !text(button.props.pageCode)) return false;
  if (button.props.confirmEnabled === true || "disabledWhen" in button.props) return false;
  if (slot !== "open" && (list(button.props.params).length > 0 || "visibleWhen" in button.props)) return false;
  // Aç'ın yalnız "satır seçili" koşulu taşınır (artık listenin seçiminden gelir); başka koşul düğmede kalmalıdır.
  return !("visibleWhen" in button.props) || /^\s*[A-Za-z_][A-Za-z0-9_]*\.seciliSatir(?:\.[A-Za-z0-9_.]+)?\s*!=\s*null\s*$/.test(text(button.props.visibleWhen));
}

/** Aç düğmesinin satırını okuduğu liste: parametre ya da görünürlük koşulundaki ilk `<ad>.seciliSatir` kökü. */
function openTableOf(button: Comp, components: Comp[]): string | undefined {
  const source = [...list(button.props.params), text(button.props.visibleWhen)].join(" ");
  const root = /([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir\b/.exec(source)?.[1];
  const table = components.find((component) => component.type === "dataTable" && component.name === root && text(component.props.query) !== "");
  return table?.id;
}

/** Başka hiçbir bileşenin göstermediği düğmeleri tanımdan çıkarır. */
function dropUnusedButtons<T extends Def>(definition: T, ids: string[]): T {
  const unused = new Set(ids.filter((id) => definition.components.find((component) => component.id === id)?.type === "button"
    && !definition.components.some((component) => component.id !== id && references(component, id))));
  return unused.size === 0 ? definition : { ...definition, components: definition.components.filter((component) => !unused.has(component.id)) } as T;
}

/**
 * Komutlar grubundaki bir seçimi çubuğa uygular (undefined siler). Seçim eski düğme bağını kaldırıyorsa, artık hiçbir yerde
 * kullanılmayan düğme de silinir; aksi halde sayfada görünür hale gelirdi.
 */
export function patchBarCommands<T extends Def>(definition: T, barId: string, patch: Patch): T {
  const bar = definition.components.find((component) => component.id === barId);
  if (!bar) return definition;
  const props: Record<string, Value> = { ...bar.props };
  for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete props[key]; else props[key] = value; }
  const dropped = LEGACY_KEYS.filter((key) => text(bar.props[key]) !== "" && !(key in props)).map((key) => text(bar.props[key]));
  const next = { ...definition, components: definition.components.map((component) => component.id === barId ? { ...component, props } : component) } as T;
  return dropUnusedButtons(next, dropped);
}

export type BarMigration ={ definition: Def; moved: string[]; skipped: string[] };

/**
 * Eski düğme bağlarını düz özelliklere çevirir; düğmeyi başka hiçbir yer kullanmıyorsa siler. Tek tanım dönüşümüdür
 * (tek geri alma adımı). Taşınamayan bağ (onaylı, koşullu ya da sayfa açmayan düğme) yerinde kalır ve `skipped`'e girer.
 */
export function migrateBarButtons<T extends Def>(definition: T): BarMigration & { definition: T } {
  const bar = definition.components.find((component) => component.type === "actionBar");
  if (!bar) return { definition, moved: [], skipped: [] };
  const byId = new Map(definition.components.map((component) => [component.id, component]));
  const props: Record<string, Value> = { ...bar.props };
  const moved: string[] = [];
  const skipped: string[] = [];
  const candidates: string[] = [];
  for (const [slot, key] of [["new", "newButton"], ["open", "openButton"], ["afterSave", "afterSaveButton"]] as const) {
    const id = text(props[key]);
    if (!id) continue;
    const button = byId.get(id);
    const table = slot === "open" && button ? openTableOf(button, definition.components) : undefined;
    if (!movableButton(button, slot) || (slot === "open" && !table)) { skipped.push(key); continue; }
    const pageCode = text(button!.props.pageCode);
    const target = button!.props.target === "newTab" ? "newTab" : "sameTab";
    delete props[key];
    if (slot === "new") Object.assign(props, { newAction: "page", newPageCode: pageCode, newTarget: target });
    if (slot === "open") {
      Object.assign(props, { openAction: "page", openPageCode: pageCode, openTarget: target, openTable: table! });
      const params = list(button!.props.params);
      if (params.length > 0) props.openParams = params;
    }
    // Eski düğmeli kayıttan sonra her zaman açılan sayfayı yeniler.
    if (slot === "afterSave") Object.assign(props, { afterSaveAction: "page", afterSavePageCode: pageCode, afterSaveTarget: target, afterSaveRefresh: true });
    moved.push(key);
    candidates.push(id);
  }
  if (moved.length === 0) return { definition, moved, skipped };
  const next = { ...definition, components: definition.components.map((component) => component.id === bar.id ? { ...bar, props } : component) } as T;
  return { definition: dropUnusedButtons(next, candidates), moved, skipped };
}

