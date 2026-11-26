import { describe, expect, it } from "vitest";
import type { CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition } from "../pageTemplates";
import { addItem } from "./freeModel";
import {
  chooseTableSource, DEFAULT_FREE_TABLE_PAGE_SIZE, FREE_TABLE_SOURCE_NEEDS_INPUT, freeTableSourceUsable, setTableEmptyText, setTablePageSize, tableOf,
} from "./freeTableModel";
import { chooseIndicatorSource } from "./indicatorPanelModel";
import type { ModelDefinition } from "./listPanelModel";

const column = (code: string, label = code, type = "text") => ({ code, label, type, key: false, longText: false, required: false, maxLength: null });
const source = (code: string, columns: number, extra: Partial<CatalogDataSource> = {}): CatalogDataSource => ({
  code, label: `${code} kaynağı`, source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: Array.from({ length: columns }, (_, index) => column(`k${index + 1}`, `Kolon ${index + 1}`)), ...extra,
});
const siparisler = source("siparisler", 7);
const cariler = source("cariler", 3);
const ekstre = source("ekstre", 2, { parameters: [{ name: "cari", type: "guid" }] });

function withTable(): { def: ModelDefinition; id: string } {
  const result = addItem(newFreeTemplateDefinition() as unknown as ModelDefinition, "table", { blockId: "bolum" });
  if ("reason" in result) throw new Error(result.reason);
  return { def: result.def, id: result.itemId };
}
const tableProps = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id)!.props;
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}

describe("serbest gövdenin Listesi", () => {
  it("chooseTableSource rejects parameterised source and writes read query with first six columns", () => {
    const { def, id } = withTable();
    expect(freeTableSourceUsable(ekstre)).toEqual({ usable: false, reason: FREE_TABLE_SOURCE_NEEDS_INPUT });
    expect(freeTableSourceUsable({ ...siparisler, blockedReason: "İşlem kapalı." } as CatalogDataSource)).toEqual({ usable: false, reason: "İşlem kapalı." });
    expect(chooseTableSource(def, id, ekstre)).toBe(def);

    const next = chooseTableSource(def, id, siparisler);
    expect(next.queries).toHaveLength(1);
    const query = next.queries[0];
    expect(query).toMatchObject({ kind: "read", dataSource: "siparisler", parameters: [], runOn: "load" });
    const props = tableProps(next, id);
    expect(props.slot).toBe("item");
    expect(props.query).toBe(query.id);
    expect(props.title).toBe("siparisler kaynağı");
    expect(props.pageSize).toBe(DEFAULT_FREE_TABLE_PAGE_SIZE);
    expect(props.columns).toEqual(["k1", "k2", "k3", "k4", "k5", "k6"]);
    expect(props.columnLabels).toEqual(["k1=Kolon 1", "k2=Kolon 2", "k3=Kolon 3", "k4=Kolon 4", "k5=Kolon 5", "k6=Kolon 6"]);
    expect(tableOf(next, id)).toEqual({ source: "siparisler", title: "siparisler kaynağı", columns: ["k1", "k2", "k3", "k4", "k5", "k6"],
      labels: { k1: "Kolon 1", k2: "Kolon 2", k3: "Kolon 3", k4: "Kolon 4", k5: "Kolon 5", k6: "Kolon 6" }, pageSize: 10, emptyText: "" });
    // Aynı kaynak yeniden seçilince tanım (kolon seçimi) değişmez.
    expect(chooseTableSource(next, id, siparisler)).toBe(next);
  });

  it("chooseTableSource removes orphaned previous query", () => {
    const { def, id } = withTable();
    const first = chooseTableSource(def, id, siparisler);
    const second = chooseTableSource(first, id, cariler);
    expect(second.queries.map((query) => query.dataSource)).toEqual(["cariler"]);
    expect(tableProps(second, id)).toMatchObject({ title: "cariler kaynağı", columns: ["k1", "k2", "k3"] });
    expect(tableOf(second, id)?.source).toBe("cariler");
  });

  it("shares a read query with an indicator and keeps it when still in use", () => {
    const base = withTable();
    const indicator = addItem(base.def, "indicator", { blockId: "bolum" });
    if ("reason" in indicator) throw new Error(indicator.reason);
    const withIndicator = chooseIndicatorSource(indicator.def, indicator.itemId, siparisler);
    expect(withIndicator.queries).toHaveLength(1);
    const shared = chooseTableSource(withIndicator, base.id, siparisler);
    expect(shared.queries).toHaveLength(1);
    expect(tableProps(shared, base.id).query).toBe(shared.queries[0].id);
    const switched = chooseTableSource(shared, base.id, cariler);
    expect(switched.queries.map((query) => query.dataSource)).toEqual(["siparisler", "cariler"]);
  });

  it("page size, empty text and tableOf", () => {
    const { def, id } = withTable();
    expect(tableOf(def, id)).toEqual({ source: null, title: "", columns: [], labels: {}, pageSize: DEFAULT_FREE_TABLE_PAGE_SIZE, emptyText: "" });
    expect(tableOf(def, "yok")).toBeNull();
    const bound = chooseTableSource(def, id, siparisler);
    expect(tableProps(setTablePageSize(bound, id, 50), id).pageSize).toBe(50);
    expect(setTablePageSize(bound, id, 30 as 10)).toBe(bound);
    // Eski kayıttaki 100 olduğu gibi okunur.
    const hundred = { ...bound, components: bound.components.map((c) => c.id === id ? { ...c, props: { ...c.props, pageSize: 100 } } : c) };
    expect(tableOf(hundred, id)?.pageSize).toBe(100);
    const empty = setTableEmptyText(bound, id, "  Bugün sipariş yok.  ");
    expect(tableProps(empty, id).emptyText).toBe("Bugün sipariş yok.");
    expect(tableProps(setTableEmptyText(empty, id, "   "), id).emptyText).toBeUndefined();
    expect(setTableEmptyText(bound, "yok", "x")).toBe(bound);
  });

  it("functions never mutate input", () => {
    const { def, id } = withTable();
    const frozen = deepFreeze(JSON.parse(JSON.stringify(chooseTableSource(def, id, siparisler))) as ModelDefinition);
    const snapshot = JSON.stringify(frozen);
    chooseTableSource(frozen, id, cariler);
    setTablePageSize(frozen, id, 25);
    setTableEmptyText(frozen, id, "Boş");
    tableOf(frozen, id);
    expect(JSON.stringify(frozen)).toBe(snapshot);
  });
});
