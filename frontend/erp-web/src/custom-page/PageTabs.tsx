import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

const INVALID_CONTROL = ".tenant-page-input.is-invalid input, .tenant-page-input.is-invalid select";

/**
 * Sekmeler — bileşenleri kimlikle sahiplenir. Tüm paneller çizilir (girişler durumunu korur, doğrulama onları görür);
 * etkin olmayan paneller `hidden` taşır. `jumpTo.signal` değişince o sekme etkinleşir ve içindeki ilk geçersiz denetime
 * odak verilir.
 */
export function PageTabs({ id, tabs, defaultTab, renderOwned, errorCounts, jumpTo, style }: {
  id: string; tabs: { label: string; ids: string[] }[]; defaultTab: number;
  renderOwned: (id: string) => ReactNode; errorCounts: number[]; jumpTo: { tab: number; signal: number } | null; style: CSSProperties;
}) {
  const clamp = (index: number) => Math.max(0, Math.min(tabs.length - 1, Number.isInteger(index) ? index : 0));
  const [active, setActive] = useState(() => clamp(defaultTab));
  const current = clamp(active);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const handledSignal = useRef(jumpTo?.signal);

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
        return <button key={index} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={tabId(index)}
          aria-selected={selected} aria-controls={panelId(index)} tabIndex={selected ? 0 : -1}
          className={`tenant-page-tab${selected ? " is-active" : ""}${errors > 0 ? " is-error" : ""}`} onClick={() => setActive(index)}>
          <span>{tab.label}</span>
          {errors > 0 && <span className="tenant-page-tab-badge" aria-label={`${errors} hata`}>{errors}</span>}
        </button>;
      })}
    </div>
    {tabs.map((tab, index) => <div key={index} ref={(element) => { panelRefs.current[index] = element; }} role="tabpanel" id={panelId(index)}
      aria-labelledby={tabId(index)} className="tenant-page-tabpanel" hidden={index !== current}>
      {tab.ids.map((owned) => renderOwned(owned))}
    </div>)}
  </section>;
}
