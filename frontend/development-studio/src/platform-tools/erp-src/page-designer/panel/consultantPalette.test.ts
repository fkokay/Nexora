import { describe, expect, it } from "vitest";
import { CONSULTANT_PALETTE, isCreatableKind, consultantAvailability, consultantKindOf, createConsultantComponent, type ConsultantKind } from "./consultantPalette";
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

  it("only text infoBox indicator image are available", () => {
    for (const kind of ["text", "infoBox", "indicator", "image"] as ConsultantKind[]) expect(consultantAvailability(kind)).toEqual({ available: true });
    expect(consultantAvailability("list")).toEqual({ available: false, reason: "Bu kalıpta tek liste vardır." });
    for (const kind of ["form", "lineTable", "recordSummary", "sections"] as ConsultantKind[]) expect(consultantAvailability(kind)).toEqual({ available: false, reason: "Bu bileşen sonraki sürümde gelir." });
    expect(consultantAvailability("buttons")).toEqual({ available: false, reason: "Düğmeleri Liste panelindeki Eylemler bölümünden ekleyin." });
    expect(consultantAvailability("developer")).toEqual({ available: false, reason: "Yazılımcı bileşenleri katalogdan gelecek; henüz hazır değil." });
  });

  it("createConsultantComponent returns expected type and props", () => {
    expect(createConsultantComponent("text", "a")).toEqual({ id: "a", type: "heading", props: { text: "Başlık" } });
    expect(createConsultantComponent("infoBox", "b")).toEqual({ id: "b", type: "alert", props: { variant: "info", title: "Bilgi", text: "" } });
    expect(createConsultantComponent("indicator", "c")).toEqual({ id: "c", type: "metric", props: { title: "Gösterge" } });
    expect(createConsultantComponent("image", "d")).toEqual({ id: "d", type: "image", props: { title: "", value: "", height: 160 } });
    expect(createConsultantComponent("text", "a").props).not.toHaveProperty("slot");
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
