import { useContext, useRef, type ReactNode } from "react";
import { Search } from "lucide-react";
import { CanvasAnchorContext } from "../designer-canvas/anchorContext";
import { PageShell, type ShellAction } from "./PageShell";
import { ListModeContext, ShellSearchContext, useListMode } from "./listResponsive";
import { templateLevel, type Component, type ListLayout } from "./listTemplateModel";

/** Kabuğun ortasındaki arama kutusu: süzgeç alanının arama değerini ve kimliğini kullanır. */
export function ShellSearch({ inputId, placeholder, hint, value, onSearch }: {
  inputId: string; placeholder: string; hint: string; value: string; onSearch: (text: string) => void;
}) {
  const hintId = `${inputId}-hint`;
  return <div className="list-v2 list-template-search">
    <label htmlFor={inputId} className="list-v2-search" title={hint || undefined}><Search size={16} aria-hidden="true" /><span>Ara</span>
      <input id={inputId} type="text" placeholder={placeholder} value={value} aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onSearch(event.target.value)} />
    </label>
    {hint && <span id={hintId} className="tenant-page-filter-hint">{hint}</span>}
  </div>;
}

/**
 * Liste kalıbı: ortak kabuk içinde `above` → göstergeler → süzgeçler → [liste | detay paneli] → `below`. Bileşenleri
 * çizen `render` sayfanın kendi çizicisidir (tuval işaretleri onunla gelir); burada yalnız yerleşim kurulur.
 * Detay paneli satır seçilince sağda açılır; tuvalde seçilebilsin diye orada her zaman görünür.
 */
export function ListTemplate<C extends Component>({ layout, render, title, count, actions, search, detailOpen, notices }: {
  layout: ListLayout<C>; render: (component: C) => ReactNode; title: string; count: number | null;
  actions: ShellAction[]; search?: ReactNode; detailOpen: boolean; notices?: ReactNode;
}) {
  const canvas = useContext(CanvasAnchorContext);
  const listRef = useRef<HTMLDivElement>(null);
  const mode = useListMode(listRef);
  const showDetail = !!layout.detail && (detailOpen || canvas);
  const striped = layout.list.props?.striped === true;
  // `hideOnMobile`: kart kipinde (dar kutu) bileşen çizilmez.
  const visible = <T extends Component>(items: T[]) => (mode === "cards" ? items.filter((item) => item.props?.hideOnMobile !== true) : items);
  const above = visible(layout.above);
  const indicators = visible(layout.indicators);
  const below = visible(layout.below);
  const filters = layout.filters && visible([layout.filters]).length > 0 ? layout.filters : null;
  const detail = layout.detail && visible([layout.detail]).length > 0 ? layout.detail : null;
  return <div className="list-template" data-level={templateLevel(layout)}>
    <PageShell title={title} crumbs={[]} count={count} actions={actions} search={search ?? undefined}>
      {notices}
      {above.length > 0 && <div className="list-template-above">{above.map(render)}</div>}
      {indicators.length > 0 && <div className="list-template-indicators">{indicators.map(render)}</div>}
      {filters && <div className="list-template-filters">{render(filters)}</div>}
      <div className={`list-template-main${showDetail && detail ? " has-detail" : ""}`}>
        <div ref={listRef} data-list-mode={mode} className={`list-template-list${striped ? " is-striped" : ""}`}><ShellSearchContext.Provider value={search != null}><ListModeContext.Provider value={mode}>{render(layout.list)}</ListModeContext.Provider></ShellSearchContext.Provider></div>
        {showDetail && detail && <div className="list-template-detail">{render(detail)}</div>}
      </div>
      {below.length > 0 && <div className="list-template-below">{below.map(render)}</div>}
    </PageShell>
  </div>;
}
