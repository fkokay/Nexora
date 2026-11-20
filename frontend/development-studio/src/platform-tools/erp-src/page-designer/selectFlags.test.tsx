import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterBarFields } from "./FilterBarFields";
import { formatFilterEntry, parseFilterEntries, setFilter } from "./filterBarSettings";

// Aranabilir seçim ve ilk seçenek: süzgeç öğesinin yedinci bölümü (bayraklar) ve dört sütunlu seçenek kaynağı.
describe("seçim süzgeci bayrakları", () => {
  it("bayrakları ve açıklama sütununu okur, aynı biçimde yazar", () => {
    const entries = ["warehouseId|select|row|warehouseId|Depo|depolar:id:code:name|searchable,defaultFirst", "isActive|select|row||Durum||defaultFirst"];
    const specs = parseFilterEntries(entries);
    expect(specs[0]).toMatchObject({ options: { query: "depolar", valueColumn: "id", labelColumn: "code", descriptionColumn: "name" }, searchable: true, defaultFirst: true });
    expect(specs[1]).toMatchObject({ defaultFirst: true });
    expect(specs[1].searchable).toBeUndefined();
    expect(specs.map(formatFilterEntry)).toEqual(entries);
  });

  it("bayrak eklenir ve kaldırılır; tür metne dönünce bayraklar ve seçenek kaynağı düşer", () => {
    let filters = setFilter(["warehouseId|select|row|warehouseId|Depo|depolar:id:code:name"], "warehouseId", { searchable: true });
    expect(filters).toEqual(["warehouseId|select|row|warehouseId|Depo|depolar:id:code:name|searchable"]);
    filters = setFilter(filters, "warehouseId", { defaultFirst: true });
    expect(filters).toEqual(["warehouseId|select|row|warehouseId|Depo|depolar:id:code:name|searchable,defaultFirst"]);
    expect(setFilter(filters, "warehouseId", { searchable: undefined })).toEqual(["warehouseId|select|row|warehouseId|Depo|depolar:id:code:name|defaultFirst"]);
    expect(setFilter(filters, "warehouseId", { kind: "text" })).toEqual(["warehouseId|text|row|warehouseId|Depo"]);
  });

  it("ayarlar: seçim süzgecinde Aranabilir, İlk seçenek ve Açıklama sütunu; metin süzgecinde yok", () => {
    const html = renderToString(<FilterBarFields name="suzgec" tableId="liste" tables={[{ id: "liste", label: "liste" }]} query={undefined} paged={false}
      props={{ table: "liste", filters: ["warehouseId|select|row||Depo|depolar:id:code:name|searchable,defaultFirst", "code|text|row"] }}
      columns={[{ code: "warehouseId", label: "Depo" }, { code: "code", label: "Kod" }]} formats={{}} queryParams={[]}
      readQueries={[{ id: "depolar", name: "depolar" }]} columnsOf={() => [{ code: "id", label: "Id" }, { code: "code", label: "Kod" }, { code: "name", label: "Ad" }]}
      queryEditable disabled={false} onPatch={() => {}}/>);
    expect(html).toMatch(/aria-label="Depo yazarak aranır" checked=""/);
    expect(html).toMatch(/aria-label="Depo ilk seçenekle başlar" checked=""/);
    expect(html).toContain('aria-label="Açıklama sütunu"');
    expect(html).not.toContain("Kod yazarak aranır");
  });
});
