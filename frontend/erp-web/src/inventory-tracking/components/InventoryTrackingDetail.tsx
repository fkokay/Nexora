import { ShieldCheck } from "lucide-react";
import type { Balance } from "../types";

type Props = { balance: Balance | null };

export default function InventoryTrackingDetail({ balance }: Props) {
  return (
    <aside
      className="inventory-record-detail"
      aria-label="Seçili iz kaydı ayrıntısı"
    >
      {balance ? (
        <>
          <header className="list-v2-detail-head">
            <div>
              <span className="list-v2-kind">
                {balance.trackingMode === "Lot" ? "Lot" : "Seri"}
              </span>
              <h2>{balance.trackingCode}</h2>
            </div>
          </header>
          <div className="list-v2-detail-meta">
            <span>{balance.stockItemName}</span>
            <span className="list-v2-detail-code">{balance.stockItemCode}</span>
          </div>
          <dl className="list-v2-facts">
            <div>
              <dt>Mevcut miktar</dt>
              <dd>
                {balance.quantityOnHand.toLocaleString("tr-TR", {
                  maximumFractionDigits: 4,
                })}{" "}
                {balance.unitCode}
              </dd>
            </div>
            <div>
              <dt>Depo</dt>
              <dd>
                {balance.warehouseCode} · {balance.warehouseName}
              </dd>
            </div>
            <div>
              <dt>Son kullanma</dt>
              <dd>
                {balance.expiryDate
                  ? new Date(
                      balance.expiryDate + "T00:00:00",
                    ).toLocaleDateString("tr-TR")
                  : "Belirtilmemiş"}
              </dd>
            </div>
            <div>
              <dt>Son hareket</dt>
              <dd>
                {new Date(
                  balance.lastMovementDate + "T00:00:00",
                ).toLocaleDateString("tr-TR")}
              </dd>
            </div>
          </dl>
          <p className="inventory-detail-note">
            <ShieldCheck size={14} aria-hidden="true" />
            Bu ekran salt okunurdur. Stok hareketleri ilgili stok ve ambar
            ekranından yönetilir.
          </p>
        </>
      ) : (
        <div className="inventory-detail-empty">
          Bir lot veya seri seçin; ayrıntıları burada görün.
        </div>
      )}
    </aside>
  );
}
