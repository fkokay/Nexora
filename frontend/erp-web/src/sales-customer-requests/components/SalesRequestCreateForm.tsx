import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Trash2 } from "lucide-react";
import type * as AppTypes from "../../erp-types";
import { api } from "../../erpApi";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import type { SalesRequestSummary } from "../types";

type Customer = { id: string; code: string; name: string; currencyCode: string };
type Line = { stockItemId: string; quantity: string };
type Page<T> = { items: T[]; totalCount: number };

type Props = {
  token: string;
  onCancel: () => void;
  /** `stayForNext`: "Kaydet ve Yeni" ile kaydedildiyse form açık kalır. */
  onSaved: (created: SalesRequestSummary, stayForNext: boolean) => void;
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (): Line => ({ stockItemId: "", quantity: "1" });

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return [...byId.values()];
}

async function loadCustomers(token: string, term = ""): Promise<Customer[]> {
  const q = term ? `q=${encodeURIComponent(term)}&` : "";
  const size = term ? 50 : 100;
  const [customers, both] = await Promise.all([
    api<Page<Customer>>(`/api/customers/?${q}type=Customer&status=Active&page=1&pageSize=${size}`, token),
    api<Page<Customer>>(`/api/customers/?${q}type=Both&status=Active&page=1&pageSize=${size}`, token),
  ]);
  return mergeById(customers.items, both.items);
}

async function loadStockItems(token: string, term = ""): Promise<AppTypes.StockItem[]> {
  const q = term ? `q=${encodeURIComponent(term)}&` : "";
  const page = await api<Page<AppTypes.StockItem>>(`/api/stock/items/?${q}page=1&pageSize=${term ? 50 : 100}`, token);
  return page.items.filter((item) => item.isActive);
}

