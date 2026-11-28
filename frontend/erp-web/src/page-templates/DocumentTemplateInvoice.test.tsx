import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../erpApi";
import { DocumentTemplate } from "./DocumentTemplate";
import { bindingOf } from "./documentApi";
import { layoutDocumentTemplate, type BelgeComponent } from "./documentTemplateModel";

// Belge kalıbıyla satış faturası (satis.fatura): yeni belgede kaydet faturayı keser (tek yazma, tekrar deneme anahtarıyla), kesilmiş fatura
// değişmez, tek geçiş İptal et'tir. Sipariş ve teklif davranışı kendi test dosyalarında korunur.

vi.mock("../erpApi", () => ({ api: vi.fn() }));
vi.mock("../authApi", () => ({ authenticatedFetch: vi.fn() }));
vi.mock("../confirmDialog", () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn(async () => "yanlış fatura") }));
const mockedApi = vi.mocked(api);
const T = { timeout: 4000 };

const components: BelgeComponent[] = [
  { id: "baslik", type: "documentFields", props: { slot: "fields", fields: ["code", "customerId", "invoiceDate", "warehouseId", "invoiceType", "accountingProfileCode", "eDocumentScenario", "notes"], labels: {} } },
  { id: "satirlar", type: "documentLines", props: { slot: "lines", columns: ["stockItemId", "quantity", "unitCode", "unitPrice", "discountPercent", "vatPercent", "lineTotal"], labels: {}, density: "normal" } },
  { id: "toplamlar", type: "documentSummary", props: { slot: "summary", vatBreakdown: true, activity: true } },
];

const INVOICE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CUSTOMER = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const WAREHOUSE = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const STOCK = "00000001-0000-0000-0000-000000000000";

const model = {
  code: "satis.fatura", label: "Satış faturası",
  fields: [
    { code: "code", label: "Fatura no", type: "text", required: false, optionsOperation: null, readOnly: true },
    { code: "customerId", label: "Müşteri", type: "lookup", required: true, optionsOperation: "cari.listele", readOnly: false },
    { code: "invoiceDate", label: "Fatura tarihi", type: "date", required: true, optionsOperation: null, readOnly: false },
    { code: "warehouseId", label: "Depo", type: "lookup", required: true, optionsOperation: "depo.listele", readOnly: false },
    { code: "invoiceType", label: "Fatura türü", type: "select", required: true, optionsOperation: null, readOnly: false,
      options: [{ value: "Wholesale", label: "Toptan" }, { value: "Retail", label: "Perakende (KDV dâhil)" }] },
    { code: "accountingProfileCode", label: "Vergi profili", type: "lookup", required: false, optionsOperation: "satinalma.faturaGirisi.mevzuatProfilleri", readOnly: false },
    { code: "eDocumentScenario", label: "e-Belge senaryosu", type: "text", required: false, optionsOperation: null, readOnly: false },
    { code: "notes", label: "Fatura notu", type: "text", required: false, optionsOperation: null, readOnly: false },
  ],
  lineColumns: [
    { code: "stockItemId", label: "Stok", type: "lookup", required: true, calculated: false, optionsOperation: "stok.kart.listele", visibleFrom: null },
    { code: "quantity", label: "Miktar", type: "number", required: true, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "unitCode", label: "Birim", type: "lookup", required: false, calculated: false, optionsOperation: "stok.kart.birimleri", visibleFrom: null },
    { code: "unitPrice", label: "Birim fiyat", type: "number", required: true, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "discountPercent", label: "İsk. %", type: "number", required: false, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "vatPercent", label: "KDV %", type: "number", required: false, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "lineTotal", label: "Tutar", type: "money", required: false, calculated: true, optionsOperation: null, visibleFrom: null },
  ],
  states: [{ code: "Draft", label: "Taslak", terminal: false }, { code: "Posted", label: "Kesildi", terminal: false }, { code: "Voided", label: "İptal edildi", terminal: true }],
  transitions: [{ code: "iptal", label: "İptal et", from: ["Posted"], to: "Voided", operation: "satis.fatura.iptal", requiresReason: true }],
  fills: { stockItemId: ["unitCode", "unitPrice", "vatPercent", "discountPercent", "currencyCode", "availableQuantity"] },
};

const invoiceDocument = (status: string, transitions: string[]) => ({
  invoice: { id: INVOICE, code: "FTR-7", customerId: CUSTOMER, customerName: "Akdeniz Gıda", invoiceDate: "2026-11-26", currencyCode: "TRY", status,
    invoiceType: "Retail", accountingProfileCode: "TR-STD", eDocumentScenario: "EARSIV", eDocumentTypeCode: null, eDocumentRecipientAlias: null, notes: "Not",
    warehouseId: WAREHOUSE, warehouseName: "Ana depo", customFields: [],
    lines: [{ lineNumber: 1, stockItemId: STOCK, stockCode: "ZYT-01", stockName: "Zeytinyağı", unitCode: "ADET", quantity: 2, unitPrice: 100, discountPercent: 0,
      vatPercent: 20, lineSubtotal: 200, discountAmount: 0, taxAmount: 40, lineTotal: 240 }] },
  amounts: { currencyCode: "TRY", subtotal: 200, discountTotal: 0, taxTotal: 40, grandTotal: 240, vat: [{ rate: 20, taxableAmount: 200, amount: 40 }] },
  allowedTransitions: transitions, activity: [], activityStartedLate: false,
});

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[];
let current: ReturnType<typeof invoiceDocument>;
let failNextCreate: boolean;

