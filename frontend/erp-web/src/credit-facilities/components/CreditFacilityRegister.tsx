import type { ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import {
  DetailTabs,
  formatAmount,
  formatDate,
} from "../../document-detail/DocumentDetailLayout";
import { CreditFacilitiesFilters } from "./CreditFacilitiesFilters";
import type {
  EffectiveInterestPreview,
  Facility,
  InterestPreview,
  Movement,
  Schedule,
  ScreenField,
} from "../types";

export type CreditTab = "summary" | "schedule" | "movements" | "securities" | "interest";

const typeLabels: Record<string, string> = {
  Loan: "Taksitli",
  Revolving: "Rotatif",
  Leasing: "Leasing",
  Other: "Diğer",
};
export const facilityTypeLabel = (value: string) => typeLabels[value] ?? value;

/** Drawn amount as a share of the approved limit (0 when there is no limit). */
export function drawnShare(facility: Facility) {
  return facility.approvedLimit > 0 ? facility.totalDrawdown / facility.approvedLimit : 0;
}

const percent = (value: number) =>
  `%${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

type Props = {
  facilities: Facility[];
  visibleFacilities: Facility[];
  selected: Facility | null;
  tab: CreditTab;
  securityCount: (facility: Facility) => number;
  loading: boolean;
  admin: boolean;
  search: string;
  statusFilter: string;
  currencyFilter: string;
  currencies: string[];
  visibleScheduleFields: ScreenField[];
  visibleMovementFields: ScreenField[];
  interestPreviews: Record<string, InterestPreview>;
  effectiveInterestPreviews: Record<string, EffectiveInterestPreview>;
  effectiveInterestCosts: Record<string, string>;
  busy: boolean;
  formatMoney: (amount: number, currency: string) => string;
  onSelect: (facility: Facility) => void;
  onTabChange: (tab: CreditTab) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onClearFilters: () => void;
  onRefresh?: () => void;
  onPreviewInterest: (facility: Facility) => void;
  onEffectiveInterestCostChange: (facilityId: string, value: string) => void;
  onPreviewEffectiveInterest: (facility: Facility) => void;
  onPostPreviousMonthInterest: (facility: Facility) => void;
  onPrepareSchedulePayment: (facility: Facility, item: Schedule) => void;
  onSetScheduleStatus: (item: Schedule, status: "Cancelled") => void;
  onReverseMovement: (facility: Facility, movement: Movement) => void;
  /** The "Teminatlar" tab body for the selected credit. */
  renderSecurities: (facility: Facility) => ReactNode;
};

export function CreditFacilityRegister(props: Props) {
  const {
    facilities,
    visibleFacilities,
    selected,
    tab,
    loading,
    admin,
    busy,
    formatMoney: money,
  } = props;
  return (
    <div className="cf-layout">
      <aside className="cf-list-column" aria-label="Krediler">
        <CreditFacilitiesFilters
          search={props.search}
          statusFilter={props.statusFilter}
          currencyFilter={props.currencyFilter}
          currencies={props.currencies}
          counts={{
            all: facilities.length,
            active: facilities.filter((facility) => facility.status === "Active").length,
            closed: facilities.filter((facility) => facility.status !== "Active").length,
          }}
          onSearchChange={props.onSearchChange}
          onStatusChange={props.onStatusChange}
          onCurrencyChange={props.onCurrencyChange}
          onRefresh={props.onRefresh}
        />
        {loading && facilities.length === 0 ? (
          <p className="fh-empty" role="status" aria-live="polite">
            Kayıtlar yükleniyor…
          </p>
        ) : facilities.length === 0 ? (
          <div className="cf-empty">
            <strong>Henüz kredi veya finansman kaydı yok.</strong>
            <span>
              {admin
                ? "İlk kaydı “Yeni kredi / limit” ile oluşturabilirsiniz."
                : "Kayıtlar oluşturulduğunda burada görüntülenir."}
            </span>
          </div>
        ) : visibleFacilities.length === 0 ? (
          <div className="cf-empty">
            <strong>Filtrelerle eşleşen kayıt bulunamadı.</strong>
            <button type="button" className="secondary small-button" onClick={props.onClearFilters}>
              Filtreleri temizle
            </button>
          </div>
        ) : (
          <ul className="cf-items">
            {visibleFacilities.map((f) => {
              const share = drawnShare(f);
              const meta: ReactNode[] = [<span key="lender">{f.lenderName}</span>];
              if (f.annualInterestRatePercent !== null)
                meta.push(
                  <span key="rate">{`%${f.annualInterestRatePercent.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}`}</span>,
                );
              if (f.maturityDate)
                meta.push(
                  <span key="maturity">
                    <span>vade</span> {formatDate(f.maturityDate)}
                  </span>,
                );
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className={`cf-item${selected?.id === f.id ? " is-selected" : ""}${f.status !== "Active" ? " is-closed" : ""}`}
                    aria-pressed={selected?.id === f.id}
                    onClick={() => props.onSelect(f)}
                  >
                    <span className="cf-item-top">
                      <b>{f.code}</b>
                      <span className="cf-type">{facilityTypeLabel(f.facilityType)}</span>
                      {f.status !== "Active" && <span className="cf-state is-closed">Kapalı</span>}
                    </span>
                    <span className="cf-item-meta">
                      {meta.map((part, index) => (
                        <span key={index}>
                          {index > 0 && " · "}
                          {part}
                        </span>
                      ))}
                    </span>
                    <span className="cf-item-usage">
                      <span>
                        {formatAmount(f.totalDrawdown)} / {formatAmount(f.approvedLimit, f.currencyCode)}
                      </span>
                      <b>{percent(share)}</b>
                    </span>
                    <span className="cf-bar" aria-hidden="true">
                      <i style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      {selected ? (
        <section className="cf-detail" aria-labelledby={`credit-${selected.id}`}>
          <CreditDetail {...props} facility={selected} money={money} busy={busy} tab={tab} />
        </section>
      ) : (
        <section className="cf-detail">
          <p className="fh-empty">Ayrıntıları görmek için soldan bir kredi seçin.</p>
        </section>
      )}
    </div>
  );
}

function CreditDetail({
  facility: f,
  money,
  busy,
  tab,
  admin,
  securityCount,
  visibleScheduleFields,
  visibleMovementFields,
  interestPreviews,
  effectiveInterestPreviews,
  effectiveInterestCosts,
  onTabChange,
  onPreviewInterest,
  onEffectiveInterestCostChange,
  onPreviewEffectiveInterest,
  onPostPreviousMonthInterest,
  onPrepareSchedulePayment,
  onSetScheduleStatus,
  onReverseMovement,
  renderSecurities,
}: Props & { facility: Facility; money: Props["formatMoney"] }) {
  const active = f.status === "Active";
  const interest = interestPreviews[f.id];
  const effective = effectiveInterestPreviews[f.id];
  return (
    <>
      <header className="cf-detail-head">
        <div className="cf-detail-title">
          <h2 id={`credit-${f.id}`}>{f.code}</h2>
          <span className={`cf-state${active ? " is-active" : " is-closed"}`}>
            {active ? "Aktif" : "Kapalı"}
          </span>
          <span className="cf-type">{facilityTypeLabel(f.facilityType)}</span>
        </div>
        <p className="cf-detail-sub">
          {f.lenderName} · {f.currencyCode}
        </p>
      </header>
      <DetailTabs<CreditTab>
        label="Kredi ayrıntıları"
        value={tab}
        onChange={onTabChange}
        tabs={[
          { key: "summary", label: "Özet" },
          { key: "schedule", label: "Ödeme planı", count: f.schedule.length },
          { key: "movements", label: "Hareketler", count: f.movements.length },
          { key: "securities", label: "Teminatlar", count: securityCount(f) },
          { key: "interest", label: "Faiz" },
        ]}
      />
      <div className="cf-tabbody" role="tabpanel">
        {tab === "summary" && (
          <>
            <dl className="cf-info">
              <div>
                <dt>Onaylı limit</dt>
                <dd>{money(f.approvedLimit, f.currencyCode)}</dd>
              </div>
              <div>
                <dt>Toplam kullandırım</dt>
                <dd>{money(f.totalDrawdown, f.currencyCode)}</dd>
              </div>
              <div>
                <dt>Geri ödenen anapara</dt>
                <dd>{money(f.principalRepaid, f.currencyCode)}</dd>
              </div>
              <div className="is-emphasis">
                <dt>Açık anapara</dt>
                <dd>{money(f.outstandingPrincipal, f.currencyCode)}</dd>
              </div>
              <div>
                <dt>Yıllık faiz</dt>
                <dd>
                  {f.annualInterestRatePercent === null
                    ? "—"
                    : `%${f.annualInterestRatePercent.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}`}
                </dd>
              </div>
              <div>
                <dt>Vade</dt>
                <dd>{f.maturityDate ? formatDate(f.maturityDate) : "Belirtilmedi"}</dd>
              </div>
              <div>
                <dt>Banka</dt>
                <dd>{f.lenderName}</dd>
              </div>
              <div>
                <dt>Başlangıç</dt>
                <dd>{formatDate(f.startDate)}</dd>
              </div>
              <div>
                <dt>Açık taksit</dt>
                <dd>
                  {`${f.openScheduleCount} taksit`} · {money(f.openScheduleTotal, f.currencyCode)}
                </dd>
              </div>
            </dl>
            {f.notes && <p className="fh-note credit-notes">{f.notes}</p>}
          </>
        )}
        {tab === "schedule" && (
          <div
            className="credit-table-wrap"
            role="region"
            aria-label={`${f.code} ödeme planı`}
            tabIndex={0}
          >
            <AdvancedDataGrid
              hideSearch
              className="customer-table credit-table"
              gridId="finance-credit-schedules"
              {...screenViewGridDefaults(visibleScheduleFields)}
            >
              <caption>
                Ödeme planı · {f.openScheduleCount} açık taksit · planlanan toplam{" "}
                {money(f.openScheduleTotal, f.currencyCode)}
              </caption>
              <thead>
                <ScreenViewGroupHeader fields={visibleScheduleFields} />
                <tr>
                  {visibleScheduleFields.map((field) => (
                    <th key={field.key} scope="col">
                      {field.key === "actions" ? (
                        <span className="sr-only">{field.label}</span>
                      ) : (
                        field.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.schedule.map((item) => (
                  <tr key={item.id}>
                    {visibleScheduleFields.map((field) => (
                      <td key={field.key} data-label={field.label}>
                        {field.key === "dueDate" ? (
                          item.dueDate
                        ) : field.key === "principalAmount" ? (
                          money(item.principalAmount, f.currencyCode)
                        ) : field.key === "interestAmount" ? (
                          money(item.interestAmount, f.currencyCode)
                        ) : field.key === "feeAmount" ? (
                          money(item.feeAmount, f.currencyCode)
                        ) : field.key === "total" ? (
                          <b>
                            {money(
                              item.principalAmount + item.interestAmount + item.feeAmount,
                              f.currencyCode,
                            )}
                          </b>
                        ) : field.key === "status" ? (
                          item.status === "Paid" ? (
                            `Ödendi · ${item.paidDate}`
                          ) : item.status === "Cancelled" ? (
                            "İptal"
                          ) : (
                            "Planlandı"
                          )
                        ) : field.key === "actions" && admin && item.status === "Planned" ? (
                          <div className="credit-row-actions">
                            {active && (
                              <button
                                className="row-action"
                                aria-label={`${f.code} ${item.dueDate} taksidini öde`}
                                disabled={busy}
                                onClick={() => onPrepareSchedulePayment(f, item)}
                              >
                                Öde
                              </button>
                            )}
                            <button
                              className="row-action"
                              aria-label={`${f.code} ${item.dueDate} taksidini iptal et`}
                              disabled={busy}
                              onClick={() => onSetScheduleStatus(item, "Cancelled")}
                            >
                              İptal
                            </button>
                          </div>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
                {f.schedule.length === 0 && (
                  <tr>
                    <td colSpan={Math.max(1, visibleScheduleFields.length)} className="table-empty">
                      Ödeme planı yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </AdvancedDataGrid>
          </div>
        )}
        {tab === "movements" &&
          (f.movements.length === 0 ? (
            <p className="fh-empty">Henüz kullandırım veya geri ödeme hareketi yok.</p>
          ) : (
            <div className="credit-movements">
              <div
                className="credit-table-wrap"
                role="region"
                aria-label={`${f.code} gerçekleşen hareketler`}
                tabIndex={0}
              >
                <AdvancedDataGrid
                  hideSearch
                  className="customer-table credit-table credit-movement-table"
                  gridId="finance-credit-movements"
                  {...screenViewGridDefaults(visibleMovementFields)}
                >
                  <caption>Gerçekleşen kullandırım, geri ödeme ve ters kayıtlar</caption>
                  <thead>
                    <ScreenViewGroupHeader fields={visibleMovementFields} />
                    <tr>
                      {visibleMovementFields.map((field) => (
                        <th key={field.key} scope="col">
                          {field.key === "actions" ? (
                            <span className="sr-only">{field.label}</span>
                          ) : (
                            field.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {f.movements.map((m) => (
                      <tr key={m.id}>
                        {visibleMovementFields.map((field) => (
                          <td key={field.key} data-label={field.label}>
                            {field.key === "transactionDate" ? (
                              m.transactionDate
                            ) : field.key === "type" ? (
                              <>
                                {m.type === "Drawdown"
                                  ? "Kullandırım"
                                  : m.type === "Repayment"
                                    ? "Geri ödeme"
                                    : `Ters kayıt · ${m.reversesMovementId?.slice(0, 8)}`}
                                {m.isReversed && <small> · Ters çevrildi</small>}
                              </>
                            ) : field.key === "accountCode" ? (
                              m.accountCode
                            ) : field.key === "principalAmount" ? (
                              money(m.principalAmount, f.currencyCode)
                            ) : field.key === "interestAmount" ? (
                              money(m.interestAmount, f.currencyCode)
                            ) : field.key === "feeAmount" ? (
                              money(m.feeAmount, f.currencyCode)
                            ) : field.key === "actions" &&
                              admin &&
                              m.type !== "Reversal" &&
                              !m.isReversed &&
                              active ? (
                              <button
                                type="button"
                                className="row-action"
                                disabled={busy}
                                onClick={() => onReverseMovement(f, m)}
                              >
                                Ters kayıt
                              </button>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </AdvancedDataGrid>
              </div>
              <p className="fh-note">
                Ters kayıt özgün satırı silmez; aynı banka/kasa hesabında karşı
                hareket ve kredi defterinde bağlantılı bir ters satır oluşturur.
              </p>
            </div>
          ))}
        {tab === "securities" && renderSecurities(f)}
        {tab === "interest" && (
          <div className="cf-interest">
            <section className="cf-subsection" aria-label={`${f.code} aylık faiz tahakkuku`}>
              <div className="cf-pane-head">
                <div>
                  <h3>Aylık faiz tahakkuku</h3>
                  <p>
                    Actual/365, kayıtlı hareketlerin günlük kapanış bakiyesi
                    üzerinden hesaplanır.
                  </p>
                </div>
                <div className="cf-pane-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || f.annualInterestRatePercent === null}
                    onClick={() => onPreviewInterest(f)}
                  >
                    Bu ay faiz önizle
                  </button>
                  {admin && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || f.annualInterestRatePercent === null}
                      onClick={() => onPostPreviousMonthInterest(f)}
                    >
                      Önceki ayı muhasebeleştir
                    </button>
                  )}
                </div>
              </div>
              {f.annualInterestRatePercent === null && (
                <p className="fh-note">Yıllık faiz oranı tanımlı olmadığı için tahakkuk hesaplanamaz.</p>
              )}
              {interest && (
                <div className="credit-movements" role="status">
                  <h4>
                    Faiz tahakkuk önizlemesi · {interest.from} – {interest.to}
                  </h4>
                  <p>
                    {interest.dayCountConvention} · kayıtlı hareketlerin günlük
                    kapanış bakiyesi · henüz muhasebeleştirilmedi
                  </p>
                  <ul>
                    {interest.months.map((item) => (
                      <li key={item.month}>
                        {item.month}: {money(item.accruedInterest, interest.currencyCode)}
                      </li>
                    ))}
                  </ul>
                  <strong>
                    Toplam: {money(interest.totalAccruedInterest, interest.currencyCode)}
                  </strong>
                </div>
              )}
            </section>
            <section
              className="cf-subsection credit-effective-interest"
              aria-label={`${f.code} TFRS 9 etkin faiz önizlemesi`}
            >
              <div className="cf-pane-head">
                <div>
                  <h3>TFRS 9 etkin faiz yöntemi</h3>
                  <p>
                    İşlem maliyetini ilk kullandırımdan düşerek yıllık etkin oranı
                    ve itfa planını hesaplar. Muhasebe fişi oluşturmaz.
                  </p>
                </div>
                <div className="cf-pane-actions">
                  <label className="cf-inline-field">
                    İlk işlem maliyeti ({f.currencyCode})
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={effectiveInterestCosts[f.id] ?? "0"}
                      onChange={(event) => onEffectiveInterestCostChange(f.id, event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || f.movements.every((m) => m.type !== "Drawdown")}
                    onClick={() => onPreviewEffectiveInterest(f)}
                  >
                    Etkin faiz planını hesapla
                  </button>
                </div>
              </div>
              {effective && (
                <>
                  <p className="fh-note">
                    Yıllık etkin faiz oranı:{" "}
                    <strong>
                      {effective.effectiveAnnualRatePercent.toLocaleString("tr-TR", {
                        maximumFractionDigits: 6,
                      })}
                      %
                    </strong>{" "}
                    · {effective.dayCountConvention}
                  </p>
                  <div
                    className="credit-table-wrap"
                    role="region"
                    aria-label={`${f.code} etkin faiz itfa planı`}
                    tabIndex={0}
                  >
                    <table className="customer-table credit-table">
                      <thead>
                        <tr>
                          <th scope="col">Tarih</th>
                          <th scope="col">Açılış itfa edilmiş maliyet</th>
                          <th scope="col">Etkin faiz gideri</th>
                          <th scope="col">Nakit ödeme</th>
                          <th scope="col">Kapanış itfa edilmiş maliyet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effective.rows.map((row, index) => (
                          <tr key={`${row.date}-${index}`}>
                            <td>{row.date}</td>
                            <td>{money(row.openingAmortizedCost, f.currencyCode)}</td>
                            <td>{money(row.effectiveInterestExpense, f.currencyCode)}</td>
                            <td>{money(row.cashPayment, f.currencyCode)}</td>
                            <td>{money(row.closingAmortizedCost, f.currencyCode)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="fh-note">{effective.note}</p>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
