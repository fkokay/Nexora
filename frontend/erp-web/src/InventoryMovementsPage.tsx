import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { api } from "./erpApi";
import SearchableRecordPicker from "./SearchableRecordPicker";
import type { InventoryMovement, ScreenColumnPin, StockItem, Warehouse } from "./erp-types";
import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import type { Locale } from "./WorkspaceComponents";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListToolbar } from "./list-page/ListToolbar";
import "./inventory-movements.css";
import "./inventory/inventory-list-v2.css";

type ScreenField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; width?: number | null; pinned?: ScreenColumnPin | null };

const defaultMovementFields: (ScreenField & { enLabel: string })[] = [
  { key: "entryDate", label: "Tarih", enLabel: "Date", visible: true, position: 0 },
  { key: "direction", label: "Yön", enLabel: "Direction", visible: true, position: 1 },
  { key: "quantity", label: "Miktar", enLabel: "Quantity", visible: true, position: 2 },
  { key: "warehouse", label: "Depo", enLabel: "Warehouse", visible: true, position: 3 },
  { key: "storageLocation", label: "Konum", enLabel: "Location", visible: true, position: 4 },
  { key: "tracking", label: "Lot / seri", enLabel: "Lot / serial", visible: true, position: 5 },
  { key: "description", label: "Açıklama", enLabel: "Description", visible: true, position: 6 },
  { key: "unitCostBase", label: "Birim maliyet", enLabel: "Unit cost", visible: false, position: 7 },
];

