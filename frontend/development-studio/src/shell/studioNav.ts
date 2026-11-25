import { Code2, Home, Inbox, Link2, type LucideIcon, LayoutList, Menu, Package, ShieldCheck, Sparkles, Upload, Users } from "lucide-react";

export type StudioMenuRole = "consultant" | "developer" | "admin";

export type StudioSection =
  | "home"
  | "screens"
  | "rules"
  | "menus"
  | "my-requests"
  | "incoming-requests"
  | "company-module"
  | "publications"
  | "people"
  | "marketplace"
  | "connections"
  | "ai";

export type NavItem = { section: StudioSection; label: string; icon: LucideIcon };
export type Route = { section: StudioSection; tab?: string };

const items: Record<StudioSection, NavItem> = {
  home: { section: "home", label: "Ana sayfa", icon: Home },
  screens: { section: "screens", label: "Ekranlar", icon: LayoutList },
  rules: { section: "rules", label: "Kurallar", icon: ShieldCheck },
  menus: { section: "menus", label: "Menüler", icon: Menu },
  "my-requests": { section: "my-requests", label: "Taleplerim", icon: Inbox },
  "incoming-requests": { section: "incoming-requests", label: "Gelen talepler", icon: Inbox },
  "company-module": { section: "company-module", label: "Firma modülü", icon: Code2 },
  publications: { section: "publications", label: "Yayınlar", icon: Upload },
  people: { section: "people", label: "Kişiler ve roller", icon: Users },
  marketplace: { section: "marketplace", label: "Modül pazaryeri", icon: Package },
  connections: { section: "connections", label: "Bağlantılar", icon: Link2 },
  ai: { section: "ai", label: "Yapay zekâ", icon: Sparkles },
};

const menus: Record<StudioMenuRole, StudioSection[]> = {
  consultant: ["home", "screens", "rules", "menus", "my-requests", "publications"],
  developer: ["home", "incoming-requests", "company-module", "screens", "rules", "publications"],
  admin: ["home", "people", "marketplace", "connections", "ai", "publications"],
};

export function menuFor(role: StudioMenuRole): NavItem[] {
  return menus[role].map((section) => items[section]);
}

const apiRoles: Record<string, StudioMenuRole> = {
  Admin: "admin",
  Developer: "developer",
  Consultant: "consultant",
};

export function menuRolesFromApi(menuRoles: string[]): StudioMenuRole[] {
  const result: StudioMenuRole[] = [];
  for (const value of menuRoles) {
    const role = Object.hasOwn(apiRoles, value) ? apiRoles[value] : undefined;
    if (role && !result.includes(role)) result.push(role);
  }
  return result;
}

export function roleLabel(role: StudioMenuRole): "Danışman" | "Yazılımcı" | "Yönetici" {
  return role === "consultant" ? "Danışman" : role === "developer" ? "Yazılımcı" : "Yönetici";
}

type RouteTarget = Route | ((role: StudioMenuRole) => Route);

const legacy: Record<string, RouteTarget> = {
  "": { section: "home" },
  overview: { section: "home" },
  analytics: { section: "home" },
  projects: { section: "company-module", tab: "code" },
  "tool-source-workspaces": { section: "company-module", tab: "code" },
  "tool-custom-data": { section: "company-module", tab: "data-models" },
  requests: (role) => ({ section: role === "consultant" ? "my-requests" : "incoming-requests" }),
  adaptation: { section: "screens", tab: "pages" },
  "tool-custom-pages": { section: "screens", tab: "pages" },
  "tool-custom-forms": { section: "screens", tab: "forms" },
  "tool-reports": { section: "screens", tab: "reports" },
  "tool-workflows": { section: "rules", tab: "workflows" },
  "tool-business-rules": { section: "rules", tab: "business-rules" },
  "tool-custom-menus": { section: "menus" },
  marketplace: { section: "marketplace" },
  "tool-modules": { section: "marketplace" },
  "tool-settings": { section: "ai" },
};

function parseTarget(hash: string): RouteTarget | undefined {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (Object.hasOwn(legacy, raw)) return legacy[raw];
  const [section, tab] = raw.split("/");
  if (!Object.hasOwn(items, section)) return undefined;
  const route: Route = { section: section as StudioSection };
  if (tab) route.tab = tab;
  return route;
}

export function resolveRoute(
  hash: string,
  active: StudioMenuRole,
  held: StudioMenuRole[],
): { role: StudioMenuRole; route: Route } {
  const target = parseTarget(hash);
  if (target) {
    for (const role of [active, ...held]) {
      const route = typeof target === "function" ? target(role) : target;
      if (menus[role].includes(route.section)) return { role, route };
    }
  }
  return { role: active, route: { section: "home" } };
}
