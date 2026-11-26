import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, MoreHorizontal, X } from "lucide-react";
import type { ActiveCatalog, CatalogAction } from "../catalogClient";
import { ConditionBuilder, type ConditionPath } from "../ConditionBuilder";
import {
  addSaveStep, afterSaveChoice, commandsBar, commandShown, commandWhenChoice, deleteCommand, moreButtons, newCommand, openCommand, removeSaveStep,
  saveNewPossible, saveSteps, setAfterSave, setCommandWhen, setDeleteCommand, setDeleteConfirmText, setExportTable, setFocusInput, setNewCommand,
  setOpenCommand, setStopOnError, setTitleCount, TEMPLATE_COMMAND_ROWS, titleCountOn, toggleCommand, type TemplateCommandId, type WhenChoice,
} from "./commandsModel";
import { toConsultantText, type FieldToken } from "./consultantText";
import { DraftInput } from "./DraftInput";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { recordKey, recordQuery } from "./recordModel";
import "./component-panel.css";

/** "Hangi ekran" seçiminin sayfaları (kod ve ad). */
export type CommandsPage = { code: string; name: string };
export type CommandsTemplate = "list" | "record" | "free";
export type CommandsSectionProps = {
  def: ModelDefinition; template: CommandsTemplate;
  /** Etkin katalog (Kaydet adımları ve Sil eylemi); `null` etkin sürüm yok demektir. */
  catalog: ActiveCatalog | null;
  pages: CommandsPage[];
  /** Onay metnindeki `{Alan}` ifadeleri ve gönderilen bilgiler için alanlar (`fieldTokens`). */
  tokens: FieldToken[];
  disabled?: boolean;
  onChange: (next: ModelDefinition) => void;
  /** "Koşula göre" kural kurucusunun alanları ve sayfa adları; verilmezse sayfanın sorgu ve bileşen adları. */
  paths?: ConditionPath[]; pageNames?: string[];
};

// Taslak 11 metinleri.
export const COMMANDS_HINT = "göz = çubukta göster";
export const COMMANDS_HIDDEN_SUMMARY = "Çubukta gizli · kısayolu çalışmaz";
export const COMMANDS_HIDDEN_DETAIL = "Gizli komutun ayarları korunur; göz açılınca geri gelir.";
export const COMMANDS_FOOT_NOTE = "Komutların yeri kabuk kuralıyla belirlenir: ana düğme solda, Sil en sağda. Danışman sırayı değiştirmez.";
export const COMMANDS_SAVE_NEW_BAR_ONLY = "Kaydet ve yeni yalnız Komutlar'daki Kaydet ile kullanılır.";
export const COMMANDS_CARD_RULE = "Var olan kayıt yeniden yüklenir, kartta kalınır. Yeni kayıtta kart, kartı açan sekmeye döner; açan yoksa form temizlenir.";
export const COMMANDS_NO_BAR = "Bu sayfada henüz komut çubuğu yok; bir komutu değiştirince çubuk eklenir.";
const MORE_EMPTY = "Boş · menü çizilmez";
const MISSING = "Listede yok";
const CATALOG_MISSING = "Katalogda yok";
const RAW_ACTION = "Standarttan gelen eylem";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const inputsOf = (def: ModelDefinition) => def.components.filter((component) => component.type === "input");
/** Filtre'nin odaklanabileceği alanlar: girişler ve aramalı süzgeç alanı. */
const focusTargets = (def: ModelDefinition) => def.components.filter((component) => component.type === "input" || (component.type === "filterBar" && component.props.search === true));
const focusLabel = (component: ModelComponent) => component.type === "filterBar" ? "Süzgeç alanı araması" : inputLabel(component);
const tablesOf = (def: ModelDefinition) => def.components.filter((component) => component.type === "dataTable");
const inputLabel = (component: ModelComponent) => text(component.props.label) || component.name || "Adsız alan";
const tableLabel = (component: ModelComponent) => text(component.props.title) || component.name || "Adsız liste";
const buttonText = (def: ModelDefinition, id: string) => text(def.components.find((component) => component.id === id)?.props.text) || "Adsız düğme";

/** Kayıt kartında kaydın yeni / var olan olduğu koşulu (modelin "Yalnız yeni kayıtta" ifadesi). */
function recordCondition(def: ModelDefinition, isNew: boolean): string | null {
  const query = recordQuery(def);
  const key = recordKey(def);
  return query && key ? `${query.name}.rows[0].${key} ${isNew ? "==" : "!="} null` : null;
}

