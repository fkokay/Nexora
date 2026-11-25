import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { designerInternals, designerPersistence } from "./CustomPagesPage";
import { pagedTableProblem, pagingSourceProblem } from "./page-designer/paging";
import QueriesPanel, { QueryDetailFields, catalogReference, querySourceLabel, type PageQuery } from "./page-designer/QueriesPanel";
import { CATALOG_ADMIN_ONLY, CATALOG_FAILED, CATALOG_OPERATION_MISSING, componentOperation, catalogCodeMissing, catalogItemDisabledReason, catalogItemsFor, catalogPickPatch, loadCatalogRefs, sourceModePatch, type CatalogRefs } from "./page-designer/catalogItems";
import { applyQueryPatch } from "./page-designer/queryDraft";
import type { ErpOperation } from "./page-designer/erpOperations";

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

  it("querySourceLabel_names_catalog_operation_and_sql_queries", () => {
    expect(querySourceLabel({ ...base, dataSource: "cariler" })).toBe("Katalog");
    expect(querySourceLabel({ ...base, kind: "delete", runOn: "manual", action: "cariSil" })).toBe("Katalog");
    expect(querySourceLabel({ ...base, operation: "cari.listele" })).toBe("ERP işlemi");
    expect(querySourceLabel({ ...base, sql: "SELECT 1 AS A" })).toBe("SQL");
  });
});

const refs: CatalogRefs = {
  status: "ready",
  dataSources: [
    { code: "cariler", label: "Cari listesi", source: "sql", parameters: [{ name: "ad", type: "text" }] },
    { code: "stoklar", label: "Stok listesi", source: "erpOperation", erpOperation: "stok.listele", parameters: [] },
  ],
  actions: [
    { code: "cariGuncelle", label: "Cari güncelle", source: "sql", kind: "update", parameters: [{ name: "id", type: "guid" }] },
    { code: "cariSil", label: "Cari sil", source: "sql", kind: "delete", parameters: [] },
  ],
};
const operation = { name: "stok.listele", label: "Stok listele", module: "Stok", kind: "read", pageKind: "read", method: "GET", route: "/x", result: { shape: "list", rowsPath: null, columns: [] },
  parameters: [{ name: "kategori", in: "query", type: "text", required: false }, { name: "kodlar", in: "body", type: "list", required: false }] } as unknown as ErpOperation;
const detail = (query: PageQuery, isAdmin: boolean, catalogRefs: CatalogRefs = refs) => renderToString(createElement(QueryDetailFields, {
  query, queries: [query], editable: true, schema: [], suggestions: [], takenNames: [], onUpdate: () => undefined, catalog: { status: "ready", operations: [operation] }, catalogRefs, isAdmin,
}));
const memory = () => new Map();

