import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Save } from "lucide-react";

export type FormMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Renders a submit button for the surrounding form (e.g. "Kaydet ve yeni"). */
  submit?: boolean;
};

/** A small "⋯" button that opens a list of secondary form actions. */
export function FormMoreMenu({
  items,
  label = "Diğer işlemler",
  formId,
  className,
}: {
  items: FormMenuItem[];
  label?: string;
  formId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div
      ref={rootRef}
      className={`mfg-more-menu${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="rf-btn mfg-more-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="mfg-more-list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type={item.submit ? "submit" : "button"}
              form={item.submit ? formId : undefined}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Places a "⋯" menu at the end of the surrounding RecordFormPage's action row
 * (the shared form component has no slot for it). Render it inside the form body.
 */
export function ToolbarMoreMenu({ items }: { items: FormMenuItem[] }) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(
      anchorRef.current
        ?.closest(".record-form")
        ?.querySelector<HTMLElement>(":scope > .rf-toolbar .rf-actions") ??
        null,
    );
  }, []);
  return (
    <>
      <span ref={anchorRef} hidden />
      {host &&
        items.length > 0 &&
        createPortal(
          <FormMoreMenu items={items} className="mfg-toolbar-more" />,
          host,
        )}
    </>
  );
}

/** Narrow screens: save and a "⋯" menu in a bar pinned to the bottom of the form. */
export function StickyFormBar({
  saveLabel,
  busy,
  onSave,
  formId,
  items,
}: {
  saveLabel: string;
  busy: boolean;
  onSave: () => void;
  formId?: string;
  items: FormMenuItem[];
}) {
  return (
    <div className="mfg-sticky-bar">
      <button
        type="submit"
        form={formId}
        className="rf-btn rf-btn--primary"
        disabled={busy}
        onClick={onSave}
      >
        <Save size={16} aria-hidden="true" />
        {busy ? "Kaydediliyor…" : saveLabel}
      </button>
      <FormMoreMenu items={items} formId={formId} className="is-up" />
    </div>
  );
}
