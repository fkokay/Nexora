import { describe, expect, it } from "vitest";
import { resolveShellRoute, routeHash, visibleMenu } from "./shellRoute";

const all = ["admin", "developer", "consultant"] as const;

describe("visibleMenu", () => {
  it("hides sections without a screen yet", () => {
    expect(visibleMenu("consultant").map((i) => i.section)).toEqual(["home", "screens", "rules", "menus", "my-requests", "publications"]);
    expect(visibleMenu("admin").map((i) => i.section)).toEqual(["home", "people", "marketplace", "ai", "publications"]);
  });
});

describe("resolveShellRoute", () => {
  it("opens the rules workflows tab for the legacy tool hash", () => {
    expect(resolveShellRoute("#tool-workflows", "consultant", ["consultant"])).toEqual({
      role: "consultant", route: { section: "rules", tab: "workflows" }, tab: "workflows",
    });
  });
  it("falls back to the first tab for an unknown or missing tab", () => {
    expect(resolveShellRoute("#screens/bogus", "consultant", ["consultant"])).toEqual({ role: "consultant", route: { section: "screens" }, tab: "pages" });
    expect(resolveShellRoute("#company-module", "developer", ["developer"]).tab).toBe("code");
  });
  it("drops a tab on untabbed sections", () => {
    expect(resolveShellRoute("#menus/x", "consultant", ["consultant"]).route).toEqual({ section: "menus" });
  });
  it("sends a hidden section to the active role's home without switching role", () => {
    expect(resolveShellRoute("#connections", "consultant", [...all])).toEqual({ role: "consultant", route: { section: "home" } });
  });
  it("opens Yayınlar for every role", () => {
    expect(resolveShellRoute("#publications", "developer", [...all])).toEqual({ role: "developer", route: { section: "publications" } });
    expect(resolveShellRoute("#publications", "consultant", ["consultant"]).route).toEqual({ section: "publications" });
  });
  it("switches to the admin role for Kişiler ve roller", () => {
    expect(resolveShellRoute("#people", "consultant", [...all])).toEqual({ role: "admin", route: { section: "people" } });
  });
  it("switches role for a section only another held role has", () => {
    expect(resolveShellRoute("#marketplace", "consultant", [...all]).role).toBe("admin");
  });
});

describe("routeHash", () => {
  it("writes section and optional tab", () => {
    expect(routeHash({ section: "rules", tab: "workflows" })).toBe("#rules/workflows");
    expect(routeHash({ section: "home" })).toBe("#home");
  });
});
