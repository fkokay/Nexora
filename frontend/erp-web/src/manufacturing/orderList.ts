import type { StatusTagTone } from "../list-page/StatusTag";
import type { ManufacturingOrder } from "./types";

export const orderStatusLabel: Record<string, string> = {
  Planned: "Planlandı",
  Released: "Serbest bırakıldı",
  Completed: "Tamamlandı",
  Cancelled: "İptal edildi",
};

/** Mockup 10 "Durum etiketi": Planlandı blue, Serbest bırakıldı orange, Tamamlandı green, İptal edildi grey. */
export function orderStatusTag(status: string): { tone: StatusTagTone; label: string } {
  const tone: StatusTagTone =
    status === "Planned" ? "info" : status === "Released" ? "warn" : status === "Completed" ? "ok" : "off";
  return { tone, label: orderStatusLabel[status] ?? status };
}

/** A planned order whose route has an operation without a capacity slot ("Kapasiteye çizelgele" is its next step). */
export const orderNeedsScheduling = (order: ManufacturingOrder) =>
  order.status === "Planned" &&
  order.operations.length > 0 &&
  order.operations.some((operation) => !operation.scheduledStartDate);

/** "Serbest bırak": planned, and every operation (if any) has a capacity slot. */
export const orderCanRelease = (order: ManufacturingOrder) =>
  order.status === "Planned" && order.operations.every((operation) => !!operation.scheduledStartDate);

/** "Üretimi tamamla": released and every operation completed. */
export const orderCanComplete = (order: ManufacturingOrder) =>
  order.status === "Released" && order.operations.every((operation) => operation.status === "Completed");

/** "İptal et": planned or released. */
export const orderCanCancel = (order: ManufacturingOrder) => order.status === "Planned" || order.status === "Released";

export type OrderStep = "schedule" | "release" | "complete";

/** The order's next workflow step (the detail panel's suggestion; the same steps are in İşlemler). */
export function orderNextStep(order: ManufacturingOrder): OrderStep | null {
  if (orderNeedsScheduling(order)) return "schedule";
  if (orderCanRelease(order)) return "release";
  if (orderCanComplete(order)) return "complete";
  return null;
}

export const orderStepLabel: Record<OrderStep, string> = {
  schedule: "Kapasiteye çizelgele",
  release: "Serbest bırak",
  complete: "Üretimi tamamla",
};

/** Planned cost of an order in the tenant base currency: component lines plus route operations. */
export const orderPlannedCost = (order: ManufacturingOrder) =>
  order.lines.reduce((sum, line) => sum + line.plannedCostBase, 0) +
  order.operations.reduce((sum, operation) => sum + operation.plannedCostBase, 0);

/** Actual operation cost (completed operations only); null while no operation is completed. */
export function orderActualOperationCost(order: ManufacturingOrder): number | null {
  const done = order.operations.filter((operation) => operation.status === "Completed");
  if (!done.length) return null;
  return done.reduce((sum, operation) => sum + (operation.actualCostBase ?? 0), 0);
}

/** "dd.MM.yyyy" from an ISO date ("2026-11-18" or a timestamp). */
export const displayDate = (value: string | null | undefined) =>
  value ? value.slice(0, 10).split("-").reverse().join(".") : "—";

/** Figures of the loaded page for the summary cards ("bu sayfa"); cancelled orders carry no planned cost. */
export function orderPageFigures(orders: ManufacturingOrder[]) {
  const costed = orders.filter((order) => order.status !== "Cancelled");
  return {
    plannedCost: costed.reduce((sum, order) => sum + orderPlannedCost(order), 0),
    costedCount: costed.length,
    unscheduled: orders.filter(orderNeedsScheduling).length,
    completed: orders.filter((order) => order.status === "Completed").length,
  };
}

export const amountText = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
