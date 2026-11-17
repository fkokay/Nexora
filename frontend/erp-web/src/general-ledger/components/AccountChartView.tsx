import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { api, localDateString } from "../../erpApi";
import type { LedgerAccount, LedgerMapping, LedgerTrialBalance } from "../../erp-types";
import { ledgerStatementLabels } from "../../financeCatalog";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import type { MenuCommand, PageCommands } from "../../commands/types";
import { confirmDialog } from "../../confirmDialog";
import { DefinitionEmptyPane, DefinitionLayout } from "../../list-page/DefinitionLayout";
import { ListFooter } from "../../list-page/ListFooter";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { RecordFormGroup } from "../../record-form/RecordForm";
import { isInPopup, openDialogs, useWindowKeyDown } from "../../record-form/recordFormKeys";
import {
  displayAccountName,
  downloadCsv,
  downloadXlsx,
  formatAmount,
  isReverseBalance,
  round2,
  startOfYear,
  tdhpClassLabels,
  tdhpGroupLabel,
} from "../ledgerReportUtils";
import { AccountMovementsAside } from "./AccountMovementsAside";
import "../../list-page/list-page-v2.css";
import "../ledger-reports.css";
import "../ledger-chart.css";

/** Short labels of the TDHP classes (class filter); the full name is the tooltip. */
const classChipLabels: Record<string, string> = {
  "1": "Dönen varlıklar",
  "2": "Duran varlıklar",
  "3": "KVYK",
  "4": "UVYK",
  "5": "Özkaynaklar",
  "6": "Gelir tablosu",
  "7": "Maliyet",
  "8": "Serbest",
  "9": "Nazım",
};
type Ytd = { debit: number; credit: number; net: number };
const zeroYtd: Ytd = { debit: 0, credit: 0, net: 0 };
const balanceText = (net: number) => {
  const value = round2(net);
  return value === 0 ? "—" : `${formatAmount(Math.abs(value))} ${value > 0 ? "B" : "A"}`;
};
const classOf = (code: string) => code.trim().charAt(0);
const groupOf = (code: string) => code.trim().slice(0, 2);
const byCode = (a: LedgerAccount, b: LedgerAccount) =>
  a.code.localeCompare(b.code, "tr", { numeric: true, sensitivity: "base" });

const BUSY = "İşlem sürüyor…";
const NO_RECORD = "Önce bir kayıt seçin";
const UNSAVED = "Önce değişiklikleri kaydedin veya vazgeçin";
const ADMIN_ONLY = "Hesap planını firma yöneticisi düzenler";
const DISCARD = "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?";

export type AccountChartActions = {
  onAdd: () => void;
  onAddChild: (parent: LedgerAccount) => void;
  /** Loads the account into the form (the definition screen's open record). */
  onEdit: (account: LedgerAccount) => void;
  /** Closes the form (no record open). */
  onClose: () => void;
  onToggle: (account: LedgerAccount) => void;
  onDelete: (account: LedgerAccount) => void;
  onPreviewStandardChart: () => void;
};

/**
 * Hesap planı (finance-ledger-chart) as a definition screen (mockup 04 "Tanım ekranı", mapping in mockup 09): the
 * class › group › account tree with year-to-date balances on the left and the open account's card on the right.
 * Selecting a row opens the account (asking first when the form has unsaved changes), Yeni (F2) opens an empty card,
 * Kaydet / Ctrl+S saves it and Esc closes it. The former side-panel buttons are in İşlemler with the same conditions;
 * an account with movements is never deleted: Sil explains that and offers Pasife al.
 */