type MovementPage = {
  items: InventoryMovement[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export default function InventoryMovementsPage({
  token,
  locale,
}: {
  token: string;
  locale: Locale;
}) {
  const en = locale === "en";
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [stockSearch, setStockSearch] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("all");
  const [movements, setMovements] = useState<MovementPage | null>(null);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [screenFields, setScreenFields] = useState<ScreenField[]>(defaultMovementFields);
  const visibleFields = useMemo(
    () => screenFields.filter((field) => field.visible).sort((a, b) => a.position - b.position),
    [screenFields],
  );
  const columnSpan = Math.max(visibleFields.length, 1);
  // Tenant-relabelled columns keep the tenant's text; untouched standard labels follow the UI locale.
  const fieldLabel = (field: ScreenField) => {
    const standard = defaultMovementFields.find((item) => item.key === field.key);
    return en && standard && standard.label === field.label ? standard.enLabel : field.label;
  };

  useEffect(() => {
    let active = true;
    api<{ fields: ScreenField[] }>("/api/screen-views/inventory-movement-history/active", token)
      .then((view) => {
        if (active && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api<Warehouse[]>("/api/warehouses/", token),
      api<{ items: StockItem[] }>("/api/stock/items/?page=1&pageSize=50", token),
    ])
      .then(([warehouseRows, stockPage]) => {
        if (!active) return;
        const activeWarehouses = warehouseRows.filter((row) => row.isActive);
        setWarehouses(activeWarehouses);
        setWarehouseId("all");
        setStocks(stockPage.items.filter((row) => row.isActive));
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (stockSearch.trim()) params.set("q", stockSearch.trim());
      void api<{ items: StockItem[] }>(`/api/stock/items/?${params}`, token)
        .then((result) => {
          if (active) setStocks(result.items.filter((row) => row.isActive));
        })
        .catch((e) => {
          if (active) setError((e as Error).message);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [token, stockSearch]);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!selectedStock || !warehouseId) {
      setMovements(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const endpoint = warehouseId === "all"
      ? `/api/stock/items/${selectedStock.id}/transactions?page=${page}&pageSize=50`
      : `/api/warehouses/${warehouseId}/stock/${selectedStock.id}/transactions?page=${page}&pageSize=50`;
    void api<MovementPage>(
      endpoint,
      token,
    )
      .then((result) => {
        if (version === requestVersion.current) setMovements(result);
      })
      .catch((e) => {
        if (version === requestVersion.current) {
          setMovements(null);
          setError((e as Error).message);
        }
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
  }, [token, selectedStock, warehouseId, page, refreshKey]);

  const stockOptions = useMemo(() => {
    const rows = selectedStock && !stocks.some((row) => row.id === selectedStock.id)
      ? [selectedStock, ...stocks]
      : stocks;
    return rows.map((item) => ({
      id: item.id,
      label: `${item.code} · ${item.name}`,
      description: item.category || item.unitCode,
      searchText: `${item.code} ${item.name} ${item.barcode ?? ""}`,
    }));
  }, [selectedStock, stocks]);

  const rows = movements?.items ?? [];
  const selectedWarehouse = warehouses.find((row) => row.id === warehouseId);
  const totalPages = Math.max(1, Math.ceil((movements?.totalCount ?? 0) / 50));
  const date = (value: string) => new Date(value).toLocaleDateString(en ? "en-GB" : "tr-TR");
  const number = (value: number) => new Intl.NumberFormat(en ? "en-GB" : "tr-TR", { maximumFractionDigits: 3 }).format(value);

  return (
    <main className="inventory-movements-page list-v2">
      <ListPageHeader
        title={en ? "Stock movements" : "Stok Hareketleri"}
        description={en ? "Choose a stock item to review its warehouse transaction history." : "Bir stok seçerek depo hareket geçmişini görüntüleyin."}
        count={selectedStock && warehouseId && movements ? movements.totalCount : null}
        countLabel={en ? "records" : "kayıt"}
      />

      <ListToolbar
        onRefresh={() => setRefreshKey((current) => current + 1)}
        refreshLabel={en ? "Refresh" : "Yenile"}
        toolsSlotRef={setToolsSlot}
      >
        <div className="list-v2-filter is-wide inventory-movements-stock-filter">
          <span>{en ? "Stock item" : "Stok kartı"}</span>
          <SearchableRecordPicker
            options={stockOptions}
            selectedId={selectedStock?.id ?? ""}
            onSelect={(id) => {
              const item = stockOptions.find((option) => option.id === id);
              const stock = stocks.find((row) => row.id === id) ?? (selectedStock?.id === id ? selectedStock : null);
              if (stock) setSelectedStock(stock);
              else if (item) setSelectedStock(null);
              setPage(1);
            }}
            onSearchChange={setStockSearch}
            title={en ? "Select stock item" : "Stok kartı seçin"}
            placeholder={en ? "Search by code or name" : "Stok kodu veya adıyla ara"}
            selectedLabel={selectedStock ? `${selectedStock.code} · ${selectedStock.name}` : undefined}
            searchPlaceholder={en ? "Search stock items" : "Stok kartlarında ara"}
            emptyMessage={en ? "No matching stock item." : "Eşleşen stok kartı bulunamadı."}
          />
        </div>
        <label className="list-v2-filter" htmlFor="inventory-movements-warehouse">
          {en ? "Warehouse" : "Depo"}
          <select id="inventory-movements-warehouse" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setPage(1); }}>
            <option value="all">{en ? "All warehouses" : "Tüm depolar"}</option>
            {warehouses.length === 0 && <option value="">{en ? "No active warehouse" : "Aktif depo bulunmuyor"}</option>}
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
          </select>
        </label>
      </ListToolbar>

      {error && <div className="alert inline-alert" role="alert">{error}</div>}
      <section className="inventory-movements-table-card list-v2-list">
        <div className="customer-table-wrap">
          <AdvancedDataGrid
            className="customer-table quote-table inventory-movements-table"
            gridId="inventory-movement-history"
            {...screenViewGridDefaults(visibleFields)}
            externalPagination
            hideSearch
            enableRowSelection={false}
            toolbarContainer={toolsSlot}
          >
            <thead><tr>{visibleFields.map((field) => <th key={field.key}>{fieldLabel(field)}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={columnSpan} className="inventory-movements-empty">{en ? "Loading movements…" : "Stok hareketleri yükleniyor…"}</td></tr>}
              {!loading && !selectedStock && <tr><td colSpan={columnSpan} className="inventory-movements-empty">{en ? "Select a stock item to view its movements." : "Hareketleri görmek için bir stok kartı seçin."}</td></tr>}
              {!loading && selectedStock && !warehouseId && <tr><td colSpan={columnSpan} className="inventory-movements-empty">{en ? "Create or activate a warehouse first." : "Önce bir depo oluşturun veya etkinleştirin."}</td></tr>}
              {!loading && selectedStock && warehouseId && rows.length === 0 && <tr><td colSpan={columnSpan} className="inventory-movements-empty">{en ? "No movements found for this stock in the selected warehouse." : "Seçili stok ve depoda hareket bulunmuyor."}</td></tr>}
              {!loading && selectedStock && rows.map((row) => (
                <tr key={row.id}>
                  {visibleFields.map((field) => {
                    switch (field.key) {
                      case "entryDate":
                        return <td key={field.key}>{date(row.entryDate)}</td>;
                      case "direction":
                        return <td key={field.key}><span className={`inventory-movement-direction ${row.direction === "Receipt" ? "is-receipt" : "is-issue"}`}>{row.direction === "Receipt" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{row.direction === "Receipt" ? (en ? "Receipt" : "Giriş") : (en ? "Issue" : "Çıkış")}{row.isReversal ? ` · ${en ? "Reversal" : "İade"}` : ""}</span></td>;
                      case "quantity":
                        return <td key={field.key} className="inventory-movement-quantity">{number(row.enteredQuantity ?? row.quantity)} {row.enteredUnitCode || selectedStock.unitCode}</td>;
                      case "warehouse":
                        return <td key={field.key}>{row.warehouseCode ? `${row.warehouseCode} · ${row.warehouseName}` : selectedWarehouse ? `${selectedWarehouse.code} · ${selectedWarehouse.name}` : "—"}</td>;
                      case "storageLocation":
                        return <td key={field.key}>{row.storageLocationCode ? `${row.storageLocationCode} · ${row.storageLocationName}` : "—"}</td>;
                      case "tracking":
                        return <td key={field.key}>{row.tracking?.length ? row.tracking.map((trace) => `${trace.trackingCode} (${number(trace.quantity)})`).join(", ") : "—"}</td>;
                      case "description":
                        return <td key={field.key}>{row.description || "—"}</td>;
                      case "unitCostBase":
                        return <td key={field.key} className="inventory-movement-quantity">{row.unitCostBase == null ? "—" : number(row.unitCostBase)}</td>;
                      default:
                        return <td key={field.key} />;
                    }
                  })}
                </tr>
              ))}
            </tbody>
          </AdvancedDataGrid>
        </div>
        {movements && movements.totalCount > 50 && <div className="table-pagination"><span>{en ? `Page ${page} of ${totalPages}` : `${page} / ${totalPages}. sayfa`}</span><div><button className="secondary-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>{en ? "Previous" : "Önceki"}</button><button className="secondary-button" type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>{en ? "Next" : "Sonraki"}</button></div></div>}
      </section>
    </main>
  );
}
