import { localizedText } from "../../locale";
import { tradeStageFlow, type TradeStatus } from "../types";

type Props = {
  /** Case count per status within the current direction/search filter. */
  counts: Record<TradeStatus, number>;
  active: TradeStatus | null;
  statusLabel: (status: TradeStatus) => string;
  /** Called with null when the active tile is clicked again. */
  onChange: (status: TradeStatus | null) => void;
};

const tr = (turkish: string, english: string) =>
  localizedText(turkish, english);

/** One clickable tile per forward stage; Cancelled is a separate chip at the end. */
export function ForeignTradeStageStrip({
  counts,
  active,
  statusLabel,
  onChange,
}: Props) {
  return (
    <nav
      className="foreign-trade-stages"
      aria-label={tr("Aşama filtresi", "Stage filter")}
    >
      <ol>
        {tradeStageFlow.map((status, index) => {
          const isActive = active === status;
          return (
            <li key={status}>
              <button
                type="button"
                className={`foreign-trade-stage${isActive ? " is-active" : ""}${counts[status] ? "" : " is-empty"}`}
                aria-pressed={isActive}
                title={
                  isActive
                    ? tr("Filtreyi kaldır", "Clear filter")
                    : tr(
                        `${statusLabel(status)} dosyalarını göster`,
                        `Show ${statusLabel(status)} cases`,
                      )
                }
                onClick={() => onChange(isActive ? null : status)}
              >
                <small>{index + 1}</small>
                <span>{statusLabel(status)}</span>
                <b>{counts[status].toLocaleString("tr-TR")}</b>
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className={`list-v2-chip foreign-trade-cancelled-chip${active === "Cancelled" ? " is-active" : ""}`}
        aria-pressed={active === "Cancelled"}
        onClick={() => onChange(active === "Cancelled" ? null : "Cancelled")}
      >
        {statusLabel("Cancelled")}
        <span className="list-v2-chip-count">
          {counts.Cancelled.toLocaleString("tr-TR")}
        </span>
      </button>
    </nav>
  );
}
