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
  return new Set(idList(bar.props.moreButtons, 10).filter((id) => { const button = buttons.get(id); return !button || hasAction(button); }));
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
  run: {
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
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

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

  const more = idList(props.moreButtons, 10).flatMap((id): MenuCommand[] => {
    const label = deps.buttonLabel(id);
    if (!label) return [];
    const gate = deps.buttonGate?.(id);
    if (gate?.hidden) return [];
    if (gate?.disabled) return [{ id, label, disabledReason: gate.disabledReason || BUTTON_UNAVAILABLE }];
    return [{ id, label, run: () => deps.run.button(id) }];
  });

  return {
    new: formDialog ? { run: () => formDialog.startNew(newIds[0]), primary: !saveBound }
      : newIds.length > 0
      ? { run: () => { deps.run.clearInputs(newIds); deps.run.focus(newIds[0]); }, primary: !saveBound }
      : unbound,
    open: !formDialog ? unbound : !formDialog.hasRecord ? { disabledReason: NEEDS_SELECTION }
      : formDialog.recordLoading ? { disabledReason: RECORD_LOADING }
      : formDialog.recordFailed ? { disabledReason: RECORD_UNREADABLE } : { run: () => formDialog.open() },
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
