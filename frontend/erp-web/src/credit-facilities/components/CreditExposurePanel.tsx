import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { Exposure, ExposureSummary, ScreenField } from "../types";

type Props = {
  exposure: ExposureSummary;
  formatMoney: (amount: number, currency: string) => string;
  visibleFacilityFields: ScreenField[];
};

export function CreditExposurePanel({
  exposure,
  formatMoney,
  visibleFacilityFields,
}: Props) {
  function renderFacilityCell(field: ScreenField, row: Exposure) {
    switch (field.key) {
      case "code":
        return (
          <td key={field.key}>
            {row.code}
            <small>{row.status === "Active" ? "Aktif" : "Kapalı"}</small>
          </td>
        );
      case "lenderName":
        return <td key={field.key}>{row.lenderName}</td>;
      case "currencyCode":
        return <td key={field.key}>{row.currencyCode}</td>;
      case "approvedLimit":
        return (
          <td key={field.key}>
            {formatMoney(row.approvedLimit, row.currencyCode)}
          </td>
        );
      case "outstandingPrincipal":
        return (
          <td key={field.key}>
            {formatMoney(row.outstandingPrincipal, row.currencyCode)}
          </td>
        );
      case "security":
        return (
          <td key={field.key}>
            {formatMoney(
              row.activeGuarantees + row.activeCollateral,
              row.currencyCode,
            )}
            <small>
              {formatMoney(row.calledAmount, row.currencyCode)} çağrılmış
            </small>
          </td>
        );
      case "limitUtilization":
        return (
          <td key={field.key}>
            {row.limitUtilizationPercent.toLocaleString("tr-TR", {
              maximumFractionDigits: 2,
            })}
            %
          </td>
        );
      default:
        return <td key={field.key}>-</td>;
    }
  }

  return (
    exposure.currencies.length > 0 && (
      <section
        className="panel credit-records-panel credit-exposure"
        aria-labelledby="credit-exposure-title"
      >
        <div className="credit-records-heading">
          <div>
            <h2 id="credit-exposure-title">Kredi ve teminat maruziyeti</h2>
            <p>
              Para birimleri ayrı gösterilir; kur çevrimi yapılmaz. Çağrılmış
              teminat nakit hareketi sayılmaz.
            </p>
          </div>
        </div>
        <div
          className="credit-table-wrap"
          role="region"
          aria-label="Para birimine göre finansal maruziyet"
          tabIndex={0}
        >
          <table className="customer-table credit-table">
            <thead>
              <tr>
                <th>Para birimi</th>
                <th>Aktif kredi</th>
                <th>Onaylı limit</th>
                <th>Açık anapara</th>
                <th>Aktif garantiler</th>
                <th>Aktif teminat</th>
                <th>Çağrılmış</th>
              </tr>
            </thead>
            <tbody>
              {exposure.currencies.map((row) => (
                <tr key={row.currencyCode}>
                  <td>{row.currencyCode}</td>
                  <td>{row.facilityCount}</td>
                  <td>{formatMoney(row.approvedLimit, row.currencyCode)}</td>
                  <td>
                    {formatMoney(row.outstandingPrincipal, row.currencyCode)}
                  </td>
                  <td>{formatMoney(row.activeGuarantees, row.currencyCode)}</td>
                  <td>{formatMoney(row.activeCollateral, row.currencyCode)}</td>
                  <td>{formatMoney(row.calledAmount, row.currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className="credit-table-wrap"
          role="region"
          aria-label="Kredi bazında maruziyet"
          tabIndex={0}
        >
          <AdvancedDataGrid
            className="customer-table credit-table"
            gridId="finance-credit-exposure-facilities"
            {...screenViewGridDefaults(visibleFacilityFields)}
            externalPagination
            hideSearch
            enableRowSelection={false}
          >
            <thead>
              <tr>
                {visibleFacilityFields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exposure.facilities.map((row) => (
                <tr key={row.id}>
                  {visibleFacilityFields.map((field) =>
                    renderFacilityCell(field, row),
                  )}
                </tr>
              ))}
            </tbody>
          </AdvancedDataGrid>
        </div>
      </section>
    )
  );
}
