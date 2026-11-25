import type { ReactNode } from "react";
import { fromConsultantText, toConsultantText, type FieldToken } from "./consultantText";
import { ComponentPanel, LegacySettings } from "./ComponentPanel";
import { AppearanceSection } from "./AppearanceSection";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { MAX_INFO_ITEMS, cleanItems, infoBoxOf, setHideOnMobile, setInfoBox, type InfoTone } from "./textPanelModel";

export const INFO_ITEMS_LABEL = "Maddeler (her satır bir madde)";
export const INFO_DISMISS_LIST_NOTE = "Madde listesi kapatılamaz.";
const TONES: [InfoTone, string][] = [["info", "Bilgi"], ["warning", "Uyarı"], ["success", "Başarılı"], ["plain", "Sade"]];
/** Panelin yazdığı özellikler ve ortak olanlar; ötekiler "Eski ayarlar" altında salt okunur görünür. */
export const INFO_KNOWN = new Set(["variant", "title", "text", "description", "items", "dismissible", "slot", "visibleWhen", "hideOnMobile"]);

export type InfoBoxPanelProps = {
  component: ModelComponent; definition: ModelDefinition; disabled?: boolean;
  /** Metindeki `{Alan}` ifadeleri için; verilmezse alan tanınmaz. */
  tokens?: FieldToken[];
  onChange: (next: ModelDefinition) => void; onRename: (name: string) => void; visibility?: ReactNode;
};

export function InfoBoxPanel({ component, definition, disabled, tokens = [], onChange, onRename, visibility }: InfoBoxPanelProps) {
  const box = infoBoxOf(component);
  const isList = component.type === "list";
  const shown = toConsultantText(box.text, tokens);
  const patch = (change: Parameters<typeof setInfoBox>[2]) => onChange(setInfoBox(definition, component.id, change));
  const what = <div className="cpanel-seg" role="group" aria-label="Tür">{TONES.map(([value, label]) =>
    <button type="button" key={value} className={box.tone === value ? "on" : ""} aria-pressed={box.tone === value} disabled={disabled}
      onClick={() => patch({ tone: value })}>{label}</button>)}</div>;
  const basics = <>
    <label className="cpanel-q">Başlık<input className="cpanel-txt" disabled={disabled} value={box.title} onChange={(event) => patch({ title: event.target.value })}/></label>
    <label className="cpanel-q">Metin<textarea className="cpanel-txt" rows={3} disabled={disabled} value={shown.text}
      onChange={(event) => patch({ text: fromConsultantText(event.target.value, tokens, box.text) })}/></label>
    {shown.unknown && <p className="cpanel-warn">Bu metinde tanınmayan bir alan var; kaydedersen korunur.</p>}
    <label className="cpanel-row">Madde listesi olarak göster<input type="checkbox" role="switch" checked={box.items !== null} disabled={disabled || isList}
      onChange={(event) => patch({ items: event.target.checked ? [] : null })}/></label>
    {box.items !== null && <label className="cpanel-q">{INFO_ITEMS_LABEL}<textarea className="cpanel-txt" rows={4} disabled={disabled} value={box.items.join("\n")}
      onChange={(event) => patch({ items: event.target.value.split("\n") })} onBlur={() => patch({ items: cleanItems(box.items ?? []) })}/><span className="cpanel-note">En çok {MAX_INFO_ITEMS} madde.</span></label>}
  </>;
  const extra = <>
    <label className="cpanel-row">Kullanıcı kapatabilsin<input type="checkbox" role="switch" checked={!isList && box.dismissible} disabled={disabled || isList}
      onChange={(event) => patch({ dismissible: event.target.checked })}/></label>
    {isList && <p className="cpanel-note">{INFO_DISMISS_LIST_NOTE}</p>}
  </>;
  const appearance = <AppearanceSection extra={extra} visibility={visibility} disabled={disabled} hideOnMobile={component.props.hideOnMobile === true}
    onHideOnMobile={(hide) => onChange(setHideOnMobile(definition, component.id, hide))}/>;
  return <ComponentPanel name={component.name ?? ""} onRename={onRename} whatTitle="Tür" what={what} basicsTitle={null} basics={basics}
    actions={<p className="cpanel-note">Bu bileşenin eylemi yok.</p>} appearance={appearance}>
    <LegacySettings props={component.props} known={INFO_KNOWN}/>
  </ComponentPanel>;
}
