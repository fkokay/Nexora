import type { PageCommands } from "../commands/types";
import { idList } from "./layoutRefs";

/** İşlem Çubuğu (`actionBar`) bileşeninin komut kuralları: saf işlevler, React'e bağlı değildir. */

type Component = { id: string; type: string; props?: Record<string, unknown> };

const UNBOUND = "Bu sayfada bağlanmadı";
const NO_RIGHT = "Bu işlem için yetkiniz yok";
const BUSY = "İşlem sürüyor…";
const TABLE_LOADING = "Liste henüz yüklenmedi";

/** Düzleştirilmiş bileşen dizisindeki ilk `actionBar`. */
export function actionBarOf(components: Component[]): { id: string; props: Record<string, unknown> } | null {
  const bar = components.find((component) => component.type === "actionBar");
  return bar ? { id: bar.id, props: bar.props ?? {} } : null;
}

/** `actionBar.moreButtons` ile İşlemler menüsüne taşınan düğme kimlikleri (sayfada ayrıca çizilmez). */
export function movedButtonIds(components: Component[]): Set<string> {
  const bar = actionBarOf(components);
  return new Set(bar ? idList(bar.props.moreButtons, 10) : []);
}

export type PageActionDeps = {
  rights: Record<string, boolean | undefined>;
  busy: boolean;
  queryKind: (id: string) => string | undefined;
  inputIds: Set<string>;
  tableState: (tableId: string) => { loading: boolean; error?: string; rowCount: number } | undefined;
  buttonLabel: (id: string) => string | undefined;
  run: {
    clearInputs(ids: string[]): void;
    write(queryId: string, kind: "save" | "delete"): void;
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
  const saveBound = saveKind === "insert" || saveKind === "update";
  const deleteId = str(props.deleteQuery);
  const deleteBound = !!deleteId && deps.queryKind(deleteId) === "delete";
  const newIds = idList(props.newInputs).filter((id) => deps.inputIds.has(id));
  const focusId = str(props.focusInput);
  const exportId = str(props.exportTable);
  const exportState = exportId ? deps.tableState(exportId) : undefined;

  const gated = (right: string, run: () => void) =>
    !deps.rights[right] ? { disabledReason: NO_RIGHT } : deps.busy ? { disabledReason: BUSY } : { run };

  const more = idList(props.moreButtons, 10).flatMap((id) => {
    const label = deps.buttonLabel(id);
    return label ? [{ id, label, run: () => deps.run.button(id) }] : [];
  });

  return {
    new: newIds.length > 0
      ? { run: () => { deps.run.clearInputs(newIds); deps.run.focus(newIds[0]); }, primary: !saveBound }
      : unbound,
    open: unbound,
    save: saveBound ? { ...gated(saveKind!, () => deps.run.write(saveId, "save")), primary: true } : unbound,
    delete: deleteBound ? gated("delete", () => deps.run.write(deleteId, "delete")) : unbound,
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
