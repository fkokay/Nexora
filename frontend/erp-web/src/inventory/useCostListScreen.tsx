import { useState, type MutableRefObject } from "react";
import * as IconPack from "lucide-react";
import type { GridExportActions } from "../AdvancedDataGrid";
import type { CommandSpec } from "../commands/types";
import type { InventoryBalance } from "../erp-types";
import type { BulkAction } from "../list-page/BulkActionBar";
import { ListFooter } from "../list-page/ListFooter";
import { ListPagination } from "../list-page/ListPagination";
import { ListSummaryCards } from "../list-page/ListSummaryCards";

const BUSY = "İşlem sürüyor…";
const NO_RECORD = "Önce bir kayıt seçin";
const money = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Options = {
  balances: InventoryBalance[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  busy: boolean;
  exportRef: MutableRefObject<GridExportActions | null>;
  onManage: (balance: InventoryBalance) => void;
  onPageChange: (page: number) => void;
};

/**
 * Stok Değerleme list wiring (TenantAdmin only, like the screen): selection and current row, Aç = the former card's
 * "Yönet" (cost manager of the current row, Enter), page summary cards, the selection export and the footer.
 */
export function useCostListScreen(o: Options) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]),
    [currentId, setCurrentId] = useState<string | null>(null);
  const current = currentId ? o.balances.find((balance) => balance.stockItemId === currentId) : undefined;
  const selected = o.balances.filter((balance) => selectedIds.includes(balance.stockItemId));
  const target = current ?? (selected.length === 1 ? selected[0] : undefined);
  const currency = o.balances[0]?.baseCurrencyCode ?? "";

  const commands: { open: CommandSpec } = {
    open: {
      // The card's Yönet button was disabled while busy; Aç keeps that.
      disabledReason: !target ? NO_RECORD : o.busy ? BUSY : undefined,
      run: () => {
        if (target) o.onManage(target);
      },
    },
  };
  const bulkActions: BulkAction[] = [
    { id: "export-selected", label: "Excel (seçilenler)", run: () => void o.exportRef.current?.exportExcel() },
  ];

  // The endpoint has no valuation totals: both cards add up the loaded page only.
  const pageValue = o.balances.reduce((sum, balance) => sum + balance.valuationAmountBase, 0);
  const unvaluedCards = o.balances.filter((balance) => balance.unvaluedQuantity > 0).length;
  const summary = (
    <ListSummaryCards
      cards={[
        {
          id: "value",
          label: "Stok değeri",
          value: o.loading ? "—" : `${money(pageValue)}${currency ? ` ${currency}` : ""}`,
          icon: IconPack.CircleDollarSign,
          hint: "bu sayfa",
        },
        {
          id: "unvalued",
          label: "Maliyetsiz",
          value: o.loading ? "—" : unvaluedCards.toLocaleString("tr-TR"),
          icon: IconPack.CircleAlert,
          tone: "warn",
          hint: "bu sayfa",
        },
      ]}
    />
  );
  const footer = (
    <ListFooter hints="↑↓ gez · Boşluk işaretle · Enter aç">
      {selected.length > 0 && (
        <span>
          <span>{selected.length}</span> <span>seçili</span> · <span>Seçili değer</span>{" "}
          <b>
            {money(selected.reduce((sum, balance) => sum + balance.valuationAmountBase, 0))}
            {currency ? ` ${currency}` : ""}
          </b>
        </span>
      )}
      <span>
        <span>Gösterilen</span>{" "}
        <span>
          {o.balances.length.toLocaleString("tr-TR")} / {o.total.toLocaleString("tr-TR")}
        </span>
      </span>
      <ListPagination page={o.page} total={o.total} pageSize={o.pageSize} loading={o.loading} onPageChange={o.onPageChange} />
    </ListFooter>
  );
  return {
    summary,
    commands,
    grid: { footer, bulkActions, onSelectionChange: setSelectedIds, onCurrentRowChange: setCurrentId },
  };
}
