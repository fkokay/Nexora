import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../erpApi";
import { DocumentTemplate } from "./DocumentTemplate";
import { layoutDocumentTemplate, type BelgeComponent } from "./documentTemplateModel";

// Belge kalıbıyla satış teklifi (satis.teklif): aynı kalıp, teklif bağı. Sipariş davranışı DocumentTemplate.test.tsx'te korunur;
// burada teklife özgü olanlar: tarih/metin alanları, geçişlerin teklif uçlarına gitmesi ve kayıtta silinebilecek verinin geri gönderilmesi.

vi.mock("../erpApi", () => ({ api: vi.fn() }));
vi.mock("../authApi", () => ({ authenticatedFetch: vi.fn() }));
vi.mock("../confirmDialog", () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn(async () => "gerekçe") }));
const mockedApi = vi.mocked(api);
const T = { timeout: 4000 };

const components: BelgeComponent[] = [
  { id: "baslik", type: "documentFields", props: { slot: "fields", fields: ["code", "customerId", "quoteDate", "validUntil", "salespersonEmployeeId", "deliveryTerms", "notes"], labels: {} } },
  { id: "satirlar", type: "documentLines", props: { slot: "lines", columns: ["stockItemId", "quantity", "unitCode", "unitPrice", "discountPercent", "vatPercent", "lineTotal"], labels: {}, density: "normal" } },
  { id: "toplamlar", type: "documentSummary", props: { slot: "summary", vatBreakdown: true, activity: true } },
];

