import type { Dispatch, SetStateAction } from "react";
import type { LedgerAccount } from "../../erp-types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../finance-record-forms.css";

export type ManualJournalFormProps = {
  role: string;
  busy: boolean;
  accounts: LedgerAccount[];
  manualDate: string;
  setManualDate: Dispatch<SetStateAction<string>>;
  manualAccountingBasis: "TDHP" | "IFRS";
  setManualAccountingBasis: Dispatch<SetStateAction<"TDHP" | "IFRS">>;
  manualDescription: string;
  setManualDescription: Dispatch<SetStateAction<string>>;
  manualLines: {
    accountId: string;
    description: string;
    debit: string;
    credit: string;
  }[];
  setManualLines: Dispatch<
    SetStateAction<
      {
        accountId: string;
        description: string;
        debit: string;
        credit: string;
      }[]
    >
  >;
  createManualEntry: (event: React.FormEvent) => void;
};
export function ManualJournalForm({
  role,
  busy,
  accounts,
  manualDate,
  setManualDate,
  manualAccountingBasis,
  setManualAccountingBasis,
  manualDescription,
  setManualDescription,
  manualLines,
  setManualLines,
  createManualEntry,
}: ManualJournalFormProps) {
  const activeAccountCount = accounts.filter(
    (account) => account.isActive,
  ).length;
  const debitTotal = manualLines.reduce(
    (sum, line) => sum + (Number(line.debit) || 0),
    0,
  );
  const creditTotal = manualLines.reduce(
    (sum, line) => sum + (Number(line.credit) || 0),
    0,
  );
  const money = (value: number) =>
    value.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
  return (
    <>
      {role === "TenantAdmin" && (
        <section
          className="panel ledger-manual-journal-panel fin-rf-host"
          style={{ marginTop: 14 }}
        >
          <RecordFormPage
            variant="dialog"
            className="fin-rf-no-cancel"
            title="Manuel yevmiye fişi"
            mode="create"
            busy={busy}
            saveLabel="Dengeli fişi kaydet"
            onSubmit={(event) => {
              if (activeAccountCount === 0) {
                event.preventDefault();
                return;
              }
              createManualEntry(event);
            }}
            onCancel={() => {}}
            status={
              <>
                <span>
                  Borç: <b>{money(debitTotal)}</b>
                </span>
                <span>
                  Alacak: <b>{money(creditTotal)}</b>
                </span>
                {activeAccountCount === 0 && (
                  <span className="rf-status-warning">
                    Aktif hesap yok; fiş kaydedilemez.
                  </span>
                )}
                <span className="rf-status-end">
                  Fiş kaydedildikten sonra değiştirilemez.
                </span>
              </>
            }
          >
            <p className="fin-rf-hint">
              Henüz otomatik aktarımı olmayan hareketleri tenant hesaplarına
              dengeli olarak kaydedin. Fiş kaydedildikten sonra değiştirilemez.
            </p>
            <RecordFormGroup title="Fiş Kimliği" bodyClassName="rf-identity">
              <label>
                <span>
                  Fiş tarihi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>
                  Açıklama
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  maxLength={240}
                  required
                />
              </label>
              <label className="fin-rf-span-2">
                Muhasebe standardı
                <select
                  value={manualAccountingBasis}
                  onChange={(event) =>
                    setManualAccountingBasis(
                      event.target.value as "TDHP" | "IFRS",
                    )
                  }
                >
                  <option value="TDHP">Türkiye · TDHP</option>
                  <option value="IFRS">IFRS / UFRS düzeltme fişi</option>
                </select>
              </label>
            </RecordFormGroup>
            <RecordFormGroup title="Fiş Satırları">
              <div className="fin-rf-lines">
                {manualLines.map((line, index) => (
                  <div className="fin-rf-line fin-rf-line--journal" key={index}>
                    <div className="fin-rf-line-title">
                      <b>Satır {index + 1}</b>
                      {manualLines.length > 2 && (
                        <button
                          type="button"
                          className="row-action"
                          onClick={() =>
                            setManualLines((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                        >
                          Kaldır
                        </button>
                      )}
                    </div>
                      <label>
                        Hesap
                        <select
                          value={line.accountId}
                          onChange={(e) =>
                            setManualLines((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, accountId: e.target.value }
                                  : row,
                              ),
                            )
                          }
                          required
                        >
                          <option value="">Aktif hesap seçin</option>
                          {accounts
                            .filter((account) => account.isActive)
                            .map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code} · {account.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Satır açıklaması
                        <input
                          value={line.description}
                          onChange={(e) =>
                            setManualLines((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, description: e.target.value }
                                  : row,
                              ),
                            )
                          }
                          maxLength={240}
                          required
                        />
                      </label>
                      <label>
                        Borç
                        <input
                          className="rf-num"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debit}
                          onChange={(e) =>
                            setManualLines((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      debit: e.target.value,
                                      credit:
                                        Number(e.target.value) > 0
                                          ? "0"
                                          : row.credit,
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Alacak
                        <input
                          className="rf-num"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.credit}
                          onChange={(e) =>
                            setManualLines((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      credit: e.target.value,
                                      debit:
                                        Number(e.target.value) > 0
                                          ? "0"
                                          : row.debit,
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                  </div>
                ))}
              </div>
              <div className="fin-rf-bar">
                <button
                  type="button"
                  className="secondary"
                  data-line-add-shortcut
                  title="Ctrl+Shift+Enter ile satır ekle"
                  disabled={manualLines.length >= 100}
                  onClick={() =>
                    setManualLines((current) => [
                      ...current,
                      { accountId: "", description: "", debit: "0", credit: "0" },
                    ])
                  }
                >
                  Satır ekle
                </button>
              </div>
            </RecordFormGroup>
          </RecordFormPage>
        </section>
      )}
    </>
  );
}
