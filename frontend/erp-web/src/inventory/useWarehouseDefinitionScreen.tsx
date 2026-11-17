import { useEffect, useId, useRef, useState, type Dispatch, type FormEvent, type MutableRefObject, type SetStateAction } from "react";
import { Plus } from "lucide-react";
import type { GridExportActions } from "../AdvancedDataGrid";
import type { CommandSpec, MenuCommand } from "../commands/types";
import { confirmDialog } from "../confirmDialog";
import { api } from "../erpApi";
import type {
  BuiltInScreenLayoutField,
  Warehouse,
  WarehouseCustomFieldDefinition,
  WarehouseCustomFieldValue,
  WarehouseLocationOption,
} from "../erp-types";
import { DefinitionEmptyPane, DefinitionLayout } from "../list-page/DefinitionLayout";
import type { BulkAction } from "../list-page/BulkActionBar";
import { isInPopup, useWindowKeyDown } from "../record-form/recordFormKeys";
import { requestLocations } from "../warehouse-locations/locationRequest";
import { WarehouseDefinitionForm, type WarehouseDraft, type WarehouseFormField } from "./components/WarehouseDefinitionForm";
import { WarehouseDefinitionList } from "./components/WarehouseDefinitionList";

const BUSY = "İşlem sürüyor…";
const NO_RECORD = "Önce bir kayıt seçin";
const UNSAVED = "Önce değişiklikleri kaydedin veya vazgeçin";
const DISCARD = "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?";
const EMPTY: WarehouseDraft = { code: "", name: "", custom: {} };

type Options = {
  /** The Depolar screen is shown and no other dialog of the page is open. */
  active: boolean;
  token: string;
  role: string;
  warehouses: Warehouse[];
  setWarehouses: Dispatch<SetStateAction<Warehouse[]>>;
  loading: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  error: string;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  fields: BuiltInScreenLayoutField[];
  /** Incremented when the custom-field catalog changes (the open form reloads its fields when unchanged). */
  catalogVersion: number;
  exportRef: MutableRefObject<GridExportActions | null>;
  toolsSlot: HTMLDivElement | null;
  toolsSlotRef: (element: HTMLDivElement | null) => void;
  onRefresh: () => void;
  onNavigate?: (page: string) => void;
};

const valuesOf = (rows: WarehouseCustomFieldValue[]) => Object.fromEntries(rows.map((row) => [row.code, row.value]));
const sameCustom = (a: Record<string, string>, b: Record<string, string>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => (a[key] ?? "") === (b[key] ?? ""));

/**
 * Depolar as a definition screen (mockup 04 "Tanım ekranı"): the compact warehouse list on the left and the selected
 * warehouse's form on the right, with its locations. Selecting a row (click, ↑/↓) opens it, Yeni (F2) opens an empty
 * form, Kaydet / Ctrl+S saves the form and Esc closes it; each asks first when the form has unsaved changes.
 * Warehouses are never deleted (no delete exists): Sil explains that and offers the existing deactivation.
 */