type Option = { value: string; label: string; disabled?: boolean };
/** Seçim kutusu; kayıttaki değer seçeneklerde yoksa "Listede yok" olarak gösterilir. */
function Pick({ label, value, options, empty, disabled, onPick }: {
  label: string; value: string; options: Option[]; empty?: string; disabled?: boolean; onPick: (value: string) => void;
}) {
  const known = value === "" || options.some((option) => option.value === value);
  return <label className="cpanel-row">{label}
    <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onPick(event.target.value)}>
      {(empty !== undefined || value === "") && <option value="">{empty ?? "—"}</option>}
      {!known && <option value={value}>{MISSING}</option>}
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select></label>;
}

function Segment<T extends string>({ label, value, options, disabled, onPick }: {
  label: string; value: T | null; options: { value: T; label: string; disabled?: boolean; title?: string }[]; disabled?: boolean; onPick: (value: T) => void;
}) {
  return <div className="cpanel-seg" role="group" aria-label={label}>{options.map((option) =>
    <button type="button" key={option.value} className={value === option.value ? "on" : ""} aria-pressed={value === option.value}
      disabled={disabled || option.disabled} title={option.title} onClick={() => { if (value !== option.value) onPick(option.value); }}>{option.label}</button>)}</div>;
}

const Advanced = ({ children }: { children: ReactNode }) =>
  <details className="cpanel-sub"><summary>Gelişmiş</summary><div className="cpanel-body">{children}</div></details>;
const Note = ({ children }: { children: ReactNode }) => <p className="cpanel-note">{children}</p>;
const Switch = ({ label, on, disabled, onToggle }: { label: string; on: boolean; disabled?: boolean; onToggle: (on: boolean) => void }) =>
  <label className="cpanel-row">{label}<input type="checkbox" role="switch" aria-label={label} checked={on} disabled={disabled}
    onChange={(event) => onToggle(event.target.checked)}/></label>;

const TARGETS = [{ value: "sameTab" as const, label: "Bu sekmede" }, { value: "newTab" as const, label: "Yeni sekmede" }];

/**
 * Kalıplı sayfanın Komutlar bölümü (taslak 11): her standart komut bir satır (göz, ad, kısayol, tek satırlık özet); satıra
 * tıklayınca ayarları açılır, aynı anda bir satır açıktır. Bütün yazımlar komut modelinden (`commandsModel`) geçer; çubuk yalnız
 * bir değişiklikte kurulur.
 */
