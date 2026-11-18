import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "./authApi";
import { AlertTriangle, CalendarClock, ShieldCheck, Wallet, XCircle } from "lucide-react";
import type { GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot, documentOpenCommands } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import { ListFooter } from "./list-page/ListFooter";
import { ListPagination } from "./list-page/ListPagination";
import { localDateString } from "./dateUtils";
import "./list-page/list-page-v2.css";
import "./document-detail/document-detail.css";
import "./finance-hub.css";
import "./payment-instruments.css";
import { ListPageHeader } from "./list-page/ListPageHeader";
import {
  DetailDrawer,
  DetailTabs,
  daysFromToday,
  formatAmount,
  formatDate,
} from "./document-detail/DocumentDetailLayout";
import {
  portfolioCards,
  type PortfolioTiles,
} from "./payment-instruments/components/PaymentInstrumentMetrics";
import { PaymentInstrumentListToolbar } from "./payment-instruments/components/PaymentInstrumentListToolbar";
import {
  PAYMENT_INSTRUMENT_COLUMNS,
  PaymentInstrumentGrid,
} from "./payment-instruments/components/PaymentInstrumentGrid";
import { PaymentInstrumentSidePanel } from "./payment-instruments/components/PaymentInstrumentSidePanel";
import { PaymentInstrumentDocument } from "./payment-instruments/components/PaymentInstrumentDocument";
import type {
  Counterparty,
  Direction,
  Draft,
  FinanceAccount,
  InstrumentEvent,
  Item,
  KindFilter,
  PageResult,
  RowAction,
  ScreenField,
  Status,
  StatusFilter,
} from "./payment-instruments/paymentInstrumentTypes";
import {
  allowedActions,
  collectLabel,
  statusText,
  statusTone,
} from "./payment-instruments/paymentInstrumentTypes";
import { StatusTag } from "./list-page/StatusTag";
import { PaymentInstrumentCreateForm } from "./payment-instruments/components/PaymentInstrumentCreateForm";
import { confirmDialog, promptDialog } from "./confirmDialog";
import { problemDetail } from "./erpApi";

const PAGE_SIZE = 25;
const STATUSES = Object.keys(statusText) as Status[];

const initial = (direction: Direction = "Receivable"): Draft => ({
  type: "Check",
  direction,
  instrumentNumber: "",
  counterpartyName: "",
  counterpartyAccountId: null,
  bankName: "",
  currencyCode: "TRY",
  amount: "",
  issueDate: localDateString(),
  dueDate: localDateString(),
  portfolioDate: localDateString(),
  notes: "",
});

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

/** Columns of the tenant's screen view restricted to the redesigned set; labels come from the new set. */
function redesignedColumns(fields: ScreenField[] | null): ScreenField[] {
  if (!fields?.length) return PAYMENT_INSTRUMENT_COLUMNS;
  const byKey = new Map(fields.map((field) => [field.key, field]));
  return PAYMENT_INSTRUMENT_COLUMNS.map((column) => {
    const saved = byKey.get(column.key);
    if (!saved) return column;
    return {
      ...column,
      visible: saved.visible,
      position: saved.position,
      width: saved.width,
      pinned: saved.pinned,
    };
  });
}

