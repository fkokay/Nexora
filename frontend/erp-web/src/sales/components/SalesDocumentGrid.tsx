import type { ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import type { BuiltInScreenLayoutField } from "../../erp-types";
import { screenViewGridDefaults } from "../../screenViewGridLayout";

type SalesDocumentGridProps<T extends { id: string }> = {
  gridId: string;
  fields: BuiltInScreenLayoutField[];
  items: T[];
  selectedId: string | null;
  loading: boolean;
  loadingMessage: string;
  emptyMessage: string;
  search: string;
  searchEmptyMessage: string;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
  onSelect: (id: string) => void;
  renderCell: (field: BuiltInScreenLayoutField, item: T) => ReactNode;
  /** Tablonun erişilebilir adı; varsayılan "Satış belgesi kayıtları". */
  ariaLabel?: string;
};

export default function SalesDocumentGrid<T extends { id: string }>({
  gridId,
  fields,
  items,
  selectedId,
  loading,
  loadingMessage,
  emptyMessage,
  search,
  searchEmptyMessage,
  toolbarContainer,
  onSelect,
  renderCell,
  ariaLabel = "Satış belgesi kayıtları",
}: SalesDocumentGridProps<T>) {
  const noRowsMessage = search ? searchEmptyMessage : emptyMessage;

  return (
    <div className="customer-table-wrap sales-document-grid-wrap">
      <AdvancedDataGrid
        className="customer-table quote-table"
        gridId={gridId}
        {...screenViewGridDefaults(fields)}
        externalPagination
        hideSearch
        toolbarContainer={toolbarContainer}
        enableRowSelection={false}
        aria-label={ariaLabel}
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
          ) : (
            items.map((item) => (
              <tr
                key={item.id}
                className={selectedId === item.id ? "erp-selected-row" : ""}
                tabIndex={0}
                onClick={() => onSelect(item.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(item.id);
                  }
                }}
                aria-selected={selectedId === item.id}
              >
                {fields.map((field) => (
                  <td key={field.key}>{renderCell(field, item)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
