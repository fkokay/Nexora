import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, KeyboardEvent, SetStateAction } from "react";
import { CheckCircle2, History, Plus, Save, X } from "lucide-react";
import type { LedgerAccount } from "../../erp-types";
import { RequiredMark } from "../../record-form/RecordForm";
import { FormSaveCommand } from "../../record-form/FormSaveCommand";
import { LedgerAccountCombobox } from "./LedgerAccountCombobox";
import {
  emptyManualJournalLine,
  formatCents,
  manualJournalTotals,
  parseAmountCents,
  type ManualJournalLine,
} from "../journalVoucher";
import "../journal-voucher.css";

export type ManualJournalFormProps = {
  role: string;
  busy: boolean;
  accounts: LedgerAccount[];
  /** False until the first account load finishes; hides the empty-chart warning meanwhile. */
  accountsLoaded?: boolean;
  manualDate: string;
  setManualDate: Dispatch<SetStateAction<string>>;
  manualAccountingBasis: "TDHP" | "IFRS";
  setManualAccountingBasis: Dispatch<SetStateAction<"TDHP" | "IFRS">>;
  manualDescription: string;
  setManualDescription: Dispatch<SetStateAction<string>>;
  manualLines: ManualJournalLine[];
  setManualLines: Dispatch<SetStateAction<ManualJournalLine[]>>;
  createManualEntry: (event: FormEvent) => void;
  /** Validation or server error, shown right next to the save bar. */
  error: string;
  onDismissError: () => void;
  notice: string;
  onDismissNotice: () => void;
  onOpenRecentEntries?: () => void;
};

const MAX_LINES = 100;

