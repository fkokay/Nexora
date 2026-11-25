import { resolveRoute, type Route, type StudioMenuRole, type StudioSection } from "./studioNav";
import type { SectionTab } from "./SectionTabs";

/** Sekmeli bölümler; her sekme bugünkü bir aracı açar. İlk sekme varsayılandır. */
export const SECTION_TABS: Partial<Record<StudioSection, (SectionTab & { toolId: string })[]>> = {
  screens: [
    { id: "pages", label: "Sayfalar", toolId: "custom-pages" },
    { id: "forms", label: "Formlar", toolId: "custom-forms" },
    { id: "reports", label: "Raporlar", toolId: "reports" },
  ],
  rules: [
    { id: "workflows", label: "İş akışları", toolId: "workflows" },
    { id: "business-rules", label: "İş kuralları", toolId: "business-rules" },
  ],
  "company-module": [
    { id: "code", label: "Kod ve sürümler", toolId: "source-workspaces" },
    { id: "data-models", label: "Veri modelleri", toolId: "custom-data" },
  ],
};

/**
 * `resolveRoute` üstüne kabuk kuralları: sekmeli bölümde bilinmeyen/eksik sekme ilk sekmeye düşer, sekmesiz bölümde sekme atılır.
 */
export function resolveShellRoute(
  hash: string,
  active: StudioMenuRole,
  held: StudioMenuRole[],
): { role: StudioMenuRole; route: Route; tab?: string } {
  const resolved = resolveRoute(hash, active, held);
  const tabs = SECTION_TABS[resolved.route.section];
  if (!tabs) return { role: resolved.role, route: { section: resolved.route.section } };
  const tab = tabs.find((item) => item.id === resolved.route.tab)?.id;
  return {
    role: resolved.role,
    route: tab ? { section: resolved.route.section, tab } : { section: resolved.route.section },
    tab: tab ?? tabs[0].id,
  };
}

export function routeHash(route: Route): string {
  return route.tab ? `#${route.section}/${route.tab}` : `#${route.section}`;
}
