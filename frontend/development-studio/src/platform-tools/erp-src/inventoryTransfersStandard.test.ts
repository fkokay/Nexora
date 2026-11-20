import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";
import { COLUMN_STATIC_OPTION, columnEntries, gridColumnText, parseGridColumn } from "./page-designer/gridColumns";
import { conditionProblem } from "./page-designer/conditions";
import standardJson from "../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-transfers.json?raw";

// Depolar arası transferler standardı (src/Hosts/AIERP.Api/SystemPages/Standards/inventory-transfers.json): seçim hücreli kalem
// tablosu, otomatik istek kimliği, seçenek koşulu, bağımlı temizleme ve açıklamalı gerekçe istemi tasarımcıda tanınmalı,
// uzlaştırmadan özellik kaybetmeden geçmeli ve tasarımcının kayıt denetimlerine takılmamalıdır.
const standard = JSON.parse(standardJson);
type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
const { reconcileDefinition, managedKeys, contentFields, palette } = designerInternals;
const components = standard.definition.components as Component[];
const queries = standard.definition.queries as { id: string; name: string; kind: string }[];
const reconcile = (list: Component[], queryEditable = false) => reconcileDefinition(
  { schemaVersion: 2, queries, components: structuredClone(list) } as never, { catalog: { status: "loading" }, queryEditable });
const byIdOf = (definition: { components: unknown[] }) => new Map((definition.components as Component[]).map((component) => [component.id, component]));
const pageNames = [...queries.map((query) => query.name), ...components.map((component) => component.name).filter((name): name is string => !!name)];
const grid = components.find((component) => component.id === "kalemler")!;

