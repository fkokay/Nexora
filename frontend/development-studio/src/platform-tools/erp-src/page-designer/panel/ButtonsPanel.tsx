import type { CatalogAction } from "../catalogClient";
import type { ActiveCatalog } from "../catalogClient";
import { ComponentPanel, ProvidedByDeveloper } from "./ComponentPanel";
import { BUTTONS_WHERE_NOTE, isDeleteButton, placeOf, setPrimaryButton, slotButtons, toggleButtonAction, actionChipState, type ButtonSlot } from "./buttonsPanelModel";
import { listDataSourceCode, type ModelComponent, type ModelDefinition } from "./listPanelModel";

export type ButtonsPanelProps = {
  /** Seçili düğme; panel onun yerindeki (`actions` ya da `rowActions`) bütün düğmeleri bir grup olarak gösterir. */
  component: ModelComponent; definition: ModelDefinition; listId: string;
  catalog: ActiveCatalog | null; disabled?: boolean;
  onChange: (next: ModelDefinition) => void;
};

export function ButtonsPanel({ component, definition, listId, catalog, disabled, onChange }: ButtonsPanelProps) {
  const slot: ButtonSlot = component.props.slot === "rowActions" ? "rowActions" : "actions";
  const place = placeOf(slot);
  const source = catalog?.dataSources.find((item) => item.code === listDataSourceCode(definition, listId));
  const listColumns = source?.columns.map((column) => column.code) ?? [];
  const actions = (catalog?.actions ?? []).filter((action) => place === "row" ? action.target === "row" : true);
  const group = slotButtons(definition, slot);
  const choices = group.filter((button) => !isDeleteButton(definition, button));
  const primary = slot === "actions" && group[0] && !isDeleteButton(definition, group[0]) ? group[0].id : "";

  const what = <>
    {actions.length === 0 ? <p className="cpanel-note">Yazılımcının hazırladığı eylem yok.</p>
      : <div className="cpanel-chips">{actions.map((action: CatalogAction) => {
        const { on, usable } = actionChipState(definition, listId, action, listColumns, place);
        return <button type="button" key={action.code} className={`cpanel-chip${on ? " on" : ""}`} aria-pressed={on}
          disabled={disabled || !source || (!on && !usable.usable)} title={usable.usable ? undefined : usable.reason}
          onClick={() => onChange(toggleButtonAction(definition, listId, action, listColumns, place))}>
          {action.label}{!usable.usable && !on && <small> · {usable.reason}</small>}</button>;
      })}</div>}
    <ProvidedByDeveloper>Eylemleri yazılımcı hazırlar · onay sorusu ve yetki ondan gelir</ProvidedByDeveloper>
  </>;
  const basics = slot === "actions"
    ? <label className="cpanel-row">Ana buton (vurgulu)<select aria-label="Ana buton" disabled={disabled || choices.length === 0} value={primary}
      onChange={(event) => onChange(setPrimaryButton(definition, event.target.value))}>
      {!primary && <option value="">Seçin</option>}
      {choices.map((button) => <option key={button.id} value={button.id}>{String(button.props.text ?? button.id)}</option>)}</select></label>
    : null;
  const where = <>
    <div className="cpanel-q">Nerede?</div>
    <p className="cpanel-note">{BUTTONS_WHERE_NOTE}</p>
  </>;
  return <ComponentPanel name="Butonlar" nameReadOnly nameLabel="Grup adı" onRename={() => {}} whatTitle="Hangi eylemler?" what={what}
    basicsTitle={slot === "actions" ? "Ana buton" : null} basics={basics} actions={where}
    appearance={<p className="cpanel-note">Her düğmenin görünürlüğü eylemin yetkisinden gelir.</p>}/>;
}
