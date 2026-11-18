import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { sanitizeSafeValue } from "./DesignLanguageFields";
import { MAX_TAB_LABEL, MAX_TABS, addTab, clampDefaultTab, moveTab, removeTab, renameTab, tabsValue, type TabEntry } from "./layoutRefs";

export { tabsValue, type TabEntry };

/** Sekme etiketi: sunucu kuralı `^[^=,]{1,40}`; "=" ve "," ile < > {{ }} gibi güvensiz parçalar temizlenir. */
export const cleanTabLabel = (text: string) => sanitizeSafeValue(text.replace(/[=,]/g, "")).slice(0, MAX_TAB_LABEL);

/**
 * Sekmeler müfettişi: sekmelerin sırası (sürükleyerek ya da ↑/↓ düğmeleriyle), adı, varsayılan sekme ve her sekmedeki
 * bileşen sayısı. Bileşenler sekmeye tuvalde sürüklenerek alınır; bu liste bileşen seçmez.
 */
export function TabsFields({ tabs, defaultTab, disabled, onChange }: {
  tabs: TabEntry[]; defaultTab: number; disabled?: boolean;
  onChange: (tabs: TabEntry[], defaultTab: number) => void;
}) {
  const current = clampDefaultTab(defaultTab, tabs.length);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const write = (next: { tabs: TabEntry[]; defaultTab: number }) => onChange(next.tabs, next.defaultTab);
  const move = (from: number, to: number) => write(moveTab(tabs, current, from, to));
  const add = () => { const next = addTab(tabs); if (next) onChange(next, current); };
  const endDrag = () => { setDragFrom(null); setDragOver(null); };
  return <div className="pd-tabs-editor">
    <small className="pd-tab-list-hint">Sekmeleri sürükleyerek sıralayın; varsayılan sekmeyi seçin.</small>
    {tabs.length === 0 && <small className="pd-query-warning">En az bir sekme ekleyin; sekmesiz bileşen kaydedilemez.</small>}
    <ol className="pd-tab-list" aria-label="Sekme sırası">
      {tabs.map((tab, index) => <li key={`${index}:${tab.label}`}
        className={`pd-tab-row${dragFrom === index ? " is-dragging" : ""}${dragOver === index && dragFrom !== null && dragFrom !== index ? (dragFrom < index ? " drop-after" : " drop-before") : ""}`}
        draggable={!disabled}
        onDragStart={(event) => { event.dataTransfer.setData("application/x-nexora-tab-row", String(index)); event.dataTransfer.effectAllowed = "move"; setDragFrom(index); }}
        onDragOver={(event) => { if (dragFrom === null) return; event.preventDefault(); if (dragOver !== index) setDragOver(index); }}
        onDrop={(event) => { event.preventDefault(); if (dragFrom !== null) move(dragFrom, index); endDrag(); }}
        onDragEnd={endDrag}>
        <span className="pd-tab-row-grip" aria-hidden="true" title="Sürükleyerek sıralayın"><GripVertical size={13}/></span>
        <input className="pd-tab-row-label" defaultValue={tab.label} maxLength={MAX_TAB_LABEL} disabled={disabled} aria-label={`Sekme ${index + 1} adı`}
          draggable={false} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); else if (event.key === "Escape") { event.currentTarget.value = tab.label; event.currentTarget.blur(); } }}
          onBlur={(event) => {
            const next = renameTab(tabs, index, cleanTabLabel(event.target.value));
            if (next) onChange(next, current); else event.target.value = tab.label;
          }}/>
        <label className="pd-tab-row-default" title="Sayfa açılınca bu sekme gösterilir">
          <input type="radio" name="pd-default-tab" checked={index === current} disabled={disabled} onChange={() => onChange(tabs, index)} aria-label={`${tab.label} varsayılan sekme`}/>
          <em>{index === current ? "Varsayılan · " : ""}{tab.ids.length} bileşen</em>
        </label>
        <span className="pd-tab-row-actions">
          <button type="button" className="pd-icon-button" aria-label={`${tab.label} sekmesini yukarı taşı`} title="Yukarı taşı" disabled={disabled || index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={12}/></button>
          <button type="button" className="pd-icon-button" aria-label={`${tab.label} sekmesini aşağı taşı`} title="Aşağı taşı" disabled={disabled || index === tabs.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={12}/></button>
          <button type="button" className="pd-icon-button danger" aria-label={`${tab.label} sekmesini sil`} title="Sekmeyi sil (bileşenleri sayfaya döner)" disabled={disabled} onClick={() => write(removeTab(tabs, current, index))}><Trash2 size={12}/></button>
        </span>
      </li>)}
    </ol>
    <button type="button" className="pd-button small" disabled={disabled || tabs.length >= MAX_TABS} onClick={add}
      title={tabs.length >= MAX_TABS ? `En fazla ${MAX_TABS} sekme olabilir.` : undefined}><Plus size={13}/>Sekme</button>
    <small className="pd-tab-list-hint">Bileşen eklemek için soldan sekmenin içine sürükleyin. Bir bileşeni başka sekmeye taşımak için sekme başlığının üzerine bırakın.</small>
  </div>;
}
