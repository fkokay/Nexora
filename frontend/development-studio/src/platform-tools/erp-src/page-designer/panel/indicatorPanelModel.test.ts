import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogDataSource } from "../catalogClient";
import { newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import { missingCatalogCodes, withOperationParameters, type ModelComponent, type ModelDefinition } from "./listPanelModel";
import {
  INDICATOR_SOURCE_NEEDS_INPUT, chooseIndicatorSource, indicatorOf, indicatorPlaces, indicatorSourceUsable, setIndicatorCompare, setIndicatorKind,
  countColumnOf, setIndicatorPlace, setIndicatorSize, setIndicatorTotal, setIndicatorValue, withIndicatorTitle,
} from "./indicatorPanelModel";
import { parseCondition } from "../conditions";

type P = ModelComponent["props"];
const without = (props: P, ...keys: string[]): P => Object.fromEntries(Object.entries(props).filter(([key]) => !keys.includes(key)));

const col = (code: string, label: string, type = "text") => ({ code, label, type, key: false, longText: false, required: false, maxLength: null });
const ozet: CatalogDataSource = {
  code: "cariOzet", label: "Cari bakiye özeti", source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: [col("alacak", "Toplam alacak", "money"), col("gecenAy", "Geçen ay alacak", "money"), col("adet", "Adet", "number"), col("durum", "Durum")],
};
const siparis: CatalogDataSource = { ...ozet, code: "siparis", label: "Açık siparişler" };
const metric = (extra: Record<string, string> = {}): ModelComponent => ({ id: "g1", type: "metric", name: "g1", props: { slot: "indicators", title: "Gösterge", ...extra } });
const defWith = (...components: ModelComponent[]) => {
  const base = newListTemplateDefinition() as unknown as ModelDefinition;
  return { ...base, components: [...base.components, ...components] };
};
const comp = (def: ModelDefinition, id = "g1") => def.components.find((c) => c.id === id)!;

describe("indicatorSourceUsable", () => {
  it("rejects sources with any parameter", () => {
    expect(indicatorSourceUsable(ozet)).toEqual({ usable: true });
    expect(indicatorSourceUsable({ ...ozet, parameters: [{ name: "q", type: "text" }] })).toEqual({ usable: false, reason: INDICATOR_SOURCE_NEEDS_INPUT });
    expect(INDICATOR_SOURCE_NEEDS_INPUT).toBe("Bu kaynak ek bilgi istiyor; göstergede kullanılamaz.");
  });
  it("takes the blocking reason of operation-backed sources", () => {
    const blocked = withOperationParameters({ ...ozet, source: "erpOperation" as const, erpOperation: "x" }, undefined, false, "failed");
    const result = indicatorSourceUsable(blocked);
    expect(result.usable).toBe(false);
    expect((result as { reason: string }).reason).not.toBe(INDICATOR_SOURCE_NEEDS_INPUT);
  });
});

describe("chooseIndicatorSource legacy values", () => {
  const badge = (props: Record<string, string>): ModelComponent => ({ id: "g1", type: "badge", name: "g1", props: { slot: "above", ...props } });
  const progress = (props: Record<string, string>): ModelComponent => ({ id: "g1", type: "progress", name: "g1", props: { slot: "above", ...props } });
  it("chooseIndicatorSource keeps plain legacy badge text", () => {
    const next = chooseIndicatorSource(defWith(badge({ text: "Açık" })), "g1", ozet);
    expect(comp(next).props.text).toBe("Açık");
    const prog = chooseIndicatorSource(defWith(progress({ value: "42" })), "g1", ozet);
    expect(comp(prog).props.value).toBe("42");
  });
  it("writes the default binding when value is empty or a binding", () => {
    expect(String(comp(chooseIndicatorSource(defWith(badge({ text: "" })), "g1", ozet)).props.text)).toMatch(/^\{\{/);
    expect(String(comp(chooseIndicatorSource(defWith(badge({})), "g1", ozet)).props.text)).toMatch(/^\{\{/);
  });
  it("returns def unchanged for a non-metric source without columns", () => {
    const d = defWith(badge({ text: "" }));
    expect(chooseIndicatorSource(d, "g1", { ...ozet, columns: [] })).toBe(d);
  });
  it("removes a plain legacy value of a metric when the count query is written", () => {
    const next = chooseIndicatorSource(defWith(metric({ value: "17" })), "g1", { ...ozet, columns: [col("durum", "Durum")] });
    expect(comp(next).props.value).toBeUndefined();
    expect(comp(next).props.query).toBe("kaynak");
  });
});

describe("chooseIndicatorSource", () => {
  it("adds one load query and reuses it for a second indicator", () => {
    const first = chooseIndicatorSource(defWith(metric(), { ...metric(), id: "g2", name: "g2" }), "g1", ozet);
    expect(first.queries).toEqual([{ id: "kaynak", name: "kaynak", kind: "read", dataSource: "cariOzet", parameters: [], runOn: "load" }]);
    expect(comp(first).props.value).toBe("{{kaynak.rows[0].alacak}}");
    const second = chooseIndicatorSource(first, "g2", ozet);
    expect(second.queries).toHaveLength(1);
    expect(comp(second, "g2").props.value).toBe("{{kaynak.rows[0].alacak}}");
    expect(chooseIndicatorSource(second, "g2", ozet)).toBe(second);
  });
  it("removes orphaned previous query but keeps a shared one", () => {
    const one = chooseIndicatorSource(defWith(metric()), "g1", ozet);
    const moved = chooseIndicatorSource(one, "g1", siparis);
    expect(moved.queries.map((q) => q.dataSource)).toEqual(["siparis"]);
    const shared = chooseIndicatorSource(chooseIndicatorSource(defWith(metric(), { ...metric(), id: "g2", name: "g2" }), "g1", ozet), "g2", ozet);
    const kept = chooseIndicatorSource(shared, "g1", siparis);
    expect(kept.queries.map((q) => q.dataSource).sort()).toEqual(["cariOzet", "siparis"]);
  });
});

describe("indicator setters", () => {
  const bound = () => chooseIndicatorSource(defWith(metric()), "g1", ozet);
  it("setIndicatorValue count binds query; column writes value binding and money format", () => {
    const count = setIndicatorValue(bound(), "g1", "count", undefined, "adet");
    expect(comp(count).props.query).toBe("kaynak");
    expect(comp(count).props.countWhen).toBe("kaynak.satir.adet != null");
    expect(comp(count).props.value).toBeUndefined();
    const money = setIndicatorValue(count, "g1", "alacak", "money");
    expect(comp(money).props.value).toBe("{{kaynak.rows[0].alacak}}");
    expect(comp(money).props.format).toBe("money");
    expect(comp(money).props.query).toBeUndefined();
    expect(comp(setIndicatorValue(money, "g1", "adet", "number")).props.format).toBe("number");
    expect(comp(setIndicatorValue(money, "g1", "durum", "text")).props.format).toBe("text");
    expect(comp(setIndicatorValue(money, "g1", "durum", "date")).props.format).toBe("text");
    const back = setIndicatorValue(money, "g1", "count", undefined, "adet");
    expect(comp(back).props).toMatchObject({ query: "kaynak", countWhen: "kaynak.satir.adet != null" });
    expect(comp(back).props.value).toBeUndefined();
    expect(comp(back).props.format).toBeUndefined();
  });
  it("setIndicatorCompare writes compareValue and null removes it", () => {
    const on = setIndicatorCompare(setIndicatorValue(bound(), "g1", "alacak", "money"), "g1", "gecenAy");
    expect(comp(on).props.compareValue).toBe("{{kaynak.rows[0].gecenAy}}");
    expect(comp(setIndicatorCompare(on, "g1", null)).props.compareValue).toBeUndefined();
  });
  it("setIndicatorKind progress moves out of indicators slot", () => {
    const base = defWith(metric({ query: "x" }));
    const progress = setIndicatorKind(base, "g1", "progress");
    expect(comp(progress)).toMatchObject({ id: "g1", name: "g1", type: "progress" });
    expect(comp(progress).props).toMatchObject({ slot: "above", title: "Gösterge" });
    expect(comp(setIndicatorKind(base, "g1", "status")).type).toBe("badge");
    expect(comp(setIndicatorKind(progress, "g1", "number")).props.slot).toBe("above");
    const below = defWith({ ...metric(), props: { ...metric().props, slot: "below" } });
    expect(comp(setIndicatorKind(below, "g1", "progress")).props.slot).toBe("below");
  });
  it("setIndicatorKind carries the column binding to the right key", () => {
    const m = setIndicatorValue(bound(), "g1", "durum", "text");
    const badge = setIndicatorKind(m, "g1", "status");
    expect(comp(badge).props.text).toBe("{{kaynak.rows[0].durum}}");
    expect(comp(badge).props.value).toBeUndefined();
    expect(comp(badge).props.format).toBeUndefined();
    expect(indicatorOf(badge, "g1")).toMatchObject({ kind: "status", source: "cariOzet", column: "durum" });
    expect(comp(setIndicatorKind(badge, "g1", "progress")).props.value).toBe("{{kaynak.rows[0].durum}}");
  });
  it("indicatorOf round trips every setter", () => {
    let def = chooseIndicatorSource(defWith(metric()), "g1", ozet);
    expect(indicatorOf(def, "g1")).toEqual({ kind: "number", source: "cariOzet", column: "alacak", compareColumn: null, totalColumn: null, size: "sm" });
    expect(indicatorOf(setIndicatorValue(def, "g1", "count", undefined, "adet"), "g1").column).toBe("count");
    def = setIndicatorValue(def, "g1", "alacak", "money");
    def = setIndicatorCompare(def, "g1", "gecenAy");
    def = setIndicatorSize(def, "g1", "lg");
    expect(indicatorOf(def, "g1")).toEqual({ kind: "number", source: "cariOzet", column: "alacak", compareColumn: "gecenAy", totalColumn: null, size: "lg" });
    expect(comp(setIndicatorSize(def, "g1", "sm")).props.size).toBeUndefined();
    let progress = setIndicatorKind(def, "g1", "progress");
    progress = setIndicatorTotal(progress, "g1", "adet");
    expect(indicatorOf(progress, "g1")).toEqual({ kind: "progress", source: "cariOzet", column: "alacak", compareColumn: null, totalColumn: "adet", size: "sm" });
    expect(comp(setIndicatorTotal(progress, "g1", null)).props.progressTotal).toBeUndefined();
    expect(indicatorOf(setIndicatorKind(progress, "g1", "status"), "g1").kind).toBe("status");
  });
  it("indicatorOf returns null source for unrecognized binding", () => {
    const def = defWith(metric({ value: "{{baska.deger}}" }));
    expect(indicatorOf(def, "g1")).toMatchObject({ source: null, column: null });
    expect(indicatorOf(defWith(metric({ query: "yok" })), "g1").source).toBeNull();
  });
  it("setIndicatorPlace and indicatorPlaces", () => {
    const def = defWith(metric());
    expect(comp(setIndicatorPlace(def, "g1", "below")).props.slot).toBe("below");
    expect(indicatorPlaces(def, comp(def))).toEqual(["indicators", "above", "below"]);
    expect(indicatorPlaces(def, { ...comp(def), type: "progress" })).toEqual(["above", "below"]);
    expect(indicatorPlaces(def, { ...comp(def), type: "badge" })).toEqual(["above", "below"]);
  });
  it("missingCatalogCodes reports removed indicator source", () => {
    const def = chooseIndicatorSource(defWith(metric()), "g1", ozet);
    const catalog: ActiveCatalog = { version: "1", dataSources: [siparis], actions: [] };
    expect(missingCatalogCodes(def, catalog)).toEqual(["cariOzet"]);
  });
});

describe("count mode (final review fix 1)", () => {
  const keyed: CatalogDataSource = {
    code: "siparisler", label: "Siparişler", source: "sql", erpOperation: null, parameters: [], opens: null,
    columns: [col("durum", "Durum"), { code: "siparisNo", label: "No", type: "text", key: true, longText: false, required: false, maxLength: null }],
  };
  const textOnly: CatalogDataSource = { ...keyed, code: "notlar", columns: [col("baslik", "Başlık"), col("aciklama", "Açıklama")] };
  it("count writes query and a schema-valid countWhen on the key column", () => {
    const def = setIndicatorValue(chooseIndicatorSource(defWith(metric()), "g1", ozet), "g1", "count", undefined, "adet");
    expect(comp(def).props.query).toBe("kaynak");
    expect(comp(def).props.countWhen).toBe("kaynak.satir.adet != null");
    expect(comp(def).props.value).toBeUndefined();
    expect(comp(def).props.format).toBeUndefined();
    const parsed = parseCondition(String(comp(def).props.countWhen));
    expect(parsed.ok && parsed.roots).toEqual(["kaynak"]);
  });
  it("column path removes query, countWhen and legacy source", () => {
    const counted = chooseIndicatorSource(defWith(metric()), "g1", keyed);
    const legacy = { ...counted, components: counted.components.map((c) => c.id === "g1" ? { ...c, props: { ...c.props, source: "eski" } } : c) };
    const column = setIndicatorValue(legacy, "g1", "durum", "text");
    expect(comp(column).props.query).toBeUndefined();
    expect(comp(column).props.countWhen).toBeUndefined();
    expect(comp(column).props.source).toBeUndefined();
    expect(comp(column).props.value).toBe("{{kaynak.rows[0].durum}}");
  });
  it("catalog column types int and decimal are numeric and show as numbers", () => {
    const satis: CatalogDataSource = { ...ozet, code: "satis", columns: [col("ad", "Ad"), col("ciro", "Ciro", "decimal"), col("adet", "Adet", "int")] };
    const def = chooseIndicatorSource(defWith(metric()), "g1", satis);
    expect(comp(def).props).toMatchObject({ value: "{{kaynak.rows[0].ciro}}", format: "number" });
    expect(comp(def).props.query).toBeUndefined();
    expect(comp(setIndicatorValue(def, "g1", "adet", "int")).props.format).toBe("number");
    expect(comp(setIndicatorValue(def, "g1", "ad", "text")).props.format).toBe("text");
  });
  it("count without a count column leaves the definition unchanged", () => {
    const def = chooseIndicatorSource(defWith(metric()), "g1", ozet);
    expect(setIndicatorValue(def, "g1", "count")).toBe(def);
  });
  it("default value of a number is the first numeric column, else count", () => {
    const numeric = chooseIndicatorSource(defWith(metric()), "g1", ozet);
    expect(comp(numeric).props).toMatchObject({ value: "{{kaynak.rows[0].alacak}}", format: "money" });
    expect(comp(numeric).props.query).toBeUndefined();
    const counted = chooseIndicatorSource(defWith(metric()), "g1", keyed);
    expect(comp(counted).props).toMatchObject({ query: "kaynak", countWhen: "kaynak.satir.siparisNo != null" });
    expect(comp(chooseIndicatorSource(defWith(metric()), "g1", textOnly)).props.countWhen).toBe("kaynak.satir.baslik != null");
  });
  it("countColumnOf prefers the key column, then the first identifier-safe column", () => {
    expect(countColumnOf(keyed)).toBe("siparisNo");
    expect(countColumnOf(textOnly)).toBe("baslik");
    expect(countColumnOf({ ...textOnly, columns: [col("tutar tl", "Tutar"), col("adet", "Adet")] })).toBe("adet");
    expect(countColumnOf({ ...textOnly, columns: [{ code: "no-1", label: "No", type: "text", key: true, longText: false, required: false, maxLength: null }] })).toBeNull();
  });
  it("indicatorOf reads count mode only from the query + countWhen pair", () => {
    const counted = chooseIndicatorSource(defWith(metric()), "g1", keyed);
    expect(indicatorOf(counted, "g1")).toMatchObject({ source: "siparisler", column: "count" });
    const withProps = (props: P) => ({ ...counted, components: counted.components.map((c) => c.id === "g1" ? { ...c, props } : c) });
    expect(indicatorOf(withProps(without(comp(counted).props, "countWhen")), "g1")).toMatchObject({ source: "siparisler", column: null });
    expect(indicatorOf(withProps({ ...comp(counted).props, countWhen: "kaynak.satir.durum == \"Açık\"" }), "g1").column).toBeNull();
  });
  it("switching source in count mode rewrites countWhen and prunes the old query", () => {
    const one = chooseIndicatorSource(defWith(metric()), "g1", keyed);
    const moved = chooseIndicatorSource(one, "g1", { ...textOnly, code: "baska" });
    expect(moved.queries.map((q) => q.dataSource)).toEqual(["baska"]);
    const query = moved.queries[0];
    expect(comp(moved).props).toMatchObject({ query: query.id, countWhen: `${query.name}.satir.baslik != null` });
  });
});

describe("type switches drop keys the server rejects (final review fix 2)", () => {
  const full = (type: string, props: Record<string, string>): ModelComponent => ({ id: "g1", type, name: "g1", props: { slot: "above", title: "G", ...props } });
  it("drops metric-only behaviour keys when leaving metric", () => {
    const def = defWith(full("metric", { trendQuery: "t", filterInput: "f", filterValue: "v", descriptionFormat: "money", size: "lg", compareValue: "1", query: "x", countWhen: "x.satir.a != null" }));
    for (const kind of ["progress", "status"] as const) {
      const props = comp(setIndicatorKind(def, "g1", kind)).props;
      for (const key of ["trendQuery", "filterInput", "filterValue", "descriptionFormat", "size", "compareValue", "query", "countWhen"]) expect(props[key], `${kind} ${key}`).toBeUndefined();
    }
  });
  it("keeps toneMap only on a status badge", () => {
    const def = defWith(full("progress", { toneMap: "Açık=success" }));
    expect(comp(setIndicatorKind(def, "g1", "status")).props.toneMap).toBe("Açık=success");
    expect(comp(setIndicatorKind(def, "g1", "number")).props.toneMap).toBeUndefined();
    expect(comp(setIndicatorKind(defWith(full("badge", { toneMap: "Açık=success" })), "g1", "progress")).props.toneMap).toBeUndefined();
  });
  it("drops progressTotal and an invalid size, icon or variant for the target", () => {
    const props = comp(setIndicatorKind(defWith(full("progress", { progressTotal: "{{a}}", size: "md", icon: "yildiz", variant: "neutral" })), "g1", "number")).props;
    for (const key of ["progressTotal", "size", "icon", "variant"]) expect(props[key], key).toBeUndefined();
    expect(comp(setIndicatorKind(defWith(full("badge", { icon: "box", variant: "success" })), "g1", "number")).props).toMatchObject({ icon: "box", variant: "success" });
  });
  it("choosing a catalog source removes legacy source", () => {
    expect(comp(chooseIndicatorSource(defWith(metric({ source: "eskiKaynak" })), "g1", ozet)).props.source).toBeUndefined();
    expect(comp(chooseIndicatorSource(defWith(full("badge", { source: "eskiKaynak", text: "" })), "g1", ozet)).props.source).toBeUndefined();
  });
  it("does not mutate the input definition", () => {
    const def = defWith(full("metric", { trendQuery: "t", toneMap: "a=info" }));
    const snapshot = JSON.stringify(def);
    setIndicatorKind(def, "g1", "status");
    chooseIndicatorSource(def, "g1", ozet);
    expect(JSON.stringify(def)).toBe(snapshot);
  });
});

describe("indicatorPlaces by template (5c Karar 9)", () => {
  it("indicatorPlaces on record page are above and below only; on free page empty", () => {
    const record = { ...(newRecordTemplateDefinition() as unknown as ModelDefinition), components: [metric()] } as ModelDefinition;
    expect(indicatorPlaces(record, comp(record))).toEqual(["above", "below"]);
    expect(indicatorPlaces(record, { ...comp(record), type: "progress" })).toEqual(["above", "below"]);
    expect(comp(setIndicatorPlace(record, "g1", "indicators")).props.slot).toBe(metric().props.slot);
    expect(comp(setIndicatorPlace(record, "g1", "below")).props.slot).toBe("below");
    const free = { ...record, template: { name: "free" as const } } as ModelDefinition;
    expect(indicatorPlaces(free, comp(free))).toEqual([]);
  });
});

describe("indicator title follows the choice (mockups 03 and 09)", () => {
  const sources = [ozet, siparis];
  const step = (def: ModelDefinition, next: ModelDefinition) => withIndicatorTitle(def, next, "g1", sources);
  it("palette default and empty titles take the value label, count takes the source label", () => {
    const start = defWith(metric());
    const chosen = step(start, chooseIndicatorSource(start, "g1", ozet));
    expect(comp(chosen).props.title).toBe("Toplam alacak");
    const counted = step(chosen, setIndicatorValue(chosen, "g1", "count", undefined, "adet"));
    expect(comp(counted).props.title).toBe("Cari bakiye özeti");
    const empty = defWith(metric({ title: "" }));
    expect(comp(step(empty, chooseIndicatorSource(empty, "g1", ozet))).props.title).toBe("Toplam alacak");
  });
  it("a derived title follows later changes; a title typed by the consultant stays", () => {
    const start = defWith(metric());
    const chosen = step(start, chooseIndicatorSource(start, "g1", ozet));
    const changed = step(chosen, setIndicatorValue(chosen, "g1", "adet", "number"));
    expect(comp(changed).props.title).toBe("Adet");
    const own = defWith(metric({ title: "Alacağımız" }));
    expect(comp(step(own, chooseIndicatorSource(own, "g1", ozet))).props.title).toBe("Alacağımız");
  });
  it("progress uses the value label; status falls back to the default title", () => {
    const start = defWith(metric());
    const chosen = step(start, chooseIndicatorSource(start, "g1", ozet));
    const progress = step(chosen, setIndicatorKind(chosen, "g1", "progress"));
    expect(comp(progress).props.title).toBe("Toplam alacak");
    const status = step(progress, setIndicatorKind(progress, "g1", "status"));
    expect(comp(status).props.title).toBe("Gösterge");
  });
  it("unrelated edits (size, place, hide on mobile, visibility) never rename an indicator", () => {
    // Kaynağı seçilmiş, başlığı hâlâ paletin varsayılanı olan (eski) gösterge.
    const old = { ...chooseIndicatorSource(defWith(metric()), "g1", ozet) };
    const legacy = { ...old, components: old.components.map((c) => c.id === "g1" ? { ...c, props: { ...c.props, title: "Gösterge" } } : c) } as ModelDefinition;
    const patch = (def: ModelDefinition, extra: Record<string, string | boolean>) =>
      ({ ...def, components: def.components.map((c) => c.id === "g1" ? { ...c, props: { ...c.props, ...extra } } : c) }) as ModelDefinition;
    for (const next of [setIndicatorSize(legacy, "g1", "lg"), setIndicatorPlace(legacy, "g1", "above"), patch(legacy, { hideOnMobile: true }),
      patch(legacy, { visibleWhen: "kullanici.rol == 'TenantAdmin'" })]) {
      expect(next).not.toBe(legacy);
      expect(step(legacy, next)).toBe(next);
      expect(comp(step(legacy, next)).props.title).toBe("Gösterge");
    }
    // Seçim değişince başlık yine izler.
    expect(comp(step(legacy, setIndicatorValue(legacy, "g1", "adet", "number"))).props.title).toBe("Adet");
  });

  it("does not change the input and returns it when nothing changes", () => {
    const start = Object.freeze(defWith(metric({ title: "Alacağımız" }))) as ModelDefinition;
    const next = chooseIndicatorSource(start, "g1", ozet);
    expect(step(start, next)).toBe(next);
  });
});
