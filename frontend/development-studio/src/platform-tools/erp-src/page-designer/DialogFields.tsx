import { useState } from "react";
import type { ReactNode } from "react";
import { SettingsPane } from "./ComponentSettingsDialog";
import { X } from "lucide-react";
import { sanitizeSafeValue } from "./DesignLanguageFields";
import { InputPicker, type PickerInput } from "./LayoutFields";
import { MAX_DIALOG_IDS, idList, ownableCandidates, parseTabs } from "./layoutRefs";
import { queryKindLabels, type PageQuery } from "./QueriesPanel";
import { SequenceFields, type SequenceValue } from "./SequenceFields";
import { iterationOf } from "./erpOperations";

type DialogComponent = { id: string; type: string; name?: string; props: Record<string, unknown> };
type Patch = Record<string, unknown>;
type SaveMode = "none" | "query" | "sequence";

const MAX_SAVE_LABEL = 40;
const MAX_REFRESH_QUERIES = 10;
const saveModeLabels: Record<SaveMode, string> = { none: "Yalnız Kapat", query: "Tek sorgu", sequence: "Kayıt dizisi" };
const defaultLabel = (component: DialogComponent) => String(component.props.label || component.props.title || component.name || component.id);

/** Kayıt dizisi değerini özelliklere çevirir: boş dizi ve varsayılan değerler (stopOnError: true) özelliği siler. */
export const sequencePatch = (next: SequenceValue): Patch => ({
  saveSequence: next.saveSequence.length > 0 ? next.saveSequence : undefined,
  sequenceWhen: next.saveSequence.length > 0 && next.sequenceWhen.length > 0 ? next.sequenceWhen : undefined,
  stopOnError: next.saveSequence.length > 0 && !next.stopOnError ? false : undefined,
});

/**
 * Pencere müfettişi: içerdiği bileşenler (sekme kuralıyla; pencere ve İşlem Çubuğu hariç), sunum (pencere/çekmece),
 * kaydetme yolu (yok, tek yazma sorgusu ya da kayıt dizisi; ikisi birlikte olamaz), kaydet metni, kayıtta kapan,
 * açılışta sıfırla ve kayıttan sonra yenilenecek okuma sorguları. `onPatch` undefined değeri siler.
 */
