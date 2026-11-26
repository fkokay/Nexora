import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../erpApi";
import { DocumentTemplate } from "./DocumentTemplate";
import TenantCustomPage from "../TenantCustomPage";
import { CommandProvider } from "../commands/CommandProvider";
import { setPageParams } from "../pageNavigation";
import { layoutDocumentTemplate, type BelgeComponent } from "./documentTemplateModel";

// Belge kalıbı (belge kuralları PR 2, §7 kabul): §2 ayarlarından hiçbirini taşımayan bir `template: belge` sipariş sayfası var olan
// satırları yükler (G-S7), miktar değişince sunucu tutarlarını ve KDV dökümünü gösterir (G-S8), stok seçilince alanları doldurur (G-S9).

vi.mock("../erpApi", () => ({ api: vi.fn() }));
vi.mock("../confirmDialog", () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn(async () => "Müşteri vazgeçti") }));
const mockedApi = vi.mocked(api);
const T = { timeout: 4000 };

export const belgeComponents: BelgeComponent[] = [
  { id: "baslik", type: "documentFields", props: { slot: "fields", fields: ["code", "customerId", "orderDate", "requestedDeliveryDate"], labels: { customerId: "Cari" } } },
  { id: "satirlar", type: "documentLines", props: { slot: "lines", columns: ["stockItemId", "quantity", "unitCode", "unitPrice", "discountPercent", "vatPercent", "availableQuantity", "lineTotal", "deliveredQuantity"], labels: {}, density: "normal" } },
  { id: "toplamlar", type: "documentSummary", props: { slot: "summary", vatBreakdown: true, activity: true } },
];

const model = {
  code: "satis.siparis", label: "Satış siparişi",
  fields: [
    { code: "code", label: "Sipariş no", type: "text", required: false, optionsOperation: null, readOnly: true },
    { code: "customerId", label: "Müşteri", type: "lookup", required: true, optionsOperation: "cari.listele", readOnly: false },
    { code: "orderDate", label: "Sipariş tarihi", type: "date", required: true, optionsOperation: null, readOnly: false },
    { code: "requestedDeliveryDate", label: "İstenen teslim tarihi", type: "date", required: false, optionsOperation: null, readOnly: false },
  ],
  lineColumns: [
    { code: "stockItemId", label: "Stok", type: "lookup", required: true, calculated: false, optionsOperation: "stok.kart.listele", visibleFrom: null },
    { code: "quantity", label: "Miktar", type: "number", required: true, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "unitCode", label: "Birim", type: "lookup", required: false, calculated: false, optionsOperation: "stok.kart.birimleri", visibleFrom: null },
    { code: "unitPrice", label: "Birim fiyat", type: "number", required: true, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "discountPercent", label: "İsk. %", type: "number", required: false, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "vatPercent", label: "KDV %", type: "number", required: false, calculated: false, optionsOperation: null, visibleFrom: null },
    { code: "availableQuantity", label: "Kullanılabilir", type: "number", required: false, calculated: true, optionsOperation: null, visibleFrom: null },
    { code: "lineTotal", label: "Tutar", type: "money", required: false, calculated: true, optionsOperation: null, visibleFrom: null },
    { code: "deliveredQuantity", label: "Sevk edilen", type: "number", required: false, calculated: true, optionsOperation: null, visibleFrom: "Open" },
  ],
  states: [
    { code: "Draft", label: "Taslak", terminal: false }, { code: "PendingApproval", label: "Onay bekliyor", terminal: false },
    { code: "Open", label: "Onaylı", terminal: false }, { code: "Fulfilled", label: "Sevk edildi", terminal: false },
    { code: "Invoiced", label: "Faturalandı", terminal: false }, { code: "Cancelled", label: "İptal", terminal: true },
  ],
  transitions: [
    { code: "onayla", label: "Onayla", from: ["Draft"], to: "Open", operation: "satis.siparis.onayla", requiresReason: false },
    { code: "onayiGeriAl", label: "Onayı geri al", from: ["Open"], to: "Draft", operation: "satis.siparis.onayiGeriAl", requiresReason: false },
    { code: "iptal", label: "İptal et", from: ["Draft", "Open"], to: "Cancelled", operation: "satis.siparis.iptal", requiresReason: true },
  ],
  fills: { stockItemId: ["unitCode", "unitPrice", "vatPercent", "discountPercent", "currencyCode", "availableQuantity"] },
};