describe("katalog seçici", () => {
  it("catalog_segment_lists_items_matching_query_kind", () => {
    const read = detail({ ...base, dataSource: "" }, true);
    expect(read).toContain("Cari listesi");
    expect(read).toContain("Stok listesi");
    expect(read).not.toContain("Cari güncelle");
    const write = detail({ ...base, kind: "update", runOn: "manual", action: "" }, true);
    expect(write).toContain("Cari güncelle");
    expect(write).not.toContain("Cari sil");
    expect(write).not.toContain("Cari listesi");
    expect(catalogItemsFor(refs, "delete").map((item) => item.code)).toEqual(["cariSil"]);
    expect(read).toContain("Katalog");
    expect(read).not.toContain("SQL sorgusu</button><button type=\"button\" aria-pressed=\"true\"");
  });

  it("picking_item_sets_reference_and_parameters_and_clears_sql", () => {
    const sqlQuery: PageQuery = { ...base, sql: "SELECT 1 AS A", parameters: [{ name: "eski", binding: "{{x}}", type: "text" }] };
    const picked = applyQueryPatch(sqlQuery, sourceModePatch("catalog", sqlQuery), memory(), () => "");
    const sql = applyQueryPatch(picked, catalogPickPatch(refs.dataSources[0], false, [operation]), memory(), () => "");
    expect(sql.dataSource).toBe("cariler");
    expect(sql.parameters).toEqual([{ name: "ad", binding: "", type: "text" }]);
    expect(sql).not.toHaveProperty("sql");
    expect(sql).not.toHaveProperty("operation");
    expect(sql).not.toHaveProperty("action");
    expect(wire([sql])[0]).not.toHaveProperty("sql");
    // ERP işlemine dayanan öğe: parametreler işlem kataloğundan gelir.
    const erp = applyQueryPatch(sql, catalogPickPatch(refs.dataSources[1], false, [operation]), memory(), () => "");
    expect(erp.dataSource).toBe("stoklar");
    expect(erp.parameters).toEqual([{ name: "kategori", binding: "", type: "text" }, { name: "kodlar", binding: "", type: "list" }]);
    // Eylem: tür ve elle çalıştırma öğeden gelir.
    const writeBase: PageQuery = { ...base, kind: "insert", runOn: "manual", sql: "INSERT x" };
    const action = applyQueryPatch(writeBase, catalogPickPatch(refs.actions[0], true, []), memory(), () => "");
    expect(action).toMatchObject({ action: "cariGuncelle", kind: "update", runOn: "manual", parameters: [{ name: "id", binding: "", type: "guid" }] });
    expect(action).not.toHaveProperty("dataSource");
    expect(action).not.toHaveProperty("sql");
  });

  it("non_admin_sees_sql_backed_items_disabled", () => {
    const html = detail({ ...base, dataSource: "" }, false);
    const sqlButton = html.match(/<button[^>]*>(?:(?!<\/button>).)*Cari listesi.*?<\/button>/s)![0];
    const erpButton = html.match(/<button[^>]*>(?:(?!<\/button>).)*Stok listesi.*?<\/button>/s)![0];
    expect(sqlButton).toContain("disabled");
    expect(erpButton).not.toContain("disabled");
    expect(html).toContain(CATALOG_ADMIN_ONLY);
    // Eylemler (yazma) TenantAdmin olmayan için tümüyle pasif.
    expect(detail({ ...base, kind: "update", runOn: "manual", action: "" }, false).match(/<button[^>]*>(?:(?!<\/button>).)*Cari güncelle.*?<\/button>/s)![0]).toContain("disabled");
    // Yönetici için pasif öğe yok.
    expect(detail({ ...base, dataSource: "" }, true)).not.toContain(CATALOG_ADMIN_ONLY);
  });

  it("missing_code_shows_warning_and_keeps_query", () => {
    const query: PageQuery = { ...base, dataSource: "silinmis" };
    expect(detail(query, true)).toContain("Katalogda bulunamadı: silinmis");
    expect(detail({ ...base, dataSource: "cariler" }, true)).not.toContain("Katalogda bulunamadı");
    expect(catalogCodeMissing(refs, query)).toBe(true);
    expect(catalogCodeMissing({ status: "loading" }, query)).toBe(false);
    // Başka alan değişse de başvuru korunur.
    expect(applyQueryPatch(query, { name: "yeni" }, memory(), () => "").dataSource).toBe("silinmis");
  });

  it("switching_back_to_sql_removes_reference", () => {
    const catalogQuery: PageQuery = { ...base, dataSource: "cariler", parameters: [{ name: "ad", binding: "{{a}}", type: "text" }] };
    const sql = applyQueryPatch(catalogQuery, sourceModePatch("sql", catalogQuery), memory(), () => "");
    expect(catalogReference(sql)).toBeUndefined();
    expect(sql).not.toHaveProperty("dataSource");
    expect(sql).not.toHaveProperty("action");
    expect(sql.sql).toBe("SELECT 1 AS Deger");
    const erp = applyQueryPatch(catalogQuery, sourceModePatch("erp", catalogQuery), memory(), () => "");
    expect(catalogReference(erp)).toBeUndefined();
    expect(erp.operation).toBe("");
  });

  it("operation_backed_item_without_erp_operation_is_disabled_and_refused", () => {
    const item = refs.dataSources[1];
    expect(catalogItemDisabledReason(item, "read", true, [])).toBe(CATALOG_OPERATION_MISSING);
    expect(catalogItemDisabledReason(item, "read", true, [operation])).toBeNull();
    expect(catalogPickPatch(item, false, [])).toEqual({});
    const html = renderToString(createElement(QueryDetailFields, { query: { ...base, dataSource: "" }, queries: [], editable: true, schema: [], suggestions: [], takenNames: [], onUpdate: () => undefined, catalog: { status: "ready", operations: [] }, catalogRefs: refs, isAdmin: true }));
    expect(html.match(/<button[^>]*>(?:(?!<\/button>).)*Stok listesi.*?<\/button>/s)![0]).toContain("disabled");
    expect(html).toContain(CATALOG_OPERATION_MISSING);
  });

  it("write_query_with_action_of_other_kind_is_flagged_missing", () => {
    expect(catalogCodeMissing(refs, { ...base, kind: "delete", action: "cariGuncelle" })).toBe(true);
    expect(catalogCodeMissing(refs, { ...base, kind: "update", action: "cariGuncelle" })).toBe(false);
  });

  it("loadCatalogRefs_never_exposes_invalid_items", async () => {
    const loaded = await loadCatalogRefs((async () => ({ dataSources: [{ code: "a", label: "A", source: "sql", parameters: [] }], actions: [], invalidItems: [{ code: "bozuk" }] })) as never);
    expect(JSON.stringify(loaded)).not.toContain("bozuk");
    await expect(loadCatalogRefs((async () => ({})) as never)).rejects.toThrow();
  });
});

