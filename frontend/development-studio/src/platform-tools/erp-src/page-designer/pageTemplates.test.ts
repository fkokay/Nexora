import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PAGE_TEMPLATE_CHOICES, newListTemplateDefinition, templateLabel, templateLevel } from "./pageTemplates";
import NewPageDialog from "./NewPageDialog";
import { designerPersistence } from "../CustomPagesPage";

describe("sayfa kalıpları", () => {
  it("newListTemplateDefinition shape", () => {
    expect(newListTemplateDefinition()).toEqual({ schemaVersion: 2, template: { name: "list" }, queries: [], components: [{ id: "liste", type: "dataTable", props: { slot: "list" } }] });
    expect(PAGE_TEMPLATE_CHOICES.map((c) => c.id)).toEqual(["list", "free"]);
  });

  it("templateLevel 2 with below component", () => {
    const list = newListTemplateDefinition();
    expect(templateLevel(list)).toBe(1);
    expect(templateLabel(list)).toBe("Liste");
    expect(templateLevel({ ...list, components: [...list.components, { id: "x", type: "text", props: { slot: "below" } }] })).toBe(2);
    expect(templateLevel({ components: [] })).toBeNull();
    expect(templateLabel({ components: [] })).toBe("Kalıpsız");
  });

  it("normalizeDefinition keeps template", () => {
    expect(designerPersistence.normalizeDefinition(newListTemplateDefinition()).template).toEqual({ name: "list" });
    expect(designerPersistence.normalizeDefinition({ components: [] })).not.toHaveProperty("template");
    expect(designerPersistence.normalizeDefinition({ template: { name: "bilinmeyen" }, components: [] })).not.toHaveProperty("template");
  });

  it("wireDefinition sends template", () => {
    const wired = designerPersistence.wireDefinition(designerPersistence.normalizeDefinition(newListTemplateDefinition()), { operations: [] } as never);
    expect(wired.template).toEqual({ name: "list" });
  });

  it("new page dialog offers Liste first", () => {
    const html = renderToString(createElement(NewPageDialog, { mode: "create", templates: [{ id: "blank", label: "Boş sayfa", description: "" }], takenCodes: [], onCancel: () => {}, onConfirm: () => {} }));
    expect(html.indexOf("Liste")).toBeGreaterThan(-1);
    expect(html.indexOf("Liste")).toBeLessThan(html.indexOf("Serbest"));
    expect(html).not.toContain("Boş sayfa");
  });
});
