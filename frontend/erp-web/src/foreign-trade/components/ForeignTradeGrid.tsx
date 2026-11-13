import AdvancedDataGrid from "../../AdvancedDataGrid";
import { ArrowRight, Globe2, RefreshCw } from "lucide-react";
import { localizedText } from "../../locale";
import type {
  Direction,
  TradeCapabilities,
  TradeCase,
  TradeOrder,
  TradeStatus,
} from "../types";

type Props = {
  items: TradeCase[];
  caseCount: number;
  loading: boolean;
  selectedId: string | null;
  orderMap: Map<string, TradeOrder>;
  capabilities: TradeCapabilities;
  statusLabel: (status: TradeStatus) => string;
  directionLabel: (direction: Direction) => string;
  onSelect: (item: TradeCase) => void;
  /** Page-level toolbar element that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null;
};

const tr = (turkish: string, english: string) =>
  localizedText(turkish, english);

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
}: Props) {
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
        enableRowSelection={false}
        hideSearch
        toolbarContainer={toolbarContainer}
      >
        <thead>
          <tr>
            <th>{tr("Referans", "Reference")}</th>
            <th>{tr("Yön", "Direction")}</th>
            <th>{tr("Bağlı sipariş", "Linked order")}</th>
            <th>{tr("Ülkeler", "Countries")}</th>
            <th>{tr("Durum", "Status")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const order = orderMap.get(
              item.purchaseOrderId || item.salesOrderId || "",
            );
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
                <td>
                  <b>{item.referenceCode}</b>
                  <small>
                    {item.customsReference ||
                      item.carrierReference ||
                      tr("Referans bekleniyor", "Awaiting reference")}
                  </small>
                </td>
                <td>
                  <span
                    className={`trade-direction ${item.direction.toLowerCase()}`}
                  >
                    {directionLabel(item.direction)}
                  </span>
                </td>
                <td>
                  {order ? (
                    <>
                      <b>{order.code}</b>
                      <small>{order.counterpartyName}</small>
                    </>
                  ) : (
                    <span>{tr("Sipariş", "Order")}</span>
                  )}
                </td>
                <td>
                  {item.originCountryCode} <ArrowRight size={13} />{" "}
                  {item.destinationCountryCode}
                </td>
                <td>
                  <span className={`trade-status ${item.status.toLowerCase()}`}>
                    {statusLabel(item.status)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
