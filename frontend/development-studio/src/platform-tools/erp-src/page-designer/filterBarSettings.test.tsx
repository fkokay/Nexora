import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterBarFields } from "./FilterBarFields";
import {
  filterBarParams, filterBarProblem, filterableParams, keptFilterBindings, formatFilterEntry, isSearchableColumn, paramForColumn, parseFilterEntries, setFilter, toggleSearchColumn,
  unboundFilterParams, withFilterBindings, withoutFilterBindings, withoutStaleParams,
} from "./filterBarSettings";
import type { PageQuery } from "./QueriesPanel";

// Stok Kartları listesinin sorgusu (src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json, sorgu "bakiye").
const bakiye: PageQuery = {
  id: "bakiye", name: "bakiye", kind: "read", runOn: "load", operation: "stok.bakiye.sayfa",
  parameters: [
    { name: "warehouseId", binding: "{{depoSecimi.value}}", type: "guid" }, { name: "q", binding: "{{aramaKutusu.value}}", type: "text" },
    { name: "page", binding: "{{liste.sayfa}}", type: "int" }, { name: "pageSize", binding: "{{liste.sayfaBoyutu}}", type: "int" },
  ],
};
const opParams = [
  { name: "warehouseId", in: "query", type: "guid" }, { name: "q", in: "query", type: "text" }, { name: "belowMinimumOnly", in: "query", type: "bool" },
  { name: "includeInactive", in: "query", type: "bool" }, { name: "page", in: "query", type: "int" }, { name: "pageSize", in: "query", type: "int" },
];

