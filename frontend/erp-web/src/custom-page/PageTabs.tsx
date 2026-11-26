import { Fragment, useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { CanvasTabsContext } from "../designer-canvas/anchorContext";
import { displayText, interpolate, literalText, resolvePath, type PageScope } from "./pageBindings";

const INVALID_CONTROL = ".tenant-page-input.is-invalid input, .tenant-page-input.is-invalid select";

export type PageTab = { label: string; ids: string[]; count?: string };
const TRAILING_BINDING = /^([^{}]*?)\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;

/**
 * Sekme etiketinin bağlamaları (ör. "Birimler {{birimler.rowCount}}"): etiket tek bir sondaki bağlamayla bitiyorsa çözülen
 * değer sekme sayacı olarak etiketin yanında çizilir (boşsa sayaç yok); diğer bağlamalar metne yerleştirilir.
 */
export function boundTab(tab: { label: string; ids: string[] }, scope: PageScope): PageTab {
  if (!tab.label.includes("{{")) return tab;
  const trailing = TRAILING_BINDING.exec(tab.label);
  if (trailing && trailing[1].trim()) {
    const count = displayText(resolvePath(scope, trailing[2]));
    return { ...tab, label: trailing[1].trim(), ...(count ? { count } : {}) };
  }
  return { ...tab, label: interpolate(tab.label, scope).trim() || literalText(tab.label).trim() || tab.label };
}

/**
 * Sekmeler — bileşenleri kimlikle sahiplenir. Tüm paneller çizilir (girişler durumunu korur, doğrulama onları görür);
 * etkin olmayan paneller `hidden` taşır. `jumpTo.signal` değişince o sekme etkinleşir ve içindeki ilk geçersiz denetime
 * odak verilir.
 */
export function PageTabs({ id, tabs, defaultTab, requestedTab = null, renderOwned, errorCounts, jumpTo, style, tabAnchor, activeIndex }: {
  id: string; tabs: PageTab[]; defaultTab: number;
  /**
   * Dışarıdan denetlenen etkin sekme; verilirse kendi durumunu ezer. Tuval bunu değil `CanvasTabsContext`'i kullanır:
   * oradaki `showTab` istekleri olay gibi uygulanır ve kullanıcının tıklaması sekmeyi yine değiştirir.
   */
  activeIndex?: number;
  /** Her sekme düğmesinin hemen önüne konan görünmez işaret (Studio tuvali; yalnız Kayıt kartı). */
  tabAnchor?: (index: number) => ReactNode;
  /** Sayfa parametresinin istediği sekme (`tabParam`); `key` değişince (açık tutulan sayfa yeni parametreyle açıldığında) etkinleşir. */
  requestedTab?: { tab: number; key: string } | null;
  renderOwned: (id: string) => ReactNode; errorCounts: number[]; jumpTo: { tab: number; signal: number } | null; style: CSSProperties;
}) {
  const clamp = (index: number) => Math.max(0, Math.min(tabs.length - 1, Number.isInteger(index) ? index : 0));
  const canvasTab = useContext(CanvasTabsContext)?.get(id);
  const [active, setActive] = useState(() => clamp(canvasTab?.index ?? defaultTab));
  const current = clamp(activeIndex ?? active);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const handledSignal = useRef(jumpTo?.signal);
  const handledRequest = useRef(requestedTab?.key);
  const handledCanvasSignal = useRef(canvasTab?.signal);

  // Tuval showTab'ı bir olaydır: yeni istek etkin sekmeyi değiştirir, sonraki tıklamalar yine kendi durumunu değiştirir.
  useEffect(() => {
    if (!canvasTab || canvasTab.signal === handledCanvasSignal.current) return;
    handledCanvasSignal.current = canvasTab.signal;
    setActive(clamp(canvasTab.index));
  }, [canvasTab?.signal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!requestedTab || requestedTab.key === handledRequest.current) return;
    handledRequest.current = requestedTab.key;
    setActive(clamp(requestedTab.tab));
  }, [requestedTab?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!jumpTo || jumpTo.signal === handledSignal.current) return;
    handledSignal.current = jumpTo.signal;
    const target = clamp(jumpTo.tab);
    pendingFocus.current = target;
    setActive(target);
  }, [jumpTo?.signal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sekme etkinleştikten (hidden kalktıktan) sonraki boyamada odak verilir.
  useEffect(() => {
    if (pendingFocus.current === null || pendingFocus.current !== current) return;
    const target = pendingFocus.current;
    pendingFocus.current = null;
    const focus = () => panelRefs.current[target]?.querySelector<HTMLElement>(INVALID_CONTROL)?.focus();
    if (typeof requestAnimationFrame !== "function") { focus(); return; }
    const frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [current, jumpTo?.signal]);

  if (tabs.length === 0) return <section className="tenant-page-block tenant-page-tabs" style={style} />;

  const choose = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    choose(keys[event.key]);
  };
  const tabId = (index: number) => `page-tabs-${id}-tab-${index}`;
  const panelId = (index: number) => `page-tabs-${id}-panel-${index}`;

  return <section className="tenant-page-block tenant-page-tabs" style={style}>
    <div className="tenant-page-tablist" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((tab, index) => {
        const errors = errorCounts[index] ?? 0;
        const selected = index === current;
        const button = <button key={index} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={tabId(index)}
          aria-selected={selected} aria-controls={panelId(index)} tabIndex={selected ? 0 : -1}
          className={`tenant-page-tab${selected ? " is-active" : ""}${errors > 0 ? " is-error" : ""}`} onClick={() => setActive(index)}>
          <span>{tab.label}</span>
          {tab.count !== undefined && <>{" "}<span className="tenant-page-tab-count">{tab.count}</span></>}
          {errors > 0 && <span className="tenant-page-tab-badge" aria-label={`${errors} hata`}>{errors}</span>}
        </button>;
        return tabAnchor ? <Fragment key={index}>{tabAnchor(index)}{button}</Fragment> : button;
      })}
    </div>
    {tabs.map((tab, index) => <div key={index} ref={(element) => { panelRefs.current[index] = element; }} role="tabpanel" id={panelId(index)}
      aria-labelledby={tabId(index)} className="tenant-page-tabpanel" hidden={index !== current}>
      {tab.ids.map((owned) => renderOwned(owned))}
    </div>)}
  </section>;
}
