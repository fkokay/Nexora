import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ListFooter } from "../../list-page/ListFooter";
import { localizedText } from "../../locale";
import type { Direction, InventoryDocument } from "../types";

const tr = (turkish: string, english: string) => localizedText(turkish, english);

type Props = {
  direction: Direction;
  caseCode: string;
  documents: InventoryDocument[];
  busy: boolean;
  locale: string;
  onLink: (documentId: string) => void;
  onClose: () => void;
};

/**
 * "Stok belgesi bağla" (mockup 10 · selection list, opened from İşlemler): the posted goods receipts (import) or
 * delivery notes (export) the endpoint offers for the case, as a single-choice list. Click / ↑↓ choose a row, Enter
 * or a double click links it; Esc closes.
 */
export function ForeignTradeDocumentPicker({ direction, caseCode, documents, busy, locale, onLink, onClose }: Props) {
  const choices = documents.filter((document) => !document.isLinked);
  const [currentId, setCurrentId] = useState(choices[0]?.id ?? "");
  const listRef = useRef<HTMLTableSectionElement | null>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`tr[data-record-id="${currentId}"]`)?.focus({ preventScroll: true });
    // Focus only on open; later moves focus the row themselves.
  }, []);
  const kind = direction === "Import" ? tr("Mal kabul", "Goods receipt") : tr("İrsaliye", "Delivery note");
  const title = tr("Stok belgesi seç", "Select inventory document");
  const link = (id: string) => {
    if (id && !busy) onLink(id);
  };
  const move = (step: number) => {
    const index = choices.findIndex((document) => document.id === currentId);
    const next = choices[Math.min(choices.length - 1, Math.max(0, index + step))];
    if (!next) return;
    setCurrentId(next.id);
    listRef.current?.querySelector<HTMLElement>(`tr[data-record-id="${next.id}"]`)?.focus();
  };
  const date = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(locale);
  return (
    <div
      className="foreign-trade-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <section className="foreign-trade-picker" role="dialog" aria-modal="true" aria-label={`${title} · ${caseCode}`}>
        <header className="foreign-trade-picker-head">
          <div>
            <h2>{title}</h2>
            <p>
              <span className="nx-code">{caseCode}</span> · {kind} ·{" "}
              {tr(
                "Bu adım yalnızca mevcut belgeyi bağlar; stok ikinci kez işlenmez.",
                "This only links the existing document; it does not post inventory again.",
              )}
            </p>
          </div>
          <button type="button" className="foreign-trade-picker-close" aria-label={tr("Kapat", "Close")} onClick={onClose} disabled={busy}>
            <X size={15} aria-hidden="true" />
          </button>
        </header>
        <div className="foreign-trade-picker-table">
          <table aria-label={tr("Kayıtlı stok belgeleri", "Posted inventory documents")}>
            <thead>
              <tr>
                <th scope="col">{tr("Belge", "Document")}</th>
                <th scope="col">{tr("Tarih", "Date")}</th>
                <th scope="col">{tr("Depo", "Warehouse")}</th>
                <th scope="col" className="nx-num">
                  {tr("Satır", "Lines")}
                </th>
              </tr>
            </thead>
            <tbody ref={listRef}>
              {choices.map((document) => (
                <tr
                  key={document.id}
                  data-record-id={document.id}
                  tabIndex={document.id === currentId ? 0 : -1}
                  aria-selected={document.id === currentId}
                  className={document.id === currentId ? "is-current" : undefined}
                  onClick={() => setCurrentId(document.id)}
                  onDoubleClick={() => link(document.id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      move(event.key === "ArrowDown" ? 1 : -1);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      link(document.id);
                    }
                  }}
                >
                  <td className="nx-code">{document.code}</td>
                  <td>{date(document.documentDate)}</td>
                  <td>{document.warehouseName}</td>
                  <td className="nx-num">{document.lineCount.toLocaleString(locale)}</td>
                </tr>
              ))}
              {!choices.length && (
                <tr>
                  <td colSpan={4} className="table-empty">
                    {tr(
                      "Uygun kayıtlı stok belgesi bulunamadı. Önce standart mal kabul veya teslimat işlemini tamamlayın.",
                      "No eligible posted inventory document was found. Complete the standard receipt or delivery first.",
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ListFooter hints={tr("↑↓ gez · Enter bağla · Çift tık bağla · Esc kapat", "↑↓ move · Enter link · Double-click link · Esc close")}>
          <span>
            {choices.length.toLocaleString(locale)} {tr("belge", "documents")}
          </span>
        </ListFooter>
        <div className="foreign-trade-picker-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            {tr("Vazgeç", "Cancel")}
          </button>
          <button type="button" className="primary" onClick={() => link(currentId)} disabled={!currentId || busy}>
            {tr("Bağla", "Link")}
          </button>
        </div>
      </section>
    </div>
  );
}
