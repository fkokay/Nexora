import type { ReactNode } from "react";
import type { ConditionPath } from "../ConditionBuilder";
import { LIST_SOURCE_HINT, readPageTemplate } from "../pageTemplates";
import { CommandsSection, type CommandsPage } from "./CommandsSection";
import { COMMANDS_SLOT } from "./commandsModel";
import { DialogsSection } from "./DialogsSection";
import { DIALOG_SLOT, DIALOGS_SLOT, isGroup } from "./dialogsModel";
import { DraftInput } from "./DraftInput";
import { GroupPanel } from "./GroupPanel";
import { ButtonsPanel } from "./ButtonsPanel";
import { ComponentPanel } from "./ComponentPanel";
import { consultantKindOf } from "./consultantPalette";
import { DeveloperComponentPanel } from "./DeveloperComponentPanel";
import { FreePanel, freeSelectionOf, type FreePanelProps, type FreeSelection } from "./FreePanel";
import { blockOf, freeBlocks, freeTabs, isFreeItem, moveItem, moveItemToBlock, removeItem } from "./freeModel";
import { FreeTablePanel } from "./FreeTablePanel";
import { fieldTokens, type FieldToken } from "./consultantText";
import { IndicatorPanel } from "./IndicatorPanel";
import { ImagePanel } from "./ImagePanel";
import { InfoBoxPanel } from "./InfoBoxPanel";
import { ListPanel, type ListPanelProps } from "./ListPanel";
import { listDataSourceCode, stringList, type ModelComponent, type ModelDefinition } from "./listPanelModel";
import { RecordPanel, recordSelectionOf, type RecordPanelProps } from "./RecordPanel";
import { BelgePanel, type BelgePanelProps } from "./BelgePanel";
import { TextPanel } from "./TextPanel";

export const SLOT_LABELS: Record<string, string> = {
  indicators: "Göstergeler", filters: "Süzgeç alanı", list: "Liste", actions: "Listenin üstündeki eylemler",
  rowActions: "Satır eylemleri", detail: "Yan panel", above: "Listenin üstü", below: "Listenin altı",
};
const RECORD_SLOT_LABELS: Record<string, string> = { above: "Kartın üstü", below: "Kartın altı" };
const BELGE_SLOT_LABELS: Record<string, string> = { above: "Belgenin üstü", below: "Belgenin altı" };
const BELGE_FOCUS: Record<string, BelgePanelProps["focus"]> = { documentFields: "fields", documentLines: "lines", documentSummary: "summary" };
export const TEMPLATE_CANVAS_FALLBACK = "Bu ekran ERP önizlemesi açılınca görünür.";

/** Kalıplı sayfanın Komutlar çubuğu mu (`commands` yerindeki `actionBar`): tuvalde çubuğa tıklamak sayfayı seçer. */
export const isCommandsBar = (component: ModelComponent | null | undefined) =>
  component?.type === "actionBar" && component.props.slot === COMMANDS_SLOT;

/** Sayfa panelinin bilgileri (Liste kalıbında seçim yokken ya da Komutlar çubuğu seçiliyken). */
export type TemplatePageProps = { name: string; onRename?: (name: string) => void; pages: CommandsPage[]; paths?: ConditionPath[]; pageNames?: string[];
  /** Pencereler bölümü: tuvalde açık tutulan pencere ve seçimi (tuvale `showDialog`); verilmezse seçim bölümün içindedir. */
  shownDialog?: string | null; onShowDialog?: (dialogId: string | null) => void;
};

