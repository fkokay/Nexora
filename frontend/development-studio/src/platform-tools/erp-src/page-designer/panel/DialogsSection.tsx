import { useState } from "react";
import { X } from "lucide-react";
import type { ActiveCatalog } from "../catalogClient";
import { sizeOf, TEMPLATE_DIALOG_SIZES } from "../DialogLookFields";
import { sanitizeSafeValue } from "../DesignLanguageFields";
import { iterationOf } from "../erpOperations";
import type { PageQuery } from "../QueriesPanel";
import { addDialog, dialogOpeners, dialogsOf, removeDialog, setDialogContents } from "./dialogsModel";
import { DraftInput } from "./DraftInput";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import "./component-panel.css";

export type DialogsSectionProps = {
  def: ModelDefinition;
  /** Etkin katalog: Kaydet eylemi ve yenilenecek verilerin adları; `null` etkin sürüm yok demektir (sorgu adı gösterilir). */
  catalog: ActiveCatalog | null;
  disabled?: boolean;
  onChange: (next: ModelDefinition) => void;
  /**
   * Tuvalde açık tutulan pencere (sayfa tutarsa bölüm yeniden açıldığında seçim korunur); verilmezse seçim bölümün içindedir.
   * `onShowDialog` seçimde pencerenin kimliğiyle, seçim kalkınca `null` ile çağrılır (tuval `showDialog` yollar).
   */
  shownDialog?: string | null;
  onShowDialog?: (dialogId: string | null) => void;
};

const MAX_TITLE = 120;
/** Sunucu: `saveLabel` en çok 40 karakter. */
const MAX_SAVE_LABEL = 40;
const MAX_REFRESH_QUERIES = 10;
const NO_SAVE = "Yok (görünüm penceresi)";
const SEQUENCE = "Kayıt dizisi";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const sizeLabel = (value: unknown) => TEMPLATE_DIALOG_SIZES.find(([option]) => option === sizeOf(value))?.[1] ?? sizeOf(value);
const isForm = (dialog: ModelComponent) => text(dialog.props.saveQuery) !== "" || strings(dialog.props.saveSequence).length > 0;
const dialogTitle = (dialog: ModelComponent) => text(dialog.props.title) || dialog.name || dialog.id;
const componentLabel = (component: ModelComponent | undefined, id: string) =>
  component ? text(component.props.title) || text(component.props.text) || text(component.props.label) || component.name || id : id;

/**
 * Kalıplı sayfanın Pencereler bölümü (taslak 12): her pencere bir satır (başlık, boyut, görünüm / form); satır seçilince tuvalde
 * açılır ve ayarları görünür. İçerik yalnız sıralanır; pencerenin iskeleti ERP'de sabittir. Bütün yazımlar `dialogsModel`'den ya da
 * pencerenin eski adlı ayarlarından geçer (`presentation` kalıpta yalnız `dialog`).
 */