export default function PaymentInstrumentsPage({
  token,
  role,
}: {
  token: string;
  role: string;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [draft, setDraft] = useState<Draft>(() => initial()),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [createError, setCreateError] = useState(""),
    [notice, setNotice] = useState(""),
    [direction, setDirection] = useState<Direction>("Receivable"),
    [filter, setFilter] = useState<StatusFilter>("All"),
    [kindFilter, setKindFilter] = useState<KindFilter>("All"),
    [searchDraft, setSearchDraft] = useState(""),
    [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1),
    [totalCount, setTotalCount] = useState(0);
  const [showCreate, setShowCreate] = useState(false),
    [collectAccount, setCollectAccount] = useState<Record<string, string>>({});
  const [savedFields, setSavedFields] = useState<ScreenField[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Aç / Enter / double click open the record on its own surface (the list stays mounted, hidden).
  const [openedId, setOpenedId] = useState<string | null>(null),
    [openedCopy, setOpenedCopy] = useState<Item | null>(null);
  const [events, setEvents] = useState<InstrumentEvent[] | null>(null),
    [eventsLoading, setEventsLoading] = useState(false),
    [eventsError, setEventsError] = useState("");
  const [tiles, setTiles] = useState<PortfolioTiles | null>(null),
    [tilesLoading, setTilesLoading] = useState(true);
  const [tabCounts, setTabCounts] = useState<Partial<Record<Direction, number>>>({}),
    [statusCounts, setStatusCounts] = useState<Partial<Record<Status, number>> | undefined>();
  // Bumped after every successful write so the counts and the history reload.
  const [revision, setRevision] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState("");
  const [focusAccount, setFocusAccount] = useState(0);
  const accountSelectRef = useRef<HTMLSelectElement>(null);
  // list-v2: the page toolbar hosts the list's own tools (columns, pivot, export…).
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const isAdmin = role === "TenantAdmin";

  const fetchJson = useCallback(
    async <T,>(path: string): Promise<T> => {
      const response = await authenticatedFetch(path, token, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          (payload as { error?: string } | null)?.error ||
            problemDetail(payload) ||
            `İstek başarısız (${response.status}).`,
        );
      }
      return (await response.json()) as T;
    },
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        direction,
      });
      if (filter !== "All") params.set("status", filter);
      if (kindFilter !== "All") params.set("type", kindFilter);
      if (searchTerm) params.set("term", searchTerm);
      const [rows, accountRows] = await Promise.all([
        authenticatedFetch(
          `/api/finance/payment-instruments/?${params}`,
          token,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        authenticatedFetch("/api/finance/accounts", token, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (!rows.ok)
        throw new Error(
          rows.status === 403
            ? "Erişim reddedildi (403). Oturumun firma üyeliği veya rolü çek/senet listesine erişemiyor."
            : "Çek/senet listesi alınamadı (" + rows.status + ").",
        );
      if (!accountRows.ok)
        throw new Error(
          accountRows.status === 403
            ? "Erişim reddedildi (403). Oturumun firma üyeliği veya rolü finans hesaplarına erişemiyor."
            : "Finans hesapları alınamadı (" + accountRows.status + ").",
        );
      const result = (await rows.json()) as PageResult;
      setItems(result.items);
      setTotalCount(result.totalCount);
      setAccounts(
        ((await accountRows.json()) as FinanceAccount[]).filter(
          (x) => x.isActive,
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, page, direction, filter, kindFilter, searchTerm]);
  useEffect(() => {
    void load();
  }, [load]);

  // Portfolio tiles: independent of the tab and chips. The list endpoint has no aggregate
  // endpoint, so the figures come from page-size-1 calls that return the filtered summary.
  useEffect(() => {
    let cancelled = false;
    const today = localDateString();
    const soon = addDays(today, 30);
    const query = (values: Record<string, string>) =>
      fetchJson<PageResult>(
        `/api/finance/payment-instruments/?${new URLSearchParams({ page: "1", pageSize: "1", ...values })}`,
      );
    setTilesLoading(true);
    Promise.all([
      query({ direction: "Receivable", status: "Portfolio" }),
      query({ direction: "Payable", status: "Portfolio" }),
      query({ direction: "Receivable", status: "Portfolio", dueFrom: today, dueTo: soon }),
      query({ direction: "Payable", status: "Portfolio", dueFrom: today, dueTo: soon }),
      query({ status: "Bounced" }),
    ])
      .then(([receivable, payable, soonReceivable, soonPayable, bounced]) => {
        if (cancelled) return;
        setTiles({
          receivableOpen: receivable.summary.openByCurrency,
          receivableOpenCount: receivable.totalCount,
          payableOpen: payable.summary.openByCurrency,
          payableOpenCount: payable.totalCount,
          dueSoonCount: soonReceivable.totalCount + soonPayable.totalCount,
          dueSoonReceivable: soonReceivable.summary.openByCurrency,
          dueSoonPayable: soonPayable.summary.openByCurrency,
          bouncedCount: bounced.totalCount,
        });
      })
      .catch(() => {
        if (!cancelled) setTiles(null);
      })
      .finally(() => {
        if (!cancelled) setTilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchJson, revision]);

  // Tab and status-chip counts follow the type chip and the search, not the status chip.
  useEffect(() => {
    let cancelled = false;
    const base: Record<string, string> = { page: "1", pageSize: "1" };
    if (kindFilter !== "All") base.type = kindFilter;
    if (searchTerm) base.term = searchTerm;
    const other: Direction = direction === "Receivable" ? "Payable" : "Receivable";
    const count = (values: Record<string, string>) =>
      fetchJson<PageResult>(
        `/api/finance/payment-instruments/?${new URLSearchParams({ ...base, ...values })}`,
      ).then((result) => result.totalCount);
    setStatusCounts(undefined);
    Promise.all([
      count({ direction: other }),
      ...STATUSES.map((status) => count({ direction, status })),
    ])
      .then(([otherTotal, ...perStatus]) => {
        if (cancelled) return;
        const byStatus = Object.fromEntries(
          STATUSES.map((status, index) => [status, perStatus[index]]),
        ) as Record<Status, number>;
        setStatusCounts(byStatus);
        setTabCounts({
          [direction]: perStatus.reduce((sum, value) => sum + value, 0),
          [other]: otherTotal,
        });
      })
      .catch(() => {
        if (!cancelled) setStatusCounts(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchJson, direction, kindFilter, searchTerm, revision]);

  useEffect(() => {
    let cancelled = false;
    authenticatedFetch("/api/screen-views/payment-instruments/active", token, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) return;
        const view = (await response.json()) as { fields?: ScreenField[] };
        if (!cancelled && view.fields?.length) setSavedFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ baseCurrencyCode: string }>("/api/finance/currency")
      .then((result) => {
        if (!cancelled) setBaseCurrency(result.baseCurrencyCode);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchJson]);

  const selected =
    items.find((item) => item.id === selectedId) ?? null;
  // The open record: the list's row while it is on the page, else the last copy the API returned for it (an action can
  // move it out of the filtered page). Never another row.
  const opened = openedId
    ? (items.find((item) => item.id === openedId) ?? (openedCopy?.id === openedId ? openedCopy : null))
    : null;
  useEffect(() => {
    if (openedId && !opened) setOpenedId(null);
  }, [openedId, opened]);
  const selectedKey = opened?.id ?? selected?.id ?? "";
  useEffect(() => {
    if (!selectedKey) {
      setEvents(null);
      return;
    }
    let cancelled = false;
    setEvents(null);
    setEventsError("");
    setEventsLoading(true);
    fetchJson<InstrumentEvent[]>(
      `/api/finance/payment-instruments/${selectedKey}/events`,
    )
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setEventsError("Olay geçmişi alınamadı; kayıt tarihleri gösteriliyor.");
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchJson, selectedKey, revision]);

  // ⋯ → Tahsil et without a chosen account: move the focus to the side column's account list.
  useEffect(() => {
    if (!focusAccount) return;
    const select = accountSelectRef.current;
    if (!select) return;
    select.scrollIntoView({ block: "nearest", behavior: "smooth" });
    select.focus({ preventScroll: true });
  }, [focusAccount]);

  const searchCounterparties = useCallback(
    async (query: string, forDirection: Direction) => {
      const wanted = forDirection === "Receivable" ? "Customer" : "Supplier";
      const page = (type: string) => {
        const params = new URLSearchParams({ page: "1", pageSize: "50", status: "Active", type });
        if (query) params.set("q", query);
        return fetchJson<{ items: Counterparty[] }>(`/api/customers/?${params}`);
      };
      // The endpoint filters one type at a time: direct matches plus "Both" accounts.
      const [direct, both] = await Promise.all([page(wanted), page("Both")]);
      return [...direct.items, ...both.items]
        .filter((item) => item.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));
    },
    [fetchJson],
  );

  const columns = redesignedColumns(savedFields)
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);

  // Runs while typing and on Enter. The API needs at least 2 characters, so a single
  // character is not applied; clearing the box clears the search.
  function applySearch() {
    const value = searchDraft.trim();
    if (value.length === 1 || value === searchTerm) return;
    setError("");
    setPage(1);
    setSearchTerm(value);
  }
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await authenticatedFetch(path, token, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        title?: string;
      } | null;
      throw new Error(
        payload?.error ||
          problemDetail(payload) ||
          (response.status === 403
            ? "Erişim reddedildi (403). Bu çek/senet işlemi için firma yöneticisi (TenantAdmin) rolü gerekir."
            : `İstek başarısız (${response.status}).`),
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  }
  function openCreate() {
    setCreateError("");
    setDraft((current) =>
      current.instrumentNumber || current.counterpartyName || current.amount
        ? current
        : initial(direction),
    );
    setShowCreate(true);
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setCreateError("");
    setNotice("");
    try {
      const { counterpartyAccountId, ...rest } = draft;
      await request("/api/finance/payment-instruments/", "POST", {
        ...rest,
        // Sent only when the counterparty was picked from the list; the API checks the name matches.
        counterpartyAccountId: counterpartyAccountId || null,
        requestId: crypto.randomUUID(),
        amount: Number(draft.amount),
        currencyCode: draft.currencyCode.toUpperCase(),
      });
      setDraft(initial(direction));
      setShowCreate(false);
      setNotice("Çek/senet portföye kaydedildi.");
      setRevision((value) => value + 1);
      await load();
    } catch (cause) {
      setCreateError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(item: Item, kind: RowAction) {
    if (busy) return;
    const accountId = kind === "collect" ? collectAccount[item.id] : undefined;
    if (kind === "collect" && !accountId) {
      // The account list lives in the side column: select the record and point there.
      setSelectedId(item.id);
      setError("Tahsilat/ödeme için finans hesabı seçin.");
      setFocusAccount((value) => value + 1);
      return;
    }
    const note = await promptDialog(
      kind === "bounce"
        ? {
            title: "Karşılıksız olarak işaretlensin mi?",
            message: `${item.code} kaydı karşılıksız olarak işaretlenecek.`,
            label: "Karşılıksız işlem notu",
            required: true,
            multiline: true,
            tone: "danger",
            confirmLabel: "Karşılıksız işaretle",
          }
        : {
            title:
              kind === "endorse"
                ? "Çek/senet ciro edilsin mi?"
                : kind === "collect"
                  ? "Tahsil/ödeme kaydedilsin mi?"
                  : "İptal açıklaması",
            message: item.code,
            label: "İşlem açıklaması (isteğe bağlı)",
            multiline: true,
            tone: kind === "cancel" ? "danger" : "default",
            confirmLabel: "Devam",
          },
    );
    if (note === null) return;
    const endorsedTo =
      kind === "endorse"
        ? (
            await promptDialog({
              title: "Ciro edilecek kişi/kurum",
              message: `${item.code} kaydı ciro edilecek.`,
              label: "Kişi/kurum",
              required: true,
              tone: "default",
              confirmLabel: "Ciro et",
            })
          )?.trim()
        : undefined;
    if (kind === "endorse" && !endorsedTo) return;
    if (kind === "bounce" && !note.trim()) {
      setError("Karşılıksız işleminde açıklama girilmelidir.");
      return;
    }
    if (
      kind === "cancel" &&
      !(await confirmDialog({
        title: "Kayıt iptal edilsin mi?",
        message: `${item.code} kaydı iptal edilecek. Bu işlem geri alınamaz.`,
        tone: "danger",
        confirmLabel: "İptal et",
      }))
    )
      return;
    const eventType = (
      {
        endorse: "Ciro edildi",
        collect: "Tahsil/ödeme edildi",
        bounce: "Karşılıksız",
        cancel: "İptal",
      } as const
    )[kind];
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<Item | undefined>(
        `/api/finance/payment-instruments/${item.id}/${kind}`,
        "POST",
        {
          requestId: crypto.randomUUID(),
          rowVersion: item.rowVersion,
          eventDate: localDateString(),
          financialAccountId: accountId || null,
          endorsedTo: endorsedTo || null,
          note: note.trim() || null,
        },
      );
      setNotice(`${item.code}: ${eventType}.`);
      setSelectedId(item.id);
      // The open record keeps the API's updated copy (status, row version) in case it leaves the filtered page; without
      // one it is shown only while the reloaded list still has it.
      if (openedId === item.id) setOpenedCopy(result?.id === item.id ? result : null);
      setRevision((value) => value + 1);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openDocument(item: Item) {
    setSelectedId(item.id);
    setOpenedCopy(item);
    setOpenedId(item.id);
    setError("");
    setNotice("");
  }
  function closeDocument() {
    setOpenedId(null);
    setOpenedCopy(null);
  }
  function refresh() {
    if (loading || busy) return;
    setRevision((value) => value + 1);
    void load();
  }

  function renderCell(field: ScreenField, item: Item) {
    switch (field.key) {
      case "instrumentNumber":
        return (
          <span className="pi-two">
            <span className="pi-number">
              {/* The keyboard path to a row: a click selects the record for the side panel and İşlemler; Enter or a
                  double click opens it. */}
              <button
                type="button"
                className="erp-link-button pi-number-link"
                aria-pressed={item.id === selected?.id}
                onClick={() => setSelectedId(item.id)}
                onDoubleClick={() => openDocument(item)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.defaultPrevented) return;
                  event.preventDefault();
                  openDocument(item);
                }}
              >
                {item.instrumentNumber}
              </button>
              {item.status !== "Portfolio" && (
                <StatusTag tone={statusTone[item.status]}>{statusText[item.status]}</StatusTag>
              )}
            </span>
            <small>
              <span>{item.type === "Check" ? "Çek" : "Senet"}</span> · {item.code}
            </small>
          </span>
        );
      case "counterpartyName":
        return (
          <span className="pi-two">
            <span className="pi-strong">{item.counterpartyName}</span>
            <small>{item.bankName}</small>
          </span>
        );
      case "dueDate": {
        const days = daysFromToday(item.dueDate);
        const open = item.status === "Portfolio" || item.status === "Bounced";
        return (
          <span className="pi-two">
            <span>{formatDate(item.dueDate)}</span>
            {open && (
              <small className={days < 0 ? "pi-overdue" : undefined}>
                {days === 0 ? "Bugün" : days > 0 ? `${days} gün` : `${-days} gün geçti`}
              </small>
            )}
          </span>
        );
      }
      case "amount":
        return (
          <span className="pi-amount">
            {baseCurrency && item.currencyCode === baseCurrency
              ? formatAmount(item.amount)
              : formatAmount(item.amount, item.currencyCode)}
          </span>
        );
      default:
        return "—";
    }
  }

  // İşlemler: today's side-panel / row-menu actions for the selected record (or the open record), with the same
  // conditions (allowedActions, firma yöneticisi, not busy); a disabled item says why.
  function actionCommands(target: Item | null): MenuCommand[] {
    const targetActions = target && isAdmin ? allowedActions(target) : [];
    const actionReason = (kind: RowAction): string | undefined => {
      if (!isAdmin) return "Çek/senet işlemlerini yalnız firma yöneticisi yapar";
      if (!target) return "Önce bir kayıt seçin";
      if (busy) return "İşlem sürüyor…";
      if (targetActions.includes(kind)) return undefined;
      switch (kind) {
        case "collect":
          return "Yalnız portföydeki veya karşılıksız kayıt tahsil / ödenir";
        case "endorse":
          return "Yalnız portföydeki alınan çek ciro edilir";
        case "bounce":
          return "Karşılıksız veya iptal edilmiş kayıtta kullanılamaz";
        default:
          return "Yalnız portföydeki kayıt iptal edilir";
      }
    };
    const actionItem = (kind: RowAction, label: string): MenuCommand => ({
      id: `pi-${kind}`,
      label,
      disabledReason: actionReason(kind),
      run: () => {
        if (target) void action(target, kind);
      },
    });
    return [
      actionItem("collect", target ? collectLabel(target) : "Tahsil et"),
      actionItem("endorse", "Ciro et"),
      actionItem("bounce", "Karşılıksız"),
      actionItem("cancel", "İptal"),
    ];
  }
  const newCommand: PageCommands["new"] = isAdmin
    ? {
        primary: !opened,
        disabledReason: busy ? "İşlem sürüyor…" : undefined,
        run: () => {
          // The create drawer belongs to the list: an open record goes back to it first.
          closeDocument();
          openCreate();
        },
      }
    : { disabledReason: "Çek/senet kaydını yalnız firma yöneticisi ekler" };
  const deleteCommand = { disabledReason: "Çek/senet silinmez; İşlemler › İptal" };
  const commands: PageCommands = {
    new: newCommand,
    open: {
      disabledReason: selected ? undefined : "Önce bir kayıt seçin",
      run: () => {
        // Enter on a focused row runs Aç before the row selects itself: open the focused row.
        const id = focusedRecordId() ?? selected?.id;
        const target = items.find((row) => row.id === id);
        if (target) openDocument(target);
      },
    },
    delete: deleteCommand,
    more: [...actionCommands(selected), csvExportCommand(gridExportRef)],
  };
  // The open record owns the bar (the hidden list does not): Yenile reloads it, Excel / Filtre are closed.
  const documentCommands: PageCommands = {
    ...documentOpenCommands(refresh),
    new: newCommand,
    save: { disabledReason: "Çek/senet kaydı düzenlenmez; işlemler İşlemler menüsünde" },
    delete: deleteCommand,
    more: actionCommands(opened),
  };
  const pageRange = items.length
    ? `${((page - 1) * PAGE_SIZE + 1).toLocaleString("tr-TR")}–${((page - 1) * PAGE_SIZE + items.length).toLocaleString("tr-TR")}`
    : "0";

  return (
    <div className="page-content payment-instruments-page pi-page fh-page list-v2">
      {!showCreate && !opened && <PageCommandsSlot commands={commands} />}
      <ListPageHeader
        title="Çek ve senet"
        description="Alınan ve verilen çek/senetleri vadeleri ve durum geçmişiyle izleyin."
        count={loading && totalCount === 0 ? null : (tabCounts.Receivable ?? 0) + (tabCounts.Payable ?? 0) || totalCount}
      />
      {error && !opened && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Uyarıyı kapat">
            ×
          </button>
        </div>
      )}
      {notice && !opened && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Bildirimi kapat">
            ×
          </button>
        </div>
      )}
      <ListSummaryCards
        cards={portfolioCards(tiles, tilesLoading, {
          icons: { open: Wallet, payable: Wallet, dueSoon: CalendarClock, bounced: tiles?.bouncedCount ? XCircle : AlertTriangle },
          // Portföyde / Verilen filter the list with today's filters (direction tab + Portföyde status chip); the type
          // chip and the search are cleared so the list shows what the card counts.
          portfolioFilter: {
            active: (side) => direction === side && filter === "Portfolio" && kindFilter === "All" && !searchTerm,
            toggle: (side) => {
              const on = direction === side && filter === "Portfolio" && kindFilter === "All" && !searchTerm;
              setPage(1);
              setSelectedId(null);
              if (on) {
                setFilter("All");
                return;
              }
              setDirection(side);
              setFilter("Portfolio");
              setKindFilter("All");
              setSearchDraft("");
              setSearchTerm("");
            },
          },
        })}
      />
      <DetailTabs<Direction>
        label="Yön"
        value={direction}
        onChange={(value) => {
          if (value === direction) return;
          setPage(1);
          setFilter("All");
          setSelectedId(null);
          setDirection(value);
        }}
        tabs={[
          { key: "Receivable", label: "Alınan", count: tabCounts.Receivable },
          { key: "Payable", label: "Verilen", count: tabCounts.Payable },
        ]}
      />
      <div className="pi-layout">
        <div className="pi-main">
          <PaymentInstrumentListToolbar
            searchDraft={searchDraft}
            filter={filter}
            kindFilter={kindFilter}
            statusCounts={statusCounts}
            totalCount={tabCounts[direction]}
            onSearchDraftChange={setSearchDraft}
            onSearch={applySearch}
            onFilterChange={(value) => {
              setPage(1);
              setSelectedId(null);
              setFilter(value);
            }}
            onKindFilterChange={(value) => {
              setPage(1);
              setSelectedId(null);
              setKindFilter(value);
            }}
            onRefresh={refresh}
            toolsSlotRef={setToolsSlot}
          />
          <section className="pi-list list-v2-list" aria-label="Çek ve senet listesi">
            <PaymentInstrumentGrid
              toolbarContainer={toolsSlot}
              fields={columns}
              items={items}
              loading={loading}
              selectedId={selected?.id ?? null}
              onSelect={(item) => setSelectedId(item.id)}
              onOpen={openDocument}
              renderCell={renderCell}
              exportActionsRef={gridExportRef}
            />
            <ListFooter hints="Tık seçer · Çift tık / Enter açar · İşlemler seçili kayda uygulanır">
              {totalCount > PAGE_SIZE ? (
                <span className="pi-pagination">
                  <ListPagination page={page} total={totalCount} pageSize={PAGE_SIZE} loading={loading} onPageChange={setPage} />
                </span>
              ) : (
                <span>
                  <span>Gösterilen</span> <span>{`${pageRange} / ${totalCount.toLocaleString("tr-TR")}`}</span>
                </span>
              )}
            </ListFooter>
          </section>
          <p className="fh-note pi-boundary">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>
              Çek/senet işlemleri durum ve denetim geçmişi oluşturur. Tahsilat/ödeme
              banka veya kasa hareketi yazar; cari fatura tahsilatına otomatik
              mahsup yapmaz.
            </span>
          </p>
        </div>
        {/* While a record is open its surface has the history and the account list; the hidden panel stays empty. */}
        <PaymentInstrumentSidePanel
          item={opened ? null : selected}
          events={events}
          eventsLoading={eventsLoading}
          eventsError={eventsError}
          isAdmin={isAdmin}
          baseCurrency={baseCurrency}
          accounts={accounts}
          accountId={selected ? collectAccount[selected.id] || "" : ""}
          onAccountChange={(value) => {
            if (!selected) return;
            setCollectAccount((current) => ({ ...current, [selected.id]: value }));
          }}
          accountSelectRef={opened ? undefined : accountSelectRef}
        />
      </div>
      {opened && (
        <PaymentInstrumentDocument
          key={opened.id}
          item={opened}
          events={events}
          eventsLoading={eventsLoading}
          eventsError={eventsError}
          isAdmin={isAdmin}
          baseCurrency={baseCurrency}
          accounts={accounts}
          accountId={collectAccount[opened.id] || ""}
          onAccountChange={(value) => setCollectAccount((current) => ({ ...current, [opened.id]: value }))}
          accountSelectRef={accountSelectRef}
          commands={documentCommands}
          error={error}
          notice={notice}
          onDismissError={() => setError("")}
          onDismissNotice={() => setNotice("")}
          onClose={closeDocument}
        />
      )}
      <DetailDrawer
        open={showCreate}
        label="Portföye ekle"
        onClose={() => setShowCreate(false)}
        className="pi-drawer"
      >
        <PaymentInstrumentCreateForm
          draft={draft}
          busy={busy}
          error={createError}
          onDismissError={() => setCreateError("")}
          onDraftChange={setDraft}
          onSubmit={(event) => void create(event)}
          onCancel={() => setShowCreate(false)}
          searchCounterparties={searchCounterparties}
        />
      </DetailDrawer>
    </div>
  );
}
