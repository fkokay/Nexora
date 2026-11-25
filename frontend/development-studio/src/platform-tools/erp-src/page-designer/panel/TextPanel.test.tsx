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
