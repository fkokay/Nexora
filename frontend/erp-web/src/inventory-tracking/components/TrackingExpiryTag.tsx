import { StatusTag } from "../../list-page/StatusTag";

/** Expiry warning of a lot: expired (bad) or within the near-expiry window (warn). */
export function TrackingExpiryTag({ state }: { state: "expired" | "soon" }) {
  return state === "expired" ? (
    <StatusTag tone="bad">Süresi geçti</StatusTag>
  ) : (
    <StatusTag tone="warn">Süresi yaklaşıyor</StatusTag>
  );
}

/**
 * Expiry cell of the lot / serial list: the date and, when due, its warning tag. The grid reads a cell's text from
 * its elements' `children`, else `value`; this element has no children, so export, sort and filter see `value` (the
 * date) without the tag.
 */
export function TrackingExpiryCell({ value, state }: { value: string; state: "expired" | "soon" | null }) {
  return (
    <>
      <span className="inventory-tracking-expiry">{value}</span>
      {state && <TrackingExpiryTag state={state} />}
    </>
  );
}
