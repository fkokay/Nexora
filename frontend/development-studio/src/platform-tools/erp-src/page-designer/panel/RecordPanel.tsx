import { useEffect, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { RECORD_SOURCE_HINT } from "../pageTemplates";
import type { ConditionPath } from "../ConditionBuilder";
import { CommandsSection, type CommandsPage } from "./CommandsSection";
import { saveSteps } from "./commandsModel";
import { CustomFieldsPanel } from "./ExtrasPanels";
import { customFieldsOf } from "./extrasModel";
import { ComponentPanel } from "./ComponentPanel";
import { DialogsSection } from "./DialogsSection";
import { fieldTokens, type FieldToken } from "./consultantText";
import { labelMap, stringList, MAX_LIST_COLUMNS, type ModelComponent, type ModelDefinition } from "./listPanelModel";
import {
  addCustomFields, addExtraAction, addLines, chooseRecordSource, extraActions, fieldKey, fieldLocks, fieldRemovalBlocked, linesSourceUsable,
  missingRecordColumns, recordActionUsable, recordKey, recordQuery, recordSourceUsable, recordTabs, removeBlock, removeExtraAction, removeField,
  removeSection, saveActions, setFieldProps, setLinesProps, setNoteText, setSaveActions, setSectionColumns, setSectionTitle,
  sectionRemovalBlocked, setSummary, MAX_SUMMARY_SUBTITLE, MAX_SUMMARY_VALUES,
} from "./recordModel";
import { recordSelectionOf, type RecordSelection } from "./templateGuards";
import "./component-panel.css";

export { recordSelectionOf, type RecordSelection };
export type ExtraAreaType = { type: string; label: string };
export type RecordPanelProps = {
  def: ModelDefinition;
  /** Etkin katalog, ERP işlemine dayanan öğeleri `withOperationParameters` ile zenginleştirilmiş; `null` etkin sürüm yok demektir. */
  catalog: ActiveCatalog | null;
  selection: RecordSelection;
  onChange: (def: ModelDefinition) => void;
  onSelect: (selection: RecordSelection) => void;
  /** "Yazılımcıdan iste →" tıklanınca (geçişi çağıran yapar: kaydedilmemiş değişiklik onayı ve adres). */
  onAskDeveloper?: () => void;
  catalogStatus?: "loading" | "ready" | "failed";
  disabled?: boolean;
  /** Sayfanın adı (Sayfa panelinin "Ad"ı). */
  name?: string; onRename?: (name: string) => void;
  /** Bileşenin "Ne zaman görünsün?" seçicisi (Liste panelindeki `visibleWhen` seçicisi); verilmezse yalnız "Her zaman". */
  visibility?: (componentId: string) => ReactNode;
  /** Özel alan bloğunun "Ne zaman salt okunur" seçicisi. */
  readOnlyWhen?: (componentId: string) => ReactNode;
  /** Kartın üstüne / altına konabilecek ek alan türleri ve ekleme (Liste'deki ek alan yolu). */
  extraTypes?: ExtraAreaType[]; onAddExtra?: (type: string) => void;
  /** Komutlar bölümü: "Hangi ekran" seçiminin sayfaları, onay metninin alanları (verilmezse kaydın kolonları), kural kurucunun alanları. */
  pages?: CommandsPage[]; tokens?: FieldToken[]; paths?: ConditionPath[]; pageNames?: string[];
  /** Pencereler bölümü: tuvalde açık tutulan pencere ve seçimi (tuvale `showDialog`); verilmezse seçim bölümün içindedir. */
  shownDialog?: string | null; onShowDialog?: (dialogId: string | null) => void;
};

export const RECORD_SAVE_IN_COMMANDS = "Bu kartın Kaydet'i Komutlar'dadır; adımları Komutlar › Kaydet'te düzenlenir.";

export const RECORD_LOCK_NOTE = "Kilitli olanları yazılımcı belirledi; danışman yalnız kuralı sıkılaştırabilir.";
export const RECORD_COLUMNS_NOTE = "Dar alanda en çok 2, telefonda 1 kolon olur. Uzun metin ve satır tablosu her zaman tam genişliktir.";
export const RECORD_MISSING_IN_CATALOG = "Katalogda yok";
const LINES_PAGE_SIZES = [10, 25] as const;
/** Sayfa adının en çok uzunluğu (sayfa ayarlarındaki eski "Sayfa adı" kutusuyla aynı). */
const MAX_PAGE_NAME = 120;

const TYPE_LABELS: Record<string, string> = { text: "Metin", int: "Tam sayı", decimal: "Ondalık", date: "Tarih", bool: "Evet / Hayır", guid: "Kimlik" };
/** Katalog kolonunun danışman dilindeki türü (uzun metin ayrı). */
export function columnTypeLabel(column: Pick<CatalogColumn, "type" | "longText">): string {
  return column.type === "text" && column.longText ? "Uzun metin" : TYPE_LABELS[column.type] ?? column.type;
}

const slotOf = (component: ModelComponent) => typeof component.props.slot === "string" ? component.props.slot : "";
const text = (value: unknown) => typeof value === "string" ? value : "";

/**
 * Metin kutusu: model boş değeri yok sayar ve kırpar; yazılan taslak yerelde tutulur, değer yalnız gerçekten değişince
 * (ör. geri alma) yeniden okunur. Boş bırakılıp çıkılırsa kayıttaki değere döner.
 */
function DraftText({ label, value, onCommit, multiline, placeholder, maxLength = 120, disabled }: {
  label: string; value: string; onCommit: (value: string) => void; multiline?: boolean; placeholder?: string; maxLength?: number; disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft((current) => current.trim() === value.trim() ? current : value); }, [value]);
  const common = {
    className: "cpanel-txt", value: draft, placeholder, maxLength, disabled,
    onChange: (event: { target: { value: string } }) => { setDraft(event.target.value); onCommit(event.target.value); },
    onBlur: () => { if (draft.trim() !== value.trim()) setDraft(value); },
  };
  return <label className="cpanel-q">{label}{multiline ? <textarea rows={4} {...common}/> : <input {...common}/>}</label>;
}

