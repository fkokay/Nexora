import type { ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import {
  DetailInfoGrid,
  DetailTabs,
  DetailTiles,
  formatDate,
} from "../../document-detail/DocumentDetailLayout";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import type { PageCommands } from "../../commands/types";
import { StatusTag } from "../../list-page/StatusTag";
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

const percent = (value: number) => `%${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
const rate = (value: number) => `%${value.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}`;
const MONEY_KEYS = new Set(["principalAmount", "interestAmount", "feeAmount", "total"]);

type Props = {
  facility: Facility;
  tab: CreditTab;
  admin: boolean;
  busy: boolean;
  securityCount: number;
  visibleScheduleFields: ScreenField[];
  visibleMovementFields: ScreenField[];
  interest?: InterestPreview;
  effective?: EffectiveInterestPreview;
  effectiveCost: string;
  formatMoney: (amount: number, currency: string) => string;
  /** The opened credit's İşlem Çubuğu (Yeni, Yenile, İşlemler). */
  commands: PageCommands;
  onClose: () => void;
  onTabChange: (tab: CreditTab) => void;
  onEffectiveCostChange: (value: string) => void;
  onPreviewEffectiveInterest: () => void;
  onPrepareSchedulePayment: (item: Schedule) => void;
  onSetScheduleStatus: (item: Schedule, status: "Cancelled") => void;
  onReverseMovement: (movement: Movement) => void;
  /** The "Teminatlar" tab body. */
  securities: ReactNode;
  /** Page error / notice, shown under the surface header. */
  messages?: ReactNode;
};

/**
 * The opened credit on the record / document surface (mockup 09 map: Kayıt v3): limit, drawdown, open principal and
 * open instalment tiles, then the tabs (Özet, Ödeme planı, Hareketler, Teminatlar, Faiz). The credit-wide operations are
 * in İşlemler; instalment, movement and security buttons stay on their rows with today's conditions.
 */
export function CreditFacilityDetail({
  facility: f,
  tab,
  admin,
  busy,
  securityCount,
  visibleScheduleFields,
  visibleMovementFields,
  interest,
  effective,
  effectiveCost,
  formatMoney: money,
  commands,
  onClose,
  onTabChange,
  onEffectiveCostChange,
  onPreviewEffectiveInterest,
  onPrepareSchedulePayment,
  onSetScheduleStatus,
  onReverseMovement,
  securities,
  messages,
}: Props) {
  const active = f.status === "Active";
  const share = drawnShare(f);
  const scheduleCell = (item: Schedule, key: string): ReactNode => {
    switch (key) {
      case "dueDate":
        return item.dueDate;
      case "principalAmount":
        return money(item.principalAmount, f.currencyCode);
      case "interestAmount":
        return money(item.interestAmount, f.currencyCode);
      case "feeAmount":
        return money(item.feeAmount, f.currencyCode);
      case "total":
        return money(item.principalAmount + item.interestAmount + item.feeAmount, f.currencyCode);
      case "status":
        return item.status === "Paid" ? (
          <StatusTag tone="ok">{`Ödendi · ${item.paidDate}`}</StatusTag>
        ) : item.status === "Cancelled" ? (
          <StatusTag tone="off">İptal</StatusTag>
        ) : (
          <StatusTag tone="info">Planlandı</StatusTag>
        );
      case "actions":
        return admin && item.status === "Planned" ? (
          <div className="credit-row-actions">
            {active && (
              <button
                type="button"
                className="row-action"
                aria-label={`${f.code} ${item.dueDate} taksidini öde`}
                disabled={busy}
                onClick={() => onPrepareSchedulePayment(item)}
              >
                Öde
              </button>
            )}
            <button
              type="button"
              className="row-action"
              aria-label={`${f.code} ${item.dueDate} taksidini iptal et`}
              disabled={busy}
              onClick={() => onSetScheduleStatus(item, "Cancelled")}
            >
              İptal
            </button>
          </div>
        ) : null;
      default:
        return null;
    }
  };
  const movementCell = (m: Movement, key: string): ReactNode => {
    switch (key) {
      case "transactionDate":
        return m.transactionDate;
      case "type":
        return (
          <>
            {m.type === "Drawdown"
              ? "Kullandırım"
              : m.type === "Repayment"
                ? "Geri ödeme"
                : `Ters kayıt · ${m.reversesMovementId?.slice(0, 8)}`}
            {m.isReversed && (
              <>
                {" "}
                <StatusTag tone="off">Ters çevrildi</StatusTag>
              </>
            )}
          </>
        );
      case "accountCode":
        return m.accountCode;
      case "principalAmount":
        return money(m.principalAmount, f.currencyCode);
      case "interestAmount":
        return money(m.interestAmount, f.currencyCode);
      case "feeAmount":
        return money(m.feeAmount, f.currencyCode);
      case "actions":
        return admin && m.type !== "Reversal" && !m.isReversed && active ? (
          <button type="button" className="row-action" disabled={busy} onClick={() => onReverseMovement(m)}>
            Ters kayıt
          </button>
        ) : null;
      default:
        return null;
    }
  };
  const header = (fields: ScreenField[]) => (
    <thead>
      <ScreenViewGroupHeader fields={fields} />
      <tr>
        {fields.map((field) => (
          <th key={field.key} scope="col" className={MONEY_KEYS.has(field.key) ? "nx-num dd-num" : undefined}>
            {field.key === "actions" ? <span className="sr-only">{field.label}</span> : field.label}
          </th>
        ))}
      </tr>
    </thead>
  );
  return (
    <>
      <PageCommandsSlot commands={commands} />
      <DocumentSurface
        variant="detail"
        className="cf-surface"
        title="Kredi"
        code={f.code}
        subtitle={f.lenderName}
        status={active ? { label: "Aktif", tone: "success" } : { label: "Kapalı", tone: "neutral" }}
        meta={
          <span>
            {facilityTypeLabel(f.facilityType)} · {f.currencyCode}
            {f.annualInterestRatePercent !== null && <> · {rate(f.annualInterestRatePercent)}</>}
            {f.maturityDate && (
              <>
                {" "}
                · <span>vade</span> {formatDate(f.maturityDate)}
              </>
            )}
          </span>
        }
        onClose={onClose}
        hints={["Alt+İ işlemler"]}
        footerStatus={
          <span>
            <span>Açık anapara</span> <b>{money(f.outstandingPrincipal, f.currencyCode)}</b>
          </span>
        }
      >
        <div className="cf-surface-body">
          {messages}
          <DetailTiles
            label="Kredi özeti"
            items={[
              { label: "Onaylı limit", value: money(f.approvedLimit, f.currencyCode) },
              {
                label: "Toplam kullandırım",
                value: money(f.totalDrawdown, f.currencyCode),
                progress: Math.min(1, Math.max(0, share)),
                progressLabel: "Limit kullanımı",
                hint: <span>{`Limitin ${percent(share)} kullanıldı`}</span>,
              },
              { label: "Açık anapara", value: money(f.outstandingPrincipal, f.currencyCode) },
              {
                label: "Açık taksit",
                value: money(f.openScheduleTotal, f.currencyCode),
                hint: <span>{`${f.openScheduleCount} taksit`}</span>,
              },
            ]}
          />
          <DetailTabs<CreditTab>
            label="Kredi ayrıntıları"
            value={tab}
            onChange={onTabChange}
            tabs={[
              { key: "summary", label: "Özet" },
              { key: "schedule", label: "Ödeme planı", count: f.schedule.length },
              { key: "movements", label: "Hareketler", count: f.movements.length },
              { key: "securities", label: "Teminatlar", count: securityCount },
              { key: "interest", label: "Faiz" },
            ]}
          />
          <div className="cf-tabbody" role="tabpanel">
            {tab === "summary" && (
              <section className="dd-box cf-box" aria-label="Kredi bilgileri">
                <DetailInfoGrid
                  label="Kredi bilgileri"
                  items={[
                    { label: "Banka", value: f.lenderName },
                    { label: "Tür", value: facilityTypeLabel(f.facilityType) },
                    { label: "Para birimi", value: f.currencyCode },
                    { label: "Başlangıç", value: formatDate(f.startDate) },
                    { label: "Vade", value: f.maturityDate ? formatDate(f.maturityDate) : "Belirtilmedi" },
                    { label: "Yıllık faiz", value: f.annualInterestRatePercent === null ? "—" : rate(f.annualInterestRatePercent) },
                    { label: "Geri ödenen anapara", value: money(f.principalRepaid, f.currencyCode) },
                    { label: "Açık taksit", value: <>{`${f.openScheduleCount} taksit`} · {money(f.openScheduleTotal, f.currencyCode)}</> },
                  ]}
                />
                {f.notes && <p className="fh-note credit-notes">{f.notes}</p>}
              </section>
            )}
            {tab === "schedule" && (
              <section className="dd-box cf-box" aria-label={`${f.code} ödeme planı`}>
                <header className="cf-box-head">
                  <h3>Ödeme planı</h3>
                  <span>
                    {`${f.openScheduleCount} açık taksit`} · <span>planlanan toplam</span> {money(f.openScheduleTotal, f.currencyCode)}
                  </span>
                </header>
                <div className="dd-grid credit-table-wrap" role="region" aria-label={`${f.code} ödeme planı tablosu`} tabIndex={0}>
                  <AdvancedDataGrid
                    hideSearch
                    enableRowSelection={false}
                    className="customer-table credit-table"
                    gridId="finance-credit-schedules"
                    {...screenViewGridDefaults(visibleScheduleFields)}
                  >
                    {header(visibleScheduleFields)}
                    <tbody>
                      {f.schedule.map((item) => (
                        <tr key={item.id}>
                          {visibleScheduleFields.map((field) => (
                            <td key={field.key} data-label={field.label} className={MONEY_KEYS.has(field.key) ? "nx-num dd-num" : undefined}>
                              {scheduleCell(item, field.key)}
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
              </section>
            )}
            {tab === "movements" && (
              <section className="dd-box cf-box" aria-label={`${f.code} gerçekleşen hareketler`}>
                <header className="cf-box-head">
                  <h3>Gerçekleşen kullandırım, geri ödeme ve ters kayıtlar</h3>
                </header>
                {f.movements.length === 0 ? (
                  <p className="fh-empty">Henüz kullandırım veya geri ödeme hareketi yok.</p>
                ) : (
                  <div className="dd-grid credit-table-wrap" role="region" aria-label={`${f.code} hareket tablosu`} tabIndex={0}>
                    <AdvancedDataGrid
                      hideSearch
                      enableRowSelection={false}
                      className="customer-table credit-table credit-movement-table"
                      gridId="finance-credit-movements"
                      {...screenViewGridDefaults(visibleMovementFields)}
                    >
                      {header(visibleMovementFields)}
                      <tbody>
                        {f.movements.map((m) => (
                          <tr key={m.id}>
                            {visibleMovementFields.map((field) => (
                              <td key={field.key} data-label={field.label} className={MONEY_KEYS.has(field.key) ? "nx-num dd-num" : undefined}>
                                {movementCell(m, field.key)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </AdvancedDataGrid>
                  </div>
                )}
                <p className="fh-note">
                  Ters kayıt özgün satırı silmez; aynı banka/kasa hesabında karşı hareket ve kredi defterinde bağlantılı bir
                  ters satır oluşturur.
                </p>
              </section>
            )}
            {tab === "securities" && securities}
            {tab === "interest" && (
              <>
                <section className="dd-box cf-box" aria-label={`${f.code} aylık faiz tahakkuku`}>
                  <header className="cf-box-head">
                    <h3>Aylık faiz tahakkuku</h3>
                    <span>Actual/365, kayıtlı hareketlerin günlük kapanış bakiyesi üzerinden hesaplanır.</span>
                  </header>
                  {f.annualInterestRatePercent === null ? (
                    <p className="fh-note">Yıllık faiz oranı tanımlı olmadığı için tahakkuk hesaplanamaz.</p>
                  ) : (
                    !interest && <p className="fh-note">İşlemler › Bu ay faiz önizle · Önceki ayı muhasebeleştir</p>
                  )}
                  {interest && (
                    <div role="status">
                      <p className="fh-note">
                        <span>Faiz tahakkuk önizlemesi</span> · {interest.from} – {interest.to} · {interest.dayCountConvention} ·{" "}
                        <span>henüz muhasebeleştirilmedi</span>
                      </p>
                      <table className="dd-lines cf-interest-table">
                        <thead>
                          <tr>
                            <th scope="col">Ay</th>
                            <th scope="col" className="dd-num">
                              Tahakkuk
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {interest.months.map((item) => (
                            <tr key={item.month}>
                              <td>{item.month}</td>
                              <td className="dd-num">{money(item.accruedInterest, interest.currencyCode)}</td>
                            </tr>
                          ))}
                          <tr className="cf-total-row">
                            <td>Toplam</td>
                            <td className="dd-num">{money(interest.totalAccruedInterest, interest.currencyCode)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                <section className="dd-box cf-box credit-effective-interest" aria-label={`${f.code} TFRS 9 etkin faiz önizlemesi`}>
                  <header className="cf-box-head">
                    <h3>TFRS 9 etkin faiz yöntemi</h3>
                    <span>
                      İşlem maliyetini ilk kullandırımdan düşerek yıllık etkin oranı ve itfa planını hesaplar. Muhasebe fişi
                      oluşturmaz.
                    </span>
                  </header>
                  <div className="cf-effective-form">
                    <label className="cf-inline-field">
                      İlk işlem maliyeti ({f.currencyCode})
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="rf-num"
                        value={effectiveCost}
                        onChange={(event) => onEffectiveCostChange(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || f.movements.every((m) => m.type !== "Drawdown")}
                      onClick={onPreviewEffectiveInterest}
                    >
                      Etkin faiz planını hesapla
                    </button>
                  </div>
                  {effective && (
                    <>
                      <p className="fh-note">
                        <span>Yıllık etkin faiz oranı:</span>{" "}
                        <strong>
                          {effective.effectiveAnnualRatePercent.toLocaleString("tr-TR", { maximumFractionDigits: 6 })}%
                        </strong>{" "}
                        · {effective.dayCountConvention}
                      </p>
                      <div className="dd-lines-wrap" role="region" aria-label={`${f.code} etkin faiz itfa planı`} tabIndex={0}>
                        <table className="dd-lines">
                          <thead>
                            <tr>
                              <th scope="col">Tarih</th>
                              <th scope="col" className="dd-num">Açılış itfa edilmiş maliyet</th>
                              <th scope="col" className="dd-num">Etkin faiz gideri</th>
                              <th scope="col" className="dd-num">Nakit ödeme</th>
                              <th scope="col" className="dd-num">Kapanış itfa edilmiş maliyet</th>
                            </tr>
                          </thead>
                          <tbody>
                            {effective.rows.map((row, index) => (
                              <tr key={`${row.date}-${index}`}>
                                <td>{row.date}</td>
                                <td className="dd-num">{money(row.openingAmortizedCost, f.currencyCode)}</td>
                                <td className="dd-num">{money(row.effectiveInterestExpense, f.currencyCode)}</td>
                                <td className="dd-num">{money(row.cashPayment, f.currencyCode)}</td>
                                <td className="dd-num">{money(row.closingAmortizedCost, f.currencyCode)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="fh-note">{effective.note}</p>
                    </>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </DocumentSurface>
    </>
  );
}