export function CommandsSection(props: CommandsSectionProps) {
  const { def, template, catalog, pages, tokens, disabled } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  // "Koşula göre" seçilip henüz koşul yazılmamış komutlar.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const change = (next: ModelDefinition) => { if (!disabled && next !== def) props.onChange(next); };
  const actions = catalog?.actions ?? [];
  const actionLabel = (code: string | null) => code ? actions.find((action) => action.code === code)?.label ?? CATALOG_MISSING : RAW_ACTION;
  const pageLabel = (code: string) => { const page = pages.find((item) => item.code === code); return page ? page.name || page.code : code; };
  const pageOptions: Option[] = pages.map((page) => ({ value: page.code, label: page.name || page.code }));
  const inputOptions: Option[] = focusTargets(def).map((component) => ({ value: component.id, label: focusLabel(component) }));
  const tableOptions: Option[] = tablesOf(def).map((component) => ({ value: component.id, label: tableLabel(component) }));
  const pageNames = props.pageNames ?? [...def.queries.map((query) => query.name), ...def.components.map((component) => component.name ?? "")].filter(Boolean);
  const bar = commandsBar(def);
  const barProps = bar?.props ?? {};
  const record = template === "record";
  const steps = saveSteps(def);
  const saveNewHint = record && steps.owner !== "bar";

  const summary = (id: TemplateCommandId): string => {
    switch (id) {
      case "new": {
        const command = newCommand(def);
        return command.action === "clear" ? "Formu temizler" : command.action === "page" && command.pageCode
          ? `${pageLabel(command.pageCode)} açar · ${command.target === "newTab" ? "yeni sekmede" : "bu sekmede"}` : command.action === "button" ? "Eski düğmeye bağlı" : "Bağlı değil";
      }
      case "open": {
        const command = openCommand(def);
        return command.action === "page" && command.pageCode
          ? `${pageLabel(command.pageCode)} açar · ${command.target === "newTab" ? "yeni sekmede" : "bu sekmede"}` : command.action === "button" ? "Eski düğmeye bağlı" : "Bağlı değil";
      }
      case "save":
        if (template === "list") return "—";
        if (!steps.owner) return "Bağlı değil";
        return record ? `${steps.steps.length} adım · ${afterSaveChoice(def) === "card" ? "kartın kuralı"
          : `sonra ${pageLabel(text(barProps.afterSavePageCode)) || "ekran açar"}`}` : `${steps.steps.length} adım`;
      case "saveNew": return saveNewHint ? COMMANDS_SAVE_NEW_BAR_ONLY : "Kaydeder, yeni kayda başlar";
      case "delete": {
        const command = deleteCommand(def);
        return command.owner ? `${actionLabel(command.actionCode)}${command.confirmText ? " · onay metni var" : ""}` : "Bağlı değil";
      }
      case "refresh": return "Sayfayı yeniler";
      case "filter": {
        const input = focusTargets(def).find((component) => component.id === text(barProps.focusInput));
        return input ? `${focusLabel(input)} alanına odaklanır` : "Odak alanı seçilmedi";
      }
      case "print": return "Sayfayı yazdırır";
      case "export": {
        const table = tablesOf(def).find((component) => component.id === text(barProps.exportTable));
        return table ? `${tableLabel(table)} listesi` : "Liste seçilmedi";
      }
    }
  };

  const whenPart = (id: TemplateCommandId) => {
    const { choice, condition } = commandWhenChoice(def, id);
    const shown: WhenChoice = pending[id] ? "cond" : choice;
    const pick = (value: WhenChoice) => {
      setPending((state) => ({ ...state, [id]: value === "cond" }));
      if (value !== "cond") change(setCommandWhen(def, id, value));
    };
    const options: { value: WhenChoice; label: string; disabled?: boolean }[] = record
      ? [{ value: "always", label: "Her zaman" }, { value: "new", label: "Yalnız yeni kayıtta", disabled: !recordCondition(def, true) },
        { value: "edit", label: "Yalnız var olan kayıtta", disabled: !recordCondition(def, false) }, { value: "cond", label: "Koşula göre" }]
      : [{ value: "always", label: "Her zaman" }, { value: "cond", label: "Koşula göre" }];
    return <div className="cpanel-sub" data-part="when">
      <div className="cpanel-q">Ne zaman görünsün?</div>
      <Segment label="Ne zaman görünsün?" value={shown} options={options} disabled={disabled} onPick={pick}/>
      {shown === "cond" && <ConditionBuilder key={id} value={condition ?? undefined} paths={props.paths ?? []} pageNames={pageNames} disabled={disabled} prop="commandWhen"
        onChange={(next) => change(setCommandWhen(def, id, next ? "cond" : "always", next))}/>}
    </div>;
  };

  const legacyButton = (id: string | null) => id
    ? <div className="cpanel-row">Eski düğme bağı<span className="cpanel-chip on">{buttonText(def, id)}</span></div> : null;

  const detail = (id: TemplateCommandId): ReactNode => {
    switch (id) {
      case "new": {
        const command = newCommand(def);
        const action = command.action === "clear" || command.action === "page" ? command.action : null;
        const toggleInput = (inputId: string) => change(setNewCommand(def, { inputs: command.inputs.includes(inputId)
          ? command.inputs.filter((item) => item !== inputId) : [...command.inputs, inputId] }));
        return <>
          <div className="cpanel-q">Ne yapsın?</div>
          <Segment label="Ne yapsın?" value={action} disabled={disabled} options={[{ value: "clear", label: "Formu temizle" }, { value: "page", label: "Ekran aç" }]}
            onPick={(value) => change(value === "clear"
              ? setNewCommand(def, { action: "clear", ...(command.inputs.length === 0 ? { inputs: inputsOf(def).map((component) => component.id) } : {}) })
              : setNewCommand(def, { action: "page", pageCode: command.pageCode || pages[0]?.code || "", target: command.target }))}/>
          {action === "page" && <>
            <Pick label="Hangi ekran" value={command.pageCode} options={pageOptions} disabled={disabled} onPick={(value) => change(setNewCommand(def, { pageCode: value }))}/>
            <div className="cpanel-row">Nerede<Segment label="Nerede" value={command.target} options={TARGETS} disabled={disabled}
              onPick={(value) => change(setNewCommand(def, { target: value }))}/></div>
          </>}
          <Advanced>
            <div className="cpanel-q">Temizlenecek alanlar</div>
            <div className="cpanel-chips" role="group" aria-label="Temizlenecek alanlar">{inputsOf(def).map((component) => {
              const on = command.inputs.includes(component.id);
              return <button type="button" key={component.id} className={`cpanel-chip${on ? " on" : ""}`} aria-pressed={on} disabled={disabled}
                onClick={() => toggleInput(component.id)}>{inputLabel(component)}</button>;
            })}</div>
            <Note>Yalnız "Formu temizle"de kullanılır.</Note>
            {legacyButton(command.legacyButton)}
          </Advanced>
        </>;
      }
      case "open": {
        const command = openCommand(def);
        const table = command.table || tablesOf(def)[0]?.id || "";
        return <>
          <Pick label="Hangi ekran" value={command.pageCode} options={pageOptions} disabled={disabled}
            onPick={(value) => change(setOpenCommand(def, { pageCode: value, table }))}/>
          <div className="cpanel-row">Nerede<Segment label="Nerede" value={command.target} options={TARGETS} disabled={disabled || !command.pageCode}
            onPick={(value) => change(setOpenCommand(def, { target: value, table }))}/></div>
          <Note>Görüntüle aynı ekranı salt okunur açar; Düzenle gizlenince o da gizlenir.</Note>
          <Advanced>
            <Pick label="Hangi liste" value={command.table} options={tableOptions} disabled={disabled || !command.pageCode} onPick={(value) => change(setOpenCommand(def, { table: value }))}/>
            <div className="cpanel-q">Gönderilen bilgi</div>
            <div className="cpanel-chips">{command.params.length === 0 ? <span className="cpanel-note">—</span> : command.params.map((item) => {
              const at = item.indexOf("=");
              return <span key={item} className="cpanel-chip">{`${item.slice(0, at)} = ${toConsultantText(item.slice(at + 1), tokens).text}`}</span>;
            })}</div>
            {legacyButton(command.legacyButton)}
          </Advanced>
        </>;
      }
      case "save": {
        if (template === "list") return <Note>Liste sayfası kaydetmez; Kaydet çubukta yoktur.</Note>;
        const catalogSteps = steps.steps.filter((step) => !step.raw);
        const rawSteps = steps.steps.filter((step) => step.raw);
        const whenLabel = (when: string | null) => when === null ? "Her zaman" : when === recordCondition(def, true) ? "Yeni kayıtta"
          : when === recordCondition(def, false) ? "Var olan kayıtta" : "Koşula göre";
        const addable = actions.filter((action) => action.kind !== "delete");
        const after = afterSaveChoice(def);
        const afterPage = { pageCode: text(barProps.afterSavePageCode), target: barProps.afterSaveTarget === "newTab" ? "newTab" as const : "sameTab" as const,
          refresh: barProps.afterSaveRefresh === true };
        const writeAfter = (patch: Partial<typeof afterPage>) => change(setAfterSave(def, "page", { ...afterPage, ...patch }));
        return <>
          <div className="cpanel-q">Kaydetme sırası</div>
          {catalogSteps.length > 0 && <ol className="cpanel-steps">{catalogSteps.map((step, index) => {
            const label = actionLabel(step.label);
            return <li key={step.queryId} className="cpanel-row"><span><b>{`${index + 1}.`}</b> {label}</span><small className="cpanel-note">{whenLabel(step.when)}</small>
              <button type="button" className="cpanel-btn" aria-label={`${label} kaldır`} disabled={disabled} onClick={() => change(removeSaveStep(def, step.queryId))}><X size={13}/></button></li>;
          })}</ol>}
          {record && <select className="cpanel-add" aria-label="Adım ekle" value="" disabled={disabled}
            onChange={(event) => { const action = addable.find((item) => item.code === event.target.value); if (action) change(addSaveStep(def, action)); }}>
            <option value="">+ Adım ekle</option>
            {addable.map((action: CatalogAction) => <option key={action.code} value={action.code} disabled={addSaveStep(def, action) === def}>{action.label}</option>)}
          </select>}
          <Switch label="Bir adım hata verirse dur" on={steps.stopOnError} disabled={disabled || !steps.owner} onToggle={(on) => change(setStopOnError(def, on))}/>
          <Note>Adımlar yazılımcının hazırladığı eylemlerdir; yetki ve onay sorusu ondan gelir.</Note>
          {rawSteps.length > 0 && <Advanced>
            <div className="cpanel-q">Standarttan gelen adımlar (salt okunur)</div>
            <ol className="cpanel-steps">{rawSteps.map((step) => <li key={step.queryId}>{step.label}{step.when !== null && <small className="cpanel-note"> · koşullu</small>}</li>)}</ol>
          </Advanced>}
          {record && <>
            <div className="cpanel-q">Kaydettikten sonra</div>
            <Segment label="Kaydettikten sonra" value={after} disabled={disabled} options={[{ value: "card", label: "Kartın kuralı" },
              { value: "page", label: "Ekran aç", disabled: steps.owner !== "bar" && after !== "page", title: steps.owner !== "bar" ? "Yalnız Komutlar'daki Kaydet ile kullanılır." : undefined }]}
              onPick={(value) => change(value === "card" ? setAfterSave(def, "card") : setAfterSave(def, "page", { ...afterPage, pageCode: afterPage.pageCode || pages[0]?.code || "" }))}/>
            {after === "card" ? <Note>{COMMANDS_CARD_RULE}</Note> : <>
              <Pick label="Hangi ekran" value={afterPage.pageCode} options={pageOptions} disabled={disabled} onPick={(value) => writeAfter({ pageCode: value })}/>
              <div className="cpanel-row">Nerede<Segment label="Nerede" value={afterPage.target} options={TARGETS} disabled={disabled} onPick={(value) => writeAfter({ target: value })}/></div>
              <Switch label="Açılan ekranı yenile" on={afterPage.refresh} disabled={disabled} onToggle={(on) => writeAfter({ refresh: on })}/>
            </>}
          </>}
        </>;
      }
      case "saveNew": return <>
        <Note>Kaydeder; başarılı olursa "Kaydettikten sonra" yerine Yeni'yi çalıştırır. Kaydet ya da Yeni gizliyse bu da gizlidir.</Note>
        {saveNewHint && <Note>{COMMANDS_SAVE_NEW_BAR_ONLY}</Note>}
      </>;
      case "delete": {
        const command = deleteCommand(def);
        const value = command.actionCode ?? (command.owner ? "__standart" : "");
        const options: Option[] = [
          ...(command.owner && !command.actionCode ? [{ value: "__standart", label: RAW_ACTION }] : []),
          ...actions.filter((action) => action.kind === "delete" && (action.code === command.actionCode || setDeleteCommand(def, action) !== def))
            .map((action) => ({ value: action.code, label: action.label })),
        ];
        return <>
          <Pick label="Silme eylemi" value={value} options={options} empty="—" disabled={disabled} onPick={(code) => {
            if (code === "__standart") return;
            const action = actions.find((item) => item.code === code);
            change(setDeleteCommand(def, action ?? null));
          }}/>
          <div className="cpanel-q">Onay metni</div>
          <DraftInput head label="Onay metni" value={toConsultantText(command.confirmText, tokens).text} maxLength={300} disabled={disabled || !command.owner}
            onCommit={(next) => change(setDeleteConfirmText(def, next, tokens))}/>
          <Note>Boşsa "Kayıt silinsin mi?" sorulur.{template === "list" ? " Alanlar seçili satırdan doldurulur." : record ? " Yeni kayıtta Sil gösterilmez." : ""}</Note>
        </>;
      }
      case "filter": return <>
        <Pick label="Odaklanacak alan" value={text(barProps.focusInput)} options={inputOptions} empty="—" disabled={disabled} onPick={(value) => change(setFocusInput(def, value || null))}/>
        <Note>Filtre (Ctrl+F) bu alana odaklanır.</Note>
      </>;
      case "export": return <>
        <Pick label="Hangi liste" value={text(barProps.exportTable)} options={tableOptions} empty="—" disabled={disabled} onPick={(value) => change(setExportTable(def, value || null))}/>
        <Note>Görünen satırlar Excel olarak iner; "CSV olarak dışa aktar" menüdedir.</Note>
      </>;
      case "print": return <Note>Sayfayı yazdırır.</Note>;
      case "refresh": return <Note>Sayfanın sorgularını yeniden çalıştırır. Ayarı yok.</Note>;
    }
  };

  const rows = TEMPLATE_COMMAND_ROWS[template].map(({ id, label, key }) => {
    const shown = commandShown(def, id);
    const open = openId === id;
    const { choice } = commandWhenChoice(def, id);
    const chip = choice === "new" ? "yeni kayıtta" : choice === "edit" ? "var olan kayıtta" : choice === "cond" ? "koşul" : null;
    const eyeBlocked = id === "saveNew" && !shown && !saveNewPossible(def);
    return <div key={id} role="listitem" className={`pd-cmd-row${shown ? "" : " is-hidden"}${open ? " is-open" : ""}`}>
      <div className="pd-cmd-row-head">
        <button type="button" className="pd-cmd-eye" aria-label={shown ? "Gizle" : "Göster"} aria-pressed={!shown}
          title={eyeBlocked ? (saveNewHint ? COMMANDS_SAVE_NEW_BAR_ONLY : "Kaydet ve Yeni gerekli.") : shown ? `${label} çubukta gizlensin` : `${label} çubukta gösterilsin`}
          disabled={disabled || eyeBlocked} onClick={() => change(toggleCommand(def, id))}>{shown ? <Eye size={15}/> : <EyeOff size={15}/>}</button>
        <button type="button" className="pd-cmd-row-main" aria-expanded={open} onClick={() => setOpenId(open ? null : id)}>
          <span className="pd-cmd-row-title"><b className="pd-cmd-name">{label}</b><span className="pd-action-key">{key}</span>
            {shown && chip && <span className="pd-cmd-chip">{chip}</span>}</span>
          <small className="pd-cmd-summary">{shown || (id === "saveNew" && saveNewHint) ? summary(id) : COMMANDS_HIDDEN_SUMMARY}</small>
          <span className="pd-cmd-chevron" aria-hidden="true">{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</span>
        </button>
      </div>
      {open && <div className="pd-cmd-row-detail">{shown ? <>{whenPart(id)}{detail(id)}</> : <>
        <Note>{COMMANDS_HIDDEN_DETAIL}</Note>{id === "saveNew" && saveNewHint && <Note>{COMMANDS_SAVE_NEW_BAR_ONLY}</Note>}</>}</div>}
    </div>;
  });

  const more = moreButtons(def);
  const moreOpen = openId === "more";
  const moreSummary = more.length === 0 ? MORE_EMPTY
    : `${more.length} düğme · ${more.slice(0, 2).map((id) => buttonText(def, id)).join(", ")}${more.length > 2 ? "…" : ""}`;
  const titleCount = titleCountOn(def);

  return <section className="cpanel-sec" data-part="commands">
    <h4 className="cpanel-row">Komutlar <small className="cpanel-note">{COMMANDS_HINT}</small></h4>
    {!bar && <Note>{COMMANDS_NO_BAR}</Note>}
    <div className="pd-cmd-rows" role="list">
      {rows}
      <div role="listitem" className={`pd-cmd-row${moreOpen ? " is-open" : ""}`}>
        <div className="pd-cmd-row-head">
          <span className="pd-cmd-eye is-none" aria-hidden="true"><MoreHorizontal size={15}/></span>
          <button type="button" className="pd-cmd-row-main" aria-expanded={moreOpen} onClick={() => setOpenId(moreOpen ? null : "more")}>
            <span className="pd-cmd-row-title"><b className="pd-cmd-name">Diğer menüsü</b><span className="pd-action-key">Alt+İ</span></span>
            <small className="pd-cmd-summary">{moreSummary}</small>
            <span className="pd-cmd-chevron" aria-hidden="true">{moreOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</span>
          </button>
        </div>
        {moreOpen && <div className="pd-cmd-row-detail">{more.length === 0 ? <Note>{MORE_EMPTY}</Note>
          : <div className="cpanel-chips">{more.map((id) => <span key={id} className="cpanel-chip">{buttonText(def, id)}</span>)}</div>}</div>}
      </div>
    </div>
    {template === "list" && <Switch label="Başlıkta kayıt sayısı" on={titleCount} disabled={disabled || (!titleCount && setTitleCount(def, true) === def)}
      onToggle={(on) => change(setTitleCount(def, on))}/>}
    <Note>{COMMANDS_FOOT_NOTE}</Note>
  </section>;
}
