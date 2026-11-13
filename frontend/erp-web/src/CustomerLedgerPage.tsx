import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, BookOpenText, CalendarDays, ChevronDown, CircleDollarSign, Users } from "lucide-react";
import { api } from "./erpApi";
import type { BuiltInScreenLayoutField, CustomerItem, CustomerStatement, CustomerStatementLine } from "./erp-types";
import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
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

function currentYearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function renderLedgerCell(item: CustomerStatementLine, key: string) {
  switch (key) {
    case "entryDate":
      return new Date(`${item.entryDate}T00:00:00`).toLocaleDateString("tr-TR");
    case "description":
      return (
        <>
          {item.description || "—"}
          {item.isReversal && <span className="customer-ledger-tag">Ters kayıt</span>}
          {item.hasReversal && <span className="customer-ledger-tag">Ters çevrildi</span>}
        </>
      );
    case "direction":
      return item.direction === "Debit" ? "Borç" : "Alacak";
    case "debit":
      return item.direction === "Debit" ? money(item.amount, item.currencyCode) : "—";
    case "credit":
      return item.direction === "Credit" ? money(item.amount, item.currencyCode) : "—";
    case "balance":
      return money(item.balance, item.currencyCode);
    case "currencyCode":
      return item.currencyCode;
    default:
      return null;
  }
}

export default function CustomerLedgerPage({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<CustomerItem | null>(null);
  const [from, setFrom] = useState(currentYearStart);
  const [to, setTo] = useState(today);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [error, setError] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const customerPickerRef = useRef<HTMLDivElement>(null);
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
  }, [selectedId, from, to, token]);

  const selected = selectedAccount?.id === selectedId
    ? selectedAccount
    : customers.find((item) => item.id === selectedId);
  const closingSide = useMemo(() => {
    if (!statement || statement.closingBalance === 0) return "Dengede";
    return statement.closingBalance > 0 ? "Borç bakiyesi" : "Alacak bakiyesi";
  }, [statement]);

  return (
    <main className="customer-ledger-page">
      <header className="customer-ledger-heading">
        <span className="customer-ledger-heading-icon"><BookOpenText size={23} /></span>
        <div>
          <span className="customer-ledger-eyebrow">SATIŞ &amp; CARİ</span>
          <h1>Cari Hesap Hareketleri</h1>
          <p>Cari hesabı seçerek tarih aralığındaki borç ve alacak hareketlerini inceleyin.</p>
        </div>
      </header>

      {statement && (
        <section className="customer-ledger-summary" aria-label="Cari bakiye özeti">
          <div className="customer-ledger-account"><span><Users size={15} /> Seçili cari</span><strong>{statement.customerCode} · {statement.customerName}</strong></div>
          <div><span><CircleDollarSign size={15} /> Açılış bakiyesi</span><strong>{money(statement.openingBalance, statement.currencyCode)}</strong></div>
          <div><span><ArrowDownUp size={15} /> Dönem borç</span><strong>{money(statement.debitTotal, statement.currencyCode)}</strong></div>
          <div><span><ArrowDownUp size={15} /> Dönem alacak</span><strong>{money(statement.creditTotal, statement.currencyCode)}</strong></div>
          <div><span><CircleDollarSign size={15} /> {closingSide}</span><strong>{money(Math.abs(statement.closingBalance), statement.currencyCode)}</strong></div>
        </section>
      )}

      <section className="customer-ledger-filters" aria-label="Ekstre filtreleri">
        <div className="customer-ledger-filter-heading">
          <span><CalendarDays size={17} /></span>
          <div><strong>Ekstre filtreleri</strong><small>Cari hesabı ve incelemek istediğiniz tarih aralığını seçin.</small></div>
        </div>
        <div className="customer-ledger-customer" ref={customerPickerRef}>
          <span id="customer-ledger-customer-label">Cari hesap</span>
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
            <ChevronDown className="customer-ledger-customer-chevron" size={16} strokeWidth={1.8} aria-hidden="true" />
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
                  if (event.key === "Escape") setCustomerPickerOpen(false);
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
        <label>
          <span>Başlangıç tarihi</span>
          <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          <span>Bitiş tarihi</span>
          <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </label>
      </section>

      {error && <div className="customer-ledger-error" role="alert">{error}</div>}
      {to < from && <div className="customer-ledger-error" role="alert">Bitiş tarihi başlangıç tarihinden önce olamaz.</div>}

      {statement ? (
        <>
          <section className="customer-ledger-table-panel">
            <div className="customer-ledger-table-heading">
              <div><h2>Hareket dökümü</h2><span>{statement.items.length} hareket</span></div>
              {loadingStatement && <span role="status">Güncelleniyor…</span>}
            </div>
            <div className="customer-ledger-table-scroll">
              <AdvancedDataGrid
                className="customer-table"
                gridId="customer-ledger-entries"
                {...screenViewGridDefaults(visibleFields)}
                externalPagination
                hideSearch
                enableRowSelection={false}
              >
                <thead><tr>{visibleFields.map((field) => <th key={field.key} className={numericLedgerFields.has(field.key) ? "numeric" : undefined}>{field.label}</th>)}</tr></thead>
                <tbody>
                  {statement.items.length ? statement.items.map((item) => (
                    <tr key={item.id}>
                      {visibleFields.map((field) => (
                        <td
                          key={field.key}
                          className={numericLedgerFields.has(field.key) ? "numeric" : undefined}
                          title={field.key === "description" ? item.description : undefined}
                        >
                          {renderLedgerCell(item, field.key)}
                        </td>
                      ))}
                    </tr>
                  )) : <tr><td colSpan={Math.max(visibleFields.length, 1)} className="customer-ledger-empty">Seçilen tarih aralığında hareket bulunmuyor.</td></tr>}
                </tbody>
              </AdvancedDataGrid>
            </div>
          </section>
        </>
      ) : (
        <section className="customer-ledger-placeholder">
          <span className="customer-ledger-placeholder-icon"><BookOpenText size={23} /></span>
          <strong>{loadingStatement ? "Cari hesap hareketleri yükleniyor…" : selected ? "Hareketler görüntülenemedi." : "Cari ekstre görünümüne başlayın"}</strong>
          <p>{selected ? `${selected.code} · ${selected.name}` : "Borç, alacak ve bakiye hareketlerini görmek için önce bir cari hesap seçin."}</p>
          {!selected && !loadingStatement && <button type="button" className="customer-ledger-select-button" onClick={() => { setCustomerPickerOpen(true); setSearch(""); }}>Cari hesap seç</button>}
        </section>
      )}
    </main>
  );
}
