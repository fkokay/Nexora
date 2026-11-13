import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";
import type { FxRevaluationVoucherDetailProps } from "./types";

export default function FxRevaluationVoucherDetail({
  token,
  voucher,
  money,
  onClose,
}: FxRevaluationVoucherDetailProps) {
  return (
    <section className="finance-workbench-card fx-voucher-detail">
      <header className="list-v2-detail-head">
        <div>
          <h2>{voucher.code}</h2>
        </div>
        <div className="list-v2-detail-head-actions">
          <button className="secondary small-button" onClick={onClose}>
            Kapat
          </button>
        </div>
      </header>
      <div className="list-v2-detail-meta">
        <span>{voucher.asOfDate.split("-").reverse().join(".")}</span>
        <span>
          {voucher.lines.length} fatura satırı · borç/alacak{" "}
          {money(voucher.totalDebit, voucher.baseCurrencyCode)} · hesap
          kodları eşleştirme aşamasında belirlenir
        </span>
      </div>
      <div className="ledger-list">
        <FinanceStudioGrid
          token={token}
          screenKey="finance-fx-revaluation-lines"
          defaults={financeGridDefaults["finance-fx-revaluation-lines"]}
        >
          <table className="customer-table">
            <thead>
              <tr>
                <th>Fatura / cari</th>
                <th>Yön</th>
                <th>Açık tutar</th>
                <th>Fatura kuru</th>
                <th>Dönem kuru</th>
                <th>Bu fişin farkı</th>
                <th>Borç tutarı</th>
                <th>Borç hesabı</th>
                <th>Alacak tutarı</th>
                <th>Alacak hesabı</th>
              </tr>
            </thead>
            <tbody>
              {voucher.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <b>{line.invoiceCode}</b>
                    <small className="cell-subtitle">
                      {line.counterpartyName}
                    </small>
                  </td>
                  <td>
                    {line.direction === "Receivable" ? "Alacak" : "Borç"} ·{" "}
                    {line.currencyCode}
                  </td>
                  <td>{money(line.outstandingAmount, line.currencyCode)}</td>
                  <td>
                    {line.invoiceDateRate.toLocaleString("tr-TR", {
                      maximumFractionDigits: 8,
                    })}
                  </td>
                  <td>
                    {line.closingRate.toLocaleString("tr-TR", {
                      maximumFractionDigits: 8,
                    })}
                  </td>
                  <td>
                    {money(line.adjustmentBase, voucher.baseCurrencyCode)}
                  </td>
                  <td>
                    {money(line.debitBaseAmount, voucher.baseCurrencyCode)}
                  </td>
                  <td>{line.debitAccount || "—"}</td>
                  <td>
                    {money(line.creditBaseAmount, voucher.baseCurrencyCode)}
                  </td>
                  <td>{line.creditAccount || "—"}</td>
                </tr>
              ))}
              {voucher.lines.length === 0 && (
                <tr>
                  <td colSpan={10} className="table-empty">
                    Bu dönemde değerleme gerektiren açık döviz faturası yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </FinanceStudioGrid>
      </div>
    </section>
  );
}
