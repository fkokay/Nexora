// Metindeki alanlar (alt proje 5a, Karar 2): danışman `{Cari kodu}` yazar, kayıtta `{{liste.seciliSatir.kod}}` durur.
import type { ActiveCatalog } from "../catalogClient";
import { findList, listDataSourceCode, tableName, type ModelDefinition } from "./listPanelModel";

/** `binding` süslü parantezsizdir: `liste.seciliSatir.kod`. */
export type FieldToken = { label: string; binding: string };

const STORED = /\{\{([^{}]*)\}\}/g;
const SHOWN = /\{([^{}]*)\}/g;
const UNKNOWN = "?";

/** Liste kalıbında listenin veri kaynağının kolonları, katalog etiketleriyle. Liste ya da katalog yoksa boş. */
export function fieldTokens(def: ModelDefinition, catalog: ActiveCatalog | null): FieldToken[] {
  if (!catalog) return [];
  const table = def.components.find((component) => component.type === "dataTable" && component.props.slot === "list");
  if (!table || !findList(def, table.id)) return [];
  const code = listDataSourceCode(def, table.id);
  const source = catalog.dataSources.find((candidate) => candidate.code === code);
  if (!source) return [];
  const seen = new Set<string>();
  const tokens: FieldToken[] = [];
  for (const column of source.columns) {
    const label = column.label.trim() || column.code;
    if (seen.has(label) || label === UNKNOWN) continue;
    seen.add(label);
    tokens.push({ label, binding: `${tableName(table)}.seciliSatir.${column.code}` });
  }
  return tokens;
}

const unknownBindings = (stored: string, tokens: FieldToken[]): string[] => {
  const known = new Set(tokens.map((token) => token.binding));
  return [...stored.matchAll(STORED)].filter((match) => !known.has(match[1].trim())).map((match) => match[0]);
};

/** Tanınan `{{b}}` → `{Etiket}`; tanınmayan `{{…}}` → `{?}` (unknown: true). */
export function toConsultantText(stored: string, tokens: FieldToken[]): { text: string; unknown: boolean } {
  let unknown = false;
  const text = stored.replace(STORED, (_all, inner: string) => {
    const token = tokens.find((candidate) => candidate.binding === inner.trim());
    if (token) return `{${token.label}}`;
    unknown = true;
    return `{${UNKNOWN}}`;
  });
  return { text, unknown };
}

/** `{Etiket}` → `{{b}}`. Metin değişmediyse `previous` aynen döner; değiştiyse n'inci `{?}` n'inci tanınmayan bağlamaya döner. */
export function fromConsultantText(text: string, tokens: FieldToken[], previous: string): string {
  if (text === toConsultantText(previous, tokens).text) return previous;
  const lost = unknownBindings(previous, tokens);
  let next = 0;
  return text.replace(SHOWN, (all, inner: string) => {
    if (inner === UNKNOWN) return next < lost.length ? lost[next++] : all;
    const token = tokens.find((candidate) => candidate.label === inner);
    return token ? `{{${token.binding}}}` : all;
  });
}
