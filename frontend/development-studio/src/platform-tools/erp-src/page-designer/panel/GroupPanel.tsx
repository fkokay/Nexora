import type { ReactNode } from "react";
import { addToGroup, groupAddableTypes, isGroup, moveInGroup, removeFromGroup } from "./dialogsModel";
import { DraftInput } from "./DraftInput";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import "./component-panel.css";

// Taslak 12 metinleri.
export const GROUP_NOTE = "Grup içine eklenebilenler: rozet, başlık, metin, gösterge, uyarı, düğme, form, tablo, detay paneli, sekmeler.";
/** Grup üyesi türlerinin adları (sunucu: GroupChildTypes, aynı sırayla notta); menü yalnız `groupAddableTypes`'ı sunar. */
const CHILD_LABELS: [string, string][] = [["badge", "Rozet"], ["heading", "Başlık"], ["text", "Metin"], ["metric", "Gösterge"], ["alert", "Uyarı"],
  ["button", "Düğme"], ["formCard", "Form"], ["dataTable", "Tablo"], ["contextPanel", "Detay paneli"], ["tabs", "Sekmeler"]];
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 300;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const memberLabel = (child: ModelComponent) => text(child.props.text) || text(child.props.title) || text(child.props.label) || child.name || child.id;

/**
 * Grup paneli (taslak 12): kalıplı sayfada pencere içeriğindeki ya da Liste detayındaki `section` / `card` + `children`. Başlık,
 * açıklama, "Ne zaman görünsün" (çağıranın koşul düzenleyicisi) ve üyeler (ekle / çıkar / sırala; yalnız izinli türler, tek kat).
 */
export function GroupPanel({ def, groupId, disabled, onChange, visibility }: {
  def: ModelDefinition; groupId: string; disabled?: boolean; onChange: (next: ModelDefinition) => void;
  /** Grubun `visibleWhen` düzenleyicisi; verilmezse yalnız "Her zaman". */
  visibility?: ReactNode;
}) {
  const group = def.components.find((component) => component.id === groupId);
  if (!isGroup(group)) return null;
  const children = (group.children as ModelComponent[]).filter((child) => !!child && typeof child === "object");
  const change = (components: ModelComponent[]) => { if (!disabled && components !== def.components) onChange({ ...def, components }); };
  const patch = (key: "title" | "description", value: string) => {
    const props = { ...group.props };
    if (value.trim()) props[key] = value; else delete props[key];
    change(def.components.map((component) => component === group ? { ...component, props } : component));
  };
  const title = text(group.props.title);
  return <div className="cpanel cpanel-group">
    <section className="cpanel-sec" data-part="group"><h4>{title ? `Grup · ${title}` : "Grup"}</h4>
      <DraftInput label="Başlık" value={title} maxLength={MAX_TITLE} disabled={disabled} onCommit={(value) => patch("title", value)}/>
      <DraftInput label="Açıklama" value={text(group.props.description)} maxLength={MAX_DESCRIPTION} disabled={disabled} onCommit={(value) => patch("description", value)}/>
      <div className="cpanel-q">Ne zaman görünsün</div>
      {visibility ?? <div className="cpanel-seg"><button type="button" className="on" disabled>Her zaman</button></div>}
      <div className="cpanel-q">Üyeler</div>
      <ol className="cpanel-steps" data-part="group-members">{children.map((child, index) => {
        const label = memberLabel(child);
        return <li key={child.id} className="cpanel-row"><span>{label}</span>
          <span className="cpanel-seg">
            <button type="button" aria-label={`${label} yukarı`} disabled={disabled || index === 0} onClick={() => change(moveInGroup(def.components, groupId, child.id, -1))}>↑</button>
            <button type="button" aria-label={`${label} aşağı`} disabled={disabled || index === children.length - 1} onClick={() => change(moveInGroup(def.components, groupId, child.id, 1))}>↓</button>
            <button type="button" aria-label={`${label} kaldır`} disabled={disabled} onClick={() => change(removeFromGroup(def.components, groupId, child.id))}>✕</button>
          </span></li>;
      })}</ol>
      <select className="cpanel-add" aria-label="Üye ekle" value="" disabled={disabled}
        onChange={(event) => { if (event.target.value) change(addToGroup(def.components, groupId, event.target.value, def.queries)); }}>
        <option value="">+ ekle</option>
        {CHILD_LABELS.filter(([type]) => groupAddableTypes(def.queries).includes(type)).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
      </select>
      <p className="cpanel-note">{GROUP_NOTE}</p>
    </section>
  </div>;
}
