import type { MutableRefObject } from "react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import type { BuiltInScreenLayoutField } from "../../erp-types";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import { SalesListFooter } from "../../sales/components/SalesListFooter";
import { formatDate } from "../../document-detail/DocumentDetailLayout";
import { DeliveryNoteLinkTag } from "../../purchasing/purchaseDeliveryNotePanel";
import { deliveryNotePageSize, type Note, type ScreenField } from "../types";
import { formatMoneyWithCurrency } from "../../delivery-pricing/deliveryPricing";
import { PricingStateTag } from "../../delivery-pricing/DeliveryPricingCells";

const NUMBER_FIELDS: ReadonlySet<string> = new Set(["lineCount", "pricedGrandTotal"]);
const CODE_FIELDS: ReadonlySet<string> = new Set(["documentNumber", "purchaseOrderCode", "purchaseReceiptCode"]);
/** Page column (not in the tenant layout): the state derived from the receipt link. */
const LINK_STATUS_KEY = "receiptLinkStatus";
/** Page column (taslak 20): the priced total with the Bedelsiz / Kısmen bedelsiz / Fiyatsız tag. */
const AMOUNT_KEY = "pricedGrandTotal";
/** Default widths (fields without a tenant width): the list fits beside the menu at 1440 with the panel closed. */
const COLUMN_WIDTHS: Record<string, number> = {
  documentNumber: 150, documentDate: 100, purchaseOrderCode: 130, supplierName: 220, lineCount: 60, purchaseReceiptCode: 150,
  [LINK_STATUS_KEY]: 140, [AMOUNT_KEY]: 150,
};

/**
 * Delivery note list (list type, mockup 07): checkbox column, current row (click, ↑/↓) for the panel and the bar,
 * double-click / Enter / the number link open the note. The derived tag has its own Durum column after the tenant's.
 */
export function DeliveryNotesListPanel({
  fields,
  rows,
  searching,
  page,
  total,
  loading,
  currentId,
  ticked,
  listActive,
  exportActionsRef,
  toolbarContainer,
  onCurrentChange,
  onTickedChange,
  onPageChange,
  onOpenNote,
}: {
  fields: ScreenField[];
  /** The page shown: the list page or the search result page. */
  rows: Note[];
  searching: boolean;
  page: number;
  total: number;
  loading: boolean;
  currentId: string | null;
  ticked: number;
  /** The list is on screen (no document or create view over it). */
  listActive: boolean;
  exportActionsRef: MutableRefObject<GridExportActions | null>;
  toolbarContainer: HTMLElement | null;
  onCurrentChange: (id: string | null) => void;
  onTickedChange: (ids: string[]) => void;
  onPageChange: (page: number) => void;
  onOpenNote: (note: Note) => void;
}) {
  const renderCell = (field: BuiltInScreenLayoutField, note: Note) => {
    switch (field.key) {
      case "documentNumber":
        return (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-haspopup="dialog"
            aria-label={`${note.documentNumber} irsaliye ayrıntılarını aç`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenNote(note);
            }}
          >
            {note.documentNumber}
          </button>
        );
      case "documentDate":
        return formatDate(note.documentDate);
      case "purchaseOrderCode":
        return note.purchaseOrderCode;
      case "supplierName":
        return note.supplierName;
      case "lineCount":
        return note.lineCount;
      case "purchaseReceiptCode":
        return note.purchaseReceiptCode ?? "—";
      case LINK_STATUS_KEY:
        return <DeliveryNoteLinkTag note={note} />;
      case AMOUNT_KEY:
        return (
          <>
            {note.pricedGrandTotal === null || note.pricedGrandTotal === undefined || note.pricingState === "Free" || note.pricingState === "Unpriced"
              ? "—"
              : formatMoneyWithCurrency(note.pricedGrandTotal, note.currencyCode)}
            {note.pricingState && note.pricingState !== "Priced" && (
              <>
                {" "}
                <PricingStateTag state={note.pricingState} />
              </>
            )}
          </>
        );
      default:
        return null;
    }
  };
  // The derived tag is its own column after the tenant's columns, so a layout that hides the receipt column keeps it.
  const tenantFields = fields as BuiltInScreenLayoutField[];
  const shownFields = [
    ...tenantFields,
    // A tenant layout that already has the amount column keeps its own place.
    ...(tenantFields.some((field) => field.key === AMOUNT_KEY)
      ? []
      : [{ key: AMOUNT_KEY, label: "Tutar", visible: true, position: fields.length, fixed: true }]),
    { key: LINK_STATUS_KEY, label: "Durum", visible: true, position: fields.length + 1, fixed: true },
  ];
  return (
    <section className="list-v2-list">
      <SalesDocumentGrid
        gridId="purchase-delivery-notes"
        hideExport
        exportActionsRef={exportActionsRef}
        fields={shownFields}
        items={rows}
        loading={loading}
        loadingMessage="İrsaliyeler yükleniyor…"
        emptyMessage={total === 0 ? "Henüz gelen irsaliye yok." : "Bu sayfada kayıt yok; listeyi yenileyin."}
        search={searching ? "search" : ""}
        searchEmptyMessage="Aramanızla eşleşen irsaliye bulunamadı."
        toolbarContainer={toolbarContainer}
        renderCell={renderCell}
        ariaLabel="Gelen irsaliyeler"
        selection={{
          currentId,
          onCurrentChange,
          onTickedChange,
          // Only while the list is on screen: a document or form over it must not show the floating bar.
          bulkActions: listActive
            ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void exportActionsRef.current?.exportExcel() }]
            : undefined,
          onOpen: (id) => {
            const note = rows.find((item) => item.id === id);
            if (note) onOpenNote(note);
          },
        }}
        footer={
          <SalesListFooter
            ticked={ticked}
            shown={rows.length}
            total={total}
            page={page}
            pageSize={deliveryNotePageSize}
            loading={loading}
            onPageChange={onPageChange}
          />
        }
        columnWidths={COLUMN_WIDTHS}
        numberFields={NUMBER_FIELDS}
        codeFields={CODE_FIELDS}
      />
    </section>
  );
}
