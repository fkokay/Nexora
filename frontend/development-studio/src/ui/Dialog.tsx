import { useRef, type FormEvent, type ReactNode, type RefObject } from "react";
import { useFocusTrap } from "./useFocusTrap";

type DialogProps = {
  /** Called on Escape, on a backdrop click and by the caller's own close buttons. */
  onClose: () => void;
  /** id of the element that names the dialog (usually its h2). */
  labelledBy?: string;
  /** Used when there is no visible title element. */
  label?: string;
  describedBy?: string;
  /** Extra classes for the panel; the panel always has `modal`. */
  className?: string;
  /** Extra classes for the backdrop; the backdrop always has `modal-backdrop`. */
  backdropClassName?: string;
  /** False while work is in progress: Escape and backdrop clicks are ignored. */
  dismissible?: boolean;
  /** "alertdialog" for confirmations that interrupt the user. */
  role?: "dialog" | "alertdialog";
  initialFocus?: RefObject<HTMLElement | null>;
  as?: "section" | "div" | "form";
  onSubmit?: (event: FormEvent<HTMLElement>) => void;
  children: ReactNode;
};

/**
 * Shared modal for Studio. Keeps focus inside while open, closes on Escape and returns focus to the control that
 * opened it. Render it conditionally (`{open && <Dialog …/>}`); it is open whenever it is mounted.
 */
export function Dialog({
  onClose,
  labelledBy,
  label,
  describedBy,
  className = "",
  backdropClassName = "",
  dismissible = true,
  role = "dialog",
  initialFocus,
  as = "section",
  onSubmit,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, true, dismissible ? onClose : undefined, initialFocus);
  const Panel = as as "section";
  return (
    <div
      className={`modal-backdrop ${backdropClassName}`.trim()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <Panel
        ref={panelRef as RefObject<HTMLElement>}
        className={`modal ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-describedby={describedBy}
        data-ns-dialog="open"
        tabIndex={-1}
        {...(as === "form" ? { onSubmit } : {})}
      >
        {children}
      </Panel>
    </div>
  );
}
