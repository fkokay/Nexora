import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { CommandSpec } from "../commands/types";
import { confirmDialog } from "../confirmDialog";
import type { CustomerGroupItem } from "../erp-types";
import { DefinitionEmptyPane, DefinitionLayout } from "../list-page/DefinitionLayout";
import { isInPopup, openDialogs, useWindowKeyDown } from "../record-form/recordFormKeys";
import {
  CustomerGroupDefinitionForm,
  customerGroupFieldChanged,
  type CustomerGroupDraft,
  type CustomerGroupDraftKey,
} from "./components/CustomerGroupDefinitionForm";
import { CustomerGroupDefinitionList } from "./components/CustomerGroupDefinitionList";

const BUSY = "İşlem sürüyor…";
const NO_RECORD = "Önce bir kayıt seçin";
const UNSAVED = "Önce değişiklikleri kaydedin veya vazgeçin";
const DISCARD = "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?";
const KEYS: CustomerGroupDraftKey[] = ["code", "name"];
const EMPTY: CustomerGroupDraft = { code: "", name: "" };

const draftOf = (group: CustomerGroupItem): CustomerGroupDraft => ({ code: group.code, name: group.name });
/** A row as the form last loaded it; a refreshed row that differs rebuilds an unchanged form. */
const rowKey = (group: CustomerGroupItem) => `${group.code}|${group.name}|${group.isActive}`;

type Options = {
  /** The page is shown and no other dialog of it is open. */
  active: boolean;
  groups: CustomerGroupItem[];
  loading: boolean;
  busy: boolean;
  error: string;
  setError: (error: string) => void;
  /** Today's POST / PUT with `{ code, name }`; null when the server refused it (the page set the error). */
  save: (draft: CustomerGroupDraft, editing: CustomerGroupItem | null) => Promise<CustomerGroupItem | null>;
  /** Today's DELETE; false when the server refused it (e.g. 409: customers use the group). */
  remove: (group: CustomerGroupItem) => Promise<boolean>;
  toolsSlot: HTMLDivElement | null;
  toolsSlotRef: (element: HTMLDivElement | null) => void;
  onRefresh: () => void;
};

/**
 * Cari Grupları as a definition screen (mockup 04 "Tanım ekranı"): the group list on the left and the selected
 * group's form on the right. Selecting a row (click, ↑/↓) opens it, Yeni (F2) opens an empty form, Kaydet / Ctrl+S
 * saves it, Sil deletes it after a confirmation and Esc closes it; each asks first when the form has unsaved changes.
 * The API has no row version.
 */
