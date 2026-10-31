type Props = { warehouseError: string; error: string; loading: boolean; onRetry: () => void }

export default function InventoryTrackingAlerts({ warehouseError, error, loading, onRetry }: Props) {
  return <>
    {warehouseError && <div className="alert inline-alert" role="alert">Depo listesi yüklenemedi: {warehouseError}</div>}
    {error && <div className="alert inline-alert inventory-tracking-error" role="alert"><span>Lot / seri bakiyeleri yüklenemedi: {error}</span><button className="secondary" type="button" onClick={onRetry} disabled={loading}>Yeniden dene</button></div>}
  </>
}