function Shell({ kind, children }: { kind: string; children: ReactNode }) {
  return <div className="cpanel cpanel-record"><div className="cpanel-head cpanel-kind"><b>{kind}</b></div>{children}</div>;
}
const Appearance = ({ children }: { children: ReactNode }) =>
  <section className="cpanel-sec" data-part="appearance"><details><summary>Görünüm</summary><div className="cpanel-body">{children}</div></details></section>;

function AskLink({ onAskDeveloper }: { onAskDeveloper?: () => void }) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => { if (!onAskDeveloper) return; event.preventDefault(); onAskDeveloper(); };
  return <a href="#my-requests" onClick={click}>Yazılımcıdan iste →</a>;
}

// Kayıt özetinin bugünkü değerleri (yalnız kayıt satırına bağlı olanlar okunur).
const ROW_COLUMN = /^\{\{kayit\.rows\[0\]\.([^\s{}]+)\}\}$/;
const rowColumn = (value: string) => ROW_COLUMN.exec(value.trim())?.[1] ?? null;
function summaryState(def: ModelDefinition) {
  const summary = def.components.find((component) => component.type === "recordHeader" && slotOf(component) === "summary");
  const title = summary ? rowColumn(text(summary.props.title)) : null;
  const subtitle = summary ? text(summary.props.subtitle).split("·").map(rowColumn).filter((column): column is string => !!column) : [];
  const values = summary ? stringList(summary.props.fields).flatMap((item) => {
    const at = item.indexOf("=");
    const column = at > 0 ? rowColumn(item.slice(at + 1)) : null;
    return column ? [{ column, label: item.slice(0, at) }] : [];
  }) : [];
  return { title, subtitle, values };
}

/** Kayıt kartının özellikler paneli (taslak 08): seçime göre sayfa, bölüm, alan, satır tablosu ya da açıklama metni. Sekme yok. */
export function RecordPanel(props: RecordPanelProps) {
  const { selection } = props;
  if (selection.kind === "section") return <SectionPanel {...props} id={selection.id} key={selection.id}/>;
  if (selection.kind === "field") return <FieldPanel {...props} id={selection.id} key={selection.id}/>;
  if (selection.kind === "lines") return <LinesPanel {...props} id={selection.id} key={selection.id}/>;
  if (selection.kind === "note") return <NotePanel {...props} id={selection.id} key={selection.id}/>;
  if (selection.kind === "customFields") return <CustomFieldsPanel def={props.def} id={selection.id} key={selection.id} disabled={props.disabled}
    onChange={(next) => { if (!props.disabled && next !== props.def) props.onChange(next); }} visibility={props.visibility?.(selection.id)} readOnlyWhen={props.readOnlyWhen?.(selection.id)}/>;
  return <PagePanel {...props}/>;
}

