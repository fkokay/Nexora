import { useEffect, useRef, useState } from "react";
import { CalendarClock, CalendarX } from "lucide-react";
import { authenticatedFetch } from "./authApi";
import type { GridExportActions } from "./AdvancedDataGrid";
import { usePageCommands } from "./commands/CommandProvider";
import { csvExportCommand } from "./commands/gridCommands";
import InventoryTrackingHeader from "./inventory-tracking/components/InventoryTrackingHeader";
import InventoryTrackingAlerts from "./inventory-tracking/components/InventoryTrackingAlerts";
import InventoryTrackingFilters from "./inventory-tracking/components/InventoryTrackingFilters";
import InventoryTrackingBalanceTable, { trackingRowKey } from "./inventory-tracking/components/InventoryTrackingBalanceTable";
import InventoryTrackingDetail from "./inventory-tracking/components/InventoryTrackingDetail";
import InventoryTrackingBoundaryNote from "./inventory-tracking/components/InventoryTrackingBoundaryNote";
import { TrackingExpiryCell } from "./inventory-tracking/components/TrackingExpiryTag";
import { expiryState, localToday } from "./inventory/trackingExpiry";
import type { BulkAction } from "./list-page/BulkActionBar";
import { ListFooter } from "./list-page/ListFooter";
import { ListPagination } from "./list-page/ListPagination";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import { StatusTag } from "./list-page/StatusTag";
import type {
  Balance,
  Page,
  ScreenField,
  Warehouse,
} from "./inventory-tracking/types";
import "./inventory-tracking.css";

async function request<T>(url: string, token: string): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || `İstek başarısız (${response.status})`);
  return body as T;
}

