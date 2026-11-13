import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { authenticatedFetch } from "./authApi";
import "./operational-definitions.css";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import { OperationalDefinitionsHeader } from "./operational-definitions/components/OperationalDefinitionsHeader";
import { DefinitionForm } from "./operational-definitions/components/DefinitionForm";
import {
  DefinitionGrid,
  defaultDefinitionFields,
  type DefinitionScreenField,
} from "./operational-definitions/components/DefinitionGrid";
import { OperationalDefinitionLinks } from "./operational-definitions/components/OperationalDefinitionLinks";
import type {
  Definition,
  DefinitionKind,
} from "./operational-definitions/types";

async function request<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(path, token, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      title?: string;
    } | null;
    throw new Error(
      body?.error ?? body?.title ?? "İstek başarısız (" + response.status + ")",
    );
  }
  return response.json() as Promise<T>;
}

export default function OperationalDefinitionsPage({
  token,
  locale,
  onNavigate,
}: {
  token: string;
  locale: "tr" | "en";
  onNavigate: (page: string) => void;
}) {
  const en = locale === "en";
  const tx = (tr: string, english: string) => (en ? english : tr);
  const [rows, setRows] = useState<Definition[]>([]);
  const [kind, setKind] = useState<DefinitionKind>("Workplace");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Definition | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [screenFields, setScreenFields] = useState<DefinitionScreenField[]>(
    defaultDefinitionFields,
  );

  useEffect(() => {
    let active = true;
    request<{ fields: DefinitionScreenField[] }>(
      token,
      "/api/screen-views/operational-definitions/active",
    )
      .then((view) => {
        if (active && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  async function load() {
    setLoading(true);
    try {
      setRows(
        await request<Definition[]>(token, "/api/definitions/workplaces/"),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  function clearForm() {
    setEditing(null);
    setCode("");
    setName("");
    setKind("Workplace");
  }
  function openCreate() {
    clearForm();
    setFormOpen(true);
  }
  function closeForm() {
    clearForm();
    setFormOpen(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = {
        code,
        name,
        kind,
        ...(editing ? { rowVersion: editing.rowVersion } : {}),
      };
      await request(
        token,
        editing
          ? "/api/definitions/workplaces/" + editing.id
          : "/api/definitions/workplaces/",
        { method: editing ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      closeForm();
      setNotice(tx("Tanım kaydedildi.", "Definition saved."));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(row: Definition) {
    setBusy(true);
    setError("");
    try {
      await request(
        token,
        "/api/definitions/workplaces/" + row.id + "/status",
        { method: "POST", body: JSON.stringify({ isActive: !row.isActive }) },
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const kindName = (value: DefinitionKind) =>
    value === "Workplace"
      ? tx("İş yeri", "Workplace")
      : value === "Branch"
        ? tx("Şube", "Branch")
        : tx("Fabrika", "Factory");
  const searchTerm = search.trim().toLocaleLowerCase(en ? "en-US" : "tr-TR");
  // Rows matching the search text; the chip counts are taken from these.
  const searchedRows = rows.filter((row) =>
    `${row.code} ${row.name} ${kindName(row.kind)}`
      .toLocaleLowerCase(en ? "en-US" : "tr-TR")
      .includes(searchTerm),
  );
  const filteredRows = searchedRows.filter(
    (row) =>
      (!kindFilter || row.kind === kindFilter) &&
      (!statusFilter || (statusFilter === "active") === row.isActive),
  );
  const kindCount = (value: DefinitionKind) =>
    searchedRows.filter((row) => row.kind === value).length;

  return (
    <div className="operational-definitions-page list-v2">
      <OperationalDefinitionsHeader
        tx={tx}
        total={loading && rows.length === 0 ? null : rows.length}
        onCreate={openCreate}
      />
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="notice">
          {notice}
          <button type="button" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel={tx("Tanımlarda ara", "Search definitions")}
        searchPlaceholder={tx("Kod veya ad ara", "Search code or name")}
        onRefresh={() => void load()}
        refreshLabel={tx("Yenile", "Refresh")}
        toolsSlotRef={setToolsSlot}
      >
        <ListChipGroup
          label={tx("Tür", "Type")}
          value={kindFilter}
          onChange={setKindFilter}
          options={[
            { value: "", label: tx("Tümü", "All"), count: searchedRows.length },
            { value: "Workplace", label: tx("İş yeri", "Workplace"), count: kindCount("Workplace") },
            { value: "Branch", label: tx("Şube", "Branch"), count: kindCount("Branch") },
            { value: "Factory", label: tx("Fabrika", "Factory"), count: kindCount("Factory") },
          ]}
        />
        <ListChipGroup
          label={tx("Durum", "Status")}
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          options={[
            {
              value: "active",
              label: tx("Etkin", "Active"),
              count: searchedRows.filter((row) => row.isActive).length,
            },
            {
              value: "inactive",
              label: tx("Devre dışı", "Inactive"),
              count: searchedRows.filter((row) => !row.isActive).length,
            },
          ]}
        />
      </ListToolbar>
      <div className={`op-def-workspace${formOpen ? " is-form-open" : ""}`}>
        <section
          className="panel op-definitions-panel list-v2-list"
          aria-label={tx("Tanım listesi", "Definition list")}
        >
          <DefinitionGrid
            rows={filteredRows}
            loading={loading}
            busy={busy}
            tx={tx}
            kindName={kindName}
            fields={screenFields}
            toolbarContainer={toolsSlot}
            hasRecords={rows.length > 0}
            onEdit={(row) => {
              setEditing(row);
              setKind(row.kind);
              setCode(row.code);
              setName(row.name);
              setFormOpen(true);
            }}
            onToggle={(row) => void toggle(row)}
          />
        </section>
        {formOpen && (
          <DefinitionForm
            tx={tx}
            kind={kind}
            code={code}
            name={name}
            editing={editing}
            busy={busy}
            onSubmit={save}
            onKindChange={setKind}
            onCodeChange={setCode}
            onNameChange={setName}
            onCancel={closeForm}
          />
        )}
      </div>
      <OperationalDefinitionLinks tx={tx} onNavigate={onNavigate} />
    </div>
  );
}
