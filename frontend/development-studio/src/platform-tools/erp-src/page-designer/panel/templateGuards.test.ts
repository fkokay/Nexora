import { describe, expect, it } from "vitest";
import { newListTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { ensureTemplateSlots, templateDuplicateBlocked } from "./templateGuards";

const page = (components: ModelDefinition["components"], template = true): ModelDefinition => {
  const base = newListTemplateDefinition() as unknown as ModelDefinition;
  return template ? { ...base, components } : { schemaVersion: 2, queries: [], components };
};
const list = { id: "liste", type: "dataTable", name: "liste", props: { slot: "list", query: "kaynak", rowActions: ["satirDugmesi"], rowOpenAction: "ac" } };

describe("template guards (I2, M4)", () => {
  it("gives legacy-created top-level components a valid slot and strips width", () => {
    const def = page([list,
      { id: "satirDugmesi", type: "button", props: { label: "Satır işlemi", actionType: "page" } },
      { id: "yeni", type: "button", props: { label: "Yeni", width: 4 } },
      { id: "kart", type: "card", props: { slot: "indicators", widthWhen: "6=x" }, children: [{ id: "ic", type: "text", props: { width: 6 } }] }]);
    const fixed = ensureTemplateSlots(def);
    const by = (id: string) => fixed.components.find((component) => component.id === id)!;
    expect(by("satirDugmesi").props.slot).toBe("rowActions");
    expect(by("yeni").props).toEqual({ label: "Yeni", slot: "below" });
    expect(by("kart").props).toEqual({ slot: "below" });
    expect((by("kart").children as ModelDefinition["components"])[0].props).toEqual({});
    expect(def.components[1].props.slot).toBeUndefined();
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });
  it("leaves pages without a template unchanged", () => {
    const def = page([{ id: "b", type: "button", props: { width: 4 } }], false);
    expect(ensureTemplateSlots(def)).toBe(def);
  });
  it("blocks duplicating the list, the detail panel and the open button", () => {
    const def = page([list, { id: "ac", type: "button", props: { slot: "rowActions" } }, { id: "detay", type: "contextPanel", props: { slot: "detail" } },
      { id: "not", type: "text", props: { slot: "below" } }]);
    expect(["liste", "ac", "detay", "not"].map((id) => templateDuplicateBlocked(def, id))).toEqual([true, true, true, false]);
  });
});
