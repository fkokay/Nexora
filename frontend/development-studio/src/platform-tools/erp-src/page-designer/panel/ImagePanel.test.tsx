import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { ImagePanel } from "./ImagePanel";

const def = (c: ModelComponent): ModelDefinition => ({ schemaVersion: 2, queries: [], components: [c] });
const tokens = [{ label: "Logo", binding: "liste.seciliSatir.logo" }];
const render = (c: ModelComponent) => renderToString(<ImagePanel component={c} definition={def(c)} tokens={tokens} onChange={() => {}} onRename={() => {}}/>);

describe("ImagePanel final review fixes 4 and 7", () => {
  it("shows a read-only note instead of a raw binding in the address box", () => {
    const html = render({ id: "i1", type: "image", name: "logo", props: { value: "{{kaynak.rows[0].resim}}" } });
    expect(html).toContain("Kayıttan gelen görsel");
    expect(html).not.toContain("{{");
    expect(html).not.toContain('aria-label="Görselin adresi"');
  });
  it("keeps the address box for a plain address", () => {
    const html = render({ id: "i1", type: "image", name: "logo", props: { value: "https://ornek.com/a.png" } });
    expect(html).toContain('aria-label="Görselin adresi"');
    expect(html).not.toContain("Kayıttan gelen görsel");
  });
  it("shows Görsel as placeholder of a nameless image", () => {
    expect(render({ id: "i1", type: "image", props: { value: "" } })).toContain('placeholder="Görsel"');
  });
});

describe("ImagePanel record options (5c)", () => {
  const empty = (c: ModelComponent) => renderToString(<ImagePanel component={c} definition={def(c)} tokens={[]} onChange={() => {}} onRename={() => {}}/>);
  it("image and text panels hide record options without tokens", () => {
    const html = empty({ id: "i1", type: "image", props: { value: "" } });
    expect(html).toContain("Adres");
    expect(html).not.toContain("Kayıttaki resim");
    expect(render({ id: "i1", type: "image", props: { value: "" } })).toContain("Kayıttaki resim");
  });
  it("reads a record-page binding as a record image and keeps the option when already bound", () => {
    const recordTokens = [{ label: "Logo", binding: "kayit.rows[0].logo" }];
    const c: ModelComponent = { id: "i1", type: "image", props: { value: "{{kayit.rows[0].logo}}" } };
    const html = renderToString(<ImagePanel component={c} definition={def(c)} tokens={recordTokens} onChange={() => {}} onRename={() => {}}/>);
    expect(html).toContain("Hangi alan?");
    expect(html).toMatch(/<option value="kayit\.rows\[0\]\.logo" selected/);
    expect(empty(c)).toContain("Kayıttaki resim");
  });
});
