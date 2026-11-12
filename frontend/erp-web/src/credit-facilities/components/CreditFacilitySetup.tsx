import type { Facility } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../finance-record-forms.css";


type Props = {
  isAdmin: boolean;
  view?: "facility" | "schedule" | "list";
  facilityCreateDialog?: React.RefObject<HTMLDialogElement | null>;
  onNavigate?: (page: string, label?: string) => void;
  busy: boolean;
  activeFacilities: Facility[];
  code: string;
  lender: string;
  kind: string;
  currency: string;
  limit: string;
  startDate: string;
  maturityDate: string;
  rate: string;
  notes: string;
  facilityId: string;
  dueDate: string;
  principal: string;
  interest: string;
  fee: string;
  scheduleNotes: string;
  onCloseFacilityDialog: () => void;
  onSubmitFacility: (event: React.FormEvent<HTMLFormElement>) => void;
  onSubmitSchedule: (event: React.FormEvent<HTMLFormElement>) => void;
  onCodeChange: (value: string) => void;
  onLenderChange: (value: string) => void;
  onKindChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onLimitChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onMaturityDateChange: (value: string) => void;
  onRateChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onFacilityIdChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onPrincipalChange: (value: string) => void;
  onInterestChange: (value: string) => void;
  onFeeChange: (value: string) => void;
  onScheduleNotesChange: (value: string) => void;
};

