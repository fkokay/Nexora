import { readPageTemplate } from "../pageTemplates";
import type { ReactNode } from "react";
import type { ActiveCatalog, CatalogDataSource } from "../catalogClient";
import type { ErpOperation } from "../erpOperations";
import { ComponentPanel, LegacySettings } from "./ComponentPanel";
import { AppearanceSection } from "./AppearanceSection";
import {
  chooseIndicatorSource, countColumnOf, indicatorOf, indicatorPlaces, indicatorSourceUsable, setIndicatorCompare, setIndicatorKind, setIndicatorPlace, setIndicatorSize,
  setIndicatorTotal, setIndicatorValue, type IndicatorKind, type IndicatorPlace, type IndicatorSize,
} from "./indicatorPanelModel";
import { withOperationParameters, type ModelComponent, type ModelDefinition, type OperationListStatus } from "./listPanelModel";
import { setHideOnMobile } from "./textPanelModel";

export const INDICATOR_MISSING_IN_CATALOG = "Katalogda yok";
export const INDICATOR_DELETED_SOURCE = "Silinmiş kaynak";
export const INDICATOR_DELETED_COLUMN = "Silinmiş alan";
export const INDICATOR_DEV_NOTE = "Yazılımcının hazırladığı değer · birimi ondan gelir";
const KINDS: [IndicatorKind, string][] = [["number", "Sayı"], ["progress", "İlerleme"], ["status", "Durum"]];
const PLACES: [IndicatorPlace, string][] = [["indicators", "Göstergeler"], ["above", "Listenin üstü"], ["below", "Listenin altı"]];
const RECORD_PLACES: Partial<Record<IndicatorPlace, string>> = { above: "Kartın üstü", below: "Kartın altı" };
const SIZES: [IndicatorSize, string][] = [["sm", "Küçük"], ["lg", "Büyük"]];
const NO_INDICATORS_NOTE: Record<string, string> = {
  progress: "İlerleme göstergeler sırasına konamaz; listenin üstünde ya da altında durur.",
  badge: "Durum göstergeler sırasına konamaz; listenin üstünde ya da altında durur.",
};
const COMMON = ["title", "slot", "visibleWhen", "hideOnMobile"];
/** Panelin yazdığı özellikler (türe göre) ve ortak olanlar; ötekiler "Eski ayarlar" altında salt okunur görünür. */
/** `countWhen` yalnız Studio'nun yazdığı "Kayıt sayısı" koşuluysa panelindir; başka bir koşul "Eski ayarlar"da görünür. */
const knownOf = (type: string, counted: boolean) => new Set([...COMMON, ...(type === "metric" ? ["query", "value", "format", "compareValue", "size", ...(counted ? ["countWhen"] : [])]
  : type === "progress" ? ["value", "progressTotal"] : ["text"])]);

export type IndicatorPanelProps = {
  component: ModelComponent; definition: ModelDefinition;
  /** Etkin katalog; `null` etkin sürüm yok demektir. */
  catalog: ActiveCatalog | null; catalogStatus: "loading" | "ready" | "failed";
  operationOf: (name: string | null) => ErpOperation | undefined; operationsStatus?: OperationListStatus;
  disabled?: boolean; onChange: (next: ModelDefinition) => void; onRename: (name: string) => void;
  /** "Ne zaman görünsün?" alanı (`VisibilityField` düğümü). */
  visibility?: ReactNode;
};

