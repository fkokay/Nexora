import type { MenuCommand, PageCommands } from "../commands/types";
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

/** `actionBar.moreButtons` ile İşlemler menüsüne taşınan düğme kimlikleri (sayfada ayrıca çizilmez). */
export function movedButtonIds(components: Component[], hasAction: (button: Component) => boolean = () => true): Set<string> {
  const bar = actionBarOf(components);
  if (!bar) return new Set();
  // Kullanılabilir eylemi olmayan düğme (sorgu yok / iş akışı boş) menüye de girmez; sayfada kalır, kaybolmaz.
  const buttons = new Map(components.filter((component) => component.type === "button").map((component) => [component.id, component]));
  const moved = idList(bar.props.moreButtons, 10).filter((id) => { const button = buttons.get(id); return !button || hasAction(button); });
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
  tableState: (tableId: string) => { loading: boolean; error?: string; rowCount: number } | undefined;
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
  run: {
    /** Yeni / Aç'ın açtığı sayfa: "Sayfa aç" düğmesiyle aynı gezinme yolu. */
    navigate?(page: BarPageNavigation): void;
    clearInputs(ids: string[]): void;
    write(queryId: string, kind: "save" | "delete"): void;
    /** İşlem Çubuğu `saveSequence` kayıt dizisini çalıştırır. */
    saveSequence(): void;
    refresh(): void;
    focus(inputId: string): void;
    print(): void;
    exportTable(tableId: string): void;
    button(id: string): void;
  };
};

const unbound = { disabledReason: UNBOUND };

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
  const exportState = exportId ? deps.tableState(exportId) : undefined;

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

  const more = idList(props.moreButtons, 10).flatMap((id): MenuCommand[] => {
    const label = deps.buttonLabel(id);
    if (!label) return [];
    const gate = deps.buttonGate?.(id);
    if (gate?.hidden) return [];
    if (gate?.disabled) return [{ id, label, disabledReason: gate.disabledReason || BUTTON_UNAVAILABLE }];
    return [{ id, label, run: () => deps.run.button(id) }];
  });

  return {
    new: newCommand === unbound && !(plan.new.mode === "button" && newButton) ? unbound : { ...newCommand, primary: !saveBound },
    open: openCommand,
    save: sequenceBound ? { ...gatedAll([...new Set(sequenceKinds as string[])], () => deps.run.saveSequence()), primary: true }
      : saveBound ? { ...gatedQuery(saveId, saveKind!, () => deps.run.write(saveId, "save")), primary: true } : unbound,
    delete: !deleteBound ? unbound
      : !deps.queryAllowed(deleteId) ? { disabledReason: NO_RIGHT }
      : deps.rights.delete && deps.deleteNeedsSelection ? { disabledReason: NEEDS_SELECTION }
      : gated("delete", () => deps.run.write(deleteId, "delete")),
    refresh: { run: () => deps.run.refresh() },
    filter: focusId && deps.inputIds.has(focusId) ? { run: () => deps.run.focus(focusId) } : unbound,
    print: props.printEnabled === true ? { run: () => deps.run.print() } : unbound,
    export: !exportState ? unbound
      : exportState.loading ? { disabledReason: TABLE_LOADING }
      : exportState.error ? { disabledReason: exportState.error }
      : { run: () => deps.run.exportTable(exportId) },
    ...(more.length > 0 ? { more } : {}),
  };
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
