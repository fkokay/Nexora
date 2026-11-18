import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import type { BuiltInScreenLayoutField } from "../../erp-types";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "../../commands/gridCommands";
import type { PageCommands } from "../../commands/types";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { ListSummaryCards, type SummaryCard } from "../../list-page/ListSummaryCards";
import { ListFooter } from "../../list-page/ListFooter";
import { StatusTag } from "../../list-page/StatusTag";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesListPanelToggle,
  SalesPanelFacts,
} from "../../sales/components/SalesListDetailPanel";
import { useStockDetailPanelOpen } from "../../inventory/components/InventoryStockDetailPanel";
import "../../sales/sales-list-v2.css";
import { isApproved, type PlanScreenField, type PlanSummary } from "../types";

type Props = {
  /** The list is the visible screen (no plan or editor over it). */
  active: boolean;
  plans: PlanSummary[];
  /** "" (all), "Draft" or "Approved"; narrows the listed plans. */
  statusFilter?: string;
  onStatusFilterChange: (value: string) => void;
  /** The tenant's `direct-cash-budgets` screen view (columns, labels, order; `actions` labels the open link). */
  fields: PlanScreenField[];
  loading: boolean;
  busy: boolean;
  admin: boolean;
  onOpen: (plan: PlanSummary) => void;
  onNew: () => void;
  onRefresh: () => void;
};

const NUMBER_FIELDS = new Set(["fiscalYear", "lineCount", "revision"]);
const WIDTHS: Record<string, number> = { name: 300, fiscalYear: 100, currencyCode: 100, status: 110, lineCount: 90, revision: 90 };

/**
 * Doğrudan nakit bütçesi (list type A, mockup 09 map; same frame as Bütçe Planlama): an "Onay bekleyen" card that
 * filters drafts, status chips, the plan list and its footer. A click makes a plan current; a double click / Enter /
 * Aç / the name opens it. Yeni starts a draft (firma yöneticisi). Columns follow the tenant screen view.
 */
export default function DirectCashBudgetPlanList({
  active,
  plans,
  statusFilter = "",
  onStatusFilterChange,
  fields,
  loading,
  busy,
  admin,
  onOpen,
  onNew,
  onRefresh,
}: Props) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const panel = useStockDetailPanelOpen(active, rootRef);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const openLabel = fields.find((field) => field.key === "actions")?.label ?? "Aç";
  const columns: BuiltInScreenLayoutField[] = fields
    .filter((field) => field.visible && field.key !== "actions")
    .sort((a, b) => a.position - b.position)
    .map((field) => ({ ...field, fixed: field.fixed ?? false }));
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
      hint: <span>{`${plans.length.toLocaleString("tr-TR")} nakit bütçesi`}</span>,
      filterActive: statusFilter === "Draft",
      onFilter: () => onStatusFilterChange(statusFilter === "Draft" ? "" : "Draft"),
    },
  ];
  const commands: PageCommands = {
    new: admin
      ? { primary: true, disabledReason: busy ? "İşlem sürüyor…" : undefined, run: onNew }
      : { disabledReason: "Nakit bütçesi taslağını yalnız firma yöneticisi oluşturur" },
    open: {
      disabledReason: current ? (busy ? "İşlem sürüyor…" : undefined) : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? current?.id;
        const plan = visible.find((row) => row.id === id);
        if (plan) onOpen(plan);
      },
    },
    delete: { disabledReason: "Nakit bütçesi silinemez" },
    more: [csvExportCommand(gridExportRef)],
  };

  const renderCell = (field: BuiltInScreenLayoutField, plan: PlanSummary) => {
    switch (field.key) {
      case "name":
        return (
          <button
            type="button"
            className="erp-link-button"
            aria-label={`${openLabel}: ${plan.name}`}
            disabled={busy}
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
      case "status":
        return <StatusTag tone={isApproved(plan.status) ? "ok" : "warn"}>{isApproved(plan.status) ? "Onaylı" : "Taslak"}</StatusTag>;
      case "lineCount":
        return plan.lineCount.toLocaleString("tr-TR");
      case "revision":
        return String(plan.revision);
      default:
        return null;
    }
  };

  // Right panel of the current plan: the list row's own fields (no extra request).
  const listPanel =
    panel.open && active ? (
      current ? (
        <SalesListDetailPanel
          label="Nakit bütçesi özeti"
          code={String(current.fiscalYear)}
          title={current.name}
          tags={
            <>
              <StatusTag tone={isApproved(current.status) ? "ok" : "warn"}>{isApproved(current.status) ? "Onaylı" : "Taslak"}</StatusTag>
              <StatusTag tone="off">{current.currencyCode}</StatusTag>
            </>
          }
          tabs={[{ id: "summary", label: "Özet" }]}
          tab="summary"
          onTabChange={() => {}}
          onOpen={() => onOpen(current)}
          openDisabled={busy}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        >
          <SalesPanelFacts
            items={[
              { label: "Mali yıl", value: String(current.fiscalYear) },
              { label: "Satır", value: current.lineCount.toLocaleString("tr-TR") },
              { label: "Revizyon", value: String(current.revision) },
              { label: "Oluşturulma", value: new Date(current.createdAt).toLocaleDateString("tr-TR") },
              ...(current.approvedAt ? [{ label: "Onay", value: new Date(current.approvedAt).toLocaleDateString("tr-TR") }] : []),
            ]}
          />
          <p className="sales-ld-muted">Aylık giriş ve çıkışlar için Aç (Enter).</p>
        </SalesListDetailPanel>
      ) : (
        <SalesListDetailEmpty label="Nakit bütçesi özeti" text="Özetini görmek için listeden bir plan seçin." />
      )
    ) : null;

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
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </ListToolbar>
      <div ref={rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list fin-cash-budget-list">
          <SalesDocumentGrid
            gridId="studio-finance-direct-cash-budgets-v2"
            hideExport
            exportActionsRef={gridExportRef}
            fields={columns}
            items={visible}
            loading={loading}
            loadingMessage="Nakit bütçeleri yükleniyor…"
            emptyMessage={
              plans.length === 0
                ? admin
                  ? "Henüz plan yok. Bir taslak oluşturarak başlayın."
                  : "Henüz plan yok. Firma yöneticisi bir nakit bütçesi oluşturduğunda burada görünür."
                : "Bu durumda nakit bütçesi yok."
            }
            search=""
            searchEmptyMessage=""
            toolbarContainer={toolsSlot}
            renderCell={renderCell}
            ariaLabel="Nakit bütçesi planları"
            columnWidths={WIDTHS}
            numberFields={NUMBER_FIELDS}
            selection={{
              currentId,
              onCurrentChange: setCurrentId,
              onTickedChange: setTicked,
              // The ticks narrow the grid's export (Excel / CSV write the ticked rows).
              bulkActions: active
                ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }]
                : undefined,
              onOpen: (id) => {
                const plan = visible.find((row) => row.id === id);
                if (plan && !busy) onOpen(plan);
              },
            }}
            footer={
              <ListFooter hints="↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç · Ctrl+. detay paneli">
                {ticked.length > 0 && (
                  <span>
                    <span>{ticked.length}</span> <span>seçili</span>
                  </span>
                )}
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
        {listPanel}
      </div>
    </>
  );
}
