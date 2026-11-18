import { useRef, useState } from "react";
import { AlertTriangle, CircleDollarSign } from "lucide-react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import type { BuiltInScreenLayoutField, FinancialAccount } from "../../erp-types";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "../../commands/gridCommands";
import type { MenuCommand, PageCommands } from "../../commands/types";
import { ListSummaryCards, type SummaryCard } from "../../list-page/ListSummaryCards";
import { StatusTag } from "../../list-page/StatusTag";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import { ListFooter } from "../../list-page/ListFooter";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesListPanelToggle,
  SalesPanelFacts,
  SalesPanelStats,
} from "../../sales/components/SalesListDetailPanel";
import { useStockDetailPanelOpen } from "../../inventory/components/InventoryStockDetailPanel";
import { FinanceAccountsToolbar } from "./FinanceAccountsToolbar";
import "../../sales/sales-list-v2.css";
import "../finance-accounts.css";

export const accountMoney = (value: number, currency: string) =>
  `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** Why an account cannot be deleted (null = it can): today's rule, an account with movements is deactivated instead. */
export const accountDeleteBlock = (transactionCount: number) =>
  transactionCount > 0 ? "Hareketi olan hesap silinemez; pasifleştirin." : null;

const NUMBER_FIELDS = new Set(["balance", "transactionCount"]);
const CODE_FIELDS = new Set(["code"]);
const WIDTHS: Record<string, number> = { code: 120, name: 260, type: 90, currencyCode: 80, balance: 160, transactionCount: 90, status: 100 };

type Props = {
  kind: "Cash" | "Bank";
  /** The list is the visible screen (no statement or form over it). */
  active: boolean;
  loading: boolean;
  busy: boolean;
  /** Every cash and bank account (a transfer needs another active one). */
  allAccounts: FinancialAccount[];
  /** All accounts of this kind (cards) and the searched / filtered ones (list). */
  kindAccounts: FinancialAccount[];
  accounts: FinancialAccount[];
  fields: BuiltInScreenLayoutField[];
  query: string;
  status: "all" | "active" | "inactive";
  counts: { all: number; active: number; inactive: number };
  onQueryChange: (value: string) => void;
  onStatusChange: (value: "all" | "active" | "inactive") => void;
  onApplyQuery: () => void;
  onRefresh: () => void;
  onCreate: () => void;
  onOpen: (account: FinancialAccount) => void;
  onEdit: (account: FinancialAccount) => void;
  onToggle: (account: FinancialAccount) => void;
  onDelete: (account: FinancialAccount) => void;
  onNewMovement: (account: FinancialAccount) => void;
  onNewTransfer: (account: FinancialAccount) => void;
};

/**
 * Kasalar / Bankalar (list type A, mockup 09 map): balance cards from the loaded list, status chips, checkbox list,
 * detail panel and footer. A click makes an account current; a double click / Enter / Aç / the code opens its
 * statement. Düzenle, Pasifleştir, Manuel hareket and Transfer are in İşlemler with today's conditions.
 */
export function FinanceAccountsList({
  kind,
  active,
  loading,
  busy,
  allAccounts,
  kindAccounts,
  accounts,
  fields,
  query,
  status,
  counts,
  onQueryChange,
  onStatusChange,
  onApplyQuery,
  onRefresh,
  onCreate,
  onOpen,
  onEdit,
  onToggle,
  onDelete,
  onNewMovement,
  onNewTransfer,
}: Props) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [negativeOnly, setNegativeOnly] = useState(false);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panel = useStockDetailPanelOpen(active, rootRef);
  const noun = kind === "Cash" ? "kasa" : "banka";

  const shown = negativeOnly ? accounts.filter((account) => account.balance < 0) : accounts;
  const current = shown.find((account) => account.id === currentId) ?? null;
  const otherActive = (account: FinancialAccount) => allAccounts.some((row) => row.id !== account.id && row.isActive);

  // Balance card: one currency is added up; accounts in several currencies are not (the card says so).
  const currencies = [...new Set(kindAccounts.map((account) => account.currencyCode))];
  const balanceValue =
    loading || kindAccounts.length === 0
      ? "—"
      : currencies.length === 1
        ? accountMoney(kindAccounts.reduce((sum, account) => sum + account.balance, 0), currencies[0])
        : "—";
  const negatives = kindAccounts.filter((account) => account.balance < 0).length;
  const cards: SummaryCard[] = [
    {
      id: "balance",
      label: "Toplam bakiye",
      value: balanceValue,
      icon: CircleDollarSign,
      hint:
        currencies.length > 1 ? (
          <>
            <span>{`tüm ${noun} hesapları`}</span> · <span>birden çok para birimi</span>
          </>
        ) : (
          <span>{`tüm ${noun} hesapları`}</span>
        ),
    },
  ];
  // Kasa cannot go below zero (the API refuses it); a bank account can, which is worth a warning and a filter.
  if (kind === "Bank")
    cards.push({
      id: "negative",
      label: "Eksi bakiyeli hesap",
      value: loading ? "—" : negatives.toLocaleString("tr-TR"),
      icon: AlertTriangle,
      tone: negatives > 0 ? "bad" : "primary",
      hint: <span>{`tüm ${noun} hesapları`}</span>,
      filterActive: negativeOnly,
      onFilter: () => setNegativeOnly((on) => !on),
    });

  const selectReason = "Önce bir kayıt seçin";
  const more: MenuCommand[] = [
    {
      id: "account-edit",
      label: "Düzenle",
      disabledReason: !current ? selectReason : busy ? "İşlem sürüyor…" : undefined,
      run: () => (current ? onEdit(current) : undefined),
    },
    {
      id: "account-movement",
      label: "Manuel hareket",
      disabledReason: !current ? selectReason : busy ? "İşlem sürüyor…" : !current.isActive ? "Pasif hesaba hareket girilemez" : undefined,
      run: () => (current ? onNewMovement(current) : undefined),
    },
    {
      id: "account-transfer",
      label: "Transfer / döviz",
      disabledReason: !current
        ? selectReason
        : busy
          ? "İşlem sürüyor…"
          : !current.isActive
            ? "Pasif hesaptan transfer yapılamaz"
            : !otherActive(current)
              ? "Transfer için başka aktif hesap yok"
              : undefined,
      run: () => (current ? onNewTransfer(current) : undefined),
    },
    {
      id: "account-status",
      label: current && !current.isActive ? "Etkinleştir" : "Pasifleştir",
      disabledReason: !current ? selectReason : busy ? "İşlem sürüyor…" : undefined,
      run: () => (current ? onToggle(current) : undefined),
    },
    csvExportCommand(gridExportRef),
  ];
  const deleteBlock = current ? accountDeleteBlock(current.transactionCount) : selectReason;
  const commands: PageCommands = {
    new: { primary: true, disabledReason: busy ? "İşlem sürüyor…" : undefined, run: onCreate },
    open: {
      disabledReason: current ? undefined : selectReason,
      run: () => {
        const id = focusedRecordId() ?? current?.id;
        const account = shown.find((row) => row.id === id);
        if (account) onOpen(account);
      },
    },
    delete: {
      disabledReason: deleteBlock ?? (busy ? "İşlem sürüyor…" : undefined),
      run: () => (current ? onDelete(current) : undefined),
    },
    more,
  };

  const renderCell = (field: BuiltInScreenLayoutField, account: FinancialAccount) => {
    switch (field.key) {
      case "code":
        return (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-label={`${account.code} hesap ekstresini aç`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(account);
            }}
          >
            {account.code}
          </button>
        );
      case "name":
        return account.name;
      case "type":
        return account.type === "Cash" ? "Kasa" : "Banka";
      case "currencyCode":
        return account.currencyCode;
      case "balance":
        return <span className={account.balance < 0 ? "fin-acc-negative" : undefined}>{accountMoney(account.balance, account.currencyCode)}</span>;
      case "transactionCount":
        return account.transactionCount.toLocaleString("tr-TR");
      case "status":
        return <StatusTag tone={account.isActive ? "ok" : "off"}>{account.isActive ? "Aktif" : "Pasif"}</StatusTag>;
      default:
        return null;
    }
  };

  const listPanel =
    panel.open && active ? (
      current ? (
        <SalesListDetailPanel
          label={`${kind === "Cash" ? "Kasa" : "Banka"} hesabı özeti`}
          code={current.code}
          title={current.name}
          tags={
            <>
              <StatusTag tone={current.isActive ? "ok" : "off"}>{current.isActive ? "Aktif" : "Pasif"}</StatusTag>
              <StatusTag tone="off">{current.currencyCode}</StatusTag>
            </>
          }
          tabs={[{ id: "summary", label: "Özet" }]}
          tab="summary"
          onTabChange={() => {}}
          onOpen={() => onOpen(current)}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        >
          <SalesPanelStats
            items={[
              { label: "Bakiye", value: accountMoney(current.balance, current.currencyCode), tone: current.balance < 0 ? "bad" : undefined },
              { label: "Hareket", value: current.transactionCount.toLocaleString("tr-TR") },
            ]}
          />
          <SalesPanelFacts
            items={[
              { label: "Tür", value: current.type === "Cash" ? "Kasa" : "Banka" },
              { label: "Döviz", value: current.currencyCode },
              { label: "Açılış", value: new Date(current.createdAt).toLocaleDateString("tr-TR") },
            ]}
          />
          <p className="sales-ld-muted">Hareketler ve ekstre için Aç (Enter).</p>
        </SalesListDetailPanel>
      ) : (
        <SalesListDetailEmpty label={`${kind === "Cash" ? "Kasa" : "Banka"} hesabı özeti`} text="Özetini görmek için listeden bir hesap seçin." />
      )
    ) : null;

  return (
    <>
      {active && <PageCommandsSlot commands={commands} />}
      <ListSummaryCards cards={cards} />
      <FinanceAccountsToolbar
        query={query}
        status={status}
        counts={counts}
        onQueryChange={onQueryChange}
        onStatusChange={onStatusChange}
        onApply={onApplyQuery}
        onRefresh={onRefresh}
        toolsSlotRef={setToolsSlot}
        extra={<SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />}
      />
      <div ref={rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list fin-acc-list">
          <SalesDocumentGrid
            gridId={`studio-finance-finance-accounts-${kind === "Cash" ? "cash" : "bank"}-v2`}
            hideExport
            exportActionsRef={gridExportRef}
            fields={fields}
            items={shown}
            loading={loading}
            loadingMessage="Hesaplar yükleniyor…"
            emptyMessage="Filtreye uygun kasa veya banka hesabı yok."
            search=""
            searchEmptyMessage=""
            toolbarContainer={toolsSlot}
            renderCell={renderCell}
            ariaLabel={kind === "Cash" ? "Kasa hesapları" : "Banka hesapları"}
            columnWidths={WIDTHS}
            numberFields={NUMBER_FIELDS}
            codeFields={CODE_FIELDS}
            selection={{
              currentId,
              onCurrentChange: setCurrentId,
              onTickedChange: setTicked,
              bulkActions: active
                ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }]
                : undefined,
              onOpen: (id) => {
                const account = shown.find((row) => row.id === id);
                if (account) onOpen(account);
              },
            }}
            footer={
              <ListFooter hints="↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç · Ctrl+. detay paneli">
                {ticked.length > 0 && (
                  <span>
                    <span>{ticked.length}</span> <span>seçili</span>
                  </span>
                )}
                <span>
                  <span>Gösterilen</span>{" "}
                  <span>
                    {shown.length.toLocaleString("tr-TR")} / {kindAccounts.length.toLocaleString("tr-TR")}
                  </span>
                </span>
              </ListFooter>
            }
          />
        </section>
        {listPanel}
      </div>
    </>
  );
}
