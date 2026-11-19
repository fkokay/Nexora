import { useEffect, useRef, useState } from "react";
import { api, localDateString } from "../../erpApi";
import type { PurchaseSupplierQuoteFieldDefinition, SalesCustomer, StockItem } from "../../erp-types";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import AsyncStockItemPicker from "../../sales/AsyncStockItemPicker";
import { LineAddLabel, SALES_FORM_HINTS, SalesFormLines, salesFormTotalRows } from "../../sales/salesDocumentForm";
import { purchaseCreateOrderTotals } from "../../purchasing/purchaseCreateForms";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import "../../sales/sales-record-forms.css";
import "../../sales/purchase-order-create.css";

/** Talepsiz teklifte satırlar sade tutulur: iskonto 0, KDV %20 sabit gönderilir. */
export const STANDALONE_QUOTE_DISCOUNT_PERCENT = 0;
export const STANDALONE_QUOTE_VAT_PERCENT = 20;

type DraftLine = { rowKey: number; stockItemId: string; unitCode: string; quantity: string; unitPrice: string };

/** Tüm aktif tedarikçi sayfalarını okur (tek sayfa 100 kayıtla sınırlıdır). */
async function loadSuppliers(type: "Supplier" | "Both", token: string): Promise<SalesCustomer[]> {
  const items: SalesCustomer[] = [];
  for (let page = 1; page <= 50; page++) {
    const result = await api<{ items: SalesCustomer[]; totalCount: number }>(`/api/customers/?type=${type}&status=Active&page=${page}&pageSize=100`, token);
    items.push(...result.items);
    if (result.items.length < 100 || items.length >= result.totalCount) break;
  }
  return items;
}

let nextRowKey = 1;
const emptyLine = (): DraftLine => ({ rowKey: nextRowKey++, stockItemId: "", unitCode: "", quantity: "1", unitPrice: "0" });

type Props = {
  token: string;
  onCancel: () => void;
  onCreated: (quote: { id: string; code: string }) => void;
};

