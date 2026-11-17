import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, KeyboardEvent, SetStateAction } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { LedgerAccount } from "../../erp-types";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import { PageCommandsSlot, confirmStartNew } from "../../commands/PageCommandsSlot";
import { confirmDialog } from "../../confirmDialog";
import type { MenuCommand } from "../../commands/types";
import { LINE_ADD_HINT, LineAddLabel, SalesFormLines } from "../../sales/salesDocumentForm";
import { LedgerAccountCombobox } from "./LedgerAccountCombobox";
import {
  emptyManualJournalLine,
  formatCents,
  isBlankManualJournalLine,
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
  /** Validation or server error (e.g. a closed fiscal period). */
  error: string;
  onDismissError: () => void;
  notice: string;
  onDismissNotice: () => void;
  /** Yevmiye Defterleri: Vazgeç (Esc) and İşlemler › Son fişler go there. */
  onOpenRecentEntries?: () => void;
  /** Yeni (F2): a fresh voucher. */
  onReset: () => void;
};

const MAX_LINES = 100;
const NO_ACCOUNT = "Aktif hesap yok; fiş kaydedilemez. Önce hesap planına hesap ekleyin.";

/**
 * Yevmiye fişi (mockup 02 / 09, document being created): the record form's behaviour (Kaydet Ctrl+S on the bar,
 * Esc = Vazgeç, Enter in a single-line field saves) with the document header, Belge bilgileri and the line grid.
 * The totals block ends with the debit = credit balance line. A saved entry has no status, so there is no status flow.
 */
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
  onReset,
}: ManualJournalFormProps) {
  const tableRef = useRef<HTMLTableSectionElement | null>(null);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const activeAccounts = accounts.filter((account) => account.isActive);
  const isTenantAdmin = role === "TenantAdmin";
  const totals = manualJournalTotals(manualLines);
  const balanced = totals.debit > 0 && totals.difference === 0;
  const dirty = Boolean(manualDescription.trim()) || manualLines.some((line) => !isBlankManualJournalLine(line));

  // After "Satır ekle" (or Enter on the last amount) move to the new line's account.
  useEffect(() => {
    if (focusLine === null) return;
    tableRef.current?.querySelector<HTMLInputElement>(`[data-line-account="${focusLine}"]`)?.focus();
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
    // Never saves from an amount: Enter on the last line adds a line.
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

  if (!isTenantAdmin)
    return (
      <section className="gl-voucher-locked" aria-labelledby="gl-voucher-title">
        <h1 id="gl-voucher-title">Yeni yevmiye fişi</h1>
        <p>Yevmiye fişi kaydetmek için firma yöneticisi yetkisi gerekir.</p>
      </section>
    );

  const more: MenuCommand[] = onOpenRecentEntries ? [{ id: "journal-recent", label: "Son fişler", run: onOpenRecentEntries }] : [];
  return (
    <>
      <PageCommandsSlot
        commands={{
          new: {
            disabledReason: busy ? "Kaydediliyor…" : undefined,
            run: async () => {
              if (!(await confirmStartNew(dirty))) return;
              onReset();
            },
          },
          more,
        }}
      />
      {/* The header's Vazgeç asks first when lines were entered, as Esc does (the kit asks before calling onCancel). */}
      <div
        className="gl-voucher-host"
        onClickCapture={(event) => {
          const button = (event.target as HTMLElement).closest("button");
          if (!dirty || !button || !button.matches(".doc-surface-side > .rf-btn:last-child")) return;
          event.preventDefault();
          event.stopPropagation();
          void confirmDialog({ title: "Vazgeç", message: "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?", confirmLabel: "Devam" }).then(
            (confirmed) => {
              if (!confirmed) return;
              onReset();
              onOpenRecentEntries?.();
            },
          );
        }}
      >
      <RecordFormPage
        className="gl-voucher-rf"
        title="Yeni yevmiye fişi"
        mode="create"
        busy={busy}
        saveLabel="Fişi kaydet"
        saveDisabledReason={activeAccounts.length === 0 ? NO_ACCOUNT : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          createManualEntry(event);
        }}
        onCancel={() => {
          // Vazgeç drops the entered voucher (the form state outlives this tab), then goes to the ledger.
          onReset();
          onOpenRecentEntries?.();
        }}
        error={error}
        onDismissError={onDismissError}
        document={{
          type: "Yevmiye fişi",
          party: manualDescription.trim() || undefined,
          hints: [LINE_ADD_HINT, "Enter son tutarda satır ekler", ...(more.length ? ["Alt+İ işlemler"] : [])],
        }}
        status={
          <>
            <span>Kaydedilen fiş değiştirilemez; düzeltme ters kayıtla yapılır.</span>
            {notice && (
              <span className="rf-status-notice" role="status">
                {notice}
                <button type="button" className="gl-voucher-dismiss" aria-label="Bildirimi kapat" onClick={onDismissNotice}>
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            )}
            <span className="rf-status-end">
              <span>Satır:</span> <b>{manualLines.length}</b>
            </span>
          </>
        }
      >
        {accountsLoaded !== false && activeAccounts.length === 0 && (
          <div className="alert inline-alert" role="status">
            {NO_ACCOUNT}
          </div>
        )}
        <RecordFormGroup title="Belge bilgileri" hint="* zorunlu alan" bodyClassName="rf-identity doc-form-fields">
          <label>
            <span>
              Fiş tarihi <RequiredMark />
            </span>
            <input className="rf-must" type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} required />
          </label>
          <label>
            <span>Muhasebe standardı</span>
            <select value={manualAccountingBasis} onChange={(event) => setManualAccountingBasis(event.target.value as "TDHP" | "IFRS")}>
              <option value="TDHP">Türkiye · TDHP</option>
              <option value="IFRS">IFRS / UFRS düzeltme fişi</option>
            </select>
          </label>
          <label className="rf-span-2">
            <span>
              Açıklama <RequiredMark />
            </span>
            <input
              className="rf-must"
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              maxLength={240}
              required
              placeholder="Örn. Kasa sayım farkı düzeltmesi"
            />
          </label>
        </RecordFormGroup>
        <SalesFormLines
          label="Fiş satırları"
          lines={manualLines.length}
          extra="bir satıra yalnızca borç ya da alacak"
          notes={<p className="dd-muted">Hesap kodu veya adıyla arayın; boş satırlar kaydedilmez.</p>}
          totalsLabel="Fiş toplamları"
          totals={[
            { key: "debit", label: "Toplam borç", value: formatCents(totals.debit) },
            { key: "credit", label: "Toplam alacak", value: formatCents(totals.credit) },
            {
              key: "difference",
              label: totals.difference === 0 ? "Borç = Alacak" : "Fark",
              emphasis: "grand",
              value: (
                <span className={`gl-voucher-difference${totals.difference !== 0 ? " is-unbalanced" : balanced ? " is-balanced" : ""}`}>
                  {balanced && <CheckCircle2 size={14} aria-hidden="true" />}
                  {differenceLabel}
                </span>
              ),
            },
          ]}
        >
          <table className="dd-lines gl-voucher-lines">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th className="gl-voucher-col-account">Hesap</th>
                <th>Satır açıklaması</th>
                <th className="dd-num">Borç</th>
                <th className="dd-num">Alacak</th>
                <th className="dd-menu">
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
                    <td className="dd-ix">{index + 1}</td>
                    <td className="dd-stock-cell gl-voucher-col-account">
                      <LedgerAccountCombobox
                        accounts={activeAccounts}
                        value={line.accountId}
                        onChange={(accountId) => updateLine(index, { accountId })}
                        ariaLabel={`${index + 1}. satır hesabı`}
                        lineIndex={index}
                        disabled={busy}
                      />
                    </td>
                    <td>
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
                    <td className="dd-num">
                      <input
                        inputMode="decimal"
                        aria-label={`${index + 1}. satır borç`}
                        aria-invalid={debitInvalid || undefined}
                        value={line.debit}
                        placeholder="0,00"
                        onChange={(e) => setAmount(index, "debit", e.target.value)}
                        onKeyDown={(e) => onAmountKeyDown(e, index)}
                      />
                    </td>
                    <td className="dd-num">
                      <input
                        inputMode="decimal"
                        aria-label={`${index + 1}. satır alacak`}
                        aria-invalid={creditInvalid || undefined}
                        value={line.credit}
                        placeholder="0,00"
                        onChange={(e) => setAmount(index, "credit", e.target.value)}
                        onKeyDown={(e) => onAmountKeyDown(e, index)}
                      />
                    </td>
                    <td className="dd-menu">
                      <button
                        type="button"
                        className="dd-line-remove"
                        aria-label={`${index + 1}. satırı kaldır`}
                        title="Satırı kaldır"
                        onClick={() => removeLine(index)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="dd-new-line">
                <td colSpan={6}>
                  <button type="button" data-line-add-shortcut disabled={manualLines.length >= MAX_LINES} onClick={addLine}>
                    <LineAddLabel />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </SalesFormLines>
      </RecordFormPage>
      </div>
    </>
  );
}
