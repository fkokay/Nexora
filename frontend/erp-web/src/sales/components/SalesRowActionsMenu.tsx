import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

/** Compact, unclipped action menu for dense ERP grids. */
export default function SalesRowActionsMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 208;
      const height = menuRef.current?.getBoundingClientRect().height ?? 0;
      const below = window.innerHeight - rect.bottom;
      const placeBelow = height > 0 && below >= height + 8;
      setPosition({
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: placeBelow
          ? rect.bottom + 4
          : Math.max(8, rect.top - height - 4),
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target))
        setOpen(false);
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  return (
    <span className="sales-row-actions-anchor">
      <button
        ref={triggerRef}
        type="button"
        className="sales-row-actions-trigger"
        aria-label={`${label} işlemleri`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="sales-row-actions-menu"
          role="menu"
          style={{ top: position.top, left: position.left }}
          onClick={(event) => {
            event.stopPropagation();
            if ((event.target as HTMLElement).closest("button:not(:disabled)")) setOpen(false);
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </span>
  );
}
