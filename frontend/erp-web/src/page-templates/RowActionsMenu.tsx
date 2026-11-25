import { useEffect, useRef, useState } from "react";
import type { RowAction } from "../TenantCustomPage";

/** Dar listede satır eylemleri tek "⋯" menüsünde toplanır. */
export function RowActionsMenu({ actions, row }: { actions: RowAction[]; row: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (actions.length === 0) return null;
  return <span className="list-row-menu" ref={box} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setOpen(false); }}>
    <button type="button" className="list-row-menu-trigger" aria-label="Satır işlemleri" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
    {open && <div className="list-row-menu-list" role="menu">
      {actions.map((action) => {
        const reason = action.disabled(row);
        return <button key={action.id} type="button" role="menuitem" className="list-row-menu-item" disabled={reason !== null} title={reason ?? undefined}
          onClick={(event) => { setOpen(false); action.run(row, event.currentTarget); }}>{action.label}</button>;
      })}
    </div>}
  </span>;
}
