import type { BarLook, CommandSpec, MenuCommand, PageCommands, StandardCommandId } from "../commands/types";
import { idList } from "./layoutRefs";
import { RECORD_LOADING, RECORD_UNREADABLE } from "./recordMessages";

/** İşlem Çubuğu (`actionBar`) bileşeninin komut kuralları: saf işlevler, React'e bağlı değildir. */

type Component = { id: string; type: string; props?: Record<string, unknown> };

const UNBOUND = "Bu sayfada bağlanmadı";
const NO_RIGHT = "Bu işlem için yetkiniz yok";
const BUSY = "İşlem sürüyor…";
const NEEDS_SELECTION = "Önce bir kayıt seçin";
const TABLE_LOADING = "Liste henüz yüklenmedi";
const BUTTON_UNAVAILABLE = "Bu işlem şu anda kullanılamaz.";

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Düzleştirilmiş bileşen dizisindeki ilk `actionBar`. */
export function actionBarOf(components: Component[]): { id: string; props: Record<string, unknown> } | null {
  const bar = components.find((component) => component.type === "actionBar");
  return bar ? { id: bar.id, props: bar.props ?? {} } : null;
}

/**
 * İşlem Çubuğu'nda gizlenebilen komutlar (`hiddenCommands`, `commandWhen`): sekiz standart komut, İşlemler menüsü ve
 * çubuktaki Kaydet ve yeni düğmesi (`saveNew`, `saveAndNew: true` ile).
 */
export const BAR_COMMAND_IDS = ["new", "open", "save", "delete", "refresh", "filter", "print", "export", "more", "saveNew"] as const;
export type BarCommandId = (typeof BAR_COMMAND_IDS)[number];
const STANDARD_BAR_IDS = BAR_COMMAND_IDS.filter((id) => id !== "more" && id !== "saveNew") as StandardCommandId[];
/** Çubuktaki Kaydet ve yeni düğmesi (`actionBar.saveAndNew`): kaydeder, başarıda kayıttan sonra eylemi yerine Yeni komutunu çalıştırır. */
export const SAVE_AND_NEW_COMMAND_ID = "save-and-new";
export const SAVE_AND_NEW_LABEL = "Kaydet ve yeni";
export const SAVE_AND_NEW_SHORTCUT = "Ctrl+F2";

const LOOK_VALUES: Record<keyof BarLook, readonly string[] | null> = {
  align: ["start", "center", "end"], density: ["compact", "normal", "wide"], sticky: ["true", "false"],
  separators: ["true", "false"], size: ["sm", "md", "lg"], style: ["outline", "solid", "plain"],
  content: ["both", "text", "icon"], unbound: ["dim", "hide"], hints: ["true", "false"],
  border: ["none", "bottom", "box"], radius: ["sharp", "soft", "round"], title: ["true", "false"],
  accent: null, background: null,
};
const BOOLEAN_LOOK = new Set<keyof BarLook>(["sticky", "separators", "hints", "title"]);
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** "anahtar=değer" / "komut=koşul" öğesini ilk `=` işaretinden böler (koşulun kendisi `=` içerebilir). */
const splitItem = (item: string): [string, string] | null => {
  const at = item.indexOf("=");
  return at > 0 ? [item.slice(0, at), item.slice(at + 1)] : null;
};
const stringItems = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []);

/**
 * `actionBar.barLook` ("anahtar=değer" dizisi) → görünüm nesnesi. Bilinmeyen anahtar, izin verilmeyen değer ve tekrar
 * eden anahtar (ilki geçerli) yok sayılır; renkler yalnız #RRGGBB. Geçerli öğe yoksa undefined (bugünkü görünüm).
 */
export function parseBarLook(raw: unknown): BarLook | undefined {
  const look: Record<string, string | boolean> = {};
  for (const item of stringItems(raw)) {
    const pair = splitItem(item);
    if (!pair) continue;
    const key = pair[0] as keyof BarLook;
    const value = pair[1];
    if (!Object.prototype.hasOwnProperty.call(LOOK_VALUES, key) || key in look) continue;
    const allowed = LOOK_VALUES[key];
    if (allowed ? !allowed.includes(value) : !HEX_COLOR.test(value)) continue;
    look[key] = BOOLEAN_LOOK.has(key) ? value === "true" : value;
  }
  return Object.keys(look).length > 0 ? look as BarLook : undefined;
}