type PartProps = RecordPanelProps & { id: string };
const changeOf = (props: RecordPanelProps) => (next: ModelDefinition) => { if (!props.disabled && next !== props.def) props.onChange(next); };
const recordSourceOf = (def: ModelDefinition, catalog: ActiveCatalog | null) => {
  const code = recordQuery(def)?.dataSource;
  return code ? catalog?.dataSources.find((source) => source.code === code) : undefined;
};
const keyLabelOf = (def: ModelDefinition, catalog: ActiveCatalog | null) => {
  const key = recordKey(def);
  const column = key ? recordSourceOf(def, catalog)?.columns.find((item) => item.code === key) : undefined;
  return key ? (column?.label.trim() || key).toLocaleLowerCase("tr") : null;
};

function catalogNote(props: RecordPanelProps): ReactNode {
  if (props.catalogStatus === "loading") return <p className="cpanel-note">Katalog yükleniyor…</p>;
  if (props.catalogStatus === "failed") return <p className="cpanel-warn">Katalog okunamadı.</p>;
  if (!props.catalog) return <p className="cpanel-note">Etkin katalog sürümü yok; kart için yazılımcıdan bir veri kaynağı isteyin.</p>;
  return null;
}

function PagePanel(props: RecordPanelProps) {
  const { def, catalog, disabled } = props;
  const change = changeOf(props);
  const sources = catalog?.dataSources ?? [];
  const actions = catalog?.actions ?? [];
  const code = recordQuery(def)?.dataSource;
  const source = recordSourceOf(def, catalog);
  const key = recordKey(def);
  const keyLabel = keyLabelOf(def, catalog);
  const missing = catalog && key ? missingRecordColumns(def, catalog) : [];
  const byCode = (value: string | null) => value ? actions.find((action) => action.code === value) ?? null : null;

  const choose = (item: CatalogDataSource) => {
    if (!catalog || item.code === code) return;
    // Kaynak değişince kart yeniden kurulur; geri alma (Ctrl+Z) eski kartı getirir.
    change(chooseRecordSource(def, item, catalog));
    props.onSelect({ kind: "page" });
  };
  const what = <>
    {catalogNote(props) ?? <ul className="cpanel-sources" aria-label="Kayıt kaynakları">{sources.map((item) => {
      const usable = recordSourceUsable(item);
      const on = item.code === code;
      return <li key={item.code} className={`${on ? "on" : ""}${usable.usable ? "" : " is-dim"}`}>
        <label><input type="radio" name="kart-kaynak" checked={on} disabled={disabled || (!on && !usable.usable)} onChange={() => choose(item)}/>{item.label}</label>
        {!usable.usable && <small>{usable.reason}</small>}
      </li>;
    })}{code && !source && <li className="on is-missing"><label><input type="radio" checked readOnly disabled/>{code}</label><small>{RECORD_MISSING_IN_CATALOG}</small></li>}</ul>}
    {!code && catalog && <p className="cpanel-note">{RECORD_SOURCE_HINT}</p>}
    {source && keyLabel && <div className="cpanel-dev">Yazılımcının hazırladığı · kayıt <b>{keyLabel}</b> ile okunur. Listede “Kartı aç” bu kartı bu bilgiyle açar.</div>}
    {missing.length > 0 && <p className="cpanel-warn" role="status">{RECORD_MISSING_IN_CATALOG}: {missing.join(", ")}</p>}
  </>;

  const saved = saveActions(def);
  // Kaydet Komutlar'daysa (dönüştürülmüş kart) Kaydet düğmesi kurulamaz: kartta iki Kaydet olamaz.
  const saveOwner = saveSteps(def).owner;
  const barSaves = saveOwner === "bar";
  const actionChoice = (label: string, kind: CatalogAction["kind"], current: string | null, empty: string, pick: (action: CatalogAction | null) => void, blocked: string | null = null) =>
    <><label className="cpanel-row">{label}
      <select aria-label={label} value={current ?? ""} disabled={disabled || !key || blocked !== null || barSaves} title={blocked ?? undefined} onChange={(event) => pick(byCode(event.target.value))}>
        <option value="">{empty}</option>
        {actions.filter((action) => action.kind === kind).map((action) => {
          const usable = action.code === current ? { usable: true as const } : recordActionUsable(def, action);
          return <option key={action.code} value={action.code} disabled={!usable.usable}>{action.label}{usable.usable ? "" : ` · ${usable.reason}`}</option>;
        })}
        {current && !byCode(current) && <option value={current}>{`${current} · ${RECORD_MISSING_IN_CATALOG}`}</option>}
      </select></label>{blocked && <p className="cpanel-note">{blocked}</p>}</>;
  // Kaydet iki eylemi birlikte yazar: öteki taraf katalogdan kalkmışsa bu taraf değiştirilince o da sessizce düşerdi.
  // Önce katalogda olmayan taraf yeniden seçilir (kendi tarafı katalogdan kalkmış seçim kilitlenmez).
  const saveBlocked = (own: string | null, other: string | null, otherLabel: string) =>
    other && !byCode(other) && !(own && !byCode(own)) ? `“${otherLabel}” eylemi katalogda yok; önce onu yeniden seçin.` : null;
  const summary = summaryState(def);
  const columns = source?.columns ?? [];
  const columnLabel = (column: string) => columns.find((item) => item.code === column)?.label || column;
  const writeSummary = (title: string, subtitle: string[], values: { column: string; label: string }[]) => change(setSummary(def, title, subtitle, values, columns));
  const toggleSubtitle = (column: string) => writeSummary(summary.title ?? "", summary.subtitle.includes(column)
    ? summary.subtitle.filter((item) => item !== column) : [...summary.subtitle, column], summary.values);
  const toggleValue = (column: string) => writeSummary(summary.title ?? "", summary.subtitle, summary.values.some((item) => item.column === column)
    ? summary.values.filter((item) => item.column !== column) : [...summary.values, { column, label: columnLabel(column) }]);
  const chips = (on: (column: string) => boolean, full: boolean, toggle: (column: string) => void, label: string) =>
    <div className="cpanel-chips" role="group" aria-label={label}>{columns.map((column) => {
      const active = on(column.code);
      return <button type="button" key={column.code} className={`cpanel-chip${active ? " on" : ""}`} aria-pressed={active}
        disabled={disabled || (!active && full)} onClick={() => toggle(column.code)}>{column.label || column.code}</button>;
    })}</div>;

  const basics = <>
    <div className="cpanel-sub" data-part="save"><h4>Kaydet düğmesi</h4>
      {actionChoice("Yeni kayıtta", "insert", saved.insert, "—", (action) => change(setSaveActions(def, action, byCode(saved.update))), saveBlocked(saved.insert, saved.update, "Var olan kayıtta"))}
      {actionChoice("Var olan kayıtta", "update", saved.update, "—", (action) => change(setSaveActions(def, byCode(saved.insert), action)), saveBlocked(saved.update, saved.insert, "Yeni kayıtta"))}
      {barSaves ? <p className="cpanel-note">{RECORD_SAVE_IN_COMMANDS}</p>
        : key && saveOwner === null && <p className="cpanel-warn" role="status">Kaydet düğmesi bir eyleme bağlı değil; kart kaydedilemez.</p>}
      <p className="cpanel-note">Eylemin her bilgisi aynı adlı alandan alınır. Bilgisi kartta olmayan eylem seçilemez.</p>
    </div>
    <div className="cpanel-sub" data-part="summary"><h4>Öne çıkan değerler</h4>
      {!source ? <p className="cpanel-note">{RECORD_SOURCE_HINT}</p> : <>
        <label className="cpanel-row">Başlık<select aria-label="Başlık" value={summary.title ?? ""} disabled={disabled} onChange={(event) => writeSummary(event.target.value, summary.subtitle, summary.values)}>
          <option value="">—</option>
          {columns.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}
        </select></label>
        <div className="cpanel-q">Alt satır</div>
        {chips((column) => summary.subtitle.includes(column), summary.subtitle.length >= MAX_SUMMARY_SUBTITLE, toggleSubtitle, "Alt satır")}
        <div className="cpanel-q">Değerler</div>
        {chips((column) => summary.values.some((item) => item.column === column), summary.values.length >= MAX_SUMMARY_VALUES, toggleValue, "Değerler")}
      </>}
      <p className="cpanel-note">En çok 3 değer.</p>
    </div>
    <CustomFieldsAdd def={def} disabled={disabled} onChange={change} onSelect={props.onSelect}/>
  </>;

  const extras = extraActions(def);
  const addable = actions.filter((action) => action.kind !== "delete" && !extras.includes(action.code) && action.code !== saved.insert && action.code !== saved.update);
  const actionsPart = <>
    <div className="cpanel-chips">
      {extras.map((item) => { const label = byCode(item)?.label ?? `${item} · ${RECORD_MISSING_IN_CATALOG}`;
        return <button type="button" key={item} className={`cpanel-chip on${byCode(item) ? "" : " is-missing"}`} aria-label={`${label} kaldır`} disabled={disabled}
          onClick={() => change(removeExtraAction(def, item))}>{label} ✕</button>; })}
    </div>
    {addable.length > 0 && <select className="cpanel-add" aria-label="Eylem ekle" value="" disabled={disabled || !key} onChange={(event) => { const action = byCode(event.target.value); if (action) change(addExtraAction(def, action)); }}>
      <option value="">+ Eylem</option>
      {addable.map((action) => { const usable = recordActionUsable(def, action);
        return <option key={action.code} value={action.code} disabled={!usable.usable}>{action.label}{usable.usable ? "" : ` · ${usable.reason}`}</option>; })}
    </select>}
    <div className="cpanel-dev">İşlem çubuğunda Kaydet ile Sil arasında durur. Bu eylemleri yazılımcı hazırlar.</div>
  </>;

  const appearance = <>
    <div className="cpanel-row">Kartın üstüne / altına ek alan
      {props.onAddExtra && (props.extraTypes?.length ?? 0) > 0 && <select className="cpanel-add" aria-label="Ek alan ekle" value="" disabled={disabled}
        onChange={(event) => { if (event.target.value) props.onAddExtra!(event.target.value); }}>
        <option value="">+ Ekle</option>
        {props.extraTypes!.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
      </select>}</div>
    <p className="cpanel-note">Ek alan eklenince sayfa 2. basamağa geçer.</p>
  </>;

  return <ComponentPanel nameLabel="Ad" name={props.name ?? ""} onRename={(value) => props.onRename?.(value.slice(0, MAX_PAGE_NAME))} nameReadOnly={!props.onRename || disabled} namePlaceholder="Sayfa adı"
    whatTitle="Hangi kayıt gösterilsin?" basicsTitle={null} actionsTitle="Ek eylemler" what={what} basics={basics} actions={actionsPart} appearance={appearance}>
    <CommandsSection def={def} template="record" catalog={catalog} pages={props.pages ?? []} tokens={props.tokens ?? fieldTokens(def, catalog)}
      paths={props.paths} pageNames={props.pageNames} disabled={disabled} onChange={change}/>
    <DialogsSection def={def} catalog={catalog} disabled={disabled} onChange={change} shownDialog={props.shownDialog} onShowDialog={props.onShowDialog}/>
    <div className="cpanel-ask"><b>Aradığın alan ya da eylem yok mu?</b> <AskLink onAskDeveloper={props.onAskDeveloper}/></div>
  </ComponentPanel>;
}

/** "+ Özel alan bloğu ekle": sayfada en çok bir blok, tam bir sekmede (spec: Kayıt kartı). */
function CustomFieldsAdd({ def, disabled, onChange, onSelect }: { def: ModelDefinition; disabled?: boolean; onChange: (def: ModelDefinition) => void; onSelect: (selection: RecordSelection) => void }) {
  const tabs = recordTabs(def);
  const [tab, setTab] = useState(0);
  const existing = customFieldsOf(def);
  return <div className="cpanel-sub" data-part="custom-fields"><h4>Özel alanlar</h4>
    {existing ? <p className="cpanel-note">Sayfada bir özel alan bloğu var; sekmeden seçerek düzenleyin.</p> : <>
      <label className="cpanel-row">Sekme<select aria-label="Özel alan bloğunun sekmesi" value={Math.min(tab, Math.max(tabs.length - 1, 0))} disabled={disabled || tabs.length === 0}
        onChange={(event) => setTab(Number(event.target.value))}>{tabs.map((item, index) => <option key={index} value={index}>{item.label}</option>)}</select></label>
      <button type="button" className="cpanel-btn" disabled={disabled || tabs.length === 0} onClick={() => {
        const added = addCustomFields(def, Math.min(tab, tabs.length - 1));
        if (added.blockId) { onChange(added.def); onSelect({ kind: "customFields", id: added.blockId }); }
      }}>+ Özel alan bloğu ekle</button></>}
  </div>;
}

const visibilityOf = (props: RecordPanelProps, id: string) => <>
  <div className="cpanel-q">Ne zaman görünsün?</div>
  {props.visibility?.(id) ?? <div className="cpanel-seg"><button type="button" className="on" disabled>Her zaman</button></div>}
</>;

function SectionPanel(props: PartProps) {
  const { def, id, disabled } = props;
  const change = changeOf(props);
  const section = def.components.find((component) => component.id === id);
  if (!section) return null;
  const columns = section.props.columns === 1 || section.props.columns === 3 ? section.props.columns : 2;
  const blocked = sectionRemovalBlocked(def, id);
  return <Shell kind="Bölüm">
    <section className="cpanel-sec" data-part="name">
      <DraftText label="Başlık" value={text(section.props.title)} disabled={disabled} onCommit={(value) => change(setSectionTitle(def, id, value))}/>
    </section>
    <section className="cpanel-sec" data-part="basics">
      <div className="cpanel-q">Kolon sayısı</div>
      <div className="cpanel-seg" role="group" aria-label="Kolon sayısı">{([1, 2, 3] as const).map((count) =>
        <button type="button" key={count} className={columns === count ? "on" : ""} aria-pressed={columns === count} disabled={disabled}
          onClick={() => change(setSectionColumns(def, id, count))}>{`${count} kolon`}</button>)}</div>
      <p className="cpanel-note">{RECORD_COLUMNS_NOTE}</p>
    </section>
    <Appearance>{visibilityOf(props, id)}</Appearance>
    <section className="cpanel-sec" data-part="remove">
      <button type="button" className="cpanel-danger" disabled={disabled || blocked !== null} title={blocked ?? undefined}
        onClick={() => { change(removeSection(def, id)); props.onSelect({ kind: "page" }); }}>Bölümü kaldır</button>
      {" "}<span className="cpanel-note">{blocked ?? "Alanlar sol listeye döner."}</span>
    </section>
  </Shell>;
}

function FieldPanel(props: PartProps) {
  const { def, id, catalog, disabled } = props;
  const change = changeOf(props);
  const field = def.components.find((component) => component.id === id);
  if (!field) return null;
  const column = fieldKey(def, id);
  const catalogColumn = column ? recordSourceOf(def, catalog)?.columns.find((item) => item.code === column) : undefined;
  // Katalog bilinmeden kilitler bilinmez: gevşetme yapılamasın diye iki anahtar da kapalıdır.
  const locks = catalog ? fieldLocks(def, id, catalog) : null;
  const required = field.props.required === true || locks?.required === true;
  const readOnly = field.props.readOnly === true || typeof field.props.disabledWhen === "string" || locks?.readOnly === true;
  const toggle = (patch: { required?: boolean; readOnly?: boolean }) => { if (catalog) change(setFieldProps(def, id, patch, catalog)); };
  const developer = catalogColumn ? [columnTypeLabel(catalogColumn), catalogColumn.key ? "anahtar" : "", catalogColumn.required ? "zorunlu" : "",
    catalogColumn.maxLength !== null ? `en çok ${catalogColumn.maxLength} karakter` : ""].filter(Boolean).join(" · ") : null;
  const blocked = fieldRemovalBlocked(def, id);
  return <Shell kind="Alan">
    <section className="cpanel-sec" data-part="name">
      <DraftText label="Etiket" value={text(field.props.label)} disabled={disabled} onCommit={(value) => change(setFieldProps(def, id, { label: value }, catalog ?? undefined))}/>
    </section>
    <section className="cpanel-sec" data-part="basics">
      <label className="cpanel-row">Zorunlu<input type="checkbox" role="switch" aria-label="Zorunlu" checked={required}
        disabled={disabled || !locks || locks.required} onChange={(event) => toggle({ required: event.target.checked })}/></label>
      <label className="cpanel-row">Değiştirilemez<input type="checkbox" role="switch" aria-label="Değiştirilemez" checked={readOnly}
        disabled={disabled || !locks || locks.readOnly} onChange={(event) => toggle({ readOnly: event.target.checked })}/></label>
      {(locks?.required || locks?.readOnly) && <p className="cpanel-note">{RECORD_LOCK_NOTE}</p>}
      <DraftText label="Yardım metni" value={text(field.props.description)} maxLength={300} placeholder="Kullanıcıya küçük bir ipucu" disabled={disabled}
        onCommit={(value) => change(setFieldProps(def, id, { description: value }, catalog ?? undefined))}/>
      {developer !== null ? <div className="cpanel-dev">{`Yazılımcının hazırladığı · ${developer}`}</div>
        : catalog && <p className="cpanel-warn" role="status">{RECORD_MISSING_IN_CATALOG}</p>}
    </section>
    <Appearance>{visibilityOf(props, id)}</Appearance>
    <section className="cpanel-sec" data-part="remove">
      <button type="button" className="cpanel-btn" disabled={disabled || blocked !== null} title={blocked ?? undefined}
        onClick={() => { change(removeField(def, id)); props.onSelect({ kind: "page" }); }}>Karttan çıkar</button>
      {blocked && <p className="cpanel-note">{blocked}</p>}
    </section>
  </Shell>;
}

function LinesPanel(props: PartProps) {
  const { def, id, catalog, disabled } = props;
  const change = changeOf(props);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const table = def.components.find((component) => component.id === id);
  if (!table) return null;
  const sources = catalog?.dataSources ?? [];
  const code = def.queries.find((item) => item.id === table.props.query)?.dataSource;
  const source = code ? sources.find((item) => item.code === code) : undefined;
  const title = text(table.props.title);
  const keyLabel = keyLabelOf(def, catalog);

  const swap = (item: CatalogDataSource) => {
    if (item.code === code) return;
    const tabs = recordTabs(def);
    const tabIndex = tabs.findIndex((tab) => tab.ids.includes(id));
    if (tabIndex < 0) return;
    const index = tabs[tabIndex].ids.indexOf(id);
    const without = removeBlock(def, id);
    const before = new Set(without.components.map((component) => component.id));
    let next = addLines(without, item, tabIndex, index);
    const added = next.components.find((component) => !before.has(component.id) && component.type === "dataTable");
    if (!added) return;
    // Danışmanın verdiği ad yeni kaynağa taşınır; eski kaynağın kendi adı taşınmaz.
    if (title && title !== source?.label) next = setLinesProps(next, added.id, { name: title });
    change(next);
    props.onSelect({ kind: "lines", id: added.id });
  };

  const columns = stringList(table.props.columns);
  const labels = labelMap(table.props.columnLabels);
  const ordered = [...columns, ...(source?.columns.map((column) => column.code) ?? []).filter((column) => !columns.includes(column))];
  const labelOf = (column: string) => labels[column] ?? source?.columns.find((item) => item.code === column)?.label ?? column;
  const full = columns.length >= MAX_LIST_COLUMNS;
  const toggleColumn = (column: string, on: boolean) => change(on
    ? setLinesProps(def, id, { columns: ordered.filter((item) => item === column || columns.includes(item)), labels: labels[column] ? {} : { [column]: labelOf(column) } })
    : setLinesProps(def, id, { columns: columns.filter((item) => item !== column) }));
  const dropOn = (target: string) => (event: DragEvent) => {
    event.preventDefault();
    if (!dragging || dragging === target || !columns.includes(dragging) || !columns.includes(target)) return setDragging(null);
    const next = columns.filter((item) => item !== dragging);
    next.splice(next.indexOf(target), 0, dragging);
    setDragging(null);
    change(setLinesProps(def, id, { columns: next }));
  };
  const pageSize = table.props.pageSize === 25 ? 25 : 10;

  return <Shell kind="Satır tablosu">
    <section className="cpanel-sec" data-part="name">
      <DraftText label="Ad" value={title} disabled={disabled} onCommit={(value) => change(setLinesProps(def, id, { name: value }))}/>
    </section>
    <section className="cpanel-sec" data-part="what"><h4>Ne listelensin?</h4>
      {catalogNote(props) ?? <ul className="cpanel-sources" aria-label="Satır kaynakları">{sources.map((item) => {
        const usable = linesSourceUsable(def, item);
        const on = item.code === code;
        return <li key={item.code} className={`${on ? "on" : ""}${usable.usable ? "" : " is-dim"}`}>
          <label><input type="radio" name={`satir-kaynak-${id}`} checked={on} disabled={disabled || (!on && !usable.usable)} onChange={() => swap(item)}/>{item.label}</label>
          {!usable.usable && <small>{usable.reason}</small>}
        </li>;
      })}{code && !source && <li className="on is-missing"><label><input type="radio" checked readOnly disabled/>{code}</label><small>{RECORD_MISSING_IN_CATALOG}</small></li>}</ul>}
      {source && keyLabel && <div className="cpanel-dev">Yazılımcının hazırladığı · bu kaydın <b>{keyLabel}</b> bilgisiyle süzülür.</div>}
    </section>
    <section className="cpanel-sec" data-part="basics">
      <div className="cpanel-sub" data-part="columns"><h4>Kolonlar</h4>
        {ordered.length === 0 ? <p className="cpanel-note">Önce ne listeleneceğini seçin.</p> : <ul className="cpanel-cols">{ordered.map((column) => {
          const on = columns.includes(column);
          return <li key={column} draggable={on && !disabled} onDragStart={(event) => { event.dataTransfer.setData("text/plain", column); event.dataTransfer.effectAllowed = "move"; setDragging(column); }}
            onDragOver={(event) => event.preventDefault()} onDrop={dropOn(column)}>
            <span className="cpanel-grip" aria-hidden="true">⋮⋮</span>
            <input type="checkbox" checked={on} disabled={disabled || (!on && full)} title={!on && full ? `En fazla ${MAX_LIST_COLUMNS} kolon gösterilir.` : undefined}
              aria-label={labelOf(column)} onChange={(event) => toggleColumn(column, event.target.checked)}/>
            {editing === column
              ? <input className="cpanel-colname" autoFocus defaultValue={labelOf(column)} maxLength={60} aria-label="Kolon başlığı"
                  onBlur={(event) => { setEditing(null); const value = event.target.value.trim(); if (value && value !== labelOf(column)) change(setLinesProps(def, id, { labels: { [column]: value } })); }}
                  onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setEditing(null); }}/>
              : <span className="cpanel-colname">{labelOf(column)}</span>}
            <button type="button" className="cpanel-pen" title="Başlığı değiştir" aria-label="Başlığı değiştir" disabled={disabled} onClick={() => setEditing(column)}>✎</button>
          </li>;
        })}</ul>}
      </div>
      <div className="cpanel-row">Sayfa başına<div className="cpanel-seg" role="group" aria-label="Sayfa başına">{LINES_PAGE_SIZES.map((size) =>
        <button type="button" key={size} className={pageSize === size ? "on" : ""} aria-pressed={pageSize === size} disabled={disabled}
          onClick={() => change(setLinesProps(def, id, { pageSize: size }))}>{size}</button>)}</div></div>
    </section>
    <Appearance>
      <DraftText label="Liste boşken" value={text(table.props.emptyText)} placeholder="Henüz kayıt yok." disabled={disabled}
        onCommit={(value) => change(setLinesProps(def, id, { emptyText: value }))}/>
    </Appearance>
  </Shell>;
}

function NotePanel(props: PartProps) {
  const { def, id, disabled } = props;
  const change = changeOf(props);
  const note = def.components.find((component) => component.id === id);
  if (!note) return null;
  return <Shell kind="Açıklama metni">
    <section className="cpanel-sec" data-part="name">
      <DraftText label="Metin" multiline maxLength={1000} value={text(note.props.text)} disabled={disabled} onCommit={(value) => change(setNoteText(def, id, value))}/>
    </section>
  </Shell>;
}
