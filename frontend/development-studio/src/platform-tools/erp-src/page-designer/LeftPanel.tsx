import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Braces, ChevronDown, ChevronRight, Database, Layers, Plus, Search, Shapes, type LucideIcon } from "lucide-react";
import LayersTree, { type LayerItem } from "./LayersTree";
import { LEFT_PANEL_SECTIONS, LEFT_PANEL_STORAGE_KEY, matchesTerm, parseLeftPanelState, resizeSectionPair, type LeftPanelSection, type LeftPanelState } from "./leftPanelModel";
import "./left-panel.css";

export type PaletteEntry = { type: string; label: string; group: string; icon: LucideIcon; disabled: boolean; title?: string };
export type QueryEntry = { id: string; name: string; kindLabel: string; detail: string; write: boolean };

type Props = {
  canEdit: boolean;
  palette: PaletteEntry[];
  paletteGroups: string[];
  onPaletteDragStart: (type: string, event: DragEvent) => void;
  onPaletteDragEnd: () => void;
  onPaletteAdd: (type: string) => void;
  layers: LayerItem[];
  selectedComponentId: string | null;
  onSelectComponent: (id: string) => void;
  dropTarget: { index: number; edge: "before" | "after" } | null;
  onLayerDragStart: (index: number, id: string, event: DragEvent) => void;
  onLayerDragEnd: () => void;
  onLayerDragOver: (index: number, edge: "before" | "after") => void;
  onLayerDrop: (index: number, event: DragEvent) => void;
  onLayerMove: (index: number, delta: number) => void;
  /** Katmanlar sürüklenerek sıralanabilir mi (varsayılan evet). */
  layerReorderable?: boolean;
  canLayerMove?: (index: number, id: string, delta: -1 | 1) => boolean;
  componentCount: number;
  queries: QueryEntry[];
  selectedQueryId: string | null;
  canAddQuery: boolean;
  addQueryTitle?: string;
  onAddQuery: () => void;
  onOpenQuery: (id: string) => void;
  /** Kullanılabilir değişkenler bölümünün içeriği ve sayısı. */
  variables: ReactNode;
  variableCount: number;
};

const titles: Record<LeftPanelSection, string> = { components: "Bileşenler", layers: "Katmanlar", queries: "Sorgular", variables: "Değişkenler" };
const icons: Record<LeftPanelSection, LucideIcon> = { components: Shapes, layers: Layers, queries: Database, variables: Braces };

function loadState(): LeftPanelState {
  try { return parseLeftPanelState(localStorage.getItem(LEFT_PANEL_STORAGE_KEY)); } catch { return parseLeftPanelState(null); }
}

