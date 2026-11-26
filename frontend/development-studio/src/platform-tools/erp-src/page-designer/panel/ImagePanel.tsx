import type { ReactNode } from "react";
import { ComponentPanel, LegacySettings } from "./ComponentPanel";
import { AppearanceSection } from "./AppearanceSection";
import type { FieldToken } from "./consultantText";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { IMAGE_ADDRESS_INVALID, imageAddressProblem, imageOf, setImageAddress, setImageDescription, setImageFromRecord, setImageHeight, type ImageSize } from "./imagePanelModel";
import { setHideOnMobile } from "./textPanelModel";

/** Panelin yazdığı özellikler ve ortak olanlar; ötekiler "Eski ayarlar" altında salt okunur görünür. */
export const IMAGE_KNOWN = new Set(["value", "title", "height", "slot", "visibleWhen", "hideOnMobile"]);
const SOURCES: [string, "address" | "record"][] = [["Adres", "address"], ["Kayıttaki resim", "record"]];
const HEIGHTS: [string, ImageSize][] = [["Küçük", "small"], ["Orta", "medium"], ["Büyük", "large"]];

export type ImagePanelProps = {
  component: ModelComponent; definition: ModelDefinition;
  /** Listenin veri kaynağının kolonları (`fieldTokens`); "Kayıttaki resim" bunlardan seçer. */
  tokens: FieldToken[]; disabled?: boolean;
  onChange: (next: ModelDefinition) => void; onRename: (name: string) => void; visibility?: ReactNode;
  /** Ad bölümünün altındaki "Yeri" seçimi (ek alanlarda). */
  place?: ReactNode;
};

export function ImagePanel({ component, definition, tokens, disabled, onChange, onRename, visibility, place }: ImagePanelProps) {
  const image = imageOf(component);
  // Seçili satır dışındaki bir bağlama (ör. sorgu sonucu) adres kutusunda ham `{{…}}` olarak gösterilmez; "Adres" ile temizlenebilir.
  const bound = image.from === "address" && image.address.includes("{{");
  const problem = image.from === "address" && !bound ? imageAddressProblem(image.address) : null;
  // Kayıtlı bağlamanın kendisiyle tam eşleşme: noktalı kolon kodunda başka bir kolonun sonu seçilmez.
  const stored = image.from === "record" ? String(component.props.value ?? "").trim().replace(/^\{\{\s*|\s*\}\}$/g, "") : "";
  const columnBinding = tokens.find((token) => token.binding === stored)?.binding ?? "";
  const choose = (value: "address" | "record") => {
    if (value === image.from && !bound) return;
    if (value === "address") return onChange(setImageAddress(definition, component.id, ""));
    if (tokens[0]) onChange(setImageFromRecord(definition, component.id, tokens[0].binding));
  };
  // Kayıt yokken (serbest gövde, listesiz sayfa) "Kayıttaki resim" önerilmez; zaten kayıttan bağlıysa görünür kalır.
  const sources = SOURCES.filter(([, value]) => value === "address" || tokens.length > 0 || image.from === "record");
  const what = <>
    <div className="cpanel-seg" role="group" aria-label="Görsel nereden?">{sources.map(([label, value]) =>
      <button type="button" key={value} className={image.from === value ? "on" : ""} aria-pressed={image.from === value} disabled={disabled}
        onClick={() => choose(value)}>{label}</button>)}</div>
    {bound ? <p className="cpanel-note">Kayıttan gelen görsel</p>
      : image.from === "address"
      ? <label className="cpanel-row">Görselin adresi<input className="cpanel-txt" aria-label="Görselin adresi" disabled={disabled} value={image.address}
        onChange={(event) => onChange(setImageAddress(definition, component.id, event.target.value))}/></label>
      : tokens.length === 0 ? <p className="cpanel-note">Önce listeye bir veri kaynağı bağlayın.</p>
        : <label className="cpanel-row">Hangi alan?<select aria-label="Hangi alan?" disabled={disabled} value={columnBinding}
          onChange={(event) => onChange(setImageFromRecord(definition, component.id, event.target.value))}>
          {!columnBinding && <option value="">Seçin</option>}
          {tokens.map((token) => <option key={token.binding} value={token.binding}>{token.label}</option>)}</select></label>}
    {problem && <p className="cpanel-warn" role="status">{IMAGE_ADDRESS_INVALID}</p>}
    <p className="cpanel-note">Dosya yükleme sonraki sürümde gelir.</p>
  </>;
  const basics = <>
    <div className="cpanel-q">Yükseklik</div>
    <div className="cpanel-seg" role="group" aria-label="Yükseklik">{HEIGHTS.map(([label, value]) =>
      <button type="button" key={value} className={image.height === value ? "on" : ""} aria-pressed={image.height === value} disabled={disabled}
        onClick={() => onChange(setImageHeight(definition, component.id, value))}>{label}</button>)}</div>
    <label className="cpanel-row">Açıklama (erişilebilirlik için)<input className="cpanel-txt" aria-label="Açıklama" disabled={disabled} value={image.description}
      onChange={(event) => onChange(setImageDescription(definition, component.id, event.target.value))}/></label>
  </>;
  const appearance = <AppearanceSection visibility={visibility} disabled={disabled} hideOnMobile={component.props.hideOnMobile === true}
    onHideOnMobile={(hide) => onChange(setHideOnMobile(definition, component.id, hide))}/>;
  return <ComponentPanel name={component.name ?? ""} namePlaceholder="Görsel" nameReadOnly onRename={onRename} place={place} whatTitle="Görsel nereden?" what={what} basicsTitle="Boyut" basics={basics}
    actions={<p className="cpanel-note">Bu bileşenin eylemi yok.</p>} appearance={appearance}>
    <LegacySettings props={component.props} known={IMAGE_KNOWN}/>
  </ComponentPanel>;
}
