import { describe, expect, it } from "vitest";
import { CONSULTANT_PALETTE, isCreatableKind, consultantAvailability, consultantDescription, consultantKindOf, consultantLayerLabel, createConsultantComponent, type ConsultantKind } from "./consultantPalette";
import { designerInternals } from "../../CustomPagesPage";

const comp = (type: string, props: Record<string, string | number | boolean | string[]> = {}, extra: Record<string, unknown> = {}) => ({ id: "x", type, props, ...extra });

describe("consultantPalette", () => {
  it("palette has eleven items in mockup order", () => {
    expect(CONSULTANT_PALETTE.map((item) => item.label)).toEqual(["Metin", "Bilgi kutusu", "Gösterge", "Liste", "Form", "Satır tablosu", "Kayıt özeti", "Bölümler", "Butonlar", "Görsel", "Yazılımcı bileşeni"]);
    expect(CONSULTANT_PALETTE.map((item) => item.kind)).toEqual(["text", "infoBox", "indicator", "list", "form", "lineTable", "recordSummary", "sections", "buttons", "image", "developer"]);
    expect(CONSULTANT_PALETTE[0].description).toBe("Başlık, açıklama, etiket");
    expect(CONSULTANT_PALETTE[3].description).toBe("Kayıtları listeler");
    expect(CONSULTANT_PALETTE.map((item) => item.description)).toEqual(["Başlık, açıklama, etiket", "Bilgi, uyarı, madde listesi", "Sayı, ilerleme, durum", "Kayıtları listeler", "Kayıt alanları", "Belge satırları", "Kaydın kimlik bilgisi", "Sekmeler ya da adımlar", "Sayfa eylemleri", "Resim ya da logo", "Özel çizim, harita, grafik…"]);
  });

  it("isCreatableKind accepts exactly the four ready kinds", () => {
    expect(CONSULTANT_PALETTE.filter((item) => isCreatableKind(item.kind)).map((item) => item.kind)).toEqual(["text", "infoBox", "indicator", "image"]);
  });

  it("list palette is unchanged from 5a", () => {
    for (const kind of ["text", "infoBox", "indicator", "image"] as ConsultantKind[]) expect(consultantAvailability(kind, "list")).toEqual({ available: true });
    expect(consultantAvailability("list", "list")).toEqual({ available: false, reason: "Bu kalıpta tek liste vardır." });
    for (const kind of ["form", "lineTable", "recordSummary", "sections"] as ConsultantKind[]) expect(consultantAvailability(kind, "list")).toEqual({ available: false, reason: "Bu bileşen sonraki sürümde gelir." });
    expect(consultantAvailability("buttons", "list")).toEqual({ available: false, reason: "Düğmeleri Liste panelindeki Eylemler bölümünden ekleyin." });
    expect(consultantAvailability("developer", "list")).toEqual({ available: false, reason: "Yazılımcı bileşenleri katalogdan gelecek; henüz hazır değil." });
  });

  it("createConsultantComponent returns expected type and props", () => {
    expect(createConsultantComponent("text", "a")).toEqual({ id: "a", type: "heading", props: { text: "Başlık" } });
    expect(createConsultantComponent("infoBox", "b")).toEqual({ id: "b", type: "alert", props: { variant: "info", title: "Bilgi", text: "" } });
    expect(createConsultantComponent("indicator", "c")).toEqual({ id: "c", type: "metric", props: { title: "Gösterge" } });
    expect(createConsultantComponent("image", "d")).toEqual({ id: "d", type: "image", props: { title: "", value: "", height: 160 } });
    expect(createConsultantComponent("text", "a").props).not.toHaveProperty("slot");
  });

  it("consultantLayerLabel gives consultant names for template parts, free blocks and items", () => {
    expect(consultantLayerLabel(comp("section", { slot: "block" }))).toBe("Bölüm");
    expect(consultantLayerLabel(comp("formCard", { slot: "section" }))).toBe("Bölüm");
    expect(consultantLayerLabel(comp("tabs", { slot: "tabs" }))).toBe("Sekmeler");
    expect(consultantLayerLabel(comp("recordHeader", { slot: "summary" }))).toBe("Kayıt özeti");
    expect(consultantLayerLabel(comp("input", { slot: "field" }))).toBe("Alan");
    expect(consultantLayerLabel(comp("dataTable", { slot: "item" }))).toBe("Liste");
    expect(consultantLayerLabel(comp("dataTable", { slot: "list" }))).toBe("Liste");
    expect(consultantLayerLabel(comp("button", { slot: "actions" }))).toBe("Düğme");
    expect(consultantLayerLabel(comp("metric", { slot: "item" }))).toBe("Gösterge");
    expect(consultantLayerLabel(comp("alert", { slot: "item" }))).toBe("Bilgi kutusu");
    expect(consultantLayerLabel(comp("heading", { slot: "item" }))).toBe("Metin");
    // Serbest gövdenin metin bileşeni de `section` tipinde olabilir: bölüm yalnız `slot: block`.
    expect(consultantLayerLabel(comp("section", { slot: "item" }))).toBe("Metin");
    expect(consultantLayerLabel(comp("image", { slot: "item" }))).toBe("Görsel");
    // Danışman karşılığı olmayan tip: çağıran kendi adını kullanır.
    expect(consultantLayerLabel(comp("contextPanel", { slot: "detail" }))).toBeNull();
  });

  it("consultantKindOf maps every current type per spec table", () => {
    for (const type of ["heading", "text", "label", "section"]) expect(consultantKindOf(comp(type))).toBe("text");
    for (const type of ["alert", "card", "list"]) expect(consultantKindOf(comp(type))).toBe("infoBox");
    for (const type of ["metric", "progress", "badge"]) expect(consultantKindOf(comp(type))).toBe("indicator");
    expect(consultantKindOf(comp("image"))).toBe("image");
    expect(consultantKindOf(comp("button"))).toBe("buttons");
    for (const type of ["dataTable", "input", "form", "code", "dialog", "tabs"]) expect(consultantKindOf(comp(type))).toBeNull();
    expect(consultantKindOf(comp("heading", { pageTitle: true }))).toBeNull();
  });

  it("consultantKindOf returns null for components with children and for panel cards", () => {
    expect(consultantKindOf(comp("card", {}, { children: [comp("text")] }))).toBeNull();
    expect(consultantKindOf(comp("section", {}, { children: [comp("text")] }))).toBeNull();
    expect(consultantKindOf(comp("card", {}, { children: [] }))).toBe("infoBox");
    expect(consultantKindOf(comp("card", { variant: "panel" }))).toBeNull();
    expect(consultantKindOf(comp("card", { variant: "info" }))).toBe("infoBox");
  });

  it("managedKeys contains new props", () => {
    for (const key of ["textAlign", "items", "dismissible", "compareValue", "size", "progressTotal"]) expect(designerInternals.managedKeys.has(key)).toBe(true);
  });

  it("legacy page keeps full grouped palette", () => {
    const types = designerInternals.palette.map((item) => item.type);
    for (const type of ["divider", "spacer", "heading", "text", "label", "card", "section", "metric", "progress", "list", "image", "button", "alert", "badge", "dataTable"]) expect(types).toContain(type);
    expect(designerInternals.palette).toHaveLength(30);
    expect(designerInternals.paletteGroups).toEqual(["Tasarım dili", "Metin ve düzen", "Veri", "Eylem ve form", "Bildirim ve gelişmiş"]);
  });
});

