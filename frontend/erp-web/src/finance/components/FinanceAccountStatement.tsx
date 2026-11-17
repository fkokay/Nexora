import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { FinancialAccount, FinancialAccountDetail, FinancialMovement } from "../../erp-types";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import { DetailInfoGrid, DetailLinesHead, DetailTiles } from "../../document-detail/DocumentDetailLayout";
import { PageCommandsSlot, documentOpenCommands } from "../../commands/PageCommandsSlot";
import type { MenuCommand, PageCommands } from "../../commands/types";
import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";
import { StatusTag } from "../../list-page/StatusTag";
import { ListPagination } from "../../list-page/ListPagination";
import { accountDeleteBlock, accountMoney } from "./FinanceAccountsList";
import "../finance-accounts.css";

type CashFlowCategory = NonNullable<FinancialMovement["cashFlowCategory"]>;

const amount = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: string) => value.slice(0, 10).split("-").reverse().join(".");
const isManualMovement = (item: FinancialMovement) => item.sourceType === "Manuel hareket" && !item.reversalOfId;
const isTransferMovement = (item: FinancialMovement) => item.sourceType === "Hesap transferi" && !item.reversalOfId;

type Props = {
  token: string;
  detail: FinancialAccountDetail;
  /** Every cash and bank account (a transfer needs another active one). */
  accounts: FinancialAccount[];
  role: string;
  busy: boolean;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onClose: () => void;
  onPage: (page: number) => void;
  onCreateAccount: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onNewMovement: () => void;
  onNewTransfer: () => void;
  onVoidMovement: (item: FinancialMovement) => void;
  onVoidTransfer: (item: FinancialMovement) => void;
  onCategoryChange: (item: FinancialMovement, category: CashFlowCategory) => void;
  /** The movement / transfer form (a drawer over the statement). */
  drawer?: ReactNode;
};

/**
 * Kasa / banka hesap ekstresi (mockup 03 shape): account header with status, account facts, current balance and the
 * page's inflow / outflow, then the paged movements in the lines card. The API gives no opening balance, date filter or
 * running balance, so there is no carried-forward row or running balance column. Manuel hareket, Transfer / döviz and
 * the reversals (of the selected movement) are in İşlemler with today's conditions.
 */
