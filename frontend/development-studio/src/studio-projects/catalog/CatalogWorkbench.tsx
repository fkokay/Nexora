import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { api } from "../../api";
import { loadErpOperations, type ErpOperation } from "../../platform-tools/erp-src/page-designer/erpOperations";
import type { CatalogEntry, CatalogKind } from "./catalogFiles";
import { confirmDiscardCatalogEdits, type WriteCatalogFiles } from "./catalogFormModel";
import { DataSourceForm } from "./DataSourceForm";
import { ActionForm } from "./ActionForm";
import "./catalog-workbench.css";

export type CatalogWorkbenchProps = {
  root: string;
  entries: CatalogEntry[];
  errors: string[];
  canEdit: boolean;
  /** Firma yöneticisi ya da Studio yazılımcısı: önizleme ve sürüm yayını (sunucu da aynı kuralı uygular). */
  canDevelop: boolean;
  token: string;
  writeFiles: WriteCatalogFiles;
  onPublish: () => void;
  /** Commit edilmemiş dosya yolları; ilgili öğede turuncu nokta gösterilir. */
  changedPaths?: string[];
  /** Dosya yolu → sha256; formlar açıldıkları andaki sha'yı kayıtta beklenen sha olarak gönderir. */
  fileShas?: Record<string, string>;
  /** Dosyalar her yeniden okunduğunda değişir; açık form güncel içerikle yeniden kurulur. */
  version?: number;
  /** Açık formun kaydedilmemiş değişiklik durumu; yeniden okuma (formu yeniden kurar) öncesi sormak için. */
  onDirtyChange?: (dirty: boolean) => void;
};

type Selection = { kind: CatalogKind; code: string | null } | null;

const labelOf = (entry: CatalogEntry) => (typeof entry.json.label === "string" && entry.json.label) || entry.code;

export function CatalogWorkbench({ root, entries, errors, canEdit, canDevelop, token, writeFiles, onPublish, changedPaths = [], fileShas = {}, version = 0, onDirtyChange }: CatalogWorkbenchProps) {
  const [selection, setSelection] = useState<Selection>(() => (entries[0] ? { kind: entries[0].kind, code: entries[0].code } : null));
  const [operations, setOperations] = useState<ErpOperation[] | null>([]);
  const [formKey, setFormKey] = useState(0);
  const [dirty, setDirty] = useState(false);

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
  // Başka öğeye geçmek de formu yeniden kurar: kaydedilmemiş değişiklik varsa önce sorulur.
  const select = async (next: Selection) => {
    if (!(await confirmDiscardCatalogEdits(dirty))) return;
    setSelection(next); setFormKey(k => k + 1);
  };
  const reportDirty = (value: boolean) => { setDirty(value); onDirtyChange?.(value); };
  // Yayın penceresi açılmadan dosyalar yeniden okunur ve form yeniden kurulur: önce kaydedin ya da vazgeçin.
  const publish = async () => { if (await confirmDiscardCatalogEdits(dirty)) onPublish(); };

  const group = (kind: CatalogKind, title: string, newLabel: string, icon: string) => (
    <section className="sp-cw-group">
      <h4>
        {title}
        {canEdit && <button type="button" className="sp-cw-new" aria-label={newLabel} onClick={() => void select({ kind, code: null })}>+ Yeni</button>}
      </h4>
      {entries.filter(e => e.kind === kind).map(entry => (
        <button
          type="button" key={entry.code}
          className={`sp-cw-item${selection?.kind === kind && selection.code === entry.code ? " is-active" : ""}`}
          onClick={() => void select({ kind, code: entry.code })}
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
      // formKey artırılmaz: form yeniden kurulmaz, "Kaydedildi" bildirimi kalır ve kod alanı kilitlenir.
      setSelection(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, pending]);
  // Seçili öğe yeniden okunan dosyalarda yoksa form kapatılır (eski içerikle "yeni" öğeye dönmez).
  useEffect(() => {
    if (selection?.code && !pending && !entries.some(e => e.kind === selection.kind && e.code === selection.code)) setSelection(null);
  }, [entries, selection, pending]);
  const onSaved = (code: string) => { if (selection && !selection.code) setPending({ kind: selection.kind, code }); };

  const formProps = { root, existingCodes, canEdit, operations, writeFiles, onSaved, fileShas, onDirtyChange: reportDirty };
  const formId = `${formKey}-${version}`;

  return (
    <div className="sp-cw">
      <div className="sp-cw-top">
        <span className="sp-cw-root">{root}</span>
        <span className="sp-cw-spacer" />
        <button type="button" className="ns-btn ns-btn-primary" onClick={() => void publish()}>
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
            <DataSourceForm key={formId} {...formProps} entry={selected} canDevelop={canDevelop} token={token} />
          )}
          {selection?.kind === "action" && <ActionForm key={formId} {...formProps} entry={selected} />}
        </div>
      </div>
    </div>
  );
}
