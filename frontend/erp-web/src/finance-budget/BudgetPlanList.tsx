import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { GridExportActions } from "../AdvancedDataGrid";
import type { BuiltInScreenLayoutField } from "../erp-types";
import { PageCommandsSlot } from "../commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "../commands/gridCommands";
import type { PageCommands } from "../commands/types";
import { ListChipGroup, ListToolbar } from "../list-page/ListToolbar";
import { ListSummaryCards, type SummaryCard } from "../list-page/ListSummaryCards";
import { ListFooter } from "../list-page/ListFooter";
import { StatusTag } from "../list-page/StatusTag";
import SalesDocumentGrid from "../sales/components/SalesDocumentGrid";
import "../sales/sales-list-v2.css";
import type { Plan } from "./types";

type Props = {
  /** The list is the visible screen (no plan or editor over it). */
  active: boolean;
  plans: Plan[];
  /** "" (all), "Draft" or "Approved"; narrows the listed plans. */
  statusFilter?: string;
  onStatusFilterChange: (value: string) => void;
  loading: boolean;
  controlsLocked: boolean;
  admin: boolean;
  baseCurrency: string;
  onOpen: (plan: Plan) => void;
  onNew: () => void;
  onRefresh: () => void;
  money: (amount: number, currency?: string) => string;
};

/** Actual as a share of the plan; null when there is nothing planned or the currencies differ. */
export function budgetUsage(plan: Plan, baseCurrency: string) {
  if (plan.plannedTotal <= 0 || plan.currencyCode !== baseCurrency) return null;
  return plan.actualTotal / plan.plannedTotal;
}

const FIELDS: BuiltInScreenLayoutField[] = [
  { key: "name", label: "Senaryo", visible: true, position: 0 },
  { key: "fiscalYear", label: "Mali yıl", visible: true, position: 1 },
  { key: "currencyCode", label: "Para birimi", visible: true, position: 2 },
  { key: "lineCount", label: "Satır", visible: true, position: 3 },
  { key: "plannedTotal", label: "Plan", visible: true, position: 4 },
  { key: "actualTotal", label: "Gerçekleşen", visible: true, position: 5 },
  { key: "usage", label: "Gerçekleşme", visible: true, position: 6 },
  { key: "status", label: "Durum", visible: true, position: 7 },
];
const NUMBER_FIELDS = new Set(["fiscalYear", "lineCount", "plannedTotal", "actualTotal", "usage"]);
const WIDTHS: Record<string, number> = { name: 260, fiscalYear: 90, currencyCode: 100, lineCount: 80, plannedTotal: 160, actualTotal: 160, usage: 110, status: 100 };

/**
 * Bütçe Planlama (list type A, mockup 09 map): an "Onay bekleyen" card that filters drafts, status chips, the scenario
 * list and its footer. A click makes a scenario current; a double click / Enter / Aç / the name opens it. Yeni starts a
 * draft (firma yöneticisi). The monthly editor and the plan view are today's components.
 */