beforeEach(() => {
  calls = []; failNextCreate = false;
  current = invoiceDocument("Posted", ["iptal"]);
  mockedApi.mockImplementation((async (url: string, _token?: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url === "/api/document-models/satis.fatura") return model;
    if (url === `/api/sales/invoices/${INVOICE}/document`) return current;
    if (url.startsWith("/api/document-models/satis.fatura/sample")) return invoiceDocument(new URL(url, "http://x").searchParams.get("state") ?? "Draft", []);
    if (url === "/api/sales/invoices/custom-fields") return [];
    if (url === "/api/sales/invoices/preview") return { currencyCode: "TRY", subtotal: 1, discountTotal: 0, taxTotal: 0, grandTotal: 1, lines: [], taxes: [] };
    if (url === "/api/sales/invoices" && method === "POST") {
      if (failNextCreate) { failNextCreate = false; throw new Error("Bağlantı koptu"); }
      return { id: INVOICE };
    }
    if (url === `/api/sales/invoices/${INVOICE}/void`) { current = invoiceDocument("Voided", []); return {}; }
    throw Object.assign(new Error(`beklenmeyen istek ${method} ${url}`), { status: 404 });
  }) as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const show = (props: Partial<Parameters<typeof DocumentTemplate>[0]> = {}) =>
  render(<DocumentTemplate document="satis.fatura" layout={layoutDocumentTemplate(components)} orderId={INVOICE} isPreview={false} title="Fatura" {...props} />);

describe("Belge kalıbı · satış faturası", () => {
  it("kesilmiş faturayı salt okunur yükler: tür, depo, vergi profili, satırlar, toplamlar; yalnız İptal et vardır", async () => {
    show();
    await screen.findByText("FTR-7", undefined, T);
    expect((screen.getByLabelText("Fatura tarihi") as HTMLInputElement).value).toBe("2026-11-26");
    expect((screen.getByLabelText("Fatura türü") as HTMLSelectElement).value).toBe("Retail");
    expect((screen.getByLabelText("Fatura türü") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByTestId("belge-durum").textContent).toBe("Kesildi");
    expect(screen.getByTestId("belge-genel-toplam").textContent).toContain("240,00");
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Faturayı kes" })).toBeNull();
    expect(screen.getByRole("button", { name: "İptal et" })).toBeTruthy();
  });

  it("İptal et gerekçe sorar ve faturanın void ucunu çağırır", async () => {
    show();
    await screen.findByText("FTR-7", undefined, T);
    fireEvent.click(screen.getByRole("button", { name: "İptal et" }));
    await waitFor(() => expect(calls.some((c) => c.url === `/api/sales/invoices/${INVOICE}/void`)).toBe(true), T);
    expect(calls.find((c) => c.url.endsWith("/void"))!.body).toMatchObject({ reason: "yanlış fatura" });
    await waitFor(() => expect(screen.getByTestId("belge-durum").textContent).toBe("İptal edildi"), T);
    expect(screen.queryByRole("button", { name: "İptal et" })).toBeNull();
  });

  it("yeni belge Taslak açılır; kaydet düğmesi Faturayı kes'tir ve depo seçilmeden kesilmez", async () => {
    show({ orderId: null });
    await screen.findByText("Yeni fatura", undefined, T);
    expect(screen.getByTestId("belge-durum").textContent).toBe("Taslak");
    expect((screen.getByLabelText("Fatura türü *") as HTMLSelectElement).value).toBe("Wholesale");
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Faturayı kes" }));
    expect((await screen.findByRole("alert", undefined, T)).textContent).toContain("Müşteri seçin");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("Studio örneği fatura örnek ucundan gelir ve kayıt gönderilmez", async () => {
    show({ orderId: null, isPreview: true, previewState: "Posted" });
    await screen.findByText("FTR-7", undefined, T);
    expect(calls.some((c) => c.url === "/api/document-models/satis.fatura/sample?state=Posted")).toBe(true);
    expect(calls.some((c) => c.method !== "GET" && c.url.includes("/api/sales/invoices"))).toBe(false);
  });

  it("kayıt gövdesi tek yazmanın istediği biçimdedir: istek anahtarı, depo, tür, e-belge alanları yalnız doluysa", () => {
    const binding = bindingOf("satis.fatura")!;
    const header = { code: "", customerId: CUSTOMER, salespersonEmployeeId: "", currencyCode: "TRY", prospectCustomerName: "", requestId: "r-1",
      values: { ...binding.newValues(), invoiceDate: "2026-11-26", warehouseId: WAREHOUSE, eDocumentScenario: "EARSIV" } };
    const body = binding.writeBody(header, [], { KANAL: "Bayi" });
    expect(body).toMatchObject({ requestId: "r-1", customerId: CUSTOMER, warehouseId: WAREHOUSE, invoiceDate: "2026-11-26", invoiceType: "Wholesale",
      accountingProfileCode: null, notes: null, eDocument: { scenario: "EARSIV", typeCode: null, recipientAlias: null }, customFields: { KANAL: "Bayi" } });
    expect(binding.writeBody({ ...header, values: { ...header.values, eDocumentScenario: "" } }, [], {}).eDocument).toBeNull();
    expect(binding.previewBody({ ...header, customerId: "" }, [])).toBeNull();
    expect(binding.previewBody(header, [])).toMatchObject({ customerId: CUSTOMER, warehouseId: WAREHOUSE, invoiceType: "Wholesale" });
  });
});
