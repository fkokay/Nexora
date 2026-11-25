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