describe("Depolar arası transferler standardı tasarımcıda", () => {
  it("bütün türler ve özellikler tasarımcıda tanınır (ham metin alanı yok)", () => {
    for (const component of components) {
      expect(contentFields, component.type).toHaveProperty(component.type);
      expect(palette.some((item) => item.type === component.type), component.type).toBe(true);
      for (const key of Object.keys(component.props)) expect(managedKeys.has(key), `${component.id}.${key}`).toBe(true);
    }
  });

  for (const queryEditable of [false, true]) it(`uzlaştırma özellik silmez ve değiştirmez (sorgu düzenleme: ${queryEditable})`, () => {
    const reconciled = reconcile(components, queryEditable);
    const after = byIdOf(reconciled);
    for (const component of components) {
      const next = after.get(component.id);
      expect(next, component.id).toBeDefined();
      for (const [key, value] of Object.entries(component.props)) expect(next!.props[key], `${component.id}.${key}`).toEqual(value);
    }
    expect(reconciled.queries).toEqual(standard.definition.queries);
  });

  it("seçim sütunları kayıpsız ayrıştırılır ve aynı metne yazılır; sorguları sayfadaki okuma sorgularıdır", () => {
    const readIds = new Set(queries.filter((query) => query.kind === "read").map((query) => query.id));
    const raw = grid.props.gridColumns as string[];
    const parsed = raw.map((text) => parseGridColumn(text));
    for (const [index, result] of parsed.entries()) {
      expect(result.ok, raw[index]).toBe(true);
      if (!result.ok) continue;
      expect(gridColumnText(result.column)).toBe(raw[index]);
      if (result.column.lookup) expect(readIds.has(result.column.lookup.query), raw[index]).toBe(true);
    }
    const lookups = parsed.flatMap((result) => result.ok && result.column.inputType === "lookup" ? [result.column.code] : []);
    expect(lookups).toEqual(["stockItemId", "unitCode", "fromStorageLocationId", "toStorageLocationId"]);
    expect(parsed[0].ok && parsed[0].column.lookup).toEqual({ query: "stoklar", valueColumn: "id", labelColumn: "code", descriptionColumn: "name" });
    // Sütun ayarları yalnız seçim sütunlarına; koşullar satir kökünü kullanır, sabit seçenekler değer=Etiket biçimindedir.
    for (const entry of columnEntries(grid.props.columnOptionsWhen)) {
      expect(lookups, entry.code).toContain(entry.code);
      expect(conditionProblem("columnOptionsWhen", entry.rest, [...pageNames, "satir"]), entry.code).toBeNull();
    }
    expect(columnEntries(grid.props.columnStaticOptions)).toEqual([{ code: "unitCode", rest: "=Ana birim" }]);
    for (const entry of columnEntries(grid.props.columnStaticOptions)) expect(COLUMN_STATIC_OPTION.test(entry.rest)).toBe(true);
  });

  it("girişlerin seçenek koşulları ve bağımlı temizleme hedefleri geçerlidir", () => {
    const inputs = components.filter((component) => component.type === "input");
    for (const input of inputs) expect(conditionProblem("optionsWhen", input.props.optionsWhen, [...pageNames, "satir"]), input.id).toBeNull();
    const gridCodes = (grid.props.gridColumns as string[]).map((text) => text.split("|")[0]);
    for (const input of inputs) for (const target of (input.props.clearsOnChange as string[] | undefined) ?? []) {
      const [gridName, code] = target.split(".");
      expect(gridName, `${input.id} → ${target}`).toBe(grid.name);
      expect(gridCodes, `${input.id} → ${target}`).toContain(code);
    }
    expect(components.find((component) => component.id === "istekKimligi")!.props).toMatchObject({ hidden: true, autoId: true });
  });

  it("silinen tablo sütunu bağımlı temizlemeden, seçim türünden çıkan sütun sütun ayarlarından kalkar", () => {
    const withoutFrom = components.map((component) => component.id !== "kalemler" ? component : { ...component, props: { ...component.props,
      gridColumns: (component.props.gridColumns as string[]).filter((text) => !text.startsWith("fromStorageLocationId|")) } });
    const byId = byIdOf(reconcile(withoutFrom));
    expect(byId.get("kaynakDepo")!.props.clearsOnChange).toBeUndefined();
    expect(byId.get("hedefDepo")!.props.clearsOnChange).toEqual(["kalemler.toStorageLocationId"]);
    expect(byId.get("kalemler")!.props.columnOptionsWhen).toEqual(["stockItemId=satir.isActive == true", "unitCode=satir.isActive == true", "toStorageLocationId=satir.isActive == true"]);
    const unitAsText = components.map((component) => component.id !== "kalemler" ? component : { ...component, props: { ...component.props,
      gridColumns: (component.props.gridColumns as string[]).map((text) => text.startsWith("unitCode|") ? "unitCode|Birim|text|upperCase" : text) } });
    const grid2 = byIdOf(reconcile(unitAsText)).get("kalemler")!;
    expect(grid2.props.columnStaticOptions).toBeUndefined();
    expect(grid2.props.columnOptionsWhen).not.toContain("unitCode=satir.isActive == true");
  });

  it("istem açıklaması ve sınırı gerekçe olmadan kalmaz; varyant kipinde en az satır ve sütun ayarları kalkar", () => {
    const noPrompt = components.map((component) => component.id !== "iptalDugmesi" ? component : { ...component, props: { ...component.props, promptLabel: undefined } });
    const button = byIdOf(reconcile(noPrompt.map((component) => ({ ...component, props: Object.fromEntries(Object.entries(component.props).filter(([, value]) => value !== undefined)) })))).get("iptalDugmesi")!;
    expect(button.props.promptText).toBeUndefined();
    expect(button.props.promptMaxLength).toBeUndefined();
    expect(button.props.promptRequired).toBeUndefined();
    const matrix = components.map((component) => component.id !== "kalemler" ? component : { ...component, props: { ...component.props, gridMode: "matrix" } });
    const after = byIdOf(reconcile(matrix)).get("kalemler")!;
    for (const key of ["minRows", "columnOptionsWhen", "columnStaticOptions"]) expect(after.props[key], key).toBeUndefined();
  });
});
