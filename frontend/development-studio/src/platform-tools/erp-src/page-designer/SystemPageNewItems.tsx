import { Plus, Sparkles } from "lucide-react";

/** `GET /api/system-pages/{screenKey}/new-items` yanıtındaki bir öğe. */
export type StandardNewItem = {
  key: string;
  kind: "component" | "query";
  label: string;
  since: number;
  definition: Record<string, unknown>;
  requires: string[];
};
export type StandardNewItems = { standardVersion: number; baseVersion: number; items: StandardNewItem[] };

/** Öğe anahtarındaki kimlik: `component:depoListesi` → `depoListesi`. */
export const standardItemId = (item: Pick<StandardNewItem, "key">) => item.key.slice(item.key.indexOf(":") + 1);

type Node = { id: string; type?: string; name?: string; props?: Record<string, unknown>; children?: unknown; parameters?: unknown };
type Definition = { components: Node[]; queries: Node[] };

/**
 * Eklenecek öğe ve tasarımda henüz olmayan bağımlılıkları (`requires`, geçişli). Bağımlılık yanıttaki öğeler arasında
 * yoksa (firma onu daha önce silmiş, standart yeniden önermiyor) `missing` içinde döner; bu durumda öğe eklenmez.
 */
export function standardItemBundle(item: StandardNewItem, items: StandardNewItem[], present: (key: string) => boolean) {
  const byKey = new Map(items.map((entry) => [entry.key, entry]));
  const bundle: StandardNewItem[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const visit = (entry: StandardNewItem) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    bundle.push(entry);
    for (const key of Array.isArray(entry.requires) ? entry.requires : []) {
      if (seen.has(key) || present(key)) continue;
      const required = byKey.get(key);
      if (required) visit(required); else { seen.add(key); missing.push(key); }
    }
  };
  visit(item);
  return { bundle, missing };
}

const childNodes = (value: unknown): Node[] => Array.isArray(value) ? value.filter((child): child is Node => !!child && typeof child === "object" && typeof (child as Node).id === "string") : [];
const walk = (nodes: Node[], visit: (node: Node) => void) => { for (const node of nodes) { visit(node); walk(childNodes(node.children), visit); } };

// Görünen metin ve sütun kodu taşıyan özellikler: içlerindeki değerler kimlik değildir, yeniden adlandırılmaz.
const TEXT_KEYS = new Set(["text", "title", "label", "description", "placeholder", "defaultValue", "value", "columns", "columnFormats", "totals", "toneMap", "fields", "staticOptions", "facetCounts", "footerMeta", "css", "javascript", "confirmText", "successMessage", "errorMessage", "relatedTitle", "optionLabelColumn", "optionValueColumn", "optionDescriptionColumn"]);
const CONDITION_KEYS = new Set(["visibleWhen", "disabledWhen"]);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Standart öğelerini tanımın sonuna ekler. Tasarımda kullanılan bir kimlik yeni kimlikle, kullanılan bir ad (bileşen ve
 * sorgu adları tek, büyük/küçük harf duyarsız bir kümedir) sayı ekiyle değiştirilir; eklenen öğelerin kendi aralarındaki
 * başvuruları (sorgu, giriş, tablo kimlikleri; `{{ad.…}}` bağlamaları ve koşullar) yeni değerlere çevrilir.
 * Dönen `ids`, her öğe anahtarının tanımdaki gerçek kimliğidir.
 */
