import { useEffect, useRef, type ReactNode } from "react";

/**
 * A short record form opened from İşlemler (mockup 10 · "Elden çıkar · Zimmet ver": dialog forms instead of side-panel
 * modes). Esc and a click on the backdrop close it unless a save is running.
 */
export function FixedAssetDialog({
  label,
  busy,
  onClose,
  children,
}: {
  label: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const first = boxRef.current?.querySelector<HTMLElement>(
      "button.searchable-record-trigger, input:not([readonly]):not([type='hidden']), select, textarea",
    );
    first?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      className="fixed-asset-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || busy) return;
        event.preventDefault();
        onClose();
      }}
    >
      <section ref={boxRef} className="fixed-asset-sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  );
}
