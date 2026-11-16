import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { loadMonaco } from "../../../WorkspaceCodeEditor";

export type SqlSchemaTable = { schema: string; name: string; columns: { name: string; dataType: string }[] };

type MonacoApi = Awaited<ReturnType<typeof loadMonaco>>;

// Tamamlama sağlayıcısı "sql" diline bir kez kaydedilir ve yalnız sayfa sorgusu modellerinde çalışır;
// çalışma alanındaki .sql dosyaları etkilenmez. Şema, son yüklenen kiracı şemasıdır.
const MODEL_PREFIX = "/page-queries/";
let schemaTables: SqlSchemaTable[] = [];
let providerRegistered = false;

const quoteIfNeeded = (name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `[${name.replace(/]/g, "]]")}]`;
const unquote = (name: string) => name.replace(/^\[|\]$/g, "").replace(/]]/g, "]");
const findTable = (name: string) => {
  const bare = unquote(name).toLowerCase();
  return schemaTables.find((table) => table.name.toLowerCase() === bare || `${table.schema}.${table.name}`.toLowerCase() === bare);
};

/** SQL metnindeki "FROM Tablo [AS] takma" / "JOIN Tablo takma" eşlemelerini çıkarır. */
function tableAliases(sql: string) {
  const aliases = new Map<string, SqlSchemaTable>();
  const pattern = /\b(?:from|join)\s+((?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)(?:\.(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*))?)(?:\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;
  const keywords = new Set(["where", "join", "inner", "left", "right", "full", "cross", "on", "group", "order", "having", "union", "outer", "with"]);
  for (const match of sql.matchAll(pattern)) {
    const parts = match[1].split(".");
    const table = findTable(parts.length > 1 ? `${unquote(parts[0])}.${unquote(parts[1])}` : parts[0]);
    if (!table) continue;
    aliases.set(table.name.toLowerCase(), table);
    const alias = match[2];
    if (alias && !keywords.has(alias.toLowerCase())) aliases.set(alias.toLowerCase(), table);
  }
  return aliases;
}

function registerCompletion(monaco: MonacoApi) {
  if (providerRegistered) return;
  providerRegistered = true;
  monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: ["."],
    provideCompletionItems: (model, position) => {
      if (!model.uri.path.startsWith(MODEL_PREFIX)) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const before = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: word.startColumn });
      const aliases = tableAliases(model.getValue());
      const qualifier = /(\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)\.$/.exec(before)?.[1];
      const columnItems = (table: SqlSchemaTable) => table.columns.map((column) => ({
        label: column.name, kind: monaco.languages.CompletionItemKind.Field, detail: `${table.name} · ${column.dataType}`,
        insertText: quoteIfNeeded(column.name), range,
      }));
      if (qualifier) {
        const table = aliases.get(unquote(qualifier).toLowerCase()) ?? findTable(qualifier);
        if (table) return { suggestions: columnItems(table) };
        // "dbo." gibi şema öneki: o şemadaki tablolar.
        const inSchema = schemaTables.filter((item) => item.schema.toLowerCase() === unquote(qualifier).toLowerCase());
        return { suggestions: inSchema.map((item) => ({ label: item.name, kind: monaco.languages.CompletionItemKind.Class, detail: "Tablo", insertText: quoteIfNeeded(item.name), range })) };
      }
      const tables = schemaTables.map((table) => ({
        label: table.name, kind: monaco.languages.CompletionItemKind.Class, detail: `${table.schema} · tablo`,
        insertText: quoteIfNeeded(table.name), range, sortText: `1${table.name}`,
      }));
      const used = [...new Set(aliases.values())];
      const columns = used.flatMap(columnItems).map((item) => ({ ...item, sortText: `0${item.label}` }));
      return { suggestions: [...columns, ...tables] };
    },
  });
}

type Props = { queryId: string; value: string; readOnly: boolean; schema: SqlSchemaTable[]; onChange: (value: string) => void };

/** Sayfa sorgusu için Monaco SQL editörü; kiracı şemasından tablo/sütun tamamlar. */
export default function SqlQueryEditor({ queryId, value, readOnly, schema, onChange }: Props) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  schemaTables = schema;
  useEffect(() => {
    let cancelled = false;
    loadMonaco().then((monaco) => { registerCompletion(monaco); if (!cancelled) setReady(true); },
      (error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, []);
  if (loadError) return <div className="pd-query-editor is-error" role="alert">SQL editörü yüklenemedi: {loadError}</div>;
  if (!ready) return <div className="pd-query-editor is-loading" role="status">SQL editörü yükleniyor…</div>;
  return <div className="pd-query-editor">
    <Editor
      path={`file://${MODEL_PREFIX}${queryId}.sql`}
      language="sql"
      value={value}
      theme="vs"
      onChange={(next) => onChange(next ?? "")}
      options={{
        readOnly, domReadOnly: readOnly, readOnlyMessage: { value: "Sorguları yalnız tenant yöneticisi düzenleyebilir." },
        ariaLabel: "Sorgu SQL metni", minimap: { enabled: false }, lineNumbers: "on", lineNumbersMinChars: 2, folding: false,
        wordWrap: "on", scrollBeyondLastLine: false, automaticLayout: true, fontSize: 12.5, tabSize: 2, renderLineHighlight: "none",
        overviewRulerLanes: 0, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }, fixedOverflowWidgets: true,
      }}
    />
  </div>;
}
