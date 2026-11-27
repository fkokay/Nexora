import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../erpApi";
import { DocumentTemplate } from "./DocumentTemplate";
import { layoutDocumentTemplate, type BelgeComponent } from "./documentTemplateModel";

// Belge kalıbıyla satış irsaliyesi (satis.irsaliye): siparişsiz irsaliye taslağı standalone uçlara yazılır, Sevk et standalone post ucuna gider,
// bedelsiz satır ve izleme / raf bilgisi kayıtta geri gönderilir, özel alan ve hesap uçları çağrılmaz.

vi.mock("../erpApi", () => ({ api: vi.fn() }));
vi.mock("../authApi", () => ({ authenticatedFetch: vi.fn() }));
vi.mock("../confirmDialog", () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn(async () => "gerekçe") }));
const mockedApi = vi.mocked(api);
const T = { timeout: 4000 };

const components: BelgeComponent[] = [
  { id: "baslik", type: "documentFields", props: { slot: "fields", fields: ["code", "customerId", "deliveryDate", "warehouseId"], labels: {} } },
  { id: "satirlar", type: "documentLines", props: { slot: "lines", columns: ["stockItemId", "quantity", "unitCode", "unitPrice", "discountPercent", "vatPercent", "lineTotal"], labels: {}, density: "normal" } },
  { id: "toplamlar", type: "documentSummary", props: { slot: "summary", vatBreakdown: true, activity: true } },
];

const DELIVERY = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const CUSTOMER = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const WAREHOUSE = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const LOCATION = "11111111-1111-1111-1111-111111111111";