/** Liste kalıbının sayfa paneli (taslak 11): Ad, listenin kaynağı ve kolon sayısı, Komutlar. */
function ListPagePanel({ list, page, tokens, disabled }: { list: Omit<ListPanelProps, "listId">; page: TemplatePageProps; tokens: FieldToken[]; disabled?: boolean }) {
  const def = list.definition;
  const table = def.components.find((component) => component.type === "dataTable" && component.props.slot === "list");
  const code = table ? listDataSourceCode(def, table.id) : undefined;
  const source = code ? list.catalog?.dataSources.find((item) => item.code === code) : undefined;
  const columns = stringList(table?.props.columns).length;
  const off = disabled || list.disabled;
  return <div className="cpanel cpanel-list-page">
    <div className="cpanel-head"><DraftInput head label="Ad" value={page.name} disabled={off} readOnly={!page.onRename} onCommit={(value) => page.onRename?.(value)}/></div>
    <section className="cpanel-sec" data-part="what"><h4>Liste</h4>
      <p className="cpanel-note">{source ? `${source.label} veri kaynağı · ${columns} kolon` : code ? `${code} · Katalogda yok` : LIST_SOURCE_HINT}</p></section>
    <CommandsSection def={def} template="list" catalog={list.catalog} pages={page.pages} tokens={tokens.length > 0 ? tokens : fieldTokens(def, list.catalog)}
      paths={page.paths} pageNames={page.pageNames} disabled={off} onChange={list.onChange}/>
    <DialogsSection def={def} catalog={list.catalog} disabled={off} onChange={list.onChange} shownDialog={page.shownDialog} onShowDialog={page.onShowDialog}/>
  </div>;
}

/** Kalıplı sayfa paneli yalnız kalıplı sayfanın üst düzey bileşenlerinde açılır; kalıpsız sayfada bugünkü sekmeli panel kalır. */
export function usesTemplateInspector(def: Pick<ModelDefinition, "template" | "components">, componentId: string): boolean {
  return !!readPageTemplate(def.template) && def.components.some((component) => component.id === componentId);
}

/** Serbest gövdede bileşenin bölüm seçimi: seçenekler (bölüm adı, sekme varsa sekme adıyla), dolu bölümün nedeni, Yukarı / Aşağı. */
export type FreeItemPlace = { blockId: string; options: { blockId: string; label: string; reason?: string }[]; canUp: boolean; canDown: boolean };
export const UNTITLED_BLOCK = "Başlıksız bölüm";

export function freeItemPlace(def: ModelDefinition, itemId: string): FreeItemPlace | null {
  const blockId = blockOf(def, itemId);
  if (!blockId) return null;
  const tabs = freeTabs(def);
  const options = freeBlocks(def).map((block) => {
    const title = typeof block.props.title === "string" && block.props.title.trim() ? block.props.title.trim() : UNTITLED_BLOCK;
    const tab = tabs?.find((item) => item.blockIds.includes(block.id));
    const moved = block.id === blockId ? null : moveItemToBlock(def, itemId, block.id);
    return { blockId: block.id, label: tab ? `${title} · ${tab.label}` : title, ...(moved && "reason" in moved ? { reason: moved.reason } : {}) };
  });
  return { blockId, options, canUp: moveItem(def, itemId, -1) !== def, canDown: moveItem(def, itemId, 1) !== def };
}

/** Serbest gövdede TemplateInspector'ın bilgileri: FreePanel'inkiler (seçim hariç) ve seçilen bileşenin "Ne zaman görünsün?" alanı. */
export type FreeInspectorProps = Omit<FreePanelProps, "selection" | "visibility"> & { visibility?: (id: string) => ReactNode };