/** Yeni satış talebi: müşteri, tarihler ve istenen ürün satırları. Fiyat teklif aşamasında girilir. */
export function SalesRequestCreateForm({ token, onCancel, onSaved }: Props) {
  const [code, setCode] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [requestDate, setRequestDate] = useState(today);
  const [neededByDate, setNeededByDate] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockItems, setStockItems] = useState<AppTypes.StockItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stayForNext = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadCustomers(token), loadStockItems(token)])
      .then(([customerItems, stockCards]) => {
        if (!active) return;
        setCustomers(customerItems);
        setStockItems(stockCards);
      })
      .catch((e) => { if (active) setError((e as Error).message); });
    return () => {
      active = false;
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [token]);

  /** İlk sayfada olmayan kayıtlar için sunucuda arar; sonuçlar mevcut seçeneklere eklenir. */
  function searchRemote(term: string, run: (value: string) => Promise<void>) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const value = term.trim();
    if (value.length < 2) return;
    searchTimer.current = setTimeout(() => { void run(value).catch(() => {}); }, 350);
  }

  function reset() {
    setCode("");
    setCustomerId("");
    setRequestDate(today());
    setNeededByDate("");
    setDescription("");
    setLines([emptyLine()]);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!customerId) { setError("Müşteri seçilmelidir."); return; }
    if (lines.some((line) => !line.stockItemId)) { setError("Her satırda bir stok kartı seçilmelidir."); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api<SalesRequestSummary>("/api/sales/requests/", token, {
        method: "POST",
        body: JSON.stringify({
          code: code.trim(),
          customerId,
          requestDate,
          neededByDate: neededByDate || null,
          description: description.trim() || null,
          lines: lines.map((line) => ({ stockItemId: line.stockItemId, quantity: Number(line.quantity) })),
        }),
      });
      const keepOpen = stayForNext.current;
      if (keepOpen) {
        reset();
        setNotice(`${created.code} kaydedildi.`);
      }
      onSaved(created, keepOpen);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line, rowIndex) => (rowIndex === index ? { ...line, ...patch } : line)));

  return (
    <RecordFormPage
      className="sales-rf"
      title="Yeni Satış Talebi"
      mode="create"
      busy={busy}
      saveLabel="Talebi kaydet"
      onSubmit={(event) => void submit(event)}
      onCancel={onCancel}
      onSaveIntent={(stay) => { stayForNext.current = stay; }}
      onReset={reset}
      error={error}
      onDismissError={() => setError("")}
      status={
        <>
          <span>Müşterinin istediği ürünleri girin; fiyat teklif aşamasında belirlenir.</span>
          {notice && <span className="rf-status-notice">{notice}</span>}
          <span className="rf-status-end">Satır: <b>{lines.length}</b></span>
        </>
      }
    >
      <RecordFormGroup title="Talep Kimliği" bodyClassName="rf-identity">
        <label>
          <span>Talep no <RequiredMark /></span>
          <input className="rf-must rf-mono" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={40} placeholder="ST-2026-0001" />
        </label>
        <label>
          <span>Müşteri <RequiredMark /></span>
          <SearchableRecordPicker
            options={customers.map((customer) => ({ id: customer.id, label: `${customer.code} · ${customer.name}`, description: customer.currencyCode }))}
            selectedId={customerId}
            onSelect={setCustomerId}
            onSearchChange={(term) => searchRemote(term, async (value) => {
              const found = await loadCustomers(token, value);
              setCustomers((current) => mergeById(current, found));
            })}
            title="Müşteri seçin"
            placeholder="Müşteri seçin"
            searchPlaceholder="Cari kodu veya adıyla ara"
            emptyMessage="Aramanızla eşleşen müşteri bulunamadı."
            required
          />
        </label>
        <label>
          <span>Talep tarihi <RequiredMark /></span>
          <input className="rf-must" type="date" value={requestDate} onChange={(event) => setRequestDate(event.target.value)} required />
        </label>
        <label>
          <span>İhtiyaç tarihi</span>
          <input type="date" value={neededByDate} min={requestDate} onChange={(event) => setNeededByDate(event.target.value)} />
        </label>
        <label className="rf-columns-wide">
          <span>Açıklama</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={2} placeholder="Müşterinin notu, teslim beklentisi…" />
        </label>
      </RecordFormGroup>
      <RecordFormGroup title="Talep Satırları">
        <div className="ledger-list sales-quote-lines">
          <table className="customer-table sales-request-lines-table">
            <thead>
              <tr>
                <th>Sıra</th>
                <th>Stok</th>
                <th>Miktar</th>
                <th>Birim</th>
                <th aria-label="Satır işlemleri" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const card = stockItems.find((item) => item.id === line.stockItemId);
                return (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td className="quote-stock-cell">
                      <SearchableRecordPicker
                        options={stockItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}`, description: item.unitCode, searchText: item.unitCode }))}
                        selectedId={line.stockItemId}
                        onSelect={(id) => updateLine(index, { stockItemId: id })}
                        onSearchChange={(term) => searchRemote(term, async (value) => {
                          const found = await loadStockItems(token, value);
                          setStockItems((current) => mergeById(current, found));
                        })}
                        title="Stok kartı seçin"
                        placeholder="Stok seçin"
                        searchPlaceholder="Stok kodu veya adıyla ara"
                        emptyMessage="Aramanızla eşleşen stok kartı bulunamadı."
                        required
                      />
                    </td>
                    <td>
                      <input aria-label={`Satır ${index + 1} miktar`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} required />
                    </td>
                    <td>{card?.unitCode || "—"}</td>
                    <td>
                      <button type="button" className="icon-button" aria-label={`Satır ${index + 1} sil`} title="Satırı sil" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="quote-line-add-row">
                <td colSpan={5}>
                  <button type="button" className="secondary small-button" data-line-add-shortcut disabled={lines.length >= 100} onClick={() => setLines((current) => [...current, emptyLine()])}>
                    Satır ekle
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </RecordFormGroup>
    </RecordFormPage>
  );
}
