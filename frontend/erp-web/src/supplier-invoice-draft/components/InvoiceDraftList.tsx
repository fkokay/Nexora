import { useRef, useState } from "react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { ListToolbar } from "../../list-page/ListToolbar";
import { ListFooter } from "../../list-page/ListFooter";
import { StatusTag } from "../../list-page/StatusTag";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesListPanelToggle,
  SalesPanelFacts,
  SalesPanelStats,
  panelMoney,
} from "../../sales/components/SalesListDetailPanel";
import { listAmount } from "../../sales/components/salesListCells";
import { useStockDetailPanelOpen } from "../../inventory/components/InventoryStockDetailPanel";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "../../commands/gridCommands";
import type { MenuCommand } from "../../commands/types";
import { supplierInvoiceDraftTag } from "../../purchasing/purchaseCreateForms";
import "../../sales/sales-list-v2.css";
import type { DraftScreenField, DraftSummary, DraftListProps } from "../types";

/** Muhasebeleştirilmiş fatura düzenlenemez (bugünkü düzenleme kontrolünün iletisi). */
export const SUPPLIER_INVOICE_DRAFT_LOCKED = "Yalnızca muhasebeleştirilmemiş taslaklar düzenlenebilir.";

const NUMBER_FIELDS: ReadonlySet<string> = new Set(["grandTotal", "lineCount"]);
const CODE_FIELDS: ReadonlySet<string> = new Set(["invoiceNumber"]);
/** Default widths (fields without a tenant width): the default columns fit beside the menu at 1440 without a scroll. */
const COLUMN_WIDTHS: Record<string, number> = {
  invoiceNumber: 130, supplierName: 210, invoiceDate: 95, dueDate: 95, currencyCode: 60, grandTotal: 130, lineCount: 55,
  createdAt: 140, status: 130,
};

/**
 * Bağımsız tedarikçi faturaları listesi (Satış liste tipi): tek tık satırı seçer (sağ panel), çift tık / Enter / Aç
 * taslağı düzenlemeye açar; Düzenle ve Muhasebeleştir İşlem Çubuğu'nun İşlemler menüsünde, yalnız taslakta.
 * Sayfalama bugünkü gibidir: ilk 50 kayıt (sayfalayıcı yok).
 */
