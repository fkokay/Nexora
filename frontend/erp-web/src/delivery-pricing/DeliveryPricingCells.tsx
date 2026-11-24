import "./delivery-pricing.css";
import {
  allFree,
  formatMoneyWithCurrency,
  formatPrice,
  lineAmounts,
  parseCell,
  pricingStateTag,
  type DeliveryLinePricing,
  type DeliveryPricingState,
  type InvoicePriceLine,
  type PriceDraft,
  type PricingTotals,
} from "./deliveryPricing";

/*
 * The cell builders return plain <td>/<th> arrays (not fragments) so AdvancedDataGrid, which reads its row cells as
 * direct children, sees them as columns. The PascalCase components wrap them for ordinary tables.
 */

type HeadOptions = { gross?: boolean; freeColumn?: boolean };

/** Header cells of the price columns (same order as the cells below). */
export function priceHeadCells({ gross = false, freeColumn = true }: HeadOptions = {}) {
  return [
    ...(freeColumn ? [<th key="dp-free" className="dp-free-col">Bedelsiz</th>] : []),
    <th key="dp-price" className="dd-num">Birim fiyat</th>,
    <th key="dp-disc" className="dd-num">İsk. %</th>,
    <th key="dp-vat" className="dd-num">KDV %</th>,
    <th key="dp-net" className="dd-num">Tutar</th>,
    ...(gross ? [<th key="dp-gross" className="dd-num">KDV dahil</th>] : []),
  ];
}
export function PriceHeadCells(options: HeadOptions) {
  return <>{priceHeadCells(options)}</>;
}

/** Number of columns PriceHeadCells adds (for colSpan). */
export const priceColumnCount = (gross = false, freeColumn = true) => 4 + (gross ? 1 : 0) + (freeColumn ? 1 : 0);

const freeDashCells = (gross: boolean) => [
  <td key="dp-price" className="dd-num dp-dash">— fiyatsız</td>,
  <td key="dp-disc" className="dd-num dp-dash">—</td>,
  <td key="dp-vat" className="dd-num dp-dash">—</td>,
  <td key="dp-net" className="dd-num dp-dash">faturada</td>,
  ...(gross ? [<td key="dp-gross" className="dd-num dp-dash">—</td>] : []),
];

type EditCellProps = {
  /** Line label for the accessible names ("STK-1"). */
  label: string;
  quantity: number;
  price: PriceDraft;
  onChange: (patch: Partial<PriceDraft>) => void;
  /** The Bedelsiz box: the caller clears / re-suggests the cells. */
  onFreeChange: (free: boolean) => void;
  /** Note under the price cell ("siparişte 90,00 · değiştirildi", "liste fiyatı"). */
  hint?: { text: string; changed?: boolean } | null;
  gross?: boolean;
  disabled?: boolean;
};

/** Editable price cells of a line in a create / draft form. */
export function priceEditCells({ label, quantity, price, onChange, onFreeChange, hint, gross = false, disabled = false }: EditCellProps) {
  const amounts = lineAmounts(quantity, price);
  const cell = (field: "unitPrice" | "discountPercent" | "vatPercent", name: string) => (
    <input
      className="dp-cell"
      aria-label={`${label} ${name}`}
      type="number"
      min="0"
      max={field === "unitPrice" ? undefined : 100}
      step={field === "unitPrice" ? "0.0001" : "0.01"}
      value={price[field]}
      disabled={disabled}
      onChange={(event) => onChange({ [field]: event.target.value })}
    />
  );
  return [
    <td key="dp-free" className="dp-free-col">
      <input
        type="checkbox"
        className="dp-free-box"
        aria-label={`${label} bedelsiz`}
        checked={price.isFreeOfCharge}
        disabled={disabled}
        onChange={(event) => onFreeChange(event.target.checked)}
      />
    </td>,
    ...(price.isFreeOfCharge
      ? freeDashCells(gross)
      : [
          <td key="dp-price" className="dd-num">
            {cell("unitPrice", "birim fiyat")}
            {hint && <small className={`dp-src${hint.changed ? " is-changed" : ""}`}>{hint.text}</small>}
          </td>,
          <td key="dp-disc" className="dd-num">{cell("discountPercent", "iskonto yüzdesi")}</td>,
          <td key="dp-vat" className="dd-num">{cell("vatPercent", "KDV yüzdesi")}</td>,
          <td key="dp-net" className="dd-num">{amounts ? formatPrice(amounts.net) : "—"}</td>,
          ...(gross ? [<td key="dp-gross" className="dd-num">{amounts ? formatPrice(amounts.total) : "—"}</td>] : []),
        ]),
  ];
}
export function PriceEditCells(props: EditCellProps) {
  return <>{priceEditCells(props)}</>;
}