/** Taslak 09: bileşen panelinde Ad bölümünün altındaki "Bölüm" seçimi, Yukarı / Aşağı ve Kaldır. */
function FreePlace({ free, itemId, disabled }: { free: FreeInspectorProps; itemId: string; disabled?: boolean }) {
  const place = freeItemPlace(free.def, itemId);
  if (!place) return null;
  const change = (next: ModelDefinition) => { if (!disabled && next !== free.def) free.onChange(next); };
  const reasons = [...new Set(place.options.map((option) => option.reason).filter((reason): reason is string => !!reason))];
  return <div className="cpanel-row cpanel-template-place cpanel-free-place">
    <label className="cpanel-q">Bölüm
      <select aria-label="Bölüm" value={place.blockId} disabled={disabled} onChange={(event) => {
        const moved = moveItemToBlock(free.def, itemId, event.target.value);
        if (!("reason" in moved)) change(moved.def);
      }}>
        {place.options.map((option) => <option key={option.blockId} value={option.blockId} disabled={!!option.reason}>{option.reason ? `${option.label} (dolu)` : option.label}</option>)}
      </select></label>
    {reasons.map((reason) => <p className="cpanel-note" key={reason}>{reason}</p>)}
    <div className="cpanel-seg" role="group" aria-label="Sıra">
      <button type="button" disabled={disabled || !place.canUp} onClick={() => change(moveItem(free.def, itemId, -1))}>↑ Yukarı</button>
      <button type="button" disabled={disabled || !place.canDown} onClick={() => change(moveItem(free.def, itemId, 1))}>↓ Aşağı</button>
      <button type="button" className="danger" disabled={disabled} onClick={() => {
        const next = removeItem(free.def, itemId);
        if (disabled || next === free.def) return;
        free.onChange(next);
        free.onSelect({ kind: "block", id: place.blockId });
      }}>Kaldır</button>
    </div>
  </div>;
}

/**
 * Serbest gövdenin paneli: seçim yok ya da sayfa eylemi / sekme bileşeni → sayfa; bölüm → bölüm (FreePanel); Liste → FreeTablePanel;
 * Metin, Bilgi kutusu, Gösterge, Görsel, Yazılımcı bileşeni → danışman paneli (yeri "Bölüm" seçimi); öteki bileşenler → ComponentPanel içinde bugünkü ayarlar.
 */
function FreeInspector({ component, legacy, list, free, tokens, disabled }: {
  component: ModelComponent | null; legacy: ReactNode; list: Omit<ListPanelProps, "listId"> | null; free: FreeInspectorProps; tokens: FieldToken[]; disabled?: boolean;
}) {
  const off = disabled || free.disabled;
  const selection: FreeSelection | null = freeSelectionOf(free.def, component?.id ?? null);
  const pageOrBlock: FreeSelection | null = selection
    ?? (component && (component.type === "tabs" || isCommandsBar(component) || (component.type === "button" && component.props.slot === "actions")) ? { kind: "page" } : null);
  if (pageOrBlock || !component) {
    const shown: FreeSelection = pageOrBlock ?? { kind: "page" };
    return <FreePanel {...free} selection={shown} disabled={off} visibility={shown.kind === "block" ? free.visibility?.(shown.id) : undefined}/>;
  }
  const visibility = free.visibility?.(component.id) ?? list?.visibility;
  const place = isFreeItem(component) ? <FreePlace free={free} itemId={component.id} disabled={off}/> : null;
  if (component.type === "dataTable" && isFreeItem(component))
    return <FreeTablePanel def={free.def} id={component.id} catalog={free.catalog} catalogStatus={free.catalogStatus} disabled={off} onChange={free.onChange} place={place} visibility={visibility}/>;
  const kind = isFreeItem(component) ? consultantKindOf(component) : null;
  const common = { component, definition: free.def, disabled: off, onChange: free.onChange, onRename: () => {}, visibility };
  switch (kind) {
    case "text": return <TextPanel {...common} tokens={tokens} place={place}/>;
    case "infoBox": return <InfoBoxPanel {...common} tokens={tokens} place={place}/>;
    case "image": return <ImagePanel {...common} tokens={tokens} place={place}/>;
    case "developer": return <DeveloperComponentPanel {...common} catalog={free.catalog} catalogStatus={free.catalogStatus ?? "ready"} place={place}/>;
    case "indicator":
      if (list) return <IndicatorPanel {...common} catalog={list.catalog} catalogStatus={list.catalogStatus} operationOf={list.operationOf} operationsStatus={list.operationsStatus} place={place}/>;
      break;
  }
  return <ComponentPanel name={component.name ?? ""} onRename={() => {}} nameReadOnly what={place ?? <p className="cpanel-note">Yeri: —</p>} basicsTitle="Ayarlar" basics={legacy}
    actions={<p className="cpanel-note">Bu bileşenin eylemleri yukarıdaki ayarlardadır.</p>}
    appearance={<p className="cpanel-note">Bu bileşenin yeni paneli sonraki adımda gelir.</p>}/>;
}

