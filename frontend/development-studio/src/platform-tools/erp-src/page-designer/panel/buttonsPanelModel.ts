// Butonlar panelinin saf modeli (alt proje 5a, Karar 6). Ekleme ve kaldırma `listPanelModel` işlevlerindedir; burada yalnız
// grup okuma, ana buton ve çip anahtarı vardır. Her işlev yeni bir tanım döner, girdiyi değiştirmez.
import type { CatalogAction } from "../catalogClient";
import { actionUsableAt, addListAction, placedActions, removeListAction, type ActionPlace, type ModelComponent, type ModelDefinition, type Usable } from "./listPanelModel";

export type ButtonSlot = "actions" | "rowActions";
export const PRIMARY_NOT_DELETE = "Silme eylemi ana buton olamaz.";
export const BUTTONS_WHERE_NOTE = "Sil gibi geri alınamayan eylemler otomatik olarak en sağda durur. Dar ekranda ana buton dışındakiler “⋯” menüsüne girer.";

/** Yerdeki düğmeler, kayıt sırasıyla. */
export function slotButtons(def: ModelDefinition, slot: ButtonSlot): ModelComponent[] {
  return def.components.filter((c) => c.type === "button" && c.props.slot === slot);
}

export const isDeleteButton = (def: ModelDefinition, c: ModelComponent): boolean =>
  def.queries.find((query) => query.id === c.props.queryId)?.kind === "delete";

/** `actions` yerinde seçilen düğmeyi o yerin ilk sırasına taşır; öteki bileşenlerin sırası değişmez. Silme düğmesi ya da başka yer için tanım aynen döner. */
export function setPrimaryButton<D extends ModelDefinition>(def: D, buttonId: string): D {
  const chosen = def.components.find((c) => c.id === buttonId);
  if (!chosen || chosen.type !== "button" || chosen.props.slot !== "actions" || isDeleteButton(def, chosen)) return def;
  const first = slotButtons(def, "actions")[0];
  if (!first || first.id === buttonId) return def;
  const rest = def.components.filter((c) => c.id !== buttonId);
  const at = rest.findIndex((c) => c.id === first.id);
  return { ...def, components: [...rest.slice(0, at), chosen, ...rest.slice(at)] };
}

export const placeOf = (slot: ButtonSlot): ActionPlace => (slot === "actions" ? "above" : "row");

/** Çip durumu: eylem o yerde yerleşik mi ve eklenebilir mi (gerekçesiyle). */
export function actionChipState(def: ModelDefinition, listId: string, action: CatalogAction, listColumns: string[], place: ActionPlace): { on: boolean; usable: Usable } {
  const placed = placedActions(def, listId);
  return { on: (place === "row" ? placed.row : placed.above).includes(action.code), usable: actionUsableAt(action, listColumns, place) };
}

/** Çipe tıklama: yerleşikse kaldırır, değilse ekler; ikisi de Liste panelindeki kurallarla aynıdır. */
export function toggleButtonAction<D extends ModelDefinition>(def: D, listId: string, action: CatalogAction, listColumns: string[], place: ActionPlace): D {
  const { on } = actionChipState(def, listId, action, listColumns, place);
  return on ? removeListAction(def, listId, action.code, place) : addListAction(def, listId, action, place);
}
