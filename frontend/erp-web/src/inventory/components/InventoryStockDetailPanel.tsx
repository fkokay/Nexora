import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Maximize2, X } from "lucide-react";
import { api } from "../../erpApi";
import type { InventoryBalance, InventoryMovement, StockItem, Warehouse } from "../../erp-types";
import { openModals } from "../../commands/CommandProvider";
import { useWindowKeyDown } from "../../record-form/recordFormKeys";
import { StatusTag } from "../../list-page/StatusTag";
import { stockListStatus } from "./InventoryStockGrid";
import "../inventory-list-v2.css";

export type StockDetailTab = "summary" | "warehouses" | "movements";

/**
 * The detail panel is open by default when the list area has room for it beside the default columns without a
 * horizontal scroll: about a 1700px window with the widget rail closed (mockup 01 at 1720), never with the rail open.
 */
const DETAIL_ROOM = 1440;

/**
 * Open state of the list's detail panel: open by default when the list area (`rootRef`) is at least DETAIL_ROOM
 * wide, closed below. Ctrl+. (and `toggle`) overrides it until the area crosses that width again, like the record
 * form's context panel at its breakpoint.
 */
export function useStockDetailPanelOpen(enabled: boolean, rootRef: RefObject<HTMLElement | null>) {
  const [roomy, setRoomy] = useState(false);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const measure = () => setRoomy(root.getBoundingClientRect().width >= DETAIL_ROOM);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [enabled, rootRef]);
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => setOverride(null), [roomy]);
  const toggle = () => setOverride((current) => !(current ?? roomy));
  useWindowKeyDown(enabled, (event) => {
    if (event.key !== "." || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    // Not from a hidden keep-alive view, and not behind a dialog.
    if (!rootRef.current || rootRef.current.closest("[hidden]") || openModals().length) return;
    event.preventDefault();
    toggle();
  });
  return { open: override ?? roomy, toggle, close: () => setOverride(false) };
}

const quantity = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
const money = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type WarehouseRow = { warehouse: Warehouse; quantity: number };

type Props = {
  token: string;
  balance: InventoryBalance;
  stock: StockItem | undefined;
  warehouses: Warehouse[];
  tab: StockDetailTab;
  onTabChange: (tab: StockDetailTab) => void;
  busy: boolean;
  /** Opens the stock card (bar Aç / Enter). */
  onOpen: () => void;
  onClose: () => void;
  /** Movements dialog of the selected warehouse; reason shown when no warehouse is selected. */
  onMovements: () => void;
  movementsDisabledReason?: string;
  /** Deactivates the card (former row menu "Devre dışı"). */
  onDeactivate?: () => void;
};

