import { useState, type ReactNode } from "react";
import type { ActiveCatalog, CatalogAction } from "../catalogClient";
import type { ConditionPath } from "../ConditionBuilder";
import { AppearanceSection } from "./AppearanceSection";
import { CommandsSection, type CommandsPage } from "./CommandsSection";
import type { FieldToken } from "./consultantText";
import { DialogsSection } from "./DialogsSection";
import { DraftInput } from "./DraftInput";
import { LegacySettings } from "./ComponentPanel";
import "./component-panel.css";
import {
  addPageAction, addPageButton, addTab, FREE_ACTIONS_FULL, freeTabs, isFreeBlock, moveBlock, moveBlockToTab, moveTab, pageActionCodes, pageActionsFull, pageButtonCodeProblem,
  pageActionUsable, pageButtons, removeBlock, removePageAction, removePageButton, removeTab, renameTab, setBlockColumns, setBlockTitle, type BlockColumns,
} from "./freeModel";
import type { ModelDefinition } from "./listPanelModel";
import { setHideOnMobile } from "./textPanelModel";

/** Serbest gövdede FreePanel'in açtığı seçimler: sayfanın kendisi ya da bir bölüm. */
export type FreeSelection = { kind: "page" } | { kind: "block"; id: string };

export type FreePanelProps = {
  def: ModelDefinition; selection: FreeSelection;
  /** Etkin katalog, ERP işlemine dayanan eylemleri `withOperationParameters(…, true, …)` ile zenginleştirilmiş; `null` etkin sürüm yok demektir. */
  catalog: ActiveCatalog | null;
  catalogStatus?: "loading" | "ready" | "failed";
  disabled?: boolean;
  onChange: (next: ModelDefinition) => void;
  onSelect: (selection: FreeSelection) => void;
  /** Seçili bölümün "Ne zaman görünsün?" alanı (`VisibilityField` düğümü); verilmezse yalnız "Her zaman". */
  visibility?: ReactNode;
  /** Sayfanın adı (Sayfa panelinin "Ad"ı); `onRename` verilmezse salt okunur. */
  name?: string; onRename?: (name: string) => void;
  /** Komutlar bölümü: "Hangi ekran" seçiminin sayfaları, metindeki alanlar, kural kurucunun alanları. */
  pages?: CommandsPage[]; tokens?: FieldToken[]; paths?: ConditionPath[]; pageNames?: string[];
  /** Pencereler bölümü: tuvalde açık tutulan pencere ve seçimi (tuvale `showDialog`); verilmezse seçim bölümün içindedir. */
  shownDialog?: string | null; onShowDialog?: (dialogId: string | null) => void;
};

export const FREE_PAGE_LEVEL_NOTE = "Serbest gövde · 3. basamak";
export const FREE_MISSING_IN_CATALOG = "Katalogda yok";
export const FREE_COLUMNS_NOTE = "Dar ekranda kolonlar kendiliğinden azalır: tablette en çok 2, telefonda 1.";
export const FREE_ACTIONS_DEV_NOTE = "Eylemleri yazılımcı hazırlar · onay sorusu ve yetki ondan gelir";
export const FREE_PAGE_BUTTON_NOTE = "Düğme, kodu yazılan ekranı açar.";
export const FREE_ACTIONS_NOTE = "İlk eylem ana düğmedir. Bir satıra ait eylemler burada seçilemez; onlar için Liste kalıbını kullanın.";
/** Bölümde panelin yazdığı özellikler; ötekiler "Eski ayarlar" altında salt okunur görünür. */
const BLOCK_KNOWN = new Set(["slot", "title", "columns", "members", "visibleWhen", "hideOnMobile"]);

/**
 * Bileşen seçili değilse (ya da seçili bileşen artık yoksa) sayfa; `block` yerindeki bölüm; ötekiler (bileşen, sayfa eylemi,
 * sekme bileşeni) null: onların panelini çağıran seçer.
 */
export function freeSelectionOf(def: ModelDefinition, componentId: string | null): FreeSelection | null {
  if (componentId === null) return { kind: "page" };
  const component = def.components.find((item) => item.id === componentId);
  if (!component) return { kind: "page" };
  return isFreeBlock(component) ? { kind: "block", id: component.id } : null;
}

/** Serbest gövdenin paneli (taslak 09): sayfa (ad, sekmeler, eylemler) ya da bölüm. Sekme ve açılır pencere yok. */
export function FreePanel(props: FreePanelProps) {
  const { selection } = props;
  if (selection.kind === "block") return <BlockPanel {...props} id={selection.id} key={selection.id}/>;
  return <PagePanel {...props}/>;
}

const changeOf = (props: FreePanelProps) => (next: ModelDefinition) => { if (!props.disabled && next !== props.def) props.onChange(next); };

/** İşlem çubuğundaki katalog eylemlerinin düğme metinleri (katalogdan kalkmış eylemi adıyla göstermek için). */
function actionButtonText(def: ModelDefinition, code: string): string {
  for (const component of def.components) {
    if (component.type !== "button" || component.props.slot !== "actions") continue;
    const query = def.queries.find((item) => item.id === component.props.queryId);
    if (query?.action === code && typeof component.props.text === "string" && component.props.text.trim()) return component.props.text;
  }
  return "Silinmiş eylem";
}

