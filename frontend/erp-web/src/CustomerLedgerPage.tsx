import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BookOpenText, ChevronDown, Scale, Wallet } from "lucide-react";
import { api } from "./erpApi";
import { useTakePageParam } from "./pageNavigation";
import type { BuiltInScreenLayoutField, CustomerItem, CustomerStatement, CustomerStatementLine } from "./erp-types";
import AdvancedDataGrid, { type GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand } from "./commands/gridCommands";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import { ListFooter } from "./list-page/ListFooter";
import { StatusTag } from "./list-page/StatusTag";
import "./list-page/list-page-v2.css";
import "./customer-ledger-page.css";

type CustomerPage = { items: CustomerItem[]; totalCount: number };
type ScreenField = Pick<BuiltInScreenLayoutField, "key" | "label" | "visible" | "position" | "fixed" | "width" | "pinned">;

const defaultLedgerFields: ScreenField[] = [
  { key: "entryDate", label: "Tarih", visible: true, position: 0 },
  { key: "description", label: "Açıklama", visible: true, position: 1 },
  { key: "direction", label: "Yön", visible: true, position: 2 },
  { key: "debit", label: "Borç", visible: true, position: 3 },
  { key: "credit", label: "Alacak", visible: true, position: 4 },
  { key: "balance", label: "Bakiye", visible: true, position: 5 },
  { key: "currencyCode", label: "Döviz", visible: false, position: 6 },
];
const numericLedgerFields = new Set(["debit", "credit", "balance"]);
const LEDGER_WIDTHS: Record<string, number> = { entryDate: 96, direction: 76, debit: 130, credit: 130, balance: 150, currencyCode: 70 };

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function today() {
  return isoDate(new Date());
}
/** Period chips (mockup 03): each only sets the date range; the range inputs stay editable ("Özel"). */
export function periodRange(period: "month" | "quarter" | "year", now = new Date()): { from: string; to: string } {
  const to = isoDate(now);
  if (period === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (period === "quarter") return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), to };
  return { from: `${now.getFullYear()}-01-01`, to };
}
function displayDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("tr-TR");
}
function amount(value: number) {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Running balance as the statement shows it: absolute amount and side (B = borç, A = alacak). */
function sided(value: number) {
  if (value === 0) return <span>{amount(0)}</span>;
  return (
    <>
      <span>{amount(Math.abs(value))}</span>{" "}
      <span className="cl-side" title={value > 0 ? "Borç bakiyesi" : "Alacak bakiyesi"}>
        {value > 0 ? "B" : "A"}
      </span>
    </>
  );
}
/** A reversal line (written for an original line; the statement DTO carries `reversalOfId`). */
const isReversalLine = (item: CustomerStatementLine) => Boolean(item.reversalOfId) || item.isReversal;

/**
 * A movement amount. The statement API adds amounts up whatever their currency and labels the result with the
 * account's currency, so a movement in another currency shows its own code (as the base page's currency format did).
 */
function lineAmount(item: CustomerStatementLine, statementCurrency: string) {
  return (
    <span className="cl-amount">
      {amount(item.amount)}
      {item.currencyCode !== statementCurrency && <span className="cl-foreign"> {item.currencyCode}</span>}
    </span>
  );
}

function renderLedgerCell(item: CustomerStatementLine, key: string, statementCurrency: string) {
  switch (key) {
    case "entryDate":
      return displayDate(item.entryDate);
    case "description":
      return (
        <span className="cl-desc">
          {isReversalLine(item) && <span className="cl-link" aria-hidden="true">↳</span>}
          <span className="cl-desc-text">{item.description || "—"}</span>
          {isReversalLine(item) && <StatusTag tone="info">Ters kayıt</StatusTag>}
          {item.hasReversal && <StatusTag tone="off">Ters çevrildi</StatusTag>}
        </span>
      );
    case "direction":
      return item.direction === "Debit" ? "Borç" : "Alacak";
    case "debit":
      return item.direction === "Debit" ? lineAmount(item, statementCurrency) : "";
    case "credit":
      return item.direction === "Credit" ? lineAmount(item, statementCurrency) : "";
    case "balance":
      return sided(item.balance);
    case "currencyCode":
      return item.currencyCode;
    default:
      return null;
  }
}

/**
 * Cari Hesap Hareketleri (approved mockup 03, statement layout): the chosen account's statement for a date range —
 * devir (opening balance), the movements with the running balance, period totals and the closing balance. Read only;
 * corrections are reversal entries written from the account's reconciliation window. Belge türü / no, vade and
 * aging are not drawn: the statement API does not return them.
 */
export default function CustomerLedgerPage({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<CustomerItem | null>(null);
  const [from, setFrom] = useState(() => periodRange("year").from);
  const [to, setTo] = useState(today);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [error, setError] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  // Cari Hesaplar (sistem sayfası veya eski ekran) hareketleri `customerId` sayfa parametresiyle açar: cari seçili gelir.
  // Parametre bir kez okunur; açık sekme başka bir cariyle yeniden açılırsa o cari yüklenir.
  const paramRequest = useRef(0);
  useTakePageParam("customer-ledger", "customerId", (id) => {
    const current = ++paramRequest.current;
    setSelectedId(id);
    setSelectedAccount(null);
    setStatement(null);
    void api<CustomerItem>(`/api/customers/${encodeURIComponent(id)}`, token)
      .then((item) => { if (current === paramRequest.current) setSelectedAccount(item); })
      .catch((e) => { if (current === paramRequest.current) setError(`Cari açılamadı: ${(e as Error).message}`); });
  });
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const customerPickerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<GridExportActions | null>(null);
  const [screenFields, setScreenFields] = useState<ScreenField[]>(defaultLedgerFields);
  const visibleFields = useMemo(
    () => screenFields.filter((field) => field.visible).sort((a, b) => a.position - b.position),
    [screenFields],
  );

  useEffect(() => {
    let active = true;
    api<{ fields: ScreenField[] }>("/api/screen-views/customer-ledger-entries/active", token)
      .then((view) => {
        if (active && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!customerPickerOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!customerPickerRef.current?.contains(event.target as Node)) {
        setCustomerPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [customerPickerOpen]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoadingCustomers(true);
      try {
        const params = new URLSearchParams({ q: search.trim(), page: "1", pageSize: "100" });
        const result = await api<CustomerPage>(`/api/customers/?${params}`, token);
        if (active) setCustomers(result.items);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoadingCustomers(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, token]);

  useEffect(() => {
    let active = true;
    if (!selectedId || !from || !to || to < from) {
      setStatement(null);
      setLoadingStatement(false);
      return;
    }
    setStatement(null);
    setLoadingStatement(true);
    setError("");
    api<CustomerStatement>(
      `/api/customers/${selectedId}/statement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      token,
    )
      .then((data) => {
        if (active) setStatement(data);
      })
      .catch((e) => {
        if (active) {
          setStatement(null);
          setError((e as Error).message);
        }
      })
      .finally(() => {
        if (active) setLoadingStatement(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, from, to, token, reloadKey]);

  const selected = selectedAccount?.id === selectedId
    ? selectedAccount
    : customers.find((item) => item.id === selectedId);
  const period = (["month", "quarter", "year"] as const).find((key) => {
    const range = periodRange(key);
    return range.from === from && range.to === to;
  }) ?? "";
  const currency = statement?.currencyCode ?? "";
  const net = statement ? statement.debitTotal - statement.creditTotal : 0;
  const reversals = statement?.items.filter(isReversalLine).length ?? 0;
  const openingDate = (() => {
    const date = new Date(`${from}T00:00:00`);
    date.setDate(date.getDate() - 1);
    return isoDate(date);
  })();

  return (
    <main className="customer-ledger-page list-v2">
      {/* The grid's Excel is the bar's Excel (Ctrl+E); its CSV moves to İşlemler. */}
      <PageCommandsSlot commands={statement ? { more: [csvExportCommand(exportRef)] } : {}} />
      <ListPageHeader
        title="Cari Hesap Hareketleri"
        description="Cari hesabı seçerek tarih aralığındaki borç ve alacak hareketlerini inceleyin."
        count={statement ? statement.items.length : null}
        countLabel="hareket"
      />
      {statement && (
        <ListSummaryCards
          cards={[
            {
              id: "opening",
              label: "Açılış bakiyesi",
              value: <>{sided(statement.openingBalance)} <span>{currency}</span></>,
              icon: Wallet,
              hint: <><span>{displayDate(openingDate)}</span> <span>itibarıyla</span></>,
            },
            {
              id: "debit",
              label: "Dönem borç",
              value: `${amount(statement.debitTotal)} ${currency}`,
              icon: ArrowUpRight,
              hint: <span>ters kayıt dahil</span>,
            },
            {
              id: "credit",
              label: "Dönem alacak",
              value: `${amount(statement.creditTotal)} ${currency}`,
              icon: ArrowDownRight,
              hint: <span>ters kayıt dahil</span>,
            },
            {
              id: "closing",
              label: "Kapanış bakiyesi",
              value: <>{sided(statement.closingBalance)} <span>{currency}</span></>,
              icon: Scale,
              hint: <><span>{displayDate(to)}</span> <span>itibarıyla</span></>,
            },
          ]}
        />
      )}

      <ListToolbar toolsSlotRef={statement ? setToolsSlot : undefined} onRefresh={() => setReloadKey((key) => key + 1)}>
        <div className="customer-ledger-customer" ref={customerPickerRef}>
          <span id="customer-ledger-customer-label" className="cl-filter-label">Cari hesap</span>
          <button
            type="button"
            className="customer-ledger-customer-trigger"
            aria-haspopup="listbox"
            aria-expanded={customerPickerOpen}
            aria-labelledby="customer-ledger-customer-label"
            onClick={() => {
              setCustomerPickerOpen((open) => !open);
              setSearch("");
            }}
          >
            <span className={selected ? "" : "customer-ledger-customer-placeholder"}>
              {selected ? `${selected.code} · ${selected.name}` : "Cari seçin"}
            </span>
            <ChevronDown className="customer-ledger-customer-chevron" size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {customerPickerOpen && (
            <div className="customer-ledger-customer-popup">
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kodu veya unvanıyla ara"
                aria-label="Cari kodu veya unvanıyla ara"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setCustomerPickerOpen(false);
                  }
                }}
              />
              <div className="customer-ledger-customer-options" role="listbox" aria-label="Cari hesaplar">
                {loadingCustomers ? (
                  <div className="customer-ledger-customer-message" role="status">Cariler yükleniyor…</div>
                ) : customers.length ? customers.map((item) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.id === selectedId}
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setSelectedAccount(item);
                      setCustomerPickerOpen(false);
                      setSearch("");
                    }}
                  >
                    <span>{item.code} · {item.name}</span>
                    {!item.isActive && <small>Pasif</small>}
                  </button>
                )) : (
                  <div className="customer-ledger-customer-message">Aramayla eşleşen cari bulunamadı.</div>
                )}
              </div>
            </div>
          )}
        </div>
        <ListChipGroup
          label="Dönem"
          value={period}
          onChange={(value) => {
            if (!value) return;
            const range = periodRange(value as "month" | "quarter" | "year");
            setFrom(range.from);
            setTo(range.to);
          }}
          options={[
            { value: "month", label: "Bu ay" },
            { value: "quarter", label: "Son 3 ay" },
            { value: "year", label: "Yıl başından" },
          ]}
        />
        <label className="list-v2-filter">
          <span>Başlangıç tarihi</span>
          <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="list-v2-filter">
          <span>Bitiş tarihi</span>
          <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </label>
      </ListToolbar>

      {error && <div className="alert inline-alert" role="alert">{error}</div>}
      {to < from && <div className="alert inline-alert" role="alert">Bitiş tarihi başlangıç tarihinden önce olamaz.</div>}

      {statement ? (
        <>
          <section className="cl-statement list-v2-list" aria-label="Hesap hareketleri">
            <div className="cl-statement-head">
              <h2>Hesap hareketleri</h2>
              <span className="nx-code">{statement.customerCode}</span>
              <span className="cl-statement-name">{statement.customerName}</span>
              <span className="cl-muted">
                <span>{displayDate(statement.from)} – {displayDate(statement.to)}</span> · <span>{currency}</span>
              </span>
              {loadingStatement && <span role="status">Güncelleniyor…</span>}
              {statement.items.some((item) => item.currencyCode !== statement.currencyCode) && (
                <span className="cl-foreign-note">Farklı dövizli hareket var; toplamlar ve bakiye dövize göre ayrıştırılmaz</span>
              )}
            </div>
            <div className="cl-line cl-opening">
              <span>
                <b>Devir — açılış bakiyesi</b> <span className="cl-muted">· <span>{displayDate(openingDate)}</span> <span>itibarıyla</span></span>
              </span>
              <span className="cl-line-amount">{sided(statement.openingBalance)}</span>
            </div>
            <AdvancedDataGrid
              className="customer-table cl-grid"
              gridId="customer-ledger-entries"
              {...screenViewGridDefaults(visibleFields, (field) => LEDGER_WIDTHS[field.key])}
              externalPagination
              hideSearch
              hideExport
              exportActionsRef={exportRef}
              toolbarContainer={toolsSlot}
              enableRowSelection={false}
              aria-label="Cari hesap hareketleri"
            >
              <thead>
                <tr>
                  {visibleFields.map((field) => (
                    <th key={field.key} className={numericLedgerFields.has(field.key) ? "nx-num" : undefined}>{field.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement.items.length ? statement.items.map((item) => (
                  <tr
                    key={item.id}
                    className={[isReversalLine(item) ? "cl-is-reversal" : "", item.hasReversal ? "cl-is-reversed" : ""].filter(Boolean).join(" ") || undefined}
                  >
                    {visibleFields.map((field) => (
                      <td
                        key={field.key}
                        className={numericLedgerFields.has(field.key) ? "nx-num" : undefined}
                        title={field.key === "description" ? item.description : undefined}
                      >
                        {renderLedgerCell(item, field.key, statement.currencyCode)}
                      </td>
                    ))}
                  </tr>
                )) : <tr><td colSpan={Math.max(visibleFields.length, 1)} className="customer-ledger-empty">Seçilen tarih aralığında hareket bulunmuyor.</td></tr>}
              </tbody>
            </AdvancedDataGrid>
            <div className="cl-line cl-subtotal">
              <span>
                <b>Dönem toplamı</b>{" "}
                <span className="cl-muted">
                  · <span>{statement.items.length}</span> <span>hareket</span>
                  {reversals > 0 && (
                    <>
                      {" "}(<span>ters kayıt dahil</span>)
                    </>
                  )}
                </span>
              </span>
              <span className="cl-line-figures">
                <span><span className="cl-muted">Borç</span> {amount(statement.debitTotal)}</span>
                <span><span className="cl-muted">Alacak</span> {amount(statement.creditTotal)}</span>
                <span><span className="cl-muted">Net</span> {net > 0 ? "+" : ""}{amount(net)}</span>
              </span>
            </div>
            <div className="cl-line cl-closing">
              <span>
                <b>Kapanış bakiyesi</b> <span className="cl-muted">· <span>{displayDate(to)}</span></span>
              </span>
              <span className="cl-line-amount cl-closing-amount">{sided(statement.closingBalance)} <span>{currency}</span></span>
            </div>
          </section>
          <ListFooter hints="B borç bakiyesi · A alacak bakiyesi · Ters kayıt orijinal hareketin karşı kaydıdır, hareketler silinmez">
            <span>
              <span>Açılış</span> <b>{amount(statement.openingBalance)}</b> · <span>Dönem borç</span> <b>{amount(statement.debitTotal)}</b> ·{" "}
              <span>Dönem alacak</span> <b>{amount(statement.creditTotal)}</b> · <span>Kapanış</span>{" "}
              <b>{sided(statement.closingBalance)} {currency}</b>
            </span>
          </ListFooter>
        </>
      ) : (
        <section className="customer-ledger-placeholder">
          <span className="customer-ledger-placeholder-icon"><BookOpenText size={20} /></span>
          <strong>{loadingStatement ? "Cari hesap hareketleri yükleniyor…" : selected ? "Hareketler görüntülenemedi." : "Cari ekstre görünümüne başlayın"}</strong>
          <p>{selected ? `${selected.code} · ${selected.name}` : "Borç, alacak ve bakiye hareketlerini görmek için önce bir cari hesap seçin."}</p>
          {!selected && !loadingStatement && <button type="button" className="secondary" onClick={() => { setCustomerPickerOpen(true); setSearch(""); }}>Cari hesap seç</button>}
        </section>
      )}
    </main>
  );
}
