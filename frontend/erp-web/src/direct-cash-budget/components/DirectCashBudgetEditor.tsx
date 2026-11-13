import type { FormEvent } from "react";
import { categories, type LineInput, type PlanView } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../finance-record-forms.css";


type Props = {
  selected: PlanView | null;
  name: string;
  year: number;
  currency: string;
  lines: LineInput[];
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onNameChange: (value: string) => void;
  onYearChange: (value: number) => void;
  onCurrencyChange: (value: string) => void;
  onAddLine: () => void;
  onUpdateLine: (index: number, patch: Partial<LineInput>) => void;
  onRemoveLine: (index: number) => void;
  onCancel: () => void;
};

export default function DirectCashBudgetEditor({
  selected,
  name,
  year,
  currency,
  lines,
  busy,
  onSubmit,
  onNameChange,
  onYearChange,
  onCurrencyChange,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onCancel,
}: Props) {
  const saveBlocked =
    busy || !name.trim() || !/^[A-Z]{3}$/.test(currency) || lines.length === 0;
  return (
    <section
      className="panel direct-cash-budget-editor fin-rf-host"
      aria-label={selected ? "Taslağı düzenle" : "Yeni taslak"}
    >
      <RecordFormPage
        variant="dialog"
        title={selected ? "Taslağı düzenle" : "Yeni taslak"}
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
          if (!busy) onCancel();
        }}
        status={
          <span>
            Sürüm {selected?.revision ?? 1} · Onaylama farklı bir TenantAdmin
            tarafından yapılmalıdır.
          </span>
        }
      >
        <p className="fin-rf-hint">
          Tahsilat ve ödemeleri planlayın; kaydetmek gerçek işlem başlatmaz.
        </p>
        <RecordFormGroup title="Plan Kimliği" bodyClassName="rf-identity">
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
              onChange={(event) => onYearChange(Number(event.target.value))}
              required
              disabled={busy}
            />
          </label>
          <label>
            <span>
              Plan adı
              <RequiredMark />
            </span>
            <input
              className="rf-must"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={120}
              required
              disabled={busy}
            />
          </label>
          <label>
            <span>
              Para birimi (ISO 4217)
              <RequiredMark />
            </span>
            <input
              className="rf-must rf-mono"
              value={currency}
              onChange={(event) =>
                onCurrencyChange(event.target.value.toUpperCase())
              }
              minLength={3}
              maxLength={3}
              pattern="[A-Z]{3}"
              required
              disabled={busy}
            />
          </label>
          <p className="fin-rf-hint fin-rf-span-all">
            Plan yalnız aynı para birimindeki tahmin satırlarıyla toplanır; kur
            dönüşümü yapılmaz.
          </p>
        </RecordFormGroup>
        <RecordFormGroup title="Aylık nakit satırları">
          <div className="fin-rf-bar">
            <p className="fin-rf-hint">
              En çok 1.200 satır; ayın ilk günü kullanılır.
            </p>
            <button
              className="secondary small-button"
              type="button"
              data-line-add-shortcut
              title="Ctrl+Shift+Enter ile satır ekle"
              onClick={onAddLine}
              disabled={busy || lines.length >= 1200}
            >
              + Satır ekle
            </button>
          </div>
          <div className="fin-rf-lines">
            {lines.map((line, index) => (
              <fieldset className="fin-rf-line fin-rf-line--cash" key={index}>
                <legend>Satır {index + 1}</legend>
                <label>
                  Ay
                  <input
                    type="month"
                    value={line.periodStart.slice(0, 7)}
                    onChange={(event) =>
                      onUpdateLine(index, {
                        periodStart: `${event.target.value}-01`,
                      })
                    }
                    required
                    disabled={busy}
                  />
                </label>
                <label>
                  Tür
                  <select
                    value={line.direction}
                    onChange={(event) =>
                      onUpdateLine(index, {
                        direction: event.target.value as LineInput["direction"],
                      })
                    }
                    disabled={busy}
                  >
                    <option value="Inflow">Tahsilat</option>
                    <option value="Outflow">Ödeme</option>
                  </select>
                </label>
                <label>
                  Kategori
                  <select
                    value={line.category}
                    onChange={(event) =>
                      onUpdateLine(index, { category: event.target.value })
                    }
                    disabled={busy}
                  >
                    {categories.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Açıklama
                  <input
                    value={line.description}
                    onChange={(event) =>
                      onUpdateLine(index, { description: event.target.value })
                    }
                    maxLength={240}
                    required
                    disabled={busy}
                  />
                </label>
                <label>
                  Tutar
                  <input
                    className="rf-num"
                    type="number"
                    min="0"
                    max="9999999999999999"
                    step="0.01"
                    value={line.amount}
                    onChange={(event) =>
                      onUpdateLine(index, { amount: Number(event.target.value) })
                    }
                    required
                    disabled={busy}
                  />
                </label>
                <button
                  type="button"
                  className="row-action danger"
                  onClick={() => onRemoveLine(index)}
                  disabled={busy || lines.length <= 1}
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
