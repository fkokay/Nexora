import type { ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { ScreenColumnPin } from "../../erp-types";
import { ArrowRight, Globe2, RefreshCw } from "lucide-react";
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
  { key: "reference", label: "Referans", enLabel: "Reference", visible: true, position: 0 },
  { key: "direction", label: "Yön", enLabel: "Direction", visible: true, position: 1 },
  { key: "linkedOrder", label: "Bağlı sipariş", enLabel: "Linked order", visible: true, position: 2 },
  { key: "countries", label: "Ülkeler", enLabel: "Countries", visible: true, position: 3 },
  { key: "status", label: "Durum", enLabel: "Status", visible: true, position: 4 },
  { key: "transportMode", label: "Taşıma şekli", enLabel: "Transport mode", visible: false, position: 5 },
  { key: "actions", label: "İşlem", enLabel: "Action", visible: true, position: 6, fixed: true },
];

type Props = {
  items: TradeCase[];
  caseCount: number;
  loading: boolean;
  selectedId: string | null;
  busyId: string;
  orderMap: Map<string, TradeOrder>;
  capabilities: TradeCapabilities;
  statusLabel: (status: TradeStatus) => string;
  directionLabel: (direction: Direction) => string;
  onSelect: (item: TradeCase) => void;
  onTransition: (item: TradeCase, status: TradeStatus) => void;
  nextStatus: Partial<Record<TradeStatus, TradeStatus>>;
  transportLabel?: (mode: string) => string;
  fields?: ForeignTradeScreenField[];
};

const tr = (turkish: string, english: string) =>
  localizedText(turkish, english);

export function ForeignTradeGrid({
  items,
  caseCount,
  loading,
  selectedId,
  busyId,
  orderMap,
  capabilities,
  statusLabel,
  directionLabel,
  onSelect,
  onTransition,
  nextStatus,
  transportLabel = (mode) => mode,
  fields = defaultForeignTradeFields,
}: Props) {
  const visibleFields = fields
    .filter((field) => field.key === "actions" || field.visible)
    .sort((a, b) =>
      a.key === "actions"
        ? 1
        : b.key === "actions"
          ? -1
          : a.position - b.position,
    );
  // Tenant-relabelled columns keep the tenant's text; untouched standard labels follow the UI locale.
  const fieldLabel = (field: ForeignTradeScreenField) => {
    const standard = defaultForeignTradeFields.find(
      (item) => item.key === field.key,
    );
    return standard && standard.label === field.label
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
                "Arama metnini veya yön filtresini değiştirerek tekrar deneyin.",
                "Change the search text or direction filter and try again.",
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
        gridId="foreign-trade-files"
        {...screenViewGridDefaults(visibleFields)}
        enableRowSelection={false}
        hideSearch
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
            const next = nextStatus[item.status];
            const renderCell = (key: string): ReactNode => {
              switch (key) {
                case "reference":
                  return (
                    <>
                      <b>{item.referenceCode}</b>
                      <small>
                        {item.customsReference ||
                          item.carrierReference ||
                          tr("Referans bekleniyor", "Awaiting reference")}
                      </small>
                    </>
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
                    <span>{tr("Sipariş", "Order")}</span>
                  );
                case "countries":
                  return (
                    <>
                      {item.originCountryCode} <ArrowRight size={13} />{" "}
                      {item.destinationCountryCode}
                    </>
                  );
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
                case "actions":
                  return (
                    <>
                      {capabilities.canAdvance && next && (
                        <button
                          className="secondary small-button"
                          disabled={busyId === item.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            onTransition(item, next);
                          }}
                        >
                          {busyId === item.id ? "…" : `${statusLabel(next)} →`}
                        </button>
                      )}
                      {capabilities.canAdvance &&
                        ["Draft", "Booked"].includes(item.status) && (
                          <button
                            className="row-action danger-action"
                            disabled={busyId === item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              onTransition(item, "Cancelled");
                            }}
                          >
                            {tr("İptal et", "Cancel")}
                          </button>
                        )}
                    </>
                  );
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