/** Yeni tedarikçi teklifi (talep olmadan): tedarikçi, tarih, geçerlilik, not ve stok / miktar / birim fiyat satırları. */
export default function SupplierQuoteCreateForm({ token, onCancel, onCreated }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quoteDate, setQuoteDate] = useState(() => localDateString());
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);
  const [suppliers, setSuppliers] = useState<SalesCustomer[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<PurchaseSupplierQuoteFieldDefinition[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all([
      loadSuppliers("Supplier", token),
      loadSuppliers("Both", token),
      api<PurchaseSupplierQuoteFieldDefinition[]>("/api/purchasing/supplier-quotes/custom-fields", token),
    ])
      .then(([supplierPage, bothPage, fields]) => {
        if (!active) return;
        setSuppliers([...supplierPage, ...bothPage]);
        setFieldDefinitions(fields);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const supplier = suppliers.find((x) => x.id === supplierId);
  const currencyCode = supplier?.currencyCode || "TRY";
  const totals = purchaseCreateOrderTotals(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: String(STANDALONE_QUOTE_DISCOUNT_PERCENT),
      vatPercent: String(STANDALONE_QUOTE_VAT_PERCENT),
    })),
  );
  const money = (value: number) =>
    `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode === "TRY" ? "TL" : currencyCode}`;

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function selectStockItem(index: number, item: StockItem) {
    const priceCurrency = (item.priceCurrencyCode || "TRY").toUpperCase();
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, stockItemId: item.id, unitCode: item.unitCode || "" };
        // Alış liste fiyatı yalnızca fiyat hâlâ boş/0 ve para birimi tedarikçininkiyle aynıysa önerilir.
        if ((line.unitPrice.trim() === "" || Number(line.unitPrice) === 0) && item.purchaseListPrice != null
          && priceCurrency === currencyCode.toUpperCase())
          next.unitPrice = String(item.purchaseListPrice);
        return next;
      }),
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // RecordFormPage kayıt kısayolları gizli (keep-alive) formlara da ulaşır; gizli form kaydetmez.
    if (hostRef.current?.closest("[hidden]")) return;
    if (!supplier) {
      setError("Tedarikçi seçin.");
      return;
    }
    if (lines.some((line) => !line.stockItemId)) {
      setError("Her satır için stok kartı seçin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: string; code: string }>("/api/purchasing/supplier-quotes/", token, {
        method: "POST",
        body: JSON.stringify({
          code,
          supplierId,
          quoteDate,
          validUntil: validUntil || null,
          notes: notes || null,
          customFields: fieldValues,
          lines: lines.map((line) => ({
            stockItemId: line.stockItemId,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            discountPercent: STANDALONE_QUOTE_DISCOUNT_PERCENT,
            vatPercent: STANDALONE_QUOTE_VAT_PERCENT,
          })),
        }),
      });
      onCreated({ id: created.id, code: created.code });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="purchase-order-create-page" ref={hostRef}>
      <RecordFormPage
        className="sales-rf purchase-order-create"
        title="Yeni tedarikçi teklifi"
        document={{
          type: "Tedarikçi teklifi",
          code: code.trim() || undefined,
          party: supplier?.name,
          hints: SALES_FORM_HINTS,
        }}
        mode="create"
        busy={busy}
        saveLabel="Teklif kaydet"
        formId="supplier-quote-create-form"
        onSubmit={(event) => void save(event)}
        onCancel={onCancel}
        error={error}
        onDismissError={() => setError("")}
        status={
          <>
            <span>Talep olmadan girilen teklif. Miktar stok kartının temel birimindedir; KDV %{STANDALONE_QUOTE_VAT_PERCENT} uygulanır.</span>
            <span className="rf-status-end">
              Satır: <b>{lines.length}</b>
            </span>
          </>
        }
      >
        <RecordFormGroup title="Belge bilgileri" hint="* zorunlu alan" bodyClassName="rf-identity doc-form-fields">
          <label>
            <span>
              Tedarikçi teklif no <RequiredMark />
            </span>
            <input
              className="rf-must rf-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={64}
              placeholder="TKL-2026-001"
            />
          </label>
          <label className="rf-span-2">
            <span>
              Tedarikçi <RequiredMark />
            </span>
            <SearchableRecordPicker
              options={suppliers.map((x) => ({
                id: x.id,
                label: `${x.code} · ${x.name}`,
                description: x.currencyCode,
                searchText: x.currencyCode,
              }))}
              selectedId={supplierId}
              onSelect={setSupplierId}
              title="Tedarikçi seçin"
              placeholder="Tedarikçi seçin"
              searchPlaceholder="Tedarikçi kodu veya unvanıyla ara"
              emptyMessage="Aramanızla eşleşen tedarikçi bulunamadı."
              required
            />
          </label>
          <label>
            <span>
              Teklif tarihi <RequiredMark />
            </span>
            <input className="rf-must" type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} required />
          </label>
          <label>
            <span>
              Geçerlilik sonu <span className="optional-label">İsteğe bağlı</span>
            </span>
            <input type="date" min={quoteDate} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        </RecordFormGroup>
        <SalesFormLines
          label="Teklif satırları"
          lines={lines.length}
          extra={currencyCode}
          totals={salesFormTotalRows(totals, money)}
          totalsLabel="Teklif toplamları"
          notes={
            <label className="po-create-note">
              <span>
                Teklif notu <span className="optional-label">İsteğe bağlı</span>
              </span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={4} />
              <small className="sales-invoice-note-counter" aria-hidden="true">
                {notes.length} / 1000
              </small>
            </label>
          }
        >
          <table className="dd-lines po-create-lines">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th>Stok kartı</th>
                <th className="dd-num">Miktar</th>
                <th className="dd-num">Birim fiyat</th>
                <th className="dd-num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.rowKey}>
                  <td className="dd-ix">
                    <span>{index + 1}</span>
                    <button
                      type="button"
                      className="dd-line-remove"
                      aria-label={`Satır ${index + 1} kaldır`}
                      title="Satırı kaldır"
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </td>
                  <td className="dd-stock-cell">
                    <AsyncStockItemPicker token={token} selectedId={line.stockItemId} initialItems={[]} onSelect={(item) => selectStockItem(index, item)} />
                  </td>
                  <td className="dd-num">
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      aria-label={`Satır ${index + 1} miktar`}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      required
                    />
                    {line.unitCode && <small className="cell-subtitle">{line.unitCode}</small>}
                  </td>
                  <td className="dd-num">
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      aria-label={`Satır ${index + 1} birim fiyat`}
                      value={line.unitPrice}
                      onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                      required
                    />
                  </td>
                  <td className="dd-num dd-total">
                    <output aria-label={`Satır ${index + 1} tutar`}>
                      {money((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}
                    </output>
                  </td>
                </tr>
              ))}
              <tr className="dd-new-line">
                <td colSpan={5}>
                  <button
                    type="button"
                    data-line-add-shortcut
                    title="Ctrl+Shift+Enter ile satır ekle"
                    onClick={() => setLines((current) => [...current, emptyLine()])}
                  >
                    <LineAddLabel />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </SalesFormLines>
        {fieldDefinitions.length > 0 && (
          <RecordFormGroup title="Teklif Özel Alanları">
            <div className="rf-custom-grid">
              {fieldDefinitions.map((field) => (
                <label key={field.id}>
                  {field.label}
                  {field.isRequired ? " *" : ""}
                  <small>{field.code}</small>
                  {field.dataType === "Boolean" ? (
                    <select
                      required={field.isRequired}
                      value={fieldValues[field.code] || ""}
                      onChange={(e) => setFieldValues((current) => ({ ...current, [field.code]: e.target.value }))}
                    >
                      <option value="">Seçin</option>
                      <option value="true">Evet</option>
                      <option value="false">Hayır</option>
                    </select>
                  ) : (
                    <input
                      type={field.dataType === "Decimal" ? "number" : field.dataType === "Date" ? "date" : "text"}
                      step={field.dataType === "Decimal" ? "any" : undefined}
                      maxLength={field.dataType === "Text" ? field.maxLength : undefined}
                      required={field.isRequired}
                      value={fieldValues[field.code] || ""}
                      onChange={(e) => setFieldValues((current) => ({ ...current, [field.code]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
          </RecordFormGroup>
        )}
      </RecordFormPage>
    </div>
  );
}
