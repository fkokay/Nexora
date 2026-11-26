import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogComponent } from "../catalogClient";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { chooseComponent, developerComponentOf, pruneComponentSettings, setComponentSetting } from "./developerComponentModel";

const harita: CatalogComponent = { code: "satisHaritasi", label: "Satış haritası", description: "Bölgelere göre satış", height: 240, settings: [
  { name: "baslik", label: "Başlık", type: "text", options: [], default: "Bölgeler" },
  { name: "donem", label: "Dönem", type: "choice", options: ["Bu ay", "Bu çeyrek", "Bu yıl"], default: "Bu ay" },
  { name: "adet", label: "Adet", type: "number", options: [], default: null },
  { name: "etiketler", label: "Bölge adlarını göster", type: "bool", options: [], default: true },
] };
const takvim: CatalogComponent = { code: "takvim", label: "Teslimat takvimi", description: null, height: 300, settings: [
  { name: "baslik", label: "Başlık", type: "text", options: [], default: null },
  { name: "donem", label: "Dönem", type: "number", options: [], default: null },
] };
const catalog: ActiveCatalog = { version: "1", dataSources: [], actions: [], components: [harita, takvim] };
const other: ModelComponent = { id: "t1", type: "heading", props: { text: "Başlık" } };
const make = (props: Record<string, unknown>): ModelDefinition => ({ schemaVersion: 2, queries: [],
  components: [other, { id: "y1", type: "code", name: "harita", props: props as ModelComponent["props"] }] });
const propsOf = (def: ModelDefinition) => def.components.find((c) => c.id === "y1")!.props as Record<string, unknown>;

