import { useEffect, useState, type ReactNode } from "react";
import type { ActiveCatalog, CatalogAction } from "../catalogClient";
import { AppearanceSection } from "./AppearanceSection";
import { LegacySettings } from "./ComponentPanel";
import "./component-panel.css";
import {
  addPageAction, addTab, freeTabs, isFreeBlock, moveBlock, moveBlockToTab, pageActionCodes, pageActionUsable, removeBlock, removePageAction,
  removeTab, renameTab, setBlockColumns, setBlockTitle, type BlockColumns,
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
};

export const FREE_PAGE_LEVEL_NOTE = "Serbest gövde · 3. basamak";
export const FREE_MISSING_IN_CATALOG = "Katalogda yok";
export const FREE_COLUMNS_NOTE = "Dar ekranda kolonlar kendiliğinden azalır: tablette en çok 2, telefonda 1.";
export const FREE_ACTIONS_DEV_NOTE = "Eylemleri yazılımcı hazırlar · onay sorusu ve yetki ondan gelir";
export const FREE_ACTIONS_NOTE = "İlk eylem ana düğmedir. Bir satıra ait eylemler burada seçilemez; onlar için Liste kalıbını kullanın.";
const MAX_PAGE_NAME = 120;
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

/** Yazarken boşluk ya da boş değer kaybolmasın diye taslak tutan metin kutusu; her değişiklik bildirilir. */
function DraftInput({ label, value, placeholder, maxLength = MAX_PAGE_NAME, disabled, readOnly, head, onCommit }: {
  label: string; value: string; placeholder?: string; maxLength?: number; disabled?: boolean; readOnly?: boolean; head?: boolean; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft((current) => current.trim() === value.trim() ? current : value); }, [value]);
  const input = <input className={head ? undefined : "cpanel-txt"} aria-label={head ? label : undefined} value={draft} placeholder={placeholder} maxLength={maxLength}
    disabled={disabled} readOnly={readOnly}
    onChange={(event) => { setDraft(event.target.value); onCommit(event.target.value); }}
    onBlur={() => { if (draft.trim() !== value.trim()) setDraft(value); }}/>;
  return head ? input : <label className="cpanel-q">{label}{input}</label>;
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
      {tabs ? tabs.map((tab, index) => <div className="cpanel-row" key={`${index}-${tab.label}`}>
        <DraftInput head label="Sekme adı" value={tab.label} maxLength={40} disabled={disabled} onCommit={(value) => change(renameTab(def, index, value))}/>
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
      <div className="cpanel-dev">{FREE_ACTIONS_DEV_NOTE}</div>
      <p className="cpanel-note">{FREE_ACTIONS_NOTE}</p>
    </section>
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
        {tabs.map((tab, index) => <option key={`${index}-${tab.label}`} value={index}>{tab.label}</option>)}
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
