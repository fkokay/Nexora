import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { api } from "../../api";
import { loadErpOperations, type ErpOperation } from "../../platform-tools/erp-src/page-designer/erpOperations";
import type { CatalogEntry, CatalogFile, CatalogKind } from "./catalogFiles";
import { DataSourceForm } from "./DataSourceForm";
import { ActionForm } from "./ActionForm";
import "./catalog-workbench.css";

export type CatalogWorkbenchProps = {
  root: string;
  entries: CatalogEntry[];
  errors: string[];
  canEdit: boolean;
  isTenantAdmin: boolean;
  token: string;
  writeFiles: (files: CatalogFile[]) => Promise<void>;
  onPublish: () => void;
  /** Commit edilmemiş dosya yolları; ilgili öğede turuncu nokta gösterilir. */
  changedPaths?: string[];
};

type Selection = { kind: CatalogKind; code: string | null } | null;

const labelOf = (entry: CatalogEntry) => (typeof entry.json.label === "string" && entry.json.label) || entry.code;

export function CatalogWorkbench({ root, entries, errors, canEdit, isTenantAdmin, token, writeFiles, onPublish, changedPaths = [] }: CatalogWorkbenchProps) {
  const [selection, setSelection] = useState<Selection>(() => (entries[0] ? { kind: entries[0].kind, code: entries[0].code } : null));
  const [operations, setOperations] = useState<ErpOperation[] | null>([]);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    let active = true;
    loadErpOperations(<T,>(url: string, init?: RequestInit) => api<T>(url, token, init))
      .then(list => { if (active) setOperations(list); })
      .catch(() => { if (active) setOperations(null); });
    return () => { active = false; };
  }, [token]);

  const changed = new Set(changedPaths);
  const prefix = `${root.replace(/\/+$/, "")}/`;
  const filePaths = entries.flatMap(e => [e.sqlPath, e.jsonPath]).filter((p): p is string => !!p)
    .map(p => p.slice(prefix.length)).sort();
  const selected = selection?.code ? entries.find(e => e.kind === selection.kind && e.code === selection.code) ?? null : null;
  const existingCodes = entries.map(e => e.code);
  const select = (next: Selection) => { setSelection(next); setFormKey(k => k + 1); };

  const group = (kind: CatalogKind, title: string, newLabel: string, icon: string) => (
    <section className="sp-cw-group">
      <h4>
        {title}
        {canEdit && <button type="button" className="sp-cw-new" aria-label={newLabel} onClick={() => select({ kind, code: null })}>+ Yeni</button>}
      </h4>
      {entries.filter(e => e.kind === kind).map(entry => (
        <button
          type="button" key={entry.code}
          className={`sp-cw-item${selection?.kind === kind && selection.code === entry.code ? " is-active" : ""}`}
          onClick={() => select({ kind, code: entry.code })}
        >
          <span aria-hidden="true">{icon}</span> {labelOf(entry)}
          {(changed.has(entry.jsonPath) || (entry.sqlPath && changed.has(entry.sqlPath))) && (
            <span className="sp-cw-changed" title="Commit edilmemiş değişiklik" />
          )}
        </button>
      ))}
    </section>
  );

  // Yeni öğe kaydedilince, dosyalar yeniden okunduğunda o öğe seçilir.
  const [pending, setPending] = useState<{ kind: CatalogKind; code: string } | null>(null);
  useEffect(() => {
    if (pending && entries.some(e => e.kind === pending.kind && e.code === pending.code)) {
      setPending(null);
      select(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, pending]);
  const onSaved = (code: string) => { if (selection && !selection.code) setPending({ kind: selection.kind, code }); };

  const formProps = { root, existingCodes, canEdit, operations, writeFiles, onSaved };

  return (
    <div className="sp-cw">
      <div className="sp-cw-top">
        <span className="sp-cw-root">{root}</span>
        <span className="sp-cw-spacer" />
        <button type="button" className="ns-btn ns-btn-primary" onClick={onPublish}>
          <Rocket size={14} /> Sürüm yayınla
        </button>
      </div>
      <div className="sp-cw-wrap">
        <nav className="sp-cw-tree" aria-label="Yapı taşları">
          {group("dataSource", "Veri kaynakları", "Yeni veri kaynağı", "▤")}
          {group("action", "Eylemler", "Yeni eylem", "⏵")}
          <section className="sp-cw-group">
            <h4>Dosyalar</h4>
            <ul className="sp-cw-files">{filePaths.map(path => <li key={path}>{path}</li>)}</ul>
            <p className="sp-cw-hint">Ağaçtaki her öğe Git'teki dosyalardır. Form ile de, doğrudan dosyadan da düzenlenebilir.</p>
          </section>
        </nav>
        <div className="sp-cw-editor-pane">
          {errors.length > 0 && (
            <div className="alert"><b>Okunamayan dosyalar</b><ul>{errors.map(item => <li key={item}>{item}</li>)}</ul></div>
          )}
          {!selection && <p className="sp-cw-hint">Soldan bir yapı taşı seçin ya da "+ Yeni" ile ekleyin.</p>}
          {selection?.kind === "dataSource" && (
            <DataSourceForm key={formKey} {...formProps} entry={selected} isTenantAdmin={isTenantAdmin} token={token} />
          )}
          {selection?.kind === "action" && <ActionForm key={formKey} {...formProps} entry={selected} />}
        </div>
      </div>
    </div>
  );
}
