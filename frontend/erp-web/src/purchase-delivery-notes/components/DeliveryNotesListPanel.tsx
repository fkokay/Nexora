import { useState } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { ListToolbar } from "../../list-page/ListToolbar";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { deliveryNotePageSize, type Note, type ScreenField } from "../types";
import { ListPagination } from "../../list-page/ListPagination";

export function DeliveryNotesListPanel({
  fields,
  notes,
  searchResults,
  searchTotal,
  searchPage,
  page,
  total,
  loading,
  search,
  onSearchChange,
  onSearchApply,
  onRefresh,
  onPageChange,
  onOpenNote,
  onOpenOrder,
}: {
  fields: ScreenField[];
  notes: Note[];
  searchResults: Note[] | null;
  searchTotal: number;
  searchPage: number;
  page: number;
  total: number;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  /** Applies the typed search text; an empty text returns to the full list. */
  onSearchApply: () => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onOpenNote: (note: Note) => void;
  onOpenOrder: (note: Note) => void;
}) {
  const isSearching = searchResults !== null;
  const currentPage = isSearching ? searchPage : page;
  const currentTotal = isSearching ? searchTotal : total;
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);

  return (
    <>
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      onSearchApply={onSearchApply}
      searchLabel="Gelen irsaliyelerde ara"
      searchPlaceholder="İrsaliye no, sipariş, tedarikçi veya mal kabul ara"
      toolsSlotRef={setToolsSlot}
      onRefresh={() => {
        if (!loading) onRefresh();
      }}
    />
    <section
      className="panel purchase-note-list-panel list-v2-list"
      aria-label="Gelen irsaliyeler"
    >
      <div className="ledger-list">
        <AdvancedDataGrid
          hideSearch
          externalPagination
          className="customer-table"
          toolbarContainer={toolsSlot}
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
                  İrsaliyeler yükleniyor…
                </td>
              </tr>
            ) : (
              (searchResults ?? notes).map((note) => (
                <tr key={note.id}>
                  {fields.map((field) => (
                    <td key={field.key}>
                      {field.key === "documentNumber" ? (
                        note.documentNumber
                      ) : field.key === "documentDate" ? (
                        note.documentDate
                      ) : field.key === "purchaseOrderCode" ? (
                        note.purchaseOrderCode
                      ) : field.key === "supplierName" ? (
                        note.supplierName
                      ) : field.key === "lineCount" ? (
                        note.lineCount
                      ) : field.key === "purchaseReceiptCode" ? (
                        note.purchaseReceiptCode ? (
                          `Eşleşti · ${note.purchaseReceiptCode}`
                        ) : (
                          "Mal kabul bağlantısı yok"
                        )
                      ) : field.key === "actions" ? (
                        <>
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => onOpenNote(note)}
                          >
                            Detay
                          </button>
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => onOpenOrder(note)}
                          >
                            Siparişi aç
                          </button>
                        </>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
            {!loading && (searchResults ?? notes).length === 0 && (
              <tr>
                <td colSpan={fields.length} className="table-empty">
                  {isSearching
                    ? "Aramanızla eşleşen irsaliye bulunamadı."
                    : total === 0
                      ? "Henüz gelen irsaliye yok."
                      : "Bu sayfada kayıt yok; listeyi yenileyin."}
                </td>
              </tr>
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
      <ListPagination
        page={currentPage}
        total={currentTotal}
        pageSize={deliveryNotePageSize}
        loading={loading}
        onPageChange={onPageChange}
      />
    </section>
    </>
  );
}
