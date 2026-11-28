import { describe, expect, it, vi } from "vitest";
import { api } from "../erpApi";
import { bindingOf, normalizeDocument, runTransition, saveDocument } from "./documentApi";

vi.mock("../erpApi", () => ({ api: vi.fn() }));

describe("stok.transfer Belge bağı", () => {
  it("transfer görünümünü ortak Belge biçimine çevirir", () => {
    const binding = bindingOf("stok.transfer")!;
    const normalized = normalizeDocument(binding, {
      transfer: { id: "t-1", code: "TRF-1", status: "Posted", transferDate: "2026-11-28", lines: [
        { stockItemId: "s-1", stockCode: "SKU", stockName: "Ürün", displayQuantity: 3, displayUnitCode: "KOLI" },
      ] },
      totals: { lineCount: 1, totalQuantity: 3 }, allowedTransitions: ["iptal"], activity: [], activityStartedLate: false,
    } as never);
    expect(normalized.doc).toMatchObject({ id: "t-1", code: "TRF-1", status: "Posted", values: { transferDate: "2026-11-28" } });
    expect(normalized.doc.lines[0]).toMatchObject({ stockItemId: "s-1", quantity: 3, unitCode: "KOLI" });
    expect(normalized.amounts.grandTotal).toBe(3);
  });

  it("transfer yalnız mevcut POST ucuyla oluşturulur, kayıtlı transfer güncellenmez", async () => {
    const binding = bindingOf("stok.transfer")!;
    vi.mocked(api).mockResolvedValue({ id: "t-1" } as never);
    await saveDocument(binding, null, { requestId: "r-1" });
    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toBe("/api/warehouses/transfers");
    expect((vi.mocked(api).mock.calls.at(-1)?.[2] as RequestInit).method).toBe("POST");
    await expect(saveDocument(binding, "t-1", {})).rejects.toThrow();
  });

  it("iptal POST'una zorunlu onay alanını ekler", async () => {
    const binding = bindingOf("stok.transfer")!;
    vi.mocked(api).mockResolvedValue({} as never);
    await runTransition(binding, "t-1", "iptal", "Yanlış depo");
    const request = vi.mocked(api).mock.calls.at(-1)?.[2] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ reason: "Yanlış depo", confirmation: true });
  });
});
