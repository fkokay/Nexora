import type { Ref } from "react";
import { ArrowLeftRight, CheckCircle2, XCircle } from "lucide-react";
import {
  formatAmount,
  formatDate,
} from "../../document-detail/DocumentDetailLayout";
import type {
  FinanceAccount,
  InstrumentEvent,
  Item,
  RowAction,
} from "../paymentInstrumentTypes";
import {
  allowedActions,
  collectLabel,
  statusText,
} from "../paymentInstrumentTypes";

type TimelineEntry = { key: string; label: string; date: string | null; note?: string | null; tone?: "danger" | "muted" };

function eventLabel(event: InstrumentEvent, item: Item) {
  switch (event.eventType) {
    case "Created":
      return item.direction === "Receivable" ? "Portföye alındı" : "Portföye kaydedildi";
    case "Endorsed":
      return "Ciro edildi";
    case "Collected":
      return item.direction === "Receivable" ? "Tahsil edildi" : "Ödendi";
    case "Bounced":
      return "Karşılıksız";
    case "Cancelled":
      return "İptal edildi";
    case "AppliedToInvoice":
      return "Faturaya uygulandı";
    default:
      return event.eventType;
  }
}

/** History from the event log; falls back to the dates on the record while the log is unavailable. */
function timeline(item: Item, events: InstrumentEvent[] | null): TimelineEntry[] {
  if (events && events.length)
    return events.map((event) => ({
      key: event.id,
      label: eventLabel(event, item),
      date: event.eventDate,
      // Invoice application notes are an internal fingerprint, not user text.
      note:
        event.eventType === "AppliedToInvoice"
          ? null
          : event.eventType === "Endorsed" && item.endorsedTo
            ? `${item.endorsedTo}${event.note ? ` · ${event.note}` : ""}`
            : event.note,
      tone:
        event.eventType === "Bounced"
          ? "danger"
          : event.eventType === "Cancelled"
            ? "muted"
            : undefined,
    }));
  const rows: TimelineEntry[] = [
    {
      key: "created",
      label: item.direction === "Receivable" ? "Portföye alındı" : "Portföye kaydedildi",
      date: item.portfolioDate,
    },
  ];
  if (item.endorsedAt)
    rows.push({ key: "endorsed", label: "Ciro edildi", date: item.endorsedAt, note: item.endorsedTo });
  if (item.collectedAt)
    rows.push({
      key: "collected",
      label: item.direction === "Receivable" ? "Tahsil edildi" : "Ödendi",
      date: item.collectedAt,
    });
  if (item.status === "Bounced") rows.push({ key: "bounced", label: "Karşılıksız", date: null, tone: "danger" });
  if (item.status === "Cancelled") rows.push({ key: "cancelled", label: "İptal edildi", date: null, tone: "muted" });
  return rows;
}

type Props = {
  item: Item | null;
  events: InstrumentEvent[] | null;
  eventsLoading: boolean;
  eventsError: string;
  isAdmin: boolean;
  busy: boolean;
  baseCurrency: string;
  accounts: FinanceAccount[];
  accountId: string;
  onAccountChange: (value: string) => void;
  accountSelectRef?: Ref<HTMLSelectElement>;
  onAction: (item: Item, kind: RowAction) => void;
};

export function PaymentInstrumentSidePanel({
  item,
  events,
  eventsLoading,
  eventsError,
  isAdmin,
  busy,
  baseCurrency,
  accounts,
  accountId,
  onAccountChange,
  accountSelectRef,
  onAction,
}: Props) {
  if (!item)
    return (
      <aside className="pi-side fh-box" aria-label="Seçili çek/senet">
        <p className="fh-empty">Ayrıntıları görmek için listeden bir kayıt seçin.</p>
      </aside>
    );
  const kind = item.type === "Check" ? "çek" : "senet";
  const actions = isAdmin ? allowedActions(item) : [];
  const canCollect = actions.includes("collect");
  const matchingAccounts = accounts.filter((account) => account.currencyCode === item.currencyCode);
  const amount =
    baseCurrency && item.currencyCode === baseCurrency
      ? formatAmount(item.amount)
      : formatAmount(item.amount, item.currencyCode);
  const entries = timeline(item, events);
  const secondary = actions.filter((action) => action !== "collect");
  return (
    <aside className="pi-side fh-box" aria-label="Seçili çek/senet">
      <p className="pi-side-eyebrow">
        <span>{`Seçili ${kind}`}</span>
        <span className={`pi-state is-${item.status.toLowerCase()}`}>{statusText[item.status]}</span>
      </p>
      <h2 className="pi-side-title">
        <span>{item.instrumentNumber}</span>
        <b>{amount}</b>
      </h2>
      <p className="pi-side-sub">
        {item.counterpartyName}
        <br />
        <span className="fh-muted">
          {item.bankName} · {formatDate(item.dueDate)}
        </span>
      </p>
      <h3 className="pi-side-heading">Geçmiş</h3>
      {eventsLoading && !events ? (
        <p className="fh-note">Geçmiş yükleniyor…</p>
      ) : (
        <ol className="pi-timeline">
          {entries.map((entry) => (
            <li key={entry.key} className={entry.tone ? `is-${entry.tone}` : undefined}>
              <span className="pi-timeline-dot" aria-hidden="true" />
              <span className="pi-timeline-text">
                <b>{entry.label}</b>
                {entry.date && <small>{formatDate(entry.date)}</small>}
                {entry.note && <small className="pi-timeline-note">{entry.note}</small>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {eventsError && <p className="fh-note">{eventsError}</p>}
      {item.notes && <p className="fh-note pi-side-notes">{item.notes}</p>}
      {actions.length > 0 && (
        <div className="pi-side-actions">
          {canCollect && (
            <>
              <label className="pi-side-field">
                <span>{item.direction === "Receivable" ? "Tahsilat hesabı" : "Ödeme hesabı"}</span>
                <select
                  ref={accountSelectRef}
                  aria-label={`${item.code} finans hesabı`}
                  value={accountId}
                  onChange={(event) => onAccountChange(event.target.value)}
                >
                  <option value="">Hesap seçin</option>
                  {matchingAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.currencyCode}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => onAction(item, "collect")}
              >
                <CheckCircle2 size={15} aria-hidden="true" /> {collectLabel(item)}
              </button>
            </>
          )}
          {secondary.map((action) => (
            <button
              key={action}
              type="button"
              className={`secondary${action === "bounce" || action === "cancel" ? " pi-danger-button" : ""}`}
              disabled={busy}
              onClick={() => onAction(item, action)}
            >
              {action === "endorse" && <ArrowLeftRight size={15} aria-hidden="true" />}
              {action === "bounce" && <XCircle size={15} aria-hidden="true" />}
              {action === "endorse" ? "Ciro et" : action === "bounce" ? "Karşılıksız" : "İptal"}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
