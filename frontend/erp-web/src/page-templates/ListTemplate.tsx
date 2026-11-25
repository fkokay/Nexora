import { useContext, type ReactNode } from "react";
import { Search } from "lucide-react";
import { CanvasAnchorContext } from "../designer-canvas/anchorContext";
import { PageShell, type ShellAction } from "./PageShell";
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
  const showDetail = !!layout.detail && (detailOpen || canvas);
  const striped = layout.list.props?.striped === true;
  return <div className="list-template" data-level={templateLevel(layout)}>
    <PageShell title={title} crumbs={[]} count={count} actions={actions} search={search ?? undefined}>
      {notices}
      {layout.above.length > 0 && <div className="list-template-above">{layout.above.map(render)}</div>}
      {layout.indicators.length > 0 && <div className="list-template-indicators">{layout.indicators.map(render)}</div>}
      {layout.filters && <div className="list-template-filters">{render(layout.filters)}</div>}
      <div className={`list-template-main${showDetail ? " has-detail" : ""}`}>
        <div className={`list-template-list${striped ? " is-striped" : ""}`}>{render(layout.list)}</div>
        {showDetail && layout.detail && <div className="list-template-detail">{render(layout.detail)}</div>}
      </div>
      {layout.below.length > 0 && <div className="list-template-below">{layout.below.map(render)}</div>}
    </PageShell>
  </div>;
}