const ORDER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const STOCK = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CUSTOMER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const line = (n: number, code: string, quantity: number, price: number, vat: number, total: number, delivered = 0) => ({
  lineNumber: n, stockItemId: `0000000${n}-0000-0000-0000-000000000000`, stockCode: code, stockName: `${code} adı`, unitCode: "ADET",
  quantity, unitPrice: price, discountPercent: 0, vatPercent: vat, lineSubtotal: quantity * price, discountAmount: 0,
  taxAmount: total - quantity * price, lineTotal: total, deliveredQuantity: delivered, enteredCurrencyCode: "TRY", enteredUnitPrice: price,
  enteredUnitCode: "KOLİ", isVatIncluded: false,
});

function document(status: string, transitions: string[]) {
  return {
    order: { id: ORDER, code: "SO-7", customerId: CUSTOMER, customerName: "Akdeniz Gıda", orderDate: "2026-11-26", currencyCode: "TRY", status,
      subtotal: 300, discountTotal: 0, taxTotal: 30, grandTotal: 330, requestedDeliveryDate: null, customFields: [],
      lines: [line(1, "ZYT-01", 2, 100, 20, 240, 1), line(2, "BAL-03", 1, 100, 10, 110)] },
    amounts: { currencyCode: "TRY", subtotal: 300, discountTotal: 0, taxTotal: 30, grandTotal: 330,
      vat: [{ rate: 10, taxableAmount: 100, amount: 10 }, { rate: 20, taxableAmount: 200, amount: 40 }] },
    allowedTransitions: transitions, activity: [], activityStartedLate: false,
  };
}

type Call = { url: string; method: string; body: unknown };
let calls: Call[];
let current: ReturnType<typeof document>;
/** Hesap yanıtları: sırayla çözülen sözler (sıradan çıkan yanıt testi için elle çözülür). */
let previewReplies: ((body: { lines: { rowKey: string; quantity: number }[] }) => Promise<unknown>) | null;

const previewOf = (body: { lines: { rowKey: string; quantity: number }[] }, perUnit = 100) => {
  const lines = body.lines.map((l) => ({ rowKey: l.rowKey, lineSubtotal: l.quantity * perUnit, discountAmount: 0, taxAmount: l.quantity * perUnit * 0.2, lineTotal: l.quantity * perUnit * 1.2 }));
  const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0);
  return { currencyCode: "TRY", subtotal, discountTotal: 0, taxTotal: subtotal * 0.2, grandTotal: subtotal * 1.2, lines,
    taxes: [{ code: "VAT", name: "KDV", rate: 20, treatment: "Additive", taxableAmount: subtotal, amount: subtotal * 0.2 }] };
};

