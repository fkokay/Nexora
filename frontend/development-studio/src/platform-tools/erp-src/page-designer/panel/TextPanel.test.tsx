import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { InfoBoxPanel } from "./InfoBoxPanel";
import { TextPanel } from "./TextPanel";

const heading: ModelComponent = { id: "h1", type: "heading", name: "Başlık", props: { text: "Cari {{liste.seciliSatir.kod}} {{x.y}}", legacyThing: "a" } };
const alert: ModelComponent = { id: "a1", type: "alert", props: { variant: "info", title: "Vade", text: "Metin" } };
const def = (c: ModelComponent): ModelDefinition => ({ schemaVersion: 2, queries: [], components: [c] });
const tokens = [{ label: "Cari kodu", binding: "liste.seciliSatir.kod" }];
const common = { onChange: () => {}, onRename: () => {}, visibility: <span>KOSUL</span> };

const inOrder = (html: string, order: string[]) => {
  const at = order.map((text) => html.indexOf(text));
  order.forEach((text, i) => expect(at[i], text).toBeGreaterThanOrEqual(0));
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

describe("TextPanel", () => {
  it("renders parts in mockup order without tabs and without technical words", () => {
    const html = renderToString(<TextPanel component={heading} definition={def(heading)} tokens={tokens} {...common}/>);
    inOrder(html, ["Stil", "Alt başlık", "Paragraf", "Küçük etiket", "Metin", "Cari {Cari kodu} {?}",
      "Metin içine alan koymak için { yazın, örn. {Cari kodu}.", "Bu metinde tanınmayan bir alan var; kaydedersen korunur.",
      "Eylemler", "Bu bileşenin eylemi yok.", "Görünüm", "Hizalama", "Sol", "Orta", "Ne zaman görünsün?", "KOSUL", "Mobilde gizle", "Eski ayarlar (salt okunur)"]);
    for (const word of ["{{", "heading", "alert", "tablist", "role=\"dialog\""]) expect(html).not.toContain(word);
  });
});

describe("InfoBoxPanel", () => {
  const render = (c: ModelComponent) => renderToString(<InfoBoxPanel component={c} definition={def(c)} {...common}/>);
  it("shows items area only when list toggle on", () => {
    const off = render(alert);
    expect(off).toContain("Madde listesi olarak göster");
    expect(off).not.toContain("Maddeler (her satır bir madde)");
    const on = render({ ...alert, props: { ...alert.props, items: ["bir", "iki"] } });
    expect(on).toContain("Maddeler (her satır bir madde)");
    expect(on).toContain("bir\niki");
  });
  it("renders in order, disables dismiss on list, no technical words", () => {
    const html = render(alert);
    inOrder(html, ["Tür", "Bilgi", "Uyarı", "Başarılı", "Sade", "Başlık", "Metin", "Madde listesi olarak göster", "Eylemler", "Görünüm", "Kullanıcı kapatabilsin", "Ne zaman görünsün?", "Mobilde gizle"]);
    for (const word of ["{{", "alert", "variant"]) expect(html).not.toContain(word);
    const list = render({ id: "l1", type: "list", props: { title: "T", items: ["a"] } });
    expect(list).toMatch(/Kullanıcı kapatabilsin<input[^>]*disabled/);
    expect(html).not.toMatch(/Kullanıcı kapatabilsin<input[^>]*disabled/);
  });
});

describe("TextPanel special cases", () => {
  it("shows title of a heading and the parts note for multi-part text", () => {
    const h: ModelComponent = { id: "h2", type: "heading", props: { title: "Gerçek başlık", text: "eski" } };
    expect(renderToString(<TextPanel component={h} definition={def(h)} tokens={[]} {...common}/>)).toContain("Gerçek başlık");
    const t: ModelComponent = { id: "t2", type: "text", props: { text: "x", parts: ["a", "b"] } };
    const html = renderToString(<TextPanel component={t} definition={def(t)} tokens={[]} {...common}/>);
    expect(html).toContain("Bu metin birden çok parçadan oluşuyor; eski ayarlardan düzenlenir.");
    expect(html).toContain("parts");
  });
  it("info box dismissible switch is off on list", () => {
    const l: ModelComponent = { id: "l1", type: "list", props: { title: "T", items: ["a"], dismissible: true } };
    expect(renderToString(<InfoBoxPanel component={l} definition={def(l)} {...common}/>)).not.toMatch(/Kullanıcı kapatabilsin<input[^>]*checked/);
  });
});
