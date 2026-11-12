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
  onNew: () => void;
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
  onNew,
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
        <div className="fin-rf-bar">
          <p className="fin-rf-hint">
            Yalnız aktif gelir ve gider hesapları seçilebilir.
          </p>
          {selected && (
            <button
              type="button"
              className="row-action"
              onClick={onNew}
              disabled={controlsLocked}
            >
              Yeni
            </button>
          )}
        </div>
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
          <div className="fin-rf-lines">
            {entries.map((line, index) => (
              <fieldset className="fin-rf-line fin-rf-line--budget" key={index}>
                <legend>Satır {index + 1}</legend>
                <label>
                  Gelir / gider hesabı
                  <select
                    value={line.accountId}
                    onChange={(e) =>
                      onUpdateLine(index, { accountId: e.target.value })
                    }
                    required
                    disabled={controlsLocked}
                  >
                    <option value="">Hesap seçin</option>
                    {eligible.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name} (
                        {account.statementSection === "Revenue"
                          ? "Gelir"
                          : "Gider"}
                        )
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ay
                  <input
                    type="month"
                    value={line.periodStart.slice(0, 7)}
                    onChange={(e) =>
                      onUpdateLine(index, { periodStart: `${e.target.value}-01` })
                    }
                    required
                    disabled={controlsLocked}
                  />
                </label>
                <label>
                  Planlanan tahakkuk tutarı
                  <input
                    className="rf-num"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.plannedAmount}
                    onChange={(e) =>
                      onUpdateLine(index, {
                        plannedAmount: Number(e.target.value),
                      })
                    }
                    required
                    disabled={controlsLocked}
                  />
                </label>
                <label>
                  Not{" "}
                  <input
                    value={line.notes || ""}
                    maxLength={240}
                    onChange={(e) =>
                      onUpdateLine(index, { notes: e.target.value || null })
                    }
                    disabled={controlsLocked}
                  />
                </label>
                <button
                  type="button"
                  className="row-action danger"
                  aria-label={`Satır ${index + 1} sil`}
                  disabled={controlsLocked || entries.length === 1}
                  onClick={() => onRemoveLine(index)}
                >
                  Sil
                </button>
              </fieldset>
            ))}
          </div>
        </RecordFormGroup>
      </RecordFormPage>
    </section>
  );
}
