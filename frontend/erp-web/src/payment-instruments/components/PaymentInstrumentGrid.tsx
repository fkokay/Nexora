import type { ReactNode } from "react";
import { Banknote } from "lucide-react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { Item, ScreenField } from "../paymentInstrumentTypes";

/** Default [initial, minimum] widths per column key; tenant layout widths win. */
const defaultColumnWidths: Record<string, [number, number]> = {
  instrumentNumber: [210, 180],
  code: [150, 120],
  type: [85, 75],
  direction: [95, 85],
  counterpartyName: [220, 160],
  bankName: [180, 140],
  dueDate: [125, 110],
  amount: [135, 110],
  currencyCode: [85, 75],
  status: [130, 110],
  actions: [360, 330],
};

type Props = {
  fields: ScreenField[];
  items: Item[];
  loading: boolean;
  /** Page-level toolbar element that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null;
  renderCell: (field: ScreenField, item: Item) => ReactNode;
};

export function PaymentInstrumentGrid({
  fields,
  items,
  loading,
  toolbarContainer,
  renderCell,
}: Props) {
  if (loading)
    return <div className="payment-instrument-empty">Kayıtlar yükleniyor…</div>;
  if (items.length === 0)
    return (
      <div className="payment-instrument-empty">
        <Banknote size={20} />
        <b>Gösterilecek kayıt yok</b>
        <span>
          Filtreleri değiştirebilir veya yeni çek/senet ekleyebilirsiniz.
        </span>
      </div>
    );
  return (
    <div className="payment-instrument-table-wrap">
      <AdvancedDataGrid
        hideSearch
        externalPagination
        enableRowSelection={false}
        toolbarContainer={toolbarContainer}
        gridId="payment-instruments"
        {...screenViewGridDefaults(
          fields,
          (field) => defaultColumnWidths[field.key]?.[0],
        )}
        minimumColumnWidths={fields.map(
          (field) => defaultColumnWidths[field.key]?.[1] ?? 0,
        )}
        className="payment-instrument-table"
      >
        <thead>
          <ScreenViewGroupHeader fields={fields} />
          <tr>
            {fields.map((field) => (
              <th key={field.key}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {fields.map((field) => (
                <td key={field.key}>{renderCell(field, item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
