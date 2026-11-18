import { useState, type MutableRefObject } from "react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import { CalendarClock } from "lucide-react";
import type { BuiltInScreenLayoutField } from "../../erp-types";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { ListSummaryCards } from "../../list-page/ListSummaryCards";
import { ListFooter } from "../../list-page/ListFooter";
import { StatusTag } from "../../list-page/StatusTag";
import { formatAmount, formatDate } from "../../document-detail/DocumentDetailLayout";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import "../../sales/sales-list-v2.css";
import { drawnShare, facilityTypeLabel } from "./CreditFacilityDetail";
import type { CurrencySummary, Facility } from "../types";

type Props = {
  facilities: Facility[];
  visibleFacilities: Facility[];
  currentId: string | null;
  onCurrentChange: (id: string | null) => void;
  onOpen: (facility: Facility) => void;
  /** The grid's export functions (İşlemler › CSV). */
  exportActionsRef: MutableRefObject<GridExportActions | null>;
  loading: boolean;
  admin: boolean;
  busy: boolean;
  search: string;
  statusFilter: string;
  currencyFilter: string;
  currencies: string[];
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onRefresh: () => void;
  /** One row per currency (narrowed by the currency chip); amounts are never summed across currencies. */
  summaries: CurrencySummary[];
  /** Facilities behind the summaries; their planned instalments feed the 30-day card. */
  tileFacilities: Facility[];
  today: string;
  /** today + 30 days, yyyy-mm-dd. */
  horizon: string;
};

const FIELDS: BuiltInScreenLayoutField[] = [
  { key: "code", label: "Kredi", visible: true, position: 0 },
  { key: "facilityType", label: "Tür", visible: true, position: 1 },
  { key: "currencyCode", label: "Para birimi", visible: true, position: 2 },
  { key: "approvedLimit", label: "Onaylı limit", visible: true, position: 3 },
  { key: "totalDrawdown", label: "Kullandırım", visible: true, position: 4 },
  { key: "usage", label: "Kullanım", visible: true, position: 5 },
  { key: "outstandingPrincipal", label: "Açık anapara", visible: true, position: 6 },
  { key: "openScheduleCount", label: "Açık taksit", visible: true, position: 7 },
  { key: "maturityDate", label: "Vade", visible: true, position: 8 },
  { key: "status", label: "Durum", visible: true, position: 9 },
];
const NUMBER_FIELDS = new Set(["approvedLimit", "totalDrawdown", "usage", "outstandingPrincipal", "openScheduleCount"]);
const WIDTHS: Record<string, number> = {
  code: 200,
  facilityType: 90,
  currencyCode: 80,
  approvedLimit: 125,
  totalDrawdown: 125,
  usage: 90,
  outstandingPrincipal: 125,
  openScheduleCount: 90,
  maturityDate: 95,
  status: 90,
};