/** Right-hand panel of the Stok Kartları list (mockup 01 ".det"): the current row's summary, warehouses, movements. */
export function InventoryStockDetailPanel({
  token,
  balance,
  stock,
  warehouses,
  tab,
  onTabChange,
  busy,
  onOpen,
  onClose,
  onMovements,
  movementsDisabledReason,
  onDeactivate,
}: Props) {
  const status = stockListStatus(balance, stock);
  const shortage = balance.minimumStock - balance.quantityOnHand;
  const activeWarehouses = warehouses.filter((item) => item.isActive);
  const warehouseKey = activeWarehouses.map((item) => item.id).join("|");
  const [warehouseRows, setWarehouseRows] = useState<WarehouseRow[] | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const request = useRef(0);

  // Only the open tab loads, a moment after the current row settles (↑/↓ move through rows quickly).
  useEffect(() => {
    const id = ++request.current;
    setLoadError("");
    if (tab === "summary") return;
    if (tab === "warehouses") setWarehouseRows(null);
    else setMovements(null);
    const timer = window.setTimeout(() => {
      const load =
        tab === "warehouses"
          ? Promise.all(
              activeWarehouses.map(async (warehouse) => {
                const params = new URLSearchParams({ page: "1", pageSize: "100", belowMinimumOnly: "false", q: balance.code });
                const page = await api<{ items: Array<{ balance: InventoryBalance }> }>(
                  `/api/warehouses/${warehouse.id}/balances/page?${params}`,
                  token,
                );
                const row = page.items.find((item) => item.balance.stockItemId === balance.stockItemId);
                return { warehouse, quantity: row?.balance.quantityOnHand ?? 0 };
              }),
            ).then((rows) => {
              if (id === request.current) setWarehouseRows(rows);
            })
          : api<{ items: InventoryMovement[] }>(`/api/stock/items/${balance.stockItemId}/transactions?page=1&pageSize=5`, token).then(
              (page) => {
                if (id === request.current) setMovements(page.items);
              },
            );
      load.catch((error: Error) => {
        if (id === request.current) setLoadError(error.message);
      });
    }, 150);
    return () => window.clearTimeout(timer);
    // The warehouse list is keyed by its ids (a reloaded but equal list does not refetch).
  }, [tab, balance.stockItemId, balance.code, token, warehouseKey]);

  const maxWarehouseQuantity = Math.max(0, ...(warehouseRows ?? []).map((row) => row.quantity));
  const tabs: Array<{ id: StockDetailTab; label: string }> = [
    { id: "summary", label: "Özet" },
    { id: "warehouses", label: "Depolar" },
    { id: "movements", label: "Hareketler" },
  ];
  return (
    <aside className="inventory-stock-detail" aria-label="Stok kartı özeti">
      <div className="inventory-stock-detail-head">
        <div className="inventory-stock-detail-top">
          <span className="nx-code">{balance.code}</span>
          <span className="inventory-stock-detail-actions">
            <button type="button" className="inventory-stock-detail-open" onClick={onOpen} disabled={busy || !stock}>
              <Maximize2 size={13} aria-hidden="true" />
              <span>Aç</span>
              <kbd>Enter</kbd>
            </button>
            <button type="button" className="inventory-stock-detail-close" aria-label="Detay panelini kapat" title="Detay panelini kapat (Ctrl+.)" onClick={onClose}>
              <X size={15} aria-hidden="true" />
            </button>
          </span>
        </div>
        <h3>{balance.name}</h3>
        <div className="inventory-stock-detail-tags">
          <StatusTag tone={status.tone}>
            {status.label === "Minimum altı" && shortage > 0 ? (
              <>
                <span>Minimum altı</span> · <span>{quantity(shortage)}</span> <span>eksik</span>
              </>
            ) : (
              status.label
            )}
          </StatusTag>
          {stock?.trackingMode === "Lot" && <StatusTag tone="off">Lot takipli</StatusTag>}
          {stock?.trackingMode === "Serial" && <StatusTag tone="off">Seri no takipli</StatusTag>}
        </div>
      </div>
      <div className="inventory-stock-detail-tabs" role="tablist" aria-label="Stok kartı özeti">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "is-active" : undefined}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="inventory-stock-detail-body" role="tabpanel">
        {loadError && <p className="inventory-stock-detail-error">{loadError}</p>}
        {tab === "summary" && (
          <>
            <div className="inventory-stock-detail-stats">
              <div>
                <small>Depo bakiyesi</small>
                <b>{quantity(balance.quantityOnHand)}</b>
              </div>
              <div>
                <small>Kullanılabilir</small>
                <b className={balance.belowMinimum ? "is-low" : undefined}>{quantity(balance.availableQuantity)}</b>
              </div>
              <div>
                <small>Rezerve</small>
                <b>{quantity(balance.reservedQuantity)}</b>
              </div>
              <div>
                <small>Minimum</small>
                <b>{quantity(balance.minimumStock)}</b>
              </div>
            </div>
            <dl className="inventory-stock-detail-facts">
              <div>
                <dt>Stok değeri</dt>
                <dd>
                  {money(balance.valuationAmountBase)} {balance.baseCurrencyCode}
                </dd>
              </div>
              <div>
                <dt>Maliyetsiz miktar</dt>
                <dd>
                  {quantity(balance.unvaluedQuantity)} {balance.unitCode}
                </dd>
              </div>
              <div>
                <dt>Kategori</dt>
                <dd>{stock?.category || "—"}</dd>
              </div>
              <div>
                <dt>Birim</dt>
                <dd>{balance.unitCode}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="secondary inventory-stock-detail-action"
              disabled={busy || !!movementsDisabledReason}
              title={movementsDisabledReason}
              onClick={onMovements}
            >
              Hareketler / ekle
            </button>
          </>
        )}
        {tab === "warehouses" && (
          <div>
            <div className="inventory-stock-detail-section">Depo dağılımı</div>
            {warehouseRows === null ? (
              !loadError && <p className="inventory-stock-detail-muted">Depolar yükleniyor…</p>
            ) : warehouseRows.length === 0 ? (
              <p className="inventory-stock-detail-muted">Aktif depo yok.</p>
            ) : (
              warehouseRows.map((row) => (
                <div key={row.warehouse.id} className="inventory-stock-detail-warehouse">
                  <span title={`${row.warehouse.code} · ${row.warehouse.name}`}>{row.warehouse.name}</span>
                  <span className="inventory-stock-detail-bar" aria-hidden="true">
                    <i style={{ width: `${maxWarehouseQuantity > 0 ? Math.max(0, (row.quantity / maxWarehouseQuantity) * 100) : 0}%` }} />
                  </span>
                  <b>{quantity(row.quantity)}</b>
                </div>
              ))
            )}
          </div>
        )}
        {tab === "movements" && (
          <div>
            <div className="inventory-stock-detail-section">Son hareketler</div>
            {movements === null ? (
              !loadError && <p className="inventory-stock-detail-muted">Hareketler yükleniyor…</p>
            ) : movements.length === 0 ? (
              <p className="inventory-stock-detail-muted">Henüz hareket yok.</p>
            ) : (
              <ul className="inventory-stock-detail-movements">
                {movements.map((movement) => (
                  <li key={movement.id}>
                    <span className="inventory-stock-detail-movement-main">
                      <span>{movement.description || (movement.direction === "Receipt" ? "Giriş" : "Çıkış")}</span>
                      <small>
                        {movement.entryDate.split("-").reverse().join(".")}
                        {movement.warehouseCode ? ` · ${movement.warehouseCode}` : ""}
                      </small>
                    </span>
                    <b className={movement.direction === "Receipt" ? "is-in" : "is-out"}>
                      {movement.direction === "Receipt" ? "+" : "−"}
                      {quantity(movement.quantity)}
                    </b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {onDeactivate && (
        <div className="inventory-stock-detail-foot">
          <button type="button" className="is-danger" disabled={busy || !stock} onClick={onDeactivate}>
            Devre dışı bırak
          </button>
        </div>
      )}
    </aside>
  );
}