export function addStandardItems<D extends Definition>(definition: D, bundle: StandardNewItem[], componentId: (type: string) => string, queryId: () => string): { definition: D; ids: Record<string, string> } {
  const takenIds = new Set<string>();
  const takenNames = new Set<string>();
  walk(definition.components, (node) => { takenIds.add(node.id); if (node.name) takenNames.add(node.name.toLowerCase()); });
  for (const query of definition.queries) { takenIds.add(query.id); if (query.name) takenNames.add(query.name.toLowerCase()); }

  const cloned = bundle.map((item) => ({ item, node: structuredClone(item.definition) as unknown as Node }));
  const idMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  const claim = (node: Node, isQuery: boolean) => {
    if (takenIds.has(node.id)) {
      let next = isQuery ? queryId() : componentId(node.type ?? "component");
      while (takenIds.has(next)) next = isQuery ? queryId() : componentId(node.type ?? "component");
      idMap.set(node.id, next);
      node.id = next;
    }
    takenIds.add(node.id);
    if (typeof node.name === "string" && node.name) {
      if (takenNames.has(node.name.toLowerCase())) {
        const base = node.name.replace(/\d+$/, "").slice(0, 60) || "oge";
        let suffix = 2;
        while (takenNames.has(`${base}${suffix}`.toLowerCase())) suffix++;
        nameMap.set(node.name, `${base}${suffix}`);
        node.name = `${base}${suffix}`;
      }
      takenNames.add(node.name.toLowerCase());
    }
  };
  for (const { item, node } of cloned) {
    if (item.kind === "query") claim(node, true);
    else walk([node], (child) => claim(child, false));
  }

  const renameNames = (text: string, condition: boolean) => {
    let next = text;
    for (const [from, to] of nameMap) {
      next = next.replace(new RegExp(`(\\{\\{\\s*)${escapeRegex(from)}(?=[.\\s}])`, "g"), `$1${to}`);
      if (condition) next = next.replace(new RegExp(`(^|[^A-Za-z0-9_.])${escapeRegex(from)}(?=\\.|$|[^A-Za-z0-9_])`, "g"), `$1${to}`);
    }
    return next;
  };
  const renameId = (value: string) => idMap.get(value) ?? value;
  const rewriteValue = (key: string, value: unknown): unknown => {
    if (typeof value === "string") {
      const named = renameNames(value, CONDITION_KEYS.has(key));
      return TEXT_KEYS.has(key) || CONDITION_KEYS.has(key) ? named : renameId(named);
    }
    if (Array.isArray(value)) {
      if (key === "tabs") return value.map((entry) => {
        if (typeof entry !== "string" || !entry.includes("=")) return entry;
        const at = entry.indexOf("=");
        const ids = entry.slice(at + 1);
        return `${entry.slice(0, at)}=${ids ? ids.split(",").map(renameId).join(",") : ""}`;
      });
      return value.map((entry) => typeof entry === "string" ? (TEXT_KEYS.has(key) ? renameNames(entry, false) : renameId(renameNames(entry, false))) : entry);
    }
    return value;
  };
  const rewriteNode = (node: Node) => {
    if (node.props && typeof node.props === "object") node.props = Object.fromEntries(Object.entries(node.props).map(([key, value]) => [key, rewriteValue(key, value)]));
    if (Array.isArray(node.parameters)) node.parameters = node.parameters.map((parameter) => parameter && typeof parameter === "object" && typeof (parameter as { binding?: unknown }).binding === "string"
      ? { ...parameter, binding: renameNames((parameter as { binding: string }).binding, false) } : parameter);
  };
  if (idMap.size > 0 || nameMap.size > 0) for (const { node } of cloned) walk([node], rewriteNode);

  const components = cloned.filter(({ item }) => item.kind === "component").map(({ node }) => node);
  const queries = cloned.filter(({ item }) => item.kind === "query").map(({ node }) => node);
  return {
    definition: { ...definition, components: [...definition.components, ...components], queries: [...definition.queries, ...queries] },
    ids: Object.fromEntries(cloned.map(({ item, node }) => [item.key, node.id])),
  };
}

type Props = {
  items: StandardNewItem[];
  disabled: boolean;
  busy: boolean;
  onAdd: (item: StandardNewItem) => void;
  onIgnoreAll: () => void;
};

/** Tasarımcıdaki "Yeni" şeridi: standart tanımda firma tasarımında olmayan öğeler. */
export default function SystemPageNewItems({ items, disabled, busy, onAdd, onIgnoreAll }: Props) {
  if (items.length === 0) return null;
  return <section className="pd-new-items" aria-label="Standart tasarımdaki yeni öğeler">
    <div className="pd-new-items-head">
      <Sparkles size={15}/>
      <b>Nexora standart tasarımında {items.length} yeni öğe var.</b>
      <button type="button" className="pd-button small" onClick={onIgnoreAll} disabled={disabled || busy}>Tümünü yok say</button>
    </div>
    <ul>
      {items.map((item) => <li key={item.key}>
        <span className="pd-new-items-label">{item.label}</span>
        <span className="pd-new-items-kind">{item.kind === "component" ? "Bileşen" : "Sorgu"}</span>
        <button type="button" className="pd-button small" onClick={() => onAdd(item)} disabled={disabled || busy}><Plus size={13}/>Ekle</button>
      </li>)}
    </ul>
  </section>;
}
