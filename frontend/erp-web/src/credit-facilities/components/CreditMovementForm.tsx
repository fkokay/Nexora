import type { Account, Facility } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../finance-record-forms.css";


type Props = {
  isAdmin: boolean;
  view?: "drawdown" | "repayment";
  onNavigate?: (page: string, label?: string) => void;
  facilities: Facility[];
  accounts: Account[];
  facilityId: string;
  movementFacility?: Facility;
  movementType: "Drawdown" | "Repayment";
  accountId: string;
  movementDate: string;
  principal: string;
  interest: string;
  fee: string;
  scheduleId: string;
  notes: string;
  busy: boolean;
  formatMoney: (amount: number, currency: string) => string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onFacilityChange: (value: string) => void;
  onTypeChange: (value: "Drawdown" | "Repayment") => void;
  onAccountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onPrincipalChange: (value: string) => void;
  onInterestChange: (value: string) => void;
  onFeeChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onScheduleSelected: (scheduleId: string) => void;
};

export function CreditMovementForm(props: Props) {
  if (!props.isAdmin) return null;
  const { movementFacility, busy } = props;
  const movementType = props.view === "repayment" ? "Repayment" : "Drawdown";
  const usableAccounts = props.accounts.filter(
    (account) =>
      account.isActive &&
      account.currencyCode === movementFacility?.currencyCode,
  );
  const availableSchedule =
    movementFacility?.schedule.filter(
      (schedule) => schedule.status === "Planned",
    ) ?? [];

  return (
    <section
      className="panel credit-operation-page fin-rf-host"
      id="credit-movement-form"
    >
      <RecordFormPage
        variant="dialog"
        title={
          movementType === "Drawdown"
            ? "Kredi kullandırımı kaydet"
            : "Kredi geri ödemesi kaydet"
        }
        mode="create"
        busy={busy}
        saveLabel={
          movementType === "Drawdown"
            ? "Kullandırımı kaydet"
            : "Geri ödemeyi kaydet"
        }
        onSubmit={(event) => {
          if (!props.facilityId || !props.accountId) {
            event.preventDefault();
            return;
          }
          props.onSubmit(event as React.FormEvent<HTMLFormElement>);
        }}
        onCancel={() =>
          props.onNavigate?.(
            "finance-credit-facilities",
            "Krediler & Finansman",
          )
        }
        status={
          <span>
            {movementType === "Drawdown"
              ? "Kullandırım limit bakiyesiyle doğrulanır."
              : "Planlı taksit, ödeme kaydıyla birlikte kapatılır."}
          </span>
        }
      >
        <p className="fin-rf-hint">
          İşlem, aynı para birimli kasa/banka hesabına ve finansman nakit
          akışına bağlanır.
        </p>
        <RecordFormGroup title="Hareket Kimliği" bodyClassName="fin-rf-grid-4">
          <label>
            <span>
              Kredi / finansman
              <RequiredMark />
            </span>
            <select
              className="rf-must"
              value={props.facilityId}
              onChange={(event) => props.onFacilityChange(event.target.value)}
              required
            >
              <option value="">Aktif kredi seçin</option>
              {props.facilities
                .filter((facility) => facility.status === "Active")
                .map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.code} · {facility.lenderName} ·{" "}
                    {facility.currencyCode}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Hareket türü
            <input
              value={
                movementType === "Drawdown"
                  ? "Kredi kullandırımı"
                  : "Geri ödeme"
              }
              readOnly
            />
          </label>
          <label>
            <span>
              Kasa / banka hesabı
              <RequiredMark />
            </span>
            <select
              className="rf-must"
              value={props.accountId}
              onChange={(event) => props.onAccountChange(event.target.value)}
              required
            >
              <option value="">
                {movementFacility
                  ? `${movementFacility.currencyCode} hesabı seçin`
                  : "Önce kredi seçin"}
              </option>
              {usableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.name} ·{" "}
                  {props.formatMoney(account.balance, account.currencyCode)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              İşlem tarihi
              <RequiredMark />
            </span>
            <input
              className="rf-must"
              type="date"
              value={props.movementDate}
              onChange={(event) => props.onDateChange(event.target.value)}
              required
            />
          </label>
        </RecordFormGroup>
        <RecordFormGroup title="Tutarlar" bodyClassName="rf-custom-grid">
          {movementType === "Repayment" && (
            <label className="fin-rf-span-all">
              Ödeme planı
              <select
                value={props.scheduleId}
                onChange={(event) =>
                  props.onScheduleSelected(event.target.value)
                }
              >
                <option value="">Plansız / kısmi ödeme</option>
                {availableSchedule.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.dueDate} ·{" "}
                    {props.formatMoney(
                      schedule.principalAmount +
                        schedule.interestAmount +
                        schedule.feeAmount,
                      movementFacility!.currencyCode,
                    )}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>
              Anapara
              <RequiredMark />
            </span>
            <input
              className="rf-must rf-num"
              type="number"
              min="0.01"
              step="0.01"
              value={props.principal}
              onChange={(event) => props.onPrincipalChange(event.target.value)}
              required
            />
          </label>
          {movementType === "Repayment" && (
            <label>
              Faiz
              <input
                className="rf-num"
                type="number"
                min="0"
                step="0.01"
                value={props.interest}
                onChange={(event) => props.onInterestChange(event.target.value)}
              />
            </label>
          )}
          {movementType === "Repayment" && (
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
          )}
          <label className="fin-rf-span-all">
            Açıklama
            <input
              value={props.notes}
              onChange={(event) => props.onNotesChange(event.target.value)}
              maxLength={500}
            />
          </label>
        </RecordFormGroup>
      </RecordFormPage>
    </section>
  );
}