export function IndicatorPanel({ component, definition, catalog, catalogStatus, operationOf, operationsStatus, disabled, onChange, onRename, visibility }: IndicatorPanelProps) {
  const state = indicatorOf(definition, component.id);
  const sources = (catalog?.dataSources ?? []).map((item) => withOperationParameters(item, operationOf(item.erpOperation), false, operationsStatus));
  const source = sources.find((item) => item.code === state.source);
  const change = (next: ModelDefinition) => { if (!disabled && next !== definition) onChange(next); };
  const typeOf = (column: string) => source?.columns.find((item) => item.code === column)?.type;
  const id = component.id;

  const switchKind = (kind: IndicatorKind) => {
    let next = setIndicatorKind(definition, id, kind);
    // Kaynak ve kolon yeni türde de geçerli kalsın: sayım yolu kolonsuzdur, kolon yolunda biçim kolon türünden yeniden gelir.
    if (source && state.column === "count" && kind !== "number") next = chooseIndicatorSource(next, id, source);
    else if (source && kind === "number" && state.column && state.column !== "count") next = setIndicatorValue(next, id, state.column, typeOf(state.column));
    change(next);
  };
  const countColumn = source ? countColumnOf(source) : null;
  const choose = (value: string) => change(value === "count" ? setIndicatorValue(definition, id, "count", undefined, countColumn) : setIndicatorValue(definition, id, value, typeOf(value)));
  const firstOther = source?.columns.find((item) => item.code !== state.column)?.code ?? source?.columns[0]?.code;

  const columnOptions = (current: string | null, withCount: boolean) => <>
    {withCount && (countColumn || current === "count") && <option value="count">Kayıt sayısı</option>}
    {source?.columns.map((column) => <option key={column.code} value={column.code}>{column.label}</option>)}
    {current && current !== "count" && source && !source.columns.some((column) => column.code === current) && <option value={current}>{`${INDICATOR_DELETED_COLUMN} · ${INDICATOR_MISSING_IN_CATALOG}`}</option>}
  </>;

  const what = <>
    <div className="cpanel-seg" role="group" aria-label="Tür">{KINDS.map(([value, label]) =>
      <button type="button" key={value} className={state.kind === value ? "on" : ""} aria-pressed={state.kind === value} disabled={disabled}
        onClick={() => switchKind(value)}>{label}</button>)}</div>
    <div className="cpanel-q">Ne gösterilsin?</div>
    {catalogStatus === "loading" ? <p className="cpanel-note">Katalog yükleniyor…</p>
      : catalogStatus === "failed" ? <p className="cpanel-warn">Katalog okunamadı.</p>
        : !catalog ? <p className="cpanel-note">Etkin katalog sürümü yok; gösterge için yazılımcıdan bir veri kaynağı isteyin.</p>
          : <ul className="cpanel-sources" aria-label="Veri kaynakları">{sources.map((item: CatalogDataSource) => {
            const usable = indicatorSourceUsable(item);
            const on = item.code === state.source;
            return <li key={item.code} className={`${on ? "on" : ""}${usable.usable ? "" : " is-dim"}`}>
              <label><input type="radio" name={`gosterge-kaynak-${id}`} checked={on} disabled={disabled || !usable.usable}
                onChange={() => change(chooseIndicatorSource(definition, id, item))}/>{item.label}</label>
              {!usable.usable && <small>{usable.reason}</small>}
            </li>;
          })}{state.source && !source && <li className="on is-missing"><label><input type="radio" checked readOnly disabled/>{INDICATOR_DELETED_SOURCE}</label><small>{INDICATOR_MISSING_IN_CATALOG}</small></li>}</ul>}
  </>;

  const hasSource = state.source !== null;
  const basics = <>
    {hasSource && <>
      <label className="cpanel-q">Değer
        <select value={state.column ?? ""} disabled={disabled || !source} onChange={(event) => choose(event.target.value)}>
          {state.column === null && <option value="" disabled>Seçin</option>}
          {columnOptions(state.column, state.kind === "number")}
        </select></label>
      <div className="cpanel-dev">{INDICATOR_DEV_NOTE}</div>
    </>}
    {hasSource && state.kind === "number" && <>
      <label className="cpanel-row">Önceki değerle karşılaştır<input type="checkbox" role="switch" checked={state.compareColumn !== null}
        disabled={disabled || !source || state.column === "count" || state.column === null}
        onChange={(event) => change(setIndicatorCompare(definition, id, event.target.checked ? firstOther ?? null : null))}/></label>
      {state.compareColumn !== null && <label className="cpanel-q">Neyle karşılaştırılsın?
        <select value={state.compareColumn} disabled={disabled || !source} onChange={(event) => change(setIndicatorCompare(definition, id, event.target.value))}>
          {columnOptions(state.compareColumn, false)}
        </select></label>}
    </>}
    {hasSource && state.kind === "progress" && <label className="cpanel-q">Hedef (isteğe bağlı)
      <select value={state.totalColumn ?? ""} disabled={disabled || !source} onChange={(event) => change(setIndicatorTotal(definition, id, event.target.value || null))}>
        <option value="">Yok</option>{columnOptions(state.totalColumn, false)}
      </select></label>}
  </>;
  // "Yeri" Ad bölümünün altında (Metin, Bilgi kutusu ve Görsel ile aynı); seçenekler `indicatorPlaces`'ten gelir.
  const record = readPageTemplate(definition.template)?.name === "record";
  const place = <div className="cpanel-row cpanel-template-place">Yeri
    <div className="cpanel-seg" role="group" aria-label="Yeri">{PLACES.filter(([value]) => indicatorPlaces(definition, component).includes(value)).map(([value, listLabel]) =>
      <button type="button" key={value} className={component.props.slot === value ? "on" : ""} aria-pressed={component.props.slot === value} disabled={disabled}
        onClick={() => change(setIndicatorPlace(definition, id, value))}>{(record && RECORD_PLACES[value]) || listLabel}</button>)}</div>
    {NO_INDICATORS_NOTE[component.type] && <p className="cpanel-note">{NO_INDICATORS_NOTE[component.type]}</p>}
  </div>;

  const extra = state.kind === "number"
    ? <div className="cpanel-row">Boyut<div className="cpanel-seg" role="group" aria-label="Boyut">{SIZES.map(([value, label]) =>
      <button type="button" key={value} className={state.size === value ? "on" : ""} aria-pressed={state.size === value} disabled={disabled}
        onClick={() => change(setIndicatorSize(definition, id, value))}>{label}</button>)}</div></div>
    : undefined;
  const appearance = <AppearanceSection extra={extra} visibility={visibility} disabled={disabled} hideOnMobile={component.props.hideOnMobile === true}
    onHideOnMobile={(hide) => change(setHideOnMobile(definition, id, hide))}/>;
  return <ComponentPanel name={component.name ?? ""} namePlaceholder="Gösterge" nameReadOnly onRename={onRename} place={place} whatTitle="Tür" what={what} basicsTitle={null} basics={basics}
    actions={<p className="cpanel-note">Bu bileşenin eylemi yok.</p>} appearance={appearance}>
    <LegacySettings props={component.props} known={knownOf(component.type, state.column === "count")}/>
  </ComponentPanel>;
}