import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

export type BulkAction = {
  id: string;
  label: string;
  run: (keys: string[]) => void;
  /** Disables the action and explains why (tooltip). */
  disabledReason?: string;
};

type Props = {
  selectedKeys: string[];
  actions: BulkAction[];
  onClear: () => void;
};

const CLEAR_ID = "\u0000clear";

/**
 * Dark floating bar over the bottom of a list grid while rows are selected: "N seçili", the actions, "✕ Esc".
 * AdvancedDataGrid renders it for `selectable` + `bulkActions` right after the grid's scroll area; Esc in the grid
 * clears the selection.
 *
 * The bar floats over the bottom of that area, which gets `--nx-bulk-space` (bar height + 12px) as bottom padding
 * so the last row stays readable. When the area runs past the bottom of the window the bar is lifted to the
 * window's bottom edge, but never above the area's top, so it stays inside the grid and off the action bar.
 * (CSS sticky cannot do this: list pages wrap the grid in overflow containers that capture sticky positioning.)
 * The lift is re-measured on any scroll, window resize and layout resize (fullscreen, density, side panels).
 *
 * The toolbar is one tab stop (roving tabindex); ←/→, Home and End move between its enabled buttons.
 */
export function BulkActionBar({ selectedKeys, actions, onClear }: Props) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  useLayoutEffect(() => {
    const dock = dockRef.current,
      area = dock?.previousElementSibling as HTMLElement | null | undefined;
    if (!dock || !area) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bar = dock.firstElementChild as HTMLElement | null;
      if (!bar) return;
      area.style.setProperty("--nx-bulk-space", `${bar.offsetHeight + 12}px`);
      const bottom = dock.getBoundingClientRect().top,
        room = bottom - area.getBoundingClientRect().top - bar.offsetHeight - 24;
      setLift(Math.max(0, Math.min(room, bottom - window.innerHeight)));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    // Capture: the page may scroll in any ancestor, not only the window.
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(area);
    resizeObserver.observe(document.documentElement);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      resizeObserver.disconnect();
      area.style.removeProperty("--nx-bulk-space");
    };
  }, []);
  const enabledIds = [
    ...actions.filter((action) => !action.disabledReason).map((action) => action.id),
    CLEAR_ID,
  ];
  const tabStop = activeId !== null && enabledIds.includes(activeId) ? activeId : enabledIds[0];
  // The bar sits outside the grid's scroll container, so it handles Esc itself.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClear();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (at + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length;
    buttons[next].focus();
  }
  return (
    <div className="nx-bulk-dock" ref={dockRef} style={{ "--nx-bulk-lift": `${lift}px` } as CSSProperties}>
      <div className="nx-bulk" role="toolbar" aria-label="Toplu işlemler" onKeyDown={onKeyDown}>
        <b className="nx-bulk-count">
          <span>{selectedKeys.length}</span> <span>seçili</span>
        </b>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="nx-bulk-action"
            disabled={Boolean(action.disabledReason)}
            title={action.disabledReason}
            tabIndex={action.id === tabStop ? 0 : -1}
            onFocus={() => setActiveId(action.id)}
            onClick={() => action.run(selectedKeys)}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="nx-bulk-action nx-bulk-clear"
          aria-label="Seçimi temizle"
          aria-keyshortcuts="Escape"
          tabIndex={tabStop === CLEAR_ID ? 0 : -1}
          onFocus={() => setActiveId(CLEAR_ID)}
          onClick={onClear}
        >
          <span aria-hidden="true">✕</span> <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
