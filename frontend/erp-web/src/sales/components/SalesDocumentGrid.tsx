import type { MutableRefObject, ReactNode } from "react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import type { BuiltInScreenLayoutField } from "../../erp-types";
import type { BulkAction } from "../../list-page/BulkActionBar";
import { screenViewGridDefaults } from "../../screenViewGridLayout";

/**
 * The approved list type (mockup 06 / Stok Kartları): a checkbox column, a page-owned current row (click, ↑/↓) that
 * the bar's Aç / Sil and the detail panel follow, and the floating bulk bar. Without it the grid keeps its legacy
 * single-row selection (`selectedId` / `onSelect`), as used by other modules.
 */
export type SalesGridSelection = {
  /** The current row the user chose (null = none; the grid never picks a first row by itself). */
  currentId: string | null;
  onCurrentChange: (id: string | null) => void;
  /** Ticked rows of the visible page. Pass a stable function (the grid reports through an effect). */
  onTickedChange: (ids: string[]) => void;
  bulkActions?: BulkAction[];
  /** Enter on a focused row when the action bar's Aç did not handle it (e.g. nothing current yet). */
  onOpen?: (id: string) => void;
  /** Displayed order of the visible page. */
  onVisibleRowsChange?: (ids: string[]) => void;
};

type SalesDocumentGridProps<T extends { id: string }> = {
  gridId: string;
  fields: BuiltInScreenLayoutField[];
  items: T[];
  /** Legacy selection (without `selection`). */
  selectedId?: string | null;
  loading: boolean;
  loadingMessage: string;
  emptyMessage: string;
  search: string;
  searchEmptyMessage: string;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
  /** Legacy selection (without `selection`): row click / Enter / Space. */
  onSelect?: (id: string) => void;
  renderCell: (field: BuiltInScreenLayoutField, item: T) => ReactNode;
  /** Tablonun erişilebilir adı; varsayılan "Satış belgesi kayıtları". */
  ariaLabel?: string;
  /** Hides the grid's XLSX/CSV header buttons; the action bar's Excel command still exports. */
  hideExport?: boolean;
  /** Receives the grid's export functions while mounted (see AdvancedDataGrid). */
  exportActionsRef?: MutableRefObject<GridExportActions | null>;
  selection?: SalesGridSelection;
  /** Line under the list (hints, selection, pagination). */
  footer?: ReactNode;
  /** Default column widths for fields without a tenant width, sized so the list fits without a horizontal scroll. */
  columnWidths?: Record<string, number>;
  /** Right-aligned `tabular-nums` columns (`nx-num`). */
  numberFields?: ReadonlySet<string>;
  /** Monospace document number columns (`nx-code`). */
  codeFields?: ReadonlySet<string>;
};

export default function SalesDocumentGrid<T extends { id: string }>({
  gridId,
  fields,
  items,
  selectedId = null,
  loading,
  loadingMessage,
  emptyMessage,
  search,
  searchEmptyMessage,
  toolbarContainer,
  onSelect,
  renderCell,
  ariaLabel = "Satış belgesi kayıtları",
  hideExport,
  exportActionsRef,
  selection,
  footer,
  columnWidths,
  numberFields,
  codeFields,
}: SalesDocumentGridProps<T>) {
  const noRowsMessage = search ? searchEmptyMessage : emptyMessage;
  const cellClass = (field: BuiltInScreenLayoutField) =>
    numberFields?.has(field.key) ? "nx-num" : codeFields?.has(field.key) ? "nx-code" : undefined;
  const defaults = screenViewGridDefaults(fields, columnWidths ? (field) => columnWidths[field.key] : undefined);

  return (
    <>
      <div className="customer-table-wrap sales-document-grid-wrap">
        <AdvancedDataGrid
          className="customer-table quote-table"
          gridId={gridId}
          {...defaults}
          externalPagination
          hideSearch
          toolbarContainer={toolbarContainer}
          enableRowSelection={false}
          hideExport={hideExport}
          exportActionsRef={exportActionsRef}
          aria-label={ariaLabel}
          {...(selection
            ? {
                selectable: true,
                bulkActions: selection.bulkActions,
                currentRowKey: selection.currentId,
                onCurrentRowChange: selection.onCurrentChange,
                onSelectionChange: selection.onTickedChange,
                onVisibleRowsChange: selection.onVisibleRowsChange,
              }
            : {})}
        >
          <thead>
            <ScreenViewGroupHeader fields={fields} />
            <tr>
              {fields.map((field) => (
                <th key={field.key} className={numberFields?.has(field.key) ? "nx-num" : undefined}>
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={fields.length} className="table-empty">
                  {loadingMessage}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={fields.length} className="table-empty">
                  {noRowsMessage}
                </td>
              </tr>
            ) : selection ? (
              items.map((item) => (
                // The grid owns click / ↑↓ / Space (current row, ticks); Enter is the bar's Aç, which reads the
                // focused row (`data-record-id`); when Aç did not run (nothing current) the row opens itself.
                <tr
                  key={item.id}
                  data-record-id={item.id}
                  tabIndex={0}
                  onDoubleClick={(event) => {
                    // Not from the checkbox (or its cell's padding) or a link / button inside the row (they act on
                    // their own): a quick double tick must not open the record.
                    if (!selection.onOpen || (event.target as HTMLElement).closest("button,input,select,a,.advanced-grid-select-cell")) return;
                    event.preventDefault();
                    selection.onOpen(item.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || event.defaultPrevented || event.key !== "Enter") return;
                    if (!selection.onOpen) return;
                    event.preventDefault();
                    selection.onOpen(item.id);
                  }}
                >
                  {fields.map((field) => (
                    <td key={field.key} className={cellClass(field)}>
                      {renderCell(field, item)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  data-record-id={item.id}
                  className={selectedId === item.id ? "erp-selected-row" : ""}
                  tabIndex={0}
                  onClick={() => onSelect?.(item.id)}
                  onKeyDown={(event) => {
                    // The action bar may already have run Aç (Enter) for this row.
                    if (event.target !== event.currentTarget || event.defaultPrevented) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect?.(item.id);
                    }
                  }}
                  aria-selected={selectedId === item.id}
                >
                  {fields.map((field) => (
                    <td key={field.key} className={cellClass(field)}>
                      {renderCell(field, item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
      {footer}
    </>
  );
}
