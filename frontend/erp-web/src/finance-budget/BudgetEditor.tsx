import { Trash2 } from "lucide-react";
import type { Account, Entry, PlanView } from "./types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../record-form/RecordForm";
import "../finance-record-forms.css";


type Props = {
  selected: PlanView | null;
  name: string;
  year: number;
  entries: Entry[];
  eligible: Account[];
  baseCurrency: string;
  controlsLocked: boolean;
  busy: boolean;
  onNameChange: (value: string) => void;
  onYearChange: (value: number) => void;
  onAddLine: () => void;
  onUpdateLine: (index: number, patch: Partial<Entry>) => void;
  onRemoveLine: (index: number) => void;
  onCancel: () => void;
  /** Kept for callers; the editor no longer shows a separate "Yeni" button (the page header has one). */
  onNew?: () => void;
  onSubmit: (event: React.FormEvent) => void;
};

export default function BudgetEditor({
  selected,
  name,
  year,
  entries,
  eligible,
  baseCurrency,
  controlsLocked,
  busy,
  onNameChange,
  onYearChange,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onCancel,
  onSubmit,
}: Props) {
  const saveBlocked =
    controlsLocked ||
    !baseCurrency ||
    eligible.length === 0 ||
    entries.length === 0;
  return (
    <section
      className="panel budget-editor fin-rf-host"
      aria-label={selected ? "Bütçe taslağını düzenle" : "Yeni bütçe taslağı"}
    >
      <RecordFormPage
        variant="dialog"
        title={selected ? "Bütçe taslağını düzenle" : "Yeni bütçe taslağı"}
        mode={selected ? "edit" : "create"}
        busy={busy}
        saveLabel={selected ? "Taslağı kaydet" : "Taslak oluştur"}
        onSubmit={(event) => {
          if (saveBlocked) {
            event.preventDefault();
            return;
          }
          onSubmit(event);
        }}
        onCancel={() => {
          if (!controlsLocked) onCancel();
        }}
        status={
          <>
            <span>{eligible.length} uygun hesap</span>
            {eligible.length === 0 && (
              <span className="rf-status-warning" role="status">
                Aktif gelir veya gider hesabı bulunamadı. Bütçe oluşturmak için
                önce hesap planını güncelleyin.
              </span>
            )}
            {eligible.length > 0 && entries.length === 0 && (
              <span className="rf-status-warning">
                Kaydetmek için en az bir bütçe satırı ekleyin.
              </span>
            )}
          </>
        }
      >
        <RecordFormGroup title="Bütçe Kimliği" bodyClassName="rf-identity">
          <label>
            <span>
              Mali yıl
              <RequiredMark />
            </span>
            <input
              className="rf-must rf-num"
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              required
              disabled={controlsLocked}
            />
          </label>
          <label>
            <span>
              Senaryo adı
              <RequiredMark />
            </span>
            <input
              className="rf-must"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={120}
              required
              autoComplete="off"
              disabled={controlsLocked}
            />
          </label>
          <label>
            Baz para birimi
            <input
              className="rf-mono"
              value={baseCurrency}
              readOnly
              aria-readonly="true"
              aria-describedby="budget-currency-help"
              disabled={controlsLocked}
            />
          </label>
          <p className="fin-rf-hint fin-rf-span-all" id="budget-currency-help">
            Bütçe ve yevmiye gerçekleşenleri aynı ölçekte karşılaştırmak için
            yalnızca firmanın baz para birimi kullanılır. Döviz çevrimi
            uygulanmaz.
          </p>
        </RecordFormGroup>
        <RecordFormGroup title="Aylık bütçe satırları">
          <div className="fin-rf-bar">
            <p className="fin-rf-hint">
              Her satır bir hesap ve ay için planlanan tahakkuk tutarını
              belirtir.
            </p>
            <button
              type="button"
              className="secondary small-button"
              data-line-add-shortcut
              title="Ctrl+Shift+Enter ile satır ekle"
              onClick={onAddLine}
              disabled={controlsLocked}
            >
              + Satır ekle
            </button>
          </div>
          {entries.length === 0 && (
            <div className="fin-rf-empty">
              Henüz satır yok. Devam etmek için bir bütçe satırı ekleyin.
            </div>
          )}
          {entries.length > 0 && (
            <div className="budget-lines" role="table" aria-label="Bütçe satırları">
              <div className="budget-lines-head" role="row">
                <span role="columnheader">Gelir / gider hesabı <RequiredMark /></span>
                <span role="columnheader">Ay <RequiredMark /></span>
                <span role="columnheader" className="is-num">Plan tutarı <RequiredMark /></span>
                <span role="columnheader">Not</span>
                <span role="columnheader" aria-label="İşlem" />
              </div>
              {entries.map((line, index) => (
                <div className="budget-lines-row" role="row" key={index}>
                  <select
                    aria-label={`Satır ${index + 1} hesap`}
                    value={line.accountId}
                    onChange={(e) => onUpdateLine(index, { accountId: e.target.value })}
                    required
                    disabled={controlsLocked}
                  >
                    <option value="">Hesap seçin</option>
                    {eligible.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name} (
                        {account.statementSection === "Revenue" ? "Gelir" : "Gider"})
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Satır ${index + 1} ay`}
                    type="month"
                    value={line.periodStart.slice(0, 7)}
                    onChange={(e) => onUpdateLine(index, { periodStart: `${e.target.value}-01` })}
                    required
                    disabled={controlsLocked}
                  />
                  <input
                    aria-label={`Satır ${index + 1} plan tutarı`}
                    className="rf-num"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.plannedAmount}
                    onChange={(e) => onUpdateLine(index, { plannedAmount: Number(e.target.value) })}
                    required
                    disabled={controlsLocked}
                  />
                  <input
                    aria-label={`Satır ${index + 1} not`}
                    value={line.notes || ""}
                    maxLength={240}
                    placeholder="İsteğe bağlı"
                    onChange={(e) => onUpdateLine(index, { notes: e.target.value || null })}
                    disabled={controlsLocked}
                  />
                  <button
                    type="button"
                    className="budget-line-remove"
                    aria-label={`Satır ${index + 1} sil`}
                    title={entries.length === 1 ? "En az bir satır kalmalı" : "Satırı sil"}
                    disabled={controlsLocked || entries.length === 1}
                    onClick={() => onRemoveLine(index)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="budget-lines-foot">
                <span>
                  Toplam plan:{" "}
                  <b>
                    {entries
                      .reduce((sum, line) => sum + (Number(line.plannedAmount) || 0), 0)
                      .toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    {baseCurrency}
                  </b>{" "}
                  · {entries.length} satır
                </span>
              </div>
            </div>
          )}
        </RecordFormGroup>
      </RecordFormPage>
    </section>
  );
}
