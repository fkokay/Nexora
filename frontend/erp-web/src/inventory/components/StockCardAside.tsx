import { useEffect, useState } from "react";
import { api } from "../../erpApi";
import type { AuditEventPage, InventoryBalance } from "../../erp-types";
import { RecordFormGroup } from "../../record-form/RecordForm";
import { stockLevel } from "./InventoryStockGrid";

const quantity = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
const money = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AUDIT_VERBS: Record<string, string> = {
  "stock-item.created": "kartı oluşturdu",
  "stock-item.updated": "kartı güncelledi",
  "stock-item.deactivated": "kartı devre dışı bıraktı",
  "stock-item.activated": "kartı etkinleştirdi",
  "stock-item.bulk-imported": "kartı içe aktardı",
};

/** Header image box of the card: the saved product image, else (or when it fails to load) the "Görsel" placeholder. */
export function StockCardImage({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <span className="inv-card-image-empty">Görsel</span>;
  return <img src={url} alt="" onError={() => setFailed(true)} />;
}

type HistoryLine ={ id: number; who: string; what: string; when: string };

/**
 * The card's own audit events (who changed it, when). The endpoint is TenantAdmin-only and searches by substring,
 * so only events whose resource is exactly this code and whose action is a stock-card action are kept.
 */
function useStockCardHistory(token: string, code: string, enabled: boolean): HistoryLine[] | null {
  const [lines, setLines] = useState<HistoryLine[] | null>(null);
  useEffect(() => {
    setLines(null);
    if (!enabled || !code) return;
    let cancelled = false;
    const params = new URLSearchParams({ page: "1", pageSize: "20", q: code });
    api<AuditEventPage>(`/api/audit-events?${params}`, token)
      .then((page) => {
        if (cancelled) return;
        setLines(
          (page?.items ?? [])
            .filter((event) => event.resource === code && event.action.startsWith("stock-item."))
            .slice(0, 5)
            .map((event) => ({
              id: event.id,
              who: event.userDisplayName || "Sistem",
              what: AUDIT_VERBS[event.action] ?? event.action,
              when: new Date(event.occurredAt).toLocaleDateString("tr-TR"),
            })),
        );
      })
      // History is optional context: a failure leaves the card out and never reaches the form's error.
      .catch(() => {
        if (!cancelled) setLines(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, code, enabled]);
  return lines;
}

/**
 * Context panel of an open stock card (mockup 01, record part): "Stok durumu" from the list row the card was opened
 * from, and "Geçmiş" from the audit log for TenantAdmin. Not drawn (no endpoint today): "Açık belgeler" and the
 * stock trend chart.
 */
export function StockCardAside({
  token,
  role,
  code,
  balance,
  scope,
}: {
  token: string;
  role: string;
  code: string;
  balance: InventoryBalance | undefined;
  /** Where the balance comes from: the list's warehouse filter. */
  scope: string;
}) {
  const history = useStockCardHistory(token, code, role === "TenantAdmin");
  const valued = balance ? balance.quantityOnHand - balance.unvaluedQuantity : 0;
  const unitCost = balance && valued > 0 ? balance.valuationAmountBase / valued : null;
  const short = balance ? stockLevel(balance).shortage > 0 : false;
  return (
    <>
      {balance && (
        <RecordFormGroup title="Stok durumu" hint={scope}>
          <div className="inv-card-tiles">
            <div>
              <small>Bakiye</small>
              <b>{`${quantity(balance.quantityOnHand)} ${balance.unitCode}`}</b>
            </div>
            <div>
              <small>Kullanılabilir</small>
              <b className={short ? "inventory-stock-low" : undefined}>{`${quantity(balance.availableQuantity)} ${balance.unitCode}`}</b>
            </div>
            <div title="Stok değeri / maliyetli miktar">
              <small>Birim maliyet</small>
              <b>{unitCost == null ? "—" : `${money(unitCost)} ${balance.baseCurrencyCode}`}</b>
            </div>
            <div>
              <small>Stok değeri</small>
              <b>{`${money(balance.valuationAmountBase)} ${balance.baseCurrencyCode}`}</b>
            </div>
          </div>
        </RecordFormGroup>
      )}
      {history && history.length > 0 && (
        <RecordFormGroup title="Geçmiş" hint="denetim kaydı">
          <ol className="inv-card-history">
            {history.map((line) => (
              <li key={line.id}>
                <span>{line.who}</span> <span>{line.what}</span> <small>{`· ${line.when}`}</small>
              </li>
            ))}
          </ol>
        </RecordFormGroup>
      )}
    </>
  );
}
