import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { designerPersistence } from "./CustomPagesPage";
import QueriesPanel, { catalogReference, type PageQuery } from "./page-designer/QueriesPanel";

const base = { id: "q1", name: "cariler", kind: "read" as const, runOn: "load" as const, parameters: [] };
const wire = (queries: PageQuery[]) => designerPersistence.wireDefinition({ schemaVersion: 2, queries, components: [] }, { status: "loading" }).queries;

describe("katalog başvurulu sorgular", () => {
  it("wireDefinition_keeps_data_source_reference", () => {
    const [saved] = wire([{ ...base, dataSource: "cariler" }]);
    expect(saved).toEqual({ ...base, dataSource: "cariler" });
    expect(saved).not.toHaveProperty("sql");
    expect(saved).not.toHaveProperty("operation");
    const [action] = wire([{ ...base, kind: "update", runOn: "manual", action: "cariGuncelle" }]);
    expect(action).toMatchObject({ action: "cariGuncelle" });
    expect(action).not.toHaveProperty("sql");
  });

  it("save_validation_accepts_catalog_reference_query", () => {
    // Kayıt doğrulaması yalnız operation anahtarı taşıyan sorguları denetler; başvurulu sorgu bu yola girmez ve atılmaz.
    const loaded = designerPersistence.normalizeDefinition({ queries: [{ ...base, dataSource: "cariler" }] });
    expect(loaded.queries).toHaveLength(1);
    expect(catalogReference(loaded.queries[0])).toBe("cariler");
    expect(typeof loaded.queries[0].operation).not.toBe("string");
  });

  it("sorgu listesi salt okunur Katalog satırını gösterir", () => {
    const html = renderToString(createElement(QueriesPanel, {
      queries: [{ ...base, dataSource: "cariler" }], selectedId: null, onSelect: () => undefined, editable: true, readOnlyReason: null, schema: [], suggestions: [],
      previews: {}, previewBlockedReason: null, takenNames: () => [], onAdd: () => undefined, onUpdate: () => undefined, onRemove: () => undefined,
      onPreview: async () => null, catalog: { status: "loading" }, onAddSourceQuery: () => undefined,
    }));
    expect(html).toContain("Katalog: ");
    expect(html).toContain("cariler");
  });
});