/**
 * Kalıplı sayfanın özellikler paneli.
 * - Serbest gövdede (`free` verilirse) seçim `FreeInspector`'da yönlendirilir.
 * - Kayıt kartında (`record` verilirse) kartın parçaları ve sayfa (`component` yokken) `RecordPanel`'de açılır.
 * - Liste kalıbında liste için `ListPanel`; Metin, Bilgi kutusu, Gösterge, Görsel ve eylem yerlerindeki düğmeler için
 *   danışman panelleri (alt proje 5a); ek alanlardaki katalog `code` bileşeni için `DeveloperComponentPanel`. Kayıt kartının ek alanlarında (`above` / `below`) da aynı paneller açılır (alanlar kaydın kolonlarındandır).
 * - Öteki bileşenler için `ComponentPanel` içinde bugünkü ayar alanları.
 * Bileşen adı bağlamalarda kullanıldığından danışman panellerinde salt okunurdur. Ek alanlarda (`above` / `below`) Ad
 * bölümünün altında "Yeri" seçimi vardır; Gösterge yerini kendi panelinde seçer.
 */
export function TemplateInspector({ component, legacy, list, record, free, belge, page, tokens, disabled, onLeave, onPlace }: {
  component: ModelComponent | null; legacy: ReactNode; list: Omit<ListPanelProps, "listId"> | null;
  record?: Omit<RecordPanelProps, "selection"> | null;
  /** Serbest gövdede panelin bilgileri; verilirse bütün seçimler serbest gövdenin panellerine gider. */
  free?: FreeInspectorProps | null;
  /** Belge sayfası: sayfa ve belge parçaları (alanlar, satırlar, toplamlar) Belge panelinde açılır; ek alanlar bugünkü yoldadır. */
  belge?: Omit<BelgePanelProps, "focus"> | null;
  /** Liste kalıbında sayfa paneli (seçim yokken ya da Komutlar çubuğu seçiliyken): Ad, liste, Komutlar. */
  page?: TemplatePageProps | null;
  /** Metindeki `{Alan}` ifadeleri ve "Kayıttaki resim" için listenin kolonları (`fieldTokens`). */
  tokens: FieldToken[]; disabled?: boolean;
  onLeave?: ListPanelProps["onLeave"]; onPlace: (slot: "above" | "below") => void;
}) {
  // Pencere ve içeriği (5b-2 adım 2) kalıbın parça panellerine girmez; grup (pencerede ya da Liste detayında) Grup panelinde açılır.
  const placed = typeof component?.props.slot === "string" ? component.props.slot : "";
  const inDialog = placed === DIALOG_SLOT || placed === DIALOGS_SLOT;
  if (component && isGroup(component) && (placed === DIALOG_SLOT || placed === "detail")) {
    const def = free?.def ?? record?.def ?? belge?.def ?? list?.definition;
    const onChange = free?.onChange ?? record?.onChange ?? belge?.onChange ?? list?.onChange;
    if (def && onChange) return <GroupPanel def={def} groupId={component.id} onChange={onChange}
      disabled={disabled || free?.disabled || record?.disabled || belge?.disabled || list?.disabled}
      visibility={free?.visibility?.(component.id) ?? record?.visibility?.(component.id) ?? list?.visibility}/>;
  }
  if (free && !inDialog) return <FreeInspector component={component} legacy={legacy} list={list} free={free} tokens={tokens} disabled={disabled}/>;
  if (record && !inDialog) {
    const selection = recordSelectionOf(record.def, component?.id ?? null);
    if (selection) return <RecordPanel {...record} selection={selection} disabled={disabled || record.disabled}/>;
  }
  if (belge && !inDialog) {
    const slot = typeof component?.props.slot === "string" ? component.props.slot : "";
    if (!component || BELGE_FOCUS[component.type] || (slot === "actions" && component.type === "button"))
      return <BelgePanel {...belge} focus={component ? BELGE_FOCUS[component.type] ?? null : null} disabled={disabled || belge.disabled}/>;
  }
  if (page && list && readPageTemplate(list.definition.template)?.name === "list" && (!component || isCommandsBar(component)))
    return <ListPagePanel list={list} page={page} tokens={tokens} disabled={disabled}/>;
  if (!component) return null;
  const labels = record ? { ...SLOT_LABELS, ...RECORD_SLOT_LABELS } : belge ? { ...SLOT_LABELS, ...BELGE_SLOT_LABELS } : SLOT_LABELS;
  const slot = typeof component.props.slot === "string" ? component.props.slot : "";
  if (slot === "list" && component.type === "dataTable" && list) return <ListPanel {...list} listId={component.id} disabled={disabled} onLeave={onLeave}/>;
  const extra = slot === "above" || slot === "below";
  const placeChoice = extra
    ? <div className="cpanel-row cpanel-template-place">Yeri<div className="cpanel-seg" role="group" aria-label="Yeri">{(["above", "below"] as const).map((value) =>
        <button type="button" key={value} className={slot === value ? "on" : ""} aria-pressed={slot === value} disabled={disabled} onClick={() => onPlace(value)}>{labels[value]}</button>)}</div></div>
    : null;

  // Danışman panelleri Liste kalıbında (5a) ve Kayıt kartının ek alanlarında (5c Karar 9) açılır; kartın öteki yerlerinde eski panel kalır.
  const kind = list && (!record || extra) ? consultantKindOf(component) : null;
  if (list && kind) {
    const common = { component, definition: list.definition, disabled, onChange: list.onChange, onRename: () => {}, visibility: list.visibility };
    switch (kind) {
      case "text": return <TextPanel {...common} tokens={tokens} place={placeChoice}/>;
      case "infoBox": return <InfoBoxPanel {...common} tokens={tokens} place={placeChoice}/>;
      case "image": return <ImagePanel {...common} tokens={tokens} place={placeChoice}/>;
      // Yazılımcı bileşeni yalnız ek alanlarda (Karar 5); öteki yerlerde eski panel kalır.
      case "developer":
        if (extra) return <DeveloperComponentPanel {...common} catalog={list.catalog} catalogStatus={list.catalogStatus} place={placeChoice}/>;
        break;
      case "indicator": return <IndicatorPanel {...common} catalog={list.catalog} catalogStatus={list.catalogStatus}
        operationOf={list.operationOf} operationsStatus={list.operationsStatus}/>;
      case "buttons": {
        const table = list.definition.components.find((item) => item.type === "dataTable" && item.props.slot === "list");
        if ((slot === "actions" || slot === "rowActions") && table)
          return <ButtonsPanel component={component} definition={list.definition} listId={table.id} catalog={list.catalog} disabled={disabled} onChange={list.onChange}/>;
        break;
      }
    }
  }

  const what = placeChoice ?? <p className="cpanel-note">{`Yeri: ${labels[slot] ?? "—"}`}</p>;
  return <ComponentPanel name={component.name ?? ""} onRename={() => {}} nameReadOnly what={what} basicsTitle="Ayarlar" basics={legacy}
    actions={<p className="cpanel-note">Bu bileşenin eylemleri yukarıdaki ayarlardadır.</p>}
    appearance={<p className="cpanel-note">Bu bileşenin yeni paneli sonraki adımda gelir.</p>}/>;
}
