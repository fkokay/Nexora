import type { ReactNode, Ref } from "react";
import "./list-page-v2.css";

type Props = {
  /** Toolbar, grid and footer of the compact list (left half). */
  list: ReactNode;
  /** The selected record's form, or an empty state (right half). */
  pane: ReactNode;
  /** A record (or a new one) is open in the pane; below 1280px the pane is then shown over the list. */
  paneOpen: boolean;
  paneLabel: string;
  rootRef?: Ref<HTMLDivElement>;
  className?: string;
};

/**
 * Definition screen (mockup 04, "Tanım ekranı"): a compact list on the left and the selected record's form on the
 * right of the same screen. At 1280px and wider both halves are side by side; below, the pane opens over the list as
 * a drawer while a record is open (the page closes it with Esc). It is not a modal: the action bar stays usable.
 */
export function DefinitionLayout({ list, pane, paneOpen, paneLabel, rootRef, className }: Props) {
  return (
    <div ref={rootRef} className={`nx-def${paneOpen ? " is-pane-open" : ""}${className ? ` ${className}` : ""}`}>
      <div className="nx-def-list">{list}</div>
      <section className="nx-def-pane" aria-label={paneLabel}>
        {pane}
      </section>
    </div>
  );
}

/** Pane content while no record is open. */
export function DefinitionEmptyPane({ children }: { children: ReactNode }) {
  return <div className="nx-def-empty">{children}</div>;
}