export function useCustomerGroupDefinitionScreen(o: Options) {
  const [search, setSearch] = useState(""),
    [mode, setMode] = useState<"none" | "create" | "edit">("none"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [draft, setDraft] = useState<CustomerGroupDraft>(EMPTY),
    [baseline, setBaseline] = useState<CustomerGroupDraft | null>(null),
    [baseRow, setBaseRow] = useState<string | null>(null);
  const formId = `customer-group-definition${useId()}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = selectedId ? o.groups.find((row) => row.id === selectedId) : undefined;

  const changedCount = mode === "edit" && baseline ? KEYS.filter((key) => customerGroupFieldChanged(key, draft, baseline)).length : 0;
  const hasChanges =
    mode === "edit" ? changedCount > 0 : mode === "create" && KEYS.some((key) => customerGroupFieldChanged(key, draft, EMPTY));
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const busyRef = useRef(o.busy);
  busyRef.current = o.busy;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const confirmDiscard = async (title: string) =>
    !hasChangesRef.current || (await confirmDialog({ title, message: DISCARD, confirmLabel: "Devam" }));
  const focusForm = (expected: "create" | "edit") =>
    window.setTimeout(() => {
      if (modeRef.current !== expected) return;
      document.getElementById(formId)?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
    }, 0);
  const focusList = () =>
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(".nx-def-list .advanced-grid-scroll")?.focus(), 0);

  function openRecord(group: CustomerGroupItem) {
    const base = draftOf(group);
    setSelectedId(group.id);
    setMode("edit");
    setBaseline(base);
    setBaseRow(rowKey(group));
    setDraft(base);
    o.setError("");
  }
  function closeRecord() {
    setSelectedId(null);
    setMode("none");
    setBaseline(null);
    setBaseRow(null);
    setDraft(EMPTY);
    o.setError("");
  }
  async function requestRow(key: string | null) {
    if (key === selectedId || busyRef.current) return;
    if (!(await confirmDiscard("Vazgeç"))) return;
    const group = key ? o.groups.find((row) => row.id === key) : undefined;
    if (group) openRecord(group);
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
    setDraft(EMPTY);
    setMode("create");
    focusForm("create");
  }
  // The list was refreshed and the open group changed elsewhere: an unchanged form shows the new values; a changed
  // one keeps the user's values until they are saved or undone. A group deleted elsewhere closes an unchanged form.
  useEffect(() => {
    if (mode !== "edit" || !baseRow || busyRef.current || hasChanges) return;
    if (!current) {
      if (!o.loading) closeRecord();
      return;
    }
    if (rowKey(current) !== baseRow) openRecord(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current && rowKey(current), hasChanges, o.loading]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Nothing to save (also Enter in a field of an unchanged form): no request, like Kaydet's disabled reason.
    if ((mode === "edit" && !hasChanges) || busyRef.current) return;
    const editing = mode === "edit" ? (current ?? null) : null;
    if (mode === "edit" && !editing) return;
    const saved = await o.save(draft, editing);
    if (saved) openRecord(saved);
  }
  async function remove(group: CustomerGroupItem) {
    if (
      !(await confirmDialog({
        title: "Cari grubunu sil",
        message: `“${group.name}” grubu silinsin mi? Gruba bağlı cari kartları varsa silme işlemi engellenir.`,
        tone: "danger",
        confirmLabel: "Grubu sil",
        cancelLabel: "Vazgeç",
        keyHints: true,
      }))
    )
      return;
    if (await o.remove(group)) {
      closeRecord();
      focusList();
    }
  }

  // Esc = Vazgeç: closes the open form (or the drawer below 1280px); not while a dialog or a picker owns the key.
  useWindowKeyDown(o.active && mode !== "none", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || !rootRef.current || rootRef.current.closest("[hidden]")) return;
    if (openDialogs().length) return;
    event.preventDefault();
    void close();
  });

  // Yeni and Sil; the open form registers Kaydet.
  const commands: { new: CommandSpec; delete: CommandSpec } = {
    new: { primary: mode === "none", disabledReason: o.busy ? BUSY : undefined, run: () => void startCreate() },
    delete: {
      disabledReason: !current || mode !== "edit" ? NO_RECORD : hasChanges ? UNSAVED : o.busy ? BUSY : undefined,
      run: () => {
        if (current) void remove(current);
      },
    },
  };

  const term = search.trim().toLocaleLowerCase("tr-TR");
  const visible = o.groups.filter((group) => `${group.code} ${group.name}`.toLocaleLowerCase("tr-TR").includes(term));

  const pane =
    mode === "none" ? (
      <DefinitionEmptyPane>Bir grup seçin ya da F2 ile yeni grup ekleyin.</DefinitionEmptyPane>
    ) : (
      <CustomerGroupDefinitionForm
        mode={mode}
        current={current}
        draft={draft}
        baseline={mode === "edit" ? baseline : null}
        changedCount={changedCount}
        busy={o.busy}
        error={o.error}
        saveDisabledReason={mode === "edit" && !hasChanges ? "Kaydedilecek değişiklik yok" : undefined}
        formId={formId}
        onDismissError={() => o.setError("")}
        onChange={setDraft}
        onSubmit={(event) => void submit(event)}
        onCancel={() => void close()}
      />
    );

  const view = (
    <DefinitionLayout
      rootRef={rootRef}
      paneOpen={mode !== "none"}
      paneLabel="Cari grubu kaydı"
      list={
        <CustomerGroupDefinitionList
          groups={o.groups}
          visible={visible}
          loading={o.loading}
          search={search}
          currentId={selectedId}
          onSearchChange={setSearch}
          onRefresh={o.onRefresh}
          onCurrentRowChange={(key) => void requestRow(key)}
          toolsSlot={o.toolsSlot}
          toolsSlotRef={o.toolsSlotRef}
          emptyAction={
            <button type="button" className="primary small-button" onClick={() => void startCreate()}>
              <Plus size={15} /> Grup ekle
            </button>
          }
        />
      }
      pane={pane}
    />
  );

  return { commands, view, formOpen: mode !== "none" };
}
