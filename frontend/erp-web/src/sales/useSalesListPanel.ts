import { useEffect, useRef, useState } from "react";
import { api } from "../erpApi";
import { useStockDetailPanelOpen } from "../inventory/components/InventoryStockDetailPanel";

type Options = {
  /** The list is the visible screen (no document, create page or dialog of the page over it). */
  active: boolean;
  token: string;
  /** The row the user chose; nothing loads without one. */
  currentId: string | null;
  /** Detail endpoint of a row. */
  path: (id: string) => string;
  /** Changes when the current row's list data changes (a reload after an action), so the detail is fetched again. */
  reloadKey?: string;
};

/**
 * Detail panel of a sales list (mockup 06 ".det"): open state (open by default when the list area is wide enough,
 * Ctrl+. toggles; same rule as Stok Kartları) and the current row's detail. The detail loads only while the panel
 * is open and the list is active, a moment after the current row settles (↑/↓ move quickly), and an answer for a
 * row the user has left is dropped.
 */
export function useSalesListPanel<D>({ active, token, currentId, path, reloadKey }: Options) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panel = useStockDetailPanelOpen(active, rootRef);
  const [loaded, setLoaded] = useState<{ id: string; detail: D | null; error: string } | null>(null);
  const request = useRef(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  const visible = panel.open && active;

  useEffect(() => {
    const id = ++request.current;
    if (!visible || !currentId) return;
    const timer = window.setTimeout(() => {
      api<D>(pathRef.current(currentId), token)
        .then((detail) => {
          if (id === request.current) setLoaded({ id: currentId, detail, error: "" });
        })
        .catch((error: Error) => {
          if (id === request.current) setLoaded({ id: currentId, detail: null, error: error.message });
        });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [visible, currentId, token, reloadKey]);

  const current = loaded && loaded.id === currentId ? loaded : null;
  return {
    rootRef,
    open: panel.open,
    toggle: panel.toggle,
    close: panel.close,
    takeFocus: panel.takeFocus,
    /** Detail of the current row once loaded (null while loading, or after an error). */
    detail: current?.detail ?? null,
    error: current?.error ?? "",
  };
}