describe("developerComponentModel", () => {
  it("chooseComponent writes catalogComponent and drops undefined settings", () => {
    const start = make({ title: "Kutu", slot: "below", css: ".a{}", javascript: "x()", catalogComponent: "satisHaritasi",
      componentSettings: { baslik: "Akdeniz", donem: "Bu yıl", silinen: "eski", etiketler: false } });
    const next = chooseComponent(start, "y1", takvim);
    // Başlık hâlâ metin; Dönem artık sayı olduğu için metin değeri, tanımsız "silinen" ve "etiketler" düşer. Varsayılan yazılmaz.
    expect(propsOf(next)).toEqual({ title: "Kutu", slot: "below", catalogComponent: "takvim", componentSettings: { baslik: "Akdeniz" } });
    const fresh = chooseComponent(make({ slot: "below" }), "y1", harita);
    expect(propsOf(fresh)).toEqual({ slot: "below", catalogComponent: "satisHaritasi" });
    expect(next.components[0]).toBe(start.components[0]);
  });

  it("setComponentSetting rejects wrong type and choice outside options", () => {
    const start = chooseComponent(make({}), "y1", harita);
    expect(setComponentSetting(start, "y1", harita, "donem", "Gelecek yıl")).toBe(start);
    expect(setComponentSetting(start, "y1", harita, "adet", "12")).toBe(start);
    expect(setComponentSetting(start, "y1", harita, "adet", Number.NaN)).toBe(start);
    expect(setComponentSetting(start, "y1", harita, "etiketler", "true")).toBe(start);
    expect(setComponentSetting(start, "y1", harita, "baslik", 3)).toBe(start);
    expect(setComponentSetting(start, "y1", harita, "yok", "x")).toBe(start);
    let next = setComponentSetting(start, "y1", harita, "donem", "Bu yıl");
    next = setComponentSetting(next, "y1", harita, "adet", 12);
    next = setComponentSetting(next, "y1", harita, "etiketler", false);
    next = setComponentSetting(next, "y1", harita, "baslik", "Ege");
    expect(propsOf(next).componentSettings).toEqual({ donem: "Bu yıl", adet: 12, etiketler: false, baslik: "Ege" });
    // Boşaltılan metin ve sayı ayarı kaldırılır (varsayılan kullanılır).
    next = setComponentSetting(next, "y1", harita, "baslik", "");
    next = setComponentSetting(next, "y1", harita, "adet", null);
    expect(propsOf(next).componentSettings).toEqual({ donem: "Bu yıl", etiketler: false });
  });

  it("setComponentSetting clears values the component no longer defines", () => {
    const start = make({ catalogComponent: "satisHaritasi", componentSettings: { silinen: "eski", donem: 5 } });
    expect(propsOf(setComponentSetting(start, "y1", harita, "baslik", "Ege")).componentSettings).toEqual({ baslik: "Ege" });
    const emptied = setComponentSetting(make({ catalogComponent: "satisHaritasi", componentSettings: { baslik: "x" } }), "y1", harita, "baslik", "");
    expect(propsOf(emptied)).not.toHaveProperty("componentSettings");
  });

  it("developerComponentOf resolves component, missing flag and values", () => {
    expect(developerComponentOf(make({ catalogComponent: "takvim", componentSettings: { baslik: "A" } }), "y1", catalog))
      .toEqual({ comp: takvim, missing: false, values: { baslik: "A" } });
    expect(developerComponentOf(make({ catalogComponent: "kaldirilan", componentSettings: { a: 1 } }), "y1", catalog))
      .toEqual({ comp: null, missing: true, values: { a: 1 } });
    expect(developerComponentOf(make({ catalogComponent: "takvim" }), "y1", null)).toEqual({ comp: null, missing: true, values: {} });
    expect(developerComponentOf(make({}), "y1", catalog)).toEqual({ comp: null, missing: false, values: {} });
    expect(developerComponentOf(make({ catalogComponent: "takvim", componentSettings: "bozuk" }), "y1", catalog).values).toEqual({});
  });

  it("pruneComponentSettings drops stale settings of every catalog code before save", () => {
    const nested = { id: "kart", type: "card", props: {}, children: [{ id: "y2", type: "code", props: { catalogComponent: "takvim", componentSettings: { donem: "Bu ay", baslik: "Takvim" } } }] };
    const start: ModelDefinition = { schemaVersion: 2, queries: [], components: [other,
      { id: "y1", type: "code", props: { slot: "below", catalogComponent: "satisHaritasi", componentSettings: { baslik: "Ege", silinen: 1, adet: "3" } } as unknown as ModelComponent["props"] },
      nested as unknown as ModelComponent,
      { id: "y3", type: "code", props: { catalogComponent: "kaldirilan", componentSettings: { a: 1 } } as unknown as ModelComponent["props"] },
      { id: "y4", type: "code", props: { catalogComponent: "takvim", componentSettings: { donem: "x" } } as unknown as ModelComponent["props"] },
      { id: "satir", type: "code", props: { css: ".a{}", javascript: "x()" } }] };
    const snapshot = JSON.stringify(start);
    const next = pruneComponentSettings(start, catalog);
    expect(JSON.stringify(start)).toBe(snapshot);
    const by = (id: string) => next.components.find((c) => c.id === id)!.props as Record<string, unknown>;
    expect(by("y1")).toEqual({ slot: "below", catalogComponent: "satisHaritasi", componentSettings: { baslik: "Ege" } });
    expect((next.components[2].children as ModelComponent[])[0].props).toEqual({ catalogComponent: "takvim", componentSettings: { baslik: "Takvim" } });
    // Katalogda olmayan bileşen olduğu gibi kalır (sunucu adını söyleyerek reddeder); hepsi düşerse ayar nesnesi kalkar.
    expect(by("y3")).toEqual({ catalogComponent: "kaldirilan", componentSettings: { a: 1 } });
    expect(by("y4")).toEqual({ catalogComponent: "takvim" });
    expect(by("satir")).toEqual({ css: ".a{}", javascript: "x()" });
    // Değişiklik yoksa aynı tanım döner; katalog yoksa dokunulmaz.
    expect(pruneComponentSettings(next, catalog)).toBe(next);
    expect(pruneComponentSettings(start, null)).toBe(start);
  });

  it("functions never mutate input", () => {
    const start = make({ catalogComponent: "satisHaritasi", css: "a", componentSettings: { baslik: "A", silinen: 1 } });
    const snapshot = JSON.stringify(start);
    chooseComponent(start, "y1", takvim);
    setComponentSetting(start, "y1", harita, "baslik", "B");
    setComponentSetting(start, "y1", harita, "baslik", "");
    developerComponentOf(start, "y1", catalog);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
