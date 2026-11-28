import { useState, type DragEvent } from "react";
import type { ActiveCatalog } from "../catalogClient";
import type { DocumentModel } from "../documentModelClient";
import type { ModelDefinition } from "./listPanelModel";
import {
  addBelgeAction, belgeActionUsable, belgeExtraActions, belgeItems, belgeParts, moveBelgeItem, removeBelgeAction, renameBelgeItem,
  setBelgeActivity, setBelgeDensity, setBelgeVatBreakdown, toggleBelgeItem, MAX_BELGE_LABEL, type BelgeKind,
} from "./belgeModel";
import "./component-panel.css";

export type BelgeModelState = DocumentModel | "loading" | "failed" | "forbidden" | null;
export const BELGE_FORBIDDEN = "Bu belgenin modelini görmek için Satış siparişi okuma izni gerekir.";
const BELGE_DRAG = "application/x-nexora-belge-item";

export type BelgePanelProps = {
  def: ModelDefinition; model: BelgeModelState; catalog: ActiveCatalog | null; name: string; onRename: (name: string) => void;
  onChange: (next: ModelDefinition) => void; onAskDeveloper?: () => void; disabled?: boolean;
  /** Tuvalde seçili parça; o bölüm vurgulanır. */
  focus?: "fields" | "lines" | "summary" | null;
};

/**
 * Belge paneli (taslak 09): hangi belge (sabit), başlık alanları ve satır kolonları (işaretle, sürükle, adını değiştir; zorunlular
 * kilitli, hesaplananlar etiketli), kendiliğinden olanlar, durumdan gelen ve katalogdan ek eylemler, görünüm. Formül, sorgu ya
 * da komut ayarı yoktur.
 */
export function BelgePanel({ def, model, catalog, name, onRename, onChange, onAskDeveloper, disabled, focus }: BelgePanelProps) {
  const ready = model !== null && typeof model === "object";
  const locked = disabled || !ready;
  return <div className="cpanel cpanel-belge">
    <div className="cpanel-head"><input aria-label="Sayfa adı" value={name} disabled={disabled} onChange={(event) => onRename(event.target.value)}/></div>
    <section className="cpanel-sec" data-part="document"><h4>Hangi belge?</h4>
      <div className="cpanel-fixed"><b>{ready ? model.label : "Satış siparişi"}</b><small>kalıp seçilirken belirlendi</small></div>
      {model === "loading" && <p className="cpanel-note">Belge modeli yükleniyor…</p>}
      {model === "failed" && <p className="cpanel-warn" role="alert">Belge modeli okunamadı.</p>}
      {model === "forbidden" && <p className="cpanel-warn" role="alert">{BELGE_FORBIDDEN}</p>}
      {model === null && <p className="cpanel-warn" role="alert">Bu belge modeli bulunamadı.</p>}
      {ready && <div className="cpanel-dev">Modülün belge modeli · {model.states.length} durum, {model.transitions.length} geçiş · tutarlar sunucuda hesaplanır</div>}
    </section>
    {ready && <>
      <ItemList title="Başlık alanları" kind="fields" def={def} model={model} disabled={locked} onChange={onChange} active={focus === "fields"}/>
      <ItemList title="Satır kolonları" kind="columns" def={def} model={model} disabled={locked} onChange={onChange} active={focus === "lines"}/>
      <section className="cpanel-sec" data-part="auto">
        <div className="cpanel-dev"><b>Kendiliğinden olanlar</b> Stok seçilince {fillText(model)} dolar. Satır tutarı, KDV dökümü ve toplamlar sunucuda
          hesaplanır. Satırlar yalnız Taslak'ta düzenlenir.</div>
      </section>
      <Actions def={def} model={model} catalog={catalog} disabled={locked} onChange={onChange}/>
      <section className={`cpanel-sec${focus === "summary" ? " is-focus" : ""}`} data-part="appearance">
        <details open={focus === "summary" || undefined}><summary>Görünüm</summary><div className="cpanel-body">
          <div className="cpanel-row">Satır yüksekliği<div className="cpanel-seg" role="group" aria-label="Satır yüksekliği">
            {(["dense", "normal", "comfy"] as const).map((value) => <button type="button" key={value} disabled={locked}
              className={belgeParts(def).density === value ? "on" : ""} aria-pressed={belgeParts(def).density === value}
              onClick={() => onChange(setBelgeDensity(def, value))}>{value === "dense" ? "Sıkı" : value === "normal" ? "Normal" : "Rahat"}</button>)}
          </div></div>
          <label className="cpanel-row">KDV'yi orana göre dök<input type="checkbox" role="switch" checked={belgeParts(def).vatBreakdown} disabled={locked}
            onChange={(event) => onChange(setBelgeVatBreakdown(def, event.target.checked))}/></label>
          <label className="cpanel-row">İşlem günlüğü<input type="checkbox" role="switch" checked={belgeParts(def).activity} disabled={locked}
            onChange={(event) => onChange(setBelgeActivity(def, event.target.checked))}/></label>
        </div></details>
      </section>
    </>}
    <div className="cpanel-ask"><b>Aradığın alan ya da kolon yok mu?</b> Örneğin “Ödeme vadesi” alanı gibi.{" "}
      {onAskDeveloper ? <a href="#my-requests" onClick={(event) => { event.preventDefault(); onAskDeveloper(); }}>Yazılımcıdan iste →</a> : null}</div>
  </div>;
}