type ReadCellProps = { line: DeliveryLinePricing; gross?: boolean; freeColumn?: boolean };

/** Read-only price cells of a saved line (amounts from the server line view). */
export function priceReadCells({ line, gross = false, freeColumn = true }: ReadCellProps) {
  const free = !!line.isFreeOfCharge;
  const number = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const percent = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
  const changed =
    line.orderUnitPrice !== null && line.orderUnitPrice !== undefined && line.unitPrice !== null && line.unitPrice !== undefined &&
    Math.abs(line.orderUnitPrice - line.unitPrice) > 0.00005;
  return [
    ...(freeColumn ? [<td key="dp-free" className="dp-free-col">{free ? "Evet" : ""}</td>] : []),
    ...(free
      ? freeDashCells(gross)
      : [
          <td key="dp-price" className="dd-num">
            {number(line.unitPrice)}
            {changed && <small className="dp-src is-changed">{`siparişte ${formatPrice(line.orderUnitPrice!)} · değiştirildi`}</small>}
          </td>,
          <td key="dp-disc" className="dd-num">{percent(line.discountPercent)}</td>,
          <td key="dp-vat" className="dd-num">{percent(line.vatPercent)}</td>,
          <td key="dp-net" className="dd-num">{number(line.lineNetAmount)}</td>,
          ...(gross ? [<td key="dp-gross" className="dd-num">{number(line.lineTotal)}</td>] : []),
        ]),
  ];
}
export function PriceReadCells(props: ReadCellProps) {
  return <>{priceReadCells(props)}</>;
}

/*
 * İrsaliye satır tablolarının fiyat hücreleri (taslak 20): Bedelsiz kutusu, Birim fiyat (altında "siparişte X" notu),
 * İsk. %, KDV %, Tutar ve isteğe bağlı KDV dahil. Bedelsiz satırda hücreler kilitlenir ve "— fiyatsız / faturada" yazar.
 * Hücreler mevcut tablonun içine <td> olarak girer; tablonun kendi görünümü korunur.
 */



/** The purple "Bedelsiz" tag beside the stock of a free line. */
export function FreeTag() {
  return <span className="dp-tag dp-tag-free">Bedelsiz</span>;
}

/** List / header tag of a pricing state (nothing for a fully priced document). */
export function PricingStateTag({ state }: { state: DeliveryPricingState | null | undefined }) {
  const tag = pricingStateTag(state);
  if (!tag) return null;
  return <span className={`dp-tag dp-tag-${tag.tone}`}>{tag.label}</span>;
}


