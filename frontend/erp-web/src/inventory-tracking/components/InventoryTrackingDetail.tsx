import { ShieldCheck } from "lucide-react";
import { StatusTag } from "../../list-page/StatusTag";
import { expiryState, localToday } from "../../inventory/trackingExpiry";
import type { Balance } from "../types";
import { TrackingExpiryTag } from "./TrackingExpiryTag";

type Props = { balance: Balance | null };

const date = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("tr-TR");

/** Right-hand summary of the current lot / serial row (Stok Kartları detail panel look). Read-only. */
export default function InventoryTrackingDetail({ balance }: Props) {
  if (!balance)
    return (
      <aside className="inventory-stock-detail is-empty" aria-label="Seçili iz kaydı ayrıntısı">
        <p>Bir lot veya seri seçin; ayrıntıları burada görün.</p>
      </aside>
    );
  const expiry = expiryState(balance.expiryDate, localToday());
  return (
    <aside className="inventory-stock-detail" aria-label="Seçili iz kaydı ayrıntısı">
      <div className="inventory-stock-detail-head">
        <div className="inventory-stock-detail-top">
          <span className="nx-code">{balance.stockItemCode}</span>
        </div>
        <h3>{balance.trackingCode}</h3>
        <div className="inventory-stock-detail-labels">
          <StatusTag tone={balance.trackingMode === "Lot" ? "info" : "off"}>{balance.trackingMode === "Lot" ? "Lot" : "Seri"}</StatusTag>
          {expiry && <TrackingExpiryTag state={expiry} />}
        </div>
      </div>
      <div className="inventory-stock-detail-body">
        <div className="inventory-stock-detail-stats">
          <div>
            <small>Mevcut miktar</small>
            <b>
              {balance.quantityOnHand.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} {balance.unitCode}
            </b>
          </div>
          <div>
            <small>Son kullanma</small>
            <b className={expiry === "expired" ? "is-low" : undefined}>
              {balance.expiryDate ? date(balance.expiryDate) : "Belirtilmemiş"}
            </b>
          </div>
        </div>
        <dl className="inventory-stock-detail-facts">
          <div>
            <dt>Stok</dt>
            <dd>{balance.stockItemName}</dd>
          </div>
          <div>
            <dt>Depo</dt>
            <dd>
              {balance.warehouseCode} · {balance.warehouseName}
            </dd>
          </div>
          <div>
            <dt>Son hareket</dt>
            <dd>{date(balance.lastMovementDate)}</dd>
          </div>
        </dl>
        <p className="inventory-stock-detail-muted inventory-tracking-detail-note">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>Bu ekran salt okunurdur. Stok hareketleri ilgili stok ve ambar ekranından yönetilir.</span>
        </p>
      </div>
    </aside>
  );
}
