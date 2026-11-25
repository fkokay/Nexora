import type { ReactNode } from "react";
import { ComponentPanel } from "./ComponentPanel";
import { ListPanel, type ListPanelProps } from "./ListPanel";
import type { ModelComponent } from "./listPanelModel";

export const SLOT_LABELS: Record<string, string> = {
  indicators: "Göstergeler", filters: "Süzgeç alanı", list: "Liste", actions: "Listenin üstündeki eylemler",
  rowActions: "Satır eylemleri", detail: "Yan panel", above: "Listenin üstü", below: "Listenin altı",
};
export const TEMPLATE_CANVAS_FALLBACK = "Bu ekran ERP önizlemesi açılınca görünür.";

/**
 * Kalıplı sayfanın özellikler paneli: liste için `ListPanel`, öteki bileşenler için `ComponentPanel` içinde bugünkü ayar
 * alanları (yeni panelleri 5. alt projede gelir). Ek alanlarda (`above` / `below`) Ad bölümünün altında "Yeri" seçimi vardır.
 */
export function TemplateInspector({ component, legacy, list, disabled, onLeave, onPlace }: {
  component: ModelComponent; legacy: ReactNode; list: Omit<ListPanelProps, "listId"> | null; disabled?: boolean;
  onLeave?: ListPanelProps["onLeave"]; onPlace: (slot: "above" | "below") => void;
}) {
  const slot = typeof component.props.slot === "string" ? component.props.slot : "";
  if (slot === "list" && component.type === "dataTable" && list) return <ListPanel {...list} listId={component.id} disabled={disabled} onLeave={onLeave}/>;
  const extra = slot === "above" || slot === "below";
  const what = extra
    ? <div className="cpanel-row cpanel-template-place">Yeri<div className="cpanel-seg" role="group" aria-label="Yeri">{(["above", "below"] as const).map((value) =>
        <button type="button" key={value} className={slot === value ? "on" : ""} aria-pressed={slot === value} disabled={disabled} onClick={() => onPlace(value)}>{SLOT_LABELS[value]}</button>)}</div></div>
    : <p className="cpanel-note">{`Yeri: ${SLOT_LABELS[slot] ?? "—"}`}</p>;
  return <ComponentPanel name={component.name ?? ""} onRename={() => {}} nameReadOnly what={what} basicsTitle="Ayarlar" basics={legacy}
    actions={<p className="cpanel-note">Bu bileşenin eylemleri yukarıdaki ayarlardadır.</p>}
    appearance={<p className="cpanel-note">Bu bileşenin yeni paneli sonraki adımda gelir.</p>}/>;
}