beforeEach(() => {
  calls = [];
  current = document("Draft", ["onayla", "iptal"]);
  previewReplies = null;
  mockedApi.mockImplementation(async (url: string, _token?: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url.includes("/published")) return { id: "p", code: "siparis-belgesi", name: "Satış siparişi", revision: 1, forms: [], rights: {},
      definitionJson: JSON.stringify({ schemaVersion: 2, template: { name: "belge", document: "satis.siparis" }, components: belgeComponents }) };
    if (url === "/api/custom-pages/erp-operations") return { operations: [] };
    if (url === "/api/document-models/satis.siparis") return model;
    if (url === `/api/sales/orders/${ORDER}/document`) return current;
    if (url.startsWith("/api/document-models/satis.siparis/sample")) return document(new URL(url, "http://x").searchParams.get("state") ?? "Draft", []);
    if (url === "/api/sales/orders/custom-fields") return [];
    if (url === "/api/sales/orders/preview") return previewReplies ? previewReplies(body) : previewOf(body);
    if (url === "/api/document-models/satis.siparis/fill")
      return { values: { unitCode: "KG", unitPrice: 92.4, vatPercent: 10, discountPercent: 5, currencyCode: "TRY", availableQuantity: 310 } };
    if (url.startsWith("/api/stock/items")) return { items: [{ id: STOCK, code: "UN-07", name: "Tam buğday unu" }] };
    if (url.startsWith("/api/customers")) return { items: [{ id: CUSTOMER, code: "C-1", name: "Akdeniz Gıda", currencyCode: "TRY" }] };
    if (url === `/api/sales/orders/${ORDER}/approve`) { current = document("Open", ["onayiGeriAl", "iptal"]); return {}; }
    if (url === `/api/sales/orders/${ORDER}/cancel`) { current = document("Cancelled", []); return {}; }
    if (url === `/api/sales/orders/${ORDER}` && method === "PUT") return { id: ORDER };
    throw Object.assign(new Error(`beklenmeyen istek ${method} ${url}`), { status: 404 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const show = (props: Partial<Parameters<typeof DocumentTemplate>[0]> = {}) =>
  render(<DocumentTemplate document="satis.siparis" layout={layoutDocumentTemplate(belgeComponents)} orderId={ORDER} isPreview={false} title="Sipariş" {...props} />);

const grid = () => screen.getByRole("table");

describe("Belge kalıbı (G-S7/8/9)", () => {
  it("var olan siparişin satırlarını Taslak'ta düzenlenebilir yükler (G-S7)", async () => {
    show();
    await screen.findByText("SO-7", undefined, T);
    expect((screen.getByLabelText("Miktar (satır 1)") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Birim fiyat (satır 1)") as HTMLInputElement).value).toBe("100");
    expect((screen.getByLabelText("Miktar (satır 1)") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Stok (satır 1)") as HTMLInputElement).value).toBe("ZYT-01 · ZYT-01 adı");
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeTruthy();
    expect(screen.getByText("Cari")).toBeTruthy();
    expect(within(grid()).queryByText("Sevk edilen")).toBeNull();
  });

  it("miktar değişince sunucunun tutarlarını ve KDV dökümünü gösterir (G-S8)", async () => {
    show();
    await screen.findByText("SO-7", undefined, T);
    expect(screen.getByTestId("belge-genel-toplam").textContent).toContain("330,00");
    fireEvent.change(screen.getByLabelText("Miktar (satır 1)"), { target: { value: "5" } });
    await waitFor(() => expect(screen.getByTestId("belge-genel-toplam").textContent).toContain("720,00"), T);
    const previews = calls.filter((c) => c.url === "/api/sales/orders/preview");
    expect(previews).toHaveLength(1);
    expect((previews[0].body as { lines: { quantity: number }[] }).lines.map((l) => l.quantity)).toEqual([5, 1]);
    expect(screen.getByText(/KDV %20 \(matrah 600,00/)).toBeTruthy();
  });

  it("stok seçilince birim, fiyat, KDV, iskonto, döviz ve kullanılabilir miktarı doldurur (G-S9)", async () => {
    show({ orderId: null });
    await screen.findByText("Yeni sipariş", undefined, T);
    fireEvent.click(screen.getByRole("button", { name: /Satır ekle/ }));
    const stock = await screen.findByLabelText("Stok (satır 1)");
    fireEvent.focus(stock);
    fireEvent.change(stock, { target: { value: "UN" } });
    fireEvent.click(await screen.findByRole("option", { name: /UN-07/ }, T));
    await waitFor(() => expect((screen.getByLabelText("Birim fiyat (satır 1)") as HTMLInputElement).value).toBe("92.4"), T);
    expect((screen.getByLabelText("KDV % (satır 1)") as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText("İsk. % (satır 1)") as HTMLInputElement).value).toBe("5");
    expect(within(grid()).getByText("310")).toBeTruthy();
    expect(calls.find((c) => c.url.endsWith("/fill"))?.body).toEqual({ field: "stockItemId", value: STOCK });
  });

  it("eski hesap yanıtı yenisinin üstüne yazılmaz", async () => {
    const pending: ((value: unknown) => void)[] = [];
    previewReplies = (body) => new Promise((resolve) => pending.push(() => resolve(previewOf(body))));
    show();
    await screen.findByText("SO-7", undefined, T);
    fireEvent.change(screen.getByLabelText("Miktar (satır 1)"), { target: { value: "5" } });
    await waitFor(() => expect(pending).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText("Miktar (satır 1)"), { target: { value: "7" } });
    await waitFor(() => expect(pending).toHaveLength(2), T);
    pending[1](undefined);
    await waitFor(() => expect(screen.getByTestId("belge-genel-toplam").textContent).toContain("960,00"), T);
    pending[0](undefined);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("belge-genel-toplam").textContent).toContain("960,00");
  });
});

describe("Belge kalıbı durumlar", () => {
  it("Onaylı belge salt okunurdur, Sevk kolonu görünür, geçişler sunucudan gelir", async () => {
    current = document("Open", ["onayiGeriAl", "iptal"]);
    show();
    await screen.findByText("SO-7", undefined, T);
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
    expect(screen.getByRole("button", { name: "Onayı geri al" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "İptal et" })).toBeTruthy();
    expect(within(grid()).getByText("Sevk edilen")).toBeTruthy();
    expect(within(grid()).getByText("1 / 2")).toBeTruthy();
    expect(screen.getByTestId("belge-durum").textContent).toBe("Onaylı");
  });

  it("Onayla geçişi gönderilir ve belge yeniden okunur", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Onayla" }, T));
    await waitFor(() => expect(screen.getByTestId("belge-durum").textContent).toBe("Onaylı"), T);
    expect(calls.some((c) => c.url.endsWith("/approve") && c.method === "POST")).toBe(true);
  });

  it("İptal et sebep ister ve gönderir", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "İptal et" }, T));
    await waitFor(() => expect(screen.getByTestId("belge-durum").textContent).toBe("İptal"), T);
    expect(calls.find((c) => c.url.endsWith("/cancel"))?.body).toMatchObject({ reason: "Müşteri vazgeçti" });
  });

  it("önizlemede kayıt ve geçiş gönderilmez", async () => {
    show({ isPreview: true });
    fireEvent.click(await screen.findByRole("button", { name: "Onayla" }, T));
    await screen.findByText("Önizlemede belge kaydedilmez ve durumu değişmez.");
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(calls.some((c) => c.method !== "GET" && !c.url.endsWith("/preview"))).toBe(false);
  });

  it("başka firmanın siparişi bulunamadı gösterir", async () => {
    show({ orderId: "dddddddd-dddd-dddd-dddd-dddddddddddd" });
    expect((await screen.findByRole("alert", undefined, T)).textContent).toContain("Belge bulunamadı.");
  });

  it("tuvalde örnek belge istenen durumla çizilir", async () => {
    show({ orderId: null, isPreview: true, previewState: "Open" });
    await waitFor(() => expect(screen.getByTestId("belge-durum").textContent).toBe("Onaylı"), T);
    expect(calls.some((c) => c.url === "/api/document-models/satis.siparis/sample?state=Open")).toBe(true);
  });
});

describe("Belge kalıbı sayfada", () => {
  it("template: belge sayfası id parametresiyle belgeyi çizer; §2 ayarı yoktur", async () => {
    setPageParams("custom-page:siparis-belgesi", { id: ORDER });
    render(<TenantCustomPage code="siparis-belgesi" token="t" />, { wrapper: CommandProvider });
    await screen.findByText("SO-7", undefined, T);
    expect((screen.getByLabelText("Miktar (satır 2)") as HTMLInputElement).value).toBe("1");
    const definition = JSON.stringify(belgeComponents);
    for (const setting of ["fillQuery", "fillColumns", "lookupFills", "formulas", "editableGrid", "calc:"]) expect(definition).not.toContain(setting);
  });
});