export function AccountChartView({
  token,
  role,
  accounts,
  mappings,
  busy,
  actions,
  formOpen,
  editingId,
  formDirty,
  renderForm,
  standardChartNotice,
  onRefresh,
  onNavigate,
}: {
  token: string;
  role: string;
  accounts: LedgerAccount[];
  mappings: LedgerMapping[];
  busy: boolean;
  actions: AccountChartActions;
  /** The account card is open (a new account, or `editingId`). */
  formOpen: boolean;
  /** The account open in the card ("" for a new account). */
  editingId: string;
  /** The card has unsaved changes. */
  formDirty: boolean;
  /** The page's account card; `summary` (the open account's balance card) goes first, Vazgeç calls `requestClose`. */
  renderForm: (summary: ReactNode, requestClose: () => void) => ReactNode;
  /** The "Tek Düzen Hesap Planı" preview strip rendered by the page. */
  standardChartNotice?: ReactNode;
  onRefresh: () => void;
  onNavigate?: (page: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [accountClass, setAccountClass] = useState(""),
    [status, setStatus] = useState(""),
    [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(() => new Set()),
    [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set()),
    [showMovements, setShowMovements] = useState(false),
    [ytdRows, setYtdRows] = useState<Map<string, Ytd>>(() => new Map()),
    [ytdError, setYtdError] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(formDirty);
  dirtyRef.current = formDirty;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const from = startOfYear(),
    to = localDateString();
  // Year-to-date balances come from the TDHP trial balance (Jan 1 – today).
  useEffect(() => {
    const controller = new AbortController();
    setYtdError("");
    api<LedgerTrialBalance>(
      `/api/finance/general-ledger/trial-balance?${new URLSearchParams({ basis: "TDHP", from, to })}`,
      token,
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setYtdRows(
          new Map(
            data.accounts.map((row) => [
              row.accountId,
              { debit: row.debit, credit: row.credit, net: row.balanceDebit - row.balanceCredit },
            ]),
          ),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setYtdError((e as Error).message);
      });
    return () => controller.abort();
    // accounts: balances are re-read after each chart reload.
  }, [token, from, to, accounts]);

  const ytdOf = (account: LedgerAccount) => ytdRows.get(account.id) || zeroYtd;
  /** An account row shows its own amounts plus every dotted sub-account below it. */
  const rolledUp = (account: LedgerAccount): Ytd => {
    const prefix = `${account.code}.`;
    return accounts
      .filter((row) => row.id === account.id || row.code.startsWith(prefix))
      .reduce(
        (sum, row) => {
          const ytd = ytdOf(row);
          return { debit: sum.debit + ytd.debit, credit: sum.credit + ytd.credit, net: sum.net + ytd.net };
        },
        { ...zeroYtd },
      );
  };
  const isMoving = (account: LedgerAccount) => {
    const ytd = ytdOf(account);
    return round2(ytd.debit) !== 0 || round2(ytd.credit) !== 0;
  };
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  const searched = normalized
    ? accounts.filter((account) =>
        `${account.code} ${account.name}`.toLocaleLowerCase("tr-TR").includes(normalized),
      )
    : accounts;
  const statusFiltered = searched.filter((account) =>
    status === "moving"
      ? isMoving(account)
      : status === "active"
        ? account.isActive
        : status === "inactive"
          ? !account.isActive
          : true,
  );
  const visible = (accountClass ? statusFiltered.filter((account) => classOf(account.code) === accountClass) : statusFiltered)
    .slice()
    .sort(byCode);
  const classes = [...new Set(visible.map((account) => classOf(account.code)))].sort();
  const classOptions = Object.keys(classChipLabels).filter((key) => accounts.some((account) => classOf(account.code) === key));
  const allGroupKeys = [...new Set(visible.map((account) => `${classOf(account.code)}:${groupOf(account.code)}`))];
  const everythingCollapsed = classes.length > 0 && allGroupKeys.every((key) => collapsedGroups.has(key));
  const expandedForSearch = normalized.length > 0;
  const toggleSet = (setter: typeof setCollapsedGroups, key: string) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const selected = formOpen && editingId ? accounts.find((account) => account.id === editingId) || null : null;
  const mappingUses = selected ? mappings.filter((mapping) => mapping.accountId === selected.id).length : 0;
  const isAdmin = role === "TenantAdmin";
  const hasChildren = (account: LedgerAccount) => accounts.some((row) => row.code.startsWith(`${account.code}.`));
  const activeCount = accounts.filter((account) => account.isActive).length;

  // Class and group balances cover every account of the class/group, whatever the filters show.
  const sumOf = (predicate: (account: LedgerAccount) => boolean) =>
    accounts.filter(predicate).reduce((total, account) => total + ytdOf(account).net, 0);
  function exportRows() {
    return [
      ["Hesap kodu", "Hesap adı", "Finansal tablo sınıfı", "Durum", "Dönem borç", "Dönem alacak", "Bakiye"],
      ...visible.map((account) => {
        const ytd = rolledUp(account);
        return [
          account.code,
          account.name,
          ledgerStatementLabels[account.statementSection] || account.statementSection,
          account.isActive ? "Aktif" : "Pasif",
          round2(ytd.debit),
          round2(ytd.credit),
          balanceText(ytd.net),
        ];
      }),
    ];
  }

  const confirmDiscard = async (title: string) =>
    !dirtyRef.current || (await confirmDialog({ title, message: DISCARD, confirmLabel: "Devam" }));
  const focusList = () =>
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(".nx-def-list tr.is-selected, .nx-def-list tr.glch-row")?.focus(), 0);
  async function requestAccount(account: LedgerAccount) {
    if ((formOpen && account.id === editingId && !showMovements) || busyRef.current) return;
    if (!(await confirmDiscard("Vazgeç"))) return;
    setShowMovements(false);
    actions.onEdit(account);
  }
  async function close() {
    if (!formOpen || busyRef.current || !(await confirmDiscard("Vazgeç"))) return;
    setShowMovements(false);
    actions.onClose();
    focusList();
  }
  async function startCreate(parent?: LedgerAccount) {
    if (busyRef.current || !(await confirmDiscard("Yeni kayıt"))) return;
    setShowMovements(false);
    if (parent) actions.onAddChild(parent);
    else actions.onAdd();
  }
  // An account with movements is never deleted: Sil explains it and offers the deactivation.
  async function deleteBlocked(account: LedgerAccount) {
    if (
      await confirmDialog({
        title: `${account.code} · ${displayAccountName(account.name)} silinemez`,
        message:
          "Hareketli hesap silinemez; yevmiye kayıtları ve raporlar korunur. Pasife alabilirsiniz: pasif hesaba yeni kayıt yapılamaz, etkinleştirildiğinde yeniden kullanılır.",
        tone: "warning",
        confirmLabel: "Pasife al",
        cancelLabel: "Vazgeç",
        keyHints: true,
      })
    )
      actions.onToggle(account);
  }

  // Esc = Vazgeç: closes the open card (or the drawer below 1280px); not while a dialog or a picker owns the key.
  useWindowKeyDown(formOpen, (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || !rootRef.current || rootRef.current.closest("[hidden]")) return;
    if (openDialogs().length) return;
    event.preventDefault();
    if (showMovements) setShowMovements(false);
    else void close();
  });

  const rowKeyHandler = (account: LedgerAccount) => (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void requestAccount(account);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const rows = [...(rootRef.current?.querySelectorAll<HTMLElement>(".nx-def-list tr[data-account-id]") ?? [])];
      const next = rows[rows.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      next.focus();
      const target = accounts.find((row) => row.id === next.dataset.accountId);
      if (target) void requestAccount(target);
    }
  };
  const reverseIcon = (account: LedgerAccount, ytd: Ytd) =>
    isReverseBalance(
      account,
      Math.max(0, ytd.net),
      Math.max(0, -ytd.net),
      "TDHP",
      accounts.find((row) => row.code.trim() === account.code.trim().split(".")[0].slice(0, 3))?.name,
    ) ? (
      <span
        className="glrp-reverse"
        role="img"
        aria-label="Ters bakiye"
        title={ytd.net < 0 ? "Ters bakiye: varlık hesabı alacak bakiyesi veriyor." : "Ters bakiye: kaynak hesabı borç bakiyesi veriyor."}
      >
        <AlertTriangle size={13} aria-hidden="true" />
      </span>
    ) : null;

  const commands: PageCommands = {
    new: isAdmin
      ? { primary: !formOpen, disabledReason: busy ? BUSY : undefined, run: () => void startCreate() }
      : { disabledReason: ADMIN_ONLY },
    open: {
      disabledReason: !selected ? NO_RECORD : undefined,
      run: () => {
        setShowMovements(false);
        window.setTimeout(
          () => rootRef.current?.querySelector<HTMLElement>(".nx-def-pane form input:not([disabled]), .nx-def-pane form select:not([disabled])")?.focus(),
          0,
        );
      },
    },
    delete: !isAdmin
      ? { disabledReason: ADMIN_ONLY }
      : {
          disabledReason: !selected
            ? NO_RECORD
            : formDirty
              ? UNSAVED
              : busy
                ? BUSY
                : hasChildren(selected)
                  ? "Alt hesabı olan hesap silinemez; önce alt hesapları kaldırın."
                  : selected.hasMovements && !selected.isActive
                    ? "Hareketli hesap silinemez; bu hesap zaten pasif."
                    : undefined,
          run: () => {
            if (!selected) return;
            if (selected.hasMovements) void deleteBlocked(selected);
            else actions.onDelete(selected);
          },
        },
    export: {
      disabledReason: !accounts.length ? "Dışa aktarılacak hesap yok" : undefined,
      run: () => void downloadXlsx("hesap-plani.xlsx", "Hesap planı", exportRows()),
    },
    more: [
      {
        id: "ledger-account-movements",
        label: "Hareketleri gör (muavin)",
        disabledReason: !selected ? NO_RECORD : undefined,
        run: () => setShowMovements(true),
      },
      ...(isAdmin
        ? ([
            {
              id: "ledger-account-child",
              label: "Alt hesap ekle",
              disabledReason: !selected ? NO_RECORD : !selected.isActive ? "Pasif hesaba alt hesap eklenemez" : busy ? BUSY : undefined,
              run: () => {
                if (selected) void startCreate(selected);
              },
            },
            {
              id: "ledger-account-status",
              label: selected && !selected.isActive ? "Etkinleştir" : "Pasifleştir",
              disabledReason: !selected ? NO_RECORD : formDirty ? UNSAVED : busy ? BUSY : undefined,
              run: () => {
                if (selected) actions.onToggle(selected);
              },
            },
            {
              id: "ledger-standard-chart",
              label: "Tek Düzen Hesap Planı",
              disabledReason: busy ? BUSY : undefined,
              run: actions.onPreviewStandardChart,
            },
          ] satisfies MenuCommand[])
        : []),
      {
        id: "ledger-mappings",
        label: "Hesap eşleştirmeleri",
        disabledReason: onNavigate ? undefined : "Bu ekranda kullanılamaz",
        run: () => onNavigate?.("finance-ledger-mappings"),
      },
      {
        id: "ledger-chart-csv",
        label: "CSV",
        disabledReason: !accounts.length ? "Dışa aktarılacak hesap yok" : undefined,
        run: () => downloadCsv("hesap-plani.csv", exportRows()),
      },
    ],
  };

  const summary = selected
    ? (() => {
        const ytd = rolledUp(selected);
        return (
          <RecordFormGroup title="Yıl başından bugüne" hint="TDHP mizanından">
            <dl className="glch-summary">
              <div>
                <dt>Dönem borç</dt>
                <dd>{formatAmount(ytd.debit)}</dd>
              </div>
              <div>
                <dt>Dönem alacak</dt>
                <dd>{formatAmount(ytd.credit)}</dd>
              </div>
              <div>
                <dt>Bakiye</dt>
                <dd>
                  {balanceText(ytd.net)}
                  {reverseIcon(selected, ytd)}
                </dd>
              </div>
              <div>
                <dt>Eşleştirmeler</dt>
                <dd>{`Eşleştirmelerde ${mappingUses} kullanım`}</dd>
              </div>
              <div>
                <dt>Hareket</dt>
                <dd>{selected.hasMovements ? "Hareket var" : "Hareket yok"}</dd>
              </div>
            </dl>
          </RecordFormGroup>
        );
      })()
    : null;

  const pane = !formOpen ? (
    <DefinitionEmptyPane>
      {isAdmin ? "Bir hesap seçin ya da F2 ile yeni hesap ekleyin." : "Bilgilerini görmek için bir hesap seçin."}
    </DefinitionEmptyPane>
  ) : showMovements && selected ? (
    <AccountMovementsAside
      token={token}
      accountId={selected.id}
      code={selected.code}
      name={displayAccountName(selected.name)}
      from={from}
      to={to}
      onClose={() => setShowMovements(false)}
    />
  ) : (
    <div className="inv-rf-embedded glch-form">{renderForm(summary, () => void close())}</div>
  );

  const list = (
    <>
      <ListToolbar
        search={query}
        onSearchChange={setQuery}
        searchLabel="Hesap planında ara"
        searchPlaceholder="Kod veya hesap adı"
        onRefresh={onRefresh}
      >
        <label className="list-v2-filter">
          <span>Sınıf</span>
          <select value={accountClass} onChange={(event) => setAccountClass(event.target.value)} aria-label="Hesap sınıfı">
            <option value="">{`Tümü (${statusFiltered.length.toLocaleString("tr-TR")})`}</option>
            {classOptions.map((key) => (
              <option key={key} value={key} title={`${key} ${tdhpClassLabels[key]}`}>
                {`${key} ${classChipLabels[key]} (${statusFiltered.filter((account) => classOf(account.code) === key).length.toLocaleString("tr-TR")})`}
              </option>
            ))}
          </select>
        </label>
        <ListChipGroup
          label="Hesap durumu"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Tümü", count: searched.length },
            { value: "moving", label: "Hareketli", count: searched.filter(isMoving).length },
            { value: "active", label: "Aktif", count: searched.filter((account) => account.isActive).length },
            { value: "inactive", label: "Pasif", count: searched.filter((account) => !account.isActive).length },
          ]}
        />
        <button
          type="button"
          className="glch-collapse-all"
          disabled={!classes.length}
          onClick={() => {
            if (everythingCollapsed) {
              setCollapsedGroups(new Set());
              setCollapsedClasses(new Set());
            } else setCollapsedGroups(new Set(allGroupKeys));
          }}
        >
          {everythingCollapsed ? "Tümünü genişlet" : "Tümünü daralt"}
        </button>
      </ListToolbar>
      <section className="list-v2-list glch-list" aria-label="Hesap planı">
        {ytdError && <p className="glmp-hint is-error glch-error">{`Bakiyeler yüklenemedi: ${ytdError}`}</p>}
        <div className="glrp-table-wrap">
          <table className="glch-table">
            <thead>
              <tr>
                <th scope="col">Kod</th>
                <th scope="col">Hesap</th>
                <th scope="col" className="nx-num">
                  Bakiye
                </th>
              </tr>
            </thead>
            <tbody>
              {classes.map((classKey) => {
                const classAccounts = visible.filter((account) => classOf(account.code) === classKey);
                const classCollapsed = !expandedForSearch && collapsedClasses.has(classKey);
                const groups = [...new Set(classAccounts.map((account) => groupOf(account.code)))];
                const classAccount = classAccounts.find((account) => account.code.trim() === classKey);
                return (
                  <Fragment key={classKey}>
                    <tr className="glch-class-row">
                      <th scope="rowgroup" colSpan={2}>
                        <button
                          type="button"
                          aria-expanded={!classCollapsed}
                          onClick={() => toggleSet(setCollapsedClasses, classKey)}
                        >
                          {classCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                          {`${classKey} ${tdhpClassLabels[classKey] || classAccount?.name || "Diğer"}`}
                        </button>
                      </th>
                      <td>{balanceText(sumOf((account) => classOf(account.code) === classKey))}</td>
                    </tr>
                    {!classCollapsed &&
                      groups.map((group) => {
                        const groupKey = `${classKey}:${group}`;
                        const groupAccounts = classAccounts.filter((account) => groupOf(account.code) === group);
                        const groupAccount = groupAccounts.find((account) => account.code.trim() === group);
                        const groupCollapsed = !expandedForSearch && collapsedGroups.has(groupKey);
                        const rows = groupAccounts.filter((account) => account !== groupAccount && account.code.trim() !== classKey);
                        return (
                          <Fragment key={groupKey}>
                            <tr className={`glch-group-row${groupAccount && selected?.id === groupAccount.id ? " is-selected" : ""}`}>
                              <td>
                                <button
                                  type="button"
                                  className="glch-toggle"
                                  aria-expanded={!groupCollapsed}
                                  aria-label={`${group} grubunu ${groupCollapsed ? "göster" : "gizle"}`}
                                  onClick={() => toggleSet(setCollapsedGroups, groupKey)}
                                >
                                  {groupCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                                </button>
                                <b>{group}</b>
                              </td>
                              <td
                                className={groupAccount ? "is-clickable" : undefined}
                                onClick={groupAccount ? () => void requestAccount(groupAccount) : undefined}
                                title={groupAccount?.name}
                              >
                                {groupAccount ? displayAccountName(groupAccount.name) : tdhpGroupLabel(group)}
                                {groupCollapsed && rows.length > 0 && <small>{` · ${rows.length} hesap`}</small>}
                              </td>
                              <td>{balanceText(sumOf((account) => classOf(account.code) === classKey && groupOf(account.code) === group))}</td>
                            </tr>
                            {!groupCollapsed &&
                              rows.map((account) => {
                                const ytd = rolledUp(account);
                                const depth = account.code.split(".").length - 1;
                                const isSelected = selected?.id === account.id;
                                return (
                                  <tr
                                    key={account.id}
                                    data-account-id={account.id}
                                    className={`glch-row${isSelected ? " is-selected" : ""}${account.isActive ? "" : " is-inactive"}`}
                                    tabIndex={0}
                                    aria-current={isSelected || undefined}
                                    onClick={() => void requestAccount(account)}
                                    onKeyDown={rowKeyHandler(account)}
                                  >
                                    <td className="glch-code" style={{ paddingLeft: 34 + depth * 16 }}>
                                      {account.code}
                                    </td>
                                    <td className="glch-name" title={account.name}>
                                      {displayAccountName(account.name)}
                                      {!account.isActive && <small> · Pasif</small>}
                                    </td>
                                    <td className="glch-balance">
                                      {balanceText(ytd.net)}
                                      {reverseIcon(account, ytd)}
                                    </td>
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={3} className="glrp-empty">
                    {normalized || status || accountClass ? "Aramayla eşleşen hesap bulunamadı." : "Tenant hesabı eklenmedi."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ListFooter hints="↑↓ listede gez · Tab forma geç · Ctrl+S kaydet · Esc listeye dön · F2 yeni hesap">
          <span>
            <span>{accounts.length.toLocaleString("tr-TR")}</span> <span>hesap</span> · <span>{activeCount.toLocaleString("tr-TR")}</span>{" "}
            <span>aktif</span>
          </span>
        </ListFooter>
      </section>
    </>
  );

  return (
    <>
      <PageCommandsSlot commands={commands} />
      <ListPageHeader
        title="Hesap planı"
        description="Tenant hesaplarını düzenleyin."
        count={accounts.length}
        countLabel="hesap · Tek Düzen Hesap Planı"
      />
      {standardChartNotice}
      <DefinitionLayout
        rootRef={rootRef}
        className="glch-def"
        paneOpen={formOpen}
        paneLabel="Hesap kartı"
        list={list}
        pane={pane}
      />
    </>
  );
}
