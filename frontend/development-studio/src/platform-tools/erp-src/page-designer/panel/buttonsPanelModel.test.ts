import { describe, expect, it } from "vitest";
import type { PageQuery } from "../QueriesPanel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { setPrimaryButton, slotButtons } from "./buttonsPanelModel";

const q = (id: string, kind: string): PageQuery => ({ id, name: id, kind, action: id, runOn: "manual", parameters: [] } as unknown as PageQuery);
const btn = (id: string, slot: string, queryId: string): ModelComponent => ({ id, type: "button", props: { slot, text: id, actionType: "query", queryId } });
const head: ModelComponent = { id: "h", type: "heading", props: { text: "x" } };
const def: ModelDefinition = {
  schemaVersion: 2, queries: [q("a", "update"), q("b", "update"), q("d", "delete"), q("r", "update")],
  components: [btn("bA", "actions", "a"), head, btn("bR", "rowActions", "r"), btn("bB", "actions", "b"), btn("bD", "actions", "d")],
};
const ids = (d: ModelDefinition) => d.components.map((c) => c.id);

describe("buttonsPanelModel", () => {
  it("slotButtons keeps record order", () => {
    expect(slotButtons(def, "actions").map((c) => c.id)).toEqual(["bA", "bB", "bD"]);
    expect(slotButtons(def, "rowActions").map((c) => c.id)).toEqual(["bR"]);
  });
  it("setPrimaryButton moves chosen action button first and leaves others in place", () => {
    const next = setPrimaryButton(def, "bB");
    expect(ids(next)).toEqual(["bB", "bA", "h", "bR", "bD"]);
    expect(slotButtons(next, "actions")[0].id).toBe("bB");
    expect(ids(setPrimaryButton(def, "bA"))).toEqual(ids(def));
    expect(setPrimaryButton(def, "bR")).toBe(def);
    expect(setPrimaryButton(def, "yok")).toBe(def);
  });
  it("setPrimaryButton ignores delete button", () => {
    expect(setPrimaryButton(def, "bD")).toBe(def);
  });
  it("functions never mutate input", () => {
    const snapshot = JSON.stringify(def);
    setPrimaryButton(def, "bB"); slotButtons(def, "actions");
    expect(JSON.stringify(def)).toBe(snapshot);
  });
});
