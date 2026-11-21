import { useEffect, useState } from "react";
import { X } from "lucide-react";
import BindingInput, { type BindingSuggestion } from "./BindingInput";
import { IconSelect } from "./DesignLanguageFields";
import { InputPicker, type PickerInput } from "./LayoutFields";
import { conditionProblem } from "./conditions";
import { idList } from "./layoutRefs";
import { rowActionOwners } from "./RowActionsFields";
import {
  HEADER_FIELD_FORMATS, MAX_ASSIGNMENTS, MAX_ASSIGNMENT_TEMPLATE, MAX_HEADER_BUTTONS, MAX_HEADER_FIELDS, MAX_STEPS, MAX_STEP_LABEL, MIN_STEPS, ROW_OPEN_ACTION_TYPES,
  formatAssignment, freeHeaderLabel, headerFieldsPatch, renameHeaderField, parseAssignments, parseHeaderFields, parseSteps, stepsPatch, type HeaderField, type HeaderFieldFormat,
} from "./wizardParts";

// Seçim → ayrıntı ekranlarının müfettiş alanları: Adımlar, Kayıt özeti, "Alana değer ata" atamaları ve "Satır açılınca".

type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
const FORMAT_LABELS: Record<HeaderFieldFormat, string> = { number: "Sayı", money: "Para", date: "Tarih", datetime: "Tarih ve saat", text: "Metin" };

/** Adımlar: etiket ve etkinlik koşulu satırları (2–6). Etkin adım, koşulu tutan son adımdır; hiçbiri tutmuyorsa ilk adım. */
export function StepsFields({ props, pageNames, disabled, onPatch }: {
  props: Record<string, unknown>; pageNames: string[]; disabled?: boolean; onPatch: (patch: { steps: string[]; activeWhen: string[] }) => void;
}) {
  const rows = parseSteps(props);
  const write = (next: typeof rows) => onPatch(stepsPatch(next));
  return <div className="pd-field">Adımlar<small>Etkin adım, koşulu tutan son adımdır; hiçbiri tutmuyorsa ilk adım etkindir. Koşullar görünürlük koşuluyla aynı biçimdedir (ör. <code>secim.value != null</code>).</small>
    {rows.map((row, index) => {
      const problem = row.when.trim() === "" ? "Koşul yazın." : conditionProblem("activeWhen", row.when, pageNames);
      return <div key={index} className="pd-step-row">
        <input value={row.label} maxLength={MAX_STEP_LABEL} disabled={disabled} aria-label={`${index + 1}. adım etiketi`} placeholder={`Adım ${index + 1}`}
          onChange={(event) => write(rows.map((item, at) => at === index ? { ...item, label: event.target.value.slice(0, MAX_STEP_LABEL) } : item))}/>
        <span><input value={row.when} maxLength={500} spellCheck={false} disabled={disabled} aria-label={`${index + 1}. adım koşulu`} placeholder="Etkin olma koşulu"
          onChange={(event) => write(rows.map((item, at) => at === index ? { ...item, when: event.target.value } : item))}/>
          {problem && <small className="pd-query-warning">{problem}</small>}</span>
        <button type="button" className="pd-icon-button" disabled={disabled || rows.length <= MIN_STEPS} aria-label={`${index + 1}. adımı kaldır`}
          onClick={() => write(rows.filter((_, at) => at !== index))}><X size={12}/></button>
      </div>;
    })}
    <button type="button" className="pd-button small" disabled={disabled || rows.length >= MAX_STEPS} onClick={() => write([...rows, { label: `Adım ${rows.length + 1}`, when: "" }])}>＋ Adım ekle</button>
    {rows.length < MIN_STEPS && <small className="pd-query-warning">En az {MIN_STEPS} adım gerekli.</small>}
  </div>;
}

