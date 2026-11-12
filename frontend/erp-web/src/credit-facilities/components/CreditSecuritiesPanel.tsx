import type { Facility, Security } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../finance-record-forms.css";

type Props = {
  isAdmin: boolean;
  showCreateForm?: boolean;
  onNavigate?: (page: string, label?: string) => void;
  facilities: Facility[];
  securities: Security[];
  expiringCount: number;
  expiredCount: number;
  busy: boolean;
  facilityId: string;
  type: "Guarantee" | "Collateral";
  code: string;
  issuer: string;
  beneficiary: string;
  amount: string;
  commission: string;
  issueDate: string;
  expiryDate: string;
  notes: string;
  formatMoney: (amount: number, currency: string) => string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: (security: Security, status: "Released" | "Called") => void;
  onFacilityChange: (value: string) => void;
  onTypeChange: (value: "Guarantee" | "Collateral") => void;
  onCodeChange: (value: string) => void;
  onIssuerChange: (value: string) => void;
  onBeneficiaryChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onCommissionChange: (value: string) => void;
  onIssueDateChange: (value: string) => void;
  onExpiryDateChange: (value: string) => void;
  onNotesChange: (value: string) => void;
};

export function CreditSecuritiesPanel(props: Props) {
  const currency =
    props.facilities.find((facility) => facility.id === props.facilityId)
      ?.currencyCode || "Krediyle aynı";
  return (
    <section
      className={`panel credit-records-panel${props.showCreateForm ? " credit-operation-page" : ""}`}
      aria-labelledby="credit-securities-title"
    >
      <div className="credit-records-heading">
        <div>
          <h2 id="credit-securities-title">Teminat ve garantiler</h2>
          <p>
            Kredi limitine bağlı teminatları izleyin; kayıtlar nakit akışına
            veya muhasebeye otomatik tutar eklemez.
          </p>
        </div>
        <div className="credit-row-actions">
          <span
            className={
              props.expiredCount ? "status-badge danger" : "status-badge"
            }
          >
            {props.expiredCount} vadesi geçmiş
          </span>
          <span
            className={
              props.expiringCount ? "status-badge warning" : "status-badge"
            }
          >
            {props.expiringCount} 30 gün içinde
          </span>
          {props.isAdmin && !props.showCreateForm && (
            <button
              type="button"
              className="primary small-button"
              onClick={() =>
                props.onNavigate?.(
                  "finance-credit-security-create",
                  "Teminat kaydı",
                )
              }
            >
              Teminat ekle
            </button>
          )}
        </div>
      </div>
      {props.isAdmin && props.showCreateForm && (
        <RecordFormPage
          variant="dialog"
          title="Teminat kaydı"
          mode="create"
          busy={props.busy}
          saveLabel="Teminatı kaydet"
          onSubmit={(event) => {
            if (!props.facilityId) {
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
          status={<span>Vade uyarısı 30 gün kala gösterilir.</span>}
        >
          <RecordFormGroup title="Teminat Kimliği" bodyClassName="rf-identity">
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
                placeholder="TMN-001"
              />
            </label>
            <label>
              <span>
                Bağlı kredi
                <RequiredMark />
              </span>
              <select
                className="rf-must"
                value={props.facilityId}
                onChange={(event) => props.onFacilityChange(event.target.value)}
                required
              >
                <option value="">Kredi seçin</option>
                {props.facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.code} · {facility.lenderName} ·{" "}
                    {facility.currencyCode}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kayıt türü
              <select
                value={props.type}
                onChange={(event) =>
                  props.onTypeChange(
                    event.target.value as "Guarantee" | "Collateral",
                  )
                }
              >
                <option value="Guarantee">Banka teminatı</option>
                <option value="Collateral">Rehin / ipotek</option>
              </select>
            </label>
          </RecordFormGroup>
          <div className="rf-columns">
            <RecordFormGroup title="Taraflar">
              <label>
                <span>
                  Veren kurum / taraf
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  value={props.issuer}
                  onChange={(event) => props.onIssuerChange(event.target.value)}
                  maxLength={160}
                  required
                />
              </label>
              <label>
                <span>
                  Lehtar
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  value={props.beneficiary}
                  onChange={(event) =>
                    props.onBeneficiaryChange(event.target.value)
                  }
                  maxLength={160}
                  required
                />
              </label>
            </RecordFormGroup>
            <RecordFormGroup title="Tutar ve Vade">
              <div className="rf-pair">
                <label>
                  <span>
                    Tutar
                    <RequiredMark />
                  </span>
                  <input
                    className="rf-must rf-num"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={props.amount}
                    onChange={(event) =>
                      props.onAmountChange(event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Komisyon tutarı
                  <input
                    className="rf-num"
                    type="number"
                    min="0"
                    step="0.01"
                    value={props.commission}
                    onChange={(event) =>
                      props.onCommissionChange(event.target.value)
                    }
                  />
                </label>
              </div>
              <label>
                Komisyon/vade para birimi
                <input value={currency} readOnly />
              </label>
              <div className="rf-pair">
                <label>
                  <span>
                    Düzenleme tarihi
                    <RequiredMark />
                  </span>
                  <input
                    className="rf-must"
                    type="date"
                    value={props.issueDate}
                    onChange={(event) =>
                      props.onIssueDateChange(event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  <span>
                    Vade tarihi
                    <RequiredMark />
                  </span>
                  <input
                    className="rf-must"
                    type="date"
                    min={props.issueDate}
                    value={props.expiryDate}
                    onChange={(event) =>
                      props.onExpiryDateChange(event.target.value)
                    }
                    required
                  />
                </label>
              </div>
            </RecordFormGroup>
            <div className="rf-columns-wide">
              <RecordFormGroup title="Not">
                <label>
                  Not
                  <input
                    value={props.notes}
                    onChange={(event) => props.onNotesChange(event.target.value)}
                    maxLength={500}
                  />
                </label>
              </RecordFormGroup>
            </div>
          </div>
        </RecordFormPage>
      )}
      {!props.showCreateForm &&
        (props.securities.length === 0 ? (
          <div className="credit-state credit-empty">
            <strong>Henüz teminat veya garanti kaydı yok.</strong>
            <span>
              {props.isAdmin
                ? "Bir kredi seçerek kayıt ekleyebilirsiniz."
                : "Kayıt eklendiğinde burada görünür."}
            </span>
          </div>
        ) : (
          <div
            className="credit-table-wrap"
            role="region"
            aria-label="Teminat ve garanti listesi"
            tabIndex={0}
          >
            <table className="customer-table credit-table">
              <caption>
                {props.securities.length} teminat/garanti kaydı · yaklaşan vade
                uyarıları
              </caption>
              <thead>
                <tr>
                  <th>Kod / tür</th>
                  <th>Bağlı kredi</th>
                  <th>Veren → lehtar</th>
                  <th>Tutar</th>
                  <th>Komisyon</th>
                  <th>Düzenleme</th>
                  <th>Vade</th>
                  <th>Durum</th>
                  {props.isAdmin && <th>İşlem</th>}
                </tr>
              </thead>
              <tbody>
                {props.securities.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.code}
                      <small>
                        {item.type === "Guarantee"
                          ? "Teminat mektubu"
                          : "Rehin / ipotek"}
                      </small>
                    </td>
                    <td>{item.facilityCode}</td>
                    <td>
                      {item.issuer} → {item.beneficiary}
                    </td>
                    <td>{props.formatMoney(item.amount, item.currencyCode)}</td>
                    <td>
                      {props.formatMoney(
                        item.commissionAmount,
                        item.currencyCode,
                      )}
                    </td>
                    <td>{item.issueDate}</td>
                    <td>{item.expiryDate}</td>
                    <td>
                      <span
                        className={`status-badge ${item.alert === "Expired" ? "danger" : item.alert === "Expiring" ? "warning" : ""}`}
                      >
                        {item.status === "Released"
                          ? "Serbest"
                          : item.status === "Called"
                            ? "Çağrıldı"
                            : item.alert === "Expired"
                              ? "Vadesi geçti"
                              : item.alert === "Expiring"
                                ? "Yaklaşıyor"
                                : "Etkin"}
                      </span>
                    </td>
                    {props.isAdmin && (
                      <td>
                        {item.status === "Active" && (
                          <div className="credit-row-actions">
                            <button
                              type="button"
                              className="row-action"
                              disabled={props.busy}
                              onClick={() => props.onClose(item, "Released")}
                            >
                              Serbest bırak
                            </button>
                            <button
                              type="button"
                              className="row-action danger-action"
                              disabled={props.busy}
                              onClick={() => props.onClose(item, "Called")}
                            >
                              Çağır
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