const FILL_LABELS: Record<string, string> = { unitCode: "birim", unitPrice: "liste fiyatı", vatPercent: "KDV", discountPercent: "iskonto", currencyCode: "döviz", availableQuantity: "kullanılabilir miktar" };
function fillText(model: DocumentModel) {
  const codes = model.fills.stockItemId ?? [];
  const words = codes.map((code) => FILL_LABELS[code] ?? code);
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} ve ${words[words.length - 1]}` : words.join("") || "alanlar";
}

function ItemList({ title, kind, def, model, disabled, onChange, active }: {
  title: string; kind: BelgeKind; def: ModelDefinition; model: DocumentModel; disabled: boolean; onChange: (next: ModelDefinition) => void; active: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const items = belgeItems(def, model, kind);
  const chosenCount = items.filter((item) => item.on).length;
  const finish = (code: string, save: boolean) => { if (save) onChange(renameBelgeItem(def, model, kind, code, draft)); setEditing(null); };
  const drop = (event: DragEvent, to: number) => {
    const code = event.dataTransfer.getData(BELGE_DRAG + kind);
    if (!code) return;
    event.preventDefault();
    onChange(moveBelgeItem(def, kind, code, to));
  };
  return <section className={`cpanel-sec${active ? " is-focus" : ""}`} data-part={kind}><h4>{title}</h4>
    <ul className="cpanel-belge-items" aria-label={title}>{items.map((item, index) => {
      const tags = [item.required && "zorunlu", item.calculated && "hesaplanan", item.visibleFrom && "onaydan sonra", item.readOnly && "salt okunur"].filter(Boolean) as string[];
      return <li key={item.code} className={item.on ? "on" : ""} onDragOver={(event) => { if (item.on) event.preventDefault(); }}
        onDrop={(event) => drop(event, Math.min(index, chosenCount - 1))}>
        <span className="cpanel-grip" draggable={item.on && !disabled} aria-hidden="true"
          onDragStart={(event) => event.dataTransfer.setData(BELGE_DRAG + kind, item.code)}>⋮⋮</span>
        <input type="checkbox" aria-label={item.shownLabel} checked={item.on} disabled={disabled || (item.required && item.on)}
          title={item.required ? "Zorunlu alan gizlenemez" : undefined} onChange={() => onChange(toggleBelgeItem(def, model, kind, item.code))}/>
        {editing === item.code
          ? <input className="cpanel-txt" aria-label={`${item.label} etiketi`} autoFocus maxLength={MAX_BELGE_LABEL} value={draft}
            onChange={(event) => setDraft(event.target.value)} onBlur={() => finish(item.code, true)}
            onKeyDown={(event) => { if (event.key === "Enter") finish(item.code, true); if (event.key === "Escape") finish(item.code, false); }}/>
          : <span className="cpanel-belge-name">{item.shownLabel}{tags.map((tag) => <small key={tag} className={`cpanel-tag is-${tag.replace(/\s/g, "-")}`}>{tag}</small>)}</span>}
        {item.on && editing !== item.code && <button type="button" className="cpanel-pen" aria-label={`${item.shownLabel} başlığını değiştir`} disabled={disabled}
          onClick={() => { setEditing(item.code); setDraft(item.shownLabel); }}>✎</button>}
        {item.on && index > 0 && <button type="button" className="cpanel-move" aria-label={`${item.shownLabel} yukarı`} disabled={disabled}
          onClick={() => onChange(moveBelgeItem(def, kind, item.code, index - 1))}>↑</button>}
      </li>;
    })}</ul>
  </section>;
}

function Actions({ def, model, catalog, disabled, onChange }: {
  def: ModelDefinition; model: DocumentModel; catalog: ActiveCatalog | null; disabled: boolean; onChange: (next: ModelDefinition) => void;
}) {
  const chosen = belgeExtraActions(def);
  const actions = catalog?.actions ?? [];
  return <section className="cpanel-sec" data-part="actions"><h4>Eylemler</h4>
    <div className="cpanel-q">Durumdan gelenler</div>
    <div className="cpanel-chips" aria-label="Durumdan gelen eylemler">{model.transitions.map((t) => <span key={t.code} className="cpanel-chip is-locked">{t.label}</span>)}</div>
    <p className="cpanel-note">Belgenin durumuna göre kendiliğinden görünür. Kimin onaylayacağı Kurallar ekranında belirlenir.</p>
    {model.creations.length > 0 && <>
      <div className="cpanel-q">Belgeden belge</div>
      <div className="cpanel-chips" aria-label="Belgeden belge eylemleri">{model.creations.map((c) => <span key={c.code} className="cpanel-chip is-locked">{c.label}</span>)}</div>
      <p className="cpanel-note">Bu eylemler sonraki belgeyi bu belgeden yaratır ve açar; yalnız şartı oluşunca görünür.</p>
    </>}
    <div className="cpanel-q">Ek eylemler</div>
    {actions.length === 0 ? <p className="cpanel-note">Katalogda eylem yok.</p>
      : <div className="cpanel-chips" role="group" aria-label="Ek eylemler">{actions.map((action) => {
        const on = chosen.includes(action.code);
        const usable = belgeActionUsable(action);
        return <button type="button" key={action.code} className={`cpanel-chip${on ? " on" : ""}`} aria-pressed={on}
          disabled={disabled || (!on && !usable.usable)} title={usable.usable ? undefined : usable.reason}
          onClick={() => onChange(on ? removeBelgeAction(def, action.code) : addBelgeAction(def, action))}>{action.label}</button>;
      })}</div>}
    <div className="cpanel-dev">Ek eylemleri yazılımcı katalogda hazırlar, sen sadece hangilerinin görüneceğini seçersin.</div>
  </section>;
}