function PagePanel(props: FreePanelProps) {
  const { def, catalog, disabled } = props;
  const change = changeOf(props);
  const tabs = freeTabs(def);
  const probe = addTab(def);
  const codes = pageActionCodes(def);
  const known = new Set((catalog?.actions ?? []).map((item) => item.code));
  const gone = codes.filter((code) => !known.has(code));

  const actionChips = props.catalogStatus === "loading" ? <p className="cpanel-note">Katalog yükleniyor…</p>
    : props.catalogStatus === "failed" ? <p className="cpanel-warn">Katalog okunamadı.</p>
      : !catalog ? <p className="cpanel-note">Etkin katalog sürümü yok; sayfa eylemi için yazılımcıdan bir eylem isteyin.</p>
        : catalog.actions.length === 0 && gone.length === 0 ? <p className="cpanel-note">Yazılımcının hazırladığı eylem yok.</p>
          : <div className="cpanel-chips" role="group" aria-label="Eylemler">
            {gone.map((code) => <button type="button" key={`gone-${code}`} className="cpanel-chip on is-missing" aria-pressed disabled={disabled}
              title="Kaldırmak için tıklayın" onClick={() => change(removePageAction(def, code))}>{`${actionButtonText(def, code)} · ${FREE_MISSING_IN_CATALOG}`}</button>)}
            {catalog.actions.map((action: CatalogAction) => {
              const on = codes.includes(action.code);
              const usable = pageActionUsable(action);
              // Eklenemeyen (kullanılamayan ya da 8 düğme dolu) eylem seçilemez; eklenmiş olan her zaman kaldırılabilir.
              const blocked = !on && addPageAction(def, action) === def;
              return <button type="button" key={action.code} className={`cpanel-chip${on ? " on" : ""}${usable.usable ? "" : " is-dim"}`} aria-pressed={on}
                disabled={disabled || blocked} title={usable.usable ? undefined : usable.reason}
                onClick={() => change(on ? removePageAction(def, action.code) : addPageAction(def, action))}>
                {action.label}{!usable.usable && <small> · {usable.reason}</small>}</button>;
            })}
          </div>;

  return <div className="cpanel cpanel-free">
    <div className="cpanel-head"><DraftInput head label="Sayfa adı" value={props.name ?? ""} disabled={disabled} readOnly={!props.onRename}
      onCommit={(value) => props.onRename?.(value)}/></div>
    <p className="cpanel-note">{FREE_PAGE_LEVEL_NOTE}</p>
    <section className="cpanel-sec" data-part="tabs"><h4>Sekmeler</h4>
      {tabs ? tabs.map((tab, index) => <div className="cpanel-row" key={index}>
        <DraftInput head label="Sekme adı" value={tab.label} maxLength={40} disabled={disabled} onCommit={(value) => change(renameTab(def, index, value))}/>
        <button type="button" className="cpanel-btn" disabled={disabled || index === 0} title="Sekmeyi sola taşı"
          onClick={() => change(moveTab(def, index, -1))}>←</button>
        <button type="button" className="cpanel-btn" disabled={disabled || index === tabs.length - 1} title="Sekmeyi sağa taşı"
          onClick={() => change(moveTab(def, index, 1))}>→</button>
        <button type="button" className="cpanel-btn" disabled={disabled} title="Sekmeyi sil; bölümleri önceki sekmeye geçer"
          onClick={() => change(removeTab(def, index))}>Sil</button>
      </div>) : <p className="cpanel-note">Bu sayfada sekme yok; bölümler alt alta durur.</p>}
      <button type="button" className="cpanel-btn" disabled={disabled || "reason" in probe} title={"reason" in probe ? probe.reason : undefined}
        onClick={() => { if ("reason" in probe) return; change(probe.def); props.onSelect({ kind: "block", id: probe.blockId }); }}>＋ Sekme ekle</button>
      <p className="cpanel-note">{"reason" in probe ? probe.reason
        : `Yeni sekme, içinde boş bir bölümle açılır.${tabs ? "" : " İlk sekme eklenince mevcut bölümler “Genel” sekmesine girer."}`}</p>
    </section>
    <section className="cpanel-sec" data-part="actions"><h4>Eylemler</h4>
      {actionChips}
      {pageButtons(def).length > 0 && <div className="cpanel-chips" role="group" aria-label="Ekran açan düğmeler">
        {pageButtons(def).map((button) => <button type="button" key={button.id} className="cpanel-chip on" aria-pressed disabled={disabled}
          title="Kaldırmak için tıklayın" onClick={() => change(removePageButton(def, button.id))}>{button.text}<small> · ekran açar</small></button>)}
      </div>}
      <PageButtonForm disabled={disabled} full={pageActionsFull(def)} onAdd={(code, label) => change(addPageButton(def, code, label))}/>
      <div className="cpanel-dev">{FREE_ACTIONS_DEV_NOTE}</div>
      <p className="cpanel-note">{FREE_ACTIONS_NOTE}</p>
    </section>
    <CommandsSection def={def} template="free" catalog={catalog} pages={props.pages ?? []} tokens={props.tokens ?? []} paths={props.paths}
      pageNames={props.pageNames} disabled={disabled} onChange={change}/>
    <DialogsSection def={def} catalog={catalog} disabled={disabled} onChange={change} shownDialog={props.shownDialog} onShowDialog={props.onShowDialog}/>
  </div>;
}

