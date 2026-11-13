import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";
import type {
  BuiltInScreenLayoutField,
  FinancialAccount,
} from "../../erp-types";

type Props = {
  token: string;
  loading: boolean;
  busy: boolean;
  accounts: FinancialAccount[];
  fields: BuiltInScreenLayoutField[];
  /** Page-level toolbar element that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null;
  onShowDetail: (account: FinancialAccount) => void;
  onToggle: (account: FinancialAccount) => void;
  onEdit: (account: FinancialAccount) => void;
  onDelete: (account: FinancialAccount) => void;
};

export function FinanceAccountsGrid({
  token,
  loading,
  busy,
  accounts,
  fields,
  toolbarContainer,
  onShowDetail,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="finance-account-list-body">
      <FinanceStudioGrid
        token={token}
        screenKey="finance-accounts"
        defaults={financeGridDefaults["finance-accounts"]}
        hideSearch
        enableRowSelection={false}
        toolbarContainer={toolbarContainer}
      >
        <table className="customer-table">
          <thead>
            <tr>
            {fields.map((field) => (
              <th
                key={field.key}
                style={
                  field.width
                    ? {
                        width: `${field.width}px`,
                        minWidth: `${field.width}px`,
                      }
                    : undefined
                }
              >
                {field.label}
              </th>
            ))}
            </tr>
          </thead>
          <tbody>
          {accounts.map((account) => (
            <tr key={account.id}>
              {fields.map((field) => (
                <td
                  key={field.key}
                  style={
                    field.width
                      ? {
                          width: `${field.width}px`,
                          minWidth: `${field.width}px`,
                        }
                      : undefined
                  }
                >
                  {field.key === "code" ? (
                    <span className="customer-code">{account.code}</span>
                  ) : field.key === "name" ? (
                    <b>{account.name}</b>
                  ) : field.key === "type" ? (
                    account.type === "Cash" ? (
                      "Kasa"
                    ) : (
                      "Banka"
                    )
                  ) : field.key === "currencyCode" ? (
                    account.currencyCode
                  ) : field.key === "balance" ? (
                    <b>
                      {account.balance.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      {account.currencyCode}
                    </b>
                  ) : field.key === "transactionCount" ? (
                    account.transactionCount
                  ) : field.key === "status" ? (
                    <span
                      className={`quote-status ${account.isActive ? "accepted" : "rejected"}`}
                    >
                      {account.isActive ? "Aktif" : "Pasif"}
                    </span>
                  ) : field.key === "actions" ? (
                    <>
                      <button className="row-action" disabled={busy} onClick={() => onEdit(account)}>Düzenle</button>
                      <button
                        className="row-action"
                        onClick={() => onShowDetail(account)}
                      >
                        Hareketler
                      </button>
                      <button className="row-action danger" disabled={busy || account.transactionCount > 0} title={account.transactionCount > 0 ? "Hareketi olan hesap silinemez; pasifleştirin." : "Hesabı sil"} onClick={() => onDelete(account)}>Sil</button>
                      <button
                        className="row-action"
                        disabled={busy}
                        onClick={() => onToggle(account)}
                      >
                        {account.isActive ? "Pasifleştir" : "Etkinleştir"}
                      </button>
                    </>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
          {!loading && accounts.length === 0 && (
            <tr>
              <td colSpan={Math.max(1, fields.length)} className="table-empty">
                Filtreye uygun kasa veya banka hesabı yok.
              </td>
            </tr>
          )}
          {loading && (
            <tr>
              <td
                colSpan={Math.max(1, fields.length)}
                className="table-empty"
                role="status"
              >
                Hesaplar yükleniyor…
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </FinanceStudioGrid>
    </div>
  );
}
