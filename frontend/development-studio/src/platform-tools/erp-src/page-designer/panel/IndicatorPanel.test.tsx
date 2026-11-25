import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogDataSource } from "../catalogClient";
import { newListTemplateDefinition } from "../pageTemplates";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { chooseIndicatorSource, setIndicatorCompare, setIndicatorKind, setIndicatorValue } from "./indicatorPanelModel";
import { IndicatorPanel } from "./IndicatorPanel";

const col = (code: string, label: string, type = "text") => ({ code, label, type, key: false });
const ozet: CatalogDataSource = { code: "cariOzet", label: "Cari bakiye özeti", source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: [col("alacak", "Toplam alacak", "money"), col("gecenAy", "Geçen ay alacak", "money")] };
const aranan: CatalogDataSource = { ...ozet, code: "aranan", label: "Aranan kayıtlar", parameters: [{ name: "q", type: "text" }] };
const catalog: ActiveCatalog = { version: "1", dataSources: [ozet, aranan], actions: [] };
const start = () => {
  const base = newListTemplateDefinition() as unknown as ModelDefinition;
  const metric: ModelComponent = { id: "g1", type: "metric", name: "Alacak", props: { slot: "indicators", title: "Gösterge", toneMap: "x=y" } };
  return { ...base, components: [...base.components, metric] } as ModelDefinition;
};
const props = (def: ModelDefinition, cat: ActiveCatalog | null = catalog) => ({
  definition: def, component: def.components.find((c) => c.id === "g1")!, catalog: cat, catalogStatus: "ready" as const,
  operationOf: () => undefined, onChange: () => {}, onRename: () => {}, visibility: <span>KOSUL</span>,
});
const inOrder = (html: string, order: string[]) => {
  const at = order.map((text) => html.indexOf(text));
  order.forEach((text, i) => expect(at[i], text).toBeGreaterThanOrEqual(0));
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

describe("IndicatorPanel", () => {
  it("renders parts in mockup order for a number", () => {
    let def = chooseIndicatorSource(start(), "g1", ozet);
    def = setIndicatorValue(def, "g1", "alacak", "money");
    def = setIndicatorCompare(def, "g1", "gecenAy");
    const html = renderToString(<IndicatorPanel {...props(def)}/>);
    inOrder(html, ["Bileşen adı", "Yeri", "Göstergeler", "Listenin üstü", "Listenin altı", "Tür", "Sayı", "İlerleme", "Durum", "Ne gösterilsin?",
      "Cari bakiye özeti", "Değer", "Kayıt sayısı", "Toplam alacak",
      "Yazılımcının hazırladığı değer · birimi ondan gelir", "Önceki değerle karşılaştır", "Neyle karşılaştırılsın?", "Eylemler", "Görünüm", "Boyut", "Küçük", "Büyük", "Ne zaman görünsün?", "KOSUL", "Mobilde gizle"]);
  });
  it("greys unusable sources with reason and shows target only for progress", () => {
    const html = renderToString(<IndicatorPanel {...props(start())}/>);
    expect(html).toContain("Bu kaynak ek bilgi istiyor; göstergede kullanılamaz.");
    expect(html).not.toContain("Hedef");
    const progress = chooseIndicatorSource(setIndicatorKind(start(), "g1", "progress"), "g1", ozet);
    const ph = renderToString(<IndicatorPanel {...props(progress)}/>);
    expect(ph).toContain("Hedef");
    expect(ph).toContain("İlerleme göstergeler sırasına konamaz");
    expect(ph).not.toContain(">Göstergeler<");
    expect(ph).not.toContain("Kayıt sayısı");
    expect(ph).not.toContain("Boyut");
  });
  it("marks missing source and has no technical words", () => {
    const def = chooseIndicatorSource(start(), "g1", { ...ozet, code: "kalkti", label: "Kalkan" });
    const html = renderToString(<IndicatorPanel {...props(def)}/>);
    expect(html).toContain("Katalogda yok");
    expect(html).toContain("Eski ayarlar (salt okunur)");
    expect(html).toContain("toneMap");
    for (const word of ["{{", "rows[0]", "metric", "badge"]) expect(html).not.toContain(word);
  });
});
describe("IndicatorPanel final review fixes 4 and 7", () => {
  it("names a deleted source and a deleted column without codes", () => {
    const gone = chooseIndicatorSource(start(), "g1", { ...ozet, code: "kalkti", label: "Kalkan" });
    const html = renderToString(<IndicatorPanel {...props(gone)}/>);
    expect(html).toContain("Silinmiş kaynak");
    expect(html).not.toContain("kalkti");
    const def = setIndicatorValue(chooseIndicatorSource(start(), "g1", ozet), "g1", "eskiKolon", "money");
    const column = renderToString(<IndicatorPanel {...props(def)}/>);
    expect(column).toContain("Silinmiş alan · Katalogda yok");
    expect(column).not.toContain("eskiKolon ·");
  });
  it("shows Gösterge as placeholder of a nameless indicator", () => {
    const def = start();
    const nameless = { ...def, components: def.components.map((c) => c.id === "g1" ? { ...c, name: undefined } : c) };
    expect(renderToString(<IndicatorPanel {...props(nameless)}/>)).toContain('placeholder="Gösterge"');
  });
});
