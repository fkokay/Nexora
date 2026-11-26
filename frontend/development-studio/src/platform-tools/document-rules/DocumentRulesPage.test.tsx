// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../erp-src/authApi", () => ({ authenticatedFetch: fetchMock }));
import DocumentRulesPage from "./DocumentRulesPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fields = [{ code: "grandTotal", label: "Genel toplam", kind: "number" }, { code: "customerGroup", label: "Cari grubu", kind: "text" },
  { code: "maxLineDiscount", label: "En yüksek satır iskontosu", kind: "number" }];
const operators = { number: ["GreaterThan", "Equals"], text: ["Equals", "Contains"], date: ["Before"] };
const people = [{ id: "m", displayName: "Mehmet Demir", email: "m@x", role: "TenantUser" }];
const rule = { code: "kural1", order: 1, enabled: true, always: false, field: "grandTotal", op: "GreaterThan", value: "100000", action: "approval", approverUserIds: ["m"], message: null };
const view = (draftRules: unknown[] | null, publishedRules: unknown[] | null = null) => ({
  fields, operators,
  published: publishedRules ? { version: 1, status: "Published", rules: publishedRules, updatedAt: "2026-11-26T09:00:00Z", publishedAt: "2026-11-26T09:00:00Z" } : null,
  draft: draftRules ? { version: 2, status: "Draft", rules: draftRules, updatedAt: "2026-11-26T10:00:00Z", publishedAt: null } : null,
  history: [],
});

let calls: { url: string; method: string; body: unknown }[];
let rulesStatus: number;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  calls = [];
  rulesStatus = 200;
  fetchMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.endsWith("/people")) return json(people);
    if (url.endsWith("/onayla") && method === "GET") return rulesStatus === 200 ? json(view(null, [rule])) : json({}, rulesStatus);
    if (url.endsWith("/draft")) return json(view((body as { rules: unknown[] }).rules, [rule]));
    if (url.endsWith("/publish")) return json(view(null, [rule]));
    if (url.endsWith("/try")) return json({ result: "approval", steps: [{ step: "Kontroller", source: "core", outcome: "skipped", message: null },
      { step: "kural1", source: "rule", outcome: "waiting", message: "Mehmet Demir" }], approvers: people, actorExcluded: false, usedDraft: true });
    return json({}, 404);
  });
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<DocumentRulesPage token="t"/>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return host;
}
const button = (el: HTMLElement, text: string) => [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const click = async (element: Element) => { await act(async () => { (element as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); }); };
const setValue = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  await act(async () => {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};

describe("Kurallar ekranı (taslak 10)", () => {
  it("yayındaki kuralı cümle olarak gösterir; taslak yokken Yayınla kapalıdır", async () => {
    const el = await mount();
    expect(el.querySelector(".dr-rules")?.textContent).toContain("Eğer Genel toplam > 100.000 ₺ ise");
    expect(el.querySelector(".dr-rules")?.textContent).toContain("Onay iste: Mehmet Demir");
    expect(button(el, "Yayınla").disabled).toBe(true);
  });

  it("kişisiz onay kuralı eklenemez; kişi seçilince taslağa yazılır ve Yayınla açılır", async () => {
    const el = await mount();
    await click(button(el, "+ Kural ekle"));
    await setValue(el.querySelector('input[aria-label="Değer"]') as HTMLInputElement, "50000");
    expect(button(el, "Kuralı ekle").disabled).toBe(true);
    expect(el.textContent).toContain("Onaylayacak 1–5 kişi seçin.");
    await click(button(el, "Mehmet Demir"));
    await click(button(el, "Kuralı ekle"));
    const draft = calls.find((c) => c.url.endsWith("/draft"));
    expect((draft?.body as { rules: { value: string; approverUserIds: string[] }[] }).rules.map((r) => [r.value, r.approverUserIds])).toEqual([["100000", ["m"]], ["50000", ["m"]]]);
    expect(button(el, "Yayınla").disabled).toBe(false);
    await click(button(el, "Yayınla"));
    expect(calls.some((c) => c.url.endsWith("/publish") && c.method === "POST")).toBe(true);
  });

  it("Dene sonucu gösterir", async () => {
    const el = await mount();
    await click(button(el, "“Onayla” geçişini dene"));
    expect(calls.find((c) => c.url.endsWith("/try"))?.body).toMatchObject({ facts: { grandTotal: "120000" } });
    expect(el.querySelector('[data-testid="dr-result"]')?.textContent).toContain("Onay bekliyor'a geçerdi · karar: Mehmet Demir");
  });

  it("öteki geçişlerde yalnız modülün adımları görünür", async () => {
    const el = await mount();
    await click(button(el, "İptal et"));
    expect(el.querySelector(".dr-main")?.textContent).toContain("Rezervasyon bırakılır, bekleyen onay akışı kapatılır");
    expect(el.querySelector(".dr-rules")).toBeNull();
    expect(button(el, "+ Kural ekle")).toBeUndefined();
  });

  it("izin yoksa okuma uyarısı gösterilir", async () => {
    rulesStatus = 403;
    const el = await mount();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("okuma izni gerekir");
  });
});