export function useWarehouseDefinitionScreen(o: Options) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [mode, setMode] = useState<"none" | "create" | "edit">("none"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [draft, setDraft] = useState<WarehouseDraft>(EMPTY),
    [baseline, setBaseline] = useState<WarehouseDraft | null>(null),
    // Row version the open form was loaded with (or last saved / status-changed to). Saves send this one, so a
    // change made elsewhere since then is refused by the server (409) instead of being overwritten.
    [baseVersion, setBaseVersion] = useState<string | null>(null),
    [fields, setFields] = useState<WarehouseFormField[]>([]),
    [fieldsLoading, setFieldsLoading] = useState(false),
    [locations, setLocations] = useState<WarehouseLocationOption[]>([]),
    [locationsLoading, setLocationsLoading] = useState(false),
    [locationsError, setLocationsError] = useState(""),
    [formNotice, setFormNotice] = useState(""),
    [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const formId = `warehouse-definition${useId()}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stayAfterSaveRef = useRef(false);
  const fieldsRequest = useRef(0),
    locationsRequest = useRef(0);
  const current = selectedId ? o.warehouses.find((row) => row.id === selectedId) : undefined;

  const changedCount =
    mode === "edit" && baseline
      ? (draft.code.trim().toUpperCase() !== baseline.code ? 1 : 0) +
        (draft.name.trim() !== baseline.name ? 1 : 0) +
        [...new Set([...Object.keys(draft.custom), ...Object.keys(baseline.custom)])].filter(
          (key) => (draft.custom[key] ?? "") !== (baseline.custom[key] ?? ""),
        ).length
      : 0;
  const hasChanges =
    mode === "edit"
      ? changedCount > 0
      : mode === "create" && !!(draft.code.trim() || draft.name.trim() || Object.values(draft.custom).some((value) => value.trim()));
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  // While a save or status change runs, the open record stays: its result is written into this form.
  const busyRef = useRef(o.busy);
  busyRef.current = o.busy;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const confirmDiscard = async (title: string) =>
    !hasChangesRef.current || (await confirmDialog({ title, message: DISCARD, confirmLabel: "Devam" }));

  // Focuses the first field only if the create form is still the open one by then.
  const focusCreateForm = () =>
    window.setTimeout(() => {
      if (modeRef.current !== "create") return;
      document.getElementById(formId)?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
    }, 0);
  const focusList = () =>
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(".nx-def-list .advanced-grid-scroll")?.focus(), 0);

  async function loadFields(warehouse: Warehouse) {
    const requestId = ++fieldsRequest.current;
    setFieldsLoading(true);
    try {
      const values = await api<WarehouseCustomFieldValue[]>(`/api/warehouses/${warehouse.id}/custom-fields`, o.token);
      if (requestId !== fieldsRequest.current) return;
      const custom = valuesOf(values);
      setFields(values.map((row) => ({ ...row, version: row.definitionVersion })));
      setBaseline((base) => (base ? { ...base, custom } : base));
      setDraft((value) => ({ ...value, custom }));
    } catch (e) {
      if (requestId === fieldsRequest.current) o.setError((e as Error).message);
    } finally {
      if (requestId === fieldsRequest.current) setFieldsLoading(false);
    }
  }
  async function loadLocations(warehouse: Warehouse) {
    const requestId = ++locationsRequest.current;
    setLocations([]);
    setLocationsError("");
    setLocationsLoading(true);
    try {
      const rows = await api<WarehouseLocationOption[]>(`/api/warehouses/${warehouse.id}/locations`, o.token);
      if (requestId === locationsRequest.current) setLocations(rows);
    } catch (e) {
      if (requestId === locationsRequest.current) setLocationsError((e as Error).message);
    } finally {
      if (requestId === locationsRequest.current) setLocationsLoading(false);
    }
  }

  function openRecord(warehouse: Warehouse) {
    const base = { code: warehouse.code, name: warehouse.name, custom: {} };
    setSelectedId(warehouse.id);
    setMode("edit");
    setBaseline(base);
    setBaseVersion(warehouse.rowVersion);
    setDraft(base);
    setFields([]);
    setFormNotice("");
    void loadFields(warehouse);
    void loadLocations(warehouse);
  }
  function closeRecord() {
    fieldsRequest.current++;
    locationsRequest.current++;
    setSelectedId(null);
    setMode("none");
    setBaseline(null);
    setBaseVersion(null);
    setDraft(EMPTY);
    setFields([]);
    setFieldsLoading(false);
    setFormNotice("");
  }
  async function requestRow(key: string | null) {
    if (key === selectedId || busyRef.current) return;
    if (!(await confirmDiscard("Vazgeç"))) return;
    const warehouse = key ? o.warehouses.find((row) => row.id === key) : undefined;
    if (warehouse) openRecord(warehouse);
    else closeRecord();
  }
  async function close() {
    if (mode === "none" || busyRef.current || !(await confirmDiscard("Vazgeç"))) return;
    closeRecord();
    focusList();
  }
  async function startCreate() {
    if (busyRef.current || !(await confirmDiscard("Yeni kayıt"))) return;
    closeRecord();
    setMode("create");
    o.setError("");
    const requestId = ++fieldsRequest.current;
    try {
      const definitions = await api<WarehouseCustomFieldDefinition[]>("/api/warehouses/custom-fields", o.token);
      if (requestId === fieldsRequest.current) setFields(definitions.map((row) => ({ ...row })));
    } catch (e) {
      if (requestId === fieldsRequest.current) o.setError((e as Error).message);
    }
    focusCreateForm();
  }
  // The list was refreshed (Yenile) and the open warehouse changed elsewhere: an unchanged form shows the new
  // values; a changed one keeps its baseline version, so saving it gets the server's conflict message. A changed
  // form that becomes unchanged again (the edits undone) is rebuilt from the live row then, so it never goes on
  // with stale values under an old version (a later status change would adopt the new version for them).
  useEffect(() => {
    if (mode !== "edit" || !current || !baseVersion || current.rowVersion === baseVersion) return;
    if (busyRef.current || hasChanges) return;
    openRecord(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.rowVersion, hasChanges]);
  // The catalog changed (Depo alan tanımları): an unchanged form shows the new fields.
  useEffect(() => {
    if (!o.catalogVersion || hasChangesRef.current) return;
    if (mode === "edit" && current) void loadFields(current);
    else if (mode === "create")
      void api<WarehouseCustomFieldDefinition[]>("/api/warehouses/custom-fields", o.token)
        .then((definitions) => setFields(definitions.map((row) => ({ ...row }))))
        .catch((e: Error) => o.setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.catalogVersion]);

  async function create() {
    const created = await api<Warehouse>("/api/warehouses/", o.token, {
      method: "POST",
      body: JSON.stringify({ code: draft.code, name: draft.name, customFields: draft.custom }),
    });
    o.setWarehouses((rows) => [...rows, created]);
    o.setNotice("Depo oluşturuldu.");
    // "Kaydet ve Yeni" keeps the empty form open for the next warehouse.
    if (stayAfterSaveRef.current) {
      setDraft(EMPTY);
      setFormNotice("Depo oluşturuldu. Yeni depo girebilirsiniz.");
      focusCreateForm();
    } else openRecord(created);
  }
  async function update(warehouse: Warehouse, base: WarehouseDraft, version: string) {
    const code = draft.code.trim(),
      name = draft.name.trim();
    if (!code || !name) {
      o.setError("Depo kodu ve adı boş bırakılamaz.");
      return;
    }
    if (code.toUpperCase() !== base.code || name !== base.name) {
      const updated = await api<Warehouse>(`/api/warehouses/${warehouse.id}`, o.token, {
        method: "PUT",
        body: JSON.stringify({ code, name, rowVersion: version }),
      });
      setBaseVersion(updated.rowVersion);
      o.setWarehouses((rows) =>
        rows.map((row) => (row.id === updated.id ? updated : row)).sort((a, b) => a.name.localeCompare(b.name, "tr")),
      );
      // Saved part first: a failing custom-field save below leaves only that part changed.
      setBaseline((value) => (value ? { ...value, code: updated.code, name: updated.name } : value));
      setDraft((value) => ({ ...value, code: updated.code, name: updated.name }));
    }
    if (!sameCustom(draft.custom, base.custom) && warehouse.isActive) {
      // Required custom fields are checked only when custom values are saved, so a rename is never blocked by them.
      const missing = fields.find((field) => field.isRequired && !(draft.custom[field.code] ?? "").trim());
      if (missing) {
        o.setError(`“${missing.label}” alanı zorunludur.`);
        return;
      }
      const values = await api<WarehouseCustomFieldValue[]>(`/api/warehouses/${warehouse.id}/custom-fields`, o.token, {
        method: "PUT",
        body: JSON.stringify({ values: draft.custom }),
      });
      const custom = valuesOf(values);
      setBaseline((value) => (value ? { ...value, custom } : value));
      setDraft((value) => ({ ...value, custom }));
    }
    o.setNotice("Depo güncellendi.");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    o.setBusy(true);
    o.setError("");
    o.setNotice("");
    setFormNotice("");
    try {
      if (mode === "create") await create();
      else if (mode === "edit" && current && baseline && baseVersion) await update(current, baseline, baseVersion);
    } catch (e) {
      o.setError((e as Error).message);
    } finally {
      o.setBusy(false);
    }
  }

  async function setActive(warehouse: Warehouse, isActive: boolean) {
    o.setBusy(true);
    o.setError("");
    try {
      const updated = await api<Warehouse>(`/api/warehouses/${warehouse.id}/status`, o.token, {
        method: "POST",
        body: JSON.stringify({ isActive, confirmation: true }),
      });
      o.setWarehouses((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      if (updated.id === selectedId) setBaseVersion(updated.rowVersion);
      o.setNotice(isActive ? "Depo yeniden etkinleştirildi." : "Depo devre dışı bırakıldı.");
    } catch (e) {
      o.setError((e as Error).message);
    } finally {
      o.setBusy(false);
    }
  }
  async function toggleStatus(warehouse: Warehouse) {
    const isActive = !warehouse.isActive;
    if (
      !(await confirmDialog({
        title: `Depo ${isActive ? "yeniden etkinleştirilsin" : "devre dışı bırakılsın"} mı?`,
        message: `${warehouse.code} · ${warehouse.name}${isActive ? "" : " · Depoda sıfırdan farklı stok varsa işlem reddedilir."}`,
        tone: "warning",
        confirmLabel: isActive ? "Etkinleştir" : "Devre dışı bırak",
      }))
    )
      return;
    await setActive(warehouse, isActive);
  }
  // No delete exists for warehouses: Sil says so and offers the deactivation (the server refuses it while stock remains).
  async function deleteBlocked(warehouse: Warehouse) {
    if (
      await confirmDialog({
        title: `${warehouse.code} · ${warehouse.name} silinemez`,
        message:
          "Depolar silinmez; geçmiş hareketler korunur. Pasife alabilirsiniz: devre dışı depolar yeni stok hareketi ve transferde kullanılamaz. Sıfırdan farklı bakiyesi olan depo kapatılamaz.",
        tone: "warning",
        confirmLabel: "Pasife al",
        cancelLabel: "Vazgeç",
        keyHints: true,
      })
    )
      await setActive(warehouse, false);
  }

  // Esc = Vazgeç: closes the open form (or the drawer below 1280px); not while a dialog or a picker owns the key.
  useWindowKeyDown(o.active && mode !== "none", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || !rootRef.current || rootRef.current.closest("[hidden]")) return;
    if (document.querySelector('.modal-backdrop, [aria-modal="true"]')) return;
    event.preventDefault();
    void close();
  });

  const commands: { new: CommandSpec; delete: CommandSpec } = {
    new: { primary: mode === "none", disabledReason: o.busy ? BUSY : undefined, run: () => void startCreate() },
    delete: {
      disabledReason: !current
        ? NO_RECORD
        : hasChanges
          ? UNSAVED
          : !current.isActive
            ? "Depolar silinemez; bu depo zaten pasif."
            : o.busy
              ? BUSY
              : undefined,
      run: () => {
        if (current) void deleteBlocked(current);
      },
    },
  };
  const moreItems: MenuCommand[] = current
    ? [
        {
          id: "warehouse-status",
          label: current.isActive ? "Devre dışı bırak" : "Yeniden etkinleştir",
          disabledReason: o.busy ? BUSY : hasChanges ? UNSAVED : undefined,
          run: () => void toggleStatus(current),
        },
      ]
    : [];
  const bulkActions: BulkAction[] = [
    { id: "export-selected", label: "Excel (seçilenler)", run: () => void o.exportRef.current?.exportExcel() },
  ];

  const term = search.trim().toLocaleLowerCase("tr-TR");
  const visible = o.warehouses.filter(
    (row) =>
      `${row.code} ${row.name}`.toLocaleLowerCase("tr-TR").includes(term) &&
      (!status || row.isActive === (status === "Active")),
  );
  const handOff = (create: boolean) => {
    if (!current || !o.onNavigate) return;
    requestLocations({ warehouseId: current.id, create });
    o.onNavigate("inventory-locations");
  };
  // Locations are created by TenantAdmin only and not in a passive warehouse.
  const canAddLocation = o.role === "TenantAdmin" && !!current?.isActive && !!o.onNavigate;

  const pane =
    mode === "none" ? (
      <DefinitionEmptyPane>Bir depo seçin ya da F2 ile yeni depo ekleyin.</DefinitionEmptyPane>
    ) : (
      <WarehouseDefinitionForm
        mode={mode}
        current={current}
        draft={draft}
        baseline={mode === "edit" ? baseline : null}
        fields={fields}
        fieldsLoading={fieldsLoading}
        changedCount={changedCount}
        busy={o.busy}
        error={o.error}
        notice={formNotice}
        saveDisabledReason={mode === "edit" && !hasChanges ? "Kaydedilecek değişiklik yok" : undefined}
        formId={formId}
        onDismissError={() => o.setError("")}
        onChange={setDraft}
        onSubmit={(event) => void submit(event)}
        onCancel={() => void close()}
        onSaveIntent={
          mode === "create"
            ? (stay) => {
                stayAfterSaveRef.current = stay;
              }
            : undefined
        }
        onReset={mode === "create" ? () => setDraft(EMPTY) : undefined}
        locations={locations}
        locationsLoading={locationsLoading}
        locationsError={locationsError}
        onAddLocation={canAddLocation ? () => handOff(true) : undefined}
        onManageLocations={o.onNavigate ? () => handOff(false) : undefined}
      />
    );

  const view = (
    <DefinitionLayout
      rootRef={rootRef}
      paneOpen={mode !== "none"}
      paneLabel="Depo kaydı"
      list={
        <WarehouseDefinitionList
          fields={o.fields}
          warehouses={o.warehouses}
          visible={visible}
          loading={o.loading}
          search={search}
          status={status}
          currentId={selectedId}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onRefresh={o.onRefresh}
          onCurrentRowChange={(key) => void requestRow(key)}
          onSelectionChange={setSelectedKeys}
          selectedCount={selectedKeys.length}
          bulkActions={bulkActions}
          toolsSlot={o.toolsSlot}
          toolsSlotRef={o.toolsSlotRef}
          exportActionsRef={o.exportRef}
          emptyAction={
            <button className="primary small-button" onClick={() => void startCreate()}>
              <Plus size={15} /> Depo ekle
            </button>
          }
        />
      }
      pane={pane}
    />
  );

  return { commands, moreItems, view, formOpen: mode !== "none" };
}
