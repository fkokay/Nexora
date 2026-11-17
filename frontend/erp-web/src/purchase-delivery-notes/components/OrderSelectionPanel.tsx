import { RefreshCw } from "lucide-react";
import { RecordFormGroup } from "../../record-form/RecordForm";
import { deliveryNotePageSize, type OrderSummary } from "../types";

/**
 * Sipariş bağlamı of the delivery note create view: order search (Enter or Ara; it must not save the note, so it is
 * not a form of its own inside the note form), the order choice and the order pages.
 */
export function OrderSelectionPanel({
  orders,
  orderId,
  query,
  page,
  total,
  loading,
  onQueryChange,
  onSearch,
  onSelect,
  onRefresh,
  onPageChange,
}: {
  orders: OrderSummary[];
  orderId: string;
  query: string;
  page: number;
  total: number;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <RecordFormGroup
      title="Satın alma siparişi"
      hint="İrsaliye siparişe bağlanır; mal kabul stok girişinin tek kaynağıdır."
      bodyClassName="rf-identity doc-form-fields purchase-note-order-fields"
    >
      <label className="rf-span-2">
        Satın alma siparişlerinde ara
        <span className="purchase-note-order-search">
          <input
            aria-label="Satın alma siparişlerinde ara"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Enter searches the orders; it must not submit (save) the note.
              event.preventDefault();
              if (!loading) onSearch();
            }}
            placeholder="Sipariş no veya tedarikçi ara"
          />
          <button type="button" className="secondary" disabled={loading} onClick={onSearch}>
            {loading ? "Yükleniyor…" : "Ara"}
          </button>
          <button type="button" className="secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" /> Yenile
          </button>
        </span>
      </label>
      <label className="rf-span-2">
        Sipariş
        <select value={orderId} onChange={(event) => onSelect(event.target.value)}>
          <option value="">İrsaliye kaydedilebilir sipariş seçin</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.code} · {order.supplierName} · {order.status}
            </option>
          ))}
        </select>
      </label>
      <div className="table-pagination purchase-note-order-pages">
        <span>
          {total === 0
            ? "0 sipariş"
            : `${(page - 1) * deliveryNotePageSize + 1}–${Math.min(page * deliveryNotePageSize, total)} / ${total} sipariş`}
        </span>
        <div>
          <button
            type="button"
            className="secondary"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Önceki
          </button>
          <button
            type="button"
            className="secondary"
            disabled={loading || page * deliveryNotePageSize >= total}
            onClick={() => onPageChange(page + 1)}
          >
            Sonraki
          </button>
        </div>
      </div>
    </RecordFormGroup>
  );
}
