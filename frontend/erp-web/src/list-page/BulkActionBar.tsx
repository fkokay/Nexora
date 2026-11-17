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

/**
 * Dark floating bar over the bottom of a list grid while rows are selected: "N seçili", the actions, "✕ Esc".
 * AdvancedDataGrid renders it for `selectable` + `bulkActions` right after the grid's scroll area; Esc in the grid
 * clears the selection.
 *
 * The bar floats over the bottom of that area. When the area runs past the bottom of the window it is lifted to
 * the window's bottom edge, but never above the area's top, so it stays inside the grid and off the action bar.
 * (CSS sticky cannot do this: list pages wrap the grid in overflow containers that capture sticky positioning.)
 */
export function BulkActionBar({ selectedKeys, actions, onClear }: Props) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const area = dock.previousElementSibling,
        bar = dock.firstElementChild as HTMLElement | null;
      if (!area || !bar) return;
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
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  // The bar sits outside the grid's scroll container, so it handles Esc itself; ←/→ move between its buttons.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClear();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    buttons[(at + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length].focus();
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
          onClick={onClear}
        >
          <span aria-hidden="true">✕</span> <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
