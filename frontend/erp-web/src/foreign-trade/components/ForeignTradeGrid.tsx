import type { MutableRefObject, ReactNode } from "react";
import { StatusTag } from "../../list-page/StatusTag";
import { tradeStatusTone } from "../tradeStatus";
import type { GridExportActions } from "../../AdvancedDataGrid";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import type { ScreenColumnPin } from "../../erp-types";
import { localizedText } from "../../locale";
import type {
  Direction,
  TradeCase,
  TradeOrder,
  TradeStatus,
} from "../types";

export type ForeignTradeScreenField = {
  key: string;
  label: string;
  visible: boolean;
  position: number;
  fixed?: boolean;
  width?: number | null;
  pinned?: ScreenColumnPin | null;
};

export const defaultForeignTradeFields: (ForeignTradeScreenField & {
  enLabel: string;
})[] = [
  { key: "reference", label: "Dosya", enLabel: "Case", visible: true, position: 0 },
  { key: "direction", label: "Yön", enLabel: "Direction", visible: false, position: 1 },
  { key: "linkedOrder", label: "Sipariş / cari", enLabel: "Order / account", visible: true, position: 2 },
  { key: "countries", label: "Rota", enLabel: "Route", visible: true, position: 3 },
  { key: "dates", label: "Sevk → varış", enLabel: "Ship → arrival", visible: true, position: 4 },
  { key: "status", label: "Durum", enLabel: "Status", visible: true, position: 5 },
  { key: "transportMode", label: "Taşıma şekli", enLabel: "Transport mode", visible: false, position: 6 },
  { key: "actions", label: "İşlem", enLabel: "Action", visible: true, position: 7, fixed: true },
];

/** Standard labels from the backend screen-view catalog (TenantScreenViewEndpoints) before the redesign. */
const legacyStandardLabels: Record<string, string> = {
  reference: "Referans",
  linkedOrder: "Bağlı sipariş",
  countries: "Ülkeler",
};

/**
 * A tenant-published layout only knows the backend catalog keys; the frontend-only
 * "dates" column is added right after the route column so published views still get it.
 */
export function withFrontendForeignTradeFields(
  fields: ForeignTradeScreenField[],
): ForeignTradeScreenField[] {
  if (fields.some((field) => field.key === "dates")) return fields;
  const route = fields.find((field) => field.key === "countries");
  const standard = defaultForeignTradeFields.find((field) => field.key === "dates")!;
  return [
    ...fields,
    {
      key: "dates",
      label: standard.label,
      visible: true,
      position: (route?.position ?? fields.length) + 0.5,
    },
  ];
}

