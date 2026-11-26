import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../authApi", () => ({ authenticatedFetch: vi.fn() }));
import { authenticatedFetch } from "../authApi";
import { loadCatalog } from "./catalogClient";

const respond = (status: number, body?: unknown) =>
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => vi.clearAllMocks());

describe("loadCatalog", () => {
  it("maps response and returns null on 404", async () => {
    respond(200, {
      releaseId: "r", version: "1.2.0", invalidItems: [],
      dataSources: [{ code: "cari", label: "Cari", source: "erpOperation", erpOperation: "customers.list",
        parameters: [{ name: "q", type: "string" }], columns: [{ code: "id", label: "No", type: "int", key: true }], opens: "cariKarti" }],
      actions: [{ code: "sil", label: "Sil", kind: "delete", target: "row", source: "sql", parameters: [], confirm: "Emin misin?" }],
    });
    const catalog = await loadCatalog("t");
    expect(catalog?.version).toBe("1.2.0");
    expect(catalog?.dataSources[0]).toMatchObject({ code: "cari", erpOperation: "customers.list", opens: "cariKarti" });
    expect(catalog?.dataSources[0].columns[0].key).toBe(true);
    expect(catalog?.actions[0]).toMatchObject({ kind: "delete", target: "row", source: "sql", erpOperation: null, confirmText: "Emin misin?" });
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/custom-pages/catalog", "t");

    respond(404);
    expect(await loadCatalog("t")).toBeNull();
    respond(200, { releaseId: null, version: null, dataSources: [], actions: [], invalidItems: [] });
    expect(await loadCatalog("t")).toBeNull();
    respond(500);
    await expect(loadCatalog("t")).rejects.toThrow();
  });
});

describe("loadCatalog column flags", () => {
  it("loadCatalog maps longText required maxLength with defaults", async () => {
    respond(200, { version: "1", dataSources: [{ code: "c", label: "C", source: "sql", columns: [
      { code: "not", label: "Not", type: "text", key: false, longText: true, required: true, maxLength: 500 },
      { code: "ad", label: "Ad", type: "text", key: false }] }], actions: [] });
    const columns = (await loadCatalog("t"))!.dataSources[0].columns;
    expect(columns[0]).toMatchObject({ longText: true, required: true, maxLength: 500 });
    expect(columns[1]).toMatchObject({ longText: false, required: false, maxLength: null });
  });
});

describe("loadCatalog components", () => {
  it("catalog client reads components", async () => {
    respond(200, { version: "3", dataSources: [], actions: [], components: [
      { code: "satisHaritasi", label: "Satış haritası", description: "Bölgelere göre", height: 300, settings: [
        { name: "baslik", label: "Başlık", type: "text", default: "Bölgeler" },
        { name: "donem", label: "Dönem", type: "choice", options: ["Bu ay", "Bu yıl"], default: "Bu ay" },
        { name: "adet", label: "Adet", type: "number", default: "x" },
        { name: "etiket", label: "Etiket", type: "bool", default: true },
        { name: "garip", label: "Garip", type: "renk" }] },
      { label: "Kodsuz" },
      { code: "takvim", label: "Teslimat takvimi" }] });
    const catalog = (await loadCatalog("t"))!;
    expect(catalog.components).toHaveLength(2);
    const [harita, takvim] = catalog.components!;
    expect(harita).toMatchObject({ code: "satisHaritasi", label: "Satış haritası", description: "Bölgelere göre", height: 300 });
    expect(harita.settings).toEqual([
      { name: "baslik", label: "Başlık", type: "text", options: [], default: "Bölgeler" },
      { name: "donem", label: "Dönem", type: "choice", options: ["Bu ay", "Bu yıl"], default: "Bu ay" },
      { name: "adet", label: "Adet", type: "number", options: [], default: null },
      { name: "etiket", label: "Etiket", type: "bool", options: [], default: true },
      { name: "garip", label: "Garip", type: "text", options: [], default: null },
    ]);
    expect(takvim).toEqual({ code: "takvim", label: "Teslimat takvimi", description: null, height: 240, settings: [] });
    respond(200, { version: "4", dataSources: [], actions: [] });
    expect((await loadCatalog("t"))!.components).toEqual([]);
  });
});
