import type { ReactNode } from "react";
import BindingInput, { type BindingSuggestion } from "./BindingInput";
import type { PageOption, ScreenOption } from "./NavigationFields";
import { LEGACY_KEYS, MAX_PARAMS, OPEN_GROUP, PARAM_NAME, ROW_BINDING, barCommandProblem, barModes, list, text, type AfterSaveMode, type NewMode, type OpenMode, type Patch, type Value } from "./barCommands";

/** Komutlar bölümü: Yeni / Aç / Kaydettikten sonra grupları (kurallar barCommands.ts'de). */

type TableOption = { id: string; name: string; columns: { code: string; label: string }[] };

function Segment<T extends string>({ label, value, options, disabled, onChange }: {
  label: string; value: T | "button"; options: readonly (readonly [T, string])[]; disabled?: boolean; onChange: (next: T) => void;
}) {
  return <div className="pd-segment" role="group" aria-label={label}>{options.map(([option, title]) =>
    <button type="button" key={option} disabled={disabled} aria-pressed={value === option} className={value === option ? "active" : ""} onClick={() => onChange(option)}>{title}</button>)}</div>;
}

function PagePicker({ label, value, pages, screens, disabled, onChange }: {
  label: string; value: string; pages: PageOption[]; screens: ScreenOption[]; disabled?: boolean; onChange: (code: string | undefined) => void;
}) {
  const known = pages.some((page) => page.code === value) || screens.some((screen) => `@${screen.key}` === value);
  return <label className="pd-field">Açılacak sayfa<select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value || undefined)}>
    <option value="">Sayfa seçin</option>
    {value && !known && <option value={value}>{value}</option>}
    <optgroup label="Özel sayfalar">{pages.map((page) => <option key={page.code} value={page.code}>{page.name} · {page.code}</option>)}</optgroup>
    <optgroup label="Sistem ekranları">{screens.map((screen) => <option key={screen.key} value={`@${screen.key}`}>{screen.label} · @{screen.key}</option>)}</optgroup>
  </select>{!value && <small className="pd-query-warning">Açılacak sayfayı seçin.</small>}</label>;
}

const TARGETS = [["newTab", "Yeni sekmede"], ["sameTab", "Bu sekmede"]] as const;

/** "Gönderilecek değer" satırları: ad = kolon (seçili satırdan); kolon kalıbına uymayan değer elle yazılır. */
function ParamRows({ value, table, suggestions, disabled, onChange }: {
  value: string[]; table: TableOption | undefined; suggestions: BindingSuggestion[]; disabled?: boolean; onChange: (next: string[]) => void;
}) {
  const rows = value.map((item) => ({ name: item.includes("=") ? item.slice(0, item.indexOf("=")) : item, value: item.includes("=") ? item.slice(item.indexOf("=") + 1) : "" }));
  const write = (next: typeof rows) => onChange(next.map((row) => `${row.name}=${row.value}`));
  const bad = rows.find((row, index) => !PARAM_NAME.test(row.name) || rows.findIndex((other) => other.name === row.name) !== index);
  const columnValue = (code: string) => table ? `{{${table.name}.seciliSatir.${code}}}` : "";
  return <div className="pd-field">Gönderilecek değer<small>Açılan sayfada <code>{"{{sayfa.parametre.<ad>}}"}</code> olarak okunur (en fazla {MAX_PARAMS}).</small>
    {rows.map((row, index) => {
      const match = ROW_BINDING.exec(row.value);
      const column = match && table && match[1] === table.name ? match[2] : null;
      const update = (patch: Partial<typeof row>) => write(rows.map((item, at) => at === index ? { ...item, ...patch } : item));
      return <div className="pd-inline pd-bar-param" key={index}>
        <input aria-label="Değer adı" value={row.name} maxLength={32} disabled={disabled} placeholder="ad"
          onChange={(event) => update({ name: event.target.value.replace(/[^a-zA-Z0-9]/g, "") })}/>
        <span aria-hidden="true">=</span>
        {column !== null ? <select aria-label="Kolon" value={column} disabled={disabled} onChange={(event) => update({ value: event.target.value === "__raw" ? "" : columnValue(event.target.value) })}>
          {!table!.columns.some((item) => item.code === column) && <option value={column}>{column}</option>}
          {table!.columns.map((item) => <option key={item.code} value={item.code}>{item.label || item.code}</option>)}
          <option value="__raw">Elle yaz…</option>
        </select> : <BindingInput value={row.value} maxLength={200} suggestions={suggestions} disabled={disabled} ariaLabel="Değer" onChange={(next) => update({ value: next })}/>}
        {column === null && table && table.columns.length > 0 && <button type="button" className="pd-button small" disabled={disabled} onClick={() => update({ value: columnValue(table.columns[0].code) })}>Kolon</button>}
        <button type="button" className="pd-button small" disabled={disabled} aria-label="Değeri kaldır" onClick={() => write(rows.filter((_, at) => at !== index))}>×</button>
      </div>;
    })}
    <button type="button" className="pd-button small" disabled={disabled || rows.length >= MAX_PARAMS}
      onClick={() => write([...rows, { name: rows.length === 0 ? "id" : `p${rows.length + 1}`, value: table && table.columns.length > 0 ? columnValue(table.columns.some((item) => item.code === "id") ? "id" : table.columns[0].code) : "" }])}>Değer ekle</button>
    {table && table.columns.length === 0 && <small>Listenin sorgu önizlemesi çalışınca kolonlar listelenir; değeri elle de yazabilirsiniz.</small>}
    {bad && <small className="pd-query-warning">Ad küçük harfle başlamalı, en fazla 32 harf/rakam olmalı ve benzersiz olmalıdır.</small>}
  </div>;
}

