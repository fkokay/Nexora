import { describe, expect, it } from "vitest";
import { menuFor, menuRolesFromApi, resolveRoute, roleLabel, type StudioSection } from "./studioNav";

describe("menuFor", () => {
  it("lists the consultant menu", () => {
    expect(menuFor("consultant").map((i) => i.label)).toEqual(["Ana sayfa", "Ekranlar", "Kurallar", "Menüler", "Taleplerim", "Yayınlar"]);
  });
  it("lists the developer menu", () => {
    expect(menuFor("developer").map((i) => i.label)).toEqual(["Ana sayfa", "Gelen talepler", "Firma modülü", "Ekranlar", "Kurallar", "Yayınlar"]);
  });
  it("lists the admin menu", () => {
    expect(menuFor("admin").map((i) => i.label)).toEqual(["Ana sayfa", "Kişiler ve roller", "Modül pazaryeri", "Bağlantılar", "Yapay zekâ", "Yayınlar"]);
  });
  it("maps sections in order", () => {
    expect(menuFor("admin").map((i) => i.section)).toEqual(["home", "people", "marketplace", "connections", "ai", "publications"]);
  });
});

describe("menuRolesFromApi", () => {
  it("maps known roles and drops unknown", () => {
    expect(menuRolesFromApi(["Admin", "X"])).toEqual(["admin"]);
    expect(menuRolesFromApi(["Admin", "Developer", "Consultant"])).toEqual(["admin", "developer", "consultant"]);
  });
});

describe("roleLabel", () => {
  it("returns Turkish labels", () => {
    expect(roleLabel("consultant")).toBe("Danışman");
    expect(roleLabel("developer")).toBe("Yazılımcı");
    expect(roleLabel("admin")).toBe("Yönetici");
  });
});

// Rol, menüsünde bölümü olan rol olarak seçilir; tablodaki beklenen yer ilk tutan rolde açılır.
const legacyCases: [string, StudioSection, string | undefined][] = [
  ["", "home", undefined],
  ["overview", "home", undefined],
  ["analytics", "home", undefined],
  ["projects", "company-module", "code"],
  ["tool-source-workspaces", "company-module", "code"],
  ["tool-custom-data", "company-module", "data-models"],
  ["requests", "my-requests", undefined],
  ["adaptation", "screens", "pages"],
  ["tool-custom-pages", "screens", "pages"],
  ["tool-custom-forms", "screens", "forms"],
  ["tool-reports", "screens", "reports"],
  ["tool-workflows", "rules", "workflows"],
  ["tool-business-rules", "rules", "business-rules"],
  ["tool-custom-menus", "menus", undefined],
  ["marketplace", "marketplace", undefined],
  ["tool-modules", "marketplace", undefined],
  ["tool-settings", "ai", undefined],
];

describe("resolveRoute legacy hashes", () => {
  it.each(legacyCases)("consultant active, holds all: %s", (hash, section, tab) => {
    const r = resolveRoute(hash === "" ? "" : `#${hash}`, "consultant", ["consultant", "developer", "admin"]);
    expect(r.route.section).toBe(section);
    expect(r.route.tab).toBe(tab);
    expect(menuFor(r.role).some((i) => i.section === section)).toBe(true);
  });
  it.each(legacyCases)("without leading hash: %s", (hash, section, tab) => {
    const r = resolveRoute(hash, "consultant", ["consultant", "developer", "admin"]);
    expect(r.route).toEqual(tab ? { section, tab } : { section });
  });
  it("requests goes to incoming-requests for developer", () => {
    expect(resolveRoute("#requests", "developer", ["developer"])).toEqual({ role: "developer", route: { section: "incoming-requests" } });
  });
  it("requests falls back to home when the role has no requests menu", () => {
    expect(resolveRoute("#requests", "admin", ["admin"]).route.section).toBe("home");
  });
});

describe("resolveRoute", () => {
  it("falls back to home when no held role has the section", () => {
    expect(resolveRoute("#people", "consultant", ["consultant"])).toEqual({ role: "consultant", route: { section: "home" } });
  });
  it("switches to the first holding role", () => {
    const r = resolveRoute("#company-module", "consultant", ["admin", "developer", "consultant"]);
    expect(r.role).toBe("developer");
    expect(r.route.section).toBe("company-module");
  });
  it("keeps active role when it has the section", () => {
    expect(resolveRoute("#publications", "developer", ["admin", "developer"]).role).toBe("developer");
  });
  it("parses section/tab", () => {
    expect(resolveRoute("#screens/forms", "developer", ["developer"])).toEqual({ role: "developer", route: { section: "screens", tab: "forms" } });
  });
  it("unknown hash goes home", () => {
    expect(resolveRoute("#bilinmeyen", "developer", ["developer"])).toEqual({ role: "developer", route: { section: "home" } });
  });
});
