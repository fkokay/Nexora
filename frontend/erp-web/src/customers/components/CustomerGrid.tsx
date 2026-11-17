import type { MutableRefObject, ReactNode } from "react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import type { BuiltInScreenLayoutField, CustomerItem } from "../../erp-types";
import SalesDocumentGrid, { type SalesGridSelection } from "../../sales/components/SalesDocumentGrid";

type Props = {
  items: CustomerItem[];
  fields: BuiltInScreenLayoutField[];
  loading: boolean;
  filter: string;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
  exportActionsRef: MutableRefObject<GridExportActions | null>;
  selection: SalesGridSelection;
  footer: ReactNode;
  renderCell: (field: BuiltInScreenLayoutField, item: CustomerItem) => ReactNode;
};

// Default widths for fields without a tenant width (the default view fits a 1440 screen without the panel).
const COLUMN_WIDTHS: Record<string, number> = {
  code: 86,
  name: 220,
  groupName: 116,
  type: 120,
  currencyCode: 54,
  paymentTermDays: 66,
  taxNumber: 104,
  status: 70,
  identityNumber: 116,
  taxOffice: 120,
  riskLimit: 96,
  parentCompanyName: 150,
  subsidiaryCount: 84,
  createdAt: 96,
};
const NUMBER_FIELDS: ReadonlySet<string> = new Set(["paymentTermDays", "riskLimit", "subsidiaryCount"]);
const CODE_FIELDS: ReadonlySet<string> = new Set(["code", "taxNumber", "identityNumber"]);

/**
 * Cari Hesaplar list in the approved list type: checkbox column, the page-owned current row (click, ↑/↓) that the
 * bar's Aç and the detail panel follow, double-click / Enter opens the card, floating bulk bar.
 */
export function CustomerGrid({ items, fields, loading, filter, toolbarContainer, exportActionsRef, selection, footer, renderCell }: Props) {
  return (
    <section className="erp-list-pane list-v2-list" aria-label="Cariler">
      <SalesDocumentGrid
        gridId="customers-directory"
        ariaLabel="Cari kayıtları"
        fields={fields}
        items={items}
        loading={loading}
        loadingMessage="Kayıtlar yükleniyor…"
        emptyMessage="Henüz cari kartı eklenmemiş."
        search={filter}
        searchEmptyMessage="Aramanızla eşleşen cari kartı yok."
        toolbarContainer={toolbarContainer}
        hideExport
        exportActionsRef={exportActionsRef}
        selection={selection}
        footer={footer}
        renderCell={renderCell}
        columnWidths={COLUMN_WIDTHS}
        numberFields={NUMBER_FIELDS}
        codeFields={CODE_FIELDS}
      />
    </section>
  );
}
