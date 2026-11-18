import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { StatusTag } from "../../list-page/StatusTag";
import {
  SalesPanelFacts,
  SalesPanelRows,
  SalesPanelSection,
  SalesPanelStats,
} from "../../sales/components/SalesListDetailPanel";
import {
  amountText,
  displayDate,
  orderActualOperationCost,
  orderNextStep,
  orderPlannedCost,
  orderStatusTag,
  orderStepLabel,
  type OrderStep,
} from "../orderList";
import type { ManufacturingOrder } from "../types";
import "../../sales/sales-list-v2.css";

/** Below this width the open panel is a drawer over the list (sales-list-v2.css). */
const DRAWER_QUERY = "(max-width: 1099px)";
const isDrawer = () => typeof window.matchMedia === "function" && window.matchMedia(DRAWER_QUERY).matches;

const TABS = [
  { id: "summary", label: "Özet" },
  { id: "route", label: "Rota" },
  { id: "components", label: "Bileşenler" },
];

const quantity = (value: number, digits = 4) => value.toLocaleString("tr-TR", { maximumFractionDigits: digits });

export type ManufacturingOrderPanelHandle = { focus: () => void };

type Props = {
  order: ManufacturingOrder;
  /** "RC-014 · Domates salçası 830 g" (the recipe code joined from the recipe list). */
  recipeTitle: string;
  /** Unit of the finished product, from the recipe and stock lists ("" when unknown). */
  unitCode: string;
  busy: boolean;
  onStep: (step: OrderStep) => void;
  /** Operations with their start / complete actions and the actual-time entry (owned by the page). */
  route: ReactNode;
  onClose: () => void;
  /** True when the panel was just opened explicitly; the drawer then takes the focus. */
  takeFocus: () => boolean;
};

/**
 * Right-hand panel of the Üretim emirleri list (mockup 10 "Detay paneli"): summary, route and components from the
 * list answer (no extra request). An order has no document screen, so Aç / Enter bring the user here; the next
 * workflow step is offered in Özet, all steps are in İşlemler.
 */
export const ManufacturingOrderPanel = forwardRef<ManufacturingOrderPanelHandle, Props>(function ManufacturingOrderPanel(
  { order, recipeTitle, unitCode, busy, onStep, route, onClose, takeFocus },
  ref,
) {
  const rootRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState("summary");
  const returnFocus = useRef<HTMLElement | null>(null);
  useImperativeHandle(ref, () => ({
    focus: () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      rootRef.current?.focus();
    },
  }));
  useEffect(() => {
    if (!takeFocus() || !isDrawer()) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus();
  }, []);
  const tag = orderStatusTag(order.status);
  const step = orderNextStep(order);
  const actualCost = orderActualOperationCost(order);
  const unit = unitCode ? ` ${unitCode}` : "";
  return (
    <aside
      ref={rootRef}
      className="sales-ld mfg-ld"
      aria-label="Üretim emri özeti"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // Esc returns to the list; as a drawer it also closes the panel.
        event.preventDefault();
        event.stopPropagation();
        returnFocus.current?.focus();
        if (isDrawer()) onClose();
      }}
    >
      <div className="sales-ld-head">
        <div className="sales-ld-top">
          <span className="nx-code">{order.code}</span>
          <span className="sales-ld-actions">
            <button
              type="button"
              className="sales-ld-close"
              aria-label="Detay panelini kapat"
              title="Detay panelini kapat (Ctrl+.)"
              onClick={onClose}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </span>
        </div>
        <h3 title={order.billOfMaterialName}>{recipeTitle}</h3>
        <div className="sales-ld-labels">
          <StatusTag tone={tag.tone}>{tag.label}</StatusTag>
          <StatusTag tone="off">{order.sourceSalesOrderCode ? "Siparişe özel" : "Stoka üretim"}</StatusTag>
        </div>
      </div>
      <div className="sales-ld-tabs" role="tablist" aria-label="Üretim emri özeti">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "is-active" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="sales-ld-body" role="tabpanel">
        {tab === "summary" && (
          <>
            <SalesPanelStats
              items={[
                { label: "Planlanan miktar", value: `${quantity(order.plannedQuantity)}${unit}` },
                {
                  label: "İyi / fire",
                  value:
                    order.actualGoodQuantity === null
                      ? "—"
                      : `${quantity(order.actualGoodQuantity)} / ${quantity(order.scrapQuantity ?? 0)}`,
                },
                { label: "Planlanan maliyet", value: amountText(orderPlannedCost(order)) },
                { label: "Fiili işlem maliyeti", value: actualCost === null ? "—" : amountText(actualCost) },
              ]}
            />
            {step && (
              <div className="mfg-ld-next">
                <span>Sıradaki adım</span>
                <button type="button" className="primary" disabled={busy} onClick={() => onStep(step)}>
                  {orderStepLabel[step]}
                </button>
              </div>
            )}
            <SalesPanelFacts
              items={[
                { label: "Plan tarihi", value: displayDate(order.plannedDate) },
                { label: "Depo", value: order.warehouseName },
                {
                  label: "Üretim türü",
                  value: order.sourceSalesOrderCode
                    ? `${order.sourceSalesOrderCode} · satır ${order.sourceSalesOrderLineNumber}`
                    : "Stoka üretim",
                },
                ...(order.scrapReason ? [{ label: "Fire nedeni", value: order.scrapReason }] : []),
                ...(order.completedAt ? [{ label: "Tamamlanma", value: displayDate(order.completedAt) }] : []),
              ]}
            />
            <p className="sales-ld-muted mfg-ld-note">Tutarlar firma baz para birimindedir.</p>
          </>
        )}
        {tab === "route" && (
          <SalesPanelSection title="Operasyonlar">
            {route}
          </SalesPanelSection>
        )}
        {tab === "components" && (
          <SalesPanelSection title="Bileşenler">
            <SalesPanelRows
              empty="Bu emirde bileşen satırı yok."
              rows={order.lines.map((line) => ({
                key: line.componentStockItemId,
                label: line.componentName,
                meta: <span className="nx-code">{line.componentCode}</span>,
                value: quantity(line.requiredQuantity),
              }))}
            />
            {order.lines.length > 0 && (
              <p className="sales-ld-muted mfg-ld-note">
                <span>Planlanan malzeme</span>{" "}
                <span>{amountText(order.lines.reduce((sum, line) => sum + line.plannedCostBase, 0))}</span>
              </p>
            )}
          </SalesPanelSection>
        )}
      </div>
    </aside>
  );
});
