import { sanitizeSafeValue } from "./DesignLanguageFields";
import { InputPicker, type PickerInput } from "./LayoutFields";
import { MAX_DIALOG_IDS, MAX_ROW_ACTIONS, idList, parseTabs } from "./layoutRefs";

type RowActionComponent = { id: string; type: string; name?: string; props: Record<string, unknown> };

export const ROW_ACTION_TYPES = ["query", "sequence", "openDialog", "link", "erpPage", "page"];
export const MAX_EMPTY_TEXT = 120;
export const MAX_ROW_LIMIT = 100;
const defaultLabel = (component: RowActionComponent) => String(component.props.label || component.props.title || component.name || component.id);

/**
 * Bir düğmenin başka sahipleri (sekme, pencere, başka listenin satır işlemi, İşlem Çubuğu menüsü): kimlik → sahip metni.
 * Bu listenin kendi satır işlemleri sayılmaz.
 */
export function rowActionOwners(components: RowActionComponent[], tableId: string, labelOf: (component: RowActionComponent) => string = defaultLabel): Record<string, string> {
  const owners: Record<string, string> = {};
  for (const component of components) {
    if (component.id === tableId) continue;
    if (component.type === "tabs") for (const tab of parseTabs(component.props.tabs)) for (const id of tab.ids) owners[id] = `${labelOf(component)} · ${tab.label}`;
    if (component.type === "dialog") for (const id of idList(component.props.contains, MAX_DIALOG_IDS)) owners[id] = labelOf(component);
    if (component.type === "dataTable") for (const id of idList(component.props.rowActions, MAX_ROW_ACTIONS)) owners[id] = `${labelOf(component)} · satır işlemi`;
    if (component.type === "actionBar") for (const id of idList(component.props.moreButtons, 10)) owners[id] = `${labelOf(component)} · İşlemler menüsü`;
  }
  return owners;
}

/**
 * Veri listesinin "Satır eylemleri" bölümü: satır başına çizilecek düğmeler (en çok 4; sorgu, kayıt dizisi ya da
 * pencere açan, başka sahibi olmayan düğmeler), boş liste metni ve en fazla satır. `onPatch` undefined değeri siler.
 */
export function RowActionsFields({ table, components, labelOf = defaultLabel, serverPaged, disabled, onPatch }: {
  table: RowActionComponent; components: RowActionComponent[]; labelOf?: (component: RowActionComponent) => string;
  /** Liste sunucu sayfalıysa `limit` kullanılamaz. */
  serverPaged: boolean; disabled?: boolean;
  onPatch: (patch: { rowActions?: string[]; emptyText?: string; limit?: number }) => void;
}) {
  const value = idList(table.props.rowActions, MAX_ROW_ACTIONS);
  const buttons: PickerInput[] = components.filter((component) => component.type === "button").map((component) => ({
    id: component.id, name: component.name, label: labelOf(component), inputType: String(component.props.actionType ?? ""), hasOptions: false,
  }));
  const eligible = (input: PickerInput) => ROW_ACTION_TYPES.includes(input.inputType);
  const owners = rowActionOwners(components, table.id, labelOf);
  const named = typeof table.name === "string" && table.name !== "";
  const queryBound = typeof table.props.query === "string" && table.props.query !== "";
  const ineligibleSelected = value.filter((id) => { const button = buttons.find((item) => item.id === id); return !button || !eligible(button); });
  const emptyText = typeof table.props.emptyText === "string" ? table.props.emptyText : "";
  const limit = typeof table.props.limit === "number" ? table.props.limit : undefined;
  return <>
    <div className="pd-field">Satır eylemleri<small>Her satırın sonundaki “İşlemler” sütununda çizilir; tıklanan satır seçilir ve düğme o satırla çalışır.</small>
      {!named && <small className="pd-query-warning">Satır işlemleri için listeye bir Ad verin.</small>}
      {!queryBound && <small className="pd-query-warning">Satır işlemleri yalnız bir sorguya bağlı listede kullanılabilir.</small>}
      <InputPicker inputs={buttons} value={value} owned={owners} filter={eligible} max={MAX_ROW_ACTIONS} takenLabel="Başka yerde" disabled={disabled || !named || !queryBound}
        onChange={(next) => onPatch({ rowActions: next.length > 0 ? next : undefined })}/>
      {buttons.filter(eligible).length === 0 && <small>Önce eylem türü sorgu, kayıt dizisi, pencere aç ya da gezinme (bağlantı, ERP ekranı, sayfa) olan bir düğme ekleyin.</small>}
      {ineligibleSelected.length > 0 && <small className="pd-query-warning">Satır işlemi düğmesinin eylem türü sorgu, kayıt dizisi, pencere aç ya da gezinme (bağlantı, ERP ekranı, sayfa) olmalıdır.</small>}
    </div>
    <label className="pd-field">Boş liste metni<small>Boşsa ERP'nin standart “kayıt yok” metni gösterilir; sorgu çalışmadan önce de bu metin görünür.</small>
      <input value={emptyText} maxLength={MAX_EMPTY_TEXT} disabled={disabled} placeholder="Henüz hareket yok."
        onChange={(event) => onPatch({ emptyText: sanitizeSafeValue(event.target.value, false).slice(0, MAX_EMPTY_TEXT) || undefined })}/>
    </label>
    <label className="pd-field">En fazla satır<small>{serverPaged ? "'limit' sunucu sayfalı listede kullanılamaz." : "Yalnız ilk N satır çizilir (1–100); toplamlar ve Excel çizilen satırları kullanır."}</small>
      <input type="number" min={1} max={MAX_ROW_LIMIT} step={1} value={limit ?? ""} disabled={disabled || serverPaged || !queryBound} placeholder="Tümü"
        onChange={(event) => {
          const number = Number(event.target.value);
          onPatch({ limit: event.target.value === "" || !Number.isInteger(number) ? undefined : Math.max(1, Math.min(MAX_ROW_LIMIT, number)) });
        }}/>
    </label>
  </>;
}