// Intl renders day+month as "15/11" for tr in some engines; the app writes dates as "15.11".
const shortDate = (value: string | null, locale: string) => {
  if (!value) return "—";
  const [, month, day] = value.slice(0, 10).split("-");
  return locale.startsWith("en") ? `${month}/${day}` : `${day}.${month}`;
};
const fullDate = (value: string | null, locale: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString(locale) : "—";

type Props = {
  items: TradeCase[];
  caseCount: number;
  loading: boolean;
  /** Current row (click, ↑/↓); null = none. */
  selectedId: string | null;
  orderMap: Map<string, TradeOrder>;
  statusLabel: (status: TradeStatus) => string;
  directionLabel: (direction: Direction) => string;
  onSelect: (id: string | null) => void;
  /** Double click / Enter on a row. */
  onOpen: (id: string) => void;
  exportActionsRef: MutableRefObject<GridExportActions | null>;
  /** Page-level toolbar element that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null;
  transportLabel?: (mode: string) => string;
  fields?: ForeignTradeScreenField[];
  footer?: ReactNode;
};

const tr = (turkish: string, english: string) =>
  localizedText(turkish, english);
const locale = () => localizedText("tr-TR", "en-US");
const noop = () => {};

const WIDTHS: Record<string, number> = {
  reference: 190,
  direction: 90,
  linkedOrder: 220,
  countries: 170,
  dates: 120,
  status: 120,
  transportMode: 120,
};

/** Case list (list type): single click selects, double click / Enter opens; the panel and İşlemler follow the row. */
export function ForeignTradeGrid({
  items,
  caseCount,
  loading,
  selectedId,
  orderMap,
  statusLabel,
  directionLabel,
  onSelect,
  onOpen,
  exportActionsRef,
  toolbarContainer,
  transportLabel = (mode) => mode,
  fields = defaultForeignTradeFields,
  footer,
}: Props) {
  // Tenant-relabelled columns keep the tenant's text; untouched standard labels follow the UI locale.
  const fieldLabel = (field: ForeignTradeScreenField) => {
    const standard = defaultForeignTradeFields.find((item) => item.key === field.key);
    return standard &&
      (standard.label === field.label || legacyStandardLabels[field.key] === field.label)
      ? tr(standard.label, standard.enLabel)
      : field.label;
  };
  // Stage and cancel actions live in İşlemler and the detail panel, so "actions" gets no column here.
  const visibleFields = fields
    .filter((field) => field.key !== "actions" && field.visible)
    .sort((a, b) => a.position - b.position)
    .map((field) => ({ ...field, label: fieldLabel(field) }));
  const renderCell = (key: string, item: TradeCase): ReactNode => {
    const order = orderMap.get(item.purchaseOrderId || item.salesOrderId || "");
    switch (key) {
      case "reference":
        return (
          <>
            <span className="nx-code">{item.referenceCode}</span>{" "}
            <span className="foreign-trade-cell-muted">· {directionLabel(item.direction)}</span>
          </>
        );
      case "direction":
        return directionLabel(item.direction);
      case "linkedOrder":
        return order ? (
          <>
            <span className="nx-code">{order.code}</span>{" "}
            <span className="foreign-trade-cell-muted">· {order.counterpartyName}</span>
          </>
        ) : (
          "—"
        );
      case "countries":
        return (
          <>
            {item.originCountryCode} → {item.destinationCountryCode}{" "}
            <span className="foreign-trade-cell-muted">
              · {item.incotermsCode || "—"} ·{" "}
              {item.transportMode ? transportLabel(item.transportMode) : "—"}
            </span>
          </>
        );
      case "dates": {
        const ship = item.actualShipDate || item.plannedShipDate;
        const arrival = item.actualArrivalDate || item.plannedArrivalDate;
        if (!ship && !arrival) return "—";
        const title = [
          `${tr("Planlanan sevk", "Planned shipment")}: ${fullDate(item.plannedShipDate, locale())}`,
          `${tr("Gerçek sevk", "Actual shipment")}: ${fullDate(item.actualShipDate, locale())}`,
          `${tr("Planlanan varış", "Planned arrival")}: ${fullDate(item.plannedArrivalDate, locale())}`,
          `${tr("Gerçek varış", "Actual arrival")}: ${fullDate(item.actualArrivalDate, locale())}`,
        ].join("\n");
        return (
          <span className="foreign-trade-dates" title={title}>
            {shortDate(ship, locale())} → {shortDate(arrival, locale())}
          </span>
        );
      }
      case "status":
        return (
          <StatusTag tone={tradeStatusTone(item.status)}>{statusLabel(item.status)}</StatusTag>
        );
      case "transportMode":
        return transportLabel(item.transportMode);
      default:
        return null;
    }
  };
  return (
    <SalesDocumentGrid
      gridId="foreign-trade-files-v2"
      ariaLabel={tr("Dış ticaret dosyası kayıtları", "Foreign trade case records")}
      hideExport
      exportActionsRef={exportActionsRef}
      fields={visibleFields}
      items={items}
      loading={loading && items.length === 0}
      loadingMessage={tr("Dış ticaret kayıtları yükleniyor", "Loading foreign trade cases")}
      emptyMessage={
        caseCount
          ? tr("Eşleşen dosya bulunamadı", "No matching cases found")
          : tr("Henüz dış ticaret dosyası yok", "No foreign trade cases yet")
      }
      search=""
      searchEmptyMessage=""
      toolbarContainer={toolbarContainer}
      renderCell={(field, item) => renderCell(field.key, item)}
      selection={{
        currentId: selectedId,
        onCurrentChange: onSelect,
        onTickedChange: noop,
        bulkActions: [
          {
            id: "export-selected",
            label: tr("Excel (seçilenler)", "Excel (selected)"),
            run: () => void exportActionsRef.current?.exportExcel(),
          },
        ],
        onOpen,
      }}
      footer={footer}
      columnWidths={WIDTHS}
    />
  );
}