describe("consultantAvailability per template (5c Karar 10)", () => {
  it("free palette enables text infoBox indicator list sections image", () => {
    for (const kind of ["text", "infoBox", "indicator", "list", "sections", "image"] as ConsultantKind[]) expect(consultantAvailability(kind, "free")).toEqual({ available: true });
  });

  it("free palette disables form and recordSummary with record reason, lineTable with document reason, buttons with page-actions reason", () => {
    for (const kind of ["form", "recordSummary"] as ConsultantKind[]) expect(consultantAvailability(kind, "free")).toEqual({ available: false, reason: "Bu bileşen Kayıt kartı kalıbında kullanılır." });
    expect(consultantAvailability("lineTable", "free")).toEqual({ available: false, reason: "Düzenlenebilir satırlar Belge kalıbıyla gelecek." });
    expect(consultantAvailability("buttons", "free")).toEqual({ available: false, reason: "Düğmeleri sayfa panelindeki Eylemler bölümünden ekleyin." });
    expect(consultantAvailability("developer", "free")).toEqual({ available: false, reason: "Yazılımcı bileşenleri katalogdan gelecek; henüz hazır değil." });
  });

  it("record palette reasons for form recordSummary lineTable", () => {
    for (const kind of ["form", "recordSummary", "lineTable"] as ConsultantKind[]) expect(consultantAvailability(kind, "record")).toEqual({ available: false, reason: "Kartın kendi alanlarını sol listeden ekleyin." });
    // Geri kalanı 5a'daki gibi.
    for (const kind of ["text", "infoBox", "indicator", "image", "list", "sections", "buttons", "developer"] as ConsultantKind[]) expect(consultantAvailability(kind, "record")).toEqual(consultantAvailability(kind, "list"));
  });

  it("free palette describes Bölümler as adding a block", () => {
    expect(consultantDescription("sections", "free")).toBe("Yeni bölüm ekler");
    expect(consultantDescription("sections", "list")).toBe("Sekmeler ya da adımlar");
    expect(consultantDescription("text", "free")).toBe("Başlık, açıklama, etiket");
  });
});

describe("consultantKindOf strip alert (final review fix 3)", () => {
  it("returns null for an alert with a non-empty icon and infoBox otherwise", () => {
    expect(consultantKindOf(comp("alert", { icon: "shield" }))).toBeNull();
    expect(consultantKindOf(comp("alert", { icon: "" }))).toBe("infoBox");
    expect(consultantKindOf(comp("alert", { variant: "info" }))).toBe("infoBox");
  });
});
