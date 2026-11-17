import { useCallback, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import * as IconPack from "lucide-react";
import { api } from "../erpApi";
import type { InventoryBalance, StockItem, Warehouse } from "../erp-types";
import type { GridExportActions } from "../AdvancedDataGrid";
import type { CommandSpec, MenuCommand } from "../commands/types";
import { confirmDialog } from "../confirmDialog";
import type { BulkAction } from "../list-page/BulkActionBar";
import { ListFooter } from "../list-page/ListFooter";
import { ListPagination } from "../list-page/ListPagination";
import { ListSummaryCards } from "../list-page/ListSummaryCards";
import {
  InventoryStockDetailPanel,
  useStockDetailPanelOpen,
  type StockDetailTab,
} from "./components/InventoryStockDetailPanel";

const BUSY = "İşlem sürüyor…";
const NO_RECORD = "Önce bir kayıt seçin";
const money = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });

/** "AMB-1, AMB-2, … +N" for confirmations: the first five codes, then the rest as a count. */
export function codeList(codes: string[]): string {
  const shown = codes.slice(0, 5).join(", ");
  return codes.length > 5 ? `${shown} +${codes.length - 5}` : shown;
}

type Options = {
  /** The Stok Kartları list is on screen (not the create form, no card open for editing). */
  active: boolean;
  token: string;
  role: string;
  busy: boolean;
  balances: InventoryBalance[];
  itemsById: Map<string, StockItem>;
  warehouses: Warehouse[];
  warehouseId: string;
  search: string;
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  belowMinimumCount: number;
  belowMinimumOnly: boolean;
  exportRef: MutableRefObject<GridExportActions | null>;
  onToggleBelowMinimum: () => void;
  onPageChange: (page: number) => void;
  /** `order`: stock item ids of the visible page in displayed order (PgUp / PgDn of the opened card). */
  onOpen: (stock: StockItem, order: string[]) => void;
  /** Single card: the page's existing delete (its own confirmation). */
  onDeleteOne: (stock: StockItem) => Promise<void>;
  onDeactivate: (stock: StockItem) => void;
  onMovements: (balance: InventoryBalance) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  reload: () => Promise<void>;
};

/**
 * Stok Kartları list wiring (mockup 01, list part): selection and current row, summary cards, footer, bulk bar,
 * Aç / Sil commands, the former row-menu actions and the detail panel. Aç follows the grid's current row (Enter),
 * else a single ticked row; Sil the ticked rows, else the current row.
 */