export function DialogsSection(props: DialogsSectionProps) {
  const { def, catalog, disabled } = props;
  const [ownSelection, setOwnSelection] = useState<string | null>(null);
  const controlled = props.shownDialog !== undefined;
  const dialogs = dialogsOf(def.components);
  const selectedId = controlled ? props.shownDialog ?? null : ownSelection;
  const selected = dialogs.find((dialog) => dialog.id === selectedId) ?? null;
  const openers = selected ? dialogOpeners(def, selected.id) : [];
  const select = (id: string | null) => {
    if (!controlled) setOwnSelection(id);
    props.onShowDialog?.(id);
  };
  const changeComponents = (components: ModelComponent[]) => { if (!disabled && components !== def.components) props.onChange({ ...def, components }); };

  return <section className="cpanel-sec" data-part="dialogs"><h4>Pencereler</h4>
    <div className="cpanel-chips" role="list" aria-label="Pencereler">{dialogs.map((dialog) => {
      const on = dialog.id === selected?.id;
      return <div role="listitem" key={dialog.id}><button type="button" data-part="dialog-row" className={`cpanel-chip${on ? " on" : ""}`} aria-pressed={on}
        onClick={() => select(on ? null : dialog.id)}>{dialogTitle(dialog)}<small>{` ${sizeLabel(dialog.props.size)} · ${isForm(dialog) ? "form" : "görünüm"}`}</small></button></div>;
    })}</div>
    <button type="button" className="cpanel-btn" disabled={disabled} onClick={() => {
      if (disabled) return;
      const added = addDialog(def.components, def.queries);
      props.onChange({ ...def, components: added.components });
      select(added.dialogId);
    }}>+ Pencere ekle</button>
    {selected && <>
      {openers.length > 0 && <p className="cpanel-note">{`Açan düğmeler: ${openers.join(", ")}`}</p>}
      {/* Açan düğmesi olan pencere kaldırılamaz: sunucu var olmayan pencereyi açan düğmeyi reddeder. */}
      <DialogSettings key={selected.id} def={def} dialog={selected} catalog={catalog} disabled={disabled} removable={openers.length === 0} onChange={changeComponents}
        onRemove={() => { changeComponents(removeDialog(def.components, selected.id)); select(null); }}/>
    </>}
  </section>;
}

