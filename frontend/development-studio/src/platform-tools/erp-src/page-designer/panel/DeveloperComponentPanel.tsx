import type { ReactNode } from "react";
import type { ActiveCatalog, CatalogComponent, CatalogComponentSetting } from "../catalogClient";
import { ComponentPanel } from "./ComponentPanel";
import { AppearanceSection } from "./AppearanceSection";
import { DraftInput } from "./DraftInput";
import { DEVELOPER_NONE } from "./consultantPalette";
import { chooseComponent, developerComponentOf, setComponentSetting, settingValueFits, type SettingValue } from "./developerComponentModel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { setHideOnMobile } from "./textPanelModel";

export const DEVELOPER_MISSING_IN_CATALOG = "Katalogda yok";
export const DEVELOPER_SOURCE_NOTE = "Yazılımcının yayınladığı bileşen · danışman kodunu görmez";
export const DEVELOPER_SETTINGS_NOTE = "Bu ayarları yazılımcı tanımladı. Bileşen başka ayar isterse burada görünür.";
const NO_SETTINGS_NOTE = "Bu bileşenin ayarı yok. Bileşen ayar isterse burada görünür.";
/** Karar 3: seçim en çok 4 seçenekte düğme grubu, fazlasında açılır liste. */
const MAX_SEGMENT_OPTIONS = 4;

export type DeveloperComponentPanelProps = {
  component: ModelComponent; definition: ModelDefinition;
  /** Etkin katalog; `null` etkin sürüm yok demektir. */
  catalog: ActiveCatalog | null; catalogStatus: "loading" | "ready" | "failed";
  disabled?: boolean; onChange: (next: ModelDefinition) => void; onRename: (name: string) => void;
  /** "Ne zaman görünsün?" alanı (`VisibilityField` düğümü). */
  visibility?: ReactNode;
  /** Ad bölümünün altındaki satır (ek alanda "Yeri", serbest gövdede bölüm seçimi). */
  place?: ReactNode;
};

/**
 * Danışmanın "Yazılımcı bileşeni" paneli (taslak 03 ve 10): bileşen seçilir, yalnız yazılımcının tanımladığı ayarlar doldurulur.
 * Kod adı, CSS, JavaScript ve ayar adları gösterilmez (§3); yalnız yazılımcının yazdığı etiketler görünür.
 */
export function DeveloperComponentPanel({ component, definition, catalog, catalogStatus, disabled, onChange, onRename, visibility, place }: DeveloperComponentPanelProps) {
  const id = component.id;
  const state = developerComponentOf(definition, id, catalog);
  const components = catalog?.components ?? [];
  const change = (next: ModelDefinition) => { if (!disabled && next !== definition) onChange(next); };
  const at = state.comp ? components.indexOf(state.comp) : -1;
  const missing = state.missing && catalogStatus === "ready";

  const what = <>
    {catalogStatus === "loading" ? <p className="cpanel-note">Katalog yükleniyor…</p>
      : catalogStatus === "failed" ? <p className="cpanel-warn">Katalog okunamadı.</p>
        : <>
          {components.length === 0 ? <p className="cpanel-note">{DEVELOPER_NONE}</p>
            : <select aria-label="Hangi bileşen?" value={at >= 0 ? String(at) : ""} disabled={disabled}
              onChange={(event) => { const comp = components[Number(event.target.value)]; if (comp) change(chooseComponent(definition, id, comp)); }}>
              {at < 0 && <option value="" disabled>Seçin</option>}
              {components.map((item, index) => <option key={index} value={String(index)}>{item.label}</option>)}
            </select>}
          {missing && <p className="cpanel-warn">{DEVELOPER_MISSING_IN_CATALOG}</p>}
          {state.comp?.description && <p className="cpanel-note">{state.comp.description}</p>}
        </>}
    <div className="cpanel-dev">{DEVELOPER_SOURCE_NOTE}</div>
  </>;

  const basics = state.comp ? <>
    {state.comp.settings.map((setting, index) => <SettingControl key={index} setting={setting} stored={state.values[setting.name]} disabled={disabled}
      onSet={(value) => change(setComponentSetting(definition, id, state.comp as CatalogComponent, setting.name, value))}/>)}
    <p className="cpanel-note">{state.comp.settings.length > 0 ? DEVELOPER_SETTINGS_NOTE : NO_SETTINGS_NOTE}</p>
  </> : null;

  const appearance = <AppearanceSection visibility={visibility} disabled={disabled} hideOnMobile={component.props.hideOnMobile === true}
    onHideOnMobile={(hide) => change(setHideOnMobile(definition, id, hide))}/>;
  // Danışmanın bilmediği özellikler (eski kod alanları dahil) burada listelenmez; teknik ad göstermemek için "Eski ayarlar" yok.
  return <ComponentPanel name={component.name ?? ""} namePlaceholder="Yazılımcı bileşeni" nameReadOnly onRename={onRename} place={place}
    whatTitle="Hangi bileşen?" what={what} basicsTitle={null} basics={basics}
    actions={<p className="cpanel-note">Bu bileşenin eylemi yok.</p>} appearance={appearance}/>;
}

/** Karar 3: metin → metin kutusu, sayı → sayı kutusu, evet/hayır → anahtar, seçim → düğme grubu (≤4) ya da açılır liste. */
function SettingControl({ setting, stored, disabled, onSet }: {
  setting: CatalogComponentSetting; stored: unknown; disabled?: boolean; onSet: (value: SettingValue | null) => void;
}) {
  const value = settingValueFits(setting, stored) ? stored : null;
  const shown = value ?? setting.default;
  switch (setting.type) {
    case "bool":
      return <label className="cpanel-row">{setting.label}<input type="checkbox" role="switch" checked={shown === true} disabled={disabled}
        onChange={(event) => onSet(event.target.checked)}/></label>;
    case "choice":
      if (setting.options.length <= MAX_SEGMENT_OPTIONS) return <>
        <div className="cpanel-q">{setting.label}</div>
        <div className="cpanel-seg" role="group" aria-label={setting.label}>{setting.options.map((option, index) =>
          <button type="button" key={index} className={shown === option ? "on" : ""} aria-pressed={shown === option} disabled={disabled}
            onClick={() => onSet(option)}>{option}</button>)}</div>
      </>;
      return <label className="cpanel-q">{setting.label}
        <select aria-label={setting.label} value={typeof shown === "string" ? shown : ""} disabled={disabled} onChange={(event) => onSet(event.target.value)}>
          {typeof shown !== "string" && <option value="" disabled>Seçin</option>}
          {setting.options.map((option, index) => <option key={index} value={option}>{option}</option>)}
        </select></label>;
    case "number":
      return <label className="cpanel-q">{setting.label}
        <input className="cpanel-txt" type="number" value={typeof value === "number" ? String(value) : ""} disabled={disabled}
          placeholder={typeof setting.default === "number" ? String(setting.default) : undefined}
          onChange={(event) => {
            const text = event.target.value.trim();
            if (text === "") { onSet(null); return; }
            const parsed = Number(text);
            if (Number.isFinite(parsed)) onSet(parsed);
          }}/></label>;
    default:
      return <DraftInput label={setting.label} value={typeof value === "string" ? value : ""} maxLength={500} disabled={disabled}
        placeholder={typeof setting.default === "string" ? setting.default : undefined} onCommit={(text) => onSet(text)}/>;
  }
}