export function DialogFields({ dialog, components, labelOf = defaultLabel, writeQueries, readQueries, pageNames, disabled, onPatch, viewExtra }: {
  dialog: DialogComponent; components: DialogComponent[]; labelOf?: (component: DialogComponent) => string;
  writeQueries: PageQuery[]; readQueries: { id: string; name: string }[]; pageNames: string[]; disabled?: boolean; onPatch: (patch: Patch) => void;
  /** Görünüm sekmesine eklenecek alanlar (boyut, dışarı tıklama). */
  viewExtra?: ReactNode;
}) {
  const props = dialog.props;
  const contains = idList(props.contains, MAX_DIALOG_IDS);
  const candidates: PickerInput[] = ownableCandidates(components, { id: dialog.id, type: "dialog" }).map((component) => ({
    id: component.id, name: component.name, label: labelOf(component), inputType: component.type, hasOptions: false,
  }));
  const owners: Record<string, string> = {};
  for (const component of components) {
    if (component.id === dialog.id) continue;
    if (component.type === "tabs") for (const tab of parseTabs(component.props.tabs)) for (const id of tab.ids) owners[id] = `${labelOf(component)} · ${tab.label}`;
    if (component.type === "dialog") for (const id of idList(component.props.contains, MAX_DIALOG_IDS)) owners[id] = labelOf(component);
  }
  const sequence = Array.isArray(props.saveSequence) ? props.saveSequence.filter((id): id is string => typeof id === "string") : [];
  const saveQuery = typeof props.saveQuery === "string" ? props.saveQuery : "";
  const derived: SaveMode = sequence.length > 0 ? "sequence" : saveQuery ? "query" : "none";
  // Boş kayıt dizisi ya da seçilmemiş sorgu da seçilebilsin diye seçilen yol bileşen kimliğiyle birlikte tutulur.
  const [chosen, setChosen] = useState<{ id: string; mode: SaveMode } | null>(null);
  const mode: SaveMode = derived !== "none" ? derived : chosen?.id === dialog.id ? chosen.mode : "none";
  const setMode = (next: SaveMode) => {
    setChosen({ id: dialog.id, mode: next });
    if (next === mode) return;
    if (next === "none") onPatch({ saveQuery: undefined, saveSequence: undefined, sequenceWhen: undefined, stopOnError: undefined });
    else if (next === "query") onPatch({ saveSequence: undefined, sequenceWhen: undefined, stopOnError: undefined });
    else onPatch({ saveQuery: undefined });
  };
  // Tek sorgu: sunucu ValidateSaveQueries/ResolveGridIteration gibi yalnız ızgara satırlarını dolaşmayan ekleme/güncelleme sorguları.
  const saveCandidates = writeQueries.filter((query) => (query.kind === "insert" || query.kind === "update") && !iterationOf(query));
  const presentation = props.presentation === "drawer" ? "drawer" : "dialog";
  const refreshIds = Array.isArray(props.refreshQueries) ? props.refreshQueries.filter((id): id is string => typeof id === "string" && readQueries.some((query) => query.id === id)) : [];
  const refreshOptions = readQueries.filter((query) => !refreshIds.includes(query.id));
  const queryName = (id: string) => readQueries.find((query) => query.id === id)?.name ?? id;
  return <>
    <SettingsPane tab="main">
    <div className="pd-field">İçerik<small>Pencere açıkken içinde çizilen üst düzey bileşenler (en çok {MAX_DIALOG_IDS}); pencere kapalıyken bu bileşenler gizlidir ve doğrulanmaz.</small>
      {contains.length === 0 && <small className="pd-query-warning">Pencerede gösterilecek en az bir bileşen seçin.</small>}
      <InputPicker inputs={candidates} value={contains} owned={owners} max={MAX_DIALOG_IDS} takenLabel="Başka yerde" disabled={disabled}
        onChange={(next) => onPatch({ contains: next })}/>
      {candidates.length === 0 && <small>Pencereye yalnız sayfanın üst düzey bileşenleri eklenebilir (Pencere ve İşlem Çubuğu hariç; form kartındaki girişler ve satır işlemi düğmeleri de eklenemez).</small>}
    </div>
    <label className="pd-check"><input type="checkbox" checked={props.resetOnOpen !== false} disabled={disabled}
      onChange={(event) => onPatch({ resetOnOpen: event.target.checked ? undefined : false })}/>Açılışta alanları temizle</label>
    </SettingsPane>
    <SettingsPane tab="save">
    <div className="pd-field">Kaydetme<small>Kaydetme yolu yoksa pencerede yalnız “Kapat” düğmesi olur. Pencere açıkken Ctrl+S pencereyi kaydeder.</small>
      <div className="pd-segment" role="group" aria-label="Kaydetme yolu">
        {(Object.keys(saveModeLabels) as SaveMode[]).map((item) => <button type="button" key={item} aria-pressed={mode === item} className={mode === item ? "active" : ""}
          disabled={disabled} onClick={() => setMode(item)}>{saveModeLabels[item]}</button>)}
      </div>
    </div>
    {mode === "query" && <label className="pd-field">Kaydet sorgusu
      <select value={saveQuery} disabled={disabled} onChange={(event) => onPatch({ saveQuery: event.target.value || undefined })}>
        <option value="">{saveCandidates.length === 0 ? "Ekleme/güncelleme sorgusu yok" : "Ekleme/güncelleme sorgusu seçin"}</option>
        {saveCandidates.map((query) => <option key={query.id} value={query.id}>{query.name} ({queryKindLabels[query.kind]})</option>)}
        {saveQuery && !saveCandidates.some((query) => query.id === saveQuery) && <option value={saveQuery}>{saveQuery} (kullanılamaz: ekleme/güncelleme değil ya da ızgara satırlarını dolaşıyor)</option>}
      </select></label>}
    {mode === "sequence" && <SequenceFields value={sequence} when={props.sequenceWhen} stopOnError={props.stopOnError} writeQueries={writeQueries}
      componentsNames={pageNames} disabled={disabled} onChange={(next) => onPatch(sequencePatch(next))}/>}
    {mode !== "none" && <>
      <label className="pd-field">Kaydet düğmesi metni<small>Boşsa “Kaydet”.</small>
        <input value={typeof props.saveLabel === "string" ? props.saveLabel : ""} maxLength={MAX_SAVE_LABEL} disabled={disabled} placeholder="Kaydet"
          onChange={(event) => onPatch({ saveLabel: sanitizeSafeValue(event.target.value, false).slice(0, MAX_SAVE_LABEL) || undefined })}/></label>
      <label className="pd-check"><input type="checkbox" checked={props.closeOnSave !== false} disabled={disabled}
        onChange={(event) => onPatch({ closeOnSave: event.target.checked ? undefined : false })}/>Kaydedince kapat</label>
      <div className="pd-field">Sonra yenile<small>Kayıttan sonra yeniden çalışacak okuma sorguları.</small>
        {refreshIds.length > 0 && <ul className="pd-action-chips">{refreshIds.map((id) => <li key={id}><span>{queryName(id)}</span>
          <button type="button" aria-label={`${queryName(id)} yenilemesini kaldır`} disabled={disabled}
            onClick={() => onPatch({ refreshQueries: refreshIds.length > 1 ? refreshIds.filter((item) => item !== id) : undefined })}><X size={11}/></button></li>)}</ul>}
        <select value="" aria-label="Yenilenecek sorgu ekle" disabled={disabled || refreshOptions.length === 0 || refreshIds.length >= MAX_REFRESH_QUERIES}
          onChange={(event) => { if (event.target.value) onPatch({ refreshQueries: [...refreshIds, event.target.value] }); }}>
          <option value="">{readQueries.length === 0 ? "Okuma sorgusu yok" : refreshOptions.length === 0 ? "Tümü eklendi" : "Okuma sorgusu ekle"}</option>
          {refreshOptions.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
        </select>
      </div>
    </>}
    </SettingsPane>
    <SettingsPane tab="view">
    <div className="pd-field">Sunum
      <div className="pd-segment" role="group" aria-label="Pencere sunumu">
        <button type="button" aria-pressed={presentation === "dialog"} className={presentation === "dialog" ? "active" : ""} disabled={disabled} onClick={() => onPatch({ presentation: "dialog" })}>Pencere</button>
        <button type="button" aria-pressed={presentation === "drawer"} className={presentation === "drawer" ? "active" : ""} disabled={disabled} onClick={() => onPatch({ presentation: "drawer" })}>Çekmece</button>
      </div>
    </div>
    {viewExtra}
    </SettingsPane>
  </>;
}
