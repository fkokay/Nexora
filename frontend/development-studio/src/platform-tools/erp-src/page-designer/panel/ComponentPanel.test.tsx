import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComponentPanel, LegacySettings, ProvidedByDeveloper } from "./ComponentPanel";

const html = renderToString(
  <ComponentPanel name="Cari kartları" onRename={() => {}} what={<i>WHAT</i>} basics={<i>BASICS</i>}
    actions={<i>ACTIONS</i>} appearance={<i>APPEAR</i>} />,
);

describe("ComponentPanel", () => {
  it("renders five parts in order and Görünüm collapsed", () => {
    const at = ["Cari kartları", "WHAT", "BASICS", "ACTIONS", "Görünüm"].map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain("<details>");
    expect(html).not.toContain("<details open");
  });
  it("has no tablist role", () => {
    expect(html).not.toContain("tablist");
    expect(html).not.toContain("dialog");
  });
  it("shows the developer note", () => {
    expect(renderToString(<ProvidedByDeveloper>312 kayıt</ProvidedByDeveloper>)).toContain("Yazılımcının hazırladığı");
  });
});

describe("LegacySettings", () => {
  it("lists unknown props only", () => {
    const out = renderToString(<LegacySettings props={{ title: "x", oldFlag: true }} known={new Set(["title"])} />);
    expect(out).toContain("oldFlag");
    expect(out).not.toContain("title");
    expect(renderToString(<LegacySettings props={{ title: "x" }} known={new Set(["title"])} />)).toBe("");
  });
});

describe("ComponentPanel namePlaceholder", () => {
  it("passes the placeholder to the name box", () => {
    const out = renderToString(<ComponentPanel name="" namePlaceholder="Görsel" nameReadOnly onRename={() => {}} what={null} basics={null} actions={null} appearance={null} />);
    expect(out).toContain('placeholder="Görsel"');
  });
});