/** The same editable price fields as a strip under a line card (forms whose lines are not table rows). */
export function PriceEditStrip({
  label,
  quantity,
  price,
  onChange,
  onFreeChange,
  hint,
  currency,
  disabled = false,
}: {
  label: string;
  quantity: number;
  price: PriceDraft;
  onChange: (patch: Partial<PriceDraft>) => void;
  onFreeChange: (free: boolean) => void;
  hint?: { text: string; changed?: boolean } | null;
  currency?: string | null;
  disabled?: boolean;
}) {
  const amounts = lineAmounts(quantity, price);
  const cell = (field: "unitPrice" | "discountPercent" | "vatPercent", name: string, title: string) => (
    <label className="dp-strip-field">
      <span>{title}</span>
      <input
        className="dp-cell"
        aria-label={`${label} ${name}`}
        type="number"
        min="0"
        max={field === "unitPrice" ? undefined : 100}
        step={field === "unitPrice" ? "0.0001" : "0.01"}
        value={price[field]}
        disabled={disabled || price.isFreeOfCharge}
        placeholder={price.isFreeOfCharge ? "—" : undefined}
        onChange={(event) => onChange({ [field]: event.target.value })}
      />
      {field === "unitPrice" && hint && !price.isFreeOfCharge && (
        <small className={`dp-src${hint.changed ? " is-changed" : ""}`}>{hint.text}</small>
      )}
    </label>
  );
  return (
    <div className={`dp-strip${price.isFreeOfCharge ? " is-free" : ""}`}>
      <label className="dp-strip-free">
        <input
          type="checkbox"
          className="dp-free-box"
          aria-label={`${label} bedelsiz`}
          checked={price.isFreeOfCharge}
          disabled={disabled}
          onChange={(event) => onFreeChange(event.target.checked)}
        />
        <span>Bedelsiz</span>
      </label>
      {cell("unitPrice", "birim fiyat", "Birim fiyat")}
      {cell("discountPercent", "iskonto yüzdesi", "İsk. %")}
      {cell("vatPercent", "KDV yüzdesi", "KDV %")}
      <span className="dp-strip-amount">
        <span>Tutar</span>
        <b>{price.isFreeOfCharge ? "faturada" : amounts ? formatMoneyWithCurrency(amounts.net, currency) : "—"}</b>
      </span>
      <span className="dp-strip-amount">
        <span>KDV dahil</span>
        <b>{price.isFreeOfCharge ? "—" : amounts ? formatMoneyWithCurrency(amounts.total, currency) : "—"}</b>
      </span>
    </div>
  );
}


/** The four totals cards under a line table: priced net, VAT, grand total and the free-line count. */
export function PricingTotalsCards({ totals, currency, label = "İrsaliye fiyat toplamları" }: { totals: PricingTotals; currency?: string | null; label?: string }) {
  return (
    <div className="dp-totals" role="group" aria-label={label}>
      <div>
        <span>Fiyatlı satırlar</span>
        <b>{formatMoneyWithCurrency(totals.net, currency)}</b>
      </div>
      <div>
        <span>KDV</span>
        <b>{formatMoneyWithCurrency(totals.vat, currency)}</b>
      </div>
      <div>
        <span>Genel toplam (fiyatlı)</span>
        <b>{formatMoneyWithCurrency(totals.total, currency)}</b>
      </div>
      <div>
        <span>Bedelsiz satır</span>
        <b>{totals.freeCount}</b> <small>tutarı faturada girilir</small>
        {totals.unpricedCount > 0 && <small className="dp-unpriced">{` · ${totals.unpricedCount} fiyatsız satır`}</small>}
      </div>
    </div>
  );
}

/** "Tümünü bedelsiz yap" (or, when every line is free, "Bedelsizi kaldır"). */
export function AllFreeButton({ prices, onToggle, disabled }: { prices: PriceDraft[]; onToggle: () => void; disabled?: boolean }) {
  const every = allFree(prices);
  return (
    <button type="button" className="secondary small-button" disabled={disabled || prices.length === 0} onClick={onToggle}>
      {every ? "Bedelsizi kaldır" : "Tümünü bedelsiz yap"}
    </button>
  );
}

/** Explanation under an editable line table. */
export function FreeLineHint({ stock = true }: { stock?: boolean }) {
  return (
    <p className="dp-hint">
      Bedelsiz işaretlenen satırın fiyat, iskonto ve KDV hücreleri kilitlenir ve boşalır; işaret kaldırılınca fiyat yeniden
      önerilir.{stock ? " Miktar, stok ve maliyet kaydı bedelsiz satırda da aynen yapılır." : ""}
    </p>
  );
}

