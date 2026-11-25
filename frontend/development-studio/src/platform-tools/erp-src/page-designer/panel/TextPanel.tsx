import type { ReactNode } from "react";
import { fromConsultantText, toConsultantText, type FieldToken } from "./consultantText";
import { ComponentPanel, LegacySettings } from "./ComponentPanel";
import { AppearanceSection } from "./AppearanceSection";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { setHideOnMobile, setTextAlign, setTextContent, setTextStyle, textStyleOf, type TextStyle } from "./textPanelModel";

export const TEXT_FIELD_NOTE = "Metin içine alan koymak için { yazın, örn. {Cari kodu}.";
export const UNKNOWN_FIELD_WARNING = "Bu metinde tanınmayan bir alan var; kaydedersen korunur.";
const STYLES: [TextStyle, string][] = [["heading", "Başlık"], ["subheading", "Alt başlık"], ["paragraph", "Paragraf"], ["label", "Küçük etiket"]];
const ALIGNS: [string, "start" | "center"][] = [["Sol", "start"], ["Orta", "center"]];
/** Panelin yazdığı özellikler ve ortak olanlar; ötekiler "Eski ayarlar" altında salt okunur görünür. */
export const TEXT_KNOWN = new Set(["text", "title", "textAlign", "slot", "visibleWhen", "hideOnMobile"]);

export type TextPanelProps = {
  component: ModelComponent; definition: ModelDefinition; tokens: FieldToken[]; disabled?: boolean;
  onChange: (next: ModelDefinition) => void; onRename: (name: string) => void;
  /** "Ne zaman görünsün?" alanı (`VisibilityField` düğümü). */
  visibility?: ReactNode;
};

export function TextPanel({ component, definition, tokens, disabled, onChange, onRename, visibility }: TextPanelProps) {
  const style = textStyleOf(component);
  const stored = String((component.type === "section" ? component.props.title : component.props.text) ?? "");
  const shown = toConsultantText(stored, tokens);
  const align = component.props.textAlign === "center" ? "center" : "start";
  const what = <div className="cpanel-seg" role="group" aria-label="Stil">{STYLES.map(([value, label]) =>
    <button type="button" key={value} className={style === value ? "on" : ""} aria-pressed={style === value} disabled={disabled}
      onClick={() => onChange(setTextStyle(definition, component.id, value))}>{label}</button>)}</div>;
  const basics = <>
    <textarea className="cpanel-txt" rows={4} aria-label="Metin" disabled={disabled} value={shown.text}
      onChange={(event) => onChange(setTextContent(definition, component.id, fromConsultantText(event.target.value, tokens, stored)))}/>
    <p className="cpanel-note">{TEXT_FIELD_NOTE}</p>
    {shown.unknown && <p className="cpanel-warn">{UNKNOWN_FIELD_WARNING}</p>}
  </>;
  const extra = <div className="cpanel-row">Hizalama<div className="cpanel-seg" role="group" aria-label="Hizalama">{ALIGNS.map(([label, value]) =>
    <button type="button" key={value} className={align === value ? "on" : ""} aria-pressed={align === value} disabled={disabled}
      onClick={() => onChange(setTextAlign(definition, component.id, value))}>{label}</button>)}</div></div>;
  const appearance = <AppearanceSection extra={extra} visibility={visibility} disabled={disabled} hideOnMobile={component.props.hideOnMobile === true}
    onHideOnMobile={(hide) => onChange(setHideOnMobile(definition, component.id, hide))}/>;
  return <ComponentPanel name={component.name ?? ""} onRename={onRename} whatTitle="Stil" what={what} basicsTitle="Metin" basics={basics}
    actions={<p className="cpanel-note">Bu bileşenin eylemi yok.</p>} appearance={appearance}>
    <LegacySettings props={component.props} known={TEXT_KNOWN}/>
  </ComponentPanel>;
}
