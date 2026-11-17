import { useState, type MutableRefObject } from "react";
import type { GridExportActions } from "../AdvancedDataGrid";
import type { CommandSpec, MenuCommand } from "../commands/types";
import type { InventoryTransfer } from "../erp-types";
import type { BulkAction } from "../list-page/BulkActionBar";
import { ListFooter } from "../list-page/ListFooter";
import { ListPagination } from "../list-page/ListPagination";

const BUSY = "İşlem sürüyor…";
const NO_RECORD = "Önce bir kayıt seçin";
/** The transfers endpoint pages by 50. */
const PAGE_SIZE = 50;

type Options = {
  /** Rows shown in the grid (the loaded page after the search and status filter). */
  transfers: InventoryTransfer[];
  /** Server total of transfers (all statuses). */
  total: number;
  page: number;
  busy: boolean;
  loading: boolean;
  exportRef: MutableRefObject<GridExportActions | null>;
  onOpen: (transfer: InventoryTransfer) => void;
  onVoid: (transfer: InventoryTransfer) => void;
  onPageChange: (page: number) => void;
};

/**
 * Depolar arası transferler list wiring: selection and current row, Aç (the transfer's lines, Enter), the existing
 * İptal in the actions menu for a posted transfer, the selection export and the footer. Transfers are an
 * append-only record: there is no delete, and İptal writes linked reversal movements on the server.
 */
export function useTransferListScreen(o: Options) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]),
    [currentId, setCurrentId] = useState<string | null>(null);
  const current = currentId ? o.transfers.find((transfer) => transfer.id === currentId) : undefined;
  const selected = o.transfers.filter((transfer) => selectedIds.includes(transfer.id));
  const target = current ?? (selected.length === 1 ? selected[0] : undefined);

  const commands: { open: CommandSpec } = {
    open: {
      disabledReason: target ? undefined : NO_RECORD,
      run: () => {
        if (target) o.onOpen(target);
      },
    },
  };
  // Same condition as the row button: only a posted transfer can be voided, not while another write runs.
  const moreItems: MenuCommand[] =
    target?.status === "Posted"
      ? [{ id: "transfer-void", label: "Transferi iptal et", disabledReason: o.busy ? BUSY : undefined, run: () => o.onVoid(target) }]
      : [];
  const bulkActions: BulkAction[] = [
    { id: "export-selected", label: "Excel (seçilenler)", run: () => void o.exportRef.current?.exportExcel() },
  ];
  const footer = (
    <ListFooter hints="↑↓ gez · Boşluk işaretle · Enter aç">
      {selected.length > 0 && (
        <span>
          <span>{selected.length}</span> <span>seçili</span>
        </span>
      )}
      <span>
        <span>Gösterilen</span>{" "}
        <span>
          {o.transfers.length.toLocaleString("tr-TR")} / {o.total.toLocaleString("tr-TR")}
        </span>
      </span>
      <ListPagination page={o.page} total={o.total} pageSize={PAGE_SIZE} loading={o.loading} onPageChange={o.onPageChange} />
    </ListFooter>
  );
  return {
    commands,
    moreItems,
    grid: { footer, bulkActions, onSelectionChange: setSelectedIds, onCurrentRowChange: setCurrentId },
  };
}
