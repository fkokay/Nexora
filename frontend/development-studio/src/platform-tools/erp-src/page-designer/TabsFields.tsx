import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { sanitizeSafeValue } from "./DesignLanguageFields";
import { InputPicker, type PickerInput } from "./LayoutFields";
import { MAX_TAB_IDS, MAX_TABS } from "./layoutRefs";

export type TabEntry = { label: string; ids: string[] };
const MAX_LABEL = 40;

/** Sekme etiketi: sunucu kuralı `^[^=,]{1,40}`; "=" ve "," ile < > {{ }} gibi güvensiz parçalar temizlenir. */
export const cleanTabLabel = (text: string) => sanitizeSafeValue(text.replace(/[=,]/g, "")).slice(0, MAX_LABEL);
/** Sekme listesinin kayıt biçimi: "Etiket=kimlik,kimlik". */
export const tabsValue = (tabs: TabEntry[]) => tabs.map((tab) => `${tab.label}=${tab.ids.join(",")}`);

/**
 * Sekmeler müfettişi: etiket, sekmenin bileşenleri, sekme sırası ve varsayılan sekme. Bir bileşen yalnız bir sekmede
 * olabilir; başka sekmenin (ya da başka bir Sekmeler bileşeninin) bileşeni soluk ve seçilemez gösterilir.
 */
export function TabsFields({ tabs, defaultTab, candidates, takenElsewhere, disabled, onChange }: {
  tabs: TabEntry[]; defaultTab: number; candidates: PickerInput[]; takenElsewhere: Record<string, string>; disabled?: boolean;
  onChange: (tabs: TabEntry[], defaultTab: number) => void;
}) {
  const current = Number.isInteger(defaultTab) && defaultTab >= 0 && defaultTab < tabs.length ? defaultTab : 0;
  const write = (next: TabEntry[], nextDefault = current) => onChange(next, Math.max(0, Math.min(nextDefault, next.length - 1)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= tabs.length) return;
    const next = [...tabs];
    [next[index], next[target]] = [next[target], next[index]];
    // Varsayılan sekme taşınan sekmeyle birlikte gider.
    write(next, current === index ? target : current === target ? index : current);
  };
  const remove = (index: number) => write(tabs.filter((_, i) => i !== index), current > index ? current - 1 : current === index ? 0 : current);
  const add = () => {
    let number = tabs.length + 1;
    while (tabs.some((tab) => tab.label === `Sekme ${number}`)) number++;
    write([...tabs, { label: `Sekme ${number}`, ids: [] }]);
  };
  return <div className="pd-tabs-editor">
    {tabs.length === 0 && <small className="pd-query-warning">En az bir sekme ekleyin; sekmesiz bileşen kaydedilemez.</small>}
    {tabs.map((tab, index) => {
      const owned: Record<string, string> = { ...takenElsewhere };
      tabs.forEach((other, otherIndex) => { if (otherIndex !== index) for (const id of other.ids) owned[id] = other.label; });
      return <fieldset className="pd-tabs-editor-tab" key={index} disabled={disabled}>
        <div className="pd-tabs-editor-head">
          <input key={`${index}:${tab.label}`} defaultValue={tab.label} maxLength={MAX_LABEL} aria-label={`Sekme ${index + 1} etiketi`}
            onBlur={(event) => {
              const label = cleanTabLabel(event.target.value);
              if (label && label !== tab.label) write(tabs.map((item, i) => i === index ? { ...item, label } : item)); else event.target.value = tab.label;
            }}/>
          <label className="pd-check" title="Sayfa açılınca bu sekme gösterilir"><input type="radio" name="pd-default-tab" checked={index === current} onChange={() => write(tabs, index)}/>Varsayılan</label>
          <button type="button" className="pd-icon-button" aria-label={`${tab.label} sekmesini yukarı taşı`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={12}/></button>
          <button type="button" className="pd-icon-button" aria-label={`${tab.label} sekmesini aşağı taşı`} disabled={index === tabs.length - 1} onClick={() => move(index, 1)}><ArrowDown size={12}/></button>
          <button type="button" className="pd-icon-button danger" aria-label={`${tab.label} sekmesini sil`} onClick={() => remove(index)}><Trash2 size={12}/></button>
        </div>
        <InputPicker inputs={candidates} value={tab.ids} owned={owned} max={MAX_TAB_IDS} takenLabel="Başka sekmede" disabled={disabled}
          onChange={(ids) => write(tabs.map((item, i) => i === index ? { ...item, ids } : item))}/>
        {tab.ids.length === 0 && <small>Bu sekmede gösterilecek bileşenleri seçin.</small>}
      </fieldset>;
    })}
    <button type="button" className="pd-button small" disabled={disabled || tabs.length >= MAX_TABS} onClick={add}
      title={tabs.length >= MAX_TABS ? `En fazla ${MAX_TABS} sekme olabilir.` : undefined}><Plus size={13}/>Sekme ekle</button>
    {candidates.length === 0 && <small>Sekmelere yalnız sayfanın üst düzey bileşenleri eklenebilir (Sekmeler ve İşlem Çubuğu hariç; form kartındaki ya da yan filtre panelindeki girişler de eklenemez).</small>}
  </div>;
}
