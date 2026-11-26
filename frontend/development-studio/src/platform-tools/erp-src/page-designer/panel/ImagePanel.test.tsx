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
