import type { MutableRefObject, ReactNode } from "react";
import { Banknote } from "lucide-react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { Item, ScreenField } from "../paymentInstrumentTypes";

/**
 * Grid settings key (`nexora.grid.<id>`). The column set changed with the redesign (No, Cari · banka, Vade, Tutar) and
 * again when the row ⋯ menu left (its actions are in İşlemler); saved settings are stored by column index, so the id
 * moved to -v3.
 */
export const PAYMENT_INSTRUMENT_GRID_ID = "payment-instruments-v3";

/** Columns of the redesigned list, in default order. Tenant screen views may hide or reorder them. */
export const PAYMENT_INSTRUMENT_COLUMNS: ScreenField[] = [
  { key: "instrumentNumber", label: "No", visible: true, position: 0 },
  { key: "counterpartyName", label: "Cari · banka", visible: true, position: 1 },
  { key: "dueDate", label: "Vade", visible: true, position: 2 },
  { key: "amount", label: "Tutar", visible: true, position: 3 },
];

/** Default [initial, minimum] widths per column key; tenant layout widths win. */
const defaultColumnWidths: Record<string, [number, number]> = {
  instrumentNumber: [220, 170],
  counterpartyName: [260, 180],
  dueDate: [150, 120],
  amount: [160, 120],
};

type Props = {
  fields: ScreenField[];
  items: Item[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (item: Item) => void;
  /** Double click / Enter on a row (Enter through the bar's Aç, which reads the focused row) opens the record. */
  onOpen: (item: Item) => void;
  /** Page-level toolbar element that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null;
  renderCell: (field: ScreenField, item: Item) => ReactNode;
  /** Receives the grid's export functions (the action bar's Excel and İşlemler › CSV); the grid's own buttons hide. */
  exportActionsRef?: MutableRefObject<GridExportActions | null>;
};

export function PaymentInstrumentGrid({
  fields,
  items,
  loading,
  selectedId,
  onSelect,
  onOpen,
  toolbarContainer,
  renderCell,
  exportActionsRef,
}: Props) {
  if (loading && items.length === 0)
    return <div className="pi-empty" role="status">Kayıtlar yükleniyor…</div>;
  if (items.length === 0)
    return (
      <div className="pi-empty">
        <Banknote size={20} aria-hidden="true" />
        <b>Gösterilecek kayıt yok</b>
        <span>
          Filtreleri değiştirebilir veya yeni çek/senet ekleyebilirsiniz.
        </span>
      </div>
    );
  const columnClass = (key: string) => (key === "amount" ? "pi-col-num nx-num" : undefined);
  return (
    <div className="pi-table-wrap">
      <AdvancedDataGrid
        hideSearch
        externalPagination
        enableRowSelection={false}
        toolbarContainer={toolbarContainer}
        hideExport={!!exportActionsRef}
        exportActionsRef={exportActionsRef}
        gridId={PAYMENT_INSTRUMENT_GRID_ID}
        {...screenViewGridDefaults(fields, (field) => defaultColumnWidths[field.key]?.[0])}
        minimumColumnWidths={fields.map(
          (field) => defaultColumnWidths[field.key]?.[1] ?? 0,
        )}
        className="customer-table pi-table"
      >
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field.key} scope="col" className={columnClass(field.key)}>
                {field.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={item.id === selectedId ? "is-selected" : undefined}
              aria-selected={item.id === selectedId}
              data-record-id={item.id}
              tabIndex={0}
              // The whole row selects the instrument for the side column (İşlemler act on it); links keep their own action.
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input, select")) return;
                onSelect(item);
              }}
              onDoubleClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input, select")) return;
                event.preventDefault();
                onOpen(item);
              }}
              onKeyDown={(event) => {
                // On Enter the bar's Aç has already opened the focused row; this is the fallback. Space selects.
                if (event.target !== event.currentTarget || event.defaultPrevented) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  onOpen(item);
                } else if (event.key === " ") {
                  event.preventDefault();
                  onSelect(item);
                }
              }}
            >
              {fields.map((field) => (
                <td key={field.key} className={columnClass(field.key)} data-label={field.label}>
                  {renderCell(field, item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
