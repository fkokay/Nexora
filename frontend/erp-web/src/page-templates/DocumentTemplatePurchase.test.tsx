import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../erpApi";
import { DocumentTemplate } from "./DocumentTemplate";
import { layoutDocumentTemplate, type BelgeComponent } from "./documentTemplateModel";

vi.mock("../erpApi", () => ({ api: vi.fn() }));
vi.mock("../authApi", () => ({ authenticatedFetch: vi.fn() }));
vi.mock("../confirmDialog", () => ({ confirmDialog: vi.fn(async () => true), promptDialog: vi.fn(async () => "gerekçe") }));
const mockedApi = vi.mocked(api);
const DRAFT = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const components: BelgeComponent[] = [
  { id: "baslik", type: "documentFields", props: { slot: "fields", fields: ["invoiceNumber", "supplierId", "invoiceDate", "dueDate", "currencyCode", "notes"], labels: {} } },
  { id: "satirlar", type: "documentLines", props: { slot: "lines", columns: ["description", "quantity", "unitCode", "unitPrice", "vatRate", "total"], labels: {}, density: "normal" } },
  { id: "toplamlar", type: "documentSummary", props: { slot: "summary", vatBreakdown: true, activity: true } },
];
const model = { code: "satinalma.fatura", label: "Satınalma faturası", fields: [
  ...[ ["invoiceNumber", "Tedarikçi fatura no", "text", true], ["supplierId", "Tedarikçi", "lookup", true], ["invoiceDate", "Fatura tarihi", "date", true],
    ["dueDate", "Vade", "date", false], ["currencyCode", "Para birimi", "text", true], ["notes", "Notlar", "text", false] ]
    .map(([code, label, type, required]) => ({ code, label, type, required, optionsOperation: code === "supplierId" ? "satinalma.faturaTaslagi.tedarikciler" : null, readOnly: false })),
  ], lineColumns: [ ["description", "Açıklama", "text", true, false], ["quantity", "Miktar", "number", false, false], ["unitCode", "Birim", "text", false, false],
    ["unitPrice", "Birim fiyat", "number", false, false], ["vatRate", "KDV %", "number", false, false], ["total", "Satır toplamı", "number", false, true] ]
    .map(([code, label, type, required, calculated]) => ({ code, label, type, required, calculated, optionsOperation: null, visibleFrom: null })),
  states: [{ code: "Draft", label: "Taslak", terminal: false }, { code: "Posted", label: "Muhasebeleşti", terminal: true }], transitions: [], fills: {} };
const doc = { invoice: { id: DRAFT, code: "GF-77", invoiceNumber: "GF-77", supplierId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", supplierName: "Örnek Tedarikçi",
  invoiceDate: "2026-11-27", dueDate: "2026-12-27", currencyCode: "TRY", status: "Draft", rowVersion: "AQID", notes: "Korunacak not",
  lines: [{ lineNumber: 1, description: "Kargo", quantity: 2, unitCode: "ADET", unitPrice: 100, subtotal: 200, discountAmount: 0, taxAmount: 40, total: 240,
    expenseAccountId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", vatRate: 20 }] },
  amounts: { currencyCode: "TRY", subtotal: 200, discountTotal: 0, taxTotal: 40, grandTotal: 240, vat: [{ rate: 20, taxableAmount: 200, amount: 40 }] },
  allowedTransitions: [], activity: [], activityStartedLate: false };

describe("Satınalma belge modeli", () => {
  beforeEach(() => mockedApi.mockImplementation((async (url: string, _token?: string, init?: RequestInit) => {
    if (!url) return {};
    if (url === "/api/document-models/satinalma.fatura") return model;
    if (url === `/api/purchasing/standalone-invoices/${DRAFT}/document`) return doc;
    if (url === "/api/document-models/satinalma.fatura/calculate") return { currencyCode: "TRY", subtotal: 300, discountTotal: 0, taxTotal: 60, grandTotal: 360, vat: [{ rate: 20, taxableAmount: 300, amount: 60 }] };
    if (url === `/api/purchasing/standalone-invoices/${DRAFT}` && init?.method === "PUT") return { id: DRAFT };
    throw Object.assign(new Error(`beklenmeyen istek ${String(url)} ${String(init?.method)}`), { status: 404 });
  }) as never));
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("taslak faturayı çizer, değişikliği hesap ucuna gönderir ve PUT ile kaydeder", async () => {
    render(<DocumentTemplate document="satinalma.fatura" layout={layoutDocumentTemplate(components)} orderId={DRAFT} isPreview={false} title="Satınalma faturası" />);
    expect(await screen.findByText("GF-77")).toBeTruthy();
    expect((screen.getByLabelText("Tedarikçi fatura no *") as HTMLInputElement).value).toBe("GF-77");
    expect((screen.getByLabelText("Açıklama (satır 1)") as HTMLInputElement).value).toBe("Kargo");
    fireEvent.change(screen.getByLabelText("Miktar (satır 1)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(mockedApi.mock.calls.some(([url, , init]) => url === `/api/purchasing/standalone-invoices/${DRAFT}` && init?.method === "PUT")).toBe(true));
    const request = mockedApi.mock.calls.find(([url, , init]) => url === `/api/purchasing/standalone-invoices/${DRAFT}` && init?.method === "PUT")?.[2];
    expect(JSON.parse(String(request?.body))).toMatchObject({ expectedRowVersion: "AQID", supplierId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", invoiceNumber: "GF-77",
      notes: "Korunacak not", lines: [{ lineNumber: 1, description: "Kargo", quantity: 3, vatRate: 20 }] });
  });
});