export function CreditFacilitySetup(props: Props) {
  if (!props.isAdmin) return null;
  const { busy, activeFacilities } = props;
  const view = props.view || "list";
  const showFacility = view === "facility",
    showSchedule = view === "schedule";
  const backToList = () =>
    props.onNavigate?.("finance-credit-facilities", "Krediler & Finansman");
  return (
    <div className="credit-setup-grid">
      {showFacility && (
        <section className="panel credit-operation-page fin-rf-host">
          <RecordFormPage
            variant="dialog"
            title="Yeni kredi / limit"
            mode="create"
            busy={busy}
            saveLabel="Krediyi oluştur"
            onSubmit={props.onSubmitFacility as (event: React.FormEvent) => void}
            onCancel={backToList}
            status={
              <span>Limit bilgisi; kullandırım/bakiye mutabakatı değildir.</span>
            }
          >
            <p className="fin-rf-hint">
              Finansman sözleşmesini ve onaylı limit bilgilerini tanımlayın.
            </p>
            <RecordFormGroup title="Kredi Kimliği" bodyClassName="rf-identity">
              <label>
                <span>
                  Kod
                  <RequiredMark />
                </span>
                <input
                  className="rf-must rf-mono"
                  value={props.code}
                  onChange={(event) => props.onCodeChange(event.target.value)}
                  maxLength={40}
                  required
                  placeholder="KRD-001"
                />
              </label>
              <label>
                <span>
                  Banka / finansman kurumu
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  value={props.lender}
                  onChange={(event) => props.onLenderChange(event.target.value)}
                  maxLength={160}
                  required
                />
              </label>
              <label>
                Ürün türü
                <select
                  value={props.kind}
                  onChange={(event) => props.onKindChange(event.target.value)}
                >
                  <option value="Loan">Ticari kredi</option>
                  <option value="Revolving">Rotatif / BCH</option>
                  <option value="Leasing">Finansal kiralama</option>
                  <option value="Other">Diğer</option>
                </select>
              </label>
              <label>
                <span>
                  Para birimi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must rf-mono"
                  value={props.currency}
                  onChange={(event) =>
                    props.onCurrencyChange(event.target.value.toUpperCase())
                  }
                  minLength={3}
                  maxLength={3}
                  required
                />
              </label>
            </RecordFormGroup>
            <div className="rf-columns">
              <RecordFormGroup title="Limit ve Faiz">
                <div className="rf-pair">
                  <label>
                    <span>
                      Onaylı limit
                      <RequiredMark />
                    </span>
                    <input
                      className="rf-must rf-num"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={props.limit}
                      onChange={(event) =>
                        props.onLimitChange(event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    Yıllık faiz (%)
                    <input
                      className="rf-num"
                      type="number"
                      min="0"
                      max="1000"
                      step="0.0001"
                      value={props.rate}
                      onChange={(event) =>
                        props.onRateChange(event.target.value)
                      }
                    />
                  </label>
                </div>
              </RecordFormGroup>
              <RecordFormGroup title="Vade">
                <div className="rf-pair">
                  <label>
                    <span>
                      Başlangıç tarihi
                      <RequiredMark />
                    </span>
                    <input
                      className="rf-must"
                      type="date"
                      value={props.startDate}
                      onChange={(event) =>
                        props.onStartDateChange(event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    Vade sonu
                    <input
                      type="date"
                      min={props.startDate}
                      value={props.maturityDate}
                      onChange={(event) =>
                        props.onMaturityDateChange(event.target.value)
                      }
                    />
                  </label>
                </div>
              </RecordFormGroup>
              <div className="rf-columns-wide">
                <RecordFormGroup title="Not">
                  <label>
                    Not
                    <textarea
                      value={props.notes}
                      onChange={(event) =>
                        props.onNotesChange(event.target.value)
                      }
                      maxLength={1000}
                    />
                  </label>
                </RecordFormGroup>
              </div>
            </div>
          </RecordFormPage>
        </section>
      )}
      {showSchedule && (
        <section className="panel credit-operation-page fin-rf-host">
          <RecordFormPage
            variant="dialog"
            title="Ödeme planına taksit ekle"
            mode="create"
            busy={busy}
            saveLabel="Taksiti ekle"
            onSubmit={(event) => {
              if (!props.facilityId) {
                event.preventDefault();
                return;
              }
              props.onSubmitSchedule(event as React.FormEvent<HTMLFormElement>);
            }}
            onCancel={backToList}
            status={<span>Plan satırı muhasebe kaydı oluşturmaz.</span>}
          >
            <p className="fin-rf-hint">
              Planlanan anapara, faiz ve ücretler nakit tahmininde ödeme olarak
              görünür.
            </p>
            <RecordFormGroup title="Taksit Kimliği" bodyClassName="fin-rf-grid-2">
              <label>
                <span>
                  Kredi / limit
                  <RequiredMark />
                </span>
                <select
                  className="rf-must"
                  value={props.facilityId}
                  onChange={(event) =>
                    props.onFacilityIdChange(event.target.value)
                  }
                  required
                >
                  <option value="">Aktif kredi seçin</option>
                  {activeFacilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.code} · {facility.lenderName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  Vade tarihi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  type="date"
                  value={props.dueDate}
                  onChange={(event) =>
                    props.onDueDateChange(event.target.value)
                  }
                  required
                />
              </label>
            </RecordFormGroup>
            <RecordFormGroup title="Tutarlar" bodyClassName="rf-custom-grid">
              <label>
                <span>
                  Anapara
                  <RequiredMark />
                </span>
                <input
                  className="rf-must rf-num"
                  type="number"
                  min="0"
                  step="0.01"
                  value={props.principal}
                  onChange={(event) =>
                    props.onPrincipalChange(event.target.value)
                  }
                  required
                />
              </label>
              <label>
                Faiz
                <input
                  className="rf-num"
                  type="number"
                  min="0"
                  step="0.01"
                  value={props.interest}
                  onChange={(event) =>
                    props.onInterestChange(event.target.value)
                  }
                />
              </label>
              <label>
                Ücret / komisyon
                <input
                  className="rf-num"
                  type="number"
                  min="0"
                  step="0.01"
                  value={props.fee}
                  onChange={(event) => props.onFeeChange(event.target.value)}
                />
              </label>
              <label className="fin-rf-span-all">
                Not
                <input
                  value={props.scheduleNotes}
                  onChange={(event) =>
                    props.onScheduleNotesChange(event.target.value)
                  }
                  maxLength={500}
                />
              </label>
            </RecordFormGroup>
          </RecordFormPage>
        </section>
      )}
    </div>
  );
}