/** Sol panel: tek arama kutusu altında alt alta, açılır kapanır Bileşenler / Katmanlar / Sorgular / Değişkenler bölümleri. */
export default function LeftPanel(props: Props) {
  const [state, setState] = useState<LeftPanelState>(loadState);
  const [search, setSearch] = useState("");
  const bodies = useRef<Partial<Record<LeftPanelSection, HTMLDivElement | null>>>({});
  useEffect(() => {
    try { localStorage.setItem(LEFT_PANEL_STORAGE_KEY, JSON.stringify(state)); } catch { /* depolama kapalı olabilir */ }
  }, [state]);

  const toggle = (section: LeftPanelSection) => setState((current) => ({ ...current, open: { ...current.open, [section]: !current.open[section] } }));
  const open = (section: LeftPanelSection) => setState((current) => current.open[section] ? current : { ...current, open: { ...current.open, [section]: true } });
  const openSections = LEFT_PANEL_SECTIONS.filter((section) => state.open[section]);

  const resize = (a: LeftPanelSection, b: LeftPanelSection, startA: number, startB: number, delta: number, base: LeftPanelState) => {
    const [weightA, weightB] = resizeSectionPair(base.weights[a], base.weights[b], startA, startB, delta);
    setState((current) => ({ ...current, weights: { ...current.weights, [a]: weightA, [b]: weightB } }));
  };
  const heightOf = (section: LeftPanelSection) => bodies.current[section]?.getBoundingClientRect().height ?? 0;
  const startDrag = (a: LeftPanelSection, b: LeftPanelSection) => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startY = event.clientY; const startA = heightOf(a); const startB = heightOf(b); const base = state;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => resize(a, b, startA, startB, moveEvent.clientY - startY, base);
    const end = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
  };
  const keyResize = (a: LeftPanelSection, b: LeftPanelSection) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    resize(a, b, heightOf(a), heightOf(b), event.key === "ArrowUp" ? -24 : 24, state);
  };

  const palette = props.palette.filter((item) => matchesTerm(search, item.label, item.group));
  const queries = props.queries.filter((query) => matchesTerm(search, query.name, query.kindLabel));
  const counts: Partial<Record<LeftPanelSection, number>> = { layers: props.componentCount, queries: props.queries.length, variables: props.variableCount };

  const body = (section: LeftPanelSection): ReactNode => {
    if (section === "components") return <>
      <p className="pd-hint">Tuvale sürükleyin ya da tıklayarak seçili bileşenin altına ekleyin.</p>
      {props.paletteGroups.map((group) => {
        const items = palette.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return <div className="pd-palette-group" key={group}><h4>{group}</h4>{items.map((item) => {
          const Icon = item.icon;
          return <button type="button" key={item.type} className="pd-palette-item" draggable={props.canEdit && !item.disabled} disabled={!props.canEdit || item.disabled} title={item.title}
            onDragStart={(event) => props.onPaletteDragStart(item.type, event)} onDragEnd={props.onPaletteDragEnd}
            onClick={() => props.onPaletteAdd(item.type)}><span className="pd-palette-icon"><Icon size={15}/></span><span>{item.label}</span></button>;
        })}</div>;
      })}
      {palette.length === 0 && <p className="pd-empty-note">“{search.trim()}” ile eşleşen bileşen yok.</p>}
    </>;
    if (section === "layers") return <LayersTree items={props.layers} search={search} canEdit={props.canEdit} selectedId={props.selectedComponentId} onSelect={props.onSelectComponent}
      dropTarget={props.dropTarget} onDragStart={props.onLayerDragStart} onDragEnd={props.onLayerDragEnd} onDragOver={props.onLayerDragOver} onDrop={props.onLayerDrop} onMove={props.onLayerMove} rootCount={props.componentCount}
      reorderable={props.layerReorderable} canMove={props.canLayerMove}/>;
    if (section === "variables") return props.variables;
    return props.queries.length === 0 ? <p className="pd-empty-note">Bu sayfada henüz sorgu yok. “＋” ile yeni sorgu ekleyin.</p>
      : queries.length === 0 ? <p className="pd-empty-note">“{search.trim()}” ile eşleşen sorgu yok.</p>
      : <ul className="pd-lp-queries">{queries.map((query) => <li key={query.id}>
        <button type="button" className={query.id === props.selectedQueryId ? "is-selected" : ""} onClick={() => props.onOpenQuery(query.id)} title="Sorguyu düzenle">
          <Database size={13}/><span><b>{query.name || "Adsız sorgu"}</b><small>{query.detail}</small></span><em className={query.write ? "is-write" : ""}>{query.kindLabel}</em>
        </button>
      </li>)}</ul>;
  };

  return <aside className="pd-left pd-left-stack" aria-label="Bileşenler, katmanlar ve sorgular">
    <label className="pd-search pd-lp-search"><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bileşen, katman veya sorgu ara" aria-label="Bileşen, katman veya sorgu ara"/></label>
    {LEFT_PANEL_SECTIONS.map((section) => {
      const Icon = icons[section];
      const isOpen = state.open[section];
      const position = openSections.indexOf(section);
      const next = position >= 0 ? openSections[position + 1] : undefined;
      const count = counts[section];
      return <section key={section} className={`pd-lp-section${isOpen ? " is-open" : ""}`} style={isOpen ? { flexGrow: state.weights[section] } : undefined} aria-label={titles[section]}>
        <div className="pd-lp-head">
          <button type="button" className="pd-lp-toggle" aria-expanded={isOpen} onClick={() => toggle(section)}>
            {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<Icon size={14}/><span>{titles[section]}</span>
            {count !== undefined && <span className="pd-count">{count}</span>}
          </button>
          {section === "queries" && <button type="button" className="pd-lp-add" aria-label="Yeni sorgu" title={props.addQueryTitle ?? "Yeni sorgu"} disabled={!props.canAddQuery}
            onClick={() => { open("queries"); props.onAddQuery(); }}><Plus size={14}/></button>}
        </div>
        {isOpen && <div className="pd-lp-body" ref={(element) => { bodies.current[section] = element; }}>{body(section)}</div>}
        {isOpen && next && <div className="pd-lp-splitter" role="separator" aria-orientation="horizontal" aria-label={`${titles[section]} ve ${titles[next]} bölümlerini boyutlandır`} tabIndex={0}
          onPointerDown={startDrag(section, next)} onKeyDown={keyResize(section, next)}/>}
      </section>;
    })}
  </aside>;
}
