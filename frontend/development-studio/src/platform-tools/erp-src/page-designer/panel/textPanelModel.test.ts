import { describe, expect, it } from "vitest";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { infoBoxOf, setInfoBox, setTextAlign, setTextContent, setTextStyle, textStyleOf } from "./textPanelModel";

const def = (...components: ModelComponent[]): ModelDefinition => ({ schemaVersion: 2, queries: [], components });
const heading: ModelComponent = { id: "h1", type: "heading", name: "baslik", props: { slot: "above", text: "Cari Hesaplar", textAlign: "center", visibleWhen: "{{baslik}}" } };
const tabs: ModelComponent = { id: "t1", type: "tabs", props: { tabs: ["Genel=h1", "Ayrıntı="], defaultTab: 0 } };
const component = (d: ModelDefinition, id: string) => d.components.find((c) => c.id === id)!;

describe("textPanelModel", () => {
  it("setTextStyle heading to subheading moves text to title and keeps id name slot", () => {
    const next = component(setTextStyle(def(heading), "h1", "subheading"), "h1");
    expect(next).toMatchObject({ id: "h1", name: "baslik", type: "section" });
    expect(next.props).toEqual({ slot: "above", title: "Cari Hesaplar", textAlign: "center", visibleWhen: "{{baslik}}" });
    expect(textStyleOf(next)).toBe("subheading");
    const back = component(setTextStyle(def(next), "h1", "paragraph"), "h1");
    expect(back.type).toBe("text");
    expect(back.props.text).toBe("Cari Hesaplar");
    expect("title" in back.props).toBe(false);
  });
  it("setTextStyle keeps tab membership and references", () => {
    const next = setTextStyle(def(tabs, heading), "h1", "label");
    expect(component(next, "t1")).toEqual(tabs);
    expect(component(next, "h1").props.visibleWhen).toBe("{{baslik}}");
    expect(next.components.map((c) => c.id)).toEqual(["t1", "h1"]);
  });
  it("setTextContent writes to the key of the style", () => {
    expect(component(setTextContent(def(heading), "h1", "Yeni"), "h1").props.text).toBe("Yeni");
    const sub = setTextStyle(def(heading), "h1", "subheading");
    expect(component(setTextContent(sub, "h1", "Yeni"), "h1").props.title).toBe("Yeni");
  });
  it("setTextAlign start removes prop", () => {
    expect("textAlign" in component(setTextAlign(def(heading), "h1", "start"), "h1").props).toBe(false);
    expect(component(setTextAlign(def({ ...heading, props: { text: "x" } }), "h1", "center"), "h1").props.textAlign).toBe("center");
  });
  const alert: ModelComponent = { id: "a1", type: "alert", props: { variant: "warning", title: "Vade", text: "Metin" } };
  it("setInfoBox plain makes card and keeps title text", () => {
    const next = component(setInfoBox(def(alert), "a1", { tone: "plain" }), "a1");
    expect(next.type).toBe("card");
    expect(next.props).toEqual({ title: "Vade", text: "Metin" });
    const back = component(setInfoBox(def(next), "a1", { tone: "success" }), "a1");
    expect(back.type).toBe("alert");
    expect(back.props).toMatchObject({ variant: "success", title: "Vade", text: "Metin" });
  });
  it("infoBoxOf reads description of card and list and writes back to it", () => {
    const card: ModelComponent = { id: "c1", type: "card", props: { title: "T", description: "Açıklama" } };
    expect(infoBoxOf(card)).toEqual({ tone: "plain", title: "T", text: "Açıklama", items: null, dismissible: false });
    const next = component(setInfoBox(def(card), "c1", { text: "Yeni" }), "c1");
    expect(next.props).toEqual({ title: "T", description: "Yeni" });
  });
  it("setInfoBox items on list keeps list type until tone changes", () => {
    const list: ModelComponent = { id: "l1", type: "list", props: { title: "Öne çıkanlar", items: ["a", "b"] } };
    const edited = component(setInfoBox(def(list), "l1", { items: ["a", "b", "c"], dismissible: true }), "l1");
    expect(edited.type).toBe("list");
    expect(edited.props.items).toEqual(["a", "b", "c"]);
    expect("dismissible" in edited.props).toBe(false);
    expect(infoBoxOf(edited)).toMatchObject({ tone: "plain", items: ["a", "b", "c"] });
    const same = component(setInfoBox(def(edited), "l1", { tone: "plain" }), "l1");
    expect(same.type).toBe("list");
    const changed = component(setInfoBox(def(edited), "l1", { tone: "info", dismissible: true }), "l1");
    expect(changed.type).toBe("alert");
    expect(changed.props).toMatchObject({ variant: "info", items: ["a", "b", "c"], dismissible: true });
  });
  it("setInfoBox items null removes items, dismissible false removes flag, items cap at 40", () => {
    const withItems = { ...alert, props: { ...alert.props, items: ["a"], dismissible: true } };
    const next = component(setInfoBox(def(withItems), "a1", { items: null, dismissible: false }), "a1");
    expect("items" in next.props).toBe(false);
    expect("dismissible" in next.props).toBe(false);
    const many = component(setInfoBox(def(alert), "a1", { items: Array.from({ length: 50 }, (_, i) => `m${i}`) }), "a1");
    expect((many.props.items as string[]).length).toBe(40);
  });
  it("functions never mutate input", () => {
    const d = def(tabs, heading, alert);
    const snapshot = JSON.parse(JSON.stringify(d));
    setTextStyle(d, "h1", "paragraph"); setTextContent(d, "h1", "x"); setTextAlign(d, "h1", "start");
    setInfoBox(d, "a1", { tone: "plain", title: "x", text: "y", items: ["z"], dismissible: true });
    expect(d).toEqual(snapshot);
  });
});