/** "Yeni yevmiye fişi": single header, meta band, line table and a sticky summary/save bar. */
export function ManualJournalForm({
  role,
  busy,
  accounts,
  accountsLoaded,
  manualDate,
  setManualDate,
  manualAccountingBasis,
  setManualAccountingBasis,
  manualDescription,
  setManualDescription,
  manualLines,
  setManualLines,
  createManualEntry,
  error,
  onDismissError,
  notice,
  onDismissNotice,
  onOpenRecentEntries,
}: ManualJournalFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const tableRef = useRef<HTMLTableSectionElement | null>(null);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const activeAccounts = accounts.filter((account) => account.isActive);
  const isTenantAdmin = role === "TenantAdmin";
  const totals = manualJournalTotals(manualLines);
  const balanced = totals.debit > 0 && totals.difference === 0;

  // After "Satır ekle" (or Enter on the last amount) move to the new line's account.
  useEffect(() => {
    if (focusLine === null) return;
    tableRef.current
      ?.querySelector<HTMLInputElement>(`[data-line-account="${focusLine}"]`)
      ?.focus();
    setFocusLine(null);
  }, [focusLine, manualLines.length]);

  function updateLine(index: number, patch: Partial<ManualJournalLine>) {
    setManualLines((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function addLine() {
    if (manualLines.length >= MAX_LINES) return;
    setManualLines((current) => [...current, emptyManualJournalLine()]);
    setFocusLine(manualLines.length);
  }
  function removeLine(index: number) {
    setManualLines((current) =>
      current.length > 2 ? current.filter((_, i) => i !== index) : current.map((row, i) => (i === index ? emptyManualJournalLine() : row)),
    );
  }
  function setAmount(index: number, side: "debit" | "credit", value: string) {
    // One side per line: a non-zero amount on one side clears the other.
    const other = side === "debit" ? "credit" : "debit";
    const cents = parseAmountCents(value);
    updateLine(index, cents ? { [side]: value, [other]: "" } : { [side]: value });
  }
  function onAmountKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (index === manualLines.length - 1) addLine();
  }

  const differenceLabel =
    totals.difference === 0
      ? balanced
        ? "Dengeli"
        : "—"
      : totals.difference > 0
        ? `${formatCents(totals.difference)} borç fazlası`
        : `${formatCents(-totals.difference)} alacak fazlası`;

  return (
    <section className="gl-voucher" aria-labelledby="gl-voucher-title">
      <header className="gl-voucher-head">
        <div className="gl-voucher-title">
          <span className="gl-voucher-eyebrow">Genel muhasebe</span>
          <div className="gl-voucher-title-row">
            <h1 id="gl-voucher-title">Yeni yevmiye fişi</h1>
            <span className="gl-voucher-badge">Yeni kayıt</span>
          </div>
        </div>
        {onOpenRecentEntries && (
          <button type="button" className="secondary gl-voucher-recent" onClick={onOpenRecentEntries}>
            <History size={15} aria-hidden="true" />
            Son fişler
          </button>
        )}
      </header>
      {notice && (
        <div className="notice gl-voucher-notice" role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Bildirimi kapat" onClick={onDismissNotice}>
            <X size={15} />
          </button>
        </div>
      )}
      {!isTenantAdmin ? (
        <p className="gl-voucher-readonly">Yevmiye fişi kaydetmek için firma yöneticisi yetkisi gerekir.</p>
      ) : (
        <>
        <FormSaveCommand
          formRef={formRef}
          disabledReason={
            busy
              ? "Kaydediliyor…"
              : activeAccounts.length === 0
                ? "Aktif hesap yok; fiş kaydedilemez. Önce hesap planına hesap ekleyin."
                : undefined
          }
        />
        <form
          ref={formRef}
          className="gl-voucher-form"
          noValidate={false}
          onSubmit={(event) => {
            event.preventDefault();
            createManualEntry(event);
          }}
        >
          <div className="gl-voucher-meta">
            <label className="gl-voucher-field gl-voucher-field--date">
              <span>
                Fiş tarihi
                <RequiredMark />
              </span>
              <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} required />
            </label>
            <label className="gl-voucher-field gl-voucher-field--description">
              <span>
                Açıklama
                <RequiredMark />
              </span>
              <input
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                maxLength={240}
                required
                placeholder="Örn. Kasa sayım farkı düzeltmesi"
              />
            </label>
            <label className="gl-voucher-field gl-voucher-field--basis">
              <span>Muhasebe standardı</span>
              <select
                value={manualAccountingBasis}
                onChange={(event) => setManualAccountingBasis(event.target.value as "TDHP" | "IFRS")}
              >
                <option value="TDHP">Türkiye · TDHP</option>
                <option value="IFRS">IFRS / UFRS düzeltme fişi</option>
              </select>
            </label>
          </div>

          <div className="gl-voucher-lines">
            <table className="gl-voucher-table">
              <thead>
                <tr>
                  <th scope="col" className="gl-voucher-col-no">#</th>
                  <th scope="col" className="gl-voucher-col-account">Hesap</th>
                  <th scope="col" className="gl-voucher-col-description">Satır açıklaması</th>
                  <th scope="col" className="gl-voucher-col-amount">Borç</th>
                  <th scope="col" className="gl-voucher-col-amount">Alacak</th>
                  <th scope="col" className="gl-voucher-col-remove">
                    <span className="sr-only">Satırı kaldır</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={tableRef}>
                {manualLines.map((line, index) => {
                  const debitInvalid = parseAmountCents(line.debit) === null;
                  const creditInvalid = parseAmountCents(line.credit) === null;
                  return (
                    <tr key={index}>
                      <td className="gl-voucher-col-no" data-label="#">{index + 1}</td>
                      <td className="gl-voucher-col-account" data-label="Hesap">
                        <LedgerAccountCombobox
                          accounts={activeAccounts}
                          value={line.accountId}
                          onChange={(accountId) => updateLine(index, { accountId })}
                          ariaLabel={`${index + 1}. satır hesabı`}
                          lineIndex={index}
                          disabled={busy}
                        />
                      </td>
                      <td className="gl-voucher-col-description" data-label="Satır açıklaması">
                        <input
                          aria-label={`${index + 1}. satır açıklaması`}
                          value={line.description}
                          placeholder={manualDescription.trim() || "Fiş açıklaması kullanılır"}
                          maxLength={240}
                          onChange={(e) => updateLine(index, { description: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.preventDefault();
                          }}
                        />
                      </td>
                      <td className="gl-voucher-col-amount" data-label="Borç">
                        <input
                          className="gl-voucher-amount"
                          inputMode="decimal"
                          aria-label={`${index + 1}. satır borç`}
                          aria-invalid={debitInvalid || undefined}
                          value={line.debit}
                          placeholder="0,00"
                          onChange={(e) => setAmount(index, "debit", e.target.value)}
                          onKeyDown={(e) => onAmountKeyDown(e, index)}
                        />
                      </td>
                      <td className="gl-voucher-col-amount" data-label="Alacak">
                        <input
                          className="gl-voucher-amount"
                          inputMode="decimal"
                          aria-label={`${index + 1}. satır alacak`}
                          aria-invalid={creditInvalid || undefined}
                          value={line.credit}
                          placeholder="0,00"
                          onChange={(e) => setAmount(index, "credit", e.target.value)}
                          onKeyDown={(e) => onAmountKeyDown(e, index)}
                        />
                      </td>
                      <td className="gl-voucher-col-remove">
                        <button
                          type="button"
                          className="gl-voucher-remove"
                          aria-label={`${index + 1}. satırı kaldır`}
                          title="Satırı kaldır"
                          onClick={() => removeLine(index)}
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="gl-voucher-add">
              <button type="button" className="secondary" disabled={manualLines.length >= MAX_LINES} onClick={addLine}>
                <Plus size={15} aria-hidden="true" />
                Satır ekle
              </button>
              <span className="gl-voucher-hint">
                Hesap kodu veya adıyla arayın · bir satıra yalnızca borç ya da alacak girilir
              </span>
            </div>
          </div>

          <div className="gl-voucher-footer">
            {error && (
              <div className="gl-voucher-error" role="alert">
                <span>{error}</span>
                <button type="button" aria-label="Hatayı kapat" onClick={onDismissError}>
                  <X size={15} />
                </button>
              </div>
            )}
            {accountsLoaded !== false && activeAccounts.length === 0 && (
              <div className="gl-voucher-error" role="status">
                <span>Aktif hesap yok; fiş kaydedilemez. Önce hesap planına hesap ekleyin.</span>
              </div>
            )}
            <div className="gl-voucher-summary">
              <dl className="gl-voucher-totals">
                <div>
                  <dt>Toplam borç</dt>
                  <dd>{formatCents(totals.debit)}</dd>
                </div>
                <div>
                  <dt>Toplam alacak</dt>
                  <dd>{formatCents(totals.credit)}</dd>
                </div>
                <div className={`gl-voucher-difference${totals.difference !== 0 ? " is-unbalanced" : balanced ? " is-balanced" : ""}`}>
                  <dt>Fark</dt>
                  <dd>
                    {balanced && <CheckCircle2 size={15} aria-hidden="true" />}
                    {differenceLabel}
                  </dd>
                </div>
              </dl>
              <p className="gl-voucher-note">Kaydedilen fiş değiştirilemez; düzeltme ters kayıtla yapılır.</p>
              <button type="submit" className="primary gl-voucher-save" disabled={busy || activeAccounts.length === 0}>
                <Save size={16} aria-hidden="true" />
                <span>{busy ? "Kaydediliyor…" : "Fişi kaydet"}</span>
                <kbd>Ctrl+S</kbd>
              </button>
            </div>
          </div>
        </form>
        </>
      )}
    </section>
  );
}
