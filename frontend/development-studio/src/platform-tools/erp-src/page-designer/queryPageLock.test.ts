import { describe, expect, it } from "vitest";
import { definitionNeedsAdmin, type OperationKindLookup } from "./queryPageLock";

const kinds: OperationKindLookup = (name) => name === "cari.listele" ? "read" : name === "cari.sil" ? "write" : undefined;
const page = (queries: unknown[], components: unknown[] = []) => JSON.stringify({ schemaVersion: 2, queries, components });
const base = { id: "q", name: "q", parameters: [], runOn: "load" };

describe("definitionNeedsAdmin (Karar 1)", () => {
  it("does not lock catalog data source and action references", () => {
    expect(definitionNeedsAdmin(page([{ ...base, kind: "read", dataSource: "cariler" }]), kinds)).toBe(false);
    expect(definitionNeedsAdmin(page([{ ...base, kind: "delete", action: "sil", runOn: "manual" }]), kinds)).toBe(false);
  });
  it("does not lock read ERP operations", () => {
    expect(definitionNeedsAdmin(page([{ ...base, kind: "read", operation: "cari.listele" }]), kinds)).toBe(false);
  });
  it("locks inline SQL, including SQL stripped for non-admins", () => {
    expect(definitionNeedsAdmin(page([{ ...base, kind: "read", sql: "select 1" }]), kinds)).toBe(true);
    expect(definitionNeedsAdmin(page([{ ...base, kind: "read" }]), kinds)).toBe(true);
    expect(definitionNeedsAdmin(page(["bozuk"]), kinds)).toBe(true);
  });
  it("locks write or unknown ERP operations", () => {
    expect(definitionNeedsAdmin(page([{ ...base, kind: "delete", operation: "cari.sil" }]), kinds)).toBe(true);
    expect(definitionNeedsAdmin(page([{ ...base, kind: "read", operation: "bilinmeyen" }]), kinds)).toBe(true);
  });
  it("locks a code component with JavaScript", () => {
    expect(definitionNeedsAdmin(page([], [{ id: "k", type: "code", props: { javascript: "x()" } }]), kinds)).toBe(true);
    expect(definitionNeedsAdmin(page([], [{ id: "k", type: "code", props: { javascript: " " } }]), kinds)).toBe(false);
  });
  it("is false for empty, v1 or unreadable definitions", () => {
    expect(definitionNeedsAdmin(undefined, kinds)).toBe(false);
    expect(definitionNeedsAdmin("{", kinds)).toBe(false);
    expect(definitionNeedsAdmin(JSON.stringify({ schemaVersion: 1, components: [] }), kinds)).toBe(false);
  });
});