/** `actionBar.commandWhen` ("komut=koşul" dizisi) → komut başına koşul metni; bilinmeyen komut ve tekrar (ilki geçerli) yok sayılır. */
export function commandWhenOf(props: Record<string, unknown>): Partial<Record<BarCommandId, string>> {
  const result: Partial<Record<BarCommandId, string>> = {};
  for (const item of stringItems(props.commandWhen)) {
    const pair = splitItem(item);
    if (!pair || !(BAR_COMMAND_IDS as readonly string[]).includes(pair[0]) || pair[0] in result) continue;
    result[pair[0] as BarCommandId] = pair[1];
  }
  return result;
}

/**
 * Komut sayfada gizli mi: `hiddenCommands` içinde ya da `commandWhen` koşulu yanlış (`commandVisible` false döner; koşulu
 * sayfa kapsamında `visibleWhen` ile aynı değerlendirici çözer, ayrıştırılamayan koşul görünür sayılır).
 */
export function barCommandHidden(props: Record<string, unknown>, id: BarCommandId, commandVisible?: (id: BarCommandId) => boolean): boolean {
  return stringItems(props.hiddenCommands).includes(id) || commandVisible?.(id) === false;
}

/**
 * `actionBar.moreButtons` ile İşlemler menüsüne taşınan düğme kimlikleri (sayfada ayrıca çizilmez). İşlemler menüsü gizliyse
 * (`moreHidden`: `barCommandHidden(props, "more", …)`) menü düğmeleri sayfada kalır, erişilebilir kalsınlar; Yeni / Aç /
 * kayıttan sonra düğmeleri yine taşınır.
 */
export function movedButtonIds(components: Component[], hasAction: (button: Component) => boolean = () => true, moreHidden = false): Set<string> {
  const bar = actionBarOf(components);
  if (!bar) return new Set();
  // Kullanılabilir eylemi olmayan düğme (sorgu yok / iş akışı boş) menüye de girmez; sayfada kalır, kaybolmaz.
  const buttons = new Map(components.filter((component) => component.type === "button").map((component) => [component.id, component]));
  const moved = moreHidden ? [] : idList(bar.props.moreButtons, 10).filter((id) => { const button = buttons.get(id); return !button || hasAction(button); });
  // Yeni / Aç / kayıttan sonra çalışan düğmeler komutun kendisidir: sayfada ayrıca çizilmezler.
  for (const key of BAR_BUTTON_KEYS) {
    const id = str(bar.props[key]);
    if (id && buttons.has(id)) moved.push(id);
  }
  return new Set(moved);
}

/** İşlem Çubuğu'nun düğme çalıştıran özellikleri: Yeni, Aç ve başarılı kayıttan sonra. */
export const BAR_BUTTON_KEYS = ["newButton", "openButton", "afterSaveButton"] as const;

/** Sayfa açan komutun gezinme özellikleri: "Sayfa aç" düğmesiyle aynı biçim (`runNavigation` bunları çalıştırır). */
export type BarPageNavigation = { actionType: "page"; pageCode: string; target?: string; params?: string[] };
export type BarNewPlan = { mode: "off" | "clear" | "dialog" | "button" | "page"; button?: string; page?: BarPageNavigation };
export type BarOpenPlan = { mode: "off" | "dialog" | "button" | "page"; button?: string; page?: BarPageNavigation; table?: string };
export type BarAfterSavePlan = { mode: "off" | "button" | "page"; button?: string; page?: BarPageNavigation; refresh: boolean };
export type BarCommandPlan = { new: BarNewPlan; open: BarOpenPlan; afterSave: BarAfterSavePlan };

const barPage = (props: Record<string, unknown>, codeKey: string, targetKey: string, paramsKey?: string): BarPageNavigation | undefined => {
  const pageCode = str(props[codeKey]);
  if (!pageCode) return undefined;
  const target = props[targetKey] === "newTab" || props[targetKey] === "sameTab" ? props[targetKey] as string : undefined;
  const params = paramsKey && Array.isArray(props[paramsKey]) ? (props[paramsKey] as unknown[]).filter((item): item is string => typeof item === "string") : [];
  return { actionType: "page", pageCode, ...(target ? { target } : {}), ...(params.length > 0 ? { params } : {}) };
};