/** Ekran açan düğme: panelde ekran listesi olmadığından açılacak ekranın kodu yazılır. */
function PageButtonForm({ disabled, full, onAdd }: { disabled?: boolean; full: boolean; onAdd: (code: string, label: string) => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const problem = pageButtonCodeProblem(code);
  const ready = code.trim() !== "" && label.trim() !== "" && !problem;
  return <div className="cpanel-sub" data-part="page-button">
    <label className="cpanel-q">Açılacak ekranın kodu<input className="cpanel-txt" maxLength={40} spellCheck={false} value={code} disabled={disabled || full}
      onChange={(event) => setCode(event.target.value)}/></label>
    <label className="cpanel-q">Düğme metni<input className="cpanel-txt" maxLength={120} value={label} disabled={disabled || full}
      onChange={(event) => setLabel(event.target.value)}/></label>
    <button type="button" className="cpanel-add" disabled={disabled || full || !ready}
      onClick={() => { onAdd(code, label); setCode(""); setLabel(""); }}>＋ Ekran açan düğme</button>
    {problem && !full && <p className="cpanel-warn">{problem}</p>}
    <p className="cpanel-note">{full ? FREE_ACTIONS_FULL : FREE_PAGE_BUTTON_NOTE}</p>
  </div>;
}

function BlockPanel(props: FreePanelProps & { id: string }) {
  const { def, id, disabled } = props;
  const change = changeOf(props);
  const block = def.components.find((component) => component.id === id && isFreeBlock(component));
  if (!block) return null;
  const tabs = freeTabs(def);
  const tabIndex = tabs ? tabs.findIndex((tab) => tab.blockIds.includes(id)) : -1;
  const columns: BlockColumns = block.props.columns === 1 || block.props.columns === 3 ? block.props.columns : 2;
  const removal = removeBlock(def, id);
  const reason = "reason" in removal ? removal.reason : null;
  const upBlocked = moveBlock(def, id, -1) === def;
  const downBlocked = moveBlock(def, id, 1) === def;

  return <div className="cpanel cpanel-free">
    <div className="cpanel-head cpanel-kind"><b>Bölüm</b></div>
    <section className="cpanel-sec" data-part="basics">
      <DraftInput label="Başlık" value={typeof block.props.title === "string" ? block.props.title : ""} placeholder="Başlıksız bölüm" disabled={disabled}
        onCommit={(value) => change(setBlockTitle(def, id, value))}/>
      <div className="cpanel-q">Kolon sayısı</div>
      <div className="cpanel-seg" role="group" aria-label="Kolon sayısı">{([1, 2, 3] as const).map((count) =>
        <button type="button" key={count} className={columns === count ? "on" : ""} aria-pressed={columns === count} disabled={disabled}
          onClick={() => change(setBlockColumns(def, id, count))}>{count}</button>)}</div>
      <p className="cpanel-note">{FREE_COLUMNS_NOTE}</p>
      {tabs && <label className="cpanel-q">Sekme<select value={tabIndex} disabled={disabled} onChange={(event) => change(moveBlockToTab(def, id, Number(event.target.value)))}>
        {tabs.map((tab, index) => <option key={index} value={index}>{tab.label}</option>)}
      </select></label>}
      <div className="cpanel-q">{tabs ? "Sıra (sekme içinde)" : "Sıra"}</div>
      <div className="cpanel-row">
        <button type="button" className="cpanel-btn" disabled={disabled || upBlocked} onClick={() => change(moveBlock(def, id, -1))}>↑ Yukarı</button>
        <button type="button" className="cpanel-btn" disabled={disabled || downBlocked} onClick={() => change(moveBlock(def, id, 1))}>↓ Aşağı</button>
      </div>
    </section>
    <section className="cpanel-sec" data-part="remove">
      <button type="button" className="cpanel-danger" disabled={disabled || reason !== null}
        onClick={() => { if ("def" in removal) { change(removal.def); props.onSelect({ kind: "page" }); } }}>Bölümü sil</button>
      {reason && <p className="cpanel-note">{reason}</p>}
    </section>
    <section className="cpanel-sec" data-part="appearance">
      <details><summary>Görünüm</summary><div className="cpanel-body">
        <AppearanceSection visibility={props.visibility} disabled={disabled} hideOnMobile={block.props.hideOnMobile === true}
          onHideOnMobile={(hide) => change(setHideOnMobile(def, id, hide))}/>
      </div></details>
    </section>
    <LegacySettings props={block.props} known={BLOCK_KNOWN}/>
  </div>;
}
