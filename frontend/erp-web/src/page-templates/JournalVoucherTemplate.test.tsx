import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../erpApi";
import { JournalVoucherTemplate } from "./JournalVoucherTemplate";
import { layoutDocumentTemplate, type BelgeComponent } from "./documentTemplateModel";

vi.mock("../erpApi", () => ({ api: vi.fn() }));

const model = {
  code: "muhasebe.fis", label: "Yevmiye fişi",
  fields: [
    { code: "code", label: "Fiş no", type: "text", required: false, optionsOperation: null, readOnly: true },
    { code: "entryDate", label: "Fiş tarihi", type: "date", required: true, optionsOperation: null, readOnly: false },
    { code: "accountingBasis", label: "Muhasebe standardı", type: "select", required: true, optionsOperation: null, readOnly: false },
    { code: "description", label: "Açıklama", type: "text", required: true, optionsOperation: null, readOnly: false },
  ],
  lineColumns: [
    { code: "accountId", label: "Hesap", type: "lookup", required: true, calculated: false, optionsOperation: "finans.muhasebe.hesap.listele", visibleFrom: null },
    { code: "debit", label: "Borç", type: "money", required: false, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "credit", label: "Alacak", type: "money", required: false, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "description", label: "Satır açıklaması", type: "text", required: false, calculated: false, optionsOperation: null, visibleFrom: null },
  ], states: [{ code: "Posted", label: "Kaydedildi", terminal: false }], transitions: [], fills: {},
};

const layout = layoutDocumentTemplate<BelgeComponent>([
  { id: "fields", type: "documentFields", props: { fields: ["code", "entryDate", "accountingBasis", "description"] } },
  { id: "lines", type: "documentLines", props: { columns: ["accountId", "debit", "credit", "description"] } },
  { id: "summary", type: "documentSummary", props: { activity: true } },
]);

describe("JournalVoucherTemplate", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("loads its document model, offers account lookup and blocks an unbalanced new voucher", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/api/document-models/muhasebe.fis") return model as never;
      if (path === "/api/finance/general-ledger/accounts?activeOnly=true") return [{ id: "a1", code: "100", name: "Kasa", isActive: true }] as never;
      throw new Error(`unexpected request: ${path}`);
    });
    render(<JournalVoucherTemplate document="muhasebe.fis" layout={layout} token="x.eyJyb2xlIjoiVGVuYW50QWRtaW4ifQ.y"
      orderId={null} isPreview={false} title="Yevmiye fişi" />);

    expect(await screen.findByLabelText("Fiş tarihi *")).toBeTruthy();
    expect(screen.getAllByText("Yevmiye fişi").length).toBeGreaterThan(0);
    expect(screen.getByTestId("fis-denge").textContent).toBe("Dengede değil");
    expect(screen.getByRole("button", { name: "Kaydet" }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/finance/general-ledger/accounts?activeOnly=true", expect.anything()));
  });
});