const model = {
  code: "satis.irsaliye", label: "Satış irsaliyesi",
  fields: [
    { code: "code", label: "İrsaliye no", type: "text", required: true, optionsOperation: null, readOnly: false },
    { code: "customerId", label: "Müşteri", type: "lookup", required: true, optionsOperation: "cari.listele", readOnly: false },
    { code: "deliveryDate", label: "İrsaliye tarihi", type: "date", required: true, optionsOperation: null, readOnly: false },
    { code: "warehouseId", label: "Depo", type: "lookup", required: true, optionsOperation: "depo.listele", readOnly: false },
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
  states: [{ code: "Draft", label: "Taslak", terminal: false }, { code: "Posted", label: "Sevk edildi", terminal: false }, { code: "Voided", label: "İptal edildi", terminal: true }],
  transitions: [
    { code: "sevket", label: "Sevk et", from: ["Draft"], to: "Posted", operation: "satis.irsaliye.sevket", requiresReason: false },
    { code: "iptal", label: "İptal et", from: ["Posted"], to: "Voided", operation: "satis.irsaliye.iptal", requiresReason: true },
  ],
  fills: { stockItemId: ["unitCode", "unitPrice", "vatPercent", "discountPercent", "currencyCode", "availableQuantity"] },
};

const line = (n: number, over: Record<string, unknown> = {}) => ({ lineNumber: n, stockItemId: `0000000${n}-0000-0000-0000-000000000000`, stockCode: `STK-${n}`, stockName: `Mal ${n}`,
  unitCode: "ADET", quantity: 2, unitPrice: 100, discountPercent: 0, vatPercent: 20, isFreeOfCharge: false, trackingCode: null, expiryDate: null, storageLocationId: null,
  lineSubtotal: 200, discountAmount: 0, taxAmount: 40, lineTotal: 240, ...over });
const deliveryDocument = (status: string, transitions: string[]) => ({
  delivery: { id: DELIVERY, code: "IRS-7", customerId: CUSTOMER, customerName: "Akdeniz Gıda", deliveryDate: "2026-11-26", currencyCode: "TRY", status,
    warehouseId: WAREHOUSE, warehouseName: "Ana depo", isStandalone: true, orderCode: null, invoiceCode: null,
    lines: [line(1, { trackingCode: "LOT-9", expiryDate: "2027-01-01", storageLocationId: LOCATION }),
      line(2, { isFreeOfCharge: true, unitPrice: null, discountPercent: null, vatPercent: null, lineSubtotal: 0, taxAmount: 0, lineTotal: 0 })] },
  amounts: { currencyCode: "TRY", subtotal: 200, discountTotal: 0, taxTotal: 40, grandTotal: 240, vat: [{ rate: 20, taxableAmount: 200, amount: 40 }] },
  allowedTransitions: transitions, activity: [], activityStartedLate: false,
});

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
let calls: Call[];
let current: ReturnType<typeof deliveryDocument>;

beforeEach(() => {
  calls = [];
  current = deliveryDocument("Draft", ["sevket"]);
  mockedApi.mockImplementation((async (url: string, _token?: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url === "/api/document-models/satis.irsaliye") return model;
    if (url === `/api/sales/deliveries/${DELIVERY}/document`) return current;
    if (url === `/api/sales/standalone-deliveries/${DELIVERY}` && method === "PUT") return { id: DELIVERY };
    if (url === `/api/sales/standalone-deliveries/${DELIVERY}/post`) { current = deliveryDocument("Posted", []); return {}; }
    throw Object.assign(new Error(`beklenmeyen istek ${method} ${url}`), { status: 404 });
  }) as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const show = (props: Partial<Parameters<typeof DocumentTemplate>[0]> = {}) =>
  render(<DocumentTemplate document="satis.irsaliye" layout={layoutDocumentTemplate(components)} orderId={DELIVERY} isPreview={false} title="İrsaliye" {...props} />);

describe("Belge kalıbı · satış irsaliyesi", () => {
  it("taslağı yükler: düzenlenebilir irsaliye no, fiyatsız satır boş, özel alan ve hesap uçları çağrılmaz", async () => {
    show();
    await screen.findByText("IRS-7", undefined, T);
    expect((screen.getByLabelText("İrsaliye no *") as HTMLInputElement).value).toBe("IRS-7");
    expect((screen.getByLabelText("Birim fiyat (satır 2)") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("belge-durum").textContent).toBe("Taslak");
    expect(screen.getByRole("button", { name: "Sevk et" })).toBeTruthy();
    expect(calls.some((c) => c.url.includes("custom-fields") || c.url.includes("preview"))).toBe(false);
  });

  it("kayıt standalone ucuna PUT'tur ve bedelsiz işareti, izleme ve raf bilgisini geri gönderir", async () => {
    show();
    await screen.findByText("IRS-7", undefined, T);
    fireEvent.change(screen.getByLabelText("Miktar (satır 1)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true), T);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe(`/api/sales/standalone-deliveries/${DELIVERY}`);
    expect(put.body).toMatchObject({ code: "IRS-7", customerId: CUSTOMER, warehouseId: WAREHOUSE, deliveryDate: "2026-11-26" });
    const lines = put.body!.lines as Record<string, unknown>[];
    expect(lines[0]).toMatchObject({ quantity: 3, trackingCode: "LOT-9", expiryDate: "2027-01-01", storageLocationId: LOCATION, isFreeOfCharge: false });
    expect(lines[1]).toMatchObject({ isFreeOfCharge: true, unitPrice: null, discountPercent: null, vatPercent: null });
  });

  it("Sevk et standalone post ucunu çağırır ve belge yenilenir", async () => {
    show();
    await screen.findByText("IRS-7", undefined, T);
    fireEvent.click(screen.getByRole("button", { name: "Sevk et" }));
    await waitFor(() => expect(calls.some((c) => c.url === `/api/sales/standalone-deliveries/${DELIVERY}/post`)).toBe(true), T);
    await waitFor(() => expect(screen.getByTestId("belge-durum").textContent).toBe("Sevk edildi"), T);
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("yeni irsaliye bugünün kodu ve tarihiyle Taslak açılır; depo seçilmeden kaydedilmez", async () => {
    show({ orderId: null });
    await screen.findByText("Yeni irsaliye", undefined, T);
    expect((screen.getByLabelText("İrsaliye no *") as HTMLInputElement).value).toMatch(/^IRS-\d{8}-\d{4}$/);
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect((await screen.findByRole("alert", undefined, T)).textContent).toContain("Müşteri seçin");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});
