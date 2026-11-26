import { useCallback, useEffect, useState } from "react";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import type { PageCommands } from "./commands/types";
import type { CustomerGroupItem } from "./erp-types";
import { api } from "./erpApi";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { CUSTOMER_GROUPS_CHANGED_EVENT } from "./customer-groups/customerGroupsEvents";
import type { CustomerGroupDraft } from "./customer-groups/components/CustomerGroupDefinitionForm";
import { useCustomerGroupDefinitionScreen } from "./customer-groups/useCustomerGroupDefinitionScreen";
import "./list-page/list-page-v2.css";
import "./inventory-record-forms.css";
import "./customer-groups/customer-groups.css";

const sortByName = (rows: CustomerGroupItem[]) => [...rows].sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));

/**
 * Cari Grupları: the company's customer groups (the former "Gruplar" dialog of the customer list) as a definition
 * screen. Load failures stay at page level; a refused save or delete (409: duplicate code, group in use) shows in the
 * form.
 */
export function CustomerGroupsPage({ token }: { token: string }) {
  const [groups, setGroups] = useState<CustomerGroupItem[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [notice, setNotice] = useState(""),
    [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(sortByName(await api<CustomerGroupItem[]>("/api/customer-groups/", token)));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  const changed = () => window.dispatchEvent(new CustomEvent(CUSTOMER_GROUPS_CHANGED_EVENT));

  async function save(draft: CustomerGroupDraft, editing: CustomerGroupItem | null) {
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      const group = await api<CustomerGroupItem>(editing ? `/api/customer-groups/${editing.id}` : "/api/customer-groups/", token, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({ code: draft.code.trim(), name: draft.name.trim() }),
      });
      setGroups((rows) => sortByName(editing ? rows.map((row) => (row.id === group.id ? group : row)) : [...rows, group]));
      setNotice(editing ? "Cari grubu güncellendi." : "Cari grubu oluşturuldu.");
      changed();
      return group;
    } catch (e) {
      setFormError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function remove(group: CustomerGroupItem) {
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      await api(`/api/customer-groups/${group.id}`, token, { method: "DELETE" });
      setGroups((rows) => rows.filter((row) => row.id !== group.id));
      setNotice("Cari grubu silindi.");
      changed();
      return true;
    } catch (e) {
      setFormError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const definition = useCustomerGroupDefinitionScreen({
    active: true,
    groups,
    loading,
    busy,
    error: formError,
    setError: setFormError,
    save,
    remove,
    toolsSlot,
    toolsSlotRef: setToolsSlot,
    onRefresh: () => void load(),
  });
  // Yeni and Sil (the open form adds Kaydet), as in the approved mockup; Yenile stays on the list's toolbar.
  const commands: PageCommands = { ...definition.commands };

  return (
    <main className="customer-groups-page list-v2">
      <PageCommandsSlot commands={commands} />
      <ListPageHeader
        title="Cari Grupları"
        description="Cari kartlarını sınıflandırmak için firma gruplarını yönetin."
        count={loading && !groups.length ? null : groups.length}
        countLabel="grup"
      />
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status" aria-live="polite">
          {notice}
          <button type="button" aria-label="Bildirimi kapat" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {definition.view}
    </main>
  );
}