/** Komutlar bölümünün Yeni / Aç / Kaydettikten sonra grupları. `onPatch` undefined değeri siler (tek geri alma adımı). */
export function BarCommandFields({ props, pages, screens, tables, dialogs, buttonLabel, newInputsField, suggestions, disabled, onPatch, canMigrate, onMigrate, only }: {
  props: Record<string, Value>; pages: PageOption[]; screens: ScreenOption[]; tables: TableOption[];
  dialogs: { id: string; label: string }[]; buttonLabel: (id: string) => string; newInputsField: ReactNode;
  suggestions: BindingSuggestion[]; disabled?: boolean; onPatch: (patch: Patch) => void;
  /** En az bir eski düğme bağı taşınabilir mi. */
  canMigrate: boolean; onMigrate: () => void;
  /** Yalnız tek komutun grubu (Komutlar sekmesindeki açılan satır); verilmezse hepsi. */
  only?: "new" | "open" | "afterSave";
}) {
  const modes = barModes(props);
  const legacy = LEGACY_KEYS.filter((key) => text(props[key]) !== "");
  // Sunucu: sayfa açan Yeni / Aç kayıt penceresiyle birlikte olamaz; pencereyi kullanan öbür komut kapanır.
  const dropDialog = (other: "new" | "open"): Patch => text(props.formDialog) === "" ? {}
    : { formDialog: undefined, ...(modes[other] === "dialog" ? { [other === "new" ? "newAction" : "openAction"]: "off" } : {}) };
  const legacyNote = (key: typeof LEGACY_KEYS[number]) => text(props[key])
    ? <small className="pd-bar-legacy-note">Şu an “{buttonLabel(text(props[key]))}” düğmesini çalıştırıyor; aşağıdan seçerseniz düğme bağı kalkar.</small> : null;
  const setNew = (mode: Exclude<NewMode, "button">) => onPatch({
    newButton: undefined, newAction: mode, newPageCode: mode === "page" ? text(props.newPageCode) || undefined : undefined,
    newTarget: mode === "page" ? text(props.newTarget) || "sameTab" : undefined, ...(mode === "page" ? dropDialog("open") : {}),
  });
  const setOpen = (mode: Exclude<OpenMode, "button">) => onPatch({
    openButton: undefined, openAction: mode,
    ...Object.fromEntries(OPEN_GROUP.map((key) => [key, mode === "page" ? props[key] : undefined])),
    ...(mode === "page" ? { openTarget: text(props.openTarget) || "sameTab", openTable: text(props.openTable) || (tables.length === 1 ? tables[0].id : undefined) } : {}),
    ...(mode === "page" ? dropDialog("new") : {}),
  });
  const setAfterSave = (mode: Exclude<AfterSaveMode, "button">) => onPatch({
    afterSaveButton: undefined, afterSaveAction: mode,
    afterSavePageCode: mode === "page" ? text(props.afterSavePageCode) || undefined : undefined,
    afterSaveTarget: mode === "page" ? text(props.afterSaveTarget) || "sameTab" : undefined,
    afterSaveRefresh: mode === "page" ? (props.afterSaveRefresh === false ? undefined : true) : undefined,
  });
  const dialogSelect = <label className="pd-field">Kayıt penceresi
    <select value={text(props.formDialog)} disabled={disabled} onChange={(event) => onPatch({ formDialog: event.target.value || undefined })}>
      <option value="">Pencere seçin</option>
      {dialogs.map((dialog) => <option key={dialog.id} value={dialog.id}>{dialog.label}</option>)}
    </select>
    {dialogs.length === 0 ? <small>Önce sayfaya bir Pencere bileşeni ekleyin.</small> : !text(props.formDialog) && <small className="pd-query-warning">Bir pencere seçin.</small>}
  </label>;
  const targetField = (key: "newTarget" | "openTarget" | "afterSaveTarget") => <div className="pd-field">Nerede
    <Segment label="Nerede" value={props[key] === "newTab" ? "newTab" : "sameTab"} options={TARGETS} disabled={disabled} onChange={(next) => onPatch({ [key]: next })}/></div>;
  const openTable = tables.find((table) => table.id === text(props.openTable));
  const problem = barCommandProblem(props);

  return <div className="pd-bar-commands">
    {!only && legacy.length > 0 && <div className="pd-bar-legacy" role="note">
      <small>Bu sayfada {legacy.map((key) => key === "newButton" ? "Yeni" : key === "openButton" ? "Aç" : "Kaydettikten sonra").join(", ")} gizli bir düğmeye bağlı. İşlem Çubuğu'na taşıyınca ayar burada yapılır, kullanılmayan düğme kalkar.</small>
      <button type="button" className="pd-button small" disabled={disabled || !canMigrate} onClick={onMigrate}>İşlem Çubuğu'na taşı</button>
      {!canMigrate && <small>Düğme onay, koşul ya da sayfa dışı bir eylem kullanıyor; otomatik taşınamaz. Aşağıdan yeni seçimi yapın.</small>}
    </div>}
    {(!only || only === "new") && <fieldset className="pd-bar-group" aria-label="Yeni">
      <legend>＋ Yeni<span className="pd-action-key" aria-hidden="true">F2</span></legend>
      <Segment label="Yeni ne yapsın" value={modes.new} disabled={disabled} onChange={setNew}
        options={[["off", "Kapalı"], ["clear", "Formu temizle"], ["dialog", "Pencere aç"], ["page", "Sayfa aç"]]}/>
      {legacyNote("newButton")}
      {modes.new === "clear" && <div className="pd-field">Temizlenecek girişler{newInputsField}
        {list(props.newInputs).length === 0 && <small className="pd-query-warning">Temizlenecek en az bir giriş seçin.</small>}</div>}
      {modes.new === "dialog" && <>{dialogSelect}<div className="pd-field">İlk odaklanılacak giriş<small>İsteğe bağlı: pencere açılınca ilk seçilen girişe odaklanılır.</small>{newInputsField}</div></>}
      {modes.new === "page" && <>
        <PagePicker label="Yeni: açılacak sayfa" value={text(props.newPageCode)} pages={pages} screens={screens} disabled={disabled} onChange={(code) => onPatch({ newPageCode: code })}/>
        {targetField("newTarget")}
      </>}
    </fieldset>}
    {(!only || only === "open") && <fieldset className="pd-bar-group" aria-label="Aç">
      <legend>Aç<span className="pd-action-key" aria-hidden="true">Enter · çift tıklama</span></legend>
      <Segment label="Aç ne yapsın" value={modes.open} disabled={disabled} onChange={setOpen}
        options={[["off", "Kapalı"], ["dialog", "Pencere aç"], ["page", "Sayfa aç"]]}/>
      {legacyNote("openButton")}
      {modes.open === "dialog" && modes.new !== "dialog" && dialogSelect}
      {modes.open === "page" && <>
        <PagePicker label="Aç: açılacak sayfa" value={text(props.openPageCode)} pages={pages} screens={screens} disabled={disabled} onChange={(code) => onPatch({ openPageCode: code })}/>
        {targetField("openTarget")}
        <label className="pd-field">Hangi liste<small>Satır seçili değilse Aç soluk görünür.</small>
          <select value={text(props.openTable)} disabled={disabled} onChange={(event) => onPatch({ openTable: event.target.value || undefined })}>
            <option value="">Liste seçin</option>
            {props.openTable && !openTable && <option value={text(props.openTable)}>{text(props.openTable)}</option>}
            {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
          </select>
          {tables.length === 0 ? <small className="pd-query-warning">Önce sayfaya adlı ve sorguya bağlı bir liste ekleyin.</small>
            : !openTable && <small className="pd-query-warning">Satırı kullanılacak listeyi seçin.</small>}
        </label>
        <ParamRows value={list(props.openParams)} table={openTable} suggestions={suggestions} disabled={disabled}
          onChange={(next) => onPatch({ openParams: next.length > 0 ? next : undefined })}/>
      </>}
    </fieldset>}
    {(!only || only === "afterSave") && <fieldset className="pd-bar-group" aria-label="Kaydettikten sonra">
      <legend>Kaydettikten sonra</legend>
      <Segment label="Kaydettikten sonra ne yapılsın" value={modes.afterSave} disabled={disabled} onChange={setAfterSave}
        options={[["off", "Kapalı"], ["page", "Sayfa aç"]]}/>
      {legacyNote("afterSaveButton")}
      {modes.afterSave === "page" && <>
        <small>Kayıt tam başarılı olunca kayıt kartları boşalır ve sayfa açılır (ör. listeye dön).</small>
        <PagePicker label="Kaydettikten sonra: açılacak sayfa" value={text(props.afterSavePageCode)} pages={pages} screens={screens} disabled={disabled} onChange={(code) => onPatch({ afterSavePageCode: code })}/>
        {targetField("afterSaveTarget")}
        <label className="pd-check"><input type="checkbox" checked={props.afterSaveRefresh === true} disabled={disabled}
          onChange={(event) => onPatch({ afterSaveRefresh: event.target.checked ? true : undefined })}/>Açılan sayfayı yenile</label>
      </>}
    </fieldset>}
    {(!only || only === "new" || only === "open") && problem && <small className="pd-query-warning">{problem}</small>}
  </div>;
}
