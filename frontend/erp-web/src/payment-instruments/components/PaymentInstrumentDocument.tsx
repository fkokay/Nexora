import { useRef, type Ref } from "react";
import { DocumentSurface, type DocumentStatusTone } from "../../document-page/DocumentSurface";
import { DocumentStatusFlow, type DocumentFlowStep } from "../../document-page/DocumentStatusFlow";
import { DetailInfoGrid, DetailTiles, daysFromToday, formatAmount, formatDate } from "../../document-detail/DocumentDetailLayout";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import type { PageCommands } from "../../commands/types";
import { isInPopup, openDialogs, useWindowKeyDown } from "../../record-form/recordFormKeys";
import type { FinanceAccount, InstrumentEvent, Item, Status } from "../paymentInstrumentTypes";
import { allowedActions, collectLabel, statusText, statusTone } from "../paymentInstrumentTypes";
import { instrumentTimeline } from "./PaymentInstrumentSidePanel";

const surfaceTone: Record<(typeof statusTone)[Status], DocumentStatusTone> = {
  info: "info",
  ok: "success",
  warn: "warning",
  bad: "danger",
  off: "neutral",
};

/** Portföyde → its outcome (ciro / tahsil / ödeme); Karşılıksız and İptal are end states outside the flow. */
function statusFlow(item: Item) {
  const collected: DocumentFlowStep = { key: "Collected", label: item.direction === "Receivable" ? "Tahsil edildi" : "Ödendi" };
  const outcome: DocumentFlowStep = item.status === "Endorsed" ? { key: "Endorsed", label: statusText.Endorsed } : collected;
  const terminal: DocumentFlowStep | undefined =
    item.status === "Bounced" ? { key: "Bounced", label: statusText.Bounced } : item.status === "Cancelled" ? { key: "Cancelled", label: "İptal edildi" } : undefined;
  return <DocumentStatusFlow steps={[{ key: "Portfolio", label: statusText.Portfolio }, outcome]} current={item.status} terminal={terminal} />;
}

type Props = {
  item: Item;
  events: InstrumentEvent[] | null;
  eventsLoading: boolean;
  eventsError: string;
  isAdmin: boolean;
  baseCurrency: string;
  accounts: FinanceAccount[];
  accountId: string;
  onAccountChange: (value: string) => void;
  accountSelectRef?: Ref<HTMLSelectElement>;
  /** The document's İşlem Çubuğu: Excel / Filtre closed, Yenile reloads, the record actions in İşlemler. */
  commands: PageCommands;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onClose: () => void;
};

/**
 * Çek / senet kaydı (taslak 09: Kayıt v3 + olay geçmişi). Salt okunur: bilgiler listedeki kayıttan, geçmiş
 * GET …/{id}/events'ten (yan paneldeki ile aynı); işlemler İşlemler menüsünde, tahsilat / ödeme hesabı burada seçilir.
 */
export function PaymentInstrumentDocument({
  item,
  events,
  eventsLoading,
  eventsError,
  isAdmin,
  baseCurrency,
  accounts,
  accountId,
  onAccountChange,
  accountSelectRef,
  commands,
  error,
  notice,
  onDismissError,
  onDismissNotice,
  onClose,
}: Props) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  // Esc returns to the list; not while a dialog (the action prompts), a menu or a picker owns it, nor from a hidden view.
  useWindowKeyDown(true, (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || openDialogs().length || document.querySelector('[role="menu"]')) return;
    if (anchorRef.current?.parentElement?.closest("[hidden]")) return;
    event.preventDefault();
    onClose();
  });
  const kind = item.type === "Check" ? "Çek" : "Senet";
  const amount =
    baseCurrency && item.currencyCode === baseCurrency ? formatAmount(item.amount) : formatAmount(item.amount, item.currencyCode);
  const open = item.status === "Portfolio" || item.status === "Bounced";
  const days = daysFromToday(item.dueDate);
  const canCollect = isAdmin && allowedActions(item).includes("collect");
  const matchingAccounts = accounts.filter((account) => account.currencyCode === item.currencyCode);
  const entries = instrumentTimeline(item, events);
  return (
    <>
      <span ref={anchorRef} hidden />
      <PageCommandsSlot commands={commands} />
      <DocumentSurface
        variant="detail"
        className="pi-surface"
        title={kind}
        eyebrow={`${item.direction === "Receivable" ? "Alınan" : "Verilen"} ${kind.toLocaleLowerCase("tr-TR")}`}
        code={item.instrumentNumber}
        subtitle={item.counterpartyName}
        status={{ label: statusText[item.status], tone: surfaceTone[statusTone[item.status]] }}
        meta={
          <span>
            {item.code}
            {item.bankName && <> · {item.bankName}</>} · {item.currencyCode}
          </span>
        }
        statusFlow={statusFlow(item)}
        onClose={onClose}
        hints={["Alt+İ işlemler", "Esc listeye dön"]}
        footerStatus={
          <span>
            <span>Tutar</span> <b>{amount}</b>
          </span>
        }
      >
        <div className="pi-surface-body">
          {error && (
            <div className="alert inline-alert" role="alert">
              {error}
              <button type="button" onClick={onDismissError} aria-label="Uyarıyı kapat">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button type="button" onClick={onDismissNotice} aria-label="Bildirimi kapat">
                ×
              </button>
            </div>
          )}
          <DetailTiles
            label={`${kind} özeti`}
            items={[
              { label: "Tutar", value: amount },
              {
                label: "Vade",
                value: formatDate(item.dueDate),
                hint: open ? <span>{days === 0 ? "Bugün" : days > 0 ? `${days} gün` : `${-days} gün geçti`}</span> : undefined,
                tone: open && days < 0 ? "danger" : undefined,
              },
              { label: "Portföy tarihi", value: formatDate(item.portfolioDate) },
              { label: "Düzenleme tarihi", value: formatDate(item.issueDate) },
            ]}
          />
          <div className="pi-surface-grid">
            <section className="dd-box pi-surface-box" aria-label={`${kind} bilgileri`}>
              <h3>Bilgiler</h3>
              <DetailInfoGrid
                label={`${kind} bilgileri`}
                items={[
                  { label: "Tür", value: kind },
                  { label: "Yön", value: item.direction === "Receivable" ? "Alınan" : "Verilen" },
                  { label: "Portföy kodu", value: item.code },
                  { label: "Cari", value: item.counterpartyName },
                  { label: "Banka", value: item.bankName || "—" },
                  { label: "Para birimi", value: item.currencyCode },
                  ...(item.endorsedTo ? [{ label: "Ciro edilen", value: item.endorsedTo }] : []),
                  ...(item.collectedAt
                    ? [{ label: item.direction === "Receivable" ? "Tahsil tarihi" : "Ödeme tarihi", value: formatDate(item.collectedAt) }]
                    : []),
                ]}
              />
              {item.notes && <p className="fh-note pi-surface-notes">{item.notes}</p>}
              {canCollect && (
                <div className="pi-surface-collect">
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
                  <p className="fh-note">{`İşlemler › ${collectLabel(item)} bu hesabı kullanır.`}</p>
                </div>
              )}
            </section>
            <section className="dd-box pi-surface-box" aria-label="Olay geçmişi">
              <h3>Olay geçmişi</h3>
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
            </section>
          </div>
        </div>
      </DocumentSurface>
    </>
  );
}