/** "Alana değer ata": her satır bir giriş ve değer şablonu (en çok 8). Boş şablon girişi temizler (onay kutusunda kapalı). */
export function AssignmentsFields({ value, inputs, suggestions, disabled, onChange }: {
  value: unknown; inputs: { id: string; label: string }[]; suggestions: BindingSuggestion[]; disabled?: boolean; onChange: (next: string[] | undefined) => void;
}) {
  const rows = parseAssignments(value);
  const write = (next: typeof rows) => onChange(next.length > 0 ? next.map(formatAssignment) : undefined);
  return <div className="pd-field">Atamalar<small>Düğmeye basılınca girişlere bu değerler yazılır; sunucuya bir şey gönderilmez. Satır işleminde <code>{"{{<liste>.seciliSatir.alan}}"}</code> tıklanan satırdır. Boş değer girişi temizler.</small>
    {inputs.length === 0 && <small className="pd-query-warning">Önce sayfaya bir giriş kutusu ekleyin (gizli giriş de olabilir).</small>}
    {rows.map((row, index) => <div key={index} className="pd-assign-row">
      <select value={row.inputId} disabled={disabled} aria-label={`${index + 1}. atamanın girişi`}
        onChange={(event) => write(rows.map((item, at) => at === index ? { ...item, inputId: event.target.value } : item))}>
        {inputs.map((input) => <option key={input.id} value={input.id}>{input.label}</option>)}
        {!inputs.some((input) => input.id === row.inputId) && <option value={row.inputId}>{row.inputId || "Giriş seçin"} (sayfada yok)</option>}
      </select>
      <BindingInput value={row.template} maxLength={MAX_ASSIGNMENT_TEMPLATE} suggestions={suggestions} disabled={disabled} ariaLabel={`${index + 1}. atamanın değeri`} placeholder="Boş: temizle"
        onChange={(next) => write(rows.map((item, at) => at === index ? { ...item, template: next } : item))}/>
      <button type="button" className="pd-icon-button" disabled={disabled} aria-label={`${index + 1}. atamayı kaldır`} onClick={() => write(rows.filter((_, at) => at !== index))}><X size={12}/></button>
    </div>)}
    <button type="button" className="pd-button small" disabled={disabled || inputs.length === 0 || rows.length >= MAX_ASSIGNMENTS}
      onClick={() => write([...rows, { inputId: inputs[0]?.id ?? "", template: "" }])}>＋ Atama ekle</button>
    {rows.length === 0 && <small className="pd-query-warning">En az bir atama ekleyin.</small>}
  </div>;
}

/**
 * Alan etiketi: yazarken yerel taslaktır, odaktan çıkınca ya da Enter ile yazılır. Boş ya da başka alanla aynı etiket geri alınır
 * (biçim ve birim etiketle eşlendiğinden ara değer başka satırın ayarlarını bozmasın).
 */
function HeaderLabelInput({ value, index, onCommit, disabled }: { value: string; index: number; onCommit: (label: string) => boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value && !onCommit(draft)) setDraft(value); };
  return <input value={draft} maxLength={60} disabled={disabled} aria-label={`${index + 1}. alanın etiketi`} placeholder="Etiket"
    onChange={(event) => setDraft(event.target.value.replace(/=/g, ""))} onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } else if (event.key === "Escape") setDraft(value); }}/>;
}