describe("süzgeç alanı ayarları", () => {
  it("öğeleri okur ve aynı biçimde yazar; sondaki boş bölümler atılır", () => {
    const entries = ["warehouseId|select|row|warehouseId|Depo|depolar:id:name", "status|auto|more", "balance.quantityOnHand|range|more||Depo bakiyesi"];
    expect(parseFilterEntries(entries).map(formatFilterEntry)).toEqual(entries);
    expect(formatFilterEntry({ key: "a", kind: "text", place: "row", label: "  " })).toBe("a|text|row");
  });

  it("süzgeç ekler, değiştirir ve kaldırır; parametreli süzgeçte aralık olmaz, seçenek kaynağı yalnız seçimde kalır", () => {
    let filters: unknown = setFilter(undefined, "status", {}, { key: "status", kind: "auto", place: "row" });
    expect(filters).toEqual(["status|auto|row"]);
    filters = setFilter(filters, "warehouseId", { kind: "select" }, { key: "warehouseId", kind: "auto", place: "row", param: "warehouseId" });
    filters = setFilter(filters, "status", { place: "more", label: "Durum" });
    expect(filters).toEqual(["status|auto|more||Durum", "warehouseId|select|row|warehouseId"]);
    expect(setFilter(filters, "warehouseId", { kind: "range" })).toContain("warehouseId|auto|row|warehouseId");
    expect(setFilter(["k|select|row|||q2"], "k", { kind: "text" })).toEqual(["k|text|row"]);
    expect(setFilter(filters, "status", null)).toEqual(["warehouseId|select|row|warehouseId"]);
  });

  it("sorgunun süzgece verilebilen parametreleri: sayfalama hariç; ERP işleminde katalogdaki sorgu parametreleri", () => {
    expect(filterableParams(bakiye, opParams, ["page", "pageSize"]).map((param) => param.name)).toEqual(["warehouseId", "q", "belowMinimumOnly", "includeInactive"]);
    const sql: PageQuery = { id: "q1", name: "liste", kind: "read", runOn: "load", sql: "SELECT 1", parameters: [{ name: "tur", binding: "", type: "text" }] };
    expect(filterableParams(sql, null, [])).toEqual([{ name: "tur", type: "text" }]);
    expect(filterableParams(undefined, null, [])).toEqual([]);
  });

  it("parametreleri {{<ad>.<parametre>}} ile bağlar; eksik parametreyi türüyle ekler, değişiklik yoksa aynı sorguyu döner", () => {
    const bound = withFilterBindings(bakiye, "stokSuzgec", [{ name: "q", type: "text" }, { name: "includeInactive", type: "bool" }]);
    expect(bound.parameters.find((parameter) => parameter.name === "q")?.binding).toBe("{{stokSuzgec.q}}");
    expect(bound.parameters.find((parameter) => parameter.name === "includeInactive")).toEqual({ name: "includeInactive", binding: "{{stokSuzgec.includeInactive}}", type: "bool" });
    expect(withFilterBindings(bound, "stokSuzgec", [{ name: "q", type: "text" }])).toBe(bound);
    expect(unboundFilterParams(bakiye, "stokSuzgec", ["q", "warehouseId"])).toEqual(["q", "warehouseId"]);
    expect(unboundFilterParams(bound, "stokSuzgec", ["q", "includeInactive"])).toEqual([]);
  });

  it("artık ait olmayan bağlamalar yalnız ERP işlemi sorgusundan kalkar; sütun son bölümüyle parametreye denk gelir; eskiyen parametre düşer", () => {
    const bound = withFilterBindings(bakiye, "stokSuzgec", [{ name: "q", type: "text" }, { name: "warehouseId", type: "guid" }]);
    const cleared = withoutFilterBindings(bound, "stokSuzgec", ["q"]);
    expect(cleared.parameters.find((parameter) => parameter.name === "warehouseId")?.binding).toBe("");
    expect(cleared.parameters.find((parameter) => parameter.name === "q")?.binding).toBe("{{stokSuzgec.q}}");
    expect(withoutFilterBindings(cleared, "stokSuzgec", ["q"])).toBe(cleared);
    const sql: PageQuery = { id: "q1", name: "liste", kind: "read", runOn: "load", sql: "SELECT 1", parameters: [{ name: "tur", binding: "{{suzgec.tur}}", type: "text" }] };
    expect(withoutFilterBindings(sql, "suzgec", [])).toBe(sql);
    const params = [{ name: "category", type: "text" }, { name: "status", type: "text" }];
    expect(paramForColumn("stockItem.category", params)?.name).toBe("category");
    expect(paramForColumn("status", params)?.name).toBe("status");
    expect(paramForColumn("balance.code", params)).toBeUndefined();
    const props = { search: true, searchParam: "q", filters: ["includeInactive|toggle|row|includeInactive", "stockItem.category|select|more|category", "status|auto|row"] };
    expect(withoutStaleParams(props, [{ name: "q", type: "text" }])).toEqual({ search: true, searchParam: "q", filters: ["stockItem.category|select|more", "status|auto|row"] });
    expect(withoutStaleParams(props, null)).toBe(props);
  });

  it("başka sorguların süzgeç parametresine bağlaması kalır; alan silinince ya da eski listenin sorgusunda kalkar", () => {
    const params = ["q", "warehouseId"];
    expect(keptFilterBindings("bakiye", params, "bakiye", "bakiye")).toEqual(params);
    // Hareket sorgusu süzgecin seçili deposunu okur ({{suzgec.warehouseId}}).
    expect(keptFilterBindings("hareketler", params, "bakiye", "bakiye")).toEqual(params);
    // Alan başka tabloya taşındı: eski listenin sorgusundaki bağlamalar kalkar.
    expect(keptFilterBindings("bakiye", params, "digerListe", "bakiye")).toEqual([]);
    expect(keptFilterBindings("hareketler", null, undefined, "bakiye")).toEqual([]);
    const hareketler: PageQuery = { id: "hareketler", name: "hareketler", kind: "read", runOn: "load", operation: "stok.hareket.listele",
      parameters: [{ name: "warehouseId", binding: "{{suzgec.warehouseId}}", type: "guid" }] };
    expect(withoutFilterBindings(hareketler, "suzgec", keptFilterBindings("hareketler", params, "bakiye", "bakiye"))).toBe(hareketler);
  });

  it("kullanılan parametreler, arama sütunları ve kayıt öncesi sorunlar", () => {
    expect(filterBarParams({ search: true, searchParam: "q", filters: ["warehouseId|select|row|warehouseId", "status|auto|row"] })).toEqual(["q", "warehouseId"]);
    expect(filterBarParams({ search: false, searchParam: "q" })).toEqual([]);
    expect(toggleSearchColumn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSearchColumn(["a", "b"], "a")).toEqual(["b"]);
    expect(isSearchableColumn("code", undefined)).toBe(true);
    expect(isSearchableColumn("number", "text")).toBe(false);
    expect(isSearchableColumn(undefined, "decimal")).toBe(false);
    expect(filterBarProblem({ search: true }, "“Süzgeç”", false)).toContain("tablo seçin");
    expect(filterBarProblem({}, "“Süzgeç”", true)).toContain("en az bir süzgeç");
    expect(filterBarProblem({ filters: ["a|text|row"] }, "“Süzgeç”", true)).toBeNull();
  });

  it("ayarlar: Uygulama sunucu parametresinde 'Sunucu', değilse 'Bu sayfada'; sayfalı tabloda uyarır; Aramada yalnız metin sütunlarında", () => {
    const html = renderToString(<FilterBarFields name="stokSuzgec" tableId="liste" tables={[{ id: "liste", label: "liste" }]} query={bakiye} paged
      props={{ table: "liste", search: true, searchColumns: ["balance.code"], filters: ["warehouseId|select|row|warehouseId|Depo", "stockItem.category|select|more"] }}
      columns={[{ code: "balance.code", label: "Stok kodu" }, { code: "stockItem.category", label: "Kategori" }, { code: "balance.quantityOnHand", label: "Depo bakiyesi" }]}
      formats={{ "balance.code": "code", "balance.quantityOnHand": "number" }} queryParams={filterableParams(bakiye, opParams, ["page", "pageSize"])}
      readQueries={[]} columnsOf={() => []} queryEditable disabled={false} onPatch={() => {}}/>);
    expect(html).toContain("@warehouseId (sorgu parametresi)");
    expect(html).toContain("Sunucu");
    expect(html).toContain("Bu sayfada");
    expect(html).toContain("Süzgeç yalnız görünen sayfaya uygulanır; sunucuda süzmek için sorguya @category parametresi ekleyin.");
    expect(html).toContain('aria-label="Stok kodu aramada"');
    expect(html).not.toContain('aria-label="Depo bakiyesi aramada"');
    // Kayıtta bağlanacak parametreler bildirilir.
    expect(html).toContain("@warehouseId");
  });
});