export function useStockListScreen(o: Options) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]),
    [currentId, setCurrentId] = useState<string | null>(null),
    [tab, setTab] = useState<StockDetailTab>("summary");
  const rootRef = useRef<HTMLDivElement>(null);
  // The grid's displayed order (sort and filters applied), handed to an opened card.
  const orderRef = useRef<string[]>([]);
  const onVisibleRowsChange = useCallback((keys: string[]) => {
    orderRef.current = keys;
  }, []);
  const detail = useStockDetailPanelOpen(o.active, rootRef);

  const current = currentId ? o.balances.find((balance) => balance.stockItemId === currentId) : undefined;
  const selected = o.balances.filter((balance) => selectedIds.includes(balance.stockItemId));
  const openBalance = current ?? (selected.length === 1 ? selected[0] : undefined);
  const openItem = openBalance ? o.itemsById.get(openBalance.stockItemId) : undefined;
  const deleteTargets = selected.length ? selected : current ? [current] : [];
  const movementsDisabledReason = !o.warehouseId ? "Hareket eklemek için önce bir depo seçin" : undefined;
  const currency = o.balances[0]?.baseCurrencyCode ?? "";
  const isAdmin = o.role === "TenantAdmin";

  async function deleteCards(targets: InventoryBalance[]) {
    const cards = targets
      .map((balance) => o.itemsById.get(balance.stockItemId))
      .filter((card): card is StockItem => !!card);
    if (!cards.length) return;
    if (cards.length === 1) return o.onDeleteOne(cards[0]);
    if (
      !(await confirmDialog({
        title: "Stok kartları kalıcı olarak silinsin mi?",
        message: `${cards.length} stok kartı kalıcı olarak silinecek: ${codeList(cards.map((card) => card.code))}. İlişkili kayıtları olan kartlar silinemez.`,
        tone: "danger",
        confirmLabel: "Sil",
      }))
    )
      return;
    o.onBusy(true);
    o.onError("");
    o.onNotice("");
    const failed: string[] = [];
    let deleted = 0;
    try {
      for (const card of cards) {
        try {
          await api<void>(`/api/stock/items/${card.id}`, o.token, { method: "DELETE" });
          deleted += 1;
        } catch (e) {
          failed.push(`${card.code}: ${(e as Error).message}`);
        }
      }
      if (deleted) o.onNotice(`${deleted} stok kartı silindi.`);
      if (failed.length) o.onError(`Silinemeyen stok kartları: ${failed.join(" · ")}`);
      await o.reload();
    } finally {
      o.onBusy(false);
    }
  }

  const bulkActions: BulkAction[] = [
    { id: "export-selected", label: "Excel (seçilenler)", run: () => void o.exportRef.current?.exportExcel() },
  ];
  if (isAdmin)
    bulkActions.push({
      id: "delete-selected",
      label: "Sil",
      disabledReason: o.busy ? BUSY : undefined,
      run: (keys) => void deleteCards(o.balances.filter((balance) => keys.includes(balance.stockItemId))),
    });

  const commands: { open?: CommandSpec; delete?: CommandSpec } = {
    open: {
      disabledReason: !openItem ? NO_RECORD : o.busy ? BUSY : undefined,
      run: () => {
        if (openItem) o.onOpen(openItem, orderRef.current);
      },
    },
  };
  if (isAdmin)
    commands.delete = {
      disabledReason: !deleteTargets.length ? NO_RECORD : o.busy ? BUSY : undefined,
      run: () => deleteCards(deleteTargets),
    };

  // Former row menu ("⋯") actions of the current card; Düzenle is Aç, Sil is the bar's Sil.
  const moreItems: MenuCommand[] =
    openItem && openBalance
      ? [
          {
            id: "stock-deactivate",
            label: "Devre dışı bırak",
            disabledReason: o.busy ? BUSY : undefined,
            run: () => o.onDeactivate(openItem),
          },
          {
            id: "stock-movements",
            label: "Hareketler / ekle",
            disabledReason: movementsDisabledReason ?? (o.busy ? BUSY : undefined),
            run: () => o.onMovements(openBalance),
          },
        ]
      : [];

  // Summary cards: totals of the loaded page; the API's only list total is the below-minimum count, and that
  // count ignores the text search.
  const pageValue = o.balances.reduce((sum, balance) => sum + balance.valuationAmountBase, 0);
  const units = new Set(o.balances.map((balance) => balance.unitCode));
  const oneUnit = units.size === 1 ? o.balances[0].unitCode : null;
  const pageAvailable = o.balances.reduce((sum, balance) => sum + balance.availableQuantity, 0);
  const availableCards = o.balances.filter((balance) => balance.availableQuantity > 0).length;
  const unvaluedCards = o.balances.filter((balance) => balance.unvaluedQuantity > 0).length;
  const belowScope = o.warehouseId ? "seçili depoda" : "tüm depolarda";
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
        oneUnit
          ? {
              id: "available",
              label: "Kullanılabilir",
              value: o.loading ? "—" : `${quantity(pageAvailable)} ${oneUnit}`,
              icon: IconPack.PackageCheck,
              tone: "ok",
              hint: "bu sayfa",
            }
          : {
              // Mixed units cannot be added up: count the cards with available stock instead.
              id: "available",
              label: "Kullanılabilir stoklu kart",
              value: o.loading ? (
                "—"
              ) : (
                <>
                  <span>{availableCards.toLocaleString("tr-TR")}</span> <span>kart</span>
                </>
              ),
              icon: IconPack.PackageCheck,
              tone: "ok",
              hint: "bu sayfa",
            },
        {
          id: "below",
          label: "Minimum altı",
          value: o.loading ? "—" : o.belowMinimumCount.toLocaleString("tr-TR"),
          icon: IconPack.TrendingDown,
          tone: "bad",
          hint: o.search.trim() ? `${belowScope} (arama hariç)` : belowScope,
          filterActive: o.belowMinimumOnly,
          onFilter: o.onToggleBelowMinimum,
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

  const panelToggle = (
    <button
      type="button"
      className="inventory-stock-panel-toggle"
      aria-pressed={detail.open}
      title="Detay paneli (Ctrl+.)"
      onClick={detail.toggle}
    >
      <IconPack.PanelRight size={15} aria-hidden="true" />
      <span>Detay paneli</span>
    </button>
  );

  const footer = (
    <ListFooter
      hints={
        isAdmin
          ? "↑↓ gez · Boşluk işaretle · Enter aç · Ctrl+Del sil · Ctrl+. detay paneli"
          : "↑↓ gez · Boşluk işaretle · Enter aç · Ctrl+. detay paneli"
      }
    >
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

  let panel: ReactNode = null;
  if (detail.open)
    panel = current ? (
      <InventoryStockDetailPanel
        token={o.token}
        balance={current}
        stock={o.itemsById.get(current.stockItemId)}
        warehouses={o.warehouses}
        tab={tab}
        onTabChange={setTab}
        busy={o.busy}
        onOpen={() => {
          const stock = o.itemsById.get(current.stockItemId);
          if (stock) o.onOpen(stock, orderRef.current);
        }}
        onClose={detail.close}
        onMovements={() => o.onMovements(current)}
        movementsDisabledReason={movementsDisabledReason}
        onDeactivate={() => {
          const stock = o.itemsById.get(current.stockItemId);
          if (stock) o.onDeactivate(stock);
        }}
      />
    ) : (
      <aside className="inventory-stock-detail is-empty" aria-label="Stok kartı özeti">
        <p>Özetini görmek için listeden bir stok kartı seçin.</p>
      </aside>
    );

  return {
    rootRef,
    detailOpen: detail.open,
    summary,
    panelToggle,
    panel,
    commands,
    moreItems,
    grid: {
      footer,
      bulkActions,
      onSelectionChange: setSelectedIds,
      onCurrentRowChange: setCurrentId,
      onVisibleRowsChange,
    },
  };
}