export function FinanceAccountStatement({
  token,
  detail,
  accounts,
  role,
  busy,
  error,
  notice,
  onDismissError,
  onDismissNotice,
  onClose,
  onPage,
  onCreateAccount,
  onEdit,
  onToggle,
  onDelete,
  onNewMovement,
  onNewTransfer,
  onVoidMovement,
  onVoidTransfer,
  onCategoryChange,
  drawer,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const kindLabel = detail.type === "Cash" ? "Kasa" : "Banka";
  const rows = detail.transactions;
  const selected = rows.find((item) => item.id === selectedId) ?? null;
  const inflow = rows.filter((item) => item.direction === "Inflow").reduce((sum, item) => sum + item.amount, 0);
  const outflow = rows.filter((item) => item.direction === "Outflow").reduce((sum, item) => sum + item.amount, 0);
  const busyReason = busy ? "İşlem sürüyor…" : undefined;
  const pickReason = "Önce ekstreden bir hareket seçin";
  const more: MenuCommand[] = [
    {
      id: "account-movement",
      label: "Manuel hareket",
      disabledReason: busyReason ?? (!detail.isActive ? "Pasif hesaba hareket girilemez" : undefined),
      run: onNewMovement,
    },
    {
      id: "account-transfer",
      label: "Transfer / döviz",
      disabledReason:
        busyReason ??
        (!detail.isActive
          ? "Pasif hesaptan transfer yapılamaz"
          : !accounts.some((row) => row.id !== detail.id && row.isActive)
            ? "Transfer için başka aktif hesap yok"
            : undefined),
      run: onNewTransfer,
    },
    {
      id: "movement-void",
      label: "Hareketi iptal et",
      disabledReason: !selected
        ? pickReason
        : !isManualMovement(selected)
          ? "Yalnız ters kaydı olmayan manuel hareket iptal edilir"
          : busyReason,
      run: () => (selected ? onVoidMovement(selected) : undefined),
    },
    {
      id: "transfer-void",
      label: "Transferi iptal et",
      disabledReason: !selected
        ? pickReason
        : !isTransferMovement(selected)
          ? "Seçili hareket iptal edilmemiş bir hesap transferi değil"
          : busyReason,
      run: () => (selected ? onVoidTransfer(selected) : undefined),
    },
    { id: "account-edit", label: "Düzenle", disabledReason: busyReason, run: onEdit },
    { id: "account-status", label: detail.isActive ? "Pasifleştir" : "Etkinleştir", disabledReason: busyReason, run: onToggle },
  ];
  const commands: PageCommands = {
    ...documentOpenCommands(() => onPage(detail.transactionPage)),
    new: { disabledReason: busyReason, run: onCreateAccount },
    save: { disabledReason: "Hesap ekstresi salt okunurdur" },
    delete: { disabledReason: accountDeleteBlock(detail.transactionTotalCount) ?? busyReason, run: onDelete },
    more,
  };

  return (
    <>
      <PageCommandsSlot commands={commands} />
      <DocumentSurface
        variant="detail"
        className="fin-acc-statement"
        title={`${kindLabel} hesabı`}
        eyebrow={`${kindLabel} hesabı · ekstre`}
        code={detail.code}
        subtitle={detail.name}
        status={detail.isActive ? { label: "Aktif", tone: "success" } : { label: "Pasif", tone: "neutral" }}
        meta={<span>{detail.currencyCode}</span>}
        onClose={onClose}
        hints={["Alt+İ işlemler"]}
        footerStatus={
          <span>
            <span>Bakiye</span> <b>{accountMoney(detail.balance, detail.currencyCode)}</b>
          </span>
        }
      >
        {error && (
          <div className="alert inline-alert" role="alert">
            {error}
            <button type="button" aria-label="Kapat" onClick={onDismissError}>
              <X size={15} />
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button type="button" aria-label="Kapat" onClick={onDismissNotice}>
              <X size={15} />
            </button>
          </div>
        )}
        <DetailTiles
          label="Hesap özeti"
          items={[
            { label: "Güncel bakiye", value: accountMoney(detail.balance, detail.currencyCode), tone: detail.balance < 0 ? "danger" : "default" },
            { label: "Hareket", value: detail.transactionTotalCount.toLocaleString("tr-TR"), hint: <span>tümü</span> },
            { label: "Giriş", value: accountMoney(inflow, detail.currencyCode), hint: <span>bu sayfa</span> },
            { label: "Çıkış", value: accountMoney(outflow, detail.currencyCode), hint: <span>bu sayfa</span> },
          ]}
        />
        <div className="dd-box">
          <DetailInfoGrid
            label="Hesap bilgileri"
            items={[
              { label: "Hesap kodu", value: detail.code },
              { label: "Hesap adı", value: detail.name },
              { label: "Tür", value: kindLabel },
              { label: "Döviz", value: detail.currencyCode },
            ]}
          />
        </div>
        <div className="dd-box">
          <div className="fin-acc-lines-head">
            <DetailLinesHead
              title="Hareketler"
              meta={
                <>
                  <span>{detail.transactionTotalCount.toLocaleString("tr-TR")}</span> <span>hareket</span> ·{" "}
                  <span>satırı seçin: İşlemler seçili harekete uygulanır</span>
                </>
              }
            />
            <div className="fin-acc-tools" ref={setToolsSlot} />
          </div>
          <div className="dd-grid">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-account-transactions"
              defaults={financeGridDefaults["finance-account-transactions"]}
              enableRowSelection={false}
              hideSearch
              hideExport
              externalPagination
              toolbarContainer={toolsSlot}
            >
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Kaynak</th>
                    <th>Açıklama</th>
                    <th>Nakit akışı</th>
                    <th>Referans</th>
                    <th className="nx-num">Giriş</th>
                    <th className="nx-num">Çıkış</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr
                      key={t.id}
                      className={t.id === selectedId ? "is-current" : undefined}
                      aria-selected={t.id === selectedId}
                      tabIndex={0}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("select,button,input")) return;
                        setSelectedId(t.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                        event.preventDefault();
                        setSelectedId(t.id);
                      }}
                    >
                      <td>{date(t.transactionDate)}</td>
                      <td>{t.sourceType ? `${t.sourceType} ${t.sourceCode || ""}` : "Manuel / ters kayıt"}</td>
                      <td>{t.description}</td>
                      <td>
                        <select
                          aria-label="Nakit akışı sınıfı"
                          disabled={role !== "TenantAdmin" || busy || t.cashFlowCategory === "InternalTransfer" || t.cashFlowCategory === "OpeningBalance"}
                          value={t.cashFlowCategory || "Unclassified"}
                          onChange={(e) => onCategoryChange(t, e.target.value as CashFlowCategory)}
                        >
                          <option value="Unclassified">Sınıflandırılmamış</option>
                          <option value="Operating">İşletme</option>
                          <option value="Investing">Yatırım</option>
                          <option value="Financing">Finansman</option>
                          {t.cashFlowCategory === "InternalTransfer" && <option value="InternalTransfer">İç transfer</option>}
                          {t.cashFlowCategory === "OpeningBalance" && <option value="OpeningBalance">Açılış</option>}
                        </select>
                      </td>
                      <td>{t.reference || "—"}</td>
                      <td className="nx-num">{t.direction === "Inflow" ? amount(t.amount) : "—"}</td>
                      <td className="nx-num">{t.direction === "Outflow" ? amount(t.amount) : "—"}</td>
                      <td>{t.reversalOfId ? <StatusTag tone="warn">Ters kayıt</StatusTag> : null}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="table-empty">
                        Hesap hareketi yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </FinanceStudioGrid>
          </div>
          <div className="fin-acc-pager">
            <span>
              {detail.transactionTotalCount === 0 ? 0 : (detail.transactionPage - 1) * detail.transactionPageSize + 1}–
              {Math.min(detail.transactionPage * detail.transactionPageSize, detail.transactionTotalCount)} / {detail.transactionTotalCount}{" "}
              <span>hareket</span>
            </span>
            <ListPagination
              page={detail.transactionPage}
              total={detail.transactionTotalCount}
              pageSize={detail.transactionPageSize}
              onPageChange={onPage}
            />
          </div>
        </div>
        {drawer}
      </DocumentSurface>
    </>
  );
}
