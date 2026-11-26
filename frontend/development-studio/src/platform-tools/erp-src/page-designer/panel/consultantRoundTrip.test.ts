import { describe, expect, it } from "vitest";
import type { CatalogAction, CatalogComponent, CatalogDataSource } from "../catalogClient";
import { newListTemplateDefinition } from "../pageTemplates";
import { setPrimaryButton, slotButtons, toggleButtonAction } from "./buttonsPanelModel";
import { chooseIndicatorSource, setIndicatorCompare, setIndicatorKind, setIndicatorPlace, setIndicatorSize, setIndicatorTotal, setIndicatorValue } from "./indicatorPanelModel";
import { setImageAddress, setImageDescription, setImageFromRecord, setImageHeight } from "./imagePanelModel";
import { chooseDataSource, type ModelComponent, type ModelDefinition } from "./listPanelModel";
import { ensureTemplateSlots, TEMPLATE_SLOTS } from "./templateGuards";
import { setHideOnMobile, setInfoBox, setTextAlign, setTextContent, setTextStyle } from "./textPanelModel";
import { createConsultantComponent } from "./consultantPalette";
import { chooseComponent, setComponentSetting } from "./developerComponentModel";

const col = (code: string, label: string, type = "text", key = false) => ({ code, label, type, key, longText: false, required: false, maxLength: null });
const cariler: CatalogDataSource = {
  code: "cariler", label: "Cari hesaplar", source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: [col("id", "Kimlik", "text", true), col("kod", "Cari kodu"), col("logo", "Logo")],
};
const ozet: CatalogDataSource = { code: "cariOzet", label: "Cari bakiye özeti", source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: [col("alacak", "Toplam alacak", "money"), col("gecenAy", "Geçen ay alacak", "money"), col("hedef", "Hedef", "number"), col("durum", "Durum")] };
const ekstre: CatalogAction = { code: "ekstre", label: "Ekstre al", kind: "update", target: "row", source: "sql", erpOperation: null, parameters: [{ name: "id", type: "guid" }], confirmText: null };
const yeni: CatalogAction = { code: "yeniCari", label: "Yeni cari", kind: "update", target: "page", source: "sql", erpOperation: null, parameters: [], confirmText: null } as unknown as CatalogAction;

const harita: CatalogComponent = { code: "satisHaritasi", label: "Satış haritası", description: null, height: 240, settings: [
  { name: "baslik", label: "Başlık", type: "text", options: [], default: "Satış" },
  { name: "adet", label: "Bölge sayısı", type: "number", options: [], default: 5 },
  { name: "etiketler", label: "Etiketler", type: "bool", options: [], default: true },
  { name: "donem", label: "Dönem", type: "choice", options: ["Bu ay", "Bu yıl"], default: "Bu ay" },
] };
const takvim: CatalogComponent = { code: "teslimatTakvimi", label: "Teslimat takvimi", description: null, height: 300, settings: [] };

const LIST = "liste";
const place = (component: { id: string; type: string; props: ModelComponent["props"] }, slot: string): ModelComponent => ({ ...component, props: { ...component.props, slot } });
const start = (): ModelDefinition => {
  const base = chooseDataSource(newListTemplateDefinition() as unknown as ModelDefinition, LIST, cariler);
  return { ...base, components: [...base.components,
    place(createConsultantComponent("text", "metin"), "above"),
    place(createConsultantComponent("infoBox", "bilgi"), "below"),
    place(createConsultantComponent("indicator", "g1"), "indicators"),
    place(createConsultantComponent("indicator", "g2"), "indicators"),
    place(createConsultantComponent("image", "resim"), "below"),
    place(createConsultantComponent("developer", "yb", harita), "above"),
  ] };
};

const hasWidth = (components: unknown): boolean => Array.isArray(components) && components.some((c: ModelComponent) =>
  "width" in c.props || "widthWhen" in c.props || hasWidth(c.children));

