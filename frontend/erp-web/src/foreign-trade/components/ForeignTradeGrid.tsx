import type { ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { ScreenColumnPin } from "../../erp-types";
import { Globe2, RefreshCw } from "lucide-react";
import { localizedText } from "../../locale";
import type {
  Direction,
  TradeCapabilities,
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
  selectedId: string | null;
  orderMap: Map<string, TradeOrder>;
  capabilities: TradeCapabilities;
  statusLabel: (status: TradeStatus) => string;
  directionLabel: (direction: Direction) => string;
  /** Called with the clicked case; the page deselects when it is already selected. */
  onSelect: (item: TradeCase) => void;
  /** Page-level toolbar element that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null;
  transportLabel?: (mode: string) => string;
  fields?: ForeignTradeScreenField[];
};

const tr = (turkish: string, english: string) =>
  localizedText(turkish, english);
const locale = () => localizedText("tr-TR", "en-US");

export function ForeignTradeGrid({
  items,
  caseCount,
  loading,
  selectedId,
  orderMap,
  capabilities,
  statusLabel,
  directionLabel,
  onSelect,
  toolbarContainer,
  transportLabel = (mode) => mode,
  fields = defaultForeignTradeFields,
}: Props) {
  // Stage and cancel actions live in the detail panel, so "actions" gets no column here.
  const visibleFields = fields
    .filter((field) => field.key !== "actions" && field.visible)
    .sort((a, b) => a.position - b.position);
  // Tenant-relabelled columns keep the tenant's text; untouched standard labels follow the UI locale.
  const fieldLabel = (field: ForeignTradeScreenField) => {
    const standard = defaultForeignTradeFields.find(
      (item) => item.key === field.key,
    );
    return standard && standard.label === field.label
      ? tr(standard.label, standard.enLabel)
      : standard && legacyStandardLabels[field.key] === field.label
        ? tr(standard.label, standard.enLabel)
        : field.label;
  };
  if (loading)
    return (
      <div className="foreign-trade-empty-state is-loading">
        <span className="foreign-trade-empty-icon">
          <RefreshCw size={19} />
        </span>
        <b>
          {tr(
            "Dış ticaret kayıtları yükleniyor",
            "Loading foreign trade cases",
          )}
        </b>
        <span>
          {tr(
            "Güncel sipariş ve sevkiyat bilgileri alınıyor.",
            "Loading current order and shipment information.",
          )}
        </span>
      </div>
    );
  if (items.length === 0)
    return (
      <div className="foreign-trade-empty-state" role="status">
        <span className="foreign-trade-empty-icon">
          <Globe2 size={21} />
        </span>
        <b>
          {caseCount
            ? tr("Eşleşen dosya bulunamadı", "No matching cases found")
            : tr("Henüz dış ticaret dosyası yok", "No foreign trade cases yet")}
        </b>
        <span>
          {caseCount
            ? tr(
                "Arama metnini, yön veya aşama filtresini değiştirerek tekrar deneyin.",
                "Change the search text, direction or stage filter and try again.",
              )
            : tr(
                "İthalat veya ihracat siparişine bağlı yeni dosya oluşturarak sevkiyat sürecini izlemeye başlayın.",
                "Create a case linked to an import or export order to start tracking its shipment.",
              )}
        </span>
        {!caseCount && capabilities.canCreate && (
          <small>
            {tr(
              "Dosya türünü üstteki İthalat dosyası veya İhracat dosyası düğmesinden seçebilirsiniz.",
              "Select the case type with the Import case or Export case button above.",
            )}
          </small>
        )}
      </div>
    );
  return (
    <div className="table-wrap">
      <AdvancedDataGrid
        gridId="foreign-trade-files-v2"
        {...screenViewGridDefaults(visibleFields)}
        enableRowSelection={false}
        hideSearch
        toolbarContainer={toolbarContainer}
      >
        <thead>
          <tr>
            {visibleFields.map((field) => (
              <th key={field.key}>{fieldLabel(field)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const order = orderMap.get(
              item.purchaseOrderId || item.salesOrderId || "",
            );
            const renderCell = (key: string): ReactNode => {
              switch (key) {
                case "reference":
                  return (
                    <span className="foreign-trade-file-cell">
                      <b>{item.referenceCode}</b>
                      <span
                        className={`trade-direction ${item.direction.toLowerCase()}`}
                      >
                        {directionLabel(item.direction)}
                      </span>
                    </span>
                  );
                case "direction":
                  return (
                    <span
                      className={`trade-direction ${item.direction.toLowerCase()}`}
                    >
                      {directionLabel(item.direction)}
                    </span>
                  );
                case "linkedOrder":
                  return order ? (
                    <>
                      <b>{order.code}</b>
                      <small>{order.counterpartyName}</small>
                    </>
                  ) : (
                    <span className="list-v2-unset">—</span>
                  );
                case "countries":
                  return (
                    <>
                      <b className="foreign-trade-route">
                        {item.originCountryCode} → {item.destinationCountryCode}
                      </b>
                      <small>
                        {item.incotermsCode || "—"} ·{" "}
                        {item.transportMode
                          ? transportLabel(item.transportMode)
                          : "—"}
                      </small>
                    </>
                  );
                case "dates": {
                  const ship = item.actualShipDate || item.plannedShipDate;
                  const arrival =
                    item.actualArrivalDate || item.plannedArrivalDate;
                  if (!ship && !arrival)
                    return <span className="list-v2-unset">—</span>;
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
                    <span
                      className={`trade-status ${item.status.toLowerCase()}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  );
                case "transportMode":
                  return transportLabel(item.transportMode);
                default:
                  return null;
              }
            };
            return (
              <tr
                key={item.id}
                tabIndex={0}
                aria-selected={selectedId === item.id}
                onClick={() => onSelect(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(item);
                  }
                }}
              >
                {visibleFields.map((field) => (
                  <td key={field.key}>{renderCell(field.key)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
