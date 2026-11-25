import { describe, expect, it } from "vitest";
import { canDevelopCatalog } from "./useStudioAccess";

describe("canDevelopCatalog", () => {
  it("allows admin or developer when /studio/me is read", () => {
    expect(canDevelopCatalog({ status: "ready", held: ["admin", "developer", "consultant"] }, "TenantAdmin")).toBe(true);
    expect(canDevelopCatalog({ status: "ready", held: ["developer", "consultant"] }, "TenantUser")).toBe(true);
  });
  it("refuses a consultant or a person without Studio roles", () => {
    expect(canDevelopCatalog({ status: "ready", held: ["consultant"] }, "TenantDeveloper")).toBe(false);
    expect(canDevelopCatalog({ status: "ready", held: [] }, "TenantAdmin")).toBe(false);
  });
  it("falls back to the tenant admin role when /studio/me is unavailable", () => {
    expect(canDevelopCatalog({ status: "error", held: [] }, "TenantAdmin")).toBe(true);
    expect(canDevelopCatalog({ status: "error", held: [] }, "TenantDeveloper")).toBe(false);
    expect(canDevelopCatalog({ status: "error", held: [] }, "TenantUser")).toBe(false);
  });
  it("refuses while loading or denied", () => {
    expect(canDevelopCatalog({ status: "loading", held: [] }, "TenantAdmin")).toBe(false);
    expect(canDevelopCatalog({ status: "denied", held: [] }, "TenantAdmin")).toBe(false);
  });
});
