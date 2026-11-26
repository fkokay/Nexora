import type { ReactNode } from "react";
import { readPageTemplate } from "../pageTemplates";
import { ButtonsPanel } from "./ButtonsPanel";
import { ComponentPanel } from "./ComponentPanel";
import { consultantKindOf } from "./consultantPalette";
import type { FieldToken } from "./consultantText";
import { IndicatorPanel } from "./IndicatorPanel";
import { ImagePanel } from "./ImagePanel";
import { InfoBoxPanel } from "./InfoBoxPanel";
import { ListPanel, type ListPanelProps } from "./ListPanel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { RecordPanel, recordSelectionOf, type RecordPanelProps } from "./RecordPanel";
import { TextPanel } from "./TextPanel";

export const SLOT_LABELS: Record<string, string> = {
  indicators: "Göstergeler", filters: "Süzgeç alanı", list: "Liste", actions: "Listenin üstündeki eylemler",
  rowActions: "Satır eylemleri", detail: "Yan panel", above: "Listenin üstü", below: "Listenin altı",
};
const RECORD_SLOT_LABELS: Record<string, string> = { above: "Kartın üstü", below: "Kartın altı" };
export const TEMPLATE_CANVAS_FALLBACK = "Bu ekran ERP önizlemesi açılınca görünür.";

/** Kalıplı sayfa paneli yalnız kalıplı sayfanın üst düzey bileşenlerinde açılır; kalıpsız sayfada bugünkü sekmeli panel kalır. */
export function usesTemplateInspector(def: Pick<ModelDefinition, "template" | "components">, componentId: string): boolean {
  return !!readPageTemplate(def.template) && def.components.some((component) => component.id === componentId);
}

/**
 * Kalıplı sayfanın özellikler paneli.
 * - Kayıt kartında (`record` verilirse) kartın parçaları ve sayfa (`component` yokken) `RecordPanel`'de açılır.
 * - Liste kalıbında liste için `ListPanel`; Metin, Bilgi kutusu, Gösterge, Görsel ve eylem yerlerindeki düğmeler için
 *   danışman panelleri (alt proje 5a). Kayıt kartının ek alanlarında danışman panelleri sonraki planda gelir.
 * - Öteki bileşenler için `ComponentPanel` içinde bugünkü ayar alanları.
 * Bileşen adı bağlamalarda kullanıldığından danışman panellerinde salt okunurdur. Ek alanlarda (`above` / `below`) Ad
 * bölümünün altında "Yeri" seçimi vardır; Gösterge yerini kendi panelinde seçer.
 */
export function TemplateInspector({ component, legacy, list, record, tokens, disabled, onLeave, onPlace }: {
  component: ModelComponent | null; legacy: ReactNode; list: Omit<ListPanelProps, "listId"> | null;
  record?: Omit<RecordPanelProps, "selection"> | null;
  /** Metindeki `{Alan}` ifadeleri ve "Kayıttaki resim" için listenin kolonları (`fieldTokens`). */
  tokens: FieldToken[]; disabled?: boolean;
  onLeave?: ListPanelProps["onLeave"]; onPlace: (slot: "above" | "below") => void;
}) {
  if (record) {
    const selection = recordSelectionOf(record.def, component?.id ?? null);
    if (selection) return <RecordPanel {...record} selection={selection} disabled={disabled || record.disabled}/>;
  }
  if (!component) return null;
  const labels = record ? { ...SLOT_LABELS, ...RECORD_SLOT_LABELS } : SLOT_LABELS;
  const slot = typeof component.props.slot === "string" ? component.props.slot : "";
  if (slot === "list" && component.type === "dataTable" && list) return <ListPanel {...list} listId={component.id} disabled={disabled} onLeave={onLeave}/>;
  const extra = slot === "above" || slot === "below";
  const placeChoice = extra
    ? <div className="cpanel-row cpanel-template-place">Yeri<div className="cpanel-seg" role="group" aria-label="Yeri">{(["above", "below"] as const).map((value) =>
        <button type="button" key={value} className={slot === value ? "on" : ""} aria-pressed={slot === value} disabled={disabled} onClick={() => onPlace(value)}>{labels[value]}</button>)}</div></div>
    : null;

  // Danışman panelleri yalnız Liste kalıbında (5a); Kayıt kartında yerler ve alanlar farklıdır.
  const kind = list && !record ? consultantKindOf(component) : null;
  if (list && kind) {
    const common = { component, definition: list.definition, disabled, onChange: list.onChange, onRename: () => {}, visibility: list.visibility };
    switch (kind) {
      case "text": return <TextPanel {...common} tokens={tokens} place={placeChoice}/>;
      case "infoBox": return <InfoBoxPanel {...common} tokens={tokens} place={placeChoice}/>;
      case "image": return <ImagePanel {...common} tokens={tokens} place={placeChoice}/>;
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