/** Price cells of an invoice-from-delivery line: free / unpriced lines are highlighted with "tutar girin". */
export function InvoicePriceCells({
  label,
  quantity,
  line,
  onChange,
  suggestion,
  disabled,
}: {
  label: string;
  quantity: number;
  line: InvoicePriceLine;
  onChange: (patch: Partial<InvoicePriceLine>) => void;
  /** List price offered for a free / unpriced line ("liste fiyatı 40,00 · öner"). */
  suggestion?: number | null;
  disabled?: boolean;
}) {
  const missing = line.needsAmount && parseCell(line.unitPrice) === null;
  const amounts = lineAmounts(quantity, { ...line, isFreeOfCharge: false });
  const cell = (field: "unitPrice" | "discountPercent" | "vatPercent", name: string) => (
    <input
      className={`dp-cell${field === "unitPrice" && missing ? " is-needed" : ""}`}
      aria-label={`${label} ${name}`}
      type="number"
      min="0"
      max={field === "unitPrice" ? undefined : 100}
      step={field === "unitPrice" ? "0.0001" : "0.01"}
      placeholder={field === "unitPrice" && line.needsAmount ? "tutar girin" : undefined}
      value={line[field]}
      required={field === "unitPrice"}
      disabled={disabled}
      onChange={(event) => onChange({ [field]: event.target.value })}
    />
  );
  return (
    <>
      <td className="dd-num">
        {cell("unitPrice", "birim fiyat")}
        {line.source === "delivery" && <small className="dp-src">irsaliyeden</small>}
        {line.source === "order" && <small className="dp-src">siparişten</small>}
        {line.needsAmount && suggestion !== null && suggestion !== undefined && (
          <button
            type="button"
            className="dp-suggest"
            disabled={disabled}
            onClick={() => onChange({ unitPrice: String(suggestion) })}
          >
            {`liste fiyatı ${formatPrice(suggestion)} · öner`}
          </button>
        )}
      </td>
      <td className="dd-num">{cell("discountPercent", "iskonto yüzdesi")}</td>
      <td className="dd-num">{cell("vatPercent", "KDV yüzdesi")}</td>
      <td className="dd-num">{amounts ? formatPrice(amounts.net) : "—"}</td>
    </>
  );
}

/** Warning above an invoice-from-delivery line table, when some lines need an amount. */
export function InvoiceAmountsAlert({ missing }: { missing: number }) {
  if (missing <= 0) return null;
  return (
    <div className="dp-alert" role="status">
      <span className="dp-tag dp-tag-warn">{`${missing} satırın tutarı eksik`}</span> Bedelsiz kesilen satırların tutarını
      girin. Fiyatlı satırlar irsaliye fiyatıyla gelir; burada değiştirilebilir (irsaliye değişmez). Bedelsiz satır 0 olarak da
      faturalanabilir; fatura toplamı sıfırdan büyük olmalı.
    </div>
  );
}

/** "Stok maliyeti" cell of a goods-receipt line: the line's net unit price, or "fatura gelince" for a free line. */
export function ReceiptCostTag({ price, unitCode, pending }: { price: PriceDraft; unitCode: string; pending?: boolean }) {
  if (pending ?? price.isFreeOfCharge) return <span className="dp-tag dp-tag-warn">fatura gelince</span>;
  // A free line whose invoice is posted: its cost came from the invoice.
  if (price.isFreeOfCharge) return <span className="dp-tag dp-tag-ok">faturadan</span>;
  const unitPrice = parseCell(price.unitPrice);
  if (unitPrice === null) return <span className="dp-dash">—</span>;
  const net = unitPrice * (1 - (parseCell(price.discountPercent) ?? 0) / 100);
  return <span className="dp-tag dp-tag-ok">{`${formatPrice(net)} / ${unitCode}`}</span>;
}