const percent = (value: number) => `%${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

/**
 * Krediler & Finansman (list type A, mockup 09 map): a warning card for instalments due within 30 days, search with
 * status and currency chips, the credit grid and its footer (shown count and the per-currency limit line). A click
 * makes a credit current (İşlemler act on it); a double click / Enter / Aç / the code opens the credit.
 */
export function CreditFacilityList(props: Props) {
  const { facilities, visibleFacilities, loading, admin, busy, summaries } = props;
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const dueSoon = new Map<string, number>();
  let dueSoonCount = 0;
  let overdue = 0;
  for (const facility of props.tileFacilities) {
    for (const item of facility.schedule) {
      if (item.status !== "Planned") continue;
      if (item.dueDate < props.today) {
        overdue += 1;
        continue;
      }
      if (item.dueDate > props.horizon) continue;
      dueSoonCount += 1;
      dueSoon.set(
        facility.currencyCode,
        (dueSoon.get(facility.currencyCode) ?? 0) + item.principalAmount + item.interestAmount + item.feeAmount,
      );
    }
  }
  const active = facilities.filter((facility) => facility.status === "Active").length;

  const renderCell = (field: BuiltInScreenLayoutField, f: Facility) => {
    switch (field.key) {
      case "code":
        return (
          <>
            <button
              type="button"
              className="erp-link-button nx-code"
              aria-label={`Aç: ${f.code}`}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                props.onOpen(f);
              }}
            >
              {f.code}
            </button>
            <small className="cell-subtitle list-v2-name-code">{f.lenderName}</small>
          </>
        );
      case "facilityType":
        return facilityTypeLabel(f.facilityType);
      case "currencyCode":
        return f.currencyCode;
      case "approvedLimit":
        return formatAmount(f.approvedLimit);
      case "totalDrawdown":
        return formatAmount(f.totalDrawdown);
      case "usage":
        return percent(drawnShare(f));
      case "outstandingPrincipal":
        return formatAmount(f.outstandingPrincipal);
      case "openScheduleCount":
        return f.openScheduleCount.toLocaleString("tr-TR");
      case "maturityDate":
        return f.maturityDate ? formatDate(f.maturityDate) : "—";
      case "status":
        return <StatusTag tone={f.status === "Active" ? "ok" : "off"}>{f.status === "Active" ? "Aktif" : "Kapalı"}</StatusTag>;
      default:
        return null;
    }
  };

  return (
    <>
      <ListSummaryCards
        cards={[
          {
            id: "due-soon",
            label: "30 gün içinde taksit",
            value: loading
              ? "—"
              : dueSoon.size === 0
                ? "—"
                : (
                    <span className="cf-card-lines">
                      {[...dueSoon.entries()].map(([code, total]) => (
                        <span key={code}>{formatAmount(total, code)}</span>
                      ))}
                    </span>
                  ),
            icon: CalendarClock,
            tone: dueSoonCount > 0 || overdue > 0 ? "warn" : "primary",
            hint: (
              <span>
                {`${dueSoonCount} taksit`}
                {overdue > 0 && <span className="cf-overdue">{` · ${overdue} gecikmiş`}</span>}
              </span>
            ),
          },
        ]}
      />
      <ListToolbar
        search={props.search}
        onSearchChange={props.onSearchChange}
        onSearchApply={() => {}}
        searchLabel="Kod, kurum, tür veya notta ara"
        searchPlaceholder="Kod, kurum veya tür"
        toolsSlotRef={setToolsSlot}
        onRefresh={props.onRefresh}
      >
        <ListChipGroup
          label="Durum"
          value={props.statusFilter === "All" ? "" : props.statusFilter}
          allowClear
          onChange={(value) => props.onStatusChange(value || "All")}
          options={[
            { value: "Active", label: "Aktif", count: active },
            { value: "Closed", label: "Kapalı", count: facilities.length - active },
          ]}
        />
        {props.currencies.length > 1 && (
          <ListChipGroup
            label="Para birimi"
            value={props.currencyFilter === "All" ? "" : props.currencyFilter}
            allowClear
            onChange={(value) => props.onCurrencyChange(value || "All")}
            options={props.currencies.map((code) => ({ value: code, label: code }))}
          />
        )}
      </ListToolbar>
      <div className="sales-list-body">
        <section className="list-v2-list cf-list">
          <SalesDocumentGrid
            gridId="studio-finance-credit-facilities-v1"
            hideExport
            exportActionsRef={props.exportActionsRef}
            fields={FIELDS}
            items={visibleFacilities}
            loading={loading}
            loadingMessage="Kayıtlar yükleniyor…"
            emptyMessage={
              facilities.length === 0
                ? admin
                  ? "Henüz kredi veya finansman kaydı yok. İlk kaydı Yeni ile oluşturabilirsiniz."
                  : "Henüz kredi veya finansman kaydı yok."
                : "Filtrelerle eşleşen kayıt bulunamadı."
            }
            search=""
            searchEmptyMessage=""
            toolbarContainer={toolsSlot}
            renderCell={renderCell}
            ariaLabel="Krediler"
            columnWidths={WIDTHS}
            numberFields={NUMBER_FIELDS}
            selection={{
              currentId: props.currentId,
              onCurrentChange: props.onCurrentChange,
              onTickedChange: noTicks,
              onOpen: (id) => {
                const facility = visibleFacilities.find((row) => row.id === id);
                if (facility && !busy) props.onOpen(facility);
              },
            }}
            footer={
              <ListFooter hints="↑↓ gez · Enter aç · Çift tık aç">
                {summaries.map((row) => (
                  <span key={row.code} className="cf-footer-currency">
                    <b>{row.code}</b> <span>Limit</span> {formatAmount(row.approved)} · <span>Kullanılan</span>{" "}
                    {formatAmount(row.drawdown)} · <span>Açık anapara</span> {formatAmount(row.outstanding)}
                  </span>
                ))}
                <span>
                  <span>Gösterilen</span>{" "}
                  <span>
                    {visibleFacilities.length.toLocaleString("tr-TR")} / {facilities.length.toLocaleString("tr-TR")}
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

const noTicks = () => {};