/** Kayıt özeti: simge, alanlar (etiket, değer, biçim, birim; en çok 6) ve sağdaki düğmeler (en çok 3, özete aittir). */
export function RecordHeaderFields({ props, suggestions, buttons, owners, disabled, onPatch }: {
  props: Record<string, unknown>; suggestions: BindingSuggestion[]; buttons: PickerInput[]; owners: Record<string, string>; disabled?: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const rows = parseHeaderFields(props);
  const write = (next: HeaderField[]) => onPatch(headerFieldsPatch(next));
  const labels = rows.map((row) => row.label);
  return <>
    <div className="pd-field">Simge<IconSelect value={typeof props.icon === "string" ? props.icon : undefined} disabled={disabled} onChange={(icon) => onPatch({ icon })}/></div>
    <div className="pd-field">Alanlar<small>Başlığın yanında “Etiket / değer” olarak çizilir; boş değer “—” gösterilir. Birim biçimli değerin arkasına eklenir.</small>
      {rows.map((row, index) => <div key={index} className="pd-header-field-row">
        <HeaderLabelInput value={row.label} index={index} disabled={disabled}
          onCommit={(label) => { const next = renameHeaderField(rows, index, label); if (next) write(next); return !!next; }}/>
        <BindingInput value={row.template} maxLength={500} suggestions={suggestions} disabled={disabled} ariaLabel={`${index + 1}. alanın değeri`} placeholder="{{sorgu.rows[0].alan}}"
          onChange={(next) => write(rows.map((item, at) => at === index ? { ...item, template: next } : item))}/>
        <select value={row.format} disabled={disabled} aria-label={`${index + 1}. alanın biçimi`}
          onChange={(event) => write(rows.map((item, at) => at === index ? { ...item, format: event.target.value as HeaderFieldFormat | "" } : item))}>
          <option value="">Biçimsiz</option>{HEADER_FIELD_FORMATS.map((format) => <option key={format} value={format}>{FORMAT_LABELS[format]}</option>)}
        </select>
        <BindingInput value={row.unit} maxLength={200} suggestions={suggestions} disabled={disabled} ariaLabel={`${index + 1}. alanın birimi`} placeholder="Birim"
          onChange={(next) => write(rows.map((item, at) => at === index ? { ...item, unit: next } : item))}/>
        <button type="button" className="pd-icon-button" disabled={disabled} aria-label={`${index + 1}. alanı kaldır`} onClick={() => write(rows.filter((_, at) => at !== index))}><X size={12}/></button>
      </div>)}
      {labels.some((label, index) => label.trim() === "" || labels.indexOf(label) !== index) && <small className="pd-query-warning">Alan etiketleri boş olmamalı ve tekil olmalıdır.</small>}
      <button type="button" className="pd-button small" disabled={disabled || rows.length >= MAX_HEADER_FIELDS}
        onClick={() => write([...rows, { label: freeHeaderLabel(rows), template: "", format: "", unit: "" }])}>＋ Alan ekle</button>
    </div>
    <div className="pd-field">Düğmeler<small>Özetin sağında çizilir ve sayfa düğmesi gibi çalışır; seçilen düğmeler sayfadaki yerlerinden kalkar.</small>
      <InputPicker inputs={buttons} value={idList(props.buttons, MAX_HEADER_BUTTONS)} owned={owners} max={MAX_HEADER_BUTTONS} takenLabel="Başka yerde" disabled={disabled}
        onChange={(next) => onPatch({ buttons: next.length > 0 ? next : undefined })}/>
      {buttons.length === 0 && <small>Önce sayfaya bir eylem düğmesi ekleyin.</small>}
    </div>
  </>;
}

/** dataTable `openParam`: sayfa parametresi adı (sunucu: `^[a-z][a-zA-Z0-9]{0,31}$`, yalnız `rowOpenAction` ile). */
export const OPEN_PARAM_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;

/** Listenin "Satır açılınca" düğmesi: Enter ya da çift tıklamada tıklanan satırla çalışır; İşlem Çubuğu'nun Aç'ından önce gelir. */
export function RowOpenActionField({ table, components, labelOf, disabled, onPatch }: {
  table: Component; components: Component[]; labelOf: (component: Component) => string; disabled?: boolean;
  onPatch: (patch: { rowOpenAction?: string; openParam?: string }) => void;
}) {
  const value = typeof table.props.rowOpenAction === "string" ? table.props.rowOpenAction : "";
  const openParam = typeof table.props.openParam === "string" ? table.props.openParam : "";
  const buttons = components.filter((component) => component.type === "button");
  const eligible = buttons.filter((component) => ROW_OPEN_ACTION_TYPES.includes(String(component.props.actionType ?? "")));
  const current = buttons.find((component) => component.id === value);
  const named = typeof table.name === "string" && table.name !== "";
  // Başka sahibi olan düğme (sekme, pencere, başka listenin satır işlemi, özet, İşlem Çubuğu menüsü) seçilemez; bu listenin satır işlemi olabilir.
  const owners = rowActionOwners(components, table.id, labelOf);
  return <div className="pd-rowact-item"><span className="pd-rowact-kind">Satır açılınca</span>
    <select value={value} disabled={disabled || !named} aria-label="Satır açılınca çalışan düğme" onChange={(event) => onPatch(event.target.value ? { rowOpenAction: event.target.value } : { rowOpenAction: undefined, openParam: undefined })}>
      <option value="">Yok (İşlem Çubuğu “Aç” komutu)</option>
      {eligible.map((item) => <option key={item.id} value={item.id} disabled={!!owners[item.id] && item.id !== value}>{labelOf(item)}{item.name ? ` (${item.name})` : ""}{owners[item.id] ? ` — ${owners[item.id]}` : ""}</option>)}
      {value && !eligible.includes(current!) && <option value={value}>{current ? labelOf(current) : value} (uygun değil)</option>}
    </select>
    <small>Enter ya da çift tıklamada bu düğme tıklanan satırla ({named ? `{{${table.name}.seciliSatir…}}` : "liste adı yok"}) çalışır; bu listede İşlem Çubuğu'nun “Aç” komutunun yerine geçer.
      Uygun düğmeler: alana değer ata, sorgu, pencere aç ve gezinme.</small>
    {!named && <small className="pd-query-warning">“Satır açılınca” için listeye bir Ad verin.</small>}
    {value && (!current || !eligible.includes(current)) && <small className="pd-query-warning">Satır açılınca çalışan düğme alana değer ata, sorgu, pencere aç ya da gezinme düğmesi olmalıdır.</small>}
    <label className="pd-field">Sayfa parametresiyle aç
      <input value={openParam} maxLength={32} placeholder="ör. orderId" aria-label="Sayfa parametresiyle aç" disabled={disabled || (!value && !openParam)}
        onChange={(event) => onPatch({ openParam: event.target.value.replace(/[^a-zA-Z0-9]/g, "") || undefined })}/>
      <small>Sayfa bu parametreyle açılınca (<code>{`{{sayfa.parametre.${openParam || "<ad>"}}}`}</code>) liste o kimliği (<code>id</code>) seçer ve “Satır açılınca” düğmesini bir kez çalıştırır.
        Satır yüklü değilse seçimde yalnız <code>id</code> bulunur; açılan pencere kaydı kendi sorgusundan okumalıdır.</small>
      {openParam && !value && <small className="pd-query-warning">“Sayfa parametresiyle aç” için önce “Satır açılınca” düğmesi seçin.</small>}
      {openParam && !OPEN_PARAM_NAME.test(openParam) && <small className="pd-query-warning">Parametre adı küçük harfle başlamalı, en fazla 32 harf/rakam olmalıdır.</small>}
    </label>
  </div>;
}
