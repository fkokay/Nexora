// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogComponent } from "../catalogClient";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { DEVELOPER_MISSING_IN_CATALOG, DeveloperComponentPanel } from "./DeveloperComponentPanel";

const harita: CatalogComponent = { code: "satisHaritasi", label: "Satış haritası", description: "Bölgelerin satış dağılımı", height: 240, settings: [
  { name: "baslik", label: "Başlık", type: "text", options: [], default: "Bölgelere göre satış" },
  { name: "donem", label: "Dönem", type: "choice", options: ["Bu ay", "Bu çeyrek", "Bu yıl"], default: "Bu ay" },
  { name: "adet", label: "Gösterilecek bölge sayısı", type: "number", options: [], default: 5 },
  { name: "etiketler", label: "Bölge adlarını göster", type: "bool", options: [], default: true },
  { name: "renk", label: "Renk", type: "choice", options: ["Mavi", "Yeşil", "Kırmızı", "Mor", "Turuncu"], default: null },
] };
const takvim: CatalogComponent = { code: "teslimatTakvimi", label: "Teslimat takvimi", description: null, height: 300, settings: [] };
const catalog: ActiveCatalog = { version: "1", dataSources: [], actions: [], components: [harita, takvim] };
const make = (props: Record<string, unknown>) => {
  const component: ModelComponent = { id: "y1", type: "code", props: props as ModelComponent["props"] };
  const definition: ModelDefinition = { schemaVersion: 2, queries: [], components: [component] };
  return { component, definition };
};
const render = (props: Record<string, unknown>, cat: ActiveCatalog | null = catalog, status: "loading" | "ready" | "failed" = "ready") =>
  renderToString(<DeveloperComponentPanel {...make(props)} catalog={cat} catalogStatus={status} onChange={() => {}} onRename={() => {}} visibility={<span>KOSUL</span>}/>);
const inOrder = (html: string, order: string[]) => {
  const at = order.map((text) => html.indexOf(text));
  order.forEach((text, i) => expect(at[i], text).toBeGreaterThanOrEqual(0));
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

describe("DeveloperComponentPanel", () => {
  it("renders parts in mockup order with developer settings", () => {
    const html = render({ catalogComponent: "satisHaritasi", componentSettings: { donem: "Bu yıl" } });
    inOrder(html, ["Yazılımcı bileşeni", "Hangi bileşen?", "Satış haritası", "Teslimat takvimi", "Bölgelerin satış dağılımı",
      "Yazılımcının yayınladığı bileşen · danışman kodunu görmez", "Başlık", "Bölgelere göre satış", "Dönem", "Bu ay", "Bu çeyrek", "Bu yıl",
      "Gösterilecek bölge sayısı", "Bölge adlarını göster", "Renk", "Turuncu", "Bu ayarları yazılımcı tanımladı.", "Görünüm", "Ne zaman görünsün?", "KOSUL", "Mobilde gizle"]);
    // ≤4 seçenek düğme grubu, fazlası açılır liste; seçili düğme kayıttaki değer.
    expect(html).toMatch(/aria-pressed="true"[^>]*>Bu yıl</);
    expect(html).toMatch(/<select[^>]*aria-label="Renk"/);
    expect(html).toContain('role="switch"');
    expect(html).toContain('type="number"');
  });

  it("panel marks missing component", () => {
    const html = render({ catalogComponent: "kaldirilanBilesen", componentSettings: { baslik: "x" } });
    expect(DEVELOPER_MISSING_IN_CATALOG).toBe("Bu bileşen katalogda yok; sayfayı kaydetmek için başka bir bileşen seçin ya da bileşeni kaldırın.");
    expect(html).toContain(DEVELOPER_MISSING_IN_CATALOG);
    expect(html).not.toContain("kaldirilanBilesen");
    expect(html).not.toMatch(/<option[^>]*selected=""[^>]*>Satış haritası/);
    expect(html).not.toContain("Bu ayarları yazılımcı tanımladı.");
    // Katalog henüz yüklenmemişken "yok" denmez.
    expect(render({ catalogComponent: "kaldirilanBilesen" }, null, "loading")).not.toContain(DEVELOPER_MISSING_IN_CATALOG);
    expect(render({ catalogComponent: "kaldirilanBilesen" }, null, "failed")).toContain("Katalog okunamadı.");
  });

  it("panel asks to pick when nothing is chosen and explains an empty catalog", () => {
    expect(render({})).toContain("Seçin");
    expect(render({}, { version: "1", dataSources: [], actions: [], components: [] })).toContain("Henüz yayınlanmış bir yazılımcı bileşeni yok.");
  });

  it("panel shows no technical words", () => {
    const html = render({ catalogComponent: "satisHaritasi", componentSettings: { baslik: "Ege", eski: "x" }, css: ".a{}", javascript: "x()" });
    for (const word of ["satisHaritasi", "teslimatTakvimi", "baslik", "donem", "etiketler", "eski", "ayarlar.", "CSS", "css", "JavaScript", "javascript", "catalogComponent", "componentSettings", "Eski ayarlar"])
      expect(html, word).not.toContain(word);
  });

  it("number setting commits on blur", async () => {
    const changes: ModelDefinition[] = [];
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<DeveloperComponentPanel {...make({ catalogComponent: "satisHaritasi" })} catalog={catalog} catalogStatus="ready"
      onChange={(next) => changes.push(next)} onRename={() => {}}/>));
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "1"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { setValue.call(input, "12"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(changes).toHaveLength(0);
    await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(changes).toHaveLength(1);
    expect((changes[0].components[0].props as Record<string, unknown>).componentSettings).toEqual({ adet: 12 });
    await act(async () => root.unmount()); host.remove();
  });
});
