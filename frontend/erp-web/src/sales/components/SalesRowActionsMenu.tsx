import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

function menuItems(menu: HTMLElement | null) {
  return Array.from(
    menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
  );
}

/**
 * Compact, unclipped action menu for dense ERP grids. The menu is portalled to the body so the
 * grid's overflow never clips it. Items are `<button role="menuitem" className="sales-row-menu-item">`;
 * `<div role="separator" className="sales-row-menu-separator" />` and `.sales-row-menu-note` may sit
 * between them. Arrow keys / Home / End move the focus, Escape closes and returns it to the trigger.
 */
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
    // On the document, so it runs before the record form's window listener; preventDefault keeps Esc from also
    // cancelling that form.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target))
        setOpen(false);
    };
    updatePosition();
    menuItems(menuRef.current)[0]?.focus({ preventScroll: true });
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = menuItems(menuRef.current);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    items[next].focus();
  }

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
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="sales-row-actions-menu"
          role="menu"
          aria-label={`${label} işlemleri`}
          style={{ top: position.top, left: position.left }}
          onKeyDown={moveFocus}
          onClick={(event) => {
            event.stopPropagation();
            if ((event.target as HTMLElement).closest("button:not(:disabled)")) {
              setOpen(false);
              triggerRef.current?.focus({ preventScroll: true });
            }
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </span>
  );
}
