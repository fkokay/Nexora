import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { authenticatedFetch } from "./authApi";
import "./operational-definitions.css";
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
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Definition | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
      clearForm();
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
  const filteredRows = rows.filter((row) => {
    const term = search.trim().toLocaleLowerCase(en ? "en-US" : "tr-TR");
    return (
      (!kindFilter || row.kind === kindFilter) &&
      `${row.code} ${row.name} ${kindName(row.kind)}`
        .toLocaleLowerCase(en ? "en-US" : "tr-TR")
        .includes(term)
    );
  });

  return (
    <div className="operational-definitions-page">
      <OperationalDefinitionsHeader
        tx={tx}
        loading={loading}
        onRefresh={() => void load()}
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
      <section className="reference-summary-grid" aria-label={tx("Tanım özeti", "Definition summary")}>
        <div className="reference-summary-card violet"><div><small>{tx("Toplam tanım", "Total definitions")}</small><strong>{rows.length}</strong></div></div>
        <div className="reference-summary-card green"><div><small>{tx("Etkin", "Active")}</small><strong>{rows.filter((row) => row.isActive).length}</strong></div></div>
        <div className="reference-summary-card red"><div><small>{tx("Devre dışı", "Inactive")}</small><strong>{rows.filter((row) => !row.isActive).length}</strong></div></div>
      </section>
      <section className="panel op-definitions-filter-card" aria-label={tx("Tanım filtreleri", "Definition filters")}>
        <div className="panel-heading"><div><h2>{tx("Filtreler", "Filters")}</h2><p>{tx("Tanımları tür, kod veya ada göre daraltın.", "Narrow definitions by type, code or name.")}</p></div></div>
        <div className="customer-toolbar">
          <input aria-label={tx("Tanımlarda ara", "Search definitions")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx("Kod veya ad ara", "Search code or name")} />
          <label>{tx("Tür", "Type")}<select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="">{tx("Tüm türler", "All types")}</option><option value="Workplace">{tx("İş yeri", "Workplace")}</option><option value="Branch">{tx("Şube", "Branch")}</option><option value="Factory">{tx("Fabrika", "Factory")}</option></select></label>
        </div>
      </section>
      <section className="panel op-definitions-panel">
        <div className="panel-heading">
          <div>
            <h2>{tx("Organizasyon tanımları", "Organization definitions")}</h2>
            <p>
              {tx(
                "İş yeri, şube ve fabrikalar; personel iş yeri atamaları ve çalışma takvimlerinde kullanılabilir.",
                "Workplaces, branches and factories can be used in employee assignments and work calendars.",
              )}
            </p>
          </div>
        </div>
        <div className="panel-heading op-definitions-grid-heading"><div><h2>{tx("Tanım listesi", "Definition list")}</h2><p>{loading ? tx("Kayıtlar yükleniyor…", "Loading records…") : `${filteredRows.length} / ${rows.length} ${tx("kayıt", "records")}`}</p></div></div>
        <DefinitionGrid
          rows={filteredRows}
          loading={loading}
          busy={busy}
          tx={tx}
          kindName={kindName}
          fields={screenFields}
          onEdit={(row) => {
            setEditing(row);
            setKind(row.kind);
            setCode(row.code);
            setName(row.name);
          }}
          onToggle={(row) => void toggle(row)}
        />
        <div className="panel-heading op-definitions-form-heading"><div><h2>{editing ? tx("Tanımı düzenle", "Edit definition") : tx("Tanım ekle", "Add definition")}</h2><p>{tx("İş yeri, şube veya fabrika tanımı oluşturun.", "Create a workplace, branch or factory definition.")}</p></div></div>
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
          onCancel={clearForm}
        />
      </section>
      <OperationalDefinitionLinks tx={tx} onNavigate={onNavigate} />
    </div>
  );
}
