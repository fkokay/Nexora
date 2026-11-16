import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import "./list-page-v2.css";

export type SummaryCard = {
  id: string;
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  /** Colours the icon tile; warn / bad also colour the value. Default: primary. */
  tone?: "primary" | "ok" | "warn" | "bad";
  /** Small line under the value ("6 depoda"). */
  hint?: ReactNode;
  /** The list is currently filtered by this card. */
  filterActive?: boolean;
  /** Makes the card a toggle button that applies / removes its filter. */
  onFilter?: () => void;
};

const MAX_COLUMNS = 5;

/**
 * Small indicator cards above a list (mockup 01 ".mk"). Only for indicators that carry a
 * warning or act as a filter; see README.md.
 */
export function ListSummaryCards({ cards }: { cards: SummaryCard[] }) {
  const style = { "--nx-summary-columns": String(Math.max(1, Math.min(cards.length, MAX_COLUMNS))) } as CSSProperties;
  return (
    <div className="nx-summary-row" style={style}>
      {cards.map((card) => {
        const Icon = card.icon;
        const className = `nx-summary-item is-${card.tone ?? "primary"}${card.filterActive ? " is-active" : ""}`;
        const content = (
          <>
            <span className="nx-summary-glyph" aria-hidden="true">
              <Icon size={16} strokeWidth={2} />
            </span>
            <span className="nx-summary-text">
              <small>{card.label}</small>
              <b>{card.value}</b>
              {card.hint != null && <span className="nx-summary-hint">{card.hint}</span>}
            </span>
          </>
        );
        if (!card.onFilter) {
          return (
            <div key={card.id} className={className}>
              {content}
            </div>
          );
        }
        return (
          <button
            key={card.id}
            type="button"
            className={className}
            aria-pressed={Boolean(card.filterActive)}
            onClick={card.onFilter}
          >
            {content}
            <span className="nx-summary-filter">
              {card.filterActive ? (
                <>
                  <span>süzülüyor</span> <span aria-hidden="true">✕</span>
                </>
              ) : (
                <span>Filtrele</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
