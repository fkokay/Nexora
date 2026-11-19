import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { authenticatedFetch } from "./authApi";
import { usePageParams } from "./pageNavigation";
import type { GridExportActions } from "./AdvancedDataGrid";
import { usePageCommands } from "./commands/CommandProvider";
import { csvExportCommand } from "./commands/gridCommands";
import { confirmDialog } from "./confirmDialog";
import type { PageCommands } from "./commands/types";
import { DefinitionEmptyPane, DefinitionLayout } from "./list-page/DefinitionLayout";
import type { BulkAction } from "./list-page/BulkActionBar";
import { ListFooter } from "./list-page/ListFooter";
import { isInPopup, useWindowKeyDown } from "./record-form/recordFormKeys";
import "./warehouse-locations.css";
import {
  CreateLocationForm,
  EditLocationForm,
  changedLocationFields,
  type LocationEditValues,
} from "./warehouse-locations/components/WarehouseLocationForms";
import {
  WarehouseLocationOverview,
  WarehouseLocationToolbar,
} from "./warehouse-locations/components/WarehouseLocationOverview";
import {
  LOCATION_REQUEST_EVENT,
  clearLocationRequest,
  peekLocationRequest,
  type LocationRequest,
} from "./warehouse-locations/locationRequest";
import {
  LocationBalancePanel,
  LocationListPanel,
  ReconciliationPanel,
} from "./warehouse-locations/components/WarehouseLocationPanels";
import type {
  Balance,
  Location,
  Reconciliation,
  ScreenField,
  WarehouseRow,
} from "./warehouse-locations/types";

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      detail?: string;
    } | null;
    throw new Error(
      body?.error ?? body?.detail ?? `İstek başarısız (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export default function WarehouseLocationsPage({
  token,
  role,
}: {
  token: string;
  role: string;
}) {
  const isAdmin = role === "TenantAdmin";
  // A hand-off from Depolar ("Lokasyon ekle" / "Tümünü yönet") picks the warehouse and may open the create form.
  const [initialRequest] = useState(() => peekLocationRequest());
  useEffect(() => clearLocationRequest(), []);
  // The system Depolar page hands off through the page parameters only (`warehouseId`); legacy Depolar sets both.
  const paramWarehouseId = usePageParams("inventory-locations").warehouseId ?? "";
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseId, setWarehouseId] = useState(initialRequest?.warehouseId || paramWarehouseId);
  const [locations, setLocations] = useState<Location[]>([]);
  // Definition screen: the location open in the form (none until a row is chosen), or a new one.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "create" | "edit">(
    initialRequest?.create && isAdmin ? "create" : "none",
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const createFormId = `warehouse-location-create${useId()}`;
  const [balanceFields, setBalanceFields] = useState<ScreenField[]>([
    { key: "stockItemCode", label: "Stok kodu", visible: true, position: 0 },
    { key: "stockItemName", label: "Stok adı", visible: true, position: 1 },
    { key: "quantity", label: "Konum miktarı", visible: true, position: 2 },
    { key: "unitCode", label: "Birim", visible: true, position: 3 },
  ]);
  const [locationFields, setLocationFields] = useState<ScreenField[]>([
    { key: "code", label: "Konum kodu", visible: true, position: 0 },
    { key: "name", label: "Konum adı", visible: true, position: 1 },
    { key: "parentLocation", label: "Üst konum", visible: true, position: 2 },
    { key: "status", label: "Durum", visible: true, position: 3 },
    { key: "actions", label: "İşlem", visible: true, position: 4, fixed: true },
  ]);
  const [reconciliationFields, setReconciliationFields] = useState<
    ScreenField[]
  >([
    { key: "stockItemCode", label: "Stok kodu", visible: true, position: 0 },
    { key: "stockItemName", label: "Stok adı", visible: true, position: 1 },
    {
      key: "warehouseQuantity",
      label: "Depo bakiyesi",
      visible: true,
      position: 2,
    },
    {
      key: "locatedQuantity",
      label: "Konumlandırılmış",
      visible: true,
      position: 3,
    },
    {
      key: "unlocatedQuantity",
      label: "Konumu boş",
      visible: true,
      position: 4,
    },
    { key: "unitCode", label: "Birim", visible: true, position: 5 },
  ]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentLocationId, setParentLocationId] = useState("");
  const [editValues, setEditValues] = useState<LocationEditValues | null>(null);
  const [editBaseline, setEditBaseline] = useState<LocationEditValues | null>(null);
  // Row version the edit form was loaded with (or last saved to). Saves send this one, so a change made elsewhere
  // since then is refused by the server (409) instead of being overwritten.
  const [editVersion, setEditVersion] = useState<string | null>(null);
  const editFormId = `warehouse-location-edit${useId()}`;
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [reconciliationError, setReconciliationError] = useState("");
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locationRequestId = useRef(0);
  const balanceRequestId = useRef(0);
  const reconciliationRequestId = useRef(0);
  const selected =
    locations.find((location) => location.id === selectedId) ?? null;
  const filteredLocations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    const byStatus = statusFilter
      ? locations.filter(
          (location) => location.isActive === (statusFilter === "Active"),
        )
      : locations;
    if (!term) return byStatus;
    return byStatus.filter((location) => {
      const parentCode =
        locations.find((row) => row.id === location.parentLocationId)?.code ??
        "";
      return `${location.code} ${location.name} ${parentCode}`
        .toLocaleLowerCase("tr-TR")
        .includes(term);
    });
  }, [locations, search, statusFilter]);
  const visibleBalanceFields = useMemo(
    () =>
      balanceFields
        .filter((field) => field.visible)
        .sort((a, b) => a.position - b.position),
    [balanceFields],
  );
  const visibleLocationFields = useMemo(
    () =>
      locationFields
        .filter((field) => field.visible)
        .sort((a, b) => a.position - b.position),
    [locationFields],
  );
  const visibleReconciliationFields = useMemo(
    () =>
      reconciliationFields
        .filter((field) => field.visible)
        .sort((a, b) => a.position - b.position),
    [reconciliationFields],
  );

  const loadWarehouses = useCallback(async () => {
    setError("");
    setWarehousesLoading(true);
    try {
      const rows = await request<WarehouseRow[]>("/api/warehouses/", token);
      setWarehouses(rows);
      setWarehouseId(
        (current) => current || rows.find((row) => row.isActive)?.id || "",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWarehousesLoading(false);
    }
  }, [token]);

  const loadLocations = useCallback(async () => {
    const requestId = ++locationRequestId.current;
    if (!warehouseId) {
      setLocations([]);
      setBalances([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const rows = await request<Location[]>(
        `/api/warehouses/${warehouseId}/locations`,
        token,
      );
      if (requestId === locationRequestId.current) {
        setLocations(rows);
        // A selected location that is gone after a refresh closes its form.
        setSelectedId((current) => (current && !rows.some((row) => row.id === current) ? null : current));
      }
    } catch (e) {
      if (requestId === locationRequestId.current)
        setError((e as Error).message);
    } finally {
      if (requestId === locationRequestId.current) setLoading(false);
    }
  }, [token, warehouseId]);

  const loadBalances = useCallback(
    async (locationId: string) => {
      const requestId = ++balanceRequestId.current;
      if (!warehouseId || !locationId) {
        setBalances([]);
        setBalanceError("");
        setBalancesLoading(false);
        return;
      }
      setBalances([]);
      setBalancesLoading(true);
      setBalanceError("");
      try {
        const result = await request<{ items: Balance[] }>(
          `/api/warehouses/${warehouseId}/locations/${locationId}/balances`,
          token,
        );
        if (requestId === balanceRequestId.current) setBalances(result.items);
      } catch (e) {
        if (requestId === balanceRequestId.current)
          setBalanceError((e as Error).message);
      } finally {
        if (requestId === balanceRequestId.current) setBalancesLoading(false);
      }
    },
    [token, warehouseId],
  );

  const loadReconciliation = useCallback(async () => {
    const requestId = ++reconciliationRequestId.current;
    if (!warehouseId) {
      setReconciliation([]);
      setReconciliationError("");
      setReconciliationLoading(false);
      return;
    }
    setReconciliation([]);
    setReconciliationLoading(true);
    setReconciliationError("");
    try {
      const result = await request<{ items: Reconciliation[] }>(
        `/api/warehouses/${warehouseId}/location-reconciliation`,
        token,
      );
      if (requestId === reconciliationRequestId.current)
        setReconciliation(result.items);
    } catch (e) {
      if (requestId === reconciliationRequestId.current)
        setReconciliationError((e as Error).message);
    } finally {
      if (requestId === reconciliationRequestId.current)
        setReconciliationLoading(false);
    }
  }, [token, warehouseId]);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);
  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);
  useEffect(() => {
    void loadBalances(selectedId ?? "");
  }, [loadBalances, selectedId]);
  useEffect(() => {
    void loadReconciliation();
  }, [loadReconciliation]);
  useEffect(() => {
    let cancelled = false;
    void request<{ fields: ScreenField[] }>(
      "/api/screen-views/warehouse-location-balances/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length) setBalanceFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    void request<{ fields: ScreenField[] }>(
      "/api/screen-views/inventory-warehouse-locations/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length) setLocationFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    void request<{ fields: ScreenField[] }>(
      "/api/screen-views/inventory-warehouse-reconciliation/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setReconciliationFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  async function refresh() {
    await loadWarehouses();
    await loadLocations();
    if (selectedId) await loadBalances(selectedId);
    await loadReconciliation();
  }

  async function createLocation(event: FormEvent) {
    event.preventDefault();
    if (!warehouseId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await request<Location>(
        `/api/warehouses/${warehouseId}/locations`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code,
            name,
            parentLocationId: parentLocationId || null,
          }),
        },
      );
      setLocations((current) =>
        [...current, created].sort((a, b) =>
          a.code.localeCompare(b.code, "tr"),
        ),
      );
      setCode("");
      setName("");
      setParentLocationId("");
      setSearch("");
      // The new location stays open in the form.
      openRecord(created);
      setNotice("Depo konumu oluşturuldu.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const valuesOf = (location: Location): LocationEditValues => ({
    code: location.code,
    name: location.name,
    parentLocationId: location.parentLocationId ?? "",
    isActive: location.isActive,
  });
  const hasChanges =
    mode === "edit"
      ? !!editValues && !!editBaseline && changedLocationFields(editValues, editBaseline) > 0
      : mode === "create" && !!(code.trim() || name.trim() || parentLocationId);
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  // While a save runs, the open record stays: its result is written into this form.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const focusList = () =>
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(".nx-def-list .advanced-grid-scroll")?.focus(), 0);
  const confirmDiscard = async (title: string) =>
    !hasChangesRef.current ||
    (await confirmDialog({ title, message: "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?", confirmLabel: "Devam" }));

  function openRecord(location: Location) {
    setSelectedId(location.id);
    // Only TenantAdmin may change locations; others see the selected location read-only.
    setMode(isAdmin ? "edit" : "none");
    setEditValues(valuesOf(location));
    setEditBaseline(valuesOf(location));
    setEditVersion(location.rowVersion);
  }
  function closeRecord() {
    setSelectedId(null);
    setMode("none");
    setEditValues(null);
    setEditBaseline(null);
    setEditVersion(null);
    setCode("");
    setName("");
    setParentLocationId("");
  }
  async function requestRow(id: string | null) {
    if (id === selectedId || busyRef.current) return;
    if (!(await confirmDiscard("Vazgeç"))) return;
    const location = id ? locations.find((row) => row.id === id) : undefined;
    if (location) openRecord(location);
    else closeRecord();
  }
  async function close() {
    if ((mode === "none" && !selectedId) || busyRef.current || !(await confirmDiscard("Vazgeç"))) return;
    closeRecord();
    focusList();
  }
  async function startCreate() {
    if (busyRef.current || !(await confirmDiscard("Yeni kayıt"))) return;
    closeRecord();
    setMode("create");
    // Only if the create form is still the open one by then.
    window.setTimeout(() => {
      if (modeRef.current === "create") document.getElementById(createFormId)?.querySelector<HTMLInputElement>("input")?.focus();
    }, 0);
  }
  // Aç (Enter): the current row into the form, and focus on its first field.
  function openCurrent() {
    if (!selected) return;
    if (mode !== "edit") openRecord(selected);
    window.setTimeout(() => document.getElementById(editFormId)?.querySelector<HTMLInputElement>("input")?.focus(), 0);
  }
  async function changeWarehouse(nextWarehouseId: string) {
    if (nextWarehouseId === warehouseId || busyRef.current || !(await confirmDiscard("Vazgeç"))) return;
    closeRecord();
    setWarehouseId(nextWarehouseId);
    setLocations([]);
    setBalances([]);
    setBalanceError("");
    setLoading(Boolean(nextWarehouseId));
    setSearch("");
  }
  // The open location left the list (refresh): its form closes.
  useEffect(() => {
    if (mode !== "edit" || selected) return;
    setMode("none");
    setEditValues(null);
    setEditBaseline(null);
  }, [mode, selected]);
  // The list was refreshed and the open location changed elsewhere: an unchanged form shows the new values; a
  // changed one keeps its baseline version, so saving it gets the server's conflict message. A changed form that
  // becomes unchanged again (the edits undone) is rebuilt from the live row then.
  useEffect(() => {
    if (mode !== "edit" || !selected || !editVersion || selected.rowVersion === editVersion) return;
    if (busyRef.current || hasChanges) return;
    openRecord(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.rowVersion, hasChanges]);
  // A hand-off while this screen is already open (kept alive).
  const requestRef = useRef<(request: LocationRequest) => void>(() => {});
  const lastHandOff = useRef(initialRequest?.warehouseId ?? "");
  requestRef.current = (request) => {
    lastHandOff.current = request.warehouseId;
    // The stored copy is for a fresh mount only; a declined hand-off is not replayed later.
    clearLocationRequest();
    void (async () => {
      if (busyRef.current || !(await confirmDiscard("Vazgeç"))) return;
      closeRecord();
      if (request.warehouseId !== warehouseId) {
        setWarehouseId(request.warehouseId);
        setLocations([]);
        setBalances([]);
        setLoading(true);
        setSearch("");
      }
      if (request.create && isAdmin) setMode("create");
    })();
  };
  // A new warehouse in the page parameters while this screen is open (kept alive) is a hand-off too.
  const warehouseIdRef = useRef(warehouseId);
  warehouseIdRef.current = warehouseId;
  const appliedParam = useRef(paramWarehouseId);
  useEffect(() => {
    if (!paramWarehouseId || paramWarehouseId === appliedParam.current) return;
    appliedParam.current = paramWarehouseId;
    // Legacy Depolar sends the same hand-off as a stored request and an event as well: that one is applied (with its
    // create mode), not this.
    if (paramWarehouseId === peekLocationRequest()?.warehouseId || paramWarehouseId === lastHandOff.current) return;
    if (paramWarehouseId !== warehouseIdRef.current) requestRef.current({ warehouseId: paramWarehouseId, create: false });
  }, [paramWarehouseId]);
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<LocationRequest>).detail;
      if (detail?.warehouseId) requestRef.current(detail);
    };
    window.addEventListener(LOCATION_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(LOCATION_REQUEST_EVENT, onRequest);
  }, []);

  async function saveLocation(event: FormEvent) {
    event.preventDefault();
    if (!selected || !editValues) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await request<Location>(
        `/api/warehouses/${warehouseId}/locations/${selected.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            code: editValues.code,
            name: editValues.name,
            parentLocationId: editValues.parentLocationId || null,
            isActive: editValues.isActive,
            rowVersion: editVersion ?? selected.rowVersion,
          }),
        },
      );
      setLocations((current) =>
        current
          .map((row) => (row.id === updated.id ? updated : row))
          .sort((a, b) => a.code.localeCompare(b.code, "tr")),
      );
      // The form stays on the saved location.
      setEditValues(valuesOf(updated));
      setEditBaseline(valuesOf(updated));
      setEditVersion(updated.rowVersion);
      setNotice("Depo konumu güncellendi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // No delete exists for locations: Sil says so and offers saving the location as passive (the existing update).
  async function deleteBlocked(location: Location) {
    if (
      !(await confirmDialog({
        title: `${location.code} · ${location.name} silinemez`,
        message:
          "Konumlar silinmez; geçmiş hareketler korunur. Pasife alabilirsiniz. Etkin alt konumu ya da stok bakiyesi olan konum pasife alınamaz.",
        tone: "warning",
        confirmLabel: "Pasife al",
        cancelLabel: "Vazgeç",
        keyHints: true,
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await request<Location>(
        `/api/warehouses/${warehouseId}/locations/${location.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            code: location.code,
            name: location.name,
            parentLocationId: location.parentLocationId,
            isActive: false,
            rowVersion: (selectedId === location.id ? editVersion : null) ?? location.rowVersion,
          }),
        },
      );
      setLocations((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      if (selectedId === updated.id) {
        setEditValues(valuesOf(updated));
        setEditBaseline(valuesOf(updated));
        setEditVersion(updated.rowVersion);
      }
      setNotice("Depo konumu güncellendi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Esc = Vazgeç: closes the open form or the selected location (or the drawer below 1280px).
  useWindowKeyDown(mode !== "none" || !!selectedId, (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || !rootRef.current || rootRef.current.closest("[hidden]")) return;
    if (document.querySelector('.modal-backdrop, [aria-modal="true"]')) return;
    event.preventDefault();
    void close();
  });

  const pageCommands: PageCommands = { more: [csvExportCommand(gridExportRef)] };
  if (isAdmin) {
    pageCommands.new = { primary: mode === "none", disabledReason: busy ? "İşlem sürüyor…" : undefined, run: () => void startCreate() };
    // Same permission and busy gate as before: the current row into the right-hand form.
    pageCommands.open = {
      disabledReason: !selected ? "Önce bir kayıt seçin" : busy ? "Kaydediliyor…" : undefined,
      run: openCurrent,
    };
    pageCommands.delete = {
      disabledReason: !selected
        ? "Önce bir kayıt seçin"
        : hasChanges
          ? "Önce değişiklikleri kaydedin veya vazgeçin"
          : !selected.isActive
            ? "Konumlar silinemez; bu konum zaten pasif."
            : busy
              ? "İşlem sürüyor…"
              : undefined,
      run: () => {
        if (selected) void deleteBlocked(selected);
      },
    };
  }
  usePageCommands(pageCommands);
  const bulkActions: BulkAction[] = [
    { id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() },
  ];
  const activeCount = locations.filter((row) => row.isActive).length;

  const balancePanel = (
    <LocationBalancePanel
      selected={selected}
      locations={locations}
      balances={balances}
      visibleFields={visibleBalanceFields}
      loading={balancesLoading}
      error={balanceError}
      compact={mode === "edit"}
    />
  );
  const pane =
    mode === "create" ? (
      <CreateLocationForm
        locations={locations}
        warehouseId={warehouseId}
        code={code}
        name={name}
        parentLocationId={parentLocationId}
        busy={busy}
        formId={createFormId}
        onCodeChange={setCode}
        onNameChange={setName}
        onParentChange={setParentLocationId}
        onSubmit={(event) => void createLocation(event)}
        onCancel={() => void close()}
      />
    ) : mode === "edit" && selected && editValues && editBaseline ? (
      <>
        <EditLocationForm
          editing={selected}
          formId={editFormId}
          locations={locations}
          values={editValues}
          baseline={editBaseline}
          busy={busy}
          onChange={setEditValues}
          onCancel={() => void close()}
          onSubmit={(event) => void saveLocation(event)}
        />
        {balancePanel}
      </>
    ) : selected ? (
      balancePanel
    ) : (
      <DefinitionEmptyPane>
        {isAdmin ? "Bir konum seçin ya da F2 ile yeni konum ekleyin." : "Bir konum seçin."}
      </DefinitionEmptyPane>
    );

  return (
    <div className="warehouse-locations-page list-v2">
      <WarehouseLocationOverview
        warehouseId={warehouseId}
        locations={locations}
        loading={loading}
        error={error}
        notice={notice}
        onDismissError={() => setError("")}
        onDismissNotice={() => setNotice("")}
      />
      <DefinitionLayout
        rootRef={rootRef}
        className="warehouse-location-layout"
        paneOpen={mode !== "none" || !!selected}
        paneLabel="Konum kaydı"
        list={
          <>
            <WarehouseLocationToolbar
              warehouses={warehouses}
              warehouseId={warehouseId}
              locations={locations}
              warehousesLoading={warehousesLoading}
              search={search}
              statusFilter={statusFilter}
              onSearchChange={setSearch}
              onStatusChange={setStatusFilter}
              toolsSlotRef={setToolsSlot}
              onRefresh={() => void refresh()}
              onWarehouseSelect={(nextWarehouseId) => void changeWarehouse(nextWarehouseId)}
            />
            <LocationListPanel
              locations={locations}
              filteredLocations={filteredLocations}
              visibleFields={visibleLocationFields}
              selectedId={selectedId}
              search={search}
              loading={loading}
              warehouseId={warehouseId}
              toolbarContainer={toolsSlot}
              hideExport
              exportActionsRef={gridExportRef}
              onSelect={(id) => void requestRow(id)}
              onSelectionChange={setSelectedKeys}
              bulkActions={bulkActions}
              footer={
                <ListFooter
                  hints={
                    isAdmin
                      ? "↑↓ listede gez · Tab forma geç · Ctrl+S kaydet · Esc listeye dön · F2 yeni konum"
                      : "↑↓ listede gez · Esc listeye dön"
                  }
                >
                  {selectedKeys.length > 0 && (
                    <span>
                      <span>{selectedKeys.length}</span> <span>seçili</span>
                    </span>
                  )}
                  <span>
                    <span>{locations.length}</span> <span>konum</span> · <span>{activeCount}</span> <span>aktif</span> ·{" "}
                    <span>{locations.length - activeCount}</span> <span>pasif</span>
                  </span>
                </ListFooter>
              }
            />
          </>
        }
        pane={pane}
      />
      <ReconciliationPanel
        rows={reconciliation}
        visibleFields={visibleReconciliationFields}
        loading={reconciliationLoading}
        error={reconciliationError}
      />
    </div>
  );
}