/**
 * Yeni / Aç / kaydettikten sonra ne yapar: düz özellikler (`newAction`, `openAction`, `afterSaveAction`) varsa onlar,
 * yoksa eski kurallar: kayıt penceresi (`formDialog`), sonra düğme (`newButton` / `openButton` / `afterSaveButton`), Yeni için
 * son olarak temizlenecek girişler (`newInputs`). Eski düğmeli kayıttan sonra her zaman açılan sayfayı yeniler.
 */
export function barCommandPlan(props: Record<string, unknown>, hasDialog = str(props.formDialog) !== ""): BarCommandPlan {
  const newButton = str(props.newButton);
  const openButton = str(props.openButton);
  const afterSaveButton = str(props.afterSaveButton);
  const newAction = str(props.newAction);
  const openAction = str(props.openAction);
  const afterSaveAction = str(props.afterSaveAction);
  const newPlan: BarNewPlan = newAction === "page" ? { mode: "page", page: barPage(props, "newPageCode", "newTarget") }
    : newAction === "clear" || newAction === "dialog" || newAction === "off" ? { mode: newAction }
    : hasDialog ? { mode: "dialog" } : newButton ? { mode: "button", button: newButton }
    : idList(props.newInputs).length > 0 ? { mode: "clear" } : { mode: "off" };
  const openPlan: BarOpenPlan = openAction === "page" ? { mode: "page", page: barPage(props, "openPageCode", "openTarget", "openParams"), table: str(props.openTable) || undefined }
    : openAction === "dialog" || openAction === "off" ? { mode: openAction }
    : hasDialog ? { mode: "dialog" } : openButton ? { mode: "button", button: openButton } : { mode: "off" };
  const afterSavePlan: BarAfterSavePlan = afterSaveAction === "page"
    ? { mode: "page", page: barPage(props, "afterSavePageCode", "afterSaveTarget"), refresh: props.afterSaveRefresh === true }
    : afterSaveAction === "off" ? { mode: "off", refresh: false }
    : afterSaveButton ? { mode: "button", button: afterSaveButton, refresh: true } : { mode: "off", refresh: false };
  return { new: newPlan, open: openPlan, afterSave: afterSavePlan };
}

export type PageActionDeps = {
  rights: Record<string, boolean | undefined>;
  busy: boolean;
  queryKind: (id: string) => string | undefined;
  inputIds: Set<string>;
  /** Arama kutulu süzgeç alanları: Filtre komutu (focusInput) girişe ya da bunların arama kutusuna odaklanır. */
  searchBarIds?: Set<string>;
  tableState: (tableId: string) => { loading: boolean; error?: string; rowCount: number } | undefined;
  /** Aktarım tablosu sayfada görünüyor mu (`visibleWhen`, sahipleri dahil); false ise Excel ve CSV komutları gizlenir. */
  tableVisible?: (tableId: string) => boolean;
  buttonLabel: (id: string) => string | undefined;
  /** moreButtons düğmesinin koşul durumu: `visibleWhen` yanlışsa gizli (menüye girmez), `disabledWhen` doğruysa nedenli pasif. */
  buttonGate?: (id: string) => { hidden?: boolean; disabled?: boolean; disabledReason?: string } | undefined;
  /** Silme sorgusu, seçimi olmayan bir tablonun `seciliSatir` alanına bağlıysa true. */
  deleteNeedsSelection: boolean;
  /** Sorgunun bağlı ERP işlemine (katalog `allowed`) izin var mı; SQL sorgusu ve bilinmeyen sorgu için true. */
  queryAllowed: (id: string) => boolean;
  /**
   * `actionBar.formDialog` (kayıt penceresi): Yeni pencerede yeni kayıt başlatır (`startNew(focusId)`), Aç seçili kaydı
   * pencerede açar. `hasRecord`: pencerenin bir formCard'ının kayıt tablosunda seçim var.
   */
  formDialog?: { open(): void; startNew(focusId: string | undefined): void; hasRecord: boolean; recordLoading?: boolean;
    /** Kayıt anahtarının okuması hata verdi ya da boş döndü: Aç pasiftir (pencere seçili kaydı yeni kayıt sanmasın). */
    recordFailed?: boolean };
  /** Aç sayfa açıyorsa (`openTable`): listenin bir satırı seçili mi. */
  tableSelected?: (tableId: string) => boolean;
  /** `commandWhen` koşulu sayfa kapsamında doğru mu (koşulsuz komut için true); her çizimde yeniden hesaplanır. */
  commandVisible?: (id: BarCommandId) => boolean;
  run: {
    /** Yeni / Aç'ın açtığı sayfa: "Sayfa aç" düğmesiyle aynı gezinme yolu. */
    navigate?(page: BarPageNavigation): void;
    clearInputs(ids: string[]): void;
    write(queryId: string, kind: "save" | "delete"): void;
    /** İşlem Çubuğu `saveSequence` kayıt dizisini çalıştırır. */
    saveSequence(): void;
    /** Kaydet ve yeni: kayıt yolunu (dizi ya da `saveQuery`) çalıştırır, başarıda Yeni komutuyla yeni kayda başlar. */
    saveAndNew?(): void;
    refresh(): void;
    focus(inputId: string): void;
    print(): void;
    /** Görünen satırları indirir: Excel (varsayılan) ya da İşlemler › CSV. */
    exportTable(tableId: string, format?: "xlsx" | "csv"): void;
    button(id: string): void;
  };
};

