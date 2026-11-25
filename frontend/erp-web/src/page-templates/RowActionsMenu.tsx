import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { RowAction } from "../TenantCustomPage";

/**
 * Dar listede satır eylemleri tek "⋯" menüsünde toplanır. Menü yatay kayan tablonun kırpmasına takılmasın diye gövdeye
 * `position: fixed` olarak çizilir; Escape ve odak dışına çıkış kapatır, odak düğmeye döner, eyleme kalıcı düğme verilir.
 */
export function RowActionsMenu({ actions, row }: { actions: RowAction[]; row: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = (refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    setPlace({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const away = () => setOpen(false);
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("scroll", away, true); window.removeEventListener("resize", away); };
  }, [open]);
  if (actions.length === 0) return null;
  const leaving = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && (menu.current?.contains(next) || trigger.current?.contains(next))) return;
    setOpen(false);
  };
  return <span className="list-row-menu" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") close(true); }}>
    <button ref={trigger} type="button" className="list-row-menu-trigger" aria-label="Satır işlemleri" aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(!open)} onBlur={leaving}>⋯</button>
    {open && createPortal(<div ref={menu} className="list-row-menu-list" role="menu" style={place}
      onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") close(true); }} onBlur={leaving}>
      {actions.map((action) => {
        const reason = action.disabled(row);
        return <button key={action.id} type="button" role="menuitem" className="list-row-menu-item" disabled={reason !== null} title={reason ?? undefined}
          onClick={() => { close(true); action.run(row, trigger.current); }}>{action.label}</button>;
      })}
    </div>, document.body)}
  </span>;
}