// Sunucu kuralı (TenantCustomPageSchema.ComponentOperation): ERP işlemine dayanan katalog başvurusu sayfalama kurallarına
// öğenin işlemiyle girer. SQL'e dayanan başvuru sayfalanamaz; katalog yüklenmemişse saklanan sayfalama silinmez.
describe("katalog başvurusu sunucu sayfalı listede", () => {
  const pagedOperation = { ...operation, parameters: [{ name: "page", in: "query", type: "int", required: false }, { name: "pageSize", in: "query", type: "int", required: false }] } as unknown as ErpOperation;
  const erp = { status: "ready" as const, operations: [pagedOperation] };
  const pagingRefs: CatalogRefs = { ...refs, status: "ready", dataSources: [...(refs.status === "ready" ? refs.dataSources : []), { code: "sqlKaynak", label: "SQL kaynak", source: "sql", parameters: [] }] };
  const pagedQuery = (dataSource: string): PageQuery => ({ ...base, dataSource,
    parameters: [{ name: "page", binding: "{{stoklar.sayfa}}", type: "int" }, { name: "pageSize", binding: "{{stoklar.sayfaBoyutu}}", type: "int" }] });
  const table = { id: "t1", name: "stoklar", type: "dataTable", props: { query: "q1", paging: "server", pageParam: "page", pageSizeParam: "pageSize", pageSize: 25 } };
  const definition = (query: PageQuery) => ({ schemaVersion: 2, queries: [query], components: [structuredClone(table)] }) as never;
  const reconciledProps = (query: PageQuery, catalogRefs?: CatalogRefs) =>
    (designerInternals.reconcileDefinition(definition(query), { catalog: erp, catalogRefs, queryEditable: true } as never).components[0] as { props: Record<string, unknown> }).props;

  it("operation_backed_reference_keeps_paging_through_reconcile", () => {
    expect(componentOperation(pagedQuery("stoklar"), pagingRefs)).toEqual({ kind: "operation", name: "stok.listele" });
    expect(reconciledProps(pagedQuery("stoklar"), pagingRefs)).toMatchObject({ paging: "server", pageSize: 25 });
  });

  it("sql_backed_reference_is_stripped_and_blocked", () => {
    expect(componentOperation(pagedQuery("sqlKaynak"), pagingRefs)).toEqual({ kind: "sql" });
    expect(reconciledProps(pagedQuery("sqlKaynak"), pagingRefs)).not.toHaveProperty("paging");
    expect(pagingSourceProblem(pagedQuery("sqlKaynak"), pagingRefs, erp)).toBe("Liste bir ERP işlemi sorgusuna bağlı olmalıdır.");
    expect(pagedTableProblem(table, pagedQuery("sqlKaynak"), pagingRefs)).toBe("Sunucu sayfalı liste adlı ve ERP işlemine bağlı olmalıdır: t1");
  });

  it("refs_not_loaded_never_strip_paging_from_reference", () => {
    for (const catalogRefs of [undefined, { status: "loading" } as CatalogRefs, { status: "failed" } as CatalogRefs]) {
      expect(componentOperation(pagedQuery("sqlKaynak"), catalogRefs)).toEqual({ kind: "unknown" });
      expect(reconciledProps(pagedQuery("sqlKaynak"), catalogRefs)).toMatchObject({ paging: "server", pageSize: 25 });
      expect(pagedTableProblem(table, pagedQuery("sqlKaynak"), catalogRefs)).toBeNull();
    }
    // Katalogdan kalkmış kod da bilinmiyor sayılır: sayfalama silinmez, kaydı sunucu karara bağlar.
    expect(reconciledProps(pagedQuery("silinmis"), pagingRefs)).toMatchObject({ paging: "server" });
    expect(pagingSourceProblem(pagedQuery("stoklar"), { status: "loading" }, erp)).toBe("Katalog yükleniyor.");
    expect(pagingSourceProblem(pagedQuery("stoklar"), { status: "failed" }, erp)).toBe(CATALOG_FAILED);
  });

  it("paging_can_be_enabled_for_operation_backed_reference", () => {
    expect(pagingSourceProblem(pagedQuery("stoklar"), pagingRefs, erp)).toBeNull();
    expect(pagedTableProblem(table, pagedQuery("stoklar"), pagingRefs)).toBeNull();
    // İşlemi sayfalamayı desteklemeyen öğe açılamaz.
    expect(pagingSourceProblem(pagedQuery("stoklar"), pagingRefs, { status: "ready", operations: [operation] })).toBe("Bu ERP işlemi sayfalamayı desteklemiyor (page / pageSize parametresi yok).");
  });

  it("renamed_paged_table_rebinds_operation_backed_reference", () => {
    const query = { ...pagedQuery("stoklar"), parameters: [{ name: "page", binding: "", type: "int" as const }, { name: "pageSize", binding: "", type: "int" as const }] };
    const next = designerInternals.reconcileDefinition(definition(query), { catalog: erp, catalogRefs: pagingRefs, queryEditable: true } as never);
    expect(next.queries[0].parameters.map((parameter) => parameter.binding)).toEqual(["{{stoklar.sayfa}}", "{{stoklar.sayfaBoyutu}}"]);
  });

  it("plain_queries_behave_as_before", () => {
    expect(componentOperation({ ...base, operation: "stok.listele" }, undefined)).toEqual({ kind: "operation", name: "stok.listele" });
    expect(componentOperation({ ...base, sql: "SELECT 1 AS A" }, pagingRefs)).toEqual({ kind: "sql" });
    expect(reconciledProps({ ...base, sql: "SELECT 1 AS A" }, undefined)).not.toHaveProperty("paging");
    expect(pagingSourceProblem({ ...base, sql: "SELECT 1 AS A" }, undefined, erp)).toBe("Liste bir ERP işlemi sorgusuna bağlı olmalıdır.");
  });
});