function DialogSettings({ def, dialog, catalog, disabled, removable, onChange, onRemove }: {
  def: ModelDefinition; dialog: ModelComponent; catalog: ActiveCatalog | null; disabled?: boolean; removable: boolean;
  onChange: (components: ModelComponent[]) => void; onRemove: () => void;
}) {
  const props = dialog.props;
  /** `undefined` değer ayarı siler (varsayılanlar yazılmaz; eski pencere ayarlarıyla aynı). */
  const patch = (values: Record<string, ModelComponent["props"][string] | undefined>) => {
    const next = { ...props };
    for (const [key, value] of Object.entries(values)) { if (value === undefined) delete next[key]; else next[key] = value; }
    onChange(def.components.map((component) => component === dialog ? { ...component, props: next } : component));
  };
  const queryLabel = (query: PageQuery) => (query.action ? catalog?.actions.find((action) => action.code === query.action)?.label : undefined)
    ?? (query.dataSource ? catalog?.dataSources.find((source) => source.code === query.dataSource)?.label : undefined) ?? query.name;
  // Tek sorgu: eski pencere ayarındaki gibi ızgara satırlarını dolaşmayan ekleme / güncelleme sorguları.
  const saveCandidates = def.queries.filter((query) => (query.kind === "insert" || query.kind === "update") && !iterationOf(query));
  const readQueries = def.queries.filter((query) => query.kind === "read");
  const saveQuery = text(props.saveQuery);
  const sequence = strings(props.saveSequence);
  const refresh = strings(props.refreshQueries).filter((id) => readQueries.some((query) => query.id === id));
  const refreshOptions = readQueries.filter((query) => !refresh.includes(query.id));
  const size = sizeOf(props.size);
  const contains = strings(props.contains);
  const byId = new Map(def.components.map((component) => [component.id, component]));
  const move = (index: number, delta: -1 | 1) => {
    const next = [...contains];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(setDialogContents(def.components, dialog.id, next));
  };

  return <div className="cpanel-sub" data-part="dialog-settings"><h4>Pencere ayarları</h4>
    <DraftInput label="Başlık" value={text(props.title)} maxLength={MAX_TITLE} disabled={disabled} onCommit={(value) => patch({ title: value.trim() || undefined })}/>
    <div className="cpanel-row">Boyut<div className="cpanel-seg" role="group" aria-label="Boyut">{TEMPLATE_DIALOG_SIZES.map(([option, label]) =>
      <button type="button" key={option} className={size === option ? "on" : ""} aria-pressed={size === option} disabled={disabled}
        onClick={() => { if (size !== option) patch({ size: option === "md" ? undefined : option }); }}>{label}</button>)}</div></div>
    <label className="cpanel-row">Kaydet eylemi
      <select aria-label="Kaydet eylemi" value={sequence.length > 0 ? "__sequence" : saveQuery} disabled={disabled} onChange={(event) => {
        const value = event.target.value;
        if (value === "__sequence") return;
        // "Yok": görünüm penceresinde Kaydet düğmesi yok; etiketi ve "Kaydedince kapat" da kalkar.
        patch(value ? { saveQuery: value, saveSequence: undefined, sequenceWhen: undefined, stopOnError: undefined }
          : { saveQuery: undefined, saveSequence: undefined, sequenceWhen: undefined, stopOnError: undefined, saveLabel: undefined, closeOnSave: undefined });
      }}>
        <option value="">{NO_SAVE}</option>
        {sequence.length > 0 && <option value="__sequence">{SEQUENCE}</option>}
        {saveCandidates.map((query) => <option key={query.id} value={query.id}>{queryLabel(query)}</option>)}
        {saveQuery && !saveCandidates.some((query) => query.id === saveQuery) && <option value={saveQuery}>{saveQuery}</option>}
      </select></label>
    {(saveQuery !== "" || sequence.length > 0) && <DraftInput label="Kaydet düğmesinin etiketi" value={text(props.saveLabel)} maxLength={MAX_SAVE_LABEL}
      disabled={disabled} onCommit={(value) => patch({ saveLabel: sanitizeSafeValue(value, false).slice(0, MAX_SAVE_LABEL).trim() || undefined })}/>}
    <label className="cpanel-row">Kaydedince kapat<input type="checkbox" aria-label="Kaydedince kapat" checked={props.closeOnSave !== false} disabled={disabled}
      onChange={(event) => patch({ closeOnSave: event.target.checked ? undefined : false })}/></label>
    <label className="cpanel-row">Açılışta alanları temizle<input type="checkbox" aria-label="Açılışta alanları temizle" checked={props.resetOnOpen !== false} disabled={disabled}
      onChange={(event) => patch({ resetOnOpen: event.target.checked ? undefined : false })}/></label>
    <div className="cpanel-q">Kayıttan sonra yenilenecek veriler</div>
    <div className="cpanel-chips">
      {refresh.map((id) => { const query = readQueries.find((item) => item.id === id)!;
        return <button type="button" key={id} className="cpanel-chip on" aria-label={`${queryLabel(query)} kaldır`} disabled={disabled}
          onClick={() => patch({ refreshQueries: refresh.length > 1 ? refresh.filter((item) => item !== id) : undefined })}>{queryLabel(query)} <X size={11}/></button>; })}
      <select className="cpanel-add" aria-label="Kayıttan sonra yenilenecek veriler" value=""
        disabled={disabled || refreshOptions.length === 0 || refresh.length >= MAX_REFRESH_QUERIES}
        onChange={(event) => { if (event.target.value) patch({ refreshQueries: [...refresh, event.target.value] }); }}>
        <option value="">+ ekle</option>
        {refreshOptions.map((query) => <option key={query.id} value={query.id}>{queryLabel(query)}</option>)}
      </select>
    </div>
    <div className="cpanel-q">İçerik (sırası)</div>
    <ol className="cpanel-steps" data-part="dialog-contents">{contains.map((id, index) => {
      const label = componentLabel(byId.get(id), id);
      return <li key={id} className="cpanel-row"><span>{label}</span>
        <span className="cpanel-seg">
          <button type="button" aria-label={`${label} yukarı`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button>
          <button type="button" aria-label={`${label} aşağı`} disabled={disabled || index === contains.length - 1} onClick={() => move(index, 1)}>↓</button>
        </span></li>;
    })}</ol>
    <button type="button" className="cpanel-btn danger" disabled={disabled || !removable} onClick={onRemove}>Kaldır</button>
  </div>;
}