export function InvoiceDraftList({
  drafts,
  totalCount,
  fields,
  loading,
  busy,
  currentId,
  onCurrentChange,
  onRefresh,
  onCreate,
  onEdit,
  onPost,
  children,
}: DraftListProps) {
  const visibleFields = visibleDraftFields(fields);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panel = useStockDetailPanelOpen(true, bodyRef);
  const current = drafts.find((item) => item.id === currentId);
  const busyReason = busy ? "İşleniyor…" : undefined;
  const editReason = (item: DraftSummary | undefined) =>
    !item ? "Önce bir kayıt seçin" : item.status !== "Draft" ? SUPPLIER_INVOICE_DRAFT_LOCKED : busyReason;

  const more: MenuCommand[] = [
    {
      id: "draft-edit",
      label: "Düzenle",
      disabledReason: editReason(current),
      run: () => {
        if (current) onEdit(current.id);
      },
    },
    {
      id: "draft-post",
      label: "Muhasebeleştir",
      disabledReason: editReason(current),
      run: () => {
        if (current) onPost(current);
      },
    },
    csvExportCommand(gridExportRef),
  ];
  const openRow = (id: string) => {
    const item = drafts.find((row) => row.id === id);
    if (item && !editReason(item)) onEdit(item.id);
  };

  const listPanel = panel.open ? (
    current ? (
      <SalesListDetailPanel
        label="Bağımsız tedarikçi faturası özeti"
        code={current.invoiceNumber}
        title={current.supplierName}
        tags={<StatusTag tone={supplierInvoiceDraftTag(current.status).tone}>{supplierInvoiceDraftTag(current.status).label}</StatusTag>}
        tabs={[{ id: "summary", label: "Özet" }]}
        tab="summary"
        onTabChange={() => {}}
        onOpen={() => openRow(current.id)}
        openDisabled={!!editReason(current)}
        onClose={panel.close}
        takeFocus={panel.takeFocus}
      >
        <SalesPanelStats items={[{ label: "Genel toplam", value: panelMoney(current.grandTotal, current.currencyCode) }]} />
        <SalesPanelFacts
          items={[
            { label: "Fatura tarihi", value: current.invoiceDate },
            { label: "Vade tarihi", value: current.dueDate || "—" },
            { label: "Satır", value: current.lineCount },
            { label: "Kaydedilme", value: new Date(current.createdAt).toLocaleString("tr-TR") },
            ...(current.status === "Posted" ? [{ label: "Durum", value: "Deftere aktarıldı" }] : []),
          ]}
        />
      </SalesListDetailPanel>
    ) : (
      <SalesListDetailEmpty label="Bağımsız tedarikçi faturası özeti" text="Özetini görmek için listeden bir fatura seçin." />
    )
  ) : null;

  return (
    <>
      <PageCommandsSlot
        commands={{
          new: { primary: true, disabledReason: busyReason, run: onCreate },
          open: {
            disabledReason: editReason(current),
            run: () => {
              const id = focusedRecordId() ?? current?.id;
              if (id) openRow(id);
            },
          },
          more,
        }}
      />
      <ListPageHeader
        title="Bağımsız fatura taslakları"
        description="Siparişsiz tedarikçi faturasını kaydedin; uygunsa mal kabul satırıyla eşleştirip maliyet farkını aktarın."
        count={loading && totalCount === 0 ? null : totalCount}
      />
      <ListToolbar
        toolsSlotRef={setToolsSlot}
        onRefresh={() => {
          if (!loading) onRefresh();
        }}
      >
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </ListToolbar>
      {children}
      <div ref={bodyRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list">
          <SalesDocumentGrid
            gridId="standalone-invoice-drafts"
            hideExport
            exportActionsRef={gridExportRef}
            fields={visibleFields}
            items={drafts}
            loading={loading}
            loadingMessage="Faturalar yükleniyor…"
            emptyMessage="Henüz bağımsız fatura kaydı yok."
            search=""
            searchEmptyMessage="Henüz bağımsız fatura kaydı yok."
            toolbarContainer={toolsSlot}
            renderCell={(field, item) => draftFieldValue(item, field.key)}
            ariaLabel="Bağımsız tedarikçi faturaları"
            selection={{
              currentId,
              onCurrentChange,
              onTickedChange: setTicked,
              bulkActions: [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }],
              onOpen: openRow,
            }}
            footer={
              <ListFooter hints="↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç · Ctrl+. detay paneli">
                {ticked.length > 0 && (
                  <span>
                    <span>{ticked.length}</span> <span>seçili</span>
                  </span>
                )}
                <span>
                  <span>Gösterilen</span>{" "}
                  <span>
                    {drafts.length.toLocaleString("tr-TR")} / {totalCount.toLocaleString("tr-TR")}
                  </span>
                </span>
              </ListFooter>
            }
            columnWidths={COLUMN_WIDTHS}
            numberFields={NUMBER_FIELDS}
            codeFields={CODE_FIELDS}
          />
        </section>
        {listPanel}
      </div>
    </>
  );
}

/** Tenant layout of the list; the row action column moved to İşlemler (Düzenle, Muhasebeleştir). */
function visibleDraftFields(fields: DraftScreenField[]) {
  return fields
    .filter((field) => field.visible && field.key !== "actions")
    .sort((a, b) => a.position - b.position);
}

function draftFieldValue(item: DraftSummary, key: string) {
  switch (key) {
    case "invoiceNumber":
      return item.invoiceNumber;
    case "supplierName":
      return item.supplierName;
    case "invoiceDate":
      return item.invoiceDate;
    case "dueDate":
      return item.dueDate || "—";
    case "currencyCode":
      return item.currencyCode;
    case "grandTotal":
      return listAmount(item.grandTotal, item.currencyCode);
    case "lineCount":
      return item.lineCount;
    case "createdAt":
      return new Date(item.createdAt).toLocaleString("tr-TR");
    case "status": {
      const tag = supplierInvoiceDraftTag(item.status);
      return <StatusTag tone={tag.tone}>{tag.label}</StatusTag>;
    }
    default:
      return "—";
  }
}
