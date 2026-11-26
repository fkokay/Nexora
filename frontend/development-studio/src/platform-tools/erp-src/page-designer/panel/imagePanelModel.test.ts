import { describe, expect, it } from "vitest";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { IMAGE_ADDRESS_INVALID, imageAddressProblem, imageOf, setImageAddress, setImageDescription, setImageFromRecord, setImageHeight } from "./imagePanelModel";

const image: ModelComponent = { id: "g1", type: "image", props: { slot: "top", title: "", value: "", height: 160, extra: "x" } };
const other: ModelComponent = { id: "o1", type: "heading", props: { text: "Başlık" } };
const def: ModelDefinition = { schemaVersion: 2, queries: [], components: [other, image] };
const imageIn = (d: ModelDefinition) => d.components.find((c) => c.id === "g1")!;

describe("imagePanelModel", () => {
  it("setImageAddress rejects javascript and http-less addresses via imageAddressProblem", () => {
    expect(imageAddressProblem("javascript:alert(1)")).toBe(IMAGE_ADDRESS_INVALID);
    expect(imageAddressProblem("ornek.com/a.png")).toBe(IMAGE_ADDRESS_INVALID);
    expect(imageAddressProblem("ftp://x/a.png")).toBe(IMAGE_ADDRESS_INVALID);
    expect(imageAddressProblem("https://ornek.com/a.png")).toBeNull();
    expect(imageAddressProblem("http://ornek.com/a.png")).toBeNull();
    expect(imageAddressProblem("")).toBeNull();
    expect(setImageAddress(def, "g1", "javascript:alert(1)")).toBe(def);
    expect(imageIn(setImageAddress(def, "g1", "https://ornek.com/a.png")).props.value).toBe("https://ornek.com/a.png");
    expect(imageIn(setImageAddress(def, "g1", "ornek")).props.value).toBe("ornek");
  });
  it("setImageAddress uses an allowlist (control chars and partial prefixes)", () => {
    for (const bad of ["java\tscript:alert(1)", "\u0001javascript:x", "data:x", "vbscript:x", "ja\nvascript:x"]) expect(setImageAddress(def, "g1", bad), bad).toBe(def);
    for (const ok of ["https://a.b/c.png", "h", "www", "http:", "https:", "htt"]) expect(imageIn(setImageAddress(def, "g1", ok)).props.value, ok).toBe(ok);
  });
  it("setImageFromRecord writes selected row binding", () => {
    const next = setImageFromRecord(def, "g1", "liste.seciliSatir.Logo");
    expect(imageIn(next).props.value).toBe("{{liste.seciliSatir.Logo}}");
    expect(imageOf(imageIn(next))).toMatchObject({ from: "record", column: "Logo", address: "" });
    expect(next.components.map((c) => c.id)).toEqual(["o1", "g1"]);
    expect(imageIn(next).props.extra).toBe("x");
  });
  it("imageOf maps 96 160 280 and leaves other heights null without changing them", () => {
    const at = (height: number) => ({ ...image, props: { ...image.props, height } });
    expect(imageOf(at(96)).height).toBe("small");
    expect(imageOf(at(160)).height).toBe("medium");
    expect(imageOf(at(280)).height).toBe("large");
    expect(imageOf(at(200)).height).toBeNull();
    const odd: ModelDefinition = { ...def, components: [at(200)] };
    expect(imageIn(setImageDescription(odd, "g1", "a")).props.height).toBe(200);
    expect(imageIn(setImageHeight(def, "g1", "large")).props.height).toBe(280);
    expect(imageIn(setImageHeight(def, "g1", "small")).props.height).toBe(96);
    expect(imageOf({ ...image, props: { ...image.props, title: "Vitrin" } }).description).toBe("Vitrin");
    expect(imageIn(setImageDescription(def, "g1", "Vitrin")).props.title).toBe("Vitrin");
  });
  it("functions never mutate input", () => {
    const snapshot = JSON.stringify(def);
    setImageAddress(def, "g1", "https://a.b/c"); setImageFromRecord(def, "g1", "l.seciliSatir.x"); setImageHeight(def, "g1", "large"); setImageDescription(def, "g1", "a");
    expect(JSON.stringify(def)).toBe(snapshot);
  });
});