export default function BudgetPlanList({
  active,
  plans,
  statusFilter = "",
  onStatusFilterChange,
  loading,
  controlsLocked,
  admin,
  baseCurrency,
  onOpen,
  onNew,
  onRefresh,
  money,
}: Props) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const visible = plans.filter(
    (plan) => !statusFilter || isApproved(plan.status) === (statusFilter === "Approved"),
  );
  const current = visible.find((plan) => plan.id === currentId) ?? null;
  const drafts = plans.filter((plan) => !isApproved(plan.status)).length;
  const cards: SummaryCard[] = [
    {
      id: "drafts",
      label: "Onay bekleyen",
      value: loading ? "—" : drafts.toLocaleString("tr-TR"),
      icon: AlertTriangle,
      tone: drafts > 0 ? "warn" : "primary",
      hint: <span>{`${plans.length.toLocaleString("tr-TR")} bütçe senaryosu`}</span>,
      filterActive: statusFilter === "Draft",
      onFilter: () => onStatusFilterChange(statusFilter === "Draft" ? "" : "Draft"),
    },
  ];
  const commands: PageCommands = {
    new: admin
      ? { primary: true, disabledReason: controlsLocked || !baseCurrency ? "İşlem sürüyor…" : undefined, run: onNew }
      : { disabledReason: "Bütçe taslağını yalnız firma yöneticisi oluşturur" },
    open: {
      disabledReason: current ? (controlsLocked ? "İşlem sürüyor…" : undefined) : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? current?.id;
        const plan = visible.find((row) => row.id === id);
        if (plan) onOpen(plan);
      },
    },
    delete: { disabledReason: "Bütçe senaryosu silinemez" },
    more: [csvExportCommand(gridExportRef)],
  };

  const renderCell = (field: BuiltInScreenLayoutField, plan: Plan) => {
    switch (field.key) {
      case "name":
        return (
          <button
            type="button"
            className="erp-link-button"
            aria-label={`${plan.name} bütçesini aç`}
            disabled={controlsLocked}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(plan);
            }}
          >
            {plan.name}
          </button>
        );
      case "fiscalYear":
        return String(plan.fiscalYear);
      case "currencyCode":
        return plan.currencyCode;
      case "lineCount":
        return plan.lineCount.toLocaleString("tr-TR");
      case "plannedTotal":
        return money(plan.plannedTotal, plan.currencyCode);
      case "actualTotal":
        return money(plan.actualTotal, baseCurrency || plan.currencyCode);
      case "usage": {
        const usage = budgetUsage(plan, baseCurrency);
        return usage === null ? "—" : `%${(usage * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
      }
      case "status":
        return <StatusTag tone={isApproved(plan.status) ? "ok" : "warn"}>{planStatus(plan.status)}</StatusTag>;
      default:
        return null;
    }
  };

  return (
    <>
      {active && <PageCommandsSlot commands={commands} />}
      <ListSummaryCards cards={cards} />
      <ListToolbar toolsSlotRef={setToolsSlot} onRefresh={onRefresh}>
        <ListChipGroup
          label="Durum"
          value={statusFilter}
          allowClear
          onChange={onStatusFilterChange}
          options={[
            { value: "Draft", label: "Taslak", count: drafts },
            { value: "Approved", label: "Onaylı", count: plans.length - drafts },
          ]}
        />
      </ListToolbar>
      <div ref={rootRef} className="sales-list-body">
        <section className="list-v2-list fin-budget-list">
          <SalesDocumentGrid
            gridId="studio-finance-budget-plans-v2"
            hideExport
            exportActionsRef={gridExportRef}
            fields={FIELDS}
            items={visible}
            loading={loading}
            loadingMessage="Bütçeler yükleniyor…"
            emptyMessage={plans.length === 0 ? "Henüz bütçe senaryosu yok." : "Bu durumda bütçe yok."}
            search=""
            searchEmptyMessage=""
            toolbarContainer={toolsSlot}
            renderCell={renderCell}
            ariaLabel="Bütçe senaryoları"
            columnWidths={WIDTHS}
            numberFields={NUMBER_FIELDS}
            selection={{
              currentId,
              onCurrentChange: setCurrentId,
              onTickedChange: () => {},
              onOpen: (id) => {
                const plan = visible.find((row) => row.id === id);
                if (plan && !controlsLocked) onOpen(plan);
              },
            }}
            footer={
              <ListFooter hints="↑↓ gez · Enter aç · Çift tık aç">
                <span>
                  <span>Gösterilen</span>{" "}
                  <span>
                    {visible.length.toLocaleString("tr-TR")} / {plans.length.toLocaleString("tr-TR")}
                  </span>
                </span>
              </ListFooter>
            }
          />
        </section>
      </div>
    </>
  );
}

export function isApproved(status: Plan["status"]) {
  return status === 2 || status === "Approved";
}
export function planStatus(status: Plan["status"]) {
  return isApproved(status) ? "Onaylı" : status === 1 || status === "Draft" ? "Taslak" : String(status);
}
