import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildCatalogRows, byKind, historyUrl, filterCatalogRows, kindCounts, moduleOptions, NO_MODULE, paginate, type CustomPageCatalogItem, type PageCatalogItem, type SystemPageItem } from "./pageCatalogModel";

vi.mock("./authApi", () => ({ authenticatedFetch: vi.fn(() => new Promise(() => {})) }));

const screens: PageCatalogItem[] = [
  { key: "inventory-stock", label: "Stok kartları", fields: [] },
  { key: "inventory-stock-movements", label: "Stok hareket geçmişi", fields: Array.from({ length: 6 }, (_, index) => ({ key: `f${index}`, label: `Alan ${index}`, defaultVisible: true })) },
];
const custom: CustomPageCatalogItem[] = [
  { id: "c1", code: "cari-listesi", name: "Cari hesaplar", isPublished: false, revision: 4, updatedAt: "2026-11-18T10:00:00Z" },
  { id: "c2", code: "qa-sayilar-testi", name: "QA sayılar testi", isPublished: true, revision: 2 },
];
const system: SystemPageItem[] = [
  { screenKey: "inventory-stock", title: "Stok", module: "Stok & Depo", version: 9, stage: "preview", screenViewKeys: ["inventory-stock"], draftId: "d1", newItemCount: 0, canEdit: true },
  { screenKey: "inventory-stock-create", title: "Yeni stok kartı", module: "Stok & Depo", version: 1, stage: "ready", screenViewKeys: [], newItemCount: 0, canEdit: true },
];

describe("sayfa kataloğu modeli", () => {
  const rows = buildCatalogRows(screens, custom, system);

  it("özel, sistem ve yerleşik sayfaları tek listede türleriyle birleştirir", () => {
    expect(rows.map((row) => [row.name, row.kind, row.code])).toEqual([
      ["Cari hesaplar", "custom", "/cari-listesi"],
      ["QA sayılar testi", "custom", "/qa-sayilar-testi"],
      ["Stok kartları", "system", "@inventory-stock"],
      ["Stok hareket geçmişi", "builtIn", "inventory-stock-movements"],
      ["Yeni stok kartı", "system", "@inventory-stock-create"],
    ]);
    expect(rows[2].statuses.map((status) => status.label)).toEqual(["Taslak var", "Önizleme"]);
    expect(rows[2].version).toBe(9);
    expect(rows[3].statuses[0].label).toBe("Görünüm ayarı · 6 alan");
    expect(rows[4].statuses[0].label).toBe("Standart");
    expect(rows[4].version).toBe(1);
    expect(historyUrl(rows[0])).toBe("/api/custom-pages/c1/history");
    expect(historyUrl(rows[2])).toBe("/api/system-pages/inventory-stock/history");
    expect(historyUrl(rows[3])).toBeNull();
    expect(historyUrl(rows[4])).toBeNull();
  });

  it("arama ad ve kodda çalışır; durum ve modül süzer; sayaçlar türe göre", () => {
    expect(filterCatalogRows(rows, { search: "qa-say", status: "all", module: "all" }).map((row) => row.name)).toEqual(["QA sayılar testi"]);
    expect(filterCatalogRows(rows, { search: "", status: "draft", module: "all" }).map((row) => row.name)).toEqual(["Cari hesaplar", "Stok kartları"]);
    expect(filterCatalogRows(rows, { search: "", status: "all", module: NO_MODULE }).length).toBe(3);
    expect(kindCounts(rows)).toEqual({ all: 5, custom: 2, system: 2, builtIn: 1 });
    expect(byKind(rows, "system").length).toBe(2);
    expect(moduleOptions(rows)).toEqual(["Stok & Depo"]);
  });

  it("25'lik sayfalara böler ve taşan sayfayı sona sıkıştırır", () => {
    const items = Array.from({ length: 103 }, (_, index) => index);
    expect(paginate(items, 1)).toMatchObject({ page: 1, pageCount: 5, from: 1, to: 25 });
    expect(paginate(items, 9)).toMatchObject({ page: 5, from: 101, to: 103 });
    expect(paginate([], 1)).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0 });
  });
});

describe("sayfa tasarımcısı girişi", () => {
  it("araç sekme şeridi yok; tek satır başlık ve Yeni sayfa düğmesi var", async () => {
    const { default: LowCodeDesignerPage } = await import("./LowCodeDesignerPage");
    const html = renderToString(<LowCodeDesignerPage token="t" role="TenantAdmin" initialSection="custom-pages" />);
    expect(html).not.toContain("low-code-designer-tabs");
    expect(html).not.toContain("LOW-CODE STUDIO");
    expect(html).toContain('href="#adaptation"');
    expect(html).toContain("Sayfa tasarımcısı");
    expect(html).toContain("Yeni sayfa");
  });

  it("diğer araçlar kendi başlığıyla açılır, sayfa listesi araç çubuğu olmadan", async () => {
    const { default: LowCodeDesignerPage } = await import("./LowCodeDesignerPage");
    const html = renderToString(<LowCodeDesignerPage token="t" role="TenantAdmin" initialSection="reports" />);
    expect(html).toContain("Rapor oluşturucu");
    expect(html).not.toContain("Sayfalarda ara");
  });
});