type Step = [string, (def: ModelDefinition) => ModelDefinition];
const steps: Step[] = [
  ["text subheading", (d) => setTextStyle(d, "metin", "subheading")],
  ["text content", (d) => setTextContent(d, "metin", "Cari {{liste.seciliSatir.kod}}")],
  ["text align", (d) => setTextAlign(d, "metin", "center")],
  ["text label", (d) => setTextStyle(d, "metin", "label")],
  ["text hide on mobile", (d) => setHideOnMobile(d, "metin", true)],
  ["info plain", (d) => setInfoBox(d, "bilgi", { tone: "plain" })],
  ["info items", (d) => setInfoBox(d, "bilgi", { items: ["a", "b"], dismissible: true })],
  ["info warning", (d) => setInfoBox(d, "bilgi", { tone: "warning", title: "Dikkat" })],
  ["indicator source", (d) => chooseIndicatorSource(d, "g1", ozet)],
  ["indicator column", (d) => setIndicatorValue(d, "g1", "alacak", "money")],
  ["indicator compare", (d) => setIndicatorCompare(d, "g1", "gecenAy")],
  ["indicator size", (d) => setIndicatorSize(d, "g1", "lg")],
  ["indicator below", (d) => setIndicatorPlace(d, "g1", "below")],
  ["indicator back", (d) => setIndicatorPlace(d, "g1", "indicators")],
  ["second indicator progress", (d) => setIndicatorKind(d, "g2", "progress")],
  ["progress source", (d) => chooseIndicatorSource(d, "g2", ozet)],
  ["progress total", (d) => setIndicatorTotal(d, "g2", "hedef")],
  ["progress to status", (d) => setIndicatorKind(d, "g2", "status")],
  ["status value", (d) => setIndicatorValue(d, "g2", "durum")],
  ["image address", (d) => setImageAddress(d, "resim", "https://ornek.com/logo.png")],
  ["image height", (d) => setImageHeight(d, "resim", "large")],
  ["image description", (d) => setImageDescription(d, "resim", "Logo")],
  ["image from record", (d) => setImageFromRecord(d, "resim", "liste.seciliSatir.logo")],
  ["row button", (d) => toggleButtonAction(d, LIST, ekstre, cariler.columns.map((c) => c.code), "row")],
  ["page button", (d) => toggleButtonAction(d, LIST, yeni, cariler.columns.map((c) => c.code), "above")],
  ["developer text setting", (d) => setComponentSetting(d, "yb", harita, "baslik", "Bölgeler")],
  ["developer other component", (d) => chooseComponent(d, "yb", takvim)],
  ["developer back", (d) => chooseComponent(d, "yb", harita)],
  ["developer number setting", (d) => setComponentSetting(d, "yb", harita, "adet", 8)],
  ["developer bool setting", (d) => setComponentSetting(d, "yb", harita, "etiketler", false)],
  ["developer choice setting", (d) => setComponentSetting(d, "yb", harita, "donem", "Bu yıl")],
];

// Tasarımcı modülü büyük: soğuk dinamik içe aktarma yüklü makinede 5 sn sınırını aşabilir.
describe("Consultant panel output through the designer", { timeout: 30_000 }, () => {
  it("round trip: each panel setter then ensureTemplateSlots keeps server-valid slots and no width", async () => {
    const { designerInternals } = await import("../../CustomPagesPage");
    type Def = Parameters<typeof designerInternals.reconcileDefinition>[0];
    let def = start();
    expect(ensureTemplateSlots(def)).toBe(def);
    for (const [label, step] of steps) {
      const next = step(def);
      expect(next, label).not.toBe(def);
      def = next;
      expect(ensureTemplateSlots(def), label).toBe(def);
      expect(def.components.every((c) => typeof c.props.slot === "string" && TEMPLATE_SLOTS.has(c.props.slot)), label).toBe(true);
      expect(hasWidth(def.components), label).toBe(false);
      if (label === "status value") {
        const status = def.components.find((c) => c.id === "g2")!;
        expect(status.type).toBe("badge");
        expect(status.props.text).toMatch(/^\{\{[^{}]+\.rows\[0\]\.durum\}\}$/);
      }
    }
    const buttons = slotButtons(def, "actions");
    if (buttons.length > 1) def = setPrimaryButton(def, buttons[buttons.length - 1].id);
    expect(ensureTemplateSlots(def)).toBe(def);

    for (const queryEditable of [false, true]) {
      const reconciled = designerInternals.reconcileDefinition(def as unknown as Def, { catalog: { status: "ready", operations: [] }, previous: def as unknown as Def, queryEditable });
      expect(reconciled, `queryEditable=${queryEditable}`).toEqual(def);
    }
    // Yazılımcı bileşeni: başvuru ve ayar nesnesi uzlaştırmadan sağ çıkar; kod, CSS ve yükseklik sayfaya yazılmaz.
    const developer = def.components.find((c) => c.id === "yb")!;
    expect(developer.props.slot).toBe("above");
    expect(developer.props.catalogComponent).toBe("satisHaritasi");
    expect((developer.props as Record<string, unknown>).componentSettings).toEqual({ adet: 8, etiketler: false, donem: "Bu yıl" });
    for (const key of ["css", "javascript", "height"]) expect(developer.props, key).not.toHaveProperty(key);
    // Göstergelerin kaynak sorgusu (yalnız `{{…}}` bağlamasıyla kullanılan) uzlaştırmadan sağ çıkar.
    expect(def.queries.some((query) => (query as { dataSource?: string }).dataSource === "cariOzet")).toBe(true);
  });
});
