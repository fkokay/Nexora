import type { ReactNode } from "react";
import { Banknote } from "lucide-react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { Item, ScreenField } from "../paymentInstrumentTypes";

/**
 * Grid settings key (`nexora.grid.<id>`). The column set changed with the redesign (No, Cari ·
 * banka, Vade, Tutar, ⋯); saved settings are stored by column index, so the id moved to -v2.
 */
export const PAYMENT_INSTRUMENT_GRID_ID = "payment-instruments-v2";

/** Columns of the redesigned list, in default order. Tenant screen views may hide or reorder them. */
export const PAYMENT_INSTRUMENT_COLUMNS: ScreenField[] = [
  { key: "instrumentNumber", label: "No", visible: true, position: 0 },
  { key: "counterpartyName", label: "Cari · banka", visible: true, position: 1 },
  { key: "dueDate", label: "Vade", visible: true, position: 2 },
  { key: "amount", label: "Tutar", visible: true, position: 3 },
  { key: "actions", label: "İşlemler", visible: true, position: 4, fixed: true },
];

/** Default [initial, minimum] widths per column key; tenant layout widths win. */
const defaultColumnWidths: Record<string, [number, number]> = {
  instrumentNumber: [220, 170],
  counterpartyName: [260, 180],
  dueDate: [150, 120],
  amount: [160, 120],
  actions: [64, 56],
};

type Props = {
  fields: ScreenField[];
  items: Item[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (item: Item) => void;
  /** Page-level toolbar element that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null;
  renderCell: (field: ScreenField, item: Item) => ReactNode;
};

export function PaymentInstrumentGrid({
  fields,
  items,
  loading,
  selectedId,
  onSelect,
  toolbarContainer,
  renderCell,
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
  const columnClass = (key: string) =>
    key === "amount" ? "pi-col-num" : key === "actions" ? "pi-col-menu" : undefined;
  return (
    <div className="pi-table-wrap">
      <AdvancedDataGrid
        hideSearch
        externalPagination
        enableRowSelection={false}
        toolbarContainer={toolbarContainer}
        gridId={PAYMENT_INSTRUMENT_GRID_ID}
        {...screenViewGridDefaults(
          // Keep the ⋯ menu visible when the grid scrolls sideways.
          fields.map((field) =>
            field.key === "actions" && !field.pinned
              ? { ...field, pinned: "right" as const }
              : field,
          ),
          (field) => defaultColumnWidths[field.key]?.[0],
        )}
        minimumColumnWidths={fields.map(
          (field) => defaultColumnWidths[field.key]?.[1] ?? 0,
        )}
        className="customer-table pi-table"
      >
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field.key} scope="col" className={columnClass(field.key)}>
                {field.key === "actions" ? (
                  <span className="sr-only">{field.label}</span>
                ) : (
                  field.label
                )}
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
              // The whole row selects the instrument for the side column; buttons keep their own action.
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input, select")) return;
                onSelect(item);
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