const unbound = { disabledReason: UNBOUND };
/** Eski listelerin İşlemler öğesi (commands/gridCommands `csvExportCommand`). */
export const CSV_EXPORT_COMMAND_ID = "export-csv";
export const CSV_EXPORT_LABEL = "CSV olarak dışa aktar";

/** `props` `actionBar` özellikleridir; her standart komut bağlıysa etkin, değilse nedenli soluktur. */
export function buildPageCommands(props: Record<string, unknown>, deps: PageActionDeps): PageCommands {
  const saveId = str(props.saveQuery);
  const saveKind = saveId ? deps.queryKind(saveId) : undefined;
  // Kayıt dizisi: her adım bir yazma sorgusu olmalı; komut her farklı adım türünün sayfa hakkını ister.
  const sequenceIds = idList(props.saveSequence, 8);
  const sequenceKinds = sequenceIds.map((id) => deps.queryKind(id));
  const sequenceBound = sequenceIds.length > 0 && sequenceKinds.every((kind) => kind === "insert" || kind === "update" || kind === "delete");
  const saveBound = sequenceBound || saveKind === "insert" || saveKind === "update";
  const deleteId = str(props.deleteQuery);
  const deleteBound = !!deleteId && deps.queryKind(deleteId) === "delete";
  const newIds = idList(props.newInputs).filter((id) => deps.inputIds.has(id));
  const focusId = str(props.focusInput);
  const exportId = str(props.exportTable);
  // Görünmeyen listenin (ör. sihirbazın henüz açılmamış adımı) aktarımı yoktur: Excel gizlenir, CSV menüye girmez.
  const exportHidden = !!exportId && deps.tableVisible?.(exportId) === false;
  const exportState = exportId && !exportHidden ? deps.tableState(exportId) : undefined;

  const gatedAll = (rights: string[], run: () => void) =>
    rights.some((right) => !deps.rights[right]) ? { disabledReason: NO_RIGHT } : deps.busy ? { disabledReason: BUSY } : { run };
  const gated = (right: string, run: () => void) => gatedAll([right], run);
  // Tek sorgulu yazma, sayfa hakkına ek olarak bağlı ERP işleminin katalog iznini de ister (dizi adımları çalışırken denetlenir).
  const gatedQuery = (queryId: string, right: string, run: () => void) => deps.queryAllowed(queryId) ? gated(right, run) : { disabledReason: NO_RIGHT };
  const formDialog = deps.formDialog;
  // `newButton` / `openButton`: komut, düğmenin eylemini çalıştırır (ör. kayıt ekranını açan "Sayfa aç" düğmesi). Düğme gizliyse
  // (koşulu yanlış) Yeni bağlanmamış, Aç seçim bekliyor sayılır; pasifse nedeni gösterilir.
  const buttonCommand = (key: "newButton" | "openButton") => {
    const id = str(props[key]);
    if (!id || !deps.buttonLabel(id)) return null;
    const gate = deps.buttonGate?.(id);
    if (gate?.hidden) return key === "openButton" ? { disabledReason: NEEDS_SELECTION } : unbound;
    if (gate?.disabled) return { disabledReason: gate.disabledReason || BUTTON_UNAVAILABLE };
    return deps.busy ? { disabledReason: BUSY } : { run: () => deps.run.button(id) };
  };
  // Eski kural: çözülmüş kayıt penceresi (deps.formDialog) Yeni ve Aç'ın önüne geçer.
  const plan = barCommandPlan(props, !!formDialog);
  const newButton = formDialog || plan.new.mode !== "button" ? null : buttonCommand("newButton");
  const openButton = formDialog || plan.open.mode !== "button" ? null : buttonCommand("openButton");
  // Sayfa açan Yeni / Aç: gezinme veri yazmaz, yalnız görüntüleme hakkı ister; Aç listenin seçili satırını bekler.
  const pageCommand = (page: BarPageNavigation | undefined, table?: string) => {
    if (!page || !deps.run.navigate) return unbound;
    if (!deps.rights.view) return { disabledReason: NO_RIGHT };
    if (table && !deps.tableSelected?.(table)) return { disabledReason: NEEDS_SELECTION };
    return deps.busy ? { disabledReason: BUSY } : { run: () => deps.run.navigate!(page) };
  };
  const dialogOpen = !formDialog ? unbound : !formDialog.hasRecord ? { disabledReason: NEEDS_SELECTION }
    : formDialog.recordLoading ? { disabledReason: RECORD_LOADING }
    : formDialog.recordFailed ? { disabledReason: RECORD_UNREADABLE } : { run: () => formDialog.open() };
  const clearNew = newIds.length > 0 ? { run: () => { deps.run.clearInputs(newIds); deps.run.focus(newIds[0]); } } : unbound;
  const newCommand = plan.new.mode === "page" ? pageCommand(plan.new.page)
    : plan.new.mode === "clear" ? clearNew
    : plan.new.mode === "dialog" ? (formDialog ? { run: () => formDialog.startNew(newIds[0]) } : clearNew)
    : plan.new.mode === "button" ? newButton ?? clearNew
    : unbound;
  const openCommand = plan.open.mode === "page" ? pageCommand(plan.open.page, plan.open.table)
    : plan.open.mode === "dialog" ? dialogOpen
    : plan.open.mode === "button" ? openButton ?? unbound
    : unbound;

  const barItems: MenuCommand[] = [];
  const more = idList(props.moreButtons, 10).flatMap((id): MenuCommand[] => {
    const label = deps.buttonLabel(id);
    if (!label) return [];
    const gate = deps.buttonGate?.(id);
    if (gate?.hidden) return [];
    if (gate?.disabled) return [{ id, label, disabledReason: gate.disabledReason || BUTTON_UNAVAILABLE }];
    return [{ id, label, run: () => deps.run.button(id) }];
  });
  // Eski listeler gibi: Excel çubuğun komutu, CSV'si İşlemler menüsünde (`exportCsv: false` kapatır).
  const exportCommand = !exportState ? unbound
    : exportState.loading ? { disabledReason: TABLE_LOADING }
    : exportState.error ? { disabledReason: exportState.error }
    : { run: () => deps.run.exportTable(exportId) };
  if (exportState && props.exportCsv !== false) {
    const csv = "run" in exportCommand ? { run: () => deps.run.exportTable(exportId, "csv") } : { disabledReason: exportCommand.disabledReason };
    more.push({ id: CSV_EXPORT_COMMAND_ID, label: CSV_EXPORT_LABEL, ...csv });
  }

  const newSpec: CommandSpec = newCommand === unbound && !(plan.new.mode === "button" && newButton) ? unbound : { ...newCommand, primary: !saveBound };
  const saveSpec: CommandSpec = sequenceBound ? { ...gatedAll([...new Set(sequenceKinds as string[])], () => deps.run.saveSequence()), primary: true }
    : saveBound ? { ...gatedQuery(saveId, saveKind!, () => deps.run.write(saveId, "save")), primary: true } : unbound;
  // Kaydet ve yeni: kayıt yolu ve Yeni bağlıysa çubukta Kaydet'in yanında bir düğme; Kaydet ya da Yeni çalışamıyorsa nedeniyle pasif.
  // `hiddenCommands`/`commandWhen` (`saveNew`) gizler; Kaydet ya da Yeni gizliyse o da gizlidir.
  if (props.saveAndNew === true && saveBound && newSpec !== unbound && deps.run.saveAndNew
    && !barCommandHidden(props, "saveNew", deps.commandVisible) && !barCommandHidden(props, "save", deps.commandVisible)
    && !barCommandHidden(props, "new", deps.commandVisible)) {
    const reason = saveSpec.disabledReason ?? newSpec.disabledReason;
    const saveAndNew = deps.run.saveAndNew;
    barItems.push({ id: SAVE_AND_NEW_COMMAND_ID, label: SAVE_AND_NEW_LABEL, shortcut: SAVE_AND_NEW_SHORTCUT, ...(reason ? { disabledReason: reason } : { run: () => saveAndNew() }) });
  }

  const built: PageCommands = {
    new: newSpec,
    open: openCommand,
    save: saveSpec,
    delete: !deleteBound ? unbound
      : !deps.queryAllowed(deleteId) ? { disabledReason: NO_RIGHT }
      : deps.rights.delete && deps.deleteNeedsSelection ? { disabledReason: NEEDS_SELECTION }
      : gated("delete", () => deps.run.write(deleteId, "delete")),
    refresh: { run: () => deps.run.refresh() },
    filter: focusId && (deps.inputIds.has(focusId) || deps.searchBarIds?.has(focusId)) ? { run: () => deps.run.focus(focusId) } : unbound,
    print: props.printEnabled === true ? { run: () => deps.run.print() } : unbound,
    export: exportHidden ? { hidden: true } : exportCommand,
    ...(more.length > 0 ? { more } : {}),
    ...(barItems.length > 0 ? { barItems } : {}),
  };
  return applyBarVisibility(props, built, deps.commandVisible);
}

