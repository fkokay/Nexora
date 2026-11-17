import { lazy, Suspense } from "react";
import type { GlobalSearchResult, Locale } from "../WorkspaceComponents";
import type { ModuleMenuSelection } from "../ModuleMarketplacePage";
import { TenantCustomMenuNavigation } from "../TenantCustomMenuNavigation";
import { standalonePageTitle } from "../workspace-navigation";
import { moduleForPage, SUBROUTE_PARENTS, subNavRowForPage } from "./moduleMenus";

const TenantModuleNavigation = lazy(() =>
  import("../ModuleMarketplacePage").then((module) => ({
    default: module.TenantModuleNavigation,
  })),
);

type Props = {
  page: string;
  locale: Locale;
  token: string;
  /** Screen labels as the tabs and global search show them (includes tenant renames). */
  pageLabels: GlobalSearchResult[];
  onNavigate: (page: string, label?: string) => void;
  onSelectModule: (selection: ModuleMenuSelection) => void;
  onSearchItems: (items: GlobalSearchResult[]) => void;
};

/**
 * Module sub-menu next to the icon rail: the current module's screens and the tenant's
 * own entries ("Özel"). It stays mounted on every page and width (CSS hides it below
 * 1280px) because the activated-module list also feeds the global search.
 */
export function WorkspaceSubNav({ page, locale, token, pageLabels, onNavigate, onSelectModule, onSearchItems }: Props) {
  const english = locale === "en";
  const menu = moduleForPage(page);
  const activeRow = subNavRowForPage(page);
  const title = menu ? menu.title[english ? 1 : 0] : "";
  const labelFor = (key: string) =>
    pageLabels.find((item) => item.page === key)?.label ?? standalonePageTitle(key, locale) ?? key.replace(/[-_]/g, " ");
  const rows = menu ? menu.pages.filter((key) => !(key in SUBROUTE_PARENTS)) : [];
  return (
    <aside className="workspace-subnav" aria-label={english ? "Module menu" : "Modül menüsü"}>
      {menu && (
        <>
          <div className="workspace-subnav-title">{title}</div>
          <nav aria-label={title}>
            {rows.map((key) => (
              <button
                type="button"
                key={key}
                className={`workspace-subnav-item${key === activeRow ? " active" : ""}`}
                aria-current={key === activeRow ? "page" : undefined}
                onClick={() => onNavigate(key)}
              >
                {labelFor(key)}
              </button>
            ))}
          </nav>
        </>
      )}
      <div className="workspace-subnav-custom">
        <div className="workspace-subnav-group">{english ? "Custom" : "Özel"}</div>
        <Suspense fallback={null}>
          <TenantModuleNavigation token={token} page={page} onSearchItems={onSearchItems} onSelect={onSelectModule} />
        </Suspense>
        <TenantCustomMenuNavigation token={token} page={page} onSelect={onNavigate} />
      </div>
    </aside>
  );
}