const QUOTE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CUSTOMER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const model = {
  code: "satis.teklif", label: "Satış teklifi",
  fields: [
    { code: "code", label: "Teklif no", type: "text", required: false, optionsOperation: null, readOnly: true },
    { code: "customerId", label: "Müşteri", type: "lookup", required: true, optionsOperation: "cari.listele", readOnly: false },
    { code: "quoteDate", label: "Teklif tarihi", type: "date", required: true, optionsOperation: null, readOnly: false },
    { code: "validUntil", label: "Geçerlilik", type: "date", required: true, optionsOperation: null, readOnly: false },
    { code: "salespersonEmployeeId", label: "Plasiyer", type: "lookup", required: false, optionsOperation: "ik.personel.listele", readOnly: false },
    { code: "deliveryTerms", label: "Teslimat koşulları", type: "text", required: false, optionsOperation: null, readOnly: false },
    { code: "notes", label: "Notlar", type: "text", required: false, optionsOperation: null, readOnly: false },
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
  states: [
    { code: "Draft", label: "Taslak", terminal: false }, { code: "Sent", label: "İletildi", terminal: false },
    { code: "Accepted", label: "Kabul edildi", terminal: false }, { code: "Rejected", label: "Reddedildi", terminal: true },
  ],
  transitions: [
    { code: "ilet", label: "İlet", from: ["Draft"], to: "Sent", operation: "satis.teklif.ilet", requiresReason: false },
    { code: "kabulEt", label: "Kabul et", from: ["Sent", "Rejected"], to: "Accepted", operation: "satis.teklif.kabulEt", requiresReason: false },
    { code: "reddet", label: "Reddet", from: ["Sent"], to: "Rejected", operation: "satis.teklif.reddet", requiresReason: false },
  ],
  fills: { stockItemId: ["unitCode", "unitPrice", "vatPercent", "discountPercent", "currencyCode", "availableQuantity"] },
};

const quoteDocument = (status: string, transitions: string[], over: Record<string, unknown> = {}) => ({
  quote: { id: QUOTE, code: "TKL-7", customerId: CUSTOMER, customerName: "Akdeniz Gıda", quoteDate: "2026-11-26", validUntil: "2026-12-26", currencyCode: "TRY",
    status, notes: "Fiyatlar KDV hariçtir", deliveryTerms: "Depoda teslim", prospectCustomerName: null, salespersonEmployeeId: null,
    subtotal: 200, discountTotal: 0, taxTotal: 40, grandTotal: 240, customFields: [{ code: "KANAL", label: "Kanal", dataType: "Text", maxLength: 20, isRequired: false, value: "Bayi" }],
    lines: [{ lineNumber: 1, stockItemId: "00000001-0000-0000-0000-000000000000", stockCode: "ZYT-01", stockName: "Zeytinyağı", unitCode: "ADET", quantity: 2,
      unitPrice: 100, discountPercent: 0, vatPercent: 20, lineSubtotal: 200, discountAmount: 0, taxAmount: 40, lineTotal: 240, enteredCurrencyCode: "USD",
      enteredUnitPrice: 100, enteredUnitCode: "KOLİ", exchangeRateToQuoteCurrency: 35, isVatIncluded: false, salesRequestLineNumber: 4 }],
    ...over },
  amounts: { currencyCode: "TRY", subtotal: 200, discountTotal: 0, taxTotal: 40, grandTotal: 240, vat: [{ rate: 20, taxableAmount: 200, amount: 40 }] },
  allowedTransitions: transitions, activity: [], activityStartedLate: false,
});

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[];
let current: ReturnType<typeof quoteDocument>;

beforeEach(() => {
  calls = [];
  current = quoteDocument("Draft", ["ilet"]);
  mockedApi.mockImplementation((async (url: string, _token?: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url === "/api/document-models/satis.teklif") return model;
    if (url === `/api/sales/quotes/${QUOTE}/document`) return current;
    if (url.startsWith("/api/document-models/satis.teklif/sample")) return quoteDocument(new URL(url, "http://x").searchParams.get("state") ?? "Draft", []);
    if (url === "/api/sales/quotes/custom-fields") return [{ code: "KANAL", label: "Kanal", dataType: "Text", maxLength: 20, isRequired: false }];
    if (url === "/api/sales/quotes/preview") return { currencyCode: "TRY", subtotal: 1, discountTotal: 0, taxTotal: 0, grandTotal: 1, lines: [], taxes: [] };
    if (url === `/api/sales/quotes/${QUOTE}` && method === "PUT") return { id: QUOTE };
    if (url === "/api/sales/quotes" && method === "POST") return { id: QUOTE };
    if (/\/api\/sales\/quotes\/.+\/(send|accept|reject)$/.test(url)) { current = quoteDocument("Sent", ["kabulEt", "reddet"]); return {}; }
    throw Object.assign(new Error(`beklenmeyen istek ${method} ${url}`), { status: 404 });
  }) as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const show = (props: Partial<Parameters<typeof DocumentTemplate>[0]> = {}) =>
  render(<DocumentTemplate document="satis.teklif" layout={layoutDocumentTemplate(components)} orderId={QUOTE} isPreview={false} title="Teklif" {...props} />);

describe("Belge kalıbı · satış teklifi", () => {
  it("teklifin tarih ve metin alanlarını, satırlarını ve toplamlarını yükler", async () => {
    show();
    await screen.findByText("TKL-7", undefined, T);
    expect((screen.getByLabelText("Teklif tarihi *") as HTMLInputElement).value).toBe("2026-11-26");
    expect((screen.getByLabelText("Geçerlilik *") as HTMLInputElement).value).toBe("2026-12-26");
    expect((screen.getByLabelText("Teslimat koşulları") as HTMLInputElement).value).toBe("Depoda teslim");
    expect((screen.getByLabelText("Notlar") as HTMLInputElement).value).toBe("Fiyatlar KDV hariçtir");
    expect((screen.getByLabelText("Miktar (satır 1)") as HTMLInputElement).value).toBe("2");
    expect(screen.getByTestId("belge-durum").textContent).toBe("Taslak");
    expect(screen.getByTestId("belge-genel-toplam").textContent).toContain("240,00");
    expect(within(screen.getByRole("table")).queryByText("Sevk edilen")).toBeNull();
    expect(screen.getByRole("button", { name: "İlet" })).toBeTruthy();
  });

  it("kayıt, göstermediği veriyi de geri gönderir: notlar, teslimat koşulları, kur, talep satırı ve özel alanlar", async () => {
    show();
    await screen.findByText("TKL-7", undefined, T);
    fireEvent.change(screen.getByLabelText("Miktar (satır 1)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true), T);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe(`/api/sales/quotes/${QUOTE}`);
    expect(put.body).toMatchObject({
      code: "TKL-7", customerId: CUSTOMER, prospectCustomerName: null, quoteDate: "2026-11-26", validUntil: "2026-12-26", currencyCode: "TRY",
      notes: "Fiyatlar KDV hariçtir", deliveryTerms: "Depoda teslim", customFields: { KANAL: "Bayi" },
    });
    expect((put.body!.lines as Record<string, unknown>[])[0]).toMatchObject({ quantity: 3, currencyCode: "USD", exchangeRateToQuoteCurrency: 35, salesRequestLineNumber: 4 });
    expect(put.body).not.toHaveProperty("orderDate");
  });

  it("kayıtsız alıcılı teklif müşteri seçilmeden kaydedilir ve alıcı adı korunur", async () => {
    current = quoteDocument("Draft", ["ilet"], { customerId: null, customerName: "Kayıtsız Alıcı", prospectCustomerName: "Kayıtsız Alıcı" });
    show();
    await screen.findByText("TKL-7", undefined, T);
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true), T);
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ customerId: null, prospectCustomerName: "Kayıtsız Alıcı" });
  });

  it("hesap teklif ucuna tarihler ve dövizle gider", async () => {
    show();
    await screen.findByText("TKL-7", undefined, T);
    fireEvent.change(screen.getByLabelText("Miktar (satır 1)"), { target: { value: "5" } });
    await waitFor(() => expect(calls.some((c) => c.url === "/api/sales/quotes/preview")).toBe(true), T);
    expect(calls.find((c) => c.url === "/api/sales/quotes/preview")!.body).toMatchObject({
      customerId: CUSTOMER, quoteDate: "2026-11-26", validUntil: "2026-12-26", currencyCode: "TRY" });
    expect(calls.some((c) => c.url === "/api/sales/orders/preview")).toBe(false);
  });

  it("İlet teklifin send ucunu çağırır ve belge yenilenir", async () => {
    show();
    await screen.findByText("TKL-7", undefined, T);
    fireEvent.click(screen.getByRole("button", { name: "İlet" }));
    await waitFor(() => expect(calls.some((c) => c.url === `/api/sales/quotes/${QUOTE}/send`)).toBe(true), T);
    await waitFor(() => expect(screen.getByTestId("belge-durum").textContent).toBe("İletildi"), T);
    expect(screen.getByRole("button", { name: "Kabul et" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("Studio örneği teklif örnek ucundan gelir ve kayıt gönderilmez", async () => {
    show({ orderId: null, isPreview: true, previewState: "Sent" });
    await screen.findByText("TKL-7", undefined, T);
    expect(calls.some((c) => c.url === "/api/document-models/satis.teklif/sample?state=Sent")).toBe(true);
    expect(calls.some((c) => c.method !== "GET" && c.url.includes("/api/sales/quotes"))).toBe(false);
  });

  it("yeni teklif bugünden 30 gün geçerlilikle açılır", async () => {
    show({ orderId: null });
    await screen.findByText("Yeni teklif", undefined, T);
    const from = (screen.getByLabelText("Teklif tarihi *") as HTMLInputElement).value;
    const until = (screen.getByLabelText("Geçerlilik *") as HTMLInputElement).value;
    expect((new Date(until).getTime() - new Date(from).getTime()) / 86400000).toBe(30);
  });
});