/**
 * `hiddenCommands`, `commandWhen` ve `barLook` uygulanır. Gizli komut yalın `{ hidden: true }` olur: çubukta çizilmez, kısayolu
 * çalışmaz ve liste / ızgara kaynağı onu geri getiremez. Aç gizliyse satıra çift tıklama ve Enter da bir şey yapmaz
 * (`runtime.openCommand` yalnız etkin Aç'ı çalıştırır); Yeni gizliyse kayıt penceresindeki F2 de çalışmaz. `unbound=hide`:
 * bağlanmamış komut ("Bu sayfada bağlanmadı") soluk çizilmek yerine gizlenir; menüsü boş İşlemler de gizlenir. İşlemler
 * gizliyse menü öğeleri verilmez (düğmeleri sayfada kalır, bkz. `movedButtonIds`).
 */
function applyBarVisibility(props: Record<string, unknown>, built: PageCommands, commandVisible?: (id: BarCommandId) => boolean): PageCommands {
  const look = parseBarLook(props.barLook);
  const hideUnbound = look?.unbound === "hide";
  const result: PageCommands = { ...built };
  for (const id of STANDARD_BAR_IDS) {
    if (barCommandHidden(props, id as BarCommandId, commandVisible) || (hideUnbound && result[id]?.disabledReason === UNBOUND)) {
      result[id] = { hidden: true } satisfies CommandSpec;
    }
  }
  if (barCommandHidden(props, "more", commandVisible) || (hideUnbound && !result.more?.length)) {
    result.moreHidden = true;
    delete result.more;
  }
  if (look) result.look = look;
  return result;
}

const exportValue = (value: unknown): string | number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** Başlık satırı + sorgu satırları; seçili sütun yoksa (ya da hiçbiri geçerli değilse) tüm sütunlar. */
export function exportRows(
  columns: { code: string; label: string }[], rows: Record<string, unknown>[], chosen: string[],
): (string | number | null)[][] {
  const picked = chosen.flatMap((code) => columns.filter((column) => column.code === code));
  const used = picked.length > 0 ? picked : columns;
  return [used.map((column) => column.label || column.code), ...rows.map((row) => used.map((column) => exportValue(row[column.code])))];
}
