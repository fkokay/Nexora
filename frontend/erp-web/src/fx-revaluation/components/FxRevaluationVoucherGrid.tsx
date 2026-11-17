import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";
import type { FxRevaluationVoucherGridProps } from "./types";

export default function FxRevaluationVoucherGrid({
  token,
  vouchers,
  emptyMessage,
  toolbarContainer,
  money,
  onOpen,
  compact = false,
}: FxRevaluationVoucherGridProps) {
  return (
    <div className="ledger-list">
      <FinanceStudioGrid
        token={token}
        screenKey="finance-fx-revaluations"
        defaults={financeGridDefaults["finance-fx-revaluations"]}
        hideSearch
        hideExport={compact}
        externalPagination={compact}
        toolbarContainer={toolbarContainer}
      >
        <table className="customer-table">
          <thead>
            <tr>
              <th>Fiş</th>
              <th>Dönem sonu</th>
              <th>Döviz kalemi</th>
              <th>Borç</th>
              <th>Alacak</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher) => (
              <tr key={voucher.id}>
                <td>
                  {compact ? (
                    <button type="button" className="erp-link-button customer-code" onClick={() => onOpen(voucher.id)}>
                      {voucher.code}
                    </button>
                  ) : (
                    <span className="customer-code">{voucher.code}</span>
                  )}
                </td>
                <td>{voucher.asOfDate.split("-").reverse().join(".")}</td>
                <td>{voucher.lineCount}</td>
                <td className={compact ? "nx-num" : undefined}>{money(voucher.totalDebit, voucher.baseCurrencyCode)}</td>
                <td className={compact ? "nx-num" : undefined}>{money(voucher.totalCredit, voucher.baseCurrencyCode)}</td>
                <td>
                  <button
                    className="row-action"
                    onClick={() => onOpen(voucher.id)}
                  >
                    Fişi aç
                  </button>
                </td>
              </tr>
            ))}
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </FinanceStudioGrid>
    </div>
  );
}