export default function InventoryTrackingPage({ token }: { token: string }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]),
    [warehouseId, setWarehouseId] = useState("");
  // The grid's current row (↑/↓ or click); the detail shows it, else the first row of the page.
  const [currentKey, setCurrentKey] = useState<string | null>(null),
    [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [trackingMode, setTrackingMode] = useState("");
  const [result, setResult] = useState<Page | null>(null),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [warehouseError, setWarehouseError] = useState(""),
    [warehousesLoading, setWarehousesLoading] = useState(true);
  const [screenFields, setScreenFields] = useState<ScreenField[]>([
    { key: "trackingCode", label: "Lot / seri", visible: true, position: 0 },
    { key: "trackingMode", label: "İz türü", visible: true, position: 1 },
    { key: "stockItem", label: "Stok", visible: true, position: 2 },
    { key: "warehouse", label: "Depo", visible: true, position: 3 },
    {
      key: "quantityOnHand",
      label: "Mevcut miktar",
      visible: true,
      position: 4,
    },
    { key: "expiryDate", label: "Son kullanma", visible: true, position: 5 },
    {
      key: "lastMovementDate",
      label: "Son hareket",
      visible: true,
      position: 6,
    },
  ]);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const gridExportRef = useRef<GridExportActions | null>(null);
  usePageCommands({ more: [csvExportCommand(gridExportRef)] });
  const latestRequest = useRef(0);
  const pageSize = 50;

  async function load(nextPage = page) {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("q", search.trim());
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (trackingMode) params.set("trackingMode", trackingMode);
    try {
      const data = await request<Page>(
        `/api/inventory-tracking/balances?${params}`,
        token,
      );
      if (requestId === latestRequest.current) {
        setResult(data);
        setPage(nextPage);
      }
    } catch (e) {
      if (requestId === latestRequest.current) setError((e as Error).message);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setWarehousesLoading(true);
    setWarehouseError("");
    request<Warehouse[]>("/api/warehouses/", token)
      .then((rows) => {
        if (!cancelled) setWarehouses(rows);
      })
      .catch((e) => {
        if (!cancelled) setWarehouseError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setWarehousesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    request<{ fields?: ScreenField[] }>(
      "/api/screen-views/inventory-trace-balances/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setScreenFields(view.fields as ScreenField[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    void load(1);
  }, [token, search, warehouseId, trackingMode]);


  const rows = result?.items ?? [];
  const selectedBalance =
    rows.find((row) => trackingRowKey(row) === currentKey) ?? rows[0] ?? null;
  const today = localToday();
  const expiries = rows.map((row) => expiryState(row.expiryDate, today));
  const bulkActions: BulkAction[] = [
    { id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() },
  ];
  function applySearch() {
    setSearch(query);
    if (search === query) void load(1);
  }
  function clearFilters() {
    setQuery("");
    setSearch("");
    setWarehouseId("");
    setTrackingMode("");
  }
  const hasFilters = Boolean(search || warehouseId || trackingMode);
  const visibleFields = screenFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);

  function renderField(row: Balance, field: ScreenField) {
    switch (field.key) {
      case "trackingCode":
        return <span className="nx-code">{row.trackingCode}</span>;
      case "trackingMode":
        return (
          // Tracking type, not a status: Lot info (blue), Seri off (grey), as the former type chips.
          <StatusTag tone={row.trackingMode === "Lot" ? "info" : "off"}>
            {row.trackingMode === "Lot" ? "Lot" : "Seri"}
          </StatusTag>
        );
      // One line each (30px rows): name with its code after it, warehouse as "code · name" like the detail panel.
      case "stockItem":
        return (
          <>
            {row.stockItemName}
            <small className="nx-code inventory-tracking-inline-code">{row.stockItemCode}</small>
          </>
        );
      case "warehouse":
        return `${row.warehouseCode} · ${row.warehouseName}`;
      case "quantityOnHand":
        return `${row.quantityOnHand.toLocaleString("tr-TR", {
          maximumFractionDigits: 4,
        })} ${row.unitCode}`;
      case "expiryDate":
        return row.expiryDate ? (
          <TrackingExpiryCell
            value={new Date(`${row.expiryDate}T00:00:00`).toLocaleDateString("tr-TR")}
            state={expiryState(row.expiryDate, today)}
          />
        ) : (
          "—"
        );
      case "lastMovementDate":
        return new Date(`${row.lastMovementDate}T00:00:00`).toLocaleDateString(
          "tr-TR",
        );
    }
  }

  return (
    <div className="inventory-tracking-page inventory-list-v2 list-v2">
      <InventoryTrackingHeader
        total={loading || error ? null : (result?.totalCount ?? null)}
      />
      <InventoryTrackingAlerts
        warehouseError={warehouseError}
        error={error}
        loading={loading}
        onRetry={() => void load()}
      />
      <ListSummaryCards
        cards={[
          {
            id: "expired",
            label: "Süresi geçmiş",
            value: loading ? "—" : expiries.filter((state) => state === "expired").length.toLocaleString("tr-TR"),
            icon: CalendarX,
            tone: "bad",
            hint: "bu sayfa",
          },
          {
            id: "soon",
            label: "30 gün içinde dolacak",
            value: loading ? "—" : expiries.filter((state) => state === "soon").length.toLocaleString("tr-TR"),
            icon: CalendarClock,
            tone: "warn",
            hint: "bu sayfa",
          },
        ]}
      />
      <InventoryTrackingFilters
        query={query}
        onQueryChange={setQuery}
        trackingMode={trackingMode}
        onTrackingModeChange={setTrackingMode}
        warehouseId={warehouseId}
        onWarehouseSelect={setWarehouseId}
        warehouses={warehouses}
        warehousesLoading={warehousesLoading}
        warehouseError={warehouseError}
        hasFilters={hasFilters}
        onApply={applySearch}
        onClear={clearFilters}
        onRefresh={() => void load()}
        toolsSlotRef={setToolsSlot}
      />
      <div className="inventory-workbench-body">
        <InventoryTrackingBalanceTable
          fields={visibleFields}
          rows={rows}
          loading={loading}
          error={error}
          hasFilters={hasFilters}
          toolbarContainer={toolsSlot}
          hideExport
          exportActionsRef={gridExportRef}
          bulkActions={bulkActions}
          onSelectionChange={setSelectedKeys}
          onCurrentRowChange={setCurrentKey}
          renderField={renderField}
          footer={
            <ListFooter hints="↑↓ gez · Boşluk işaretle">
              {selectedKeys.length > 0 && (
                <span>
                  <span>{selectedKeys.length}</span> <span>seçili</span>
                </span>
              )}
              <span>
                <span>Gösterilen</span>{" "}
                <span>
                  {rows.length.toLocaleString("tr-TR")} / {(result?.totalCount ?? 0).toLocaleString("tr-TR")}
                </span>
              </span>
              <ListPagination
                page={page}
                total={result?.totalCount ?? 0}
                pageSize={pageSize}
                loading={loading}
                onPageChange={(nextPage) => void load(nextPage)}
              />
            </ListFooter>
          }
        />
        <InventoryTrackingDetail balance={selectedBalance} />
      </div>
      <InventoryTrackingBoundaryNote />
    </div>
  );
}
